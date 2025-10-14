/* ========= KTV Host ========= */
const IS_HOST = true;
const ROOM_ID = window.ROOM_ID || "ktv";
const APP_VERSION = window.APP_VERSION || "0.2";
const PIN_CODE = window.PIN_CODE || "1234";         // 允許 UI 改
const BGM_LIST = window.BGM_LIST || [               // 可改自己的清單
  { id:"5qap5aO4i9A", title:"LoFi BGM 1" },
  { id:"DWcJFNfaw9c", title:"LoFi BGM 2" }
];

/* 狀態與工具 */
window.KTV_QUEUE   ||= [];
window.KTV_HISTORY ||= [];
window.KTV_NOW     ||= null;
function getQueue()       { return window.KTV_QUEUE; }
function getHistory()     { return window.KTV_HISTORY; }
function getNowPlaying()  { return window.KTV_NOW; }
function getDuration()    { try { return (player?.getDuration?.() ?? 0)|0; } catch { return 0; } }
function getCurrentTime() { try { return (player?.getCurrentTime?.() ?? 0)|0; } catch { return 0; } }
function getSettings()    { return window.KTV_SETTINGS || { theme: document.documentElement.dataset.theme || "light" }; }
function renderQueue()    { try { window.renderQueue?.(); } catch{} }
function renderNow()      { try { window.renderNow?.(window.KTV_NOW); } catch{} }
function seekHost(sec){ try{ player?.seekTo?.(sec, true);}catch{} }
function play(){ try{ player?.playVideo?.(); }catch{} }
function pause(){ try{ player?.pauseVideo?.(); }catch{} }
function nextSong(){
  if (getQueue().length === 0){
    // 沒歌，播 BGM
    const bgm = BGM_LIST[Math.floor(Math.random()*BGM_LIST.length)];
    window.KTV_NOW = { id:bgm.id, title:bgm.title, isBGM:true };
    try { player?.loadVideoById?.(bgm.id); player?.playVideo?.(); } catch{}
    renderNow(); broadcastState();
    return;
  }
  const n = getQueue().shift();
  window.KTV_NOW = { ...n, isBGM:false };
  try { player?.loadVideoById?.(n.id); player?.playVideo?.(); } catch{}
  renderQueue(); renderNow(); broadcastState();
}
function enqueue(item){ getQueue().push(item); renderQueue(); }
function insertNext(item){ getQueue().splice(0, 0, item); renderQueue(); }
function removeAt(idx){ if (idx>=0 && idx<getQueue().length){ getQueue().splice(idx,1); renderQueue(); } }
function finishCurrent(){
  if (window.KTV_NOW && !window.KTV_NOW.isBGM) getHistory().push(window.KTV_NOW);
  window.KTV_NOW = null;
}
function checkPIN(pin){ return String(pin||"") === String(PIN_CODE); }

/* SFX：使用第二個 YouTube 播放器（host.html 放一個 div#sfx-player） */
const SFX_MAP = { clap:"2ZIpFytCSVc", cheer:"iofYDs2s9Ww", boo:"IZ6T0Xy5lK8" };
function playSfx(name){
  const vid = SFX_MAP[name]; if (!vid) return;
  try {
    if (window.sfxPlayer?.loadVideoById) { sfxPlayer.loadVideoById(vid); sfxPlayer.playVideo(); }
  } catch {}
}

/* ========= Peer 通訊 ========= */
const PEER_OPTS = { debug:1, config:{ iceServers:[{ urls:"stun:stun.l.google.com:19302" }] } };
let peer, conns = new Map(); let hbTimer, reconnTimer, reconnDelay = 500;
function hostPeerId(r){ return `host-${r}`; }
function nowTs(){ return Date.now(); }

function initPeer(){
  peer = new Peer(hostPeerId(ROOM_ID), PEER_OPTS);
  peer.on("open", id => console.log("[KTV] host open", id));
  peer.on("connection", c => setupConn(c));
  peer.on("disconnected", () => { stopHeartbeatIfIdle(); tryReconnect(); });
  peer.on("error", e => { console.log("[KTV] peer error", e); tryReconnect(); });
}

