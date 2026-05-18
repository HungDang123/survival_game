package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

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
	if os.Getenv("LOG_LEVEL") != "off" {
		r.Use(middleware.Logger)
	}
	r.Use(middleware.Recoverer)
	r.Use(authMiddleware(os.Getenv("AUTH_TOKEN")))
	r.Use(rateLimitMiddleware(120, time.Minute))
	origins := []string{"*"}
	if corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); corsOrigins != "" {
		origins = strings.Split(corsOrigins, ",")
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	r.Mount("/", handler.Router())

	log.Printf("Server starting on :%s", port)
	certFile := os.Getenv("TLS_CERT_FILE")
	keyFile := os.Getenv("TLS_KEY_FILE")
	if certFile != "" && keyFile != "" {
		err = http.ListenAndServeTLS(":"+port, certFile, keyFile, r)
	} else {
		err = http.ListenAndServe(":"+port, r)
	}
	if err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func authMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if token == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer "+token && r.URL.Query().Get("token") != token {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func rateLimitMiddleware(limit int, window time.Duration) func(http.Handler) http.Handler {
	type bucket struct {
		count int
		reset time.Time
	}
	var mu sync.Mutex
	buckets := map[string]bucket{}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := strings.Split(r.RemoteAddr, ":")[0]
			now := time.Now()

			mu.Lock()
			b := buckets[ip]
			if now.After(b.reset) {
				b = bucket{reset: now.Add(window)}
			}
			b.count++
			buckets[ip] = b
			allowed := b.count <= limit
			mu.Unlock()

			if !allowed {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
