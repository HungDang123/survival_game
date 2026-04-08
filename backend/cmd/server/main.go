package main

import (
	"log"
	"net/http"
	"os"

	"survival-game/internal/api"
	"survival-game/internal/room"
	"survival-game/internal/signaling"
	"survival-game/internal/world"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "survival.db"
	}

	store, err := world.NewStore(dbPath)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer store.Close()

	hub := signaling.NewHub()
	go hub.Run()

	roomMgr := room.NewManager()

	handler := api.New(hub, roomMgr, store)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	r.Mount("/", handler.Router())

	log.Printf("Server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
