import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MultiplayerSlot {
  slotIndex: number; // 0..4 -> spawn X = -6, -3, 0, 3, 6
  playerId: string;
  playerName: string;
  carId: string;
  carName: string;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  // Synced PhotonTransformView state
  x: number;
  distanceM: number; // 0 to 2000m
  speedKmh: number;
  yaw: number;
  isNitro: boolean;
  finished: boolean;
  finishTimeSec: number | null;
  finishRank: number | null;
  lastHornTime: number;
  lastHornEmoji: string;
}

export interface RoomState {
  roomCode: string; // 4-digit e.g. "4829"
  networkMode: 'photon_pun2' | 'nearby_wifi';
  hostId: string;
  maxPlayers: number; // 5
  mapName: string; // "Same Highway (2000m)"
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  fillBotsOnStart: boolean;
  raceStartTimeMs: number | null;
  raceElapsedSec: number;
  slots: (MultiplayerSlot | null)[]; // length 5
}

const START_LINE_X = [-6, -3, 0, 3, 6];
const BOT_CARS = [
  { id: 'apex_r1', name: 'Apex R1' },
  { id: 'vortex_blue', name: 'Vortex Blue' },
  { id: 'nova_yellow', name: 'Nova Yellow' },
  { id: 'pulse_sports', name: 'Pulse GT' },
  { id: 'hyperion_x', name: 'Hyperion X' },
];

const rooms = new Map<string, RoomState>();
const clientMeta = new Map<WebSocket, { playerId: string; roomCode: string | null }>();

function generate4DigitCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return '4829';
}

