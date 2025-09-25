// --- 全域狀態 ---
let peer = null;
let conn = null;
let hostId = "";
let myName = "匿名";
let connected = false;

// --- 工具 ---
function genGuestName(){ return "訪客" + Math.floor(1000 + Math.random()*9000); }
function formatTime(sec){
  sec=Math.floor(sec||0);
  const m=Math.floor(sec/60), s=sec%60;
  return m+":"+(s<10?"0"+s:s);
}

// --- 連線 ---
function connectHost(){
  if (connected) return;
  // 讀取表單
  const hostInputEl = document.getElementById("hostIdInput");
  const nameEl = document.getElementById("userName");
  hostId = (hostInputEl && hostInputEl.value) ? hostInputEl.value : "ktv-host";
  myName = (nameEl && nameEl.value) ? nameEl.value : genGuestName();

  // 若已有舊 peer，先銷毀避免重複連線
  if (peer && !peer.destroyed) try { peer.destroy(); } catch(e){ console.warn(e); }

  // ✅ 強制走 WSS，避免 Mixed Content
  peer = new Peer(null, {
    host: "0.peerjs.com",
    port: 443,
    path: "/",
    secure: true
  });

  peer.on("open", id=>{
    conn = peer.connect(hostId);
    conn.on("open", ()=>{
      connected = true;
      setStatus("✅ 已連線到 Host");
      conn.send({type:"register", name:myName});
    });
    conn.on("data", msg=>handleMsg(msg));
    conn.on("close", ()=>{
      connected = false;
      setStatus("❌ 與 Host 斷線");
      clearUI();
    });
    conn.on("error", err=>{
      connected = false;
      setStatus("❌ 連線錯誤");
      console.error("conn error:", err);
    });
  });

  // 自動重連
  peer.on("disconnected", ()=>{
    console.warn("PeerJS 斷線，嘗試重連...");
    peer.reconnect();
  });
  peer.on("error", err=>{
    setStatus("❌ PeerJS 錯誤");
    console.error("peer error:", err);
  });
}

// --- UI 狀態 ---
function setStatus(text){
  const el = document.getElementById("connStatus");
  if (el) el.innerText = text;
}

// --- 送出動作 ---
function sendSong(){
  if(!conn || !conn.open) return;
  const title = document.getElementById("songTitle").value;
  const videoId = document.getElementById("songVideoId").value;
  if(!title || !videoId) return;
  conn.send({type:"enqueue", payload:{title, videoId, by:myName}});
  document.getElementById("songTitle").value="";
  document.getElementById("songVideoId").value="";
}

function sendFeedback(){
  if(!conn || !conn.open) return;
  const emoji = document.getElementById("emojiInput").value || "😀";
  conn.send({type:"feedback", by:myName, emoji});
  document.getElementById("emojiInput").value="";
}

// --- 收訊處理 ---
function handleMsg(msg){
  if(!msg || !msg.type) return;
  switch(msg.type){
    case "sync":{
      const p = msg.payload || {};
      renderQueue(p.queue||[]);
      renderHistory(p.history||[]);
      renderWall(p.wall||[]);
      renderRanking(p.ranking||{});
      updateProgress(p.progress, p.duration);
      if(p.theme) document.body.dataset.theme = p.theme;
      if(p.pong && conn && conn.open) conn.send({type:"pong"});
      break;
    }
  }
}

// --- 渲染 ---
function renderQueue(queue){
  const el=document.getElementById("queue"); if(!el) return;
  el.innerHTML="";
  queue.forEach(q=>{
    el.innerHTML+=`<div class="listItem">${q.by? q.by+" 點播 ":""}${q.title}</div>`;
  });
}

function renderHistory(history){
  const el=document.getElementById("historyList"); if(!el) return;
  el.innerHTML="";
  history.slice().reverse().forEach(h=>{
    el.innerHTML+=`<div class="listItem">${h.by? h.by+" 點播 ":""}${h.title}</div>`;
  });
}

function renderWall(wall){
  const el=document.getElementById("wallList"); if(!el) return;
  el.innerHTML="";
  wall.forEach(m=>{
    el.innerHTML+=`<div class="listItem">${m.by}：${m.emoji}</div>`;
  });
}

function renderRanking(ranking){
  const el=document.getElementById("rankingList"); if(!el) return;
  const sorted = Object.entries(ranking).sort((a,b)=>b[1]-a[1]).slice(0,50);
  el.innerHTML="";
  sorted.forEach(([name,count],i)=>{
    el.innerHTML+=`<div class="listItem">${i+1}. ${name} ${count} 首</div>`;
  });
}

function updateProgress(cur,dur){
  const bar=document.getElementById("progressBar");
  const time=document.getElementById("timeInfo");
  if(bar) bar.value = dur? (cur/dur*100):0;
  if(time) time.innerText = formatTime(cur)+" / "+formatTime(dur);
}

function clearUI(){
  const q=document.getElementById("queue");
  const h=document.getElementById("historyList");
  const w=document.getElementById("wallList");
  const r=document.getElementById("rankingList");
  const bar=document.getElementById("progressBar");
  const time=document.getElementById("timeInfo");
  if(q) q.innerHTML="";
  if(h) h.innerHTML="";
  if(w) w.innerHTML="";
  if(r) r.innerHTML="";
  if(bar) bar.value=0;
  if(time) time.innerText="0:00 / 0:00";
}

// --- 事件與自動連線 ---
document.addEventListener("DOMContentLoaded", ()=>{
  // 名稱即時同步
  const nameEl = document.getElementById("userName");
  if(nameEl){
    nameEl.addEventListener("change", ()=>{
      myName = nameEl.value || genGuestName();
      if(conn && conn.open){
        conn.send({type:"rename", name:myName});
      }
    });
  }
  // 自動讀取 ?host=
  const params = new URLSearchParams(window.location.search);
  const hostParam = params.get("host");
  if(hostParam){
    const hostInputEl = document.getElementById("hostIdInput");
    if(hostInputEl) hostInputEl.value = hostParam;
    connectHost();
  }
});

// --- 讓 inline onclick 可呼叫 ---
window.connectHost   = connectHost;
window.sendSong      = sendSong;
window.sendFeedback  = sendFeedback;
