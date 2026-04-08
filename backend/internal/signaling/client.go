package signaling

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	maxMsgSize = 65536
)

type Client struct {
	ID     string
	RoomID string
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	mu     sync.Mutex
}

func NewClient(id, roomID string, hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		ID:     id,
		RoomID: roomID,
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte, 256),
	}
}

func (c *Client) Send(msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("client %s send buffer full", c.ID)
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws error: %v", err)
			}
			break
		}

		var base BaseMsg
		if err := json.Unmarshal(raw, &base); err != nil {
			continue
		}

		switch base.Type {
		case MsgOffer, MsgAnswer, MsgICE:
			var relay RelayMsg
			if err := json.Unmarshal(raw, &relay); err != nil {
				continue
			}
			relay.From = c.ID
			c.hub.Relay(c.RoomID, relay.To, relay)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
