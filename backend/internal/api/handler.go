package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"strconv"

	"survival-game/internal/room"
	"survival-game/internal/signaling"
	"survival-game/internal/world"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Handler struct {
	hub            *signaling.Hub
	rooms          *room.Manager
	store          *world.Store
	maxRoomPlayers int
}

func New(hub *signaling.Hub, rooms *room.Manager, store *world.Store) *Handler {
	maxRoomPlayers, _ := strconv.Atoi(os.Getenv("MAX_ROOM_PLAYERS"))
	return &Handler{hub: hub, rooms: rooms, store: store, maxRoomPlayers: maxRoomPlayers}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()

	r.Get("/ws", h.handleWS)
	r.Get("/api/rooms/{roomId}", h.getRoom)
	r.Post("/api/rooms", h.createRoom)
	r.Get("/api/rooms/{roomId}/mods", h.getTerrainMods)
	r.Post("/api/rooms/{roomId}/mods", h.saveTerrainMod)
	r.Get("/api/players/{playerId}", h.getPlayer)
	r.Post("/api/rooms/{roomId}/players/{playerId}", h.savePlayer)
	r.Get("/health", h.health)

	return r
}

func (h *Handler) handleWS(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	playerID := r.URL.Query().Get("player")
	if roomID == "" || playerID == "" {
		http.Error(w, "room and player required", http.StatusBadRequest)
		return
	}
	if h.maxRoomPlayers > 0 && h.hub.RoomSize(roomID) >= h.maxRoomPlayers {
		http.Error(w, "room full", http.StatusTooManyRequests)
		return
	}

	rm := h.rooms.GetOrCreate(roomID)
	if err := h.store.UpsertRoom(rm.ID, rm.Name, rm.Seed); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := signaling.NewClient(playerID, roomID, rm.Seed, h.hub, conn)
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}

func (h *Handler) getRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomId")
	rm := h.rooms.GetOrCreate(roomID)

	if err := h.store.UpsertRoom(rm.ID, rm.Name, rm.Seed); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, rm)
}

func (h *Handler) createRoom(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	rm := h.rooms.GetOrCreate(body.ID)
	if body.Name != "" {
		rm.Name = body.Name
	}
	if err := h.store.UpsertRoom(rm.ID, rm.Name, rm.Seed); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, rm)
}

func (h *Handler) getTerrainMods(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomId")
	mods, err := h.store.GetTerrainMods(roomID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if mods == nil {
		mods = []world.TerrainMod{}
	}
	writeJSON(w, mods)
}

func (h *Handler) saveTerrainMod(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomId")
	var mod world.TerrainMod
	if err := json.NewDecoder(r.Body).Decode(&mod); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	mod.RoomID = roomID

	if err := h.store.SaveTerrainMod(mod); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (h *Handler) getPlayer(w http.ResponseWriter, r *http.Request) {
	playerID := chi.URLParam(r, "playerId")
	player, err := h.store.GetPlayer(playerID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "player not found", http.StatusNotFound)
			return
		}
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, player)
}

func (h *Handler) savePlayer(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomId")
	playerID := chi.URLParam(r, "playerId")
	var body struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
		Z float64 `json:"z"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := h.store.UpsertPlayer(playerID, roomID, body.X, body.Y, body.Z); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
