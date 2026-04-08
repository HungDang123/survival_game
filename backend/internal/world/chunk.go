package world

type TerrainMod struct {
	RoomID      string  `json:"room_id" db:"room_id"`
	ChunkID     string  `json:"chunkId" db:"chunk_id"`
	VertexIndex int     `json:"vertexIndex" db:"vertex_idx"`
	DeltaY      float64 `json:"deltaY" db:"delta_y"`
	ToolType    string  `json:"toolType" db:"tool_type"`
}
