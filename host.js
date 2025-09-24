let player, peer;
let conns = [];
let queue = [], current = null, history = [];
let hostPIN="1234";
let users = []; // {id, name, lastPong}
let ranking = {}; // {name: count}
let wall = []; // feedback messages

const bgmList=["dQw4w9WgXcQ","oHg5SJYRHA0"];
let bgmMode=false;

const hostId = new URLSearchParams(window.location.search).get("host") || "ktv-host";
document.getElementById("peer-id").innerText = hostId;
document.getElementById("pinInput").addEventListener("input", e=> hostPIN=e.target.value);

// 主題切換
document.getElementById("themeSelect").addEventListener("change", e=>{
  const theme = e.target.value;
  document.body.dataset.theme = theme;
  sync();
});

// 初始化主題
document.body.dataset.theme = document.getElementById("themeSelect").value;

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(el=>el.style.display="none");
  document.getElementById("tab-"+tab).style.display="block";
  if(tab==="history") renderHistory();
  if(tab==="ranking") renderRanking();
  if(tab==="wall") renderWall();
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height:"360", width:"640",
    events:{ onStateChange:(e)=>{ if(e.data===YT.PlayerState.ENDED) playNext(); } }
  });
}

// ✅ 強制使用 WSS
peer = new Peer(hostId, { 
  host:"0.peerjs.com", 
  port:443, 
  path:"/", 
  secure:true,
  config:{ iceServers:[{urls:"stun:stun.l.google.com:19302"}] } 
});

// Host 啟動成功
peer.on("open", ()=>{
  document.getElementById("status").innerText="✅ Host 啟動成功";
  document.getElementById("networkWarning").innerText="提示：同一 Wi-Fi 下連線最佳，跨網路可能失敗";

  // 產生 QRCode
  const url = location.origin + location.pathname.replace("host.html","controller.html") + "?host=" + hostId;
  QRCode.toCanvas(document.getElementById("qrcodeCanvas"), url, {
    width: 256,
    margin: 2,
    color: { dark:"#000", light:"#fff" },
    errorCorrectionLevel: "H"
  }, function (error) {
    if (error) console.error(error);
    else console.log("QRCode 生成成功：", url);
  });
});

// 自動重連
peer.on("disconnected", ()=>{
  console.warn("PeerJS 連線斷開，嘗試重連...");
  peer.reconnect();
});
peer.on("error", (err)=>{
  console.error("PeerJS 錯誤：", err);
});

peer.on("connection", (c)=>{
  conns.push(c);
  users.push({id:c.peer, name:"匿名", lastPong:Date.now()});
  c.on("data", msg=>handleMsg(msg,c));
  c.on("close", ()=>{ users=users.filter(u=>u.id!==c.peer); renderUsers(); });
  sync();
});

function handleMsg(msg, c){
  switch(msg.type){
    case "enqueue":
      if(msg.payload && msg.payload.by){
        ranking[msg.payload.by] = (ranking[msg.payload.by]||0)+1;
      }
      enqueue(msg.payload); break;
    case "insertNext": if(msg.pin===hostPIN) insertNext(msg.payload); break;
    case "removeAt": if(msg.pin===hostPIN) removeAt(msg.payload); break;
    case "next": if(msg.pin===hostPIN) playNext(); break;
    case "seek": if(player&&msg.pin===hostPIN) player.seekTo(msg.payload, true); break;
    case "register":
      let user = users.find(u=>u.id===c.peer);
      if(user){ user.name=msg.name||"匿名"; }
      renderUsers(); break;
    case "rename":
      let u=users.find(u=>u.id===c.peer);
      if(u){ u.name=msg.name||"匿名"; }
      renderUsers(); break;
    case "forceEnqueue": enqueue(msg.payload); break;
    case "feedback":
      wall.push({by:msg.by, emoji:msg.emoji});
      if(wall.length>20) wall.shift();
      renderWall(); break;
    case "pong":
      let pu=users.find(u=>u.id===c.peer);
      if(pu) pu.lastPong=Date.now();
      break;
  }
}

function enqueue(item){ stopBGM(); queue.push(item); if(!current) playNext(); render(); sync(); }
function insertNext(item){ stopBGM(); queue.unshift(item); render(); sync(); }
function removeAt(i){ queue.splice(i,1); render(); sync(); }

