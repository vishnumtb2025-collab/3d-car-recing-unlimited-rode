export interface MultiplayerSlotData {
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
  distanceM: number; // 0 to 2000m (2km)
  speedKmh: number;
  yaw: number;
  isNitro: boolean;
  finished: boolean;
  finishTimeSec: number | null;
  finishRank: number | null;
  lastHornTime: number;
  lastHornEmoji: string;
}

export interface RoomStateData {
  roomCode: string; // 4-digit code like "4829"
  networkMode: 'photon_pun2' | 'nearby_wifi';
  hostId: string;
  maxPlayers: number; // 5
  mapName: string; // "Same Highway (2000m)"
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  fillBotsOnStart: boolean;
  raceStartTimeMs: number | null;
  raceElapsedSec: number;
  slots: (MultiplayerSlotData | null)[]; // length 5
}

export interface PublicRoomSummary {
  roomCode: string;
  networkMode: 'photon_pun2' | 'nearby_wifi';
  playerCount: number;
  maxPlayers: number;
  mapName: string;
}

export interface HornTauntEvent {
  playerId: string;
  playerName: string;
  slotIndex: number;
  emoji: string;
  text: string;
  timestamp: number;
}

export const MULTIPLAYER_START_X = [-6, -3, 0, 3, 6];

type Listener = () => void;
type TauntListener = (evt: HornTauntEvent) => void;

class MultiplayerClientManager {
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private reconnectTimer: number | null = null;
  private localFallbackLoop: number | null = null;

  public playerId: string;
  public playerName: string = 'Player 1';
  public connected: boolean = false;
  public currentRoom: RoomStateData | null = null;
  public publicRooms: PublicRoomSummary[] = [];
  public errorMsg: string | null = null;
  public latestTaunts: Record<number, HornTauntEvent> = {};

  private listeners: Set<Listener> = new Set();
  private tauntListeners: Set<TauntListener> = new Set();

