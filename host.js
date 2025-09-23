// host.js

// === WebSocket 連線設定 ===
const WS_URL = `ws://${location.hostname}:8080`; // TODO: 根據實際伺服器修改
let socket;
let heartbeatTimer;
let reconnectTimer;

// 建立連線
function connect() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("[Host] 已連線");
    startHeartbeat();
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  socket.onclose = () => {
    console.warn("[Host] 連線關閉，將嘗試重連");
    stopHeartbeat();
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.error("[Host] 錯誤：", err);
    socket.close();
  };
}

// 處理訊息
function handleMessage(msg) {
  switch (msg.type) {
    case "pong":
      // 心跳回應
      break;
    case "progress":
      // 從 client 收到進度狀態（可用來比對）
      console.log("[Host] 收到進度", msg.data);
      break;
    default:
      console.log("[Host] 未知訊息", msg);
  }
}

// === Heartbeat ===
function startHeartbeat() {
  stopHeartbeat(); // 保險
  heartbeatTimer = setInterval(() => {
    send({ type: "ping", time: Date.now() });
  }, 5000); // 每 5 秒一次
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
    console.log("[Host] 嘗試重連…");
    connect();
  }, 3000); // 3 秒後重連
}

// === 發送訊息 ===
function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

// 啟動
connect();