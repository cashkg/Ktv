/* ========= KTV Controller ========= */
const IS_HOST = false;
const ROOM_ID = window.ROOM_ID || "ktv";
const APP_VERSION = window.APP_VERSION || "0.2";

/* UI 對接 */
function setQueue(q){ window.KTV_QUEUE = Array.isArray(q)? q:[]; try{ renderQueue?.(); }catch{} }
function setNowPlaying(n){ window.KTV_NOW = n||null; try{ renderNow?.(n); }catch{} }
function getCurrentTime(){ try{ return (player?.getCurrentTime?.() ?? 0)|0; } catch { return 0; } }
function seekTo(sec){ try{ if (Math.abs(getCurrentTime()-sec)>2) player?.seekTo?.(sec,true);}catch{} }
function applySettings(s){ if(!s) return; try{ document.documentElement.dataset.theme = s.theme||"light"; }catch{} }
function setHistory(h){ window.KTV_HISTORY = Array.isArray(h)? h:[]; try{ renderHistory?.(h); }catch{} }
function setDuration(d){ window.KTV_DURATION = d|0; }

/* 提供 UI 呼叫 */
window.ktvEnqueue = (item)=> send({ type:"enqueue", payload:item });
window.ktvInsertNext = (item,pin)=> send({ type:"insertNext", pin, payload:item });
window.ktvRemoveAt  = (index,pin)=> send({ type:"removeAt", pin, payload:{ index } });
window.ktvNext      = (pin)=> send({ type:"next", pin });
window.ktvSeek      = (seconds,pin)=> send({ type:"seek", pin, payload:(seconds|0) });
window.ktvSfx       = (name)=> send({ type:"sfx", payload:name });

/* ========= Peer ========= */
const PEER_OPTS = { debug:1, config:{ iceServers:[{ urls:"stun:stun.l.google.com:19302" }] } };
let peer, conn, hbTimer, missed=0, reconnTimer, reconnDelay=500;
const pending=new Map();
function hostPeerId(r){ return `host-${r}`; }
function clientPeerId(r){ return `client-${r}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nowTs(){ return Date.now(); }

function initPeer(){
  peer = new Peer(clientPeerId(ROOM_ID), PEER_OPTS);
  peer.on("open", ()=> connectToHost());
  peer.on("disconnected", tryReconnect);
  peer.on("error", e=>{ console.log("[KTV] peer error", e); tryReconnect(); });
}
function connectToHost(){
  if (conn?.open) return;
  conn = peer.connect(hostPeerId(ROOM_ID), { reliable:true });
  setupConn(conn);
}
function setupConn(c){
  c.on("open", ()=>{ missed=0; clearTimeout(reconnTimer); reconnDelay=500; startHeartbeat(); send({ type:"hello" }, { ack:false }); });
  c.on("data", onData);
  c.on("close", ()=>{ stopHeartbeat(); tryReconnect(); });
  c.on("error", ()=>{ stopHeartbeat(); tryReconnect(); });
}
function startHeartbeat(){
  stopHeartbeat();
  hbTimer=setInterval(()=>{
    if (!conn?.open) return;
    missed++; if (missed>3){ try{conn.close();}catch{} tryReconnect(); return; }
    send({ type:"ping", ts:nowTs() }, { ack:false });
  },2000);
}
function stopHeartbeat(){ clearInterval(hbTimer); hbTimer=null; missed=0; }
function tryReconnect(){
  if (reconnTimer) return;
  reconnTimer=setTimeout(()=>{
    reconnTimer=null;
    if (peer?.disconnected) peer.reconnect();
    connectToHost();
    reconnDelay=Math.min(reconnDelay*2, 10000);
  },reconnDelay);
}

function onData(msg){
  if (!msg) return;
  if (msg.type==="ping"){ send({type:"pong", ts:msg.ts}, {ack:false}); return; }
  if (msg.type==="pong"){ missed=0; return; }
  if (msg.ack){ const t=pending.get(msg.ack); if(t){clearTimeout(t); pending.delete(msg.ack);} return; }

  if (msg.type==="snapshot"){ applySnapshot(msg.payload); return; }
  if (msg.type==="state"){    applyState(msg.payload);   return; }
}
function applySnapshot(s){
  if (!s) return;
  applySettings(s.settings);
  setQueue(s.queue); setNowPlaying(s.current); setHistory(s.history); setDuration(s.duration);
  if (Number.isFinite(s.progress)) seekTo(s.progress);
  window.KTV_NEED_PIN = !!s.needPIN;
}
function applyState(s){
  if (!s) return;
  setQueue(s.queue); setNowPlaying(s.current); setHistory(s.history); setDuration(s.duration);
  if (Number.isFinite(s.progress)) seekTo(s.progress);
}

function send(payload, opts={}){
  if (!conn?.open) return;
  const msgId = `${nowTs()}-${Math.random().toString(16).slice(2)}`;
  const packet = { ...payload, msgId, ts: nowTs() };
  try { conn.send(packet); } catch{}
  if (opts.ack === false) return;
  const t=setTimeout(()=> pending.delete(msgId),1500);
  pending.set(msgId,t);
}

initPeer();
// ===== Presence：送暱稱與心跳（需在頁面有 getNick() 或自行替換為固定字串）=====
function getNickSafe(){
  try { return (window.getNick && window.getNick()) || localStorage.getItem('ktv_nick') || "匿名"; }
  catch { return "匿名"; }
}
function sendHello(){ try{ send({ type:"hello", nick:getNickSafe() }, { ack:false }); }catch{} }
function sendPresence(){ try{ send({ type:"presence", nick:getNickSafe() }, { ack:false }); }catch{} }
window.addEventListener('load', ()=>{ sendHello(); setInterval(sendPresence, 5000); });
window.addEventListener('beforeunload', ()=>{ try{ send({ type:"bye" }, { ack:false }); }catch{} });
