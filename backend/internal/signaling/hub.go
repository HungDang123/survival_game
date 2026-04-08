package signaling

import (
	"log"
	"sync"
)

type Hub struct {
	rooms map[string]map[string]*Client
	mu    sync.RWMutex

	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[string]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.addClient(client)
		case client := <-h.unregister:
			h.removeClient(client)
		}
	}
}

func (h *Hub) Register(c *Client) {
	h.register <- c
}

func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.rooms[c.RoomID] == nil {
		h.rooms[c.RoomID] = make(map[string]*Client)
	}

	existingPlayers := h.playerList(c.RoomID)
	h.rooms[c.RoomID][c.ID] = c

	for _, existing := range h.rooms[c.RoomID] {
		if existing.ID != c.ID {
			existing.Send(PeerEventMsg{Type: MsgPeerJoined, PeerID: c.ID})
		}
	}

	log.Printf("player %s joined room %s (%d players)", c.ID, c.RoomID, len(h.rooms[c.RoomID]))

	_ = existingPlayers
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[c.RoomID]
	if !ok {
		return
	}

	delete(room, c.ID)
	if len(room) == 0 {
		delete(h.rooms, c.RoomID)
	} else {
		for _, other := range room {
			other.Send(PeerEventMsg{Type: MsgPeerLeft, PeerID: c.ID})
		}
	}

	log.Printf("player %s left room %s", c.ID, c.RoomID)
}

func (h *Hub) SendRoomState(c *Client, seed int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	players := h.playerList(c.RoomID)
	c.Send(RoomStateMsg{
		Type:    MsgRoomState,
		Players: players,
		Seed:    seed,
	})
}

func (h *Hub) Relay(roomID, targetID string, msg RelayMsg) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	target, ok := room[targetID]
	if !ok {
		log.Printf("relay target %s not found in room %s", targetID, roomID)
		return
	}
	target.Send(msg)
}

func (h *Hub) playerList(roomID string) []string {
	room := h.rooms[roomID]
	players := make([]string, 0, len(room))
	for id := range room {
		players = append(players, id)
	}
	return players
}
