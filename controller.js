let peer=null, conn=null;
let hostId="ktv-host";
let myName="訪客"+Math.floor(Math.random()*9000);
let connected=false;

// YouTube API
const YT_API_KEY = "AIzaSyBOdPgWJQOZ1fswTgJRxA2RB3Awf_GrdAE";
let nextPageToken=null, prevPageToken=null, lastQuery="";

// --- 連線 ---
function connectHost(){
  if(connected) return;
  if(peer && !peer.destroyed) try{peer.destroy();}catch(e){}
  peer = new Peer(null,{host:"0.peerjs.com",port:443,path:"/",secure:true});
  peer.on("open", id=>{
    conn = peer.connect(hostId);
    conn.on("open", ()=>{
      connected=true;
      setStatus("✅ 已連線到 Host");
      conn.send({type:"register", name:myName});
    });
    conn.on("data", msg=>handleMsg(msg));
    conn.on("close", ()=>{connected=false;setStatus("❌ 與 Host 斷線");clearUI();});
  });
  peer.on("error", err=>{
    setStatus("❌ PeerJS 錯誤");
    console.error(err);
  });
}

// --- UI 狀態 ---
function setStatus(t){const el=document.getElementById("connStatus");if(el)el.innerText=t;}

// --- 點歌 ---
function sendSong(){
  if(!conn || !conn.open){setStatus("⚠️ 尚未連線，無法送出");return;}
  const title=document.getElementById("songTitle").value.trim();
  const videoId=document.getElementById("songVideoId").value.trim();
  if(!title||!videoId){setStatus("⚠️ 請輸入完整資訊");return;}
  conn.send({type:"enqueue",payload:{title,videoId,by:myName}});
  setStatus("🎵 已送出："+title);
  document.getElementById("songTitle").value="";
  document.getElementById("songVideoId").value="";
}

// --- 插播 ---
function insertSong(title, videoId){
  if(!conn || !conn.open){setStatus("⚠️ 尚未連線，無法插播");return;}
  conn.send({type:"insertNext",pin:"1234",payload:{title,videoId,by:myName}});
  setStatus("🚨 已插播："+title);
}

// --- 表情 ---
function sendFeedback(){
  if(!conn||!conn.open)return;
  const emoji=document.getElementById("emojiInput").value||"😀";
  conn.send({type:"feedback",by:myName,emoji});
  document.getElementById("emojiInput").value="";
}

// --- YouTube 搜尋 ---
async function searchYouTube(query,pageToken=""){
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&type=video&q=${encodeURIComponent(query)}&key=${YT_API_KEY}${pageToken?`&pageToken=${pageToken}`:""}`;
  const res=await fetch(url);
  const data=await res.json();
  console.log("YT API 回傳:",data);
  nextPageToken=data.nextPageToken||null;
  prevPageToken=data.prevPageToken||null;
  lastQuery=query;
  return data.items?data.items.map(i=>({title:i.snippet.title,videoId:i.id.videoId})):[];
}

async function searchSong(pageToken=""){
  const query=document.getElementById("searchQuery").value.trim()||lastQuery;
  if(!query)return;
  document.getElementById("searchResults").innerText="搜尋中...";
  try{
    const results=await searchYouTube(query,pageToken);
    const el=document.getElementById("searchResults");el.innerHTML="";
    if(results.length===0){el.innerText="❌ 沒找到結果";return;}
    results.forEach(r=>{
      const div=document.createElement("div");div.className="listItem";
      div.innerHTML=`${r.title} <button class="btnSm">點播</button> <button class="btnSm">插播</button>`;
      const [btnEnq,btnIns]=div.querySelectorAll("button");
      btnEnq.onclick=()=>{if(conn&&conn.open){conn.send({type:"enqueue",payload:{title:r.title,videoId:r.videoId,by:myName}});setStatus("🎵 已點播："+r.title);}};
      btnIns.onclick=()=>insertSong(r.title,r.videoId);
      el.appendChild(div);
    });
  }catch(e){
    console.error("YT 搜尋錯誤",e);
    document.getElementById("searchResults").innerText="❌ 搜尋失敗："+e;
  }
}
function nextPage(){if(nextPageToken)searchSong(nextPageToken);}
function prevPage(){if(prevPageToken)searchSong(prevPageToken);}

// --- 收訊處理 (簡化) ---
function handleMsg(msg){
  if(!msg||!msg.type)return;
  if(msg.type==="sync"){updateProgress(msg.payload.progress,msg.payload.duration);}
}
function updateProgress(cur,dur){
  const bar=document.getElementById("progressBar"),time=document.getElementById("timeInfo");
  if(bar)bar.value=dur?(cur/dur*100):0;
  if(time)time.innerText=`${Math.floor(cur/60)}:${("0"+Math.floor(cur%60)).slice(-2)} / ${Math.floor(dur/60)}:${("0"+Math.floor(dur%60)).slice(-2)}`;
}
function clearUI(){["queue","historyList","wallList","rankingList"].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML="";});}

// --- 自動連線 ---
document.addEventListener("DOMContentLoaded",()=>{
  const params=new URLSearchParams(window.location.search);
  hostId=params.get("host")||"ktv-host";
  connectHost();
});

// --- 匯出到 window ---
window.sendSong=sendSong;
window.sendFeedback=sendFeedback;
window.searchSong=searchSong;
window.nextPage=nextPage;
window.prevPage=prevPage;
