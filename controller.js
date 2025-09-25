async function searchSong(pageToken=""){
  const query=document.getElementById("searchQuery").value.trim()||lastQuery;
  if(!query)return;
  document.getElementById("searchResults").innerText="搜尋中...";
  try{
    const results=await searchYouTube(query,pageToken);
    const el=document.getElementById("searchResults");el.innerHTML="";
    if(results.length===0){el.innerText="❌ 沒找到結果";return;}
    results.forEach(r=>{
      const div=document.createElement("div");
      div.className="listItem";
      div.style.alignItems="flex-start";
      div.innerHTML=`
        <img src="https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg" 
             style="width:120px; height:90px; object-fit:cover; border-radius:6px;">
        <div style="flex:1;">
          <div style="font-size:14px; font-weight:bold;">${r.title}</div>
          <div style="margin-top:4px;">
            <button class="btnSm">點播</button>
            <button class="btnSm">插播</button>
          </div>
        </div>`;
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