function broadcastToRoom(roomCode: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const [ws, meta] of clientMeta.entries()) {
    if (meta.roomCode === roomCode && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastRoomList() {
  const publicRooms = Array.from(rooms.values())
    .filter((r) => r.status === 'lobby')
    .map((r) => ({
      roomCode: r.roomCode,
      networkMode: r.networkMode,
      playerCount: r.slots.filter((s) => s !== null && !s.isBot).length,
      maxPlayers: r.maxPlayers,
      mapName: r.mapName,
    }));

  const msg = JSON.stringify({ type: 'room:list', rooms: publicRooms });
  for (const [ws] of clientMeta.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function removePlayerFromRoom(ws: WebSocket) {
  const meta = clientMeta.get(ws);
  if (!meta || !meta.roomCode) return;

  const roomCode = meta.roomCode;
  meta.roomCode = null;
  const room = rooms.get(roomCode);
  if (!room) return;

  const idx = room.slots.findIndex((s) => s && s.playerId === meta.playerId);
  if (idx !== -1) {
    room.slots[idx] = null;
  }

  const remainingHumans = room.slots.filter((s): s is MultiplayerSlot => s !== null && !s.isBot);
  if (remainingHumans.length === 0) {
    rooms.delete(roomCode);
    broadcastRoomList();
    return;
  }

  // Reassign host if host left
  if (room.hostId === meta.playerId) {
    const nextHost = remainingHumans[0];
    room.hostId = nextHost.playerId;
    nextHost.isHost = true;
    nextHost.isReady = true;
  }

  broadcastToRoom(roomCode, { type: 'room:state', room });
  broadcastRoomList();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const list = Array.from(rooms.values())
      .filter((r) => r.status === 'lobby')
      .map((r) => ({
        roomCode: r.roomCode,
        networkMode: r.networkMode,
        playerCount: r.slots.filter((s) => s !== null && !s.isBot).length,
        maxPlayers: r.maxPlayers,
        mapName: r.mapName,
      }));
    res.json({ rooms: list });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws-multiplayer' });

  wss.on('connection', (ws) => {
    const defaultPlayerId = `p_${Math.random().toString(36).slice(2, 9)}`;
    clientMeta.set(ws, { playerId: defaultPlayerId, roomCode: null });

    // Send initial public room list
    const publicRooms = Array.from(rooms.values())
      .filter((r) => r.status === 'lobby')
      .map((r) => ({
        roomCode: r.roomCode,
        networkMode: r.networkMode,
        playerCount: r.slots.filter((s) => s !== null && !s.isBot).length,
        maxPlayers: r.maxPlayers,
        mapName: r.mapName,
      }));
    ws.send(JSON.stringify({ type: 'room:list', rooms: publicRooms }));

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        const meta = clientMeta.get(ws);
        if (!meta) return;

        if (data.playerId && typeof data.playerId === 'string') {
          meta.playerId = data.playerId;
        }

        switch (data.type) {
          case 'room:create': {
            removePlayerFromRoom(ws);
            const requestedCode =
              typeof data.roomCode === 'string' && /^\d{4}$/.test(data.roomCode) && !rooms.has(data.roomCode)
                ? data.roomCode
                : generate4DigitCode();

            const hostSlot: MultiplayerSlot = {
              slotIndex: 0,
              playerId: meta.playerId,
              playerName: data.playerName || 'Player 1',
              carId: data.carId || 'apex_r1',
              carName: data.carName || 'Apex R1',
              isHost: true,
              isReady: true,
              isBot: false,
              x: START_LINE_X[0],
              distanceM: 0,
              speedKmh: 0,
              yaw: 0,
              isNitro: false,
              finished: false,
              finishTimeSec: null,
              finishRank: null,
              lastHornTime: 0,
              lastHornEmoji: '📯',
            };

            const newRoom: RoomState = {
              roomCode: requestedCode,
              networkMode: data.networkMode === 'nearby_wifi' ? 'nearby_wifi' : 'photon_pun2',
              hostId: meta.playerId,
              maxPlayers: 5,
              mapName: 'Same Highway (2000m)',
              status: 'lobby',
              fillBotsOnStart: data.fillBotsOnStart !== false,
              raceStartTimeMs: null,
              raceElapsedSec: 0,
              slots: [hostSlot, null, null, null, null],
            };

            rooms.set(requestedCode, newRoom);
            meta.roomCode = requestedCode;
            ws.send(JSON.stringify({ type: 'room:joined', room: newRoom, mySlotIndex: 0 }));
            broadcastRoomList();
            break;
          }

          case 'room:join': {
            const code = String(data.roomCode || '').trim();
            const room = rooms.get(code);
            if (!room) {
              ws.send(
                JSON.stringify({
                  type: 'room:error',
                  message: `Room ${code} not found! Check the 4-digit code or create a room.`,
                })
              );
              return;
            }

            // Check if player is already in this room (reconnecting)
            let mySlotIdx = room.slots.findIndex((s) => s && s.playerId === meta.playerId);
            if (mySlotIdx === -1) {
              if (room.status !== 'lobby') {
                ws.send(
                  JSON.stringify({
                    type: 'room:error',
                    message: `Room ${code} race is already in progress!`,
                  })
                );
                return;
              }
              mySlotIdx = room.slots.findIndex((s) => s === null);
              if (mySlotIdx === -1) {
                // Check if we can replace a bot slot
                mySlotIdx = room.slots.findIndex((s) => s !== null && s.isBot);
              }
              if (mySlotIdx === -1) {
                ws.send(
                  JSON.stringify({
                    type: 'room:error',
                    message: `Room ${code} is full (5/5 players)!`,
                  })
                );
                return;
              }

              removePlayerFromRoom(ws);

              const slotNumber = mySlotIdx + 1;
              room.slots[mySlotIdx] = {
                slotIndex: mySlotIdx,
                playerId: meta.playerId,
                playerName: data.playerName || `Player ${slotNumber}`,
                carId: data.carId || 'apex_r1',
                carName: data.carName || 'Apex R1',
                isHost: false,
                isReady: false,
                isBot: false,
                x: START_LINE_X[mySlotIdx],
                distanceM: 0,
                speedKmh: 0,
                yaw: 0,
                isNitro: false,
                finished: false,
                finishTimeSec: null,
                finishRank: null,
                lastHornTime: 0,
                lastHornEmoji: '📯',
              };
            }

            meta.roomCode = code;
            ws.send(JSON.stringify({ type: 'room:joined', room, mySlotIndex: mySlotIdx }));
            broadcastToRoom(code, { type: 'room:state', room });
            broadcastRoomList();
            break;
          }

          case 'room:leave': {
            removePlayerFromRoom(ws);
            break;
          }

          case 'room:ready': {
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room) return;
            const slot = room.slots.find((s) => s && s.playerId === meta.playerId);
            if (slot) {
              slot.isReady = Boolean(data.isReady);
              if (data.carId) slot.carId = data.carId;
              if (data.carName) slot.carName = data.carName;
              broadcastToRoom(room.roomCode, { type: 'room:state', room });
            }
            break;
          }

          case 'room:toggle_fill_bots': {
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room || room.hostId !== meta.playerId) return;
            room.fillBotsOnStart = Boolean(data.fillBotsOnStart);
            broadcastToRoom(room.roomCode, { type: 'room:state', room });
            break;
          }

          case 'room:start': {
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room || room.hostId !== meta.playerId) return;

            // Reset & position all slots at Start Line X = -6, -3, 0, 3, 6 and Z = 0 (distanceM = 0)
            for (let i = 0; i < 5; i++) {
              const existing = room.slots[i];
              if (existing && !existing.isBot) {
                existing.slotIndex = i;
                existing.x = START_LINE_X[i];
                existing.distanceM = 0;
                existing.speedKmh = 0;
                existing.yaw = 0;
                existing.isNitro = false;
                existing.finished = false;
                existing.finishTimeSec = null;
                existing.finishRank = null;
              } else if (room.fillBotsOnStart) {
                const botCar = BOT_CARS[i % BOT_CARS.length];
                room.slots[i] = {
                  slotIndex: i,
                  playerId: `bot_slot_${i + 1}`,
                  playerName: `Player ${i + 1}`,
                  carId: botCar.id,
                  carName: botCar.name,
                  isHost: false,
                  isReady: true,
                  isBot: true,
                  x: START_LINE_X[i],
                  distanceM: 0,
                  speedKmh: 0,
                  yaw: 0,
                  isNitro: false,
                  finished: false,
                  finishTimeSec: null,
                  finishRank: null,
                  lastHornTime: 0,
                  lastHornEmoji: '📯',
                };
              } else {
                room.slots[i] = null;
              }
            }

            room.status = 'racing';
            room.raceStartTimeMs = Date.now();
            room.raceElapsedSec = 0;

            broadcastToRoom(room.roomCode, {
              type: 'race:started',
              room,
            });
            broadcastRoomList();
            break;
          }

          case 'room:rematch': {
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room) return;
            room.status = 'lobby';
            room.raceStartTimeMs = null;
            room.raceElapsedSec = 0;
            for (let i = 0; i < 5; i++) {
              const s = room.slots[i];
              if (!s) continue;
              if (s.isBot) {
                room.slots[i] = null;
              } else {
                s.x = START_LINE_X[i];
                s.distanceM = 0;
                s.speedKmh = 0;
                s.yaw = 0;
                s.isNitro = false;
                s.finished = false;
                s.finishTimeSec = null;
                s.finishRank = null;
                s.isReady = s.isHost ? true : false;
              }
            }
            broadcastToRoom(room.roomCode, { type: 'room:state', room });
            broadcastRoomList();
            break;
          }

          case 'player:transform': {
            // PhotonTransformView sync from client for their own car (photonView.IsMine)
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room || room.status !== 'racing') return;
            const slot = room.slots.find((s) => s && s.playerId === meta.playerId);
            if (!slot) return;

            slot.x = typeof data.x === 'number' ? Math.max(-8.5, Math.min(8.5, data.x)) : slot.x;
            slot.distanceM =
              typeof data.distanceM === 'number' ? Math.max(0, Math.min(2050, data.distanceM)) : slot.distanceM;
            slot.speedKmh = typeof data.speedKmh === 'number' ? Math.max(0, data.speedKmh) : slot.speedKmh;
            slot.yaw = typeof data.yaw === 'number' ? data.yaw : slot.yaw;
            slot.isNitro = Boolean(data.isNitro);

            if (!slot.finished && slot.distanceM >= 2000) {
              slot.distanceM = 2000;
              slot.finished = true;
              const elapsedSec = room.raceStartTimeMs ? (Date.now() - room.raceStartTimeMs) / 1000 : 35.0;
              slot.finishTimeSec = +elapsedSec.toFixed(2);
              const finishedCount = room.slots.filter((s) => s && s.finished && s.finishRank !== null).length;
              slot.finishRank = finishedCount + 1;
            }
            break;
          }

          case 'photon:horn_taunt': {
            // Photon Chat Taunt: Voice OFF, only Horn button ("Peeee") + emoji
            if (!meta.roomCode) return;
            const room = rooms.get(meta.roomCode);
            if (!room) return;
            const slot = room.slots.find((s) => s && s.playerId === meta.playerId);
            if (!slot) return;

            const emoji = typeof data.emoji === 'string' ? data.emoji : '📯';
            slot.lastHornTime = Date.now();
            slot.lastHornEmoji = emoji;

            broadcastToRoom(room.roomCode, {
              type: 'photon:horn_taunt',
              playerId: slot.playerId,
              playerName: slot.playerName,
              slotIndex: slot.slotIndex,
              emoji,
              text: data.text || 'Peeee! 📯',
              timestamp: slot.lastHornTime,
            });
            break;
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      removePlayerFromRoom(ws);
      clientMeta.delete(ws);
    });
  });

  // Server-authoritative 20Hz simulation & broadcast loop for active racing rooms
  setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms.entries()) {
      if (room.status !== 'racing' || !room.raceStartTimeMs) continue;

      const dt = 0.05; // 50ms
      room.raceElapsedSec = +((now - room.raceStartTimeMs) / 1000).toFixed(2);

      // Update any filled bot slots so all 5 cars at X = -6, -3, 0, 3, 6 race competitively to 2000m
      const humanSlots = room.slots.filter((s): s is MultiplayerSlot => s !== null && !s.isBot);
      const avgHumanSpeed =
        humanSlots.length > 0
          ? humanSlots.reduce((acc, s) => acc + s.speedKmh, 0) / humanSlots.length
          : 150;

      for (const slot of room.slots) {
        if (!slot || !slot.isBot || slot.finished) continue;

        // Bot accelerates smoothly from start line and weaves slightly within its lane
        const skillFactor = 0.92 + (slot.slotIndex % 3) * 0.05;
        const targetSpeed = Math.min(228, Math.max(115, avgHumanSpeed * skillFactor + Math.sin(room.raceElapsedSec * 0.7 + slot.slotIndex) * 18));
        slot.speedKmh += (targetSpeed - slot.speedKmh) * 1.8 * dt;
        slot.distanceM += (slot.speedKmh / 3.6) * dt;

        const baseLaneX = START_LINE_X[slot.slotIndex];
        const targetX = Math.max(-7.5, Math.min(7.5, baseLaneX + Math.sin(room.raceElapsedSec * 0.8 + slot.slotIndex * 1.7) * 1.1));
        const dx = targetX - slot.x;
        slot.x += dx * 2.5 * dt;
        slot.yaw = -dx * 0.08;
        slot.isNitro = slot.speedKmh > 205;

        // Occasional friendly horn taunt from bot racers
        if (Math.random() < 0.003 && now - slot.lastHornTime > 8000) {
          slot.lastHornTime = now;
          slot.lastHornEmoji = ['📯', '🔥', '⚡', '😎'][slot.slotIndex % 4];
          broadcastToRoom(roomCode, {
            type: 'photon:horn_taunt',
            playerId: slot.playerId,
            playerName: slot.playerName,
            slotIndex: slot.slotIndex,
            emoji: slot.lastHornEmoji,
            text: 'Peeee! 📯',
            timestamp: now,
          });
        }

        if (slot.distanceM >= 2000) {
          slot.distanceM = 2000;
          slot.speedKmh = 0;
          slot.finished = true;
          slot.finishTimeSec = +room.raceElapsedSec.toFixed(2);
          const finishedCount = room.slots.filter((s) => s && s.finished && s.finishRank !== null).length;
          slot.finishRank = finishedCount + 1;
        }
      }

      broadcastToRoom(roomCode, {
        type: 'race:tick',
        raceElapsedSec: room.raceElapsedSec,
        slots: room.slots,
      });
    }
  }, 50);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`City Night Rush Multiplayer Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
