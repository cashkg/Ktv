let peer, conn;
let hostId = "";
let myName = "匿名";

// 連線到 Host
function connectHost(){
  hostId = document.getElementById("hostIdInput").value || "ktv-host";
  myName = document.getElementById("userName").value || genGuestName();

  peer = new Peer(null, { 
    host:"0.peerjs.com", port:443, path:"/", secure:true,
    config:{ iceServers:[{urls:"stun:stun.l.google.com:19302"}] }
  });

  peer.on("open", id=>{
    conn = peer.connect(hostId);
    conn.on("open", ()=>{
      document.getElementById("connStatus").innerText="✅ 已連線到 Host";
      conn.send({type:"register", name:myName});
    });
    conn.on("data", msg=>handleMsg(msg));
    conn.on("close", ()=>{ 
      document.getElementById("connStatus").innerText="❌ 與 Host 斷線"; 
      clearUI();
    });
  });

  // 自動重連
  peer.on("disconnected", ()=>{
    console.warn("與 Host 斷線，嘗試重連...");
    peer.reconnect();
  });
  peer.on("error", (err)=>{
    console.error("PeerJS 錯誤：", err);
  });
}

// 自動生成訪客名稱
function genGuestName(){
  return "訪客" + Math.floor(1000 + Math.random()*9000);
}

// 名稱即時同步
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("userName").addEventListener("change", ()=>{
    myName = document.getElementById("userName").value || genGuestName();
    if(conn && conn.open){
      conn.send({type:"rename", name:myName});
    }
  });
});

// 點歌
function sendSong(){
  if(!conn || !conn.open) return;
  const title = document.getElementById("songTitle").value;
  const videoId = document.getElementById("songVideoId").value;
  if(!title || !videoId) return;
  conn.send({type:"enqueue", payload:{title, videoId, by:myName}});
  document.getElementById("songTitle").value="";
  document.getElementById("songVideoId").value="";
}

// 發送表情
function sendFeedback(){
  if(!conn || !conn.open) return;
  const emoji = document.getElementById("emojiInput").value || "😀";
  conn.send({type:"feedback", by:myName, emoji});
  document.getElementById("emojiInput").value="";
}

function handleMsg(msg){
  switch(msg.type){
    case "sync":
      renderQueue(msg.payload.queue||[]);
      renderHistory(msg.payload.history||[]);
      renderWall(msg.payload.wall||[]);
      renderRanking(msg.payload.ranking||{});
      updateProgress(msg.payload.progress, msg.payload.duration);

      // 主題套用
      if(msg.payload.theme){
        document.body.dataset.theme = msg.payload.theme;
      }

      // 回 pong
      if(msg.payload.pong && conn && conn.open){
        conn.send({type:"pong"});
      }
      break;
  }
}

// 渲染播放佇列
function renderQueue(queue){
  const el=document.getElementById("queue"); el.innerHTML="";
  queue.forEach(q=>{
    el.innerHTML+=`<div class="listItem">${q.by? q.by+" 點播 ":""}${q.title}</div>`;
  });
}

// 渲染歷史紀錄
function renderHistory(history){
  const el=document.getElementById("historyList"); el.innerHTML="";
  history.slice().reverse().forEach(h=>{
    el.innerHTML+=`<div class="listItem">${h.by? h.by+" 點播 ":""}${h.title}</div>`;
  });
}

// 渲染訊息牆
function renderWall(wall){
  const el=document.getElementById("wallList"); el.innerHTML="";
  wall.forEach(m=>{
    el.innerHTML+=`<div class="listItem">${m.by}：${m.emoji}</div>`;
  });
}

// 渲染排行榜
function renderRanking(ranking){
  const sorted = Object.entries(ranking).sort((a,b)=>b[1]-a[1]).slice(0,50);
  const el=document.getElementById("rankingList"); el.innerHTML="";
  sorted.forEach(([name,count],i)=>{
    el.innerHTML+=`<div class="listItem">${i+1}. ${name} ${count} 首</div>`;
  });
}

// 更新進度條（僅顯示，不回控 Host）
function updateProgress(cur,dur){
  const bar=document.getElementById("progressBar");
  const time=document.getElementById("timeInfo");
  bar.value = dur? (cur/dur*100):0;
  time.innerText = formatTime(cur)+" / "+formatTime(dur);
}

// 清空 UI（斷線時呼叫）
function clearUI(){
  document.getElementById("queue").innerHTML="";
  document.getElementById("historyList").innerHTML="";
  document.getElementById("wallList").innerHTML="";
  document.getElementById("rankingList").innerHTML="";
  document.getElementById("progressBar").value=0;
  document.getElementById("timeInfo").innerText="0:00 / 0:00";
}

function formatTime(sec){
  sec=Math.floor(sec||0);
  const m=Math.floor(sec/60), s=sec%60;
  return m+":"+(s<10?"0"+s:s);
}
