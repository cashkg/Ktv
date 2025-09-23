// controller.js

// === WebSocket 連線設定 ===
const WS_URL = `ws://${location.hostname}:8080`; // TODO: 根據實際伺服器修改
let socket;
let heartbeatTimer;
let reconnectTimer;

// 建立連線
function connect() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("[Controller] 已連線");
    startHeartbeat();
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  socket.onclose = () => {
    console.warn("[Controller] 連線關閉，將嘗試重連");
    stopHeartbeat();
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.error("[Controller] 錯誤：", err);
    socket.close();
  };
}

// 處理訊息
function handleMessage(msg) {
  switch (msg.type) {
    case "ping":
      // 回覆 host
      send({ type: "pong", time: Date.now() });
      break;
    case "progress-sync":
      // Host 要求同步進度
      applyProgress(msg.data);
      break;
    default:
      console.log("[Controller] 未知訊息", msg);
  }
}

// === Heartbeat ===
function startHeartbeat() {
  stopHeartbeat(); // 保險
  heartbeatTimer = setInterval(() => {
    send({ type: "alive", time: Date.now() });
  }, 5000); // 每 5 秒告知活著
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// === 自動重連 ===
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    console.log("[Controller] 嘗試重連…");
    connect();
  }, 3000); // 3 秒後重連
}

// === 發送訊息 ===
function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

// === 進度校正邏輯（骨架） ===
function applyProgress(data) {
  console.log("[Controller] 校正進度", data);
  // TODO: 根據 host 提供的進度，更新本地 UI 或播放器狀態
}

// 啟動
connect();