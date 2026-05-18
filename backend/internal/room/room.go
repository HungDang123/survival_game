package room

import (
	"math/rand"
	"time"
)

type Room struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Seed      int64     `json:"seed"`
	CreatedAt time.Time `json:"created_at"`
}

func New(id string) *Room {
	return &Room{
		ID:        id,
		Name:      id,
		Seed:      rand.Int63(),
		CreatedAt: time.Now(),
	}
}
