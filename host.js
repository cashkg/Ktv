let player, peer;
let conns = [];
let queue = [], current = null, history = [];
let hostPIN="1234";
let users = []; // {id, name}
let ranking = {}; // {name: count}
let wall = []; // feedback messages

const bgmList=["dQw4w9WgXcQ","oHg5SJYRHA0"];
let bgmMode=false;

const hostId = new URLSearchParams(window.location.search).get("host") || "ktv-host";
document.getElementById("peer-id").innerText = hostId;
document.getElementById("pinInput").addEventListener("input", e=> hostPIN=e.target.value);

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

peer = new Peer(hostId, { 
  host:"0.peerjs.com", port:443, path:"/", secure:true, 
  config:{ iceServers:[{urls:"stun:stun.l.google.com:19302"}] } 
});

peer.on("open", ()=> document.getElementById("status").innerText="✅ Host 啟動成功");
peer.on("connection", (c)=>{
  conns.push(c);
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
      users.push({id:c.peer, name:msg.name||"匿名"});
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
  }
}

function enqueue(item){ stopBGM(); queue.push(item); if(!current) playNext(); render(); sync(); }
function insertNext(item){ stopBGM(); queue.unshift(item); render(); sync(); }
function removeAt(i){ queue.splice(i,1); render(); sync(); }

function playNext(){
  if(current){ history.push(current); renderHistory(); }
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
  const sorted = Object.entries(ranking).sort((a,b)=>b[1]-a[1]);
  const el=document.getElementById("rankingList"); el.innerHTML="";
  sorted.forEach(([name,count],i)=>{
    el.innerHTML+=`<div class="listItem">${i+1}. ${name} ${count} 首</div>`;
  });
}

function renderWall(){
  const el=document.getElementById("wallList"); el.innerHTML="";
  wall.forEach(m=>{ el.innerHTML+=`<div class="listItem">${m.by}：${m.emoji}</div>`; });
  // 最新訊息顯示在播放面
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

function startBGM(){
  if(bgmList.length===0) return;
  bgmMode=true;
  const bgmId=bgmList[Math.floor(Math.random()*bgmList.length)];
  player.loadVideoById(bgmId);
  document.getElementById("nowPlaying").innerText="🎶 背景音樂";
}
function stopBGM(){ if(bgmMode){ player.stopVideo(); bgmMode=false; } }

document.getElementById("themeSelect").addEventListener("change", sync);

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