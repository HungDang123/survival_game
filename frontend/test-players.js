/**
 * SurvivalCraft 3D - Multi Player Test Script
 * Chạy: node test-players.js
 * Yêu cầu: npm install ws
 */

import WebSocket from 'ws';

// ─── CONFIG ───────────────────────────────────────────────
const SERVER_URL = 'ws://localhost:8080';
const API_URL    = 'http://localhost:8080';
const ROOM_ID    = 'test-room-' + Date.now();
const NUM_PLAYERS = 5;
const TICK_RATE   = 20; // fps
// ──────────────────────────────────────────────────────────

const players = [];
let tickInterval = null;

// Màu log theo player
const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[32m', '\x1b[35m', '\x1b[34m'];
const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';

function log(prefix, msg, color = '') {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`${color}[${time}] ${prefix}${RESET} ${msg}`);
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Tạo fake player state (giả lập chuyển động) ──────────
function generatePlayerState(player, tick) {
  const angle = (tick / 60) * Math.PI * 2 * player.speed;
  const radius = 10 + player.index * 3;
  return {
    t: 1, // MsgType.PLAYER_UPDATE
    d: {
      id: player.id,
      position: {
        x: Math.cos(angle) * radius,
        y: 3,
        z: Math.sin(angle) * radius,
      },
      rotation: {
        x: 0,
        y: angle + Math.PI,
      },
      animState: 'walk',
    },
  };
}

// ─── Encode msgpack đơn giản (JSON fallback) ──────────────
// Thực tế game dùng msgpack, ở đây dùng JSON để test
function encodeMsg(msg) {
  return JSON.stringify(msg);
}

// ─── Tạo 1 player ─────────────────────────────────────────
function createPlayer(index) {
  const id = 'bot_' + generateId();
  const color = COLORS[index % COLORS.length];
  const prefix = `${BOLD}[P${index + 1}:${id.slice(0, 6)}]${RESET}`;

  const player = {
    id,
    index,
    color,
    prefix,
    ws: null,
    connected: false,
    seed: null,
    peers: new Map(),
    stats: {
      sent: 0,
      received: 0,
      errors: 0,
    },
    speed: 0.5 + Math.random() * 1.5,
    position: { x: 0, y: 3, z: 0 },
  };

  return player;
}

// ─── Kết nối WebSocket cho 1 player ───────────────────────
function connectPlayer(player) {
  return new Promise((resolve, reject) => {
    const url = `${SERVER_URL}/ws?room=${ROOM_ID}&player=${player.id}`;
    log(player.prefix, `Đang kết nối → ${url}`, player.color);

    const ws = new WebSocket(url);
    player.ws = ws;

    ws.on('open', () => {
      player.connected = true;
      log(player.prefix, `✅ Connected!`, GREEN);
      resolve(player);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        player.stats.received++;
        handleSignalingMessage(player, msg);
      } catch (e) {
        log(player.prefix, `❌ Parse error: ${e.message}`, RED);
        player.stats.errors++;
      }
    });

    ws.on('error', (err) => {
      log(player.prefix, `❌ WS Error: ${err.message}`, RED);
      player.stats.errors++;
      reject(err);
    });

    ws.on('close', (code, reason) => {
      player.connected = false;
      log(player.prefix, `🔌 Disconnected (code=${code})`, YELLOW);
    });

    // Timeout sau 5s
    setTimeout(() => {
      if (!player.connected) {
        reject(new Error(`Player ${player.id} connection timeout`));
      }
    }, 5000);
  });
}

// ─── Xử lý signaling messages ─────────────────────────────
function handleSignalingMessage(player, msg) {
  switch (msg.type) {
    case 'room_state':
      player.seed = msg.seed;
      log(player.prefix,
        `📦 Room state: seed=${msg.seed}, players=[${msg.players.join(', ')}]`,
        player.color
      );
      break;

    case 'peer_joined':
      log(player.prefix, `👋 Peer joined: ${msg.peerId}`, player.color);
      // Simulate: gửi offer đến peer mới
      simulateSendOffer(player, msg.peerId);
      break;

    case 'peer_left':
      log(player.prefix, `👋 Peer left: ${msg.peerId}`, player.color);
      player.peers.delete(msg.peerId);
      break;

    case 'offer':
      log(player.prefix, `📨 Got offer from: ${msg.from}`, player.color);
      // Simulate: gửi answer lại
      simulateSendAnswer(player, msg.from);
      break;

    case 'answer':
      log(player.prefix, `📨 Got answer from: ${msg.from}`, player.color);
      player.peers.set(msg.from, { state: 'connected' });
      break;

    case 'ice':
      // ICE candidate, bỏ qua trong test
      break;

    default:
      log(player.prefix, `❓ Unknown msg type: ${msg.type}`, YELLOW);
  }
}

// ─── Simulate WebRTC signaling ─────────────────────────────
function simulateSendOffer(player, targetId) {
  if (!player.ws || !player.connected) return;
  const msg = {
    type: 'offer',
    to: targetId,
    sdp: {
      type: 'offer',
      sdp: `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n` +
           `a=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n` +
           `c=IN IP4 0.0.0.0\r\na=ice-ufrag:${generateId()}\r\na=ice-pwd:${generateId()}\r\n`,
    },
  };
  player.ws.send(JSON.stringify(msg));
  log(player.prefix, `📤 Sent offer → ${targetId}`, player.color);
  player.stats.sent++;
}

function simulateSendAnswer(player, targetId) {
  if (!player.ws || !player.connected) return;
  const msg = {
    type: 'answer',
    to: targetId,
    sdp: {
      type: 'answer',
      sdp: `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n` +
           `a=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n` +
           `c=IN IP4 0.0.0.0\r\na=ice-ufrag:${generateId()}\r\na=ice-pwd:${generateId()}\r\n`,
    },
  };
  player.ws.send(JSON.stringify(msg));
  log(player.prefix, `📤 Sent answer → ${targetId}`, player.color);
  player.stats.sent++;
}

function simulateSendIce(player, targetId) {
  if (!player.ws || !player.connected) return;
  const msg = {
    type: 'ice',
    to: targetId,
    candidate: {
      candidate: `candidate:1 1 UDP ${Math.floor(Math.random() * 9999)} 192.168.1.${Math.floor(Math.random()*255)} ${10000 + Math.floor(Math.random()*55535)} typ host`,
      sdpMLineIndex: 0,
      sdpMid: '0',
    },
  };
  player.ws.send(JSON.stringify(msg));
  player.stats.sent++;
}

// ─── Simulate player chat ──────────────────────────────────
const CHAT_MESSAGES = [
  'Hello world!',
  'ai đang online?',
  'test test test',
  'fps đang bao nhiêu vậy?',
  'lag quá!',
  'đợi tôi spawn',
  'mob ở đâu?',
  'tôi level 5 rồi',
];

function simulateChat(player) {
  if (!player.ws || !player.connected) return;
  const text = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
  // Chat message được broadcast qua DataChannel trong game thật
  // Ở đây chỉ log simulate
  log(player.prefix, `💬 Chat: "${text}"`, player.color);
}

// ─── Test REST API ─────────────────────────────────────────
async function testRestAPI() {
  log('[API]', `${BOLD}=== Testing REST API ===${RESET}`, YELLOW);

  // 1. GET room (auto-create)
  try {
    const res = await fetch(`${API_URL}/api/rooms/${ROOM_ID}`);
    const data = await res.json();
    log('[API]', `GET /api/rooms/${ROOM_ID} → ${JSON.stringify(data)}`, GREEN);
  } catch (e) {
    log('[API]', `❌ GET room failed: ${e.message}`, RED);
  }

  // 2. POST create room
  try {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ROOM_ID, name: 'Test Room' }),
    });
    const data = await res.json();
    log('[API]', `POST /api/rooms → ${JSON.stringify(data)}`, GREEN);
  } catch (e) {
    log('[API]', `❌ POST room failed: ${e.message}`, RED);
  }

  // 3. GET terrain mods (should be empty)
  try {
    const res = await fetch(`${API_URL}/api/rooms/${ROOM_ID}/mods`);
    const data = await res.json();
    log('[API]', `GET /api/rooms/${ROOM_ID}/mods → ${JSON.stringify(data)}`, GREEN);
  } catch (e) {
    log('[API]', `❌ GET mods failed: ${e.message}`, RED);
  }

  // 4. POST terrain mod
  try {
    const res = await fetch(`${API_URL}/api/rooms/${ROOM_ID}/mods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunkId: '0_0',
        vertexIndex: 42,
        deltaY: -1.5,
        toolType: 'dig',
      }),
    });
    log('[API]', `POST /api/rooms/${ROOM_ID}/mods → status ${res.status}`, GREEN);
  } catch (e) {
    log('[API]', `❌ POST mod failed: ${e.message}`, RED);
  }

  console.log('');
}

// ─── Print stats ───────────────────────────────────────────
function printStats() {
  console.log(`\n${BOLD}${YELLOW}=== STATS ===${RESET}`);
  let totalSent = 0, totalReceived = 0, totalErrors = 0;
  for (const p of players) {
    log(p.prefix,
      `sent=${p.stats.sent} | received=${p.stats.received} | errors=${p.stats.errors} | connected=${p.connected}`,
      p.color
    );
    totalSent     += p.stats.sent;
    totalReceived += p.stats.received;
    totalErrors   += p.stats.errors;
  }
  console.log(`${BOLD}TOTAL: sent=${totalSent} | received=${totalReceived} | errors=${totalErrors}${RESET}\n`);
}

// ─── Simulate audio/mic (fake VAD broadcast) ──────────────
function simulateMicActivity(player) {
  // Trong game thật, mic đi qua WebRTC Audio Track
  // Ở đây ta simulate bằng cách log "speaking" state
  const isSpeaking = Math.random() > 0.7;
  if (isSpeaking) {
    log(player.prefix, `🎙️ [MIC ACTIVE] đang nói...`, player.color);
  }
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log(`${BOLD}${GREEN}
╔════════════════════════════════════════╗
║   SurvivalCraft 3D - Multi Player Test  ║
╚════════════════════════════════════════╝${RESET}
`);
  log('[MAIN]', `Room ID: ${BOLD}${ROOM_ID}${RESET}`, YELLOW);
  log('[MAIN]', `Players: ${NUM_PLAYERS}`, YELLOW);
  log('[MAIN]', `Server: ${SERVER_URL}`, YELLOW);
  console.log('');

  // 1. Test REST API
  await testRestAPI();

  // 2. Tạo và kết nối players
  log('[MAIN]', `${BOLD}=== Connecting Players ===${RESET}`, YELLOW);

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const player = createPlayer(i);
    players.push(player);

    try {
      await connectPlayer(player);
      // Delay nhỏ giữa các lần connect
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      log(player.prefix, `❌ Failed to connect: ${e.message}`, RED);
    }
  }

  const connected = players.filter(p => p.connected).length;
  log('[MAIN]', `${BOLD}${GREEN}${connected}/${NUM_PLAYERS} players connected${RESET}`, '');
  console.log('');

  // 3. Simulate game loop
  log('[MAIN]', `${BOLD}=== Simulating Game Loop ===${RESET}`, YELLOW);
  let tick = 0;

  tickInterval = setInterval(() => {
    tick++;

    for (const player of players) {
      if (!player.connected) continue;

      // Simulate position broadcast (20fps như game thật)
      // Trong game thật đây là qua DataChannel P2P
      // Ở đây chỉ simulate locally
      const state = generatePlayerState(player, tick);
      player.position = state.d.position;

      // Gửi ICE candidate ngẫu nhiên để test relay
      if (tick % 100 === player.index * 20) {
        const otherPlayers = players.filter(p => p.id !== player.id && p.connected);
        for (const other of otherPlayers) {
          simulateSendIce(player, other.id);
        }
      }
    }

    // Random chat mỗi ~5 giây
    if (tick % (TICK_RATE * 5) === 0) {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      if (randomPlayer?.connected) simulateChat(randomPlayer);
    }

    // Simulate mic activity mỗi 2 giây
    if (tick % (TICK_RATE * 2) === 0) {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      if (randomPlayer?.connected) simulateMicActivity(randomPlayer);
    }

    // Print stats mỗi 10 giây
    if (tick % (TICK_RATE * 10) === 0) {
      printStats();
    }

  }, 1000 / TICK_RATE);

  // 4. Chạy 30 giây rồi dừng
  log('[MAIN]', `Test sẽ chạy trong 30 giây...`, YELLOW);
  setTimeout(async () => {
    clearInterval(tickInterval);
    log('[MAIN]', `${BOLD}=== Test Finished ===${RESET}`, GREEN);
    printStats();

    // Disconnect tất cả
    for (const player of players) {
      if (player.ws) player.ws.close();
    }

    // Đợi close xong
    await new Promise(r => setTimeout(r, 500));
    process.exit(0);
  }, 30000);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  clearInterval(tickInterval);
  console.log(`\n${YELLOW}Interrupted by user${RESET}`);
  printStats();
  for (const player of players) {
    if (player.ws) player.ws.close();
  }
  setTimeout(() => process.exit(0), 500);
});

main().catch(err => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
