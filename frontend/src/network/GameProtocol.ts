import { encode, decode } from '@msgpack/msgpack';
import type { PlayerState } from '../player/LocalPlayer';
import type { TerrainModification } from '../terrain/TerrainChunk';

export const MsgType = {
  PLAYER_UPDATE: 1 as const,
  TERRAIN_MODIFY: 2 as const,
  PLAYER_ACTION: 3 as const,
  CHAT_TEXT: 4 as const,
  WORLD_STATE: 5 as const,
};

export interface PlayerUpdateMsg {
  t: typeof MsgType.PLAYER_UPDATE;
  d: PlayerState;
}

export interface TerrainModifyMsg {
  t: typeof MsgType.TERRAIN_MODIFY;
  d: TerrainModification;
}

export interface ChatTextMsg {
  t: typeof MsgType.CHAT_TEXT;
  sender: string;
  text: string;
}

export interface WorldStateMsg {
  t: typeof MsgType.WORLD_STATE;
  mods: TerrainModification[];
}

export type GameMsg = PlayerUpdateMsg | TerrainModifyMsg | ChatTextMsg | WorldStateMsg;

export function encodeMsg(msg: GameMsg): ArrayBuffer {
  return encode(msg).buffer as ArrayBuffer;
}

export function decodeMsg(data: ArrayBuffer): GameMsg {
  return decode(new Uint8Array(data)) as GameMsg;
}