function playNext(){
  if(current){ 
    history.push(current); 
    if(history.length>50) history.shift(); // 限制歷史紀錄筆數
    renderHistory(); 
  }
  if(queue.length===0){ 
    current=null; 
    document.getElementById("nowPlaying").innerText="暫無"; 
    player.stopVideo(); 
    startBGM(); 
    sync(); 
    return; 
  }
  stopBGM();
  current=queue.shift();
  document.getElementById("nowPlaying").innerText=current.by? `${current.by} 點播 ${current.title}`: current.title;
  document.title="🎶 "+current.title+(current.by? " - by "+current.by:"");
  player.loadVideoById(current.videoId);
  render(); sync();
}

function playVideo(){ player.playVideo(); }
function pauseVideo(){ player.pauseVideo(); }
function stopVideo(){ player.stopVideo(); }

function render(){
  const el=document.getElementById("queue"); el.innerHTML="";
  queue.forEach((q,i)=>{
    el.innerHTML+=`<div class="listItem">
      <button class="btnSm" onclick="removeAt(${i})">刪除</button>
      <button class="btnSm" onclick="insertNext(queue[${i}])">插播</button>
      <button class="btnSm" onclick="if(${i}>0){ [queue[${i}-1],queue[${i}]]=[queue[${i}],queue[${i}-1]]; render(); sync(); }">⬆️</button>
      <button class="btnSm" onclick="if(${i}<queue.length-1){ [queue[${i}+1],queue[${i}]]=[queue[${i}],queue[${i}+1]]; render(); sync(); }">⬇️</button>
      ${q.by? q.by+" 點播 ":""}${q.title}
    </div>`;
  });
}

function renderHistory(){
  const el=document.getElementById("historyList"); el.innerHTML="";
  history.slice().reverse().forEach(h=>{
    el.innerHTML+=`<div class="listItem">${h.by? h.by+" 點播 ":""}${h.title}</div>`;
  });
}

function renderUsers(){
  document.getElementById("userCount").innerText="目前連線人數："+users.length;
  const el=document.getElementById("userList"); el.innerHTML="";
  users.forEach(u=>{ el.innerHTML+=`<div>${u.name}</div>`; });
}

function renderRanking(){
  const sorted = Object.entries(ranking).sort((a,b)=>b[1]-a[1]).slice(0,50); // 限制50
  const el=document.getElementById("rankingList"); el.innerHTML="";
  sorted.forEach(([name,count],i)=>{
    el.innerHTML+=`<div class="listItem">${i+1}. ${name} ${count} 首</div>`;
  });
}

function renderWall(){
  const el=document.getElementById("wallList"); el.innerHTML="";
  wall.forEach(m=>{ el.innerHTML+=`<div class="listItem">${m.by}：${m.emoji}</div>`; });
  const latest = wall[wall.length-1];
  document.getElementById("latestMsg").innerText = latest ? `最新訊息：${latest.by} ${latest.emoji}` : "";
}

function sync(){
  conns = conns.filter(c=>c.open);
  renderUsers(); renderRanking(); renderWall();
  const payload={
    queue,current,history, needPIN:true,
    progress: player?player.getCurrentTime():0,
    duration: player?player.getDuration():0,
    ranking, theme:document.getElementById("themeSelect").value,
    wall, pong:true
  };
  conns.forEach(c=>c.send({type:"sync",payload}));
}
setInterval(()=> sync(),1000);

// 使用者心跳檢查
setInterval(()=>{
  const now=Date.now();
  users=users.filter(u=> now-u.lastPong < 10000); // 10 秒沒回應視為斷線
  renderUsers();
},5000);

function startBGM(){
  if(bgmList.length===0) return;
  bgmMode=true;
  const bgmId=bgmList[Math.floor(Math.random()*bgmList.length)];
  player.loadVideoById(bgmId);
  document.getElementById("nowPlaying").innerText="🎶 背景音樂";
}
function stopBGM(){ if(bgmMode){ player.stopVideo(); bgmMode=false; } }

setInterval(()=>{
  if(player && player.getDuration){
    const cur=player.getCurrentTime(), dur=player.getDuration();
    document.getElementById("progressBar").value = dur? (cur/dur*100):0;
    document.getElementById("timeInfo").innerText = formatTime(cur)+" / "+formatTime(dur);
  }
},1000);

function formatTime(sec){
  sec=Math.floor(sec);
  const m=Math.floor(sec/60), s=sec%60;
  return m+":"+(s<10?"0"+s:s);
}
