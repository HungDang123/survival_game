package world

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if err := migrate(db); err != nil {
		return nil, err
	}

	return &Store{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS rooms (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			seed INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS terrain_mods (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room_id TEXT NOT NULL,
			chunk_id TEXT NOT NULL,
			vertex_idx INTEGER NOT NULL,
			delta_y REAL NOT NULL,
			tool_type TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_terrain_mods_room ON terrain_mods(room_id);

		CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			room_id TEXT NOT NULL,
			pos_x REAL DEFAULT 0,
			pos_y REAL DEFAULT 10,
			pos_z REAL DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	return err
}

func (s *Store) UpsertRoom(id, name string, seed int64) error {
	_, err := s.db.Exec(`
		INSERT INTO rooms (id, name, seed) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name
	`, id, name, seed)
	return err
}

func (s *Store) GetRoomSeed(id string) (int64, error) {
	var seed int64
	err := s.db.QueryRow(`SELECT seed FROM rooms WHERE id = ?`, id).Scan(&seed)
	return seed, err
}

func (s *Store) SaveTerrainMod(mod TerrainMod) error {
	_, err := s.db.Exec(`
		INSERT INTO terrain_mods (room_id, chunk_id, vertex_idx, delta_y, tool_type)
		VALUES (?, ?, ?, ?, ?)
	`, mod.RoomID, mod.ChunkID, mod.VertexIndex, mod.DeltaY, mod.ToolType)
	return err
}

func (s *Store) GetTerrainMods(roomID string) ([]TerrainMod, error) {
	rows, err := s.db.Query(`
		SELECT room_id, chunk_id, vertex_idx, delta_y, tool_type
		FROM terrain_mods WHERE room_id = ?
		ORDER BY id ASC
	`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mods []TerrainMod
	for rows.Next() {
		var m TerrainMod
		if err := rows.Scan(&m.RoomID, &m.ChunkID, &m.VertexIndex, &m.DeltaY, &m.ToolType); err != nil {
			log.Printf("scan error: %v", err)
			continue
		}
		mods = append(mods, m)
	}
	return mods, rows.Err()
}

func (s *Store) UpsertPlayer(id, roomID string, x, y, z float64) error {
	_, err := s.db.Exec(`
		INSERT INTO players (id, room_id, pos_x, pos_y, pos_z)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			room_id=excluded.room_id,
			pos_x=excluded.pos_x,
			pos_y=excluded.pos_y,
			pos_z=excluded.pos_z,
			updated_at=CURRENT_TIMESTAMP
	`, id, roomID, x, y, z)
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}
