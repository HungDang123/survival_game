import { GameLoop } from './game/GameLoop';
import './style.css';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';
  const playerId = params.get('player') || generateId();

  if (!params.get('player')) {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('player', playerId);
    window.history.replaceState({}, '', newUrl.toString());
  }

  const lobbyEl = document.getElementById('lobby')!;
  const gameEl = document.getElementById('game')!;
  const roomInput = document.getElementById('room-input') as HTMLInputElement;
  const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;

  roomInput.value = roomId;

  joinBtn.addEventListener('click', async () => {
    const rid = roomInput.value.trim() || 'default';
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', rid);
    newUrl.searchParams.set('player', playerId);
    window.history.replaceState({}, '', newUrl.toString());

    lobbyEl.style.display = 'none';
    gameEl.style.display = 'block';

    const game = new GameLoop();
    await game.start(rid, playerId);
  });

  if (params.get('room')) {
    joinBtn.click();
  }
}

main().catch(console.error);