  constructor() {
    const savedId = sessionStorage.getItem('CNR_MP_PLAYER_ID');
    if (savedId) {
      this.playerId = savedId;
    } else {
      this.playerId = `p_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem('CNR_MP_PLAYER_ID', this.playerId);
    }

    const savedName = localStorage.getItem('CNR_MP_PLAYER_NAME');
    if (savedName) {
      this.playerName = savedName;
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.bc = new BroadcastChannel('CNR_MULTIPLAYER_SYNC_V1');
        this.bc.onmessage = (ev) => {
          this.handleIncomingMessage(ev.data, true);
        };
      } catch {
        // Ignore BroadcastChannel errors
      }
    }
  }

  public setPlayerName(name: string) {
    this.playerName = name.trim() || 'Player 1';
    try {
      localStorage.setItem('CNR_MP_PLAYER_NAME', this.playerName);
    } catch {
      // Ignore storage errors
    }
    this.notify();
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws-multiplayer`;
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        this.connected = true;
        this.errorMsg = null;
        this.notify();
      };

      socket.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data));
          this.handleIncomingMessage(parsed, false);
        } catch {
          // Ignore parse errors
        }
      };

      socket.onclose = () => {
        this.connected = false;
        this.notify();
        if (this.reconnectTimer === null) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2000);
        }
      };

      socket.onerror = () => {
        this.connected = false;
      };
    } catch {
      this.connected = false;
    }
  }

  private handleIncomingMessage(data: any, fromBroadcastChannel: boolean) {
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'room:list': {
        this.publicRooms = Array.isArray(data.rooms) ? data.rooms : [];
        this.notify();
        break;
      }
      case 'room:joined':
      case 'room:state':
      case 'race:started': {
        if (data.room) {
          this.currentRoom = data.room;
          this.errorMsg = null;
          this.notify();
        }
        break;
      }
      case 'race:tick': {
        if (this.currentRoom && Array.isArray(data.slots)) {
          this.currentRoom.raceElapsedSec = data.raceElapsedSec ?? this.currentRoom.raceElapsedSec;
          // Update remote slots while preserving smooth local PhotonView.IsMine values
          for (let i = 0; i < 5; i++) {
            const incomingSlot = data.slots[i] as MultiplayerSlotData | null;
            if (!incomingSlot) {
              this.currentRoom.slots[i] = null;
              continue;
            }
            if (incomingSlot.playerId === this.playerId && !fromBroadcastChannel) {
              // Keep our own live position, but sync authoritative finishRank / finishTimeSec if server set it
              const myCur = this.currentRoom.slots[i];
              if (myCur) {
                if (incomingSlot.finishRank !== null) {
                  myCur.finishRank = incomingSlot.finishRank;
                  myCur.finishTimeSec = incomingSlot.finishTimeSec;
                  myCur.finished = true;
                }
              } else {
                this.currentRoom.slots[i] = incomingSlot;
              }
            } else {
              this.currentRoom.slots[i] = incomingSlot;
            }
          }
          this.notify();
        }
        break;
      }
      case 'photon:horn_taunt': {
        const evt: HornTauntEvent = {
          playerId: data.playerId,
          playerName: data.playerName || 'Player',
          slotIndex: typeof data.slotIndex === 'number' ? data.slotIndex : 0,
          emoji: data.emoji || '📯',
          text: data.text || 'Peeee! 📯',
          timestamp: data.timestamp || Date.now(),
        };
        this.latestTaunts[evt.slotIndex] = evt;
        this.tauntListeners.forEach((cb) => cb(evt));
        this.notify();
        break;
      }
      case 'room:error': {
        this.errorMsg = data.message || 'Room error';
        this.notify();
        break;
      }
    }
  }

  private sendRaw(payload: Record<string, unknown>) {
    const withId = { ...payload, playerId: this.playerId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(withId));
      return true;
    }
    return false;
  }

  public createRoom(
    carId: string,
    carName: string,
    networkMode: 'photon_pun2' | 'nearby_wifi' = 'photon_pun2',
    customCode?: string
  ) {
    this.connect();
    const sent = this.sendRaw({
      type: 'room:create',
      roomCode: customCode,
      playerName: this.playerName || 'Player 1',
      carId,
      carName,
      networkMode,
      fillBotsOnStart: true,
    });

    if (!sent) {
      // Fallback immediate room creation if WebSocket is still warming up
      const code = customCode && /^\d{4}$/.test(customCode) ? customCode : String(Math.floor(1000 + Math.random() * 9000));
      const hostSlot: MultiplayerSlotData = {
        slotIndex: 0,
        playerId: this.playerId,
        playerName: this.playerName || 'Player 1',
        carId,
        carName,
        isHost: true,
        isReady: true,
        isBot: false,
        x: MULTIPLAYER_START_X[0],
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
      this.currentRoom = {
        roomCode: code,
        networkMode,
        hostId: this.playerId,
        maxPlayers: 5,
        mapName: 'Same Highway (2000m)',
        status: 'lobby',
        fillBotsOnStart: true,
        raceStartTimeMs: null,
        raceElapsedSec: 0,
        slots: [hostSlot, null, null, null, null],
      };
      this.errorMsg = null;
      this.bc?.postMessage({ type: 'room:state', room: this.currentRoom });
      this.notify();
    }
  }

  public joinRoom(roomCode: string, carId: string, carName: string) {
    this.connect();
    const cleanCode = roomCode.trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      this.errorMsg = 'Please enter a valid 4-digit Room Code (e.g. 4829)!';
      this.notify();
      return;
    }

    const sent = this.sendRaw({
      type: 'room:join',
      roomCode: cleanCode,
      playerName: this.playerName || `Player ${Math.floor(2 + Math.random() * 4)}`,
      carId,
      carName,
    });

    if (!sent && this.currentRoom && this.currentRoom.roomCode === cleanCode) {
      this.notify();
    }
  }

  public leaveRoom() {
    this.stopLocalFallbackLoop();
    this.sendRaw({ type: 'room:leave' });
    this.currentRoom = null;
    this.errorMsg = null;
    this.notify();
  }

  public toggleReady(carId: string, carName: string) {
    if (!this.currentRoom) return;
    const mySlot = this.currentRoom.slots.find((s) => s && s.playerId === this.playerId);
    if (!mySlot) return;
    const nextReady = !mySlot.isReady;
    mySlot.isReady = nextReady;
    mySlot.carId = carId;
    mySlot.carName = carName;
    this.sendRaw({
      type: 'room:ready',
      isReady: nextReady,
      carId,
      carName,
    });
    this.bc?.postMessage({ type: 'room:state', room: this.currentRoom });
    this.notify();
  }

  public toggleFillBots(fillBots: boolean) {
    if (!this.currentRoom) return;
    this.currentRoom.fillBotsOnStart = fillBots;
    this.sendRaw({
      type: 'room:toggle_fill_bots',
      fillBotsOnStart: fillBots,
    });
    this.notify();
  }

  public startRace() {
    if (!this.currentRoom) return;
    const sent = this.sendRaw({ type: 'room:start' });
    if (!sent) {
      // Fallback local start with 5 cars at X = -6, -3, 0, 3, 6
      const botCars = [
        { id: 'apex_r1', name: 'Apex R1' },
        { id: 'vortex_blue', name: 'Vortex Blue' },
        { id: 'nova_yellow', name: 'Nova Yellow' },
        { id: 'pulse_sports', name: 'Pulse GT' },
        { id: 'hyperion_x', name: 'Hyperion X' },
      ];
      for (let i = 0; i < 5; i++) {
        const s = this.currentRoom.slots[i];
        if (s && !s.isBot) {
          s.x = MULTIPLAYER_START_X[i];
          s.distanceM = 0;
          s.speedKmh = 0;
          s.yaw = 0;
          s.finished = false;
          s.finishTimeSec = null;
          s.finishRank = null;
        } else if (this.currentRoom.fillBotsOnStart) {
          this.currentRoom.slots[i] = {
            slotIndex: i,
            playerId: `bot_slot_${i + 1}`,
            playerName: `Player ${i + 1}`,
            carId: botCars[i].id,
            carName: botCars[i].name,
            isHost: false,
            isReady: true,
            isBot: true,
            x: MULTIPLAYER_START_X[i],
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
      }
      this.currentRoom.status = 'racing';
      this.currentRoom.raceStartTimeMs = Date.now();
      this.currentRoom.raceElapsedSec = 0;
      this.startLocalFallbackLoop();
      this.bc?.postMessage({ type: 'race:started', room: this.currentRoom });
      this.notify();
    }
  }

  public requestRematch() {
    this.stopLocalFallbackLoop();
    const sent = this.sendRaw({ type: 'room:rematch' });
    if (!sent && this.currentRoom) {
      this.currentRoom.status = 'lobby';
      for (let i = 0; i < 5; i++) {
        const s = this.currentRoom.slots[i];
        if (s?.isBot) this.currentRoom.slots[i] = null;
        else if (s) {
          s.distanceM = 0;
          s.speedKmh = 0;
          s.finished = false;
          s.finishRank = null;
          s.finishTimeSec = null;
        }
      }
      this.notify();
    }
  }

  public sendTransform(x: number, distanceM: number, speedKmh: number, yaw: number, isNitro: boolean) {
    if (!this.currentRoom || this.currentRoom.status !== 'racing') return;
    const mySlot = this.currentRoom.slots.find((s) => s && s.playerId === this.playerId);
    if (mySlot) {
      mySlot.x = x;
      mySlot.distanceM = distanceM;
      mySlot.speedKmh = speedKmh;
      mySlot.yaw = yaw;
      mySlot.isNitro = isNitro;

      if (!mySlot.finished && distanceM >= 2000) {
        mySlot.distanceM = 2000;
        mySlot.finished = true;
        const elapsed = this.currentRoom.raceStartTimeMs
          ? (Date.now() - this.currentRoom.raceStartTimeMs) / 1000
          : this.currentRoom.raceElapsedSec || 35.0;
        mySlot.finishTimeSec = +elapsed.toFixed(2);
        const alreadyFinished = this.currentRoom.slots.filter(
          (s) => s && s.finished && s.finishRank !== null
        ).length;
        mySlot.finishRank = alreadyFinished + 1;
      }
    }

    this.sendRaw({
      type: 'player:transform',
      x,
      distanceM,
      speedKmh,
      yaw,
      isNitro,
    });
  }

  public sendHornTaunt(emoji: string = '📯', text: string = 'Peeee! 📯') {
    if (!this.currentRoom) return;
    const mySlot = this.currentRoom.slots.find((s) => s && s.playerId === this.playerId);
    const slotIdx = mySlot ? mySlot.slotIndex : 0;
    const sent = this.sendRaw({
      type: 'photon:horn_taunt',
      emoji,
      text,
    });
    if (!sent) {
      const evt: HornTauntEvent = {
        playerId: this.playerId,
        playerName: this.playerName,
        slotIndex: slotIdx,
        emoji,
        text,
        timestamp: Date.now(),
      };
      this.latestTaunts[slotIdx] = evt;
      this.tauntListeners.forEach((cb) => cb(evt));
      this.bc?.postMessage({ type: 'photon:horn_taunt', ...evt });
      this.notify();
    }
  }

  private startLocalFallbackLoop() {
    this.stopLocalFallbackLoop();
    this.localFallbackLoop = window.setInterval(() => {
      if (!this.currentRoom || this.currentRoom.status !== 'racing') return;
      const dt = 0.05;
      this.currentRoom.raceElapsedSec = +(this.currentRoom.raceElapsedSec + dt).toFixed(2);
      const mySlot = this.currentRoom.slots.find((s) => s && s.playerId === this.playerId);
      const refSpeed = mySlot && mySlot.speedKmh > 40 ? mySlot.speedKmh : 155;

      for (const slot of this.currentRoom.slots) {
        if (!slot || !slot.isBot || slot.finished) continue;
        const skillFactor = 0.92 + (slot.slotIndex % 3) * 0.05;
        const targetSpd = Math.min(
          225,
          Math.max(115, refSpeed * skillFactor + Math.sin(this.currentRoom.raceElapsedSec * 0.7 + slot.slotIndex) * 16)
        );
        slot.speedKmh += (targetSpd - slot.speedKmh) * 1.8 * dt;
        slot.distanceM += (slot.speedKmh / 3.6) * dt;
        const baseX = MULTIPLAYER_START_X[slot.slotIndex];
        const targetX = baseX + Math.sin(this.currentRoom.raceElapsedSec * 0.85 + slot.slotIndex) * 1.0;
        slot.x += (targetX - slot.x) * 2.5 * dt;
        slot.yaw = -(targetX - slot.x) * 0.08;
        slot.isNitro = slot.speedKmh > 205;

        if (slot.distanceM >= 2000) {
          slot.distanceM = 2000;
          slot.speedKmh = 0;
          slot.finished = true;
          slot.finishTimeSec = +this.currentRoom.raceElapsedSec.toFixed(2);
          const finishedCount = this.currentRoom.slots.filter((s) => s && s.finished && s.finishRank !== null).length;
          slot.finishRank = finishedCount + 1;
        }
      }
      this.notify();
    }, 50);
  }

  private stopLocalFallbackLoop() {
    if (this.localFallbackLoop !== null) {
      clearInterval(this.localFallbackLoop);
      this.localFallbackLoop = null;
    }
  }

  public subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public onHornTaunt(cb: TauntListener): () => void {
    this.tauntListeners.add(cb);
    return () => this.tauntListeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }
}

export const MultiplayerClient = new MultiplayerClientManager();
