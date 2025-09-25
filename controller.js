// --- 全域狀態 ---
let peer = null;
let conn = null;
let hostId = "";
let myName = "匿名";
let connected = false;

// YouTube API
const YT_API_KEY = "AIzaSyBOdPgWJQOZ1fswTgJRxA2RB3Awf_GrdAE";
let nextPageToken = null;
let prevPageToken = null;
let lastQuery = "";

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
  const hostInputEl = document.getElementById("hostIdInput");
  const nameEl = document.getElementById("userName");
  hostId = (hostInputEl && hostInputEl.value) ? hostInputEl.value : "ktv-host";
  myName = (nameEl && nameEl.value) ? nameEl.value : genGuestName();

  if (peer && !peer.destroyed) try { peer.destroy(); } catch(e){ console.warn(e); }

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
  });

  peer.on("disconnected", ()=> peer.reconnect());
  peer.on("error", err=> console.error("peer error:", err));
}

// --- UI 狀態 ---
function setStatus(text){
  const el = document.getElementById("connStatus");
  if (el) el.innerText = text;
}

// --- 點歌 / 插播 ---
function sendSong(){
  if(!conn || !conn.open) return;
  const title = document.getElementById("songTitle").value;
  const videoId = document.getElementById("songVideoId").value;
  if(!title || !videoId) return;
  conn.send({type:"enqueue", payload:{title, videoId, by:myName}});
  document.getElementById("songTitle").value="";
  document.getElementById("songVideoId").value="";
}

function insertSong(title, videoId){
  if(!conn || !conn.open) return;
  conn.send({type:"insertNext", pin:"1234", payload:{title, videoId, by:myName}});
}

// --- 表情回饋 ---
function sendFeedback(){
  if(!conn || !conn.open) return;
  const emoji = document.getElementById("emojiInput").value || "😀";
  conn.send({type:"feedback", by:myName, emoji});
  document.getElementById("emojiInput").value="";
}

// --- YouTube 搜尋 ---
async function searchYouTube(query, pageToken=""){
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&type=video&q=${encodeURIComponent(query)}&key=${YT_API_KEY}${pageToken?`&pageToken=${pageToken}`:""}`;
  const res = await fetch(url);
  const data = await res.json();
  nextPageToken = data.nextPageToken || null;
  prevPageToken = data.prevPageToken || null;
  lastQuery = query;
  if(!data.items) return [];
  return data.items.map(i=>({
    title: i.snippet.title,
    videoId: i.id.videoId
  }));
}

async function searchSong(pageToken=""){
  const query = document.getElementById("searchQuery").value.trim() || lastQuery;
  if(!query) return;
  document.getElementById("searchResults").innerHTML = "搜尋中...";
  try{
    const results = await searchYouTube(query, pageToken);
    const el = document.getElementById("searchResults");
    el.innerHTML = "";
    results.forEach(r=>{
      const div = document.createElement("div");
      div.className="listItem";
      div.innerHTML = `${r.title} 
        <button class="btnSm">點播</button>
        <button class="btnSm">插播</button>`;
      const [btnEnq, btnIns] = div.querySelectorAll("button");
      btnEnq.onclick = ()=>{
        if(conn && conn.open){
          conn.send({type:"enqueue", payload:{title:r.title, videoId:r.videoId, by:myName}});
          setStatus("🎵 已點播：" + r.title);
        }
      };
      btnIns.onclick = ()=>{
        if(conn && conn.open){
          conn.send({type:"insertNext", pin:"1234", payload:{title:r.title, videoId:r.videoId, by:myName}});
          setStatus("🚨 已插播：" + r.title);
        }
      };
      el.appendChild(div);
    });
  }catch(e){
    console.error("YT 搜尋錯誤", e);
    document.getElementById("searchResults").innerText = "❌ 搜尋失敗";
  }
}

function nextPage(){ if(nextPageToken) searchSong(nextPageToken); }
function prevPage(){ if(prevPageToken) searchSong(prevPageToken); }

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

// --- 渲染 (同之前) ---
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
  ["queue","historyList","wallList","rankingList"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML="";
  });
  const bar=document.getElementById("progressBar");
  const time=document.getElementById("timeInfo");
  if(bar) bar.value=0;
  if(time) time.innerText="0:00 / 0:00";
}

// --- 名稱即時同步 & 自動讀取 ?host= ---
document.addEventListener("DOMContentLoaded", ()=>{
  const nameEl = document.getElementById("userName");
  if(nameEl){
    nameEl.addEventListener("change", ()=>{
      myName = nameEl.value || genGuestName();
      if(conn && conn.open){
        conn.send({type:"rename", name:myName});
      }
    });
  }
  const params = new URLSearchParams(window.location.search);
  const hostParam = params.get("host");
  if(hostParam){
    const hostInputEl = document.getElementById("hostIdInput");
    if(hostInputEl) hostInputEl.value = hostParam;
    connectHost();
  }
});

// --- 匯出到 window ---
window.connectHost   = connectHost;
window.sendSong      = sendSong;
window.sendFeedback  = sendFeedback;
window.searchSong    = searchSong;
window.nextPage      = nextPage;
window.prevPage      = prevPage;
