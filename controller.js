/* ========= KTV Controller Link ========= */
const IS_HOST = false;
const ROOM_ID = window.ROOM_ID || "ktv";
const APP_VERSION = window.APP_VERSION || "0.1";

/* 依你現有程式替換/對接這些函式 */
function setQueue(q)        { window.KTV_QUEUE = Array.isArray(q)? q : []; renderQueue?.(); }
function setNowPlaying(n)   { window.KTV_NOW = n || null; renderNow?.(n); }
function getCurrentTime()   { try { return (window.player?.getCurrentTime?.() ?? 0) | 0; } catch { return 0; } }
function seekTo(sec)        { try { if (Math.abs(getCurrentTime() - sec) > 2) window.player?.seekTo?.(sec, true); } catch {} }
function applySettings(s)   { if (!s) return; try { document.documentElement.dataset.theme = s.theme || "light"; } catch {} }
function renderQueue(){}    // 你的原本渲染
function renderNow(){}      // 你的原本渲染

/* 供 UI 事件呼叫：新增歌曲、控制播放 */
export function ktvEnqueue(item){ send({ type:"enqueue", payload:item }); }
export function ktvControl(cmd){  send({ type:"control", payload:cmd });  }

/* ========= 通訊核心（Client） ========= */
const PEER_OPTS = {
  debug: 1,
  config: { iceServers: [{ urls:"stun:stun.l.google.com:19302" }] }
};

let peer, conn, hbTimer, missed = 0, reconnTimer, reconnDelay = 500;
const pending = new Map();

function hostPeerId(room){ return `host-${room}`; }
function clientPeerId(room){ return `client-${room}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nowTs(){ return Date.now(); }

function initPeer(){
  peer = new Peer(clientPeerId(ROOM_ID), PEER_OPTS);

  peer.on("open", () => connectToHost());
  peer.on("disconnected", tryReconnect);
  peer.on("error", err => { console.log("[KTV] peer error", err); tryReconnect(); });
}

function connectToHost(){
  if (conn?.open) return;
  conn = peer.connect(hostPeerId(ROOM_ID), { reliable: true });
  setupConn(conn);
}

function setupConn(c){
  c.on("open", () => {
    console.log("[KTV] conn open");
    missed = 0;
    clearTimeout(reconnTimer);
    reconnDelay = 500;
    startHeartbeat();
    send({ type:"hello" }, { ack:false }); // 連上就索取快照
  });
  c.on("data", onData);
  c.on("close", () => { stopHeartbeat(); tryReconnect(); });
  c.on("error", () => { stopHeartbeat(); tryReconnect(); });
}

function startHeartbeat(){
  stopHeartbeat();
  hbTimer = setInterval(() => {
    if (!conn?.open) return;
    missed++;
    if (missed > 3) { try { conn.close(); } catch{} tryReconnect(); return; }
    send({ type:"ping", ts: nowTs() }, { ack:false });
  }, 2000);
}
function stopHeartbeat(){ clearInterval(hbTimer); hbTimer = null; missed = 0; }

function tryReconnect(){
  if (reconnTimer) return;
  reconnTimer = setTimeout(() => {
    reconnTimer = null;
    if (peer?.disconnected) peer.reconnect();
    connectToHost();
    reconnDelay = Math.min(reconnDelay * 2, 10000);
  }, reconnDelay);
}

function onData(msg){
  if (!msg) return;
  if (msg.type === "ping") { send({ type:"pong", ts: msg.ts }, { ack:false }); return; }
  if (msg.type === "pong") { missed = 0; return; }
  if (msg.ack) { const t = pending.get(msg.ack); if (t){ clearTimeout(t); pending.delete(msg.ack);} return; }

  // Host → Client
  if (msg.type === "snapshot") { applySnapshot(msg.payload); return; }
  if (msg.type === "state")    { applyState(msg.payload);   return; }
}

function applySnapshot(s){
  if (!s) return;
  setQueue(s.queue);
  setNowPlaying(s.now);
  applySettings(s.settings);
  if (Number.isFinite(s.progress)) seekTo(s.progress);
}

function applyState(s){
  if (!s) return;
  setQueue(s.queue);
  setNowPlaying(s.now);
  if (Number.isFinite(s.progress)) seekTo(s.progress); // 偏差>2秒時才會真正 seek
}

function send(payload, opts={}){
  if (!conn?.open) return;
  const msgId = `${nowTs()}-${Math.random().toString(16).slice(2)}`;
  const packet = { ...payload, msgId, ts: nowTs() };
  try { conn.send(packet); } catch{}
  if (opts.ack === false) return;
  const t = setTimeout(() => pending.delete(msgId), 1500);
  pending.set(msgId, t);
}

initPeer();