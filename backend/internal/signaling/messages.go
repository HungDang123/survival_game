package signaling

import "encoding/json"

type MsgType string

const (
	MsgJoin      MsgType = "join"
	MsgRoomState MsgType = "room_state"
	MsgPeerJoined MsgType = "peer_joined"
	MsgPeerLeft  MsgType = "peer_left"
	MsgOffer     MsgType = "offer"
	MsgAnswer    MsgType = "answer"
	MsgICE       MsgType = "ice"
	MsgWorldSeed MsgType = "world_seed"
)

type BaseMsg struct {
	Type MsgType `json:"type"`
}

type RoomStateMsg struct {
	Type    MsgType  `json:"type"`
	Players []string `json:"players"`
	Seed    int64    `json:"seed"`
}

type PeerEventMsg struct {
	Type   MsgType `json:"type"`
	PeerID string  `json:"peerId"`
}

type RelayMsg struct {
	Type MsgType         `json:"type"`
	From string          `json:"from"`
	To   string          `json:"to,omitempty"`
	SDP  json.RawMessage `json:"sdp,omitempty"`
	Candidate json.RawMessage `json:"candidate,omitempty"`
}
