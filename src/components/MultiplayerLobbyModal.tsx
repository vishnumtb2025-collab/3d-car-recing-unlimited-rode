import React, { useEffect, useState } from 'react';
import { CarStatsScriptableObject, PlayerPrefsData } from '../data/carData';
import { SoundEngine } from '../audio/SoundEngine';
import {
  HornTauntEvent,
  MULTIPLAYER_START_X,
  MultiplayerClient,
  PublicRoomSummary,
  RoomStateData,
} from '../multiplayer/MultiplayerClient';

interface MultiplayerLobbyModalProps {
  selectedCar: CarStatsScriptableObject;
  prefs: PlayerPrefsData;
  onClose: () => void;
  onStartMultiplayerRace: (room: RoomStateData) => void;
  onOpenUnityScripts: () => void;
}

const TAUNT_EMOJIS = ['📯', '🔥', '😎', '⚡', '👑'];

export const MultiplayerLobbyModal: React.FC<MultiplayerLobbyModalProps> = ({
  selectedCar,
  onClose,
  onStartMultiplayerRace,
  onOpenUnityScripts,
}) => {
  const [room, setRoom] = useState<RoomStateData | null>(MultiplayerClient.currentRoom);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>(MultiplayerClient.publicRooms);
  const [isConnected, setIsConnected] = useState<boolean>(MultiplayerClient.connected);
  const [errorMsg, setErrorMsg] = useState<string | null>(MultiplayerClient.errorMsg);
  const [playerName, setPlayerName] = useState<string>(MultiplayerClient.playerName);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [customCreateCode, setCustomCreateCode] = useState<string>('4829');
  const [networkMode, setNetworkMode] = useState<'photon_pun2' | 'nearby_wifi'>('photon_pun2');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('📯');
  const [activeTaunts, setActiveTaunts] = useState<Record<number, HornTauntEvent>>({});

  useEffect(() => {
    MultiplayerClient.connect();

    const unsub = MultiplayerClient.subscribe(() => {
      const nextRoom = MultiplayerClient.currentRoom ? { ...MultiplayerClient.currentRoom } : null;
      setRoom(nextRoom);
      setPublicRooms([...MultiplayerClient.publicRooms]);
      setIsConnected(MultiplayerClient.connected);
      setErrorMsg(MultiplayerClient.errorMsg);

      if (nextRoom && nextRoom.status === 'racing') {
        SoundEngine.playStuntBonus();
        onStartMultiplayerRace(nextRoom);
      }
    });

    const unsubTaunt = MultiplayerClient.onHornTaunt((evt) => {
      SoundEngine.playHorn(selectedCar.engineProfile);
      setActiveTaunts((prev) => ({ ...prev, [evt.slotIndex]: evt }));
      window.setTimeout(() => {
        setActiveTaunts((prev) => {
          if (prev[evt.slotIndex]?.timestamp === evt.timestamp) {
            const copy = { ...prev };
            delete copy[evt.slotIndex];
            return copy;
          }
          return prev;
        });
      }, 2600);
    });

    return () => {
      unsub();
      unsubTaunt();
    };
  }, [onStartMultiplayerRace, selectedCar.engineProfile]);

  const handleCreateRoom = () => {
    SoundEngine.playUiClick();
    MultiplayerClient.setPlayerName(playerName);
    const codeToUse = /^\d{4}$/.test(customCreateCode.trim()) ? customCreateCode.trim() : undefined;
    MultiplayerClient.createRoom(selectedCar.id, selectedCar.name, networkMode, codeToUse);
  };

  const handleJoinRoom = (codeOverride?: string) => {
    SoundEngine.playUiClick();
    MultiplayerClient.setPlayerName(playerName);
    const code = (codeOverride ?? joinCodeInput).trim();
    MultiplayerClient.joinRoom(code, selectedCar.id, selectedCar.name);
  };

  const handleToggleReady = () => {
    SoundEngine.playUiClick();
    MultiplayerClient.toggleReady(selectedCar.id, selectedCar.name);
  };

  const handleHornTaunt = () => {
    SoundEngine.playHorn(selectedCar.engineProfile);
    MultiplayerClient.sendHornTaunt(selectedEmoji, `Peeee! ${selectedEmoji}`);
  };

  const handleStartRace = () => {
    SoundEngine.playStuntBonus();
    MultiplayerClient.startRace();
  };

  const mySlot = room?.slots.find((s) => s && s.playerId === MultiplayerClient.playerId) || null;
  const isHost = room ? room.hostId === MultiplayerClient.playerId : false;
  const connectedHumans = room ? room.slots.filter((s) => s !== null && !s.isBot) : [];
  const allHumansReady = connectedHumans.length > 0 && connectedHumans.every((s) => s.isReady);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-backdrop-dim"
      onClick={onClose}
    >
      <div
        className="panel-glass w-full max-w-5xl rounded-2xl border border-sky-400/45 shadow-[0_0_55px_rgba(14,165,233,0.35)] p-3.5 sm:p-5 text-white animate-popup-open max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header — 16:9 Optimized */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center border border-sky-300 shadow-lg">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-base sm:text-xl tracking-wider uppercase text-white">
                  REAL MULTIPLAYER LOBBY (1–5 PLAYERS)
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-hud font-extrabold uppercase ${
                    isConnected
                      ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                      : 'bg-amber-500/25 border border-amber-400/60 text-amber-300'
                  }`}
                >
                  {isConnected ? '● PUN2 / RELAY LIVE' : '● LOCAL / HOTSPOT READY'}
                </span>
              </div>
              <p className="font-hud text-[11px] text-slate-300">
                Max Players: <strong className="text-sky-400">5</strong> · Map:{' '}
                <strong className="text-amber-400">Same Highway (2000m / 2km Finish Line)</strong> ·
                1st Prize: <strong className="text-yellow-300">+5,000 Coins + 👑 Crown</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenUnityScripts}
              className="btn-punch px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 border border-indigo-400/50 font-hud font-bold text-xs text-white cursor-pointer"
            >
              Photon PUN 2 C#
            </button>
            <button
              onClick={onClose}
              className="btn-punch px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/20 font-hud font-bold text-xs text-slate-200 cursor-pointer"
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-3 px-4 py-2 rounded-xl bg-red-600/30 border border-red-400/70 text-red-200 font-hud font-bold text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-white hover:underline ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ==================== IF NOT IN A ROOM: CREATE ROOM OR JOIN ROOM UI ==================== */}
        {!room ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            {/* Left Column: Driver Name + Network Mode + CREATE ROOM */}
            <div className="md:col-span-6 p-4 rounded-xl bg-slate-900/85 border border-white/15 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-black text-sm text-sky-400 uppercase tracking-wider">
                    1. CREATE ROOM (HOST 1–5 PLAYERS)
                  </span>
                  <span className="font-hud text-[11px] text-slate-400">
                    Car: <strong className="text-white">{selectedCar.name}</strong>
                  </span>
                </div>

                {/* Driver Name Input */}
                <div className="mb-2.5">
                  <label className="block font-hud text-[11px] text-slate-300 mb-1">
                    Your Name Tag (Visible Above Car in 16:9 Race):
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={playerName}
                    onChange={(e) => {
                      setPlayerName(e.target.value);
                      MultiplayerClient.setPlayerName(e.target.value);
                    }}
                    placeholder="Player 1"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/20 font-hud font-bold text-sm text-white focus:outline-none focus:border-sky-400"
                  />
                </div>

                {/* Network Engine Mode Toggle: Photon PUN 2 FREE vs Nearby WiFi Hotspot */}
                <div className="mb-2.5">
                  <label className="block font-hud text-[11px] text-slate-300 mb-1">
                    Multiplayer Transport Mode:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setNetworkMode('photon_pun2')}
                      className={`py-2 px-2.5 rounded-lg border font-hud font-bold text-xs text-left cursor-pointer transition-all ${
                        networkMode === 'photon_pun2'
                          ? 'bg-sky-600/35 border-sky-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                          : 'bg-slate-950/70 border-white/15 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-extrabold text-sky-300">Photon PUN 2 FREE</div>
                      <div className="text-[10px] text-slate-300">Room Code + TransformView</div>
                    </button>
                    <button
                      onClick={() => setNetworkMode('nearby_wifi')}
                      className={`py-2 px-2.5 rounded-lg border font-hud font-bold text-xs text-left cursor-pointer transition-all ${
                        networkMode === 'nearby_wifi'
                          ? 'bg-emerald-600/35 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                          : 'bg-slate-950/70 border-white/15 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-extrabold text-emerald-300">Nearby WiFi Hotspot</div>
                      <div className="text-[10px] text-slate-300">Unity Netcode + Relay FREE</div>
                    </button>
                  </div>
                </div>

                {/* 4-Digit Room Code Setup */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-white/10">
                  <div>
                    <span className="block font-hud text-[11px] text-slate-300">
                      4-Digit Room Code (Default 4829):
                    </span>
                    <span className="font-hud text-[10px] text-slate-400">
                      Max Players: 5 · Map: Same Highway (2000m)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={4}
                      value={customCreateCode}
                      onChange={(e) => setCustomCreateCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-20 px-2.5 py-1 rounded bg-slate-900 border border-amber-400/50 font-hud font-black text-base text-amber-400 text-center tracking-widest"
                    />
                    <button
                      onClick={() =>
                        setCustomCreateCode(String(Math.floor(1000 + Math.random() * 9000)))
                      }
                      title="Generate Random 4-Digit Code"
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-hud font-bold text-slate-300 cursor-pointer"
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                className="btn-punch w-full py-3 rounded-xl green-play-btn text-slate-950 font-display font-black text-sm sm:text-base tracking-wider uppercase cursor-pointer shadow-lg"
              >
                [ CREATE ROOM ] (HOST • CODE {customCreateCode || '4829'})
              </button>
            </div>

            {/* Right Column: JOIN ROOM BY 4-DIGIT CODE + ACTIVE ROOMS LIST */}
            <div className="md:col-span-6 p-4 rounded-xl bg-slate-900/85 border border-white/15 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
                    2. JOIN ROOM (ENTER 4-DIGIT CODE)
                  </span>
                  <span className="font-hud text-[11px] text-emerald-400 font-bold">
                    Test with 2–5 Phones!
                  </span>
                </div>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    maxLength={4}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter 4-Digit Code (e.g. 4829)"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border-2 border-amber-400/50 font-hud font-black text-lg text-amber-300 tracking-widest placeholder:text-slate-500 placeholder:text-xs focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => handleJoinRoom()}
                    className="btn-punch px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-display font-black text-sm uppercase tracking-wider cursor-pointer shadow-lg"
                  >
                    [ JOIN ROOM ]
                  </button>
                </div>

                {/* Active Visible Rooms List */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-hud font-bold text-[11px] text-slate-300 uppercase">
                      Visible Lobby Rooms ({publicRooms.length})
                    </span>
                    <span className="font-hud text-[10px] text-slate-400">
                      Click any room to join immediately
                    </span>
                  </div>

                  {publicRooms.length === 0 ? (
                    <div className="py-5 text-center font-hud text-xs text-slate-400">
                      No active rooms yet — click <strong>[ CREATE ROOM ]</strong> on Phone 1, then enter the 4-digit code on Phone 2!
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {publicRooms.map((r) => (
                        <div
                          key={r.roomCode}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-sky-400/30 hover:border-sky-400"
                        >
                          <div>
                            <span className="font-hud font-black text-sm text-amber-400 tracking-wider">
                              ROOM #{r.roomCode}
                            </span>
                            <span className="ml-2 font-hud text-xs text-slate-300">
                              {r.mapName} · {r.playerCount}/{r.maxPlayers} Players
                            </span>
                          </div>
                          <button
                            onClick={() => handleJoinRoom(r.roomCode)}
                            className="btn-punch px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-hud font-extrabold text-xs uppercase cursor-pointer"
                          >
                            JOIN #{r.roomCode}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-indigo-950/50 border border-indigo-400/30 text-[11px] font-hud text-indigo-200 flex items-center justify-between">
                <span>
                  <strong>Start Line Spawn:</strong> X = -6, -3, 0, 3, 6 · <strong>10s Ghost Collision</strong> · <strong>2000m Finish</strong>
                </span>
                <span className="text-amber-300 font-bold">PhotonChat: Horn Only</span>
              </div>
            </div>
          </div>
        ) : (
          /* ==================== WAITING LOBBY: 5 CAR SLOTS + READY BUTTON + HORN TAUNT + HOST START RACE ==================== */
          <div className="space-y-3">
            {/* Room Info Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900/90 border border-sky-400/40">
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/60">
                  <span className="font-hud text-[10px] text-amber-200 uppercase block">
                    ROOM CODE (4-DIGIT)
                  </span>
                  <span className="font-display font-black text-xl text-amber-400 tracking-widest">
                    {room.roomCode}
                  </span>
                </div>

                <div>
                  <div className="font-hud font-bold text-xs sm:text-sm text-white">
                    Map: <span className="text-sky-400">{room.mapName}</span> · Max Players:{' '}
                    <span className="text-emerald-400">5 ({connectedHumans.length}/5 Connected)</span>
                  </div>
                  <div className="font-hud text-[11px] text-slate-300">
                    Start Line Positions: <strong className="text-amber-300">X = -6, -3, 0, 3, 6</strong> (Same Z=0) ·{' '}
                    {room.networkMode === 'photon_pun2'
                      ? 'Photon PUN 2 + PhotonTransformView'
                      : 'Nearby WiFi Hotspot (Unity Netcode + Relay)'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isHost && (
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-white/15 text-xs font-hud cursor-pointer">
                    <input
                      type="checkbox"
                      checked={room.fillBotsOnStart}
                      onChange={(e) => MultiplayerClient.toggleFillBots(e.target.checked)}
                      className="accent-emerald-400"
                    />
                    <span className="text-slate-200">Fill Empty Slots for 5-Car Race</span>
                  </label>
                )}

                <button
                  onClick={() => {
                    SoundEngine.playUiClick();
                    MultiplayerClient.leaveRoom();
                  }}
                  className="btn-punch px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 border border-rose-400/40 font-hud font-bold text-xs text-white cursor-pointer"
                >
                  Leave Room
                </button>
              </div>
            </div>

            {/* 5 Car Slots Grid (16:9 Responsive 5 Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {[0, 1, 2, 3, 4].map((slotIdx) => {
                const slot = room.slots[slotIdx];
                const isMine = slot && slot.playerId === MultiplayerClient.playerId;
                const taunt = activeTaunts[slotIdx];
                const spawnX = MULTIPLAYER_START_X[slotIdx];

                return (
                  <div
                    key={slotIdx}
                    className={`relative p-3 rounded-xl border flex flex-col justify-between min-h-[155px] transition-all ${
                      isMine
                        ? 'bg-sky-950/75 border-2 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]'
                        : slot
                          ? 'bg-slate-900/90 border-emerald-400/50'
                          : 'bg-slate-950/65 border-dashed border-white/20'
                    }`}
                  >
                    {/* Floating Horn Taunt Emoji Bubble */}
                    {taunt && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-hud font-black text-xs shadow-lg animate-bounce whitespace-nowrap">
                        {taunt.text}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-[10px] font-hud text-slate-400 mb-1">
                        <span>SLOT {slotIdx + 1}</span>
                        <span className="text-amber-300 font-bold">X = {spawnX}m</span>
                      </div>

                      {slot ? (
                        <>
                          <div className="font-display font-black text-xs sm:text-sm text-white truncate">
                            {slot.playerName} {isMine ? '(You)' : ''}
                          </div>
                          <div className="font-hud text-[11px] text-sky-300 font-bold truncate mt-0.5">
                            🏎️ {slot.carName}
                          </div>
                          {slot.isHost && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 font-hud font-extrabold text-[9px] text-amber-300 uppercase">
                              👑 ROOM HOST
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="py-3 text-center">
                          <div className="font-hud font-bold text-xs text-slate-400">
                            Empty Slot {slotIdx + 1}
                          </div>
                          <div className="font-hud text-[10px] text-slate-500 mt-0.5">
                            Waiting for Code #{room.roomCode}...
                          </div>
                          {room.fillBotsOnStart && (
                            <div className="mt-1.5 inline-block px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-hud text-slate-300">
                              Auto-Fills Player {slotIdx + 1} at Start
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                      {slot ? (
                        <span
                          className={`w-full py-1 rounded text-center font-hud font-extrabold text-[11px] uppercase ${
                            slot.isReady
                              ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                              : 'bg-amber-500/25 border border-amber-400/60 text-amber-300'
                          }`}
                        >
                          {slot.isReady ? '✓ READY' : 'NOT READY'}
                        </span>
                      ) : (
                        <span className="w-full py-1 rounded bg-slate-900 text-center font-hud text-[10px] text-slate-500 uppercase">
                          OPEN SLOT
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Controls Bar: Photon Chat Horn Taunt (Voice OFF) + READY Button + HOST START RACE */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/95 border border-white/15">
              {/* Photon Chat: Voice OFF, only Horn button ("Peeee") + Emoji */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 rounded bg-slate-800 border border-white/10 font-hud font-bold text-[10px] text-slate-300 uppercase">
                  🔇 Voice: OFF
                </span>
                <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-white/10">
                  {TAUNT_EMOJIS.map((em) => (
                    <button
                      key={em}
                      onClick={() => setSelectedEmoji(em)}
                      className={`w-7 h-7 rounded flex items-center justify-center text-sm cursor-pointer transition-transform ${
                        selectedEmoji === em
                          ? 'bg-amber-500/30 border border-amber-400 scale-110'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleHornTaunt}
                  className="btn-punch px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] cursor-pointer flex items-center gap-1.5"
                >
                  <span>📯 HORN TAUNT ("Peeee!" {selectedEmoji})</span>
                </button>
              </div>

              {/* Ready Button & Host Start Race Button */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleToggleReady}
                  className={`btn-punch px-5 py-2.5 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer ${
                    mySlot?.isReady
                      ? 'bg-emerald-500 text-slate-950 border-2 border-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.6)]'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/25'
                  }`}
                >
                  {mySlot?.isReady ? '✓ READY TO RACE' : 'CLICK TO READY'}
                </button>

                {isHost ? (
                  <button
                    onClick={handleStartRace}
                    className={`btn-punch px-6 py-2.5 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer ${
                      allHumansReady
                        ? 'green-play-btn text-slate-950 border-2 border-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.8)]'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    ▶ START 5-CAR RACE (2000m)
                  </button>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-slate-950 border border-sky-400/40 font-hud font-bold text-xs text-sky-300">
                    Waiting for Host to press START RACE...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
