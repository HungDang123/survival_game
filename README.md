# SurvivalCraft 3D

Game survival/sandbox 3D multiplayer sử dụng Three.js, Go và WebRTC.

## Tech Stack

- **Frontend**: Vite + TypeScript + Three.js
- **Backend**: Go (signaling server + REST API)
- **Multiplayer**: WebRTC DataChannel (game data P2P) + WebRTC Audio (voice chat)
- **Database**: SQLite (world persistence)

## Chạy local (dev)

### Backend

```bash
cd backend
go run ./cmd/server
# Server chạy tại http://localhost:8080
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# App chạy tại http://localhost:3000
```

Mở trình duyệt: `http://localhost:3000?room=myroom`

## Điều khiển

| Phím | Hành động |
|------|-----------|
| WASD / Arrow | Di chuyển |
| Space | Nhảy |
| Click (giữ) | Sử dụng tool đang chọn |
| 1-8 | Chọn slot hotbar |
| Scroll | Đổi tool |
| T | Mở chat |
| Esc | Đóng chat / thoát pointer lock |

## Tools

- **Slot 1 (⛏️)**: Xẻng - đào terrain xuống
- **Slot 2 (🔨)**: Búa - xây terrain lên
- **Slot 3 (✋)**: Tay - không có tác dụng

## Voice Chat

1. Nhấn nút **🎙️ Bật Voice Chat** ở góc trên phải
2. Cho phép truy cập microphone
3. Nhấn **🎤 Mic ON** để mute/unmute

## Docker

```bash
docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8080
```

## Cấu trúc dự án

```
survival-game/
├── frontend/          # Vite + Three.js
│   ├── src/
│   │   ├── terrain/   # Terrain generation & deformation
│   │   ├── player/    # Local/Remote player
│   │   ├── network/   # WebRTC + Signaling
│   │   ├── game/      # Game loop, world, inventory
│   │   └── ui/        # HUD, voice chat
│   └── package.json
├── backend/           # Go server
│   ├── cmd/server/    # Entry point
│   └── internal/
│       ├── signaling/ # WebSocket signaling hub
│       ├── room/      # Room management
│       ├── world/     # SQLite persistence
│       └── api/       # HTTP handlers
└── docker-compose.yml
```

## Architecture

```
Browser A ──WS──► Go Signaling ◄──WS── Browser B
         ◄──────── SDP/ICE ──────────►
         ◄──── WebRTC DataChannel ───►  (game state 20fps)
         ◄──── WebRTC Audio Track ───►  (voice chat)
         
Browser A/B ──REST──► Go API ──► SQLite (world save)
```