function tryReconnect(){
  if (reconnTimer) return;
  reconnTimer = setTimeout(() => {
    reconnTimer = null;
    if (peer?.disconnected) peer.reconnect();
    reconnDelay = Math.min(reconnDelay*2, 10000);
  }, reconnDelay);
}

function setupConn(c){
  const state = { missed:0, pending:new Map() };
  conns.set(c, state);

  c.on("open", () => {
    state.missed = 0; reconnDelay = 500;
    sendTo(c, { type:"snapshot", payload: buildSnapshot() }, state, { ack:false });
    startHeartbeat();
  });

  c.on("data", m => onData(c, state, m));
  c.on("close", () => { conns.delete(c); stopHeartbeatIfIdle(); });
  c.on("error", () => { conns.delete(c); stopHeartbeatIfIdle(); });
}

function startHeartbeat(){
  if (hbTimer) return;
  hbTimer = setInterval(() => {
    for (const [c, s] of conns){
      if (!c.open) continue;
      s.missed++; if (s.missed>3){ try{ c.close(); }catch{} conns.delete(c); continue; }
      sendTo(c, { type:"ping", ts:nowTs() }, s, { ack:false });
      // 定期同步（輕量）
      sendTo(c, { type:"state", payload: buildState() }, s, { ack:false });
    }
    if (conns.size===0) stopHeartbeatIfIdle();
  }, 2000);
}
function stopHeartbeatIfIdle(){ if (conns.size===0){ clearInterval(hbTimer); hbTimer=null; } }

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
  if (msg.type==="ping"){ sendTo(c, {type:"pong", ts:msg.ts}, state, {ack:false}); return; }
  if (msg.type==="pong"){ state.missed=0; return; }
  if (msg.ack){ const t=state.pending.get(msg.ack); if(t){clearTimeout(t); state.pending.delete(msg.ack);} return; }
  // 回 ACK
  try { c.send({ ack: msg.msgId, ts: nowTs() }); } catch {}

  // 業務：權限類需 PIN
  if (msg.type==="hello"){ sendTo(c, {type:"snapshot", payload:buildSnapshot()}, state, {ack:false}); return; }
  if (msg.type==="enqueue"){ enqueue(msg.payload); broadcastState(); return; }
  if (msg.type==="insertNext"){ if (checkPIN(msg.pin)) { insertNext(msg.payload); broadcastState(); } return; }
  if (msg.type==="removeAt"){  if (checkPIN(msg.pin)) { removeAt(msg.payload?.index|0); broadcastState(); } return; }
  if (msg.type==="next"){      if (checkPIN(msg.pin)) { finishCurrent(); nextSong(); } return; }
  if (msg.type==="seek"){      if (checkPIN(msg.pin)) { const s=msg.payload|0; if (Number.isFinite(s)) seekHost(s); broadcastState(); } return; }
  if (msg.type==="sfx"){       playSfx(msg.payload); return; }
}

function buildState(){
  return {
    queue: getQueue(),
    current: getNowPlaying(),
    history: getHistory(),
    progress: getCurrentTime(),
    duration: getDuration(),
    needPIN: true
  };
}
function buildSnapshot(){
  return {
    version: APP_VERSION,
    settings: getSettings(),
    ...buildState()
  };
}
function broadcastState(){ broadcast("state", buildState()); }

/* 對外 API（Host UI 可用） */
window.KTV_HOST_API = {
  broadcastState,
  playNext(){ finishCurrent(); nextSong(); },
  onVideoEnd(){ finishCurrent(); nextSong(); } // 供 YT onStateChange=ENDED 呼叫
};

initPeer();
/* 你需在 host.html 初始化：
   - 主 player 建立完成後，監聽 ended 事件呼叫 KTV_HOST_API.onVideoEnd()
   - 另外建立 sfxPlayer: new YT.Player('sfx-player', { ... , events:{} })
*/
