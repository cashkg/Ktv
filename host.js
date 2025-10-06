/* ========= KTV Host Link ========= */
const IS_HOST = true;
const ROOM_ID = window.ROOM_ID || "ktv";
const APP_VERSION = window.APP_VERSION || "0.1";

/* 依你現有程式替換/對接這些函式 */
function getQueue()        { return window.KTV_QUEUE || []; }
function getNowPlaying()   { return window.KTV_NOW   || null; }
function getCurrentTime()  { try { return (window.player?.getCurrentTime?.() ?? 0) | 0; } catch { return 0; } }
function getSettings()     { return window.KTV_SETTINGS || { theme: document.documentElement.dataset.theme || "light" }; }
function enqueue(item)     { (window.KTV_QUEUE ||= []).push(item); renderQueue?.(); }
function applyControl(cmd) {
  if (cmd?.type === "seek" && Number.isFinite(cmd.seconds)) { try { window.player?.seekTo(cmd.seconds, true); } catch {} }
  if (cmd?.type === "next")  { nextSong?.(); }
  if (cmd?.type === "pause") { try { window.player?.pauseVideo?.(); } catch {} }
  if (cmd?.type === "play")  { try { window.player?.playVideo?.(); }  catch {} }
}
function setQueue(q) {}
function setNowPlaying(n){}
function seekTo(sec){}
function applySettings(s){}
function renderQueue(){}

/* ========= 通訊核心 ========= */
const PEER_OPTS = {
  debug: 1,
  config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
};

let peer, conns = new Map();
let hbTimer, reconnTimer, reconnDelay = 500;

function hostPeerId(room){ return `host-${room}`; }
function nowTs(){ return Date.now(); }

function initPeer() {
  peer = new Peer(hostPeerId(ROOM_ID), PEER_OPTS);

  peer.on("open", id => console.log("[KTV] peer open", id));
  peer.on("connection", c => setupConn(c));
  peer.on("disconnected", () => { stopHeartbeatIfIdle(); tryReconnect(); });
  peer.on("error", err => { console.log("[KTV] peer error", err); tryReconnect(); });
}

function tryReconnect(){
  if (reconnTimer) return;
  reconnTimer = setTimeout(() => {
    reconnTimer = null;
    if (peer?.disconnected) peer.reconnect();
    reconnDelay = Math.min(reconnDelay * 2, 10000);
  }, reconnDelay);
}

function setupConn(c){
  const state = { missed: 0, pending: new Map() };
  conns.set(c, state);

  c.on("open", () => {
    console.log("[KTV] conn open", c.peer);
    state.missed = 0;
    reconnDelay = 500;
    sendTo(c, { type:"snapshot", payload: buildSnapshot() }, state, { ack:false });
    startHeartbeat();
  });

  c.on("data", msg => onData(c, state, msg));
  c.on("close", () => { conns.delete(c); stopHeartbeatIfIdle(); });
  c.on("error", () => { conns.delete(c); stopHeartbeatIfIdle(); });
}

function startHeartbeat(){
  if (hbTimer) return;
  hbTimer = setInterval(() => {
    for (const [c, s] of conns) {
      if (!c.open) continue;
      s.missed++;
      if (s.missed > 3) { try { c.close(); } catch{} conns.delete(c); continue; }
      sendTo(c, { type:"ping", ts: nowTs() }, s, { ack:false });
    }
    if (conns.size === 0) stopHeartbeatIfIdle();
  }, 2000);
}
function stopHeartbeatIfIdle(){ if (conns.size === 0) { clearInterval(hbTimer); hbTimer = null; } }

function sendTo(c, payload, state, opts={}){
  if (!c?.open) return;
  const msgId = `${nowTs()}-${Math.random().toString(16).slice(2)}`;
  const packet = { ...payload, msgId, ts: nowTs() };
  try { c.send(packet); } catch {}
  if (opts.ack === false) return;
  // 一次重送
  const t = setTimeout(() => {
    if (!state?.pending?.has(msgId)) return;
    try { c.send(packet); } catch {}
    state.pending.delete(msgId);
  }, 1500);
  state?.pending?.set(msgId, t);
}

function broadcast(type, payload){
  for (const [c, s] of conns) sendTo(c, { type, payload }, s);
}

function onData(c, state, msg){
  if (!msg) return;
  if (msg.type === "ping") { sendTo(c, { type:"pong", ts: msg.ts }, state, { ack:false }); return; }
  if (msg.type === "pong") { state.missed = 0; return; }
  if (msg.ack) { const t = state.pending.get(msg.ack); if (t){ clearTimeout(t); state.pending.delete(msg.ack);} return; }

  // 對業務訊息回 ACK
  try { c.send({ ack: msg.msgId, ts: nowTs() }); } catch {}

  // Client → Host
  if (msg.type === "hello")   { sendTo(c, { type:"snapshot", payload: buildSnapshot() }, state, { ack:false }); return; }
  if (msg.type === "enqueue") { enqueue(msg.payload); broadcastState(); return; }
  if (msg.type === "control") { applyControl(msg.payload); broadcastState(); return; }
}

function buildSnapshot(){
  return {
    version: APP_VERSION,
    queue: getQueue(),
    now: getNowPlaying(),
    progress: getCurrentTime(),
    settings: getSettings()
  };
}

function broadcastState(){
  const s = { queue: getQueue(), now: getNowPlaying(), progress: getCurrentTime() };
  broadcast("state", s);
}

window.KTV_HOST_API = {
  broadcastState,
  notifySnapshot(){ broadcast("snapshot", buildSnapshot()); }
};

initPeer();