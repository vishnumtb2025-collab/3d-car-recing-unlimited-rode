import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CAR_ROSTER,
  CameraViewMode,
  CarStatsScriptableObject,
  CarUpgradeLevels,
  PlayerPrefsData,
  getComputedCarStats,
} from '../data/carData';
import { SoundEngine } from '../audio/SoundEngine';
import { buildVehicleMesh } from './CarMeshBuilder';
import {
  HornTauntEvent,
  MULTIPLAYER_START_X,
  MultiplayerClient,
  MultiplayerSlotData,
} from '../multiplayer/MultiplayerClient';

interface HighwayRaceSceneProps {
  car: CarStatsScriptableObject;
  upgrades: CarUpgradeLevels;
  prefs: PlayerPrefsData;
  isMultiplayer?: boolean;
  onUpdatePrefs: (updater: (prev: PlayerPrefsData) => PlayerPrefsData) => void;
  onExitToGarage: () => void;
  onRematchLobby?: () => void;
  onOpenSettings: () => void;
}

interface OpponentTag2D {
  slotIndex: number;
  playerId: string;
  playerName: string;
  carName: string;
  isMine: boolean;
  screenX: number; // percentage 8..92
  screenY: number; // percentage 14..84
  distanceM: number;
  gapM: number;
  speedKmh: number;
  finished: boolean;
  finishRank: number | null;
}

interface TrafficBot {
  id: number;
  mesh: THREE.Group;
  wheels: THREE.Object3D[];
  lane: number; // 0..3 corresponding to [-6, -2, 2, 6]
  targetLane: number;
  x: number;
  z: number;
  vx: number;
  speedKmh: number;
  speedOffset: number; // Random(20, 40) so bot speed = playerSpeed - Random(20, 40)
  massKg: number;
  length: number;
  width: number;
  active: boolean;
  nearMissAwarded: boolean;
}

interface RoadConeItem {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hit: boolean;
}

interface CoinItem {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  collected: boolean;
}

interface SmokeParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

// 4 highway lanes at X = -6, -2, 2, 6 inside 18m road (guardrails at X = -9 and +9)
const LANE_X = [-6, -2, 2, 6];

export const HighwayRaceScene: React.FC<HighwayRaceSceneProps> = ({
  car,
  upgrades,
  prefs,
  isMultiplayer = false,
  onUpdatePrefs,
  onExitToGarage,
  onRematchLobby,
  onOpenSettings,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const computedStats = getComputedCarStats(car, upgrades);

  // Determine initial start line X for Multiplayer (X = -6, -3, 0, 3, 6) vs Single Player (X = 0)
  const initialMySlot = isMultiplayer
    ? MultiplayerClient.currentRoom?.slots.find((s) => s && s.playerId === MultiplayerClient.playerId)
    : null;
  const initialStartX =
    isMultiplayer && initialMySlot ? MULTIPLAYER_START_X[initialMySlot.slotIndex] ?? 0 : 0;

  // HUD Reactive State (Starts at 0 km/h - NO auto accelerate!)
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [gear, setGear] = useState<number>(1);
  const [rpm, setRpm] = useState<number>(1.0); // 0..8.5
  const [distanceKm, setDistanceKm] = useState<number>(isMultiplayer ? 0.0 : 8.3);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(isMultiplayer ? 0 : 252);
  const [nitroCharge, setNitroCharge] = useState<number>(100); // 0..100
  const [isNitroActive, setIsNitroActive] = useState<boolean>(false);
  const [nitroMultiplierHud, setNitroMultiplierHud] = useState<number>(1.0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('chase');
  const [dayMode, setDayMode] = useState<'Day' | 'Night'>(prefs.timeOfDay || 'Day');
  const [stuntBanner, setStuntBanner] = useState<{ title: string; points: string; isAlert?: boolean } | null>(null);
  const [steeringAngleDeg, setSteeringAngleDeg] = useState<number>(0);

  // HUD States
  const [activeIndicator, setActiveIndicator] = useState<'left' | 'right' | null>(null);
  const [indicatorBlinkOn, setIndicatorBlinkOn] = useState<boolean>(false);
  const [manualIndicator, setManualIndicator] = useState<'left' | 'right' | null>(null);
  const [isSlowMo, setIsSlowMo] = useState<boolean>(false);
  const [crashCrackTimer, setCrashCrackTimer] = useState<number>(0);
  const [isDriftingHud, setIsDriftingHud] = useState<boolean>(false);

  // Realistic Accident Out System States
  const [isAccidentHud, setIsAccidentHud] = useState<boolean>(false);
  const [showAccidentOptionsModal, setShowAccidentOptionsModal] = useState<boolean>(false);
  const [redFlashActive, setRedFlashActive] = useState<boolean>(false);
  const [outOfTrackCountdown, setOutOfTrackCountdown] = useState<number | null>(null);
  const [heavyDamageSmokeHud, setHeavyDamageSmokeHud] = useState<boolean>(false);

  // Minimap & Side Mirror state (Only shows cars within 200m ahead)
  const [radarBots, setRadarBots] = useState<{ x: number; z: number; color?: string }[]>([]);
  const [playerXState, setPlayerXState] = useState<number>(initialStartX);
  const [liveTiltSteerHud, setLiveTiltSteerHud] = useState<number>(0);

  // Multiplayer Live Race HUD States (1-5 Rankings, Floating Name Tags, Ghost Mode, Horn Taunts, 2000m Result Modal)
  const [mpStandings, setMpStandings] = useState<MultiplayerSlotData[]>([]);
  const [mpNameTags, setMpNameTags] = useState<OpponentTag2D[]>([]);
  const [mpGhostRemainingSec, setMpGhostRemainingSec] = useState<number>(isMultiplayer ? 10 : 0);
  const [mpRaceFinishedModal, setMpRaceFinishedModal] = useState<boolean>(false);
  const [mpRewardClaimed, setMpRewardClaimed] = useState<boolean>(false);
  const [mpActiveTaunts, setMpActiveTaunts] = useState<Record<number, HornTauntEvent>>({});
  const [mpSelectedTauntEmoji, setMpSelectedTauntEmoji] = useState<string>('📯');

  // Keep latest prefs in ref so 60fps loop always reads live Tilt ON/OFF, Sensitivity (0-100% default 65%), and Calibration Offset
  const prefsRef = useRef<PlayerPrefsData>(prefs);
  prefsRef.current = prefs;

  // Live Input Refs for 60fps loop (accel = false, NO auto gas, NO left drift!)
  const inputRef = useRef({
    left: false,
    right: false,
    accel: false,
    pedalAccel: false,
    brake: false,
    nitro: false,
    horn: false,
    wheelSteerValue: 0, // -1..1
    rawAccelX: 0, // Input.acceleration.x
    rawAccelY: 0, // Input.acceleration.y (used in 16:9 LandscapeLeft: tiltSteer = -rawY * 2.0f)
    tiltSteerValue: 0, // -1..1
  });

  const stateRef = useRef({
    speedKmh: 0, // Car stands still at 0 km/h until GAS (W / Up / Gas Pedal) is pressed
    isControllable: true, // false for 3 sec during accident/out-of-track, then true again
    currentSteer: 0, // smoothed steering value (0 when no input)
    noSteerInputTimer: 0, // Fix 1b: Road center magnet OFF when steering; only active after 2 sec of no steering input
    wallTouchDuration: 0, // Fix 1e: Must touch guardrail for > 0.5 sec at speed > 30 km/h to trigger scrape
    sideWallHitCooldown: 0, // Fix 1e: 3.0 sec cooldown between guardrail scrapes
    mpPlayerCollisionCooldown: 0, // 2.5s cooldown for 10% player-to-player collision damage after 10s ghost period
    mpRaceElapsedSec: 0,
    mpHasFinished: false,
    trafficSpawnTimer: 0, // Fix 2: Every 3 sec check distance to next traffic car ahead
    distanceKm: isMultiplayer ? 0.0 : 8.3,
    playerX: initialStartX,
    playerY: 0, // Always 0 (100% flat road, no jumps/ramps)
    lateralVel: 0,
    yawRate: 0,
    angularDrag: 1.5, // 0.5 during accident spin-out, reset to 1.5 after respawn
    nitroCharge: 100,
    isNitro: false,
    nitroBoostMultiplier: 1.0,
    nitroBurstTimer: 0,
    // Realistic Accident Out System state
    isAccident: false,
    isOutOfTrack: false,
    accidentElapsed: 0,
    accidentStartSpeed: 0,
    spinOutYaw: 0,
    spinOutAngVel: 0,
    slideTargetX: 0,
    bonnetSmokeTimer: 0,
    headlightFlickerTimer: 0,
    accidentTimestamps: [] as number[],
    heavyEngineSmoke: false,
    respawnGraceTimer: 0,
    accidentSpeedPenaltyTimer: 0,
    accidentSlowMoTimer: 0,
    screenShakeTimer: 0,
    screenShakeIntensity: 0.8,
    meshDeformAmount: 0,
    windshieldCracked: false,
    driftCoinTimer: 0,
    steerHoldLeftTimer: 0,
    steerHoldRightTimer: 0,
    indicatorTickTimer: 0,
    indicatorBlinkPhase: false,
    manualIndicator: null as 'left' | 'right' | null,
    isPaused: false,
    cameraMode: 'chase' as CameraViewMode,
    dayMode: prefs.timeOfDay || 'Day',
  });

  stateRef.current.isPaused = isPaused;
  stateRef.current.cameraMode = cameraMode;
  stateRef.current.dayMode = dayMode;
  stateRef.current.manualIndicator = manualIndicator;

  // Timer interval for 04:12 clock
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!stateRef.current.isPaused && !stateRef.current.isAccident) {
        setElapsedSeconds((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') inputRef.current.left = true;
      if (k === 'arrowright' || k === 'd') inputRef.current.right = true;
      if (k === 'arrowup' || k === 'w') inputRef.current.pedalAccel = true;
      if (k === 'arrowdown' || k === 's' || k === ' ') inputRef.current.brake = true;
      if (k === 'shift' || k === 'n') {
        if (!inputRef.current.nitro) triggerNitroBoost();
        inputRef.current.nitro = true;
      }
      if (k === 'h') triggerHorn();
      if (k === 'c') cycleCamera();
      if (k === 'q') setManualIndicator((prev) => (prev === 'left' ? null : 'left'));
      if (k === 'e') setManualIndicator((prev) => (prev === 'right' ? null : 'right'));
      if (k === 'p' || k === 'escape') setIsPaused((p) => !p);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') inputRef.current.left = false;
      if (k === 'arrowright' || k === 'd') inputRef.current.right = false;
      if (k === 'arrowup' || k === 'w') inputRef.current.pedalAccel = false;
      if (k === 'arrowdown' || k === 's' || k === ' ') inputRef.current.brake = false;
      if (k === 'shift' || k === 'n') inputRef.current.nitro = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // 16:9 Landscape (LandscapeLeft) Tilt Sensor Listener:
  // If Tilt = OFF: Input.acceleration = ignore (0), tiltSteerValue = 0
  // If Tilt = ON: float rawX = Input.acceleration.x; float rawY = Input.acceleration.y;
  //               float tiltSteer = -rawY * 2.0f; (left-right ke liye Y use karo, X nahi)
  useEffect(() => {
    if (!prefs.tilt) {
      inputRef.current.rawAccelX = 0;
      inputRef.current.rawAccelY = 0;
      inputRef.current.tiltSteerValue = 0;
      setLiveTiltSteerHud(0);
      return;
    }

    let hasDeviceMotion = false;

    const onDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc && (acc.x !== null || acc.y !== null)) {
        hasDeviceMotion = true;
        // Convert m/s^2 to Unity Input.acceleration g-units (-1..1)
        inputRef.current.rawAccelX = Math.max(-1, Math.min(1, (acc.x ?? 0) / 9.81));
        inputRef.current.rawAccelY = Math.max(-1, Math.min(1, (acc.y ?? 0) / 9.81));
      }
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (hasDeviceMotion) return;
      if (e.beta !== null && e.beta !== undefined) {
        // In 16:9 LandscapeLeft (phone rotated 90 deg), tilting phone left/right changes portrait Y-axis (beta)
        // Phone straight = 0, tilt right = negative rawY -> -rawY * 2.0f > 0 (right), tilt left = positive rawY -> -rawY * 2.0f < 0 (left)
        inputRef.current.rawAccelX = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
        inputRef.current.rawAccelY = Math.max(-1, Math.min(1, -e.beta / 45));
      }
    };

    window.addEventListener('devicemotion', onDeviceMotion);
    window.addEventListener('deviceorientation', onDeviceOrientation);
    return () => {
      window.removeEventListener('devicemotion', onDeviceMotion);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
    };
  }, [prefs.tilt]);

  // Start Engine & Music on mount with car-specific EngineAudioProfile
  useEffect(() => {
    SoundEngine.setConfig(prefs.soundOn, prefs.musicOn, prefs.musicVolume ?? 77);
    SoundEngine.startEngine(car.engineProfile);
    if (prefs.musicOn) SoundEngine.startMusic();
    return () => {
      SoundEngine.stopEngine();
      SoundEngine.stopMusic();
    };
  }, [car.engineProfile, prefs.soundOn, prefs.musicOn, prefs.musicVolume]);

  const showBanner = (title: string, points: string, isAlert = false) => {
    setStuntBanner({ title, points, isAlert });
    window.setTimeout(() => {
      setStuntBanner((curr) => (curr?.title === title ? null : curr));
    }, 2600);
  };

  // 5) Calibration Button: Save current phone position = 0 center so car goes straight even if held slightly tilted in 16:9
  const handleCalibrateTilt = () => {
    SoundEngine.playStuntBonus();
    try {
      const dm = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof dm?.requestPermission === 'function') {
        dm.requestPermission().catch(() => {});
      }
      const doEvt = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof doEvt?.requestPermission === 'function') {
        doEvt.requestPermission().catch(() => {});
      }
    } catch {
      // Ignore on Android/PC
    }
    const currentRawY = Number(inputRef.current.rawAccelY.toFixed(4));
    inputRef.current.tiltSteerValue = 0;
    stateRef.current.currentSteer = 0;
    stateRef.current.lateralVel = 0;
    setLiveTiltSteerHud(0);
    onUpdatePrefs((prev) => ({
      ...prev,
      tiltCalibrationOffsetY: currentRawY,
    }));
    showBanner('TILT CALIBRATED (0 CENTER)', 'CURRENT 16:9 PHONE POSITION SAVED AS STRAIGHT');
  };

  // Option 1 after 3 sec: CONTINUE (pay 1000 coins -> full repair & instant continue)
  const handleContinueFromAccident = () => {
    SoundEngine.playCoinCollect();
    onUpdatePrefs((prev) => ({
      ...prev,
      coins: Math.max(0, prev.coins - 1000),
    }));
    const st = stateRef.current;
    st.isAccident = false;
    st.isControllable = true; // Fix 1: Restore control
    st.isOutOfTrack = false;
    st.accidentElapsed = 0;
    st.angularDrag = 1.5; // Reset angularDrag to 1.5
    st.spinOutYaw = 0;
    st.spinOutAngVel = 0;
    st.lateralVel = 0;
    st.currentSteer = 0;
    st.playerX = 0; // Center road
    st.speedKmh = 50; // Fix 7: Respawn speed 50 km/h
    st.meshDeformAmount = 0; // Full repair when paying 1000 coins
    st.windshieldCracked = false;
    st.heavyEngineSmoke = false;
    st.bonnetSmokeTimer = 0;
    st.respawnGraceTimer = 2.5;

    setIsAccidentHud(false);
    setShowAccidentOptionsModal(false);
    setOutOfTrackCountdown(null);
    setCrashCrackTimer(0);
    setHeavyDamageSmokeHud(false);
    showBanner('REPAIRED & CONTINUED!', '-1,000 COINS • ROAD CENTER 50 KM/H');
  };

  // Fix 7: Respawn on road center (x = 0, rotation = identity, velocity zero, speed 50 km/h, isControllable = true)
  const handleRespawnFromAccident = () => {
    SoundEngine.playUiClick();
    const st = stateRef.current;
    st.isAccident = false;
    st.isControllable = true; // Fix 1: Restore control after 3 sec
    st.isOutOfTrack = false;
    st.accidentElapsed = 0;
    st.angularDrag = 1.5; // Reset angularDrag to 1.5
    st.spinOutYaw = 0;
    st.spinOutAngVel = 0;
    st.lateralVel = 0;
    st.currentSteer = 0;
    st.playerX = 0; // Back to road center (x = 0)
    st.speedKmh = 50; // Fix 7: Speed 50 km/h and continue game
    st.bonnetSmokeTimer = 0;
    st.respawnGraceTimer = 2.5;

    setIsAccidentHud(false);
    setShowAccidentOptionsModal(false);
    setOutOfTrackCountdown(null);
    showBanner('RESPAWNED ON ROAD CENTER', 'SPEED 50 KM/H • CONTINUE RACE');
  };

  // Listen for Photon Chat Horn Taunts ("Peeee! 📯") from other players in Multiplayer
  useEffect(() => {
    if (!isMultiplayer) return;
    const unsubTaunt = MultiplayerClient.onHornTaunt((evt) => {
      if (evt.playerId !== MultiplayerClient.playerId) {
        SoundEngine.playHorn(car.engineProfile);
        showBanner(`${evt.playerName}: "${evt.text}"`, 'PHOTON CHAT HORN TAUNT');
      }
      setMpActiveTaunts((prev) => ({ ...prev, [evt.slotIndex]: evt }));
      window.setTimeout(() => {
        setMpActiveTaunts((prev) => {
          if (prev[evt.slotIndex]?.timestamp === evt.timestamp) {
            const copy = { ...prev };
            delete copy[evt.slotIndex];
            return copy;
          }
          return prev;
        });
      }, 2800);
    });
    return () => {
      unsubTaunt();
    };
  }, [isMultiplayer, car.engineProfile]);

  const triggerHorn = () => {
    inputRef.current.horn = true;
    SoundEngine.playHorn(car.engineProfile);
    if (isMultiplayer) {
      MultiplayerClient.sendHornTaunt(mpSelectedTauntEmoji, `Peeee! ${mpSelectedTauntEmoji}`);
    }
    window.setTimeout(() => {
      inputRef.current.horn = false;
    }, 550);
  };

  // Trigger Blue Flame Exhaust Particles & Brief 1.5x Speed Increase that Dissipates Slowly (Speed Cap 220 km/h base)
  const triggerNitroBoost = () => {
    const st = stateRef.current;
    if (st.isAccident || !st.isControllable || st.nitroCharge <= 5) return;
    st.isNitro = true;
    st.nitroBurstTimer = 1.85; // Brief high-output burst even on a single tap
    st.nitroBoostMultiplier = 1.5; // 1.5x speed increase
    const baseCap = 220;
    const boostedTarget = Math.min(baseCap * 1.5, Math.max((st.speedKmh || 80) * 1.5, 140));
    st.speedKmh = Math.min(baseCap * 1.5, st.speedKmh + (boostedTarget - st.speedKmh) * 0.55);
    showBanner('NITRO 1.5x OVERDRIVE!', 'BLUE EXHAUST FLAMES ENGAGED');
  };

  const cycleCamera = () => {
    SoundEngine.playUiClick();
    const order: CameraViewMode[] = ['chase', 'close', 'hood', 'top'];
    setCameraMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  };

  const toggleDayNight = () => {
    SoundEngine.playUiClick();
    const nextMode = dayMode === 'Day' ? 'Night' : 'Day';
    setDayMode(nextMode);
    onUpdatePrefs((prev) => ({ ...prev, timeOfDay: nextMode }));
  };

  // Main Three.js 60 FPS 16:9 Landscape Highway Simulation
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isDay = dayMode === 'Day';
    const scene = new THREE.Scene();
    const skyColor = isDay ? 0x7dd3fc : 0x091124;
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(skyColor, isDay ? 0.0042 : 0.0055);

    // Fix 1: Camera FOV 75, 16:9 Landscape aspect
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      360
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: prefs.graphicsQuality !== 'Low',
      powerPreference: 'high-performance',
    });
    const maxDpr =
      prefs.graphicsQuality === 'High'
        ? Math.min(window.devicePixelRatio, 2)
        : prefs.graphicsQuality === 'Med'
          ? 1.25
          : 1;
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = prefs.graphicsQuality !== 'Low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDay ? 1.18 : 1.05;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting & Sun Skybox
    const ambientLight = new THREE.AmbientLight(isDay ? 0xe0f2fe : 0x38bdf8, isDay ? 1.1 : 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      isDay ? 0xffffff : 0x60a5fa,
      isDay ? 0x475569 : 0x0f172a,
      isDay ? 1.0 : 0.7
    );
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(isDay ? 0xfffbeb : 0x93c5fd, isDay ? 2.4 : 1.3);
    dirLight.position.set(35, 55, -80);
    dirLight.castShadow = prefs.graphicsQuality !== 'Low';
    dirLight.shadow.mapSize.width = prefs.graphicsQuality === 'High' ? 2048 : 1024;
    dirLight.shadow.mapSize.height = prefs.graphicsQuality === 'High' ? 2048 : 1024;
    scene.add(dirLight);

    // Blazing Sun Disk in Daytime or Moon/City Glow at Night
    const sunDiskGeo = new THREE.SphereGeometry(14, 24, 24);
    const sunDiskMat = new THREE.MeshBasicMaterial({
      color: isDay ? 0xfef08a : 0xe0f2fe,
    });
    const sunDisk = new THREE.Mesh(sunDiskGeo, sunDiskMat);
    sunDisk.position.set(0, isDay ? 58 : 48, -260);
    scene.add(sunDisk);

    // 6-Lane Wet Reflective Asphalt Highway
    const roadWidth = 28;
    const roadLength = 420;
    const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength);
    const roadMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x1e242d : 0x12161f,
      metalness: 0.68,
      roughness: 0.14, // Wet road reflections!
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0, -140);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Wet Road Specular Reflection Strips (simulating sky/neon shimmer on wet asphalt)
    const reflectionGroup = new THREE.Group();
    scene.add(reflectionGroup);
    const shimmerColors = isDay ? [0xbae6fd, 0xfef08a, 0xe0f2fe] : [0xf59e0b, 0x38bdf8, 0xef4444];
    for (let i = 0; i < 18; i++) {
      const sGeo = new THREE.PlaneGeometry(1.2 + (i % 3) * 0.8, 35);
      const sMat = new THREE.MeshBasicMaterial({
        color: shimmerColors[i % shimmerColors.length],
        transparent: true,
        opacity: isDay ? 0.12 : 0.18,
      });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.rotation.x = -Math.PI / 2;
      sMesh.position.set(((i * 7) % 24) - 12, 0.01, -i * 22);
      reflectionGroup.add(sMesh);
    }

    // Highway Concrete Jersey Barriers & Sidewalks
    const barrierMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x94a3b8 : 0x334155,
      roughness: 0.5,
    });
    [-14.4, 14.4].forEach((bx) => {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, roadLength), barrierMat);
      barrier.position.set(bx, 0.55, -140);
      scene.add(barrier);
    });

    // Scrolling Highway Details Group (Dashed Lane Lines, Palm Trees, City Buildings, Streetlights)
    const envSegments: THREE.Group[] = [];
    const segmentLen = 30;
    const numSegments = 13;

    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
    const palmLeafMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x16a34a : 0x065f46,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const createPalmTree = (x: number, z: number) => {
      const palm = new THREE.Group();
      palm.position.set(x, 0, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 6.8, 8), trunkMat);
      trunk.position.y = 3.4;
      trunk.rotation.z = x < 0 ? -0.06 : 0.06;
      palm.add(trunk);

      // 7 radiating palm fronds
      for (let f = 0; f < 7; f++) {
        const angle = (f * Math.PI * 2) / 7;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 2.9), palmLeafMat);
        frond.position.set(Math.sin(angle) * 1.2, 6.7, Math.cos(angle) * 1.2);
        frond.rotation.y = angle;
        frond.rotation.x = 0.35;
        palm.add(frond);
      }
      return palm;
    };

    const buildingPalette = isDay
      ? [0x64748b, 0x94a3b8, 0x475569, 0xcbd5e1, 0x334155]
      : [0x0f172a, 0x1e293b, 0x111827, 0x172554];

    for (let s = 0; s < numSegments; s++) {
      const seg = new THREE.Group();
      seg.position.z = 30 - s * segmentLen;

      // Double yellow center line
      const centerL = new THREE.Mesh(new THREE.PlaneGeometry(0.16, segmentLen), centerLineMat);
      centerL.rotation.x = -Math.PI / 2;
      centerL.position.set(-0.14, 0.02, 0);
      seg.add(centerL);

      const centerR = new THREE.Mesh(new THREE.PlaneGeometry(0.16, segmentLen), centerLineMat);
      centerR.rotation.x = -Math.PI / 2;
      centerR.position.set(0.14, 0.02, 0);
      seg.add(centerR);

      // Dashed white lane dividers for the 6 lanes
      [-8.4, -4.2, 4.2, 8.4].forEach((lx) => {
        for (let d = -10; d <= 10; d += 10) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4.8), dashMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(lx, 0.02, d);
          seg.add(dash);
        }
      });

      // Palm Trees & Streetlamps on both sides
      seg.add(createPalmTree(-16.8, -5));
      seg.add(createPalmTree(16.8, -5));
      seg.add(createPalmTree(-17.2, 10));
      seg.add(createPalmTree(17.2, 10));

      [-15.2, 15.2].forEach((px) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8.5, 8), poleMat);
        pole.position.set(px, 4.25, 0);
        seg.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleMat);
        arm.position.set(px < 0 ? px + 1.1 : px - 1.1, 8.4, 0);
        seg.add(arm);

        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), lampBulbMat);
        bulb.position.set(px < 0 ? px + 2.0 : px - 2.0, 8.32, 0);
        seg.add(bulb);
      });

      // City Skyscrapers on Left & Right
      [-26, 26].forEach((bx, sideIdx) => {
        const bw = 9 + ((s + sideIdx) % 3) * 2.5;
        const bh = 24 + ((s * 7 + sideIdx * 5) % 34);
        const bd = 14;
        const bMat = new THREE.MeshStandardMaterial({
          color: buildingPalette[(s + sideIdx) % buildingPalette.length],
          metalness: 0.45,
          roughness: 0.25,
        });
        const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMat);
        bldg.position.set(bx < 0 ? bx - bw * 0.2 : bx + bw * 0.2, bh / 2, 0);
        seg.add(bldg);

        // Glowing building window bands
        const winMat = new THREE.MeshBasicMaterial({
          color: isDay ? 0xe0f2fe : (s + sideIdx) % 2 === 0 ? 0xfef08a : 0x38bdf8,
        });
        for (let wy = 5; wy < bh - 3; wy += 4.2) {
          const winBand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, bd * 0.82), winMat);
          winBand.position.set(
            bx < 0 ? bldg.position.x + bw / 2 + 0.02 : bldg.position.x - bw / 2 - 0.02,
            wy,
            0
          );
          seg.add(winBand);
        }
      });

      scene.add(seg);
      envSegments.push(seg);
    }

    // Fix 1c: 18m Road Width - Invisible Guardrail Colliders at X = -9 and X = +9 (height = 2, bounciness 0.2, friction 0.8)
    const wallColliderGeo = new THREE.BoxGeometry(0.5, 2.0, 420);
    const wallColliderMat = new THREE.MeshBasicMaterial({ visible: false });
    const leftInvisibleWall = new THREE.Mesh(wallColliderGeo, wallColliderMat);
    leftInvisibleWall.position.set(-9.0, 1.0, -160);
    scene.add(leftInvisibleWall);
    const rightInvisibleWall = new THREE.Mesh(wallColliderGeo, wallColliderMat);
    rightInvisibleWall.position.set(9.0, 1.0, -160);
    scene.add(rightInvisibleWall);

    // Build Player 3D Vehicle (isTrafficBot = false so volumetric headlights & nitro flames are active)
    const playerRig = buildVehicleMesh(car, false);
    playerRig.root.position.set(stateRef.current.playerX, 0, 0);
    scene.add(playerRig.root);

    // ==================== MULTIPLAYER 5-CAR SPAWN AT START LINE (X = -6, -3, 0, 3, 6, SAME Z = 0) & 2000M FINISH ARCH ====================
    const mpOpponentRigs: {
      slotIndex: number;
      rig: ReturnType<typeof buildVehicleMesh>;
    }[] = [];

    // 3D Checkered Finish Line Gantry at 2000m (2km) for Multiplayer
    const finishLineGroup = new THREE.Group();
    if (isMultiplayer) {
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.2 });
      const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), pillarMat);
      leftPillar.position.set(-9.2, 3.75, 0);
      finishLineGroup.add(leftPillar);

      const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), pillarMat);
      rightPillar.position.set(9.2, 3.75, 0);
      finishLineGroup.add(rightPillar);

      const bannerBeam = new THREE.Mesh(
        new THREE.BoxGeometry(19.2, 1.4, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      bannerBeam.position.set(0, 7.1, 0);
      finishLineGroup.add(bannerBeam);

      // Checkered road strip across the 18m highway
      for (let sq = 0; sq < 18; sq++) {
        const sqMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.0, 2.4),
          new THREE.MeshBasicMaterial({ color: sq % 2 === 0 ? 0xffffff : 0x0f172a })
        );
        sqMesh.rotation.x = -Math.PI / 2;
        sqMesh.position.set(-8.5 + sq * 1.0, 0.03, 0);
        finishLineGroup.add(sqMesh);
      }

      finishLineGroup.position.set(0, 0, -2000);
      scene.add(finishLineGroup);

      // Build 3D cars for the other 4 slots at X = -6, -3, 0, 3, 6
      const roomSlots = MultiplayerClient.currentRoom?.slots || [];
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const slotInfo = roomSlots[sIdx];
        if (!slotInfo || slotInfo.playerId === MultiplayerClient.playerId) continue;
        const oppTemplate = CAR_ROSTER.find((c) => c.id === slotInfo.carId) || CAR_ROSTER[sIdx % CAR_ROSTER.length];
        const oppRig = buildVehicleMesh(oppTemplate, false);
        oppRig.root.position.set(MULTIPLAYER_START_X[sIdx], 0, 0);
        scene.add(oppRig.root);
        mpOpponentRigs.push({ slotIndex: sIdx, rig: oppRig });
      }
    }

    // Fix 2: OVERTAKE-ONLY TRAFFIC SYSTEM (Spawn 200m to 400m AHEAD ONLY, NEVER behind!)
    // Lanes: [-6, -2, 2, 6], speed = playerSpeed - Random(20, 40) so player always overtakes them
    const trafficBots: TrafficBot[] = [];
    const botRosterChoices = CAR_ROSTER;

    for (let b = 0; b < 8; b++) {
      const template = botRosterChoices[b % botRosterChoices.length];
      const builtBot = buildVehicleMesh(template, true);
      const laneIdx = b % 4; // [-6, -2, 2, 6]
      // Spawn ONLY 200m to 400m ahead (in Three.js -Z is ahead of player at z=0)
      const startZ = -200 - b * 28 - Math.random() * 15;
      builtBot.root.position.set(LANE_X[laneIdx], 0, startZ);
      scene.add(builtBot.root);

      const botMass =
        template.bodyStyle === 'sedan'
          ? 1400
          : template.massKg || 1480;

      trafficBots.push({
        id: b,
        mesh: builtBot.root,
        wheels: builtBot.wheels,
        lane: laneIdx,
        targetLane: laneIdx,
        x: LANE_X[laneIdx],
        z: startZ,
        vx: 0,
        speedKmh: 0,
        speedOffset: 20 + Math.random() * 20, // Random(20, 40) slower than player
        massKg: botMass,
        length: template.bodyStyle === 'bus' || template.bodyStyle === 'truck' ? 6.8 : 4.6,
        width: 2.1,
        active: true,
        nearMissAwarded: false,
      });
    }

    // Clean Flat Road with Reflective Traffic Cones (All stunt ramps & jumps removed!)
    const roadCones: RoadConeItem[] = [];
    const coneOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.4 });
    const coneStripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coneBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    for (let c = 0; c < 10; c++) {
      const coneGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), coneBaseMat);
      base.position.y = 0.03;
      coneGroup.add(base);

      const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.68, 14), coneOrangeMat);
      body.position.y = 0.37;
      coneGroup.add(body);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 14), coneStripeMat);
      collar.position.y = 0.44;
      coneGroup.add(collar);

      // Place cones along outer shoulder edges (±7.8m) so center lanes stay clear
      const coneX = c % 2 === 0 ? -7.8 : 7.8;
      const coneZ = -60 - c * 38;
      coneGroup.position.set(coneX, 0, coneZ);
      scene.add(coneGroup);

      roadCones.push({
        mesh: coneGroup,
        x: coneX,
        y: 0,
        z: coneZ,
        vx: 0,
        vy: 0,
        vz: 0,
        hit: false,
      });
    }

    // Spawn Collectible Gold Coins on Flat Highway (Lanes: -6, -2, 2, 6)
    const coinsPool: CoinItem[] = [];
    const coinGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.16, 20);
    coinGeo.rotateZ(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.35,
    });

    for (let c = 0; c < 12; c++) {
      const cMesh = new THREE.Mesh(coinGeo, coinMat);
      const laneIdx = c % 4;
      const zPos = -35 - c * 24;
      cMesh.position.set(LANE_X[laneIdx], 0.85, zPos);
      scene.add(cMesh);
      coinsPool.push({
        mesh: cMesh,
        x: LANE_X[laneIdx],
        z: zPos,
        collected: false,
      });
    }

    // Tyre & Accident Smoke Particle Pool
    const smokePool: SmokeParticle[] = [];
    const smokeGeo = new THREE.SphereGeometry(0.34, 8, 8);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.48,
    });
    for (let p = 0; p < 32; p++) {
      const sMesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
      sMesh.visible = false;
      scene.add(sMesh);
      smokePool.push({ mesh: sMesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let smokeIdx = 0;

    const spawnTyreSmoke = (x: number, z: number, isDarkCrashSmoke = false) => {
      const p = smokePool[smokeIdx % smokePool.length];
      smokeIdx++;
      p.mesh.position.set(x + (Math.random() - 0.5) * 0.35, isDarkCrashSmoke ? 0.65 : 0.25, z);
      p.mesh.scale.setScalar(isDarkCrashSmoke ? 0.95 : 0.72);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(isDarkCrashSmoke ? 0x475569 : 0xe2e8f0);
      p.mesh.visible = true;
      p.vx = (Math.random() - 0.5) * 1.8;
      p.vy = 0.9 + Math.random() * 1.1;
      p.vz = 6 + Math.random() * 4;
      p.life = 1.0;
    };

    // Dual Exhaust Blue Flame Particle Pool (Triggered when Nitro button is pressed)
    const nitroFlamePool: SmokeParticle[] = [];
    const blueFlameGeo = new THREE.OctahedronGeometry(0.16, 1);
    blueFlameGeo.scale(0.75, 0.75, 2.2); // Elongated plasma flame streak
    const blueFlameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let nf = 0; nf < 48; nf++) {
      const fMesh = new THREE.Mesh(blueFlameGeo, blueFlameMat.clone());
      fMesh.visible = false;
      scene.add(fMesh);
      nitroFlamePool.push({ mesh: fMesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let nitroFlameIdx = 0;

    // Dynamic Blue Afterburner PointLight behind exhaust pipes
    const exhaustGlowLight = new THREE.PointLight(0x38bdf8, 0, 7.5);
    exhaustGlowLight.position.set(0, 0.45, 2.5);
    scene.add(exhaustGlowLight);

    const spawnExhaustBlueFlame = (exhaustX: number, exhaustY: number, exhaustZ: number, intensity = 1.0) => {
      const fp = nitroFlamePool[nitroFlameIdx % nitroFlamePool.length];
      nitroFlameIdx++;
      fp.mesh.position.set(
        exhaustX + (Math.random() - 0.5) * 0.12,
        exhaustY + (Math.random() - 0.5) * 0.08,
        exhaustZ + Math.random() * 0.25
      );
      const scaleVal = (0.65 + Math.random() * 0.55) * intensity;
      fp.mesh.scale.set(scaleVal, scaleVal, scaleVal * (1.2 + Math.random() * 0.8));
      const mat = fp.mesh.material as THREE.MeshBasicMaterial;
      // Core white-hot cyan to electric blue
      mat.color.setHex(Math.random() < 0.45 ? 0xe0f2fe : Math.random() < 0.75 ? 0x38bdf8 : 0x2563eb);
      mat.opacity = 0.95;
      fp.mesh.visible = true;
      fp.vx = (Math.random() - 0.5) * 1.4;
      fp.vy = (Math.random() - 0.35) * 0.9;
      fp.vz = 14 + Math.random() * 10; // Shoots rapidly backward from dual exhaust pipes
      fp.life = 1.0;
    };

    // Fix 2: Collision Spark & Shattered Glass Particle Pools
    const sparkPool: SparkParticle[] = [];
    const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.38);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let sp = 0; sp < 28; sp++) {
      const spMesh = new THREE.Mesh(sparkGeo, sparkMat);
      spMesh.visible = false;
      scene.add(spMesh);
      sparkPool.push({ mesh: spMesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let sparkIdx = 0;

    const glassPool: SparkParticle[] = [];
    const glassShardGeo = new THREE.TetrahedronGeometry(0.11, 0);
    const glassShardMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.85,
    });
    for (let gp = 0; gp < 20; gp++) {
      const gMesh = new THREE.Mesh(glassShardGeo, glassShardMat);
      gMesh.visible = false;
      scene.add(gMesh);
      glassPool.push({ mesh: gMesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let glassIdx = 0;

    const spawnCrashParticles = (impactX: number, impactZ: number) => {
      // Metallic Sparks
      for (let i = 0; i < 14; i++) {
        const sp = sparkPool[sparkIdx % sparkPool.length];
        sparkIdx++;
        sp.mesh.position.set(impactX + (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.4, impactZ);
        sp.mesh.visible = true;
        sp.vx = (Math.random() - 0.5) * 9;
        sp.vy = 2.5 + Math.random() * 5.5;
        sp.vz = (Math.random() - 0.5) * 8 + 4;
        sp.life = 1.0;
      }
      // Glass Crack / Shatter Shards
      for (let i = 0; i < 10; i++) {
        const gl = glassPool[glassIdx % glassPool.length];
        glassIdx++;
        gl.mesh.position.set(impactX + (Math.random() - 0.5) * 0.9, 0.95 + Math.random() * 0.3, impactZ);
        gl.mesh.visible = true;
        gl.vx = (Math.random() - 0.5) * 6;
        gl.vy = 2.0 + Math.random() * 4.5;
        gl.vz = 3 + Math.random() * 6;
        gl.life = 1.0;
      }
      // Hood Smoke Burst
      for (let i = 0; i < 6; i++) {
        spawnTyreSmoke(impactX, impactZ - 1.2, true);
      }
    };

    // Helper: Spawn Side Wall Scrape Sparks when touching X = ±7.5 road boundary
    const spawnSideWallSparks = (wallX: number) => {
      for (let i = 0; i < 10; i++) {
        const sp = sparkPool[sparkIdx % sparkPool.length];
        sparkIdx++;
        sp.mesh.position.set(wallX, 0.45 + Math.random() * 0.35, (Math.random() - 0.5) * 1.6);
        sp.mesh.visible = true;
        sp.vx = (wallX > 0 ? -1 : 1) * (2.5 + Math.random() * 4.5);
        sp.vy = 1.8 + Math.random() * 3.5;
        sp.vz = 3 + Math.random() * 5;
        sp.life = 0.85;
      }
    };

    // Helper: TriggerAccidentOut (called when hitting traffic at speed > 80 km/h / relVel > 15 m/s, or if |X| > 12)
    const triggerAccidentOut = (
      outOfTrack: boolean,
      otherMassKg: number,
      relVelMps: number,
      pushSideDir: number
    ) => {
      const st = stateRef.current;
      if (st.isAccident || st.respawnGraceTimer > 0) return;

      const nowSec = performance.now() / 1000;
      st.accidentTimestamps = st.accidentTimestamps.filter((t) => nowSec - t <= 30);
      st.accidentTimestamps.push(nowSec);
      if (st.accidentTimestamps.length >= 2) {
        st.heavyEngineSmoke = true;
        setHeavyDamageSmokeHud(true);
      }

      st.isAccident = true;
      st.isControllable = false; // Fix 1: Set isControllable = false for 3 sec, then true again
      st.isOutOfTrack = outOfTrack;
      st.accidentElapsed = 0;
      st.accidentStartSpeed = st.speedKmh;
      st.isNitro = false;
      st.nitroBurstTimer = 0;
      st.nitroBoostMultiplier = 1.0;

      // 3) Set car angularDrag to 0.5 during accident for 180-360 deg spin out
      st.angularDrag = 0.5;
      const spinDir = pushSideDir !== 0 ? pushSideDir : Math.random() < 0.5 ? 1 : -1;
      st.spinOutAngVel = spinDir * (Math.PI * 1.65 + Math.random() * Math.PI * 0.85);
      // Keep slide within the road shoulder (±7.2m inside the ±8m invisible walls)
      st.slideTargetX = spinDir > 0 ? 7.2 : -7.2;

      // 2) Car Damage Visual: Deform front mesh (scale bonnet -0.15 on Z), cracked windshield, headlight flicker 2x
      st.meshDeformAmount = 0.15;
      st.windshieldCracked = true;
      st.headlightFlickerTimer = 0.85;
      st.bonnetSmokeTimer = 5.0;

      // 1) Camera shake intensity 0.8 for 1 sec + slow motion Time.timeScale = 0.3 for 1 sec
      st.screenShakeTimer = 1.0;
      st.screenShakeIntensity = 0.8;
      st.accidentSlowMoTimer = 1.0;

      SoundEngine.playAccidentOutCrash();
      spawnCrashParticles(st.playerX, -1.6);

      setRedFlashActive(true);
      window.setTimeout(() => setRedFlashActive(false), 500);

      setIsAccidentHud(true);
      setShowAccidentOptionsModal(false);
      setCrashCrackTimer(999);
      setOutOfTrackCountdown(3);

      if (prefs.vibrationOn && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([180, 60, 140, 50, 180]);
      }

      if (outOfTrack) {
        showBanner('OUT OF TRACK! Returning in 3..2..1', 'AUTO RESPAWN TO ROAD CENTER (50 KM/H)', true);
      } else {
        const impactForceMag = Math.round(otherMassKg * relVelMps * 0.8);
        onUpdatePrefs((prev) => ({
          ...prev,
          coins: Math.max(0, prev.coins - 500),
        }));
        showBanner('ACCIDENT! -500 COINS', `IMPACT FORCE: ${(impactForceMag / 1000).toFixed(1)} kN • AUTO RESPAWN IN 3s`, true);
      }
    };

    let animId = 0;
    const clock = new THREE.Clock();
    let uiSyncTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const rawDt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      if (stateRef.current.isPaused) {
        renderer.render(scene, camera);
        return;
      }

      const inp = inputRef.current;
      const st = stateRef.current;

      if (st.respawnGraceTimer > 0) {
        st.respawnGraceTimer = Math.max(0, st.respawnGraceTimer - rawDt);
      }
      if (st.sideWallHitCooldown > 0) {
        st.sideWallHitCooldown = Math.max(0, st.sideWallHitCooldown - rawDt);
      }

      // Slow motion Time.timeScale = 0.3 for 1 sec on Accident Out, then back to 1.0
      let timeScale = 1.0;
      if (st.accidentSlowMoTimer > 0) {
        st.accidentSlowMoTimer = Math.max(0, st.accidentSlowMoTimer - rawDt);
        timeScale = 0.3;
      }
      const dt = rawDt * timeScale;

      // ==================== FIX 1 & TILT 16:9 LANDSCAPE: ZERO AUTO-LEFT & TILT ON/OFF LOGIC ====================
      const livePrefs = prefsRef.current;
      const steerSensMultiplier = (livePrefs.steeringSensitivity || 85) / 85;

      let rawSteer = 0;
      let noHorizontalInput = true;

      if (livePrefs.tilt) {
        // 1) If Tilt = ON: steerInput = tiltSteer ONLY (buttons/wheel hidden), 16:9 LandscapeLeft mapping use karo
        // 2) 16:9 Tilt Mapping (LandscapeLeft):
        //    float rawX = Input.acceleration.x;
        //    float rawY = Input.acceleration.y;
        //    float tiltSteer = -rawY * 2.0f; // left-right ke liye Y use karo, X nahi
        const rawX = inp.rawAccelX;
        void rawX; // X ignored in 16:9 LandscapeLeft
        const calibratedRawY = inp.rawAccelY - (livePrefs.tiltCalibrationOffsetY ?? 0);
        let tiltSteer = -calibratedRawY * 2.0;
        tiltSteer = THREE.MathUtils.clamp(tiltSteer, -1.0, 1.0);

        // Dead zone 0.12f taaki halke hilne par left na jaye:
        if (Math.abs(tiltSteer) < 0.12) {
          tiltSteer = 0;
        }

        // 3) Tilt Sensitivity 0-100% (default 65%): tiltSteer = tiltSteer * (sensitivity / 50f)
        const sensitivity = livePrefs.tiltSensitivity ?? 65;
        tiltSteer = THREE.MathUtils.clamp(tiltSteer * (sensitivity / 50.0), -1.0, 1.0);
        inp.tiltSteerValue = tiltSteer;

        noHorizontalInput = tiltSteer === 0;
        if (!noHorizontalInput && st.isControllable && !st.isAccident) {
          rawSteer = tiltSteer; // steerInput = tiltSteer ONLY
        }
      } else {
        // 1) If Tilt = OFF: steerInput = buttonSteer ONLY, Input.acceleration = ignore (0)
        inp.rawAccelX = 0;
        inp.rawAccelY = 0;
        inp.tiltSteerValue = 0;

        const hasArrowInput = inp.left || inp.right;
        const hasWheelInput = Math.abs(inp.wheelSteerValue) > 0.12;
        noHorizontalInput = !hasArrowInput && !hasWheelInput;

        if (!noHorizontalInput && st.isControllable && !st.isAccident) {
          if (inp.left) rawSteer -= 1;
          if (inp.right) rawSteer += 1;
          if (hasWheelInput) rawSteer += inp.wheelSteerValue * steerSensMultiplier;
          rawSteer = THREE.MathUtils.clamp(rawSteer, -1.0, 1.0);
          if (Math.abs(rawSteer) < 0.1) rawSteer = 0;
        }
      }

      // b) Track how long player has NOT steered (road center magnet OFF when steering; only active after 2 sec of no input)
      if (noHorizontalInput || rawSteer === 0) {
        rawSteer = 0;
        st.noSteerInputTimer += rawDt;
      } else {
        st.noSteerInputTimer = 0;
      }

      // Require speed > 10 km/h for steering
      const targetSteer = rawSteer === 0 || st.speedKmh <= 10 || !st.isControllable ? 0 : rawSteer;
      if (targetSteer === 0 && noHorizontalInput) {
        // Snap cleanly to 0 when no steering input so car goes 100% STRAIGHT
        st.currentSteer = THREE.MathUtils.lerp(st.currentSteer, 0, Math.min(1, dt * 10.0));
        if (Math.abs(st.currentSteer) < 0.01) st.currentSteer = 0;
      } else {
        st.currentSteer = THREE.MathUtils.lerp(st.currentSteer, targetSteer, dt * 3.0);
      }
      const steerInput = st.currentSteer;

      // Auto Turn Indicator when steering left/right > 0.5 for 1.0 sec (with tick-tock sound)
      if (rawSteer < -0.5 && st.speedKmh > 10) {
        st.steerHoldLeftTimer += rawDt;
        st.steerHoldRightTimer = 0;
      } else if (rawSteer > 0.5 && st.speedKmh > 10) {
        st.steerHoldRightTimer += rawDt;
        st.steerHoldLeftTimer = 0;
      } else {
        st.steerHoldLeftTimer = Math.max(0, st.steerHoldLeftTimer - rawDt * 2);
        st.steerHoldRightTimer = Math.max(0, st.steerHoldRightTimer - rawDt * 2);
      }

      const currentTurnSignal: 'left' | 'right' | null = st.isAccident
        ? 'left'
        : st.manualIndicator ||
          (st.steerHoldLeftTimer >= 1.0
            ? 'left'
            : st.steerHoldRightTimer >= 1.0
              ? 'right'
              : Math.abs(rawSteer) > 0.45 && st.speedKmh > 10
                ? rawSteer < 0
                  ? 'left'
                  : 'right'
                : null);

      if (currentTurnSignal) {
        st.indicatorTickTimer += rawDt;
        if (st.indicatorTickTimer >= 0.36) {
          st.indicatorTickTimer = 0;
          st.indicatorBlinkPhase = !st.indicatorBlinkPhase;
          if (!st.isAccident) {
            SoundEngine.playIndicatorTick(st.indicatorBlinkPhase);
          }
        }
      } else {
        st.indicatorBlinkPhase = false;
        st.indicatorTickTimer = 0;
      }

      // Blink 3D orange indicator LEDs on player car
      playerRig.leftIndicators.forEach((m) => {
        m.visible = (currentTurnSignal === 'left' || st.isAccident) && st.indicatorBlinkPhase;
      });
      playerRig.rightIndicators.forEach((m) => {
        m.visible = (currentTurnSignal === 'right' || st.isAccident) && st.indicatorBlinkPhase;
      });

      // Headlight flicker 2 times on accident impact
      if (st.headlightFlickerTimer > 0) {
        st.headlightFlickerTimer = Math.max(0, st.headlightFlickerTimer - rawDt);
        const phase = st.headlightFlickerTimer;
        const beamOn = !((phase > 0.55 && phase < 0.72) || (phase > 0.2 && phase < 0.38));
        playerRig.headlightBeams.forEach((hb) => {
          hb.visible = beamOn;
        });
      } else {
        playerRig.headlightBeams.forEach((hb) => {
          hb.visible = true;
        });
      }

      // ==================== ACCIDENT OUT SPIN-OUT vs NORMAL CONTROLLABLE DRIVING ====================
      const maxSteer = 28;
      // Steer Angle formula: steerAngle = maxSteer * input * (1 - speed / 250)
      const speedSteerFactor = Math.max(0.15, 1 - st.speedKmh / 250);
      const steerAngleDegComputed = maxSteer * steerInput * speedSteerFactor;
      let isDrifting = false;
      let slipRatio = 0;

      if (st.isAccident) {
        st.accidentElapsed += rawDt;

        // Reduce speed to 0 over 1.5 sec with Lerp
        const lerpT = Math.min(1.0, st.accidentElapsed / 1.5);
        st.speedKmh = THREE.MathUtils.lerp(st.accidentStartSpeed, 0, lerpT);

        // Spin 180-360 deg with angularDrag = 0.5 & slide inside [-8, 8] road boundary
        st.spinOutYaw += st.spinOutAngVel * rawDt;
        st.spinOutAngVel *= Math.pow(1 - st.angularDrag * 0.45, rawDt * 3.2);

        st.playerX = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(st.playerX, st.slideTargetX, rawDt * 2.4),
          -8.0,
          8.0
        );
        st.playerY = 0;

        playerRig.root.rotation.y = st.spinOutYaw;
        playerRig.bodyGroup.rotation.z = Math.sin(st.accidentElapsed * 9) * 0.06 * (1 - lerpT);
        playerRig.bodyGroup.rotation.x = 0.04 * (1 - lerpT);

        // After 3 sec, automatically respawn on road center (x = 0, speed = 50 km/h, isControllable = true) and continue game!
        const remaining = Math.max(0, Math.ceil(3.0 - st.accidentElapsed));
        setOutOfTrackCountdown(remaining);
        if (st.accidentElapsed >= 3.0) {
          handleRespawnFromAccident();
        }
      } else {
        // ==================== NO AUTO ACCELERATE, BRAKE = 5000, SPEED CAP = 220 KM/H ====================
        const motorInput = st.isControllable && inp.pedalAccel ? 1.0 : 0.0;
        const brakeTorque = inp.brake ? 5000 : 0;

        if (st.accidentSpeedPenaltyTimer > 0) {
          st.accidentSpeedPenaltyTimer = Math.max(0, st.accidentSpeedPenaltyTimer - rawDt);
        }

        // Nitro 1.5x Boost & Slow Dissipation
        if (st.isControllable && inp.nitro && st.nitroCharge > 5) {
          st.isNitro = true;
          st.nitroBoostMultiplier = 1.5;
        } else if (st.isControllable && st.nitroBurstTimer > 0 && st.nitroCharge > 0) {
          st.nitroBurstTimer = Math.max(0, st.nitroBurstTimer - rawDt);
          st.isNitro = true;
          st.nitroBoostMultiplier = 1.5;
        } else {
          st.isNitro = false;
          if (st.nitroBoostMultiplier > 1.0) {
            st.nitroBoostMultiplier = Math.max(1.0, st.nitroBoostMultiplier - 0.14 * rawDt);
          }
        }

        const speedLimitCap = 220 * st.nitroBoostMultiplier;
        const motorTorque =
          brakeTorque > 0 || st.speedKmh >= speedLimitCap ? 0 : motorInput * 2850;

        if (st.isNitro) {
          st.nitroCharge = Math.max(0, st.nitroCharge - (100 / computedStats.nitroDuration) * dt);
          st.speedKmh = Math.min(speedLimitCap, st.speedKmh + computedStats.acceleration * 14.5 * dt);
        } else {
          st.nitroCharge = Math.min(100, st.nitroCharge + 4.5 * dt);

          if (brakeTorque > 0) {
            st.speedKmh = Math.max(0, st.speedKmh - (brakeTorque / 30) * dt);
            st.nitroBoostMultiplier = Math.max(1.0, st.nitroBoostMultiplier - 0.45 * dt);
          } else if (motorTorque > 0) {
            const effectiveCap = st.accidentSpeedPenaltyTimer > 0 ? 220 * 0.5 : 220;
            if (st.speedKmh < effectiveCap) {
              st.speedKmh = Math.min(effectiveCap, st.speedKmh + computedStats.acceleration * 6.8 * dt);
            } else {
              st.speedKmh = Math.max(effectiveCap, st.speedKmh - 18 * dt);
            }
          } else {
            // No input = motorInput = 0, car slowly stops with drag down to 0 km/h
            st.speedKmh = Math.max(0, st.speedKmh - 22.0 * dt);
          }
        }

        // Aerodynamic downforce = velocity * 7
        const forwardMpsTemp = st.speedKmh / 3.6;
        const downforceN = forwardMpsTemp * 7.0;
        const downforceGripBonus = 1.0 + Math.min(0.25, downforceN / 2200);

        isDrifting =
          st.speedKmh > 80 &&
          ((inp.brake && Math.abs(steerInput) > 0.25) || (Math.abs(steerInput) > 0.82 && st.speedKmh > 95));

        // Lateral velocity from smoothed steerAngle (0 when noHorizontalInput so car goes 100% straight!)
        const speedTurnAuthority = st.speedKmh > 10 ? Math.min(1.0, (st.speedKmh - 10) / 35) : 0;
        const targetLatVel =
          noHorizontalInput && Math.abs(steerInput) < 0.02
            ? 0
            : (steerAngleDegComputed / maxSteer) *
              (computedStats.handling * 1.15) *
              downforceGripBonus *
              speedTurnAuthority;

        st.lateralVel = THREE.MathUtils.lerp(
          st.lateralVel,
          targetLatVel,
          dt * (noHorizontalInput ? 14.0 : isDrifting ? 3.5 : 8.0)
        );
        if (noHorizontalInput && Math.abs(st.lateralVel) < 0.03) {
          st.lateralVel = 0;
        }

        // Fix 1b: Road center magnet OFF when player steering: ONLY apply center force if no input for 2 sec and |carX| > 5
        if (st.noSteerInputTimer >= 2.0 && Math.abs(st.playerX) > 5.0 && st.speedKmh > 5) {
          const centeringAccel = ((-st.playerX * 50) / (car.massKg || 1550)) * 5.0;
          st.lateralVel += centeringAccel * dt;
        }

        const nextX = st.playerX + st.lateralVel * dt;

        // Fix 1c, 1d, 1e: Road width 18m (guardrails at -9 and +9), smooth clamp to [-8, 8]
        // Only trigger scrape if speed > 30 and touching boundary for > 0.5 sec, with 3 sec cooldown!
        if (Math.abs(nextX) >= 7.95) {
          const clampedTarget = THREE.MathUtils.clamp(nextX, -8.0, 8.0);
          st.playerX = THREE.MathUtils.lerp(nextX, clampedTarget, Math.min(1, dt * 15));
          st.playerX = THREE.MathUtils.clamp(st.playerX, -8.0, 8.0);
          st.lateralVel = 0;

          if (st.speedKmh > 30) {
            st.wallTouchDuration += rawDt;
            if (st.wallTouchDuration > 0.5 && st.sideWallHitCooldown <= 0) {
              st.sideWallHitCooldown = 3.0; // 3 sec cooldown
              st.wallTouchDuration = 0;
              st.speedKmh *= 0.7; // Reduce speed by 30%
              spawnSideWallSparks(st.playerX);
              SoundEngine.playCrash(0.45);
              showBanner('GUARDRAIL SCRAPE! -30% SPEED', 'STEER AWAY FROM GUARDRAIL', true);
            }
          } else {
            st.wallTouchDuration = 0;
          }
        } else {
          st.playerX = nextX;
          st.wallTouchDuration = Math.max(0, st.wallTouchDuration - rawDt * 2);
        }

        // Award "DRIFT +50" score & coins while drifting at speed > 80 km/h
        if (isDrifting && st.speedKmh > 80) {
          st.driftCoinTimer += rawDt;
          if (st.driftCoinTimer >= 0.85) {
            st.driftCoinTimer = 0;
            SoundEngine.playCoinCollect();
            onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + 50 }));
            showBanner('DRIFT +50', 'COUNTER-STEER DRIFT BONUS');
          }
        } else {
          st.driftCoinTimer = Math.max(0, st.driftCoinTimer - rawDt);
        }

        // Fix 3: 100% Flat Road (No jump / barrel roll / airborne physics)
        st.playerY = 0;
        const targetYaw = -steerInput * (isDrifting ? 0.28 : 0.1) * speedTurnAuthority;
        const targetRoll = steerInput * (isDrifting ? 0.08 : 0.05) * speedTurnAuthority;
        const targetPitch = inp.brake && st.speedKmh > 2 ? 0.05 : st.isNitro ? -0.04 : inp.pedalAccel ? -0.022 : 0;

        playerRig.root.rotation.y += (targetYaw - playerRig.root.rotation.y) * 10 * dt;
        playerRig.bodyGroup.rotation.z += (targetRoll - playerRig.bodyGroup.rotation.z) * 10 * dt;
        playerRig.bodyGroup.rotation.x += (targetPitch - playerRig.bodyGroup.rotation.x) * 10 * dt;
      }

      const forwardMetersPerSec = st.speedKmh / 3.6;
      st.distanceKm += (forwardMetersPerSec * dt) / 1000;

      // 2) CAR DAMAGE VISUAL: Deform front mesh (scale bonnet -0.15 on Z when damaged)
      playerRig.bodyGroup.scale.set(
        1 + st.meshDeformAmount * 0.35,
        1 - st.meshDeformAmount * 0.2,
        1 - st.meshDeformAmount
      );

      // Ground lock (100% flat road at Y = 0)
      playerRig.root.position.set(st.playerX, 0, 0);

      // Continuous 5-sec Engine Bonnet Smoke + Bumper Sparks during Accident OR continuous Heavy Damage Smoke (2x in 30s)
      if (st.bonnetSmokeTimer > 0) {
        st.bonnetSmokeTimer = Math.max(0, st.bonnetSmokeTimer - rawDt);
        if (Math.random() < 0.65) {
          spawnTyreSmoke(st.playerX + (Math.random() - 0.5) * 0.5, -1.65, true);
        }
        if (Math.random() < 0.45) {
          const sp = sparkPool[sparkIdx % sparkPool.length];
          sparkIdx++;
          sp.mesh.position.set(st.playerX + (Math.random() - 0.5) * 0.9, 0.45, -2.1);
          sp.mesh.visible = true;
          sp.vx = (Math.random() - 0.5) * 6;
          sp.vy = 1.8 + Math.random() * 3.5;
          sp.vz = 2 + Math.random() * 5;
          sp.life = 0.8;
        }
      } else if (st.heavyEngineSmoke && Math.random() < 0.45) {
        spawnTyreSmoke(st.playerX + (Math.random() - 0.5) * 0.4, -1.65, true);
      }

      // Rotate wheels & front wheel steering knuckles
      const wheelSpin = forwardMetersPerSec * dt * 2.6;
      playerRig.wheels.forEach((w) => {
        w.rotation.x -= wheelSpin;
      });
      const steerRad = THREE.MathUtils.degToRad(steerAngleDegComputed);
      playerRig.frontWheels.forEach((fw) => {
        fw.rotation.y = -steerRad;
      });

      // Brake lights, Nitro Exhaust Cones, Blue Flame Exhaust Particle Stream & Rear Tyre Drift Smoke
      playerRig.brakeLights.forEach((bl) => {
        bl.visible = inp.brake || st.isAccident;
      });
      const nitroAfterburnerIntensity = st.isNitro
        ? 1.0
        : Math.max(0, (st.nitroBoostMultiplier - 1.0) / 0.5);

      playerRig.nitroFlames.forEach((nf) => {
        nf.visible = nitroAfterburnerIntensity > 0.08 && !st.isAccident;
        if (nf.visible) {
          const pulse = 0.85 + Math.sin(elapsed * 55) * 0.35;
          nf.scale.set(
            1.15 * nitroAfterburnerIntensity,
            pulse * (0.7 + 0.65 * nitroAfterburnerIntensity),
            1.15 * nitroAfterburnerIntensity
          );
        }
      });

      // Emit Blue Flame Particle Effects from Left & Right Exhaust Pipes when Nitro is active or dissipating
      if (nitroAfterburnerIntensity > 0.05 && !st.isAccident) {
        const particlesPerFrame = st.isNitro ? 2 : Math.random() < nitroAfterburnerIntensity ? 1 : 0;
        for (let b = 0; b < particlesPerFrame; b++) {
          spawnExhaustBlueFlame(st.playerX - 0.48, 0.34, 2.22, nitroAfterburnerIntensity);
          spawnExhaustBlueFlame(st.playerX + 0.48, 0.34, 2.22, nitroAfterburnerIntensity);
        }
        exhaustGlowLight.position.set(st.playerX, 0.45, 2.55);
        exhaustGlowLight.intensity = (2.8 + Math.sin(elapsed * 48) * 0.9) * nitroAfterburnerIntensity;
      } else {
        exhaustGlowLight.intensity = 0;
      }

      // Update Blue Flame Exhaust Particles
      nitroFlamePool.forEach((fp) => {
        if (fp.life > 0) {
          fp.life -= rawDt * 4.2;
          fp.mesh.position.x += fp.vx * rawDt;
          fp.mesh.position.y += fp.vy * rawDt;
          fp.mesh.position.z += fp.vz * rawDt;
          fp.mesh.scale.multiplyScalar(1 - rawDt * 1.4);
          const mat = fp.mesh.material as THREE.MeshBasicMaterial;
          if (fp.life < 0.45) {
            mat.color.setHex(0x1d4ed8);
          } else if (fp.life < 0.75) {
            mat.color.setHex(0x0ea5e9);
          }
          mat.opacity = Math.max(0, fp.life * 0.92);
          if (fp.life <= 0) fp.mesh.visible = false;
        }
      });

      slipRatio = st.isAccident
        ? 0.9
        : isDrifting
          ? 0.75
          : inp.brake && st.speedKmh > 70
            ? 0.48
            : Math.abs(steerInput) * (st.speedKmh / 220) * 0.45;

      if ((isDrifting || slipRatio > 0.4) && st.speedKmh > 25) {
        spawnTyreSmoke(st.playerX - 0.9, 1.4, false);
        spawnTyreSmoke(st.playerX + 0.9, 1.4, false);
      }

      // Update Tyre Smoke, Crash Sparks & Glass Shards
      smokePool.forEach((p) => {
        if (p.life > 0) {
          p.life -= rawDt * 2.0;
          p.mesh.position.x += p.vx * rawDt;
          p.mesh.position.y += p.vy * rawDt;
          p.mesh.position.z += p.vz * rawDt;
          p.mesh.scale.addScalar(rawDt * 2.4);
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 0.48);
          if (p.life <= 0) p.mesh.visible = false;
        }
      });

      sparkPool.forEach((sp) => {
        if (sp.life > 0) {
          sp.life -= rawDt * 3.0;
          sp.vy -= 18 * rawDt;
          sp.mesh.position.x += sp.vx * rawDt;
          sp.mesh.position.y = Math.max(0.05, sp.mesh.position.y + sp.vy * rawDt);
          sp.mesh.position.z += sp.vz * rawDt;
          if (sp.life <= 0) sp.mesh.visible = false;
        }
      });

      glassPool.forEach((gl) => {
        if (gl.life > 0) {
          gl.life -= rawDt * 2.4;
          gl.vy -= 16 * rawDt;
          gl.mesh.position.x += gl.vx * rawDt;
          gl.mesh.position.y = Math.max(0.05, gl.mesh.position.y + gl.vy * rawDt);
          gl.mesh.position.z += gl.vz * rawDt;
          gl.mesh.rotation.x += rawDt * 12;
          gl.mesh.rotation.y += rawDt * 9;
          if (gl.life <= 0) gl.mesh.visible = false;
        }
      });

      // 5. Scroll Endless Environment Segments & Traffic Cones ONLY when car moves (forwardMetersPerSec)
      const totalEnvLength = numSegments * segmentLen;
      envSegments.forEach((seg) => {
        seg.position.z += forwardMetersPerSec * dt;
        if (seg.position.z > 45) {
          seg.position.z -= totalEnvLength;
        }
      });

      reflectionGroup.children.forEach((c) => {
        c.position.z += forwardMetersPerSec * dt;
        if (c.position.z > 30) {
          c.position.z -= 380;
        }
      });

      // Update Traffic Cones along road edges
      roadCones.forEach((cone) => {
        cone.z += (forwardMetersPerSec + cone.vz) * dt;
        if (cone.hit) {
          cone.x += cone.vx * dt;
          cone.y = Math.max(0, cone.y + cone.vy * dt);
          cone.vy -= 18 * dt;
          cone.mesh.rotation.x += dt * 8;
          cone.mesh.rotation.z += dt * 6;
        } else if (st.speedKmh > 5 && Math.abs(cone.z) < 2.1 && Math.abs(cone.x - st.playerX) < 1.35) {
          cone.hit = true;
          cone.vx = (cone.x >= st.playerX ? 1 : -1) * (5 + Math.random() * 4);
          cone.vy = 3.5;
          cone.vz = -forwardMetersPerSec * 0.4;
        }
        cone.mesh.position.set(cone.x, cone.y, cone.z);

        if (cone.z > 28) {
          cone.hit = false;
          cone.x = Math.random() < 0.5 ? -7.8 : 7.8;
          cone.y = 0;
          cone.z = -320 - Math.random() * 60;
          cone.vx = 0;
          cone.vy = 0;
          cone.vz = 0;
          cone.mesh.rotation.set(0, 0, 0);
        }
      });

      // ==================== FIX 2: REMOVE REAR CAR TRAFFIC - ONLY 200M TO 400M AHEAD OVERTAKE TRAFFIC ====================
      // - Every 3 sec, check distance to next traffic car; if > 150m, spawn new car ahead 200m-400m in random lane (-6, -2, 2, 6)
      // - Traffic cars direction = SAME as player, speed = playerSpeed - Random(20, 40) so player always overtakes them
      // - NEVER spawn behind, and never move backward into player from behind!
      // - When traffic car is 100m behind player (bot.z > 100), Despawn it!
      st.trafficSpawnTimer += rawDt;
      if (st.trafficSpawnTimer >= 3.0) {
        st.trafficSpawnTimer = 0;
        const inactiveBot = trafficBots.find((b) => !b.active);
        // Find closest spawned car near -200m ahead
        const activeAheadZs = trafficBots.filter((b) => b.active && b.z < 0).map((b) => Math.abs(b.z));
        const furthestAheadDist = activeAheadZs.length > 0 ? Math.max(...activeAheadZs) : 0;
        if (inactiveBot && (activeAheadZs.length < 6 || furthestAheadDist > 150)) {
          const randLaneIdx = Math.floor(Math.random() * 4); // [-6, -2, 2, 6]
          inactiveBot.lane = randLaneIdx;
          inactiveBot.targetLane = randLaneIdx;
          inactiveBot.x = LANE_X[randLaneIdx];
          inactiveBot.vx = 0;
          inactiveBot.z = -200 - Math.random() * 200; // 200m to 400m AHEAD ONLY
          inactiveBot.speedOffset = 20 + Math.random() * 20; // Random(20, 40)
          inactiveBot.nearMissAwarded = false;
          inactiveBot.active = true;
          inactiveBot.mesh.visible = true;
        }
      }

      const playerMass = car.massKg || 1550;

      trafficBots.forEach((bot) => {
        if (!bot.active) return;

        // Traffic car speed = playerSpeed - Random(20, 40) (clamped >= 0), so player ALWAYS overtakes traffic and traffic NEVER hits from behind!
        bot.speedKmh = st.speedKmh > 5 ? Math.max(0, st.speedKmh - bot.speedOffset) : 0;
        const overtakeClosingMps = st.speedKmh > 5 ? Math.max(0, (st.speedKmh - bot.speedKmh) / 3.6) : 0;
        bot.z += overtakeClosingMps * dt;

        // When Horn is pressed, traffic cars ahead give way smoothly
        if (inp.horn && bot.z < -2 && bot.z > -85 && Math.abs(bot.x - st.playerX) < 3.2) {
          bot.targetLane = bot.lane < 2 ? Math.min(3, bot.lane + 1) : Math.max(0, bot.lane - 1);
        }

        const targetX = LANE_X[bot.targetLane];
        bot.x += (targetX - bot.x) * 3.5 * dt + bot.vx * dt;
        bot.vx *= Math.pow(0.15, dt);
        if (Math.abs(targetX - bot.x) < 0.15 && Math.abs(bot.vx) < 0.2) {
          bot.lane = bot.targetLane;
        }

        bot.mesh.position.set(bot.x, 0, bot.z);
        bot.wheels.forEach((w) => {
          w.rotation.x -= (bot.speedKmh / 3.6) * dt * 2.2;
        });

        // Check Overtake Collision or Near-Miss ONLY when player is moving forward and overtaking a car ahead/alongside
        if (
          !st.isAccident &&
          st.speedKmh > 15 &&
          st.respawnGraceTimer <= 0 &&
          bot.z >= -(bot.length * 0.5 + 1.85) &&
          bot.z <= bot.length * 0.5 + 1.2
        ) {
          const dx = Math.abs(bot.x - st.playerX);
          const edgeClearanceMeters = Math.max(0, dx - 1.65);

          if (dx < 1.65) {
            const preImpactSpeed = st.speedKmh;
            const relVelMag = Math.max(10, (st.speedKmh - bot.speedKmh) / 3.6);
            const pushDir = bot.x >= st.playerX ? 1 : -1;

            const impactForce = bot.massKg * relVelMag * 0.8;
            const massRatio = playerMass / Math.max(1000, bot.massKg);
            bot.vx = pushDir * Math.min(12, (impactForce / playerMass) * 0.45 * massRatio);
            bot.targetLane = Math.max(0, Math.min(3, bot.lane + pushDir));
            bot.z -= 12.0; // Push traffic car ahead on front impact
            bot.nearMissAwarded = false;

            if (preImpactSpeed > 80 || relVelMag > 15) {
              triggerAccidentOut(false, bot.massKg, Math.max(16, relVelMag), -pushDir);
            } else {
              st.meshDeformAmount = 0.1;
              st.accidentSpeedPenaltyTimer = 1.5;
              st.screenShakeTimer = 0.5;
              st.screenShakeIntensity = 0.3;
              st.speedKmh = Math.max(0, preImpactSpeed * 0.5);
              spawnCrashParticles((st.playerX + bot.x) * 0.5, -1.5);
              SoundEngine.playCrash(1.0);
              showBanner('FENDER IMPACT!', 'WATCH YOUR LANE', true);
            }
          } else if (edgeClearanceMeters < 1.5 && !bot.nearMissAwarded && st.speedKmh > 100) {
            bot.nearMissAwarded = true;
            SoundEngine.playCoinCollect();
            onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + 250 }));
            showBanner('NEAR MISS OVERTAKE!', '+250 COINS');
          }
        }

        // Fix 2: When traffic car is 100m behind player (player passed it), Despawn it - NEVER let it chase or hit from behind!
        if (bot.z > 100) {
          bot.active = false;
          bot.mesh.visible = false;
          // Immediately queue respawn 200m to 400m AHEAD if needed
          const randLaneIdx = Math.floor(Math.random() * 4);
          bot.lane = randLaneIdx;
          bot.targetLane = randLaneIdx;
          bot.x = LANE_X[randLaneIdx];
          bot.vx = 0;
          bot.z = -200 - Math.random() * 200;
          bot.speedOffset = 20 + Math.random() * 20;
          bot.nearMissAwarded = false;
          bot.active = true;
          bot.mesh.visible = true;
        }
      });

      // 8. Update Collectible Coins (Lanes: -6, -2, 2, 6)
      coinsPool.forEach((c) => {
        c.z += forwardMetersPerSec * dt;
        c.mesh.position.set(c.x, 0.85, c.z);
        c.mesh.rotation.y += rawDt * 3.5;

        if (!c.collected && !st.isAccident && Math.abs(c.z) < 2.2 && Math.abs(c.x - st.playerX) < 1.9) {
          c.collected = true;
          c.mesh.visible = false;
          SoundEngine.playCoinCollect();
          onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + 100 }));
        }

        if (c.z > 25) {
          const laneIdx = Math.floor(Math.random() * 4);
          c.x = LANE_X[laneIdx];
          c.z = -200 - Math.random() * 80;
          c.collected = false;
          c.mesh.visible = true;
        }
      });

      // 9. Camera FOV 75 + Screen Shake
      const targetFov = st.isNitro ? 82 : 75 + (st.speedKmh / 220) * 4;
      camera.fov += (targetFov - camera.fov) * 6 * dt;
      camera.updateProjectionMatrix();

      let shakeOffsetX = 0;
      let shakeOffsetY = 0;
      if (st.screenShakeTimer > 0) {
        st.screenShakeTimer = Math.max(0, st.screenShakeTimer - rawDt);
        const shakeIntensity = st.screenShakeIntensity * Math.min(1, st.screenShakeTimer);
        shakeOffsetX = (Math.random() - 0.5) * 2 * shakeIntensity;
        shakeOffsetY = (Math.random() - 0.5) * 2 * shakeIntensity;
      }

      if (st.cameraMode === 'chase') {
        camera.position.x += (st.playerX * 0.82 - camera.position.x) * 8 * dt + shakeOffsetX;
        camera.position.y += (2.25 - camera.position.y) * 8 * dt + shakeOffsetY;
        camera.position.z += (5.85 - (st.isNitro ? 0.55 : 0) - camera.position.z) * 8 * dt;
        camera.lookAt(st.playerX * 0.92 + shakeOffsetX, 0.95 + shakeOffsetY, -12);
      } else if (st.cameraMode === 'close') {
        camera.position.set(st.playerX * 0.9 + shakeOffsetX, 1.65 + shakeOffsetY, 4.2);
        camera.lookAt(st.playerX, 0.9, -18);
      } else if (st.cameraMode === 'hood') {
        camera.position.set(st.playerX + shakeOffsetX, 1.18 + shakeOffsetY, -0.65);
        camera.lookAt(st.playerX + steerInput * 1.5, 1.05, -25);
      } else {
        camera.position.set(st.playerX * 0.7 + shakeOffsetX, 13.5, 9.5);
        camera.lookAt(st.playerX, 0, -10);
      }

      // Compute Gear (1..7) and RPM
      const computedGear =
        st.speedKmh < 5 ? 1 : Math.min(7, Math.max(1, Math.ceil((st.speedKmh / 220) * 7)));
      const gearSpan = 220 / 7;
      const withinGear = (st.speedKmh % gearSpan) / gearSpan;
      const maxRpmGauge = car.engineProfile === 'v12_ferrari' ? 8.5 : 7.9;
      const computedRpm =
        st.isAccident || st.speedKmh < 1
          ? 1.0
          : Math.min(maxRpmGauge, Math.max(1.1, 1.6 + withinGear * 5.6 + (st.isNitro ? 0.9 : 0)));
      const rpmNumeric = computedRpm * 1000;
      const throttleAmt =
        st.isAccident || !st.isControllable
          ? 0.05
          : st.isNitro
            ? 1.0
            : inp.pedalAccel
              ? 0.95
              : 0.08;

      SoundEngine.updateEngineRpm(
        st.speedKmh,
        220,
        computedGear,
        isDrifting,
        st.isNitro,
        slipRatio,
        throttleAmt,
        rpmNumeric
      );

      // ==================== MULTIPLAYER PHOTONTRANSFORMVIEW SYNC, 10s GHOST COLLISION & 2000M WIN SYSTEM ====================
      if (isMultiplayer) {
        st.mpRaceElapsedSec += rawDt;
        if (st.mpPlayerCollisionCooldown > 0) {
          st.mpPlayerCollisionCooldown = Math.max(0, st.mpPlayerCollisionCooldown - rawDt);
        }

        const myDistanceM = Math.min(2000, st.distanceKm * 1000);

        // Check if local player reached 2000m (2.0 km) Finish Line!
        if (!st.mpHasFinished && myDistanceM >= 2000) {
          st.mpHasFinished = true;
          st.distanceKm = 2.0;
          st.speedKmh = 0;
          SoundEngine.playStuntBonus();
        }

        // Send local player's PhotonTransformView state (photonView.IsMine)
        MultiplayerClient.sendTransform(
          st.playerX,
          myDistanceM,
          st.speedKmh,
          playerRig.root.rotation.y,
          st.isNitro
        );

        // Position 2000m Finish Line Gantry relative to local player
        finishLineGroup.position.z = -(2000 - myDistanceM);

        // First 10 seconds = Ghost Collision between real players (No piche se accident bug!)
        const isGhostCollisionPeriod = st.mpRaceElapsedSec < 10.0;

        const roomSlots = MultiplayerClient.currentRoom?.slots || [];
        mpOpponentRigs.forEach(({ slotIndex, rig }) => {
          const slotData = roomSlots[slotIndex];
          if (!slotData) {
            rig.root.visible = false;
            return;
          }
          rig.root.visible = true;

          // Relative Z in Three.js (-Z is ahead of local player, +Z is behind)
          const relZ = -(slotData.distanceM - myDistanceM);
          rig.root.position.x = THREE.MathUtils.lerp(rig.root.position.x, slotData.x, Math.min(1, rawDt * 12));
          rig.root.position.z = THREE.MathUtils.lerp(rig.root.position.z, relZ, Math.min(1, rawDt * 12));
          rig.root.rotation.y = THREE.MathUtils.lerp(rig.root.rotation.y, slotData.yaw || 0, Math.min(1, rawDt * 10));

          const oppWheelSpin = (slotData.speedKmh / 3.6) * dt * 2.5;
          rig.wheels.forEach((w) => {
            w.rotation.x -= oppWheelSpin;
          });
          rig.nitroFlames.forEach((nf) => {
            nf.visible = Boolean(slotData.isNitro);
          });

          // After 10s Ghost period: enable player-to-player collision with ONLY 10% speed damage (no rear-end spinout!)
          if (
            !isGhostCollisionPeriod &&
            !st.isAccident &&
            !st.mpHasFinished &&
            st.mpPlayerCollisionCooldown <= 0 &&
            Math.abs(relZ) < 3.8 &&
            Math.abs(rig.root.position.x - st.playerX) < 1.65
          ) {
            st.mpPlayerCollisionCooldown = 2.5;
            st.speedKmh = Math.max(25, st.speedKmh * 0.9); // Only 10% speed damage!
            const pushSide = st.playerX >= rig.root.position.x ? 1.1 : -1.1;
            st.playerX = THREE.MathUtils.clamp(st.playerX + pushSide, -8.0, 8.0);
            spawnSideWallSparks((st.playerX + rig.root.position.x) * 0.5);
            SoundEngine.playCrash(0.4);
            showBanner(`BUMPED ${slotData.playerName.toUpperCase()}!`, '-10% SPEED (PLAYER COLLISION)', true);
          }
        });
      }

      // Sync React HUD at ~18Hz (Fix 2: Only show traffic cars within 200m ahead on minimap!)
      uiSyncTimer += rawDt;
      if (uiSyncTimer > 0.055) {
        uiSyncTimer = 0;
        setSpeedKmh(Math.round(st.speedKmh));
        setGear(computedGear);
        setRpm(computedRpm);
        setDistanceKm(+st.distanceKm.toFixed(2));
        setNitroCharge(Math.round(st.nitroCharge));
        setIsNitroActive(st.isNitro || st.nitroBoostMultiplier > 1.04);
        setNitroMultiplierHud(+st.nitroBoostMultiplier.toFixed(2));
        setPlayerXState(st.playerX);
        setActiveIndicator(currentTurnSignal);
        setIndicatorBlinkOn(st.indicatorBlinkPhase);
        setIsSlowMo(st.accidentSlowMoTimer > 0);
        setIsDriftingHud(isDrifting);
        setLiveTiltSteerHud(livePrefs.tilt ? +inp.tiltSteerValue.toFixed(2) : 0);
        if (!st.windshieldCracked) {
          setCrashCrackTimer((prev) => Math.max(0, prev - 0.055));
        }
        setRadarBots(
          trafficBots
            .filter((b) => b.active && b.z <= 0 && b.z >= -200)
            .map((b) => ({ x: b.x, z: b.z }))
        );

        if (isMultiplayer && MultiplayerClient.currentRoom) {
          const myDistM = Math.min(2000, st.distanceKm * 1000);
          setMpGhostRemainingSec(Math.max(0, Math.ceil(10.0 - st.mpRaceElapsedSec)));

          const activeSlots = MultiplayerClient.currentRoom.slots.filter(
            (s): s is MultiplayerSlotData => s !== null
          );
          const sortedStandings = [...activeSlots].sort((a, b) => {
            if (a.finished && b.finished) {
              return (a.finishRank || 99) - (b.finishRank || 99);
            }
            if (a.finished) return -1;
            if (b.finished) return 1;
            return b.distanceM - a.distanceM;
          });
          setMpStandings(sortedStandings);

          // Project 3D world positions to 16:9 screen coordinates so Name Tags are ALWAYS visible
          const tags: OpponentTag2D[] = activeSlots.map((s) => {
            const isMine = s.playerId === MultiplayerClient.playerId;
            const worldX = isMine ? st.playerX : s.x;
            const relZ = isMine ? 0 : -(s.distanceM - myDistM);
            const vec = new THREE.Vector3(worldX, 2.35, THREE.MathUtils.clamp(relZ, -95, 18));
            vec.project(camera);

            const sx = THREE.MathUtils.clamp((vec.x * 0.5 + 0.5) * 100, 12, 88);
            const sy = isMine
              ? 64
              : relZ > 6
                ? 82 // Behind local player -> show cleanly near bottom edge
                : THREE.MathUtils.clamp((-vec.y * 0.5 + 0.5) * 100, 16, 76);

            return {
              slotIndex: s.slotIndex,
              playerId: s.playerId,
              playerName: s.playerName,
              carName: s.carName,
              isMine,
              screenX: sx,
              screenY: sy,
              distanceM: Math.round(s.distanceM),
              gapM: Math.round(s.distanceM - myDistM),
              speedKmh: Math.round(s.speedKmh),
              finished: s.finished,
              finishRank: s.finishRank,
            };
          });
          setMpNameTags(tags);

          if (st.mpHasFinished) {
            setMpRaceFinishedModal(true);
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [car, computedStats.topSpeedKmh, computedStats.acceleration, computedStats.handling, computedStats.nitroDuration, dayMode, prefs.graphicsQuality, isMultiplayer]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Interactive Steering Wheel Drag Handler
  const handleWheelMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const dx = (e.clientX - centerX) / (rect.width / 2);
    const clamped = Math.max(-1, Math.min(1, dx));
    inputRef.current.wheelSteerValue = clamped;
    setSteeringAngleDeg(clamped * 75);
  };

  const resetWheel = () => {
    inputRef.current.wheelSteerValue = 0;
    setSteeringAngleDeg(0);
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* 3D WebGL Highway Canvas */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Speed Nitro Vignette Overlay */}
      {isNitroActive && (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_rgba(56,189,248,0.55)] transition-opacity duration-150" />
      )}

      {/* 1) RED Flash Screen Overlay (0.5 sec on Accident Out) */}
      {redFlashActive && (
        <div className="pointer-events-none absolute inset-0 z-40 bg-red-600/45 mix-blend-screen animate-pulse" />
      )}

      {/* 2) Cracked Windshield Texture & Impact Vignette */}
      {crashCrackTimer > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          <div className="absolute inset-0 shadow-[inset_0_0_95px_rgba(239,68,68,0.65)]" />
          <svg viewBox="0 0 1920 1080" className="w-full h-full opacity-80">
            <g stroke="rgba(224,242,254,0.88)" strokeWidth="2.6" fill="none">
              {/* Spiderweb Cracked Windshield Left & Right */}
              <path d="M420,520 L310,390 M420,520 L560,410 M420,520 L490,660 M420,520 L260,580 M420,520 L390,320 M420,520 L620,540" />
              <circle cx="420" cy="520" r="38" strokeWidth="1.8" />
              <circle cx="420" cy="520" r="85" strokeWidth="1.4" strokeDasharray="12 6" />
              <circle cx="420" cy="520" r="145" strokeWidth="1.1" strokeDasharray="18 8" />
              <path d="M1480,460 L1610,350 M1480,460 L1370,380 M1480,460 L1540,590 M1480,460 L1340,510 M1480,460 L1450,290" />
              <circle cx="1480" cy="460" r="45" strokeWidth="1.6" />
              <circle cx="1480" cy="460" r="98" strokeWidth="1.2" strokeDasharray="14 6" />
            </g>
          </svg>
        </div>
      )}

      {/* 1 & 5) Center Accident Out / Out of Track Popup */}
      {isAccidentHud && !showAccidentOptionsModal && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 -translate-y-1/2 z-30 flex flex-col items-center">
          <div className="px-7 py-4 rounded-2xl bg-gradient-to-b from-red-700/95 via-red-900/95 to-slate-950/95 border-2 border-red-400 shadow-[0_0_50px_rgba(239,68,68,0.9)] flex flex-col items-center gap-1.5 text-center">
            {outOfTrackCountdown !== null ? (
              <>
                <span className="font-display font-black text-2xl sm:text-4xl text-white tracking-wider">
                  OUT OF TRACK!
                </span>
                <span className="font-hud font-extrabold text-base sm:text-xl text-yellow-300 tracking-widest">
                  Returning in {outOfTrackCountdown}..{Math.max(0, outOfTrackCountdown - 1)}..{Math.max(0, outOfTrackCountdown - 2)}
                </span>
              </>
            ) : (
              <>
                <span className="font-display font-black text-2xl sm:text-4xl text-white tracking-wider">
                  ACCIDENT! -500 COINS
                </span>
                <span className="font-hud font-bold text-xs sm:text-sm text-amber-300 tracking-widest uppercase">
                  SPIN OUT • BONNET DEFORMED (-0.15 Z) • ANGULAR DRAG 0.5
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== FIX 8: DUAL SIDE VIEW MIRRORS (REAR-VIEW RENDERTEXTURE UI) ==================== */}
      {/* Left Side Wing Mirror */}
      <div className="pointer-events-none absolute top-16 left-48 sm:left-52 z-20 hidden md:flex flex-col items-start">
        <div className="relative w-36 h-16 rounded-tl-2xl rounded-tr-lg rounded-bl-lg rounded-br-2xl bg-[#0b111e]/90 border-[2.5px] border-slate-400/70 shadow-[0_6px_20px_rgba(0,0,0,0.85)] overflow-hidden">
          <svg viewBox="0 0 140 64" className="w-full h-full">
            {/* Rear Sky & Horizon */}
            <rect width="140" height="24" fill={dayMode === 'Day' ? '#38bdf8' : '#0f172a'} />
            <rect y="24" width="140" height="40" fill="#1e293b" />
            {/* Rear Perspective Highway Lane Lines */}
            <line x1="70" y1="24" x2="20" y2="64" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1="70" y1="24" x2="70" y2="64" stroke="#eab308" strokeWidth="1.8" />
            <line x1="70" y1="24" x2="120" y2="64" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
            {/* Rear Traffic Cars in Left Lanes */}
            {radarBots
              .filter((b) => b.x <= playerXState + 2 && b.z > -80 && b.z < 28)
              .slice(0, 3)
              .map((b, idx) => {
                const depthRatio = Math.max(0.15, Math.min(1, (b.z + 80) / 105));
                const cx = 70 + (b.x - playerXState) * 6;
                const cy = 26 + depthRatio * 30;
                const w = 8 + depthRatio * 12;
                const h = 5 + depthRatio * 7;
                return (
                  <g key={`lm-${idx}`}>
                    <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="1.5" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1" />
                    <circle cx={cx - w * 0.3} cy={cy + 1} r="1.3" fill="#fef08a" />
                    <circle cx={cx + w * 0.3} cy={cy + 1} r="1.3" fill="#fef08a" />
                  </g>
                );
              })}
          </svg>
          {/* Mirror Blind-Spot & Turn Indicator LED */}
          {activeIndicator === 'left' && indicatorBlinkOn && (
            <div className="absolute top-1.5 left-1.5 w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
          )}
          <span className="absolute bottom-0.5 left-2 font-hud text-[8px] font-bold tracking-widest text-white/70 uppercase">
            LEFT MIRROR • REAR
          </span>
        </div>
      </div>

      {/* Right Side Wing Mirror */}
      <div className="pointer-events-none absolute top-16 right-20 sm:right-24 z-20 hidden md:flex flex-col items-end">
        <div className="relative w-36 h-16 rounded-tr-2xl rounded-tl-lg rounded-br-lg rounded-bl-2xl bg-[#0b111e]/90 border-[2.5px] border-slate-400/70 shadow-[0_6px_20px_rgba(0,0,0,0.85)] overflow-hidden">
          <svg viewBox="0 0 140 64" className="w-full h-full">
            <rect width="140" height="24" fill={dayMode === 'Day' ? '#38bdf8' : '#0f172a'} />
            <rect y="24" width="140" height="40" fill="#1e293b" />
            <line x1="70" y1="24" x2="20" y2="64" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1="70" y1="24" x2="70" y2="64" stroke="#eab308" strokeWidth="1.8" />
            <line x1="70" y1="24" x2="120" y2="64" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
            {/* Rear Traffic Cars in Right Lanes */}
            {radarBots
              .filter((b) => b.x >= playerXState - 2 && b.z > -80 && b.z < 28)
              .slice(0, 3)
              .map((b, idx) => {
                const depthRatio = Math.max(0.15, Math.min(1, (b.z + 80) / 105));
                const cx = 70 + (b.x - playerXState) * 6;
                const cy = 26 + depthRatio * 30;
                const w = 8 + depthRatio * 12;
                const h = 5 + depthRatio * 7;
                return (
                  <g key={`rm-${idx}`}>
                    <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="1.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1" />
                    <circle cx={cx - w * 0.3} cy={cy + 1} r="1.3" fill="#fef08a" />
                    <circle cx={cx + w * 0.3} cy={cy + 1} r="1.3" fill="#fef08a" />
                  </g>
                );
              })}
          </svg>
          {activeIndicator === 'right' && indicatorBlinkOn && (
            <div className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
          )}
          <span className="absolute bottom-0.5 right-2 font-hud text-[8px] font-bold tracking-widest text-white/70 uppercase">
            REAR • RIGHT MIRROR
          </span>
        </div>
      </div>

      {/* ==================== TOP LEFT: DISTANCE + TIME PILL & CIRCULAR MINI-MAP ==================== */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2.5">
        {/* Distance + Time Bar (Exact match to Image 2, shows 2000m finish target in Multiplayer) */}
        <div className="flex items-center gap-5 px-4 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 shadow-xl">
          <div className="flex items-center gap-2">
            {/* Map Pin Icon */}
            <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
            </svg>
            <span className="font-hud font-bold text-sm sm:text-base tracking-wide text-white uppercase">
              {isMultiplayer ? 'RACE 2KM' : 'DISTANCE'}
            </span>
            <span className="font-hud font-bold text-lg sm:text-2xl text-[#84cc16] tabular-nums">
              {isMultiplayer
                ? `${Math.min(2000, Math.round(distanceKm * 1000))} / 2000m`
                : `${distanceKm.toFixed(1)} km`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Clock Icon */}
            <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
            <span className="font-hud font-bold text-sm sm:text-base tracking-wide text-white uppercase">
              TIME
            </span>
            <span className="font-hud font-bold text-lg sm:text-2xl text-[#84cc16] tabular-nums">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>

        {/* Circular Mini-Map with Gold Ring & 'N' Compass */}
        <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#111622]/90 border-[3px] border-[#eab308] shadow-[0_0_25px_rgba(0,0,0,0.85)] overflow-hidden">
          <svg viewBox="0 0 160 160" className="w-full h-full">
            <rect width="160" height="160" fill="#181f2c" />
            <path d="M0 45 H160 M0 105 H160 M28 0 V160 M132 0 V160" stroke="#2d3748" strokeWidth="8" />
            <rect x="52" y="0" width="56" height="160" fill="#334155" />
            <line x1="80" y1="0" x2="80" y2="160" stroke="#eab308" strokeWidth="2" />
            <line x1="66" y1="0" x2="66" y2="160" stroke="#64748b" strokeWidth="1" strokeDasharray="5 5" />
            <line x1="94" y1="0" x2="94" y2="160" stroke="#64748b" strokeWidth="1" strokeDasharray="5 5" />

            {radarBots.map((b, i) => {
              const mx = 80 + (b.x / 9) * 24;
              const my = 96 + (b.z / 200) * 76; // Shows cars within 200m ahead (z = 0 to -200)
              if (my < 6 || my > 154) return null;
              return (
                <circle
                  key={`bot-${i}`}
                  cx={mx}
                  cy={my}
                  r="3.6"
                  fill="#f8fafc"
                  stroke="#0f172a"
                  strokeWidth="1.2"
                />
              );
            })}

            <g transform={`translate(${80 + (playerXState / 9) * 24}, 96)`}>
              <polygon
                points="0,-10 8,9 0,4 -8,9"
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="1.2"
              />
            </g>
          </svg>

          <div className="absolute top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 text-white font-display font-black text-xs tracking-wider">
            N
          </div>
        </div>
      </div>

      {/* ==================== MULTIPLAYER 16:9 ALWAYS-VISIBLE CAR NAME TAGS & HORN TAUNT BUBBLES ==================== */}
      {isMultiplayer && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {mpNameTags.map((tag) => {
            const taunt = mpActiveTaunts[tag.slotIndex];
            const rankIdx = mpStandings.findIndex((s) => s.playerId === tag.playerId);
            const posNum = rankIdx >= 0 ? rankIdx + 1 : tag.slotIndex + 1;

            return (
              <div
                key={tag.playerId}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-75"
                style={{ left: `${tag.screenX}%`, top: `${tag.screenY}%` }}
              >
                {/* Photon Chat Horn Taunt ("Peeee! 📯") Emoji Bubble Above Car */}
                {taunt && (
                  <div className="mb-1 px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-display font-black text-xs shadow-[0_0_18px_rgba(245,158,11,0.9)] animate-bounce whitespace-nowrap border border-white">
                    🔊 {taunt.text}
                  </div>
                )}

                {/* Always-Visible 16:9 Name Tag Above Car */}
                <div
                  className={`px-2.5 py-0.5 rounded-lg backdrop-blur-md border flex items-center gap-1.5 whitespace-nowrap shadow-lg ${
                    tag.isMine
                      ? 'bg-sky-950/85 border-sky-400 text-sky-200'
                      : 'bg-slate-950/85 border-amber-400/70 text-white'
                  }`}
                >
                  <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-hud font-black text-[10px]">
                    {posNum === 1 ? '👑 1st' : posNum === 2 ? '2nd' : posNum === 3 ? '3rd' : `${posNum}th`}
                  </span>
                  <span className="font-display font-bold text-[11px]">
                    {tag.playerName} {tag.isMine ? '(You)' : ''}
                  </span>
                  {!tag.isMine && (
                    <span
                      className={`font-hud font-bold text-[10px] ${
                        tag.gapM > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {tag.gapM >= 0 ? `+${tag.gapM}m` : `${tag.gapM}m`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== MULTIPLAYER LIVE POSITION UI TOP (1st: Player 3, 2nd: You (2/5), etc. + 10s GHOST COLLISION) ==================== */}
      {isMultiplayer && mpStandings.length > 0 && (
        <div
          className={`pointer-events-none absolute ${
            prefs.tilt ? 'top-16' : 'top-3'
          } left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 w-[92%] max-w-2xl`}
        >
          <div className="w-full px-3.5 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-sky-400/50 shadow-xl flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-hud">
              {mpStandings.map((s, idx) => {
                const isMe = s.playerId === MultiplayerClient.playerId;
                const posLabel =
                  idx === 0 ? '👑 1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`;
                return (
                  <span
                    key={s.playerId}
                    className={`px-2 py-0.5 rounded font-bold whitespace-nowrap ${
                      isMe
                        ? 'bg-sky-500 text-slate-950 font-black shadow-[0_0_10px_rgba(56,189,248,0.7)]'
                        : idx === 0
                          ? 'bg-amber-500/25 border border-amber-400/60 text-amber-300'
                          : 'bg-slate-900 text-slate-200 border border-white/10'
                    }`}
                  >
                    {posLabel}: {isMe ? `You (${idx + 1}/${mpStandings.length})` : s.playerName}
                  </span>
                );
              })}
            </div>

            {/* 10s Ghost Collision vs 10% Collision Damage Status */}
            <span
              className={`px-2 py-0.5 rounded font-hud font-extrabold text-[10px] uppercase whitespace-nowrap ${
                mpGhostRemainingSec > 0
                  ? 'bg-cyan-500/25 border border-cyan-300 text-cyan-200 animate-pulse'
                  : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
              }`}
            >
              {mpGhostRemainingSec > 0
                ? `👻 Ghost Collision: ${mpGhostRemainingSec}s`
                : '🛡️ Collision: 10% Damage Only'}
            </span>
          </div>

          {/* 2000m Finish Line Live Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-slate-900/90 border border-white/20 overflow-hidden relative px-1">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-emerald-400 to-amber-400 rounded-full transition-all duration-150"
              style={{ width: `${Math.min(100, (distanceKm / 2.0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ==================== TOP CENTER STUNT / ACCIDENT / DRIFT POPUP BANNER ==================== */}
      {stuntBanner && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-bounce">
          <div
            className={`px-5 py-2 rounded-xl border text-center ${
              stuntBanner.isAlert
                ? 'bg-gradient-to-r from-red-600/95 via-rose-700/95 to-amber-600/90 border-red-300/70 shadow-[0_0_30px_rgba(239,68,68,0.85)]'
                : 'bg-gradient-to-r from-sky-500/90 via-blue-600/95 to-indigo-600/90 border-sky-300/60 shadow-[0_0_30px_rgba(56,189,248,0.8)]'
            }`}
          >
            <div className="font-display font-black text-base sm:text-xl text-white tracking-wider">
              {stuntBanner.title}
            </div>
            <div className="font-hud font-bold text-xs sm:text-sm text-yellow-300 tracking-widest">
              {stuntBanner.points}
            </div>
          </div>
        </div>
      )}

      {/* 4) UI: When Tilt ON -> Show "TILT MODE - Phone tilt karo" text at top + Calibrate Tilt button */}
      {prefs.tilt && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border-2 border-emerald-400/75 shadow-[0_0_25px_rgba(16,185,129,0.5)]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <div className="flex flex-col">
            <span className="font-display font-black text-xs sm:text-sm text-emerald-300 tracking-wider uppercase">
              TILT MODE - Phone tilt karo
            </span>
            <span className="font-hud text-[10px] text-slate-300">
              16:9 Landscape (-rawY*2) • Sens {prefs.tiltSensitivity ?? 65}% • Steer:{' '}
              <strong className="text-sky-300">
                {liveTiltSteerHud === 0
                  ? '0.00 (STRAIGHT)'
                  : liveTiltSteerHud > 0
                    ? `+${liveTiltSteerHud.toFixed(2)} (RIGHT)`
                    : `${liveTiltSteerHud.toFixed(2)} (LEFT)`}
              </strong>
            </span>
          </div>
          <button
            onClick={handleCalibrateTilt}
            title="Save current 16:9 phone position as 0 center straight"
            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-hud font-extrabold text-[10px] sm:text-xs uppercase tracking-wider shadow cursor-pointer active:scale-95 transition-transform"
          >
            Calibrate Tilt
          </button>
        </div>
      )}

      {/* Slow-Mo, Heavy Engine Smoke, 1.5x Nitro Boost & Drift Live Status Badges */}
      {(isSlowMo || isDriftingHud || heavyDamageSmokeHud || nitroMultiplierHud > 1.02) && (
        <div
          className={`pointer-events-none absolute ${
            prefs.tilt ? 'top-16' : 'top-4'
          } left-1/2 -translate-x-1/2 z-20 flex items-center gap-2`}
        >
          {isSlowMo && (
            <span className="px-3 py-1 rounded-md bg-red-600/95 border border-red-300 font-display font-black text-xs text-white tracking-widest uppercase animate-pulse">
              SLOW-MO 0.3x ACCIDENT IMPACT
            </span>
          )}
          {nitroMultiplierHud > 1.02 && (
            <span className="px-3 py-1 rounded-md bg-sky-500/90 border border-sky-200 font-display font-black text-xs text-slate-950 tracking-widest uppercase shadow-[0_0_20px_rgba(56,189,248,0.85)]">
              NITRO {nitroMultiplierHud.toFixed(1)}x SPEED BOOST
            </span>
          )}
          {heavyDamageSmokeHud && (
            <span className="px-3 py-1 rounded-md bg-rose-900/90 border border-rose-400 font-display font-black text-xs text-rose-100 tracking-widest uppercase">
              HEAVY ENGINE DAMAGE • CONTINUOUS BONNET SMOKE
            </span>
          )}
          {isDriftingHud && (
            <span className="px-3 py-1 rounded-md bg-amber-500/90 border border-amber-200 font-display font-black text-xs text-slate-950 tracking-widest uppercase">
              DRIFT +50 • COUNTER-STEER
            </span>
          )}
        </div>
      )}

      {/* ==================== TOP RIGHT: COINS + SETTINGS ==================== */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2.5 px-4 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 shadow-xl">
        <div className="w-7 h-7 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 flex items-center justify-center border border-yellow-100 shadow-md">
          <span className="font-display font-black text-xs text-amber-950">G</span>
        </div>
        <span className="font-hud font-bold text-lg sm:text-2xl text-yellow-400 tabular-nums">
          {prefs.coins.toLocaleString()}
        </span>
        <button
          onClick={() => {
            SoundEngine.playCoinCollect();
            onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + 5000 }));
            showBanner('INSTANT CASH DROP!', '+5,000 COINS');
          }}
          title="Collect Instant Bonus Coins"
          className="text-yellow-400 hover:text-yellow-200 font-display font-black text-xl px-1 transition-transform active:scale-90 cursor-pointer"
        >
          +
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="ml-1 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>

      {/* ==================== RIGHT SIDE VERTICAL ACTION STACK ==================== */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2.5">
        <button
          onClick={cycleCamera}
          title={`Camera Mode: ${cameraMode.toUpperCase()}`}
          className="w-12 h-12 rounded-xl bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
          </svg>
        </button>

        <button
          onClick={() => {
            SoundEngine.playUiClick();
            setIsPaused((p) => !p);
          }}
          title="Pause Race"
          className="w-12 h-12 rounded-xl bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>

        <button
          onClick={toggleDayNight}
          title={`Switch Day/Night Highway (Current: ${dayMode})`}
          className="w-12 h-12 rounded-xl bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
        </button>

        <button
          onPointerDown={() => {
            triggerNitroBoost();
            inputRef.current.nitro = true;
          }}
          onPointerUp={() => {
            inputRef.current.nitro = false;
          }}
          onPointerLeave={() => {
            inputRef.current.nitro = false;
          }}
          title="Press or Hold for 1.5x NITRO Boost & Blue Exhaust Flames (Shift / N)"
          className={`relative w-12 h-12 rounded-xl border flex items-center justify-center transition-all overflow-hidden cursor-pointer ${
            isNitroActive
              ? 'bg-sky-500/40 border-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.95)] scale-105'
              : 'bg-slate-900/85 border-sky-400/70 shadow-[0_0_16px_rgba(56,189,248,0.55)]'
          }`}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-sky-400/25 transition-all"
            style={{ height: `${nitroCharge}%` }}
          />
          <svg className="w-7 h-7 text-white relative z-10 -rotate-12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="8" y="6" width="8" height="14" rx="2.5" fill="#f8fafc" />
            <rect x="10" y="3" width="4" height="3" rx="1" fill="#94a3b8" />
            <text x="12" y="15" fontSize="3.8" fontWeight="900" textAnchor="middle" fill="#0284c7">
              NITRO
            </text>
          </svg>
        </button>

        <button
          onPointerDown={triggerHorn}
          title="Horn & Flash High-Beams (Clears Traffic Ahead)"
          className="w-12 h-12 rounded-xl bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white font-display font-black text-2xl shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          !
        </button>

        <button
          onClick={() => {
            SoundEngine.playUiClick();
            onExitToGarage();
          }}
          title="Return to Garage Lobby"
          className="w-12 h-10 rounded-xl bg-red-600/80 hover:bg-red-500 border border-red-400/40 flex items-center justify-center text-white text-[10px] font-display font-bold uppercase tracking-wider shadow-lg cursor-pointer"
        >
          EXIT
        </button>
      </div>

      {/* ==================== FIX 8 & 16:9 TILT UI: HORN + TURN INDICATORS + STEERING OR TILT MODE ==================== */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2.5">
        {/* Horn Button + Manual Turn Indicator Toggles + Quick Tilt Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onPointerDown={triggerHorn}
            title={`Play ${car.name} Horn (${isMultiplayer ? 'Photon Chat Taunt: Peeee!' : 'Traffic Gives Way'})`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/85 hover:bg-amber-400 active:scale-95 border border-amber-200 text-slate-950 font-display font-black text-xs tracking-wider shadow-[0_0_18px_rgba(245,158,11,0.6)] cursor-pointer transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
            {isMultiplayer ? `PEEEE! ${mpSelectedTauntEmoji}` : 'HORN'}
          </button>

          {isMultiplayer && (
            <div className="flex items-center gap-1 bg-black/70 px-1.5 py-1 rounded-lg border border-amber-400/40">
              {['📯', '🔥', '😎', '⚡', '👑'].map((em) => (
                <button
                  key={em}
                  onClick={() => {
                    setMpSelectedTauntEmoji(em);
                    SoundEngine.playHorn(car.engineProfile);
                    MultiplayerClient.sendHornTaunt(em, `Peeee! ${em}`);
                  }}
                  title={`Horn Taunt Emoji ${em}`}
                  className={`w-6 h-6 rounded text-xs flex items-center justify-center cursor-pointer ${
                    mpSelectedTauntEmoji === em ? 'bg-amber-500 text-slate-950' : 'hover:bg-white/15'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setManualIndicator((prev) => (prev === 'left' ? null : 'left'))}
            title="Left Turn Indicator (Q)"
            className={`px-2.5 py-1.5 rounded-lg border font-hud font-bold text-xs cursor-pointer transition-all ${
              activeIndicator === 'left' && indicatorBlinkOn
                ? 'bg-amber-500 border-amber-200 text-slate-950 shadow-[0_0_14px_#f59e0b]'
                : 'bg-black/65 border-white/20 text-amber-400'
            }`}
          >
            ◀ IND L
          </button>
          <button
            onClick={() => setManualIndicator((prev) => (prev === 'right' ? null : 'right'))}
            title="Right Turn Indicator (E)"
            className={`px-2.5 py-1.5 rounded-lg border font-hud font-bold text-xs cursor-pointer transition-all ${
              activeIndicator === 'right' && indicatorBlinkOn
                ? 'bg-amber-500 border-amber-200 text-slate-950 shadow-[0_0_14px_#f59e0b]'
                : 'bg-black/65 border-white/20 text-amber-400'
            }`}
          >
            IND R ▶
          </button>

          <button
            onClick={() => {
              SoundEngine.playUiClick();
              onUpdatePrefs((p) => {
                const nextTilt = !p.tilt;
                return {
                  ...p,
                  tilt: nextTilt,
                  steeringWheel: nextTilt ? false : !p.buttons,
                  buttons: nextTilt ? false : p.buttons,
                };
              });
            }}
            title="Toggle 16:9 Tilt Steering ON/OFF"
            className={`px-2.5 py-1.5 rounded-lg border font-hud font-extrabold text-xs cursor-pointer transition-all ${
              prefs.tilt
                ? 'bg-emerald-500 border-emerald-200 text-slate-950 shadow-[0_0_14px_rgba(16,185,129,0.7)]'
                : 'bg-black/65 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            TILT: {prefs.tilt ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 4) UI: Tilt ON -> Steering wheel & buttons HIDE; Tilt OFF -> Steering wheel / buttons SHOW */}
        {prefs.tilt ? (
          <div className="p-3 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-emerald-400/50 shadow-2xl flex flex-col gap-2 w-64 sm:w-72">
            <div className="flex items-center justify-between">
              <span className="font-display font-black text-xs text-emerald-300 tracking-wider uppercase">
                TILT MODE - Phone tilt karo
              </span>
              <button
                onClick={handleCalibrateTilt}
                className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-hud font-black text-[10px] uppercase cursor-pointer active:scale-95"
              >
                Calibrate Tilt (0)
              </button>
            </div>

            {/* Live 16:9 Landscape Tilt Angle Bar + Desktop Tilt Simulator Slider */}
            <div className="flex items-center gap-2">
              <span className="font-hud text-[10px] font-bold text-slate-400">LEFT</span>
              <input
                type="range"
                min={-0.6}
                max={0.6}
                step={0.01}
                value={-(inputRef.current.rawAccelY - (prefs.tiltCalibrationOffsetY ?? 0))}
                onChange={(e) => {
                  const simulatedTilt = Number(e.target.value);
                  // Since tiltSteer = -rawY * 2.0f, set rawAccelY = offset - simulatedTilt
                  inputRef.current.rawAccelY = (prefs.tiltCalibrationOffsetY ?? 0) - simulatedTilt;
                }}
                title="16:9 Phone Tilt Angle (Drag to test tilt on PC, or tilt phone in 16:9 Landscape)"
                className="w-full h-2 bg-slate-800 rounded-lg accent-emerald-400 cursor-pointer"
              />
              <span className="font-hud text-[10px] font-bold text-slate-400">RIGHT</span>
            </div>

            <div className="flex items-center justify-between text-[10px] font-hud text-slate-300">
              <span>DeadZone: 0.12 (Seedha = 0)</span>
              <button
                onClick={() => {
                  inputRef.current.rawAccelY = prefs.tiltCalibrationOffsetY ?? 0;
                  inputRef.current.tiltSteerValue = 0;
                  setLiveTiltSteerHud(0);
                }}
                className="text-sky-400 hover:text-sky-300 font-bold underline cursor-pointer"
              >
                Hold Straight (0°)
              </button>
            </div>
          </div>
        ) : prefs.steeringWheel && !prefs.buttons ? (
          /* Interactive Sport Steering Wheel + Secondary Touch Arrows (Shown ONLY when Tilt is OFF) */
          <div className="flex items-center gap-3">
            <div
              onPointerDown={handleWheelMove}
              onPointerMove={handleWheelMove}
              onPointerUp={resetWheel}
              onPointerLeave={resetWheel}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-black/50 backdrop-blur-md border-2 border-white/25 flex items-center justify-center shadow-2xl cursor-grab active:cursor-grabbing touch-none"
              title="Drag Left/Right to Steer (or use A/D / Arrow Keys)"
            >
              <svg
                viewBox="0 0 100 100"
                className="w-24 h-24 sm:w-28 sm:h-28 transition-transform duration-75"
                style={{ transform: `rotate(${steeringAngleDeg}deg)` }}
              >
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="9" />
                <path d="M46 8 H54" stroke="#ef4444" strokeWidth="9" />
                <path d="M12 50 H88 M50 50 V90" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
                <circle cx="50" cy="50" r="14" fill="#1e293b" stroke="#38bdf8" strokeWidth="2.5" />
              </svg>
            </div>
            <div className="flex gap-2">
              <button
                onPointerDown={() => {
                  inputRef.current.left = true;
                }}
                onPointerUp={() => {
                  inputRef.current.left = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.left = false;
                }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-800/65 hover:bg-slate-700/75 active:bg-sky-500/50 backdrop-blur-md border-2 border-white/30 flex items-center justify-center shadow-xl cursor-pointer"
              >
                <svg className="w-10 h-10 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <button
                onPointerDown={() => {
                  inputRef.current.right = true;
                }}
                onPointerUp={() => {
                  inputRef.current.right = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.right = false;
                }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-800/65 hover:bg-slate-700/75 active:bg-sky-500/50 backdrop-blur-md border-2 border-white/30 flex items-center justify-center shadow-xl cursor-pointer"
              >
                <svg className="w-10 h-10 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Classic Large Left/Right Metallic Arrow Buttons (Shown when Tilt is OFF and Buttons mode selected) */
          <div className="flex items-center gap-3.5">
            <button
              onPointerDown={() => {
                inputRef.current.left = true;
              }}
              onPointerUp={() => {
                inputRef.current.left = false;
              }}
              onPointerLeave={() => {
                inputRef.current.left = false;
              }}
              aria-label="Steer Left"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800/65 hover:bg-slate-700/75 active:bg-sky-500/50 backdrop-blur-md border-2 border-white/35 flex items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
            >
              <svg className="w-12 h-12 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
            </button>

            <button
              onPointerDown={() => {
                inputRef.current.right = true;
              }}
              onPointerUp={() => {
                inputRef.current.right = false;
              }}
              onPointerLeave={() => {
                inputRef.current.right = false;
              }}
              aria-label="Steer Right"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800/65 hover:bg-slate-700/75 active:bg-sky-500/50 backdrop-blur-md border-2 border-white/35 flex items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
            >
              <svg className="w-12 h-12 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ==================== BOTTOM CENTER: SEMI-CIRCULAR TACHOMETER, SPEEDOMETER & TURN SIGNAL RING UI (Fix 8) ==================== */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 z-20 w-72 sm:w-96 flex flex-col items-center">
        <div className="relative w-full h-36 sm:h-40 flex items-end justify-center">
          {/* Fix 8: Left Turn Signal Glowing Ring Joint near Speedometer */}
          <div
            className={`absolute left-1 bottom-12 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-100 ${
              activeIndicator === 'left' && indicatorBlinkOn
                ? 'bg-amber-500/90 border-amber-200 text-slate-950 shadow-[0_0_20px_#f59e0b] scale-110'
                : 'bg-slate-900/75 border-white/20 text-slate-500'
            }`}
          >
            <span className="font-display font-black text-sm">◀</span>
          </div>

          {/* Fix 8: Right Turn Signal Glowing Ring Joint near Speedometer */}
          <div
            className={`absolute right-1 bottom-12 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-100 ${
              activeIndicator === 'right' && indicatorBlinkOn
                ? 'bg-amber-500/90 border-amber-200 text-slate-950 shadow-[0_0_20px_#f59e0b] scale-110'
                : 'bg-slate-900/75 border-white/20 text-slate-500'
            }`}
          >
            <span className="font-display font-black text-sm">▶</span>
          </div>

          <svg viewBox="0 0 260 140" className="w-64 sm:w-80 h-full overflow-visible">
            {/* Dark Frosted Semi-Circle Backing */}
            <path
              d="M 18 132 A 112 112 0 0 1 242 132 Z"
              fill="rgba(10, 14, 23, 0.78)"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2.5"
            />
            {/* Turn Signal Ring Left & Right Glowing Arcs */}
            {activeIndicator === 'left' && indicatorBlinkOn && (
              <path
                d="M 14 132 A 116 116 0 0 1 85 28"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="5"
              />
            )}
            {activeIndicator === 'right' && indicatorBlinkOn && (
              <path
                d="M 175 28 A 116 116 0 0 1 246 132"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="5"
              />
            )}
            {/* Redline Arc Zone (6 to 8) */}
            <path
              d="M 206 52 A 112 112 0 0 1 242 132"
              fill="none"
              stroke="#ef4444"
              strokeWidth="6"
            />
            {/* Active RPM Arc */}
            <path
              d="M 26 128 A 104 104 0 0 1 234 128"
              fill="none"
              stroke="rgba(56, 189, 248, 0.3)"
              strokeWidth="5"
              strokeDasharray={`${(rpm / 8.5) * 325} 400`}
            />

            {/* Tachometer Numbers 0..8 */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((num, idx) => {
              const angle = Math.PI - (idx / 8) * Math.PI;
              const rText = 88;
              const tx = 130 + Math.cos(angle) * rText;
              const ty = 128 - Math.sin(angle) * rText;
              const rTickOuter = 110;
              const rTickInner = 100;
              const x1 = 130 + Math.cos(angle) * rTickInner;
              const y1 = 128 - Math.sin(angle) * rTickInner;
              const x2 = 130 + Math.cos(angle) * rTickOuter;
              const y2 = 128 - Math.sin(angle) * rTickOuter;
              return (
                <g key={idx}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={num >= 7 ? '#ef4444' : '#ffffff'}
                    strokeWidth="2.5"
                  />
                  <text
                    x={tx}
                    y={ty + 4}
                    textAnchor="middle"
                    fill={num >= 7 ? '#f87171' : '#ffffff'}
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="Chakra Petch, sans-serif"
                  >
                    {num}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Digital Gear & Speed Readout Inside Gauge */}
          <div className="absolute bottom-2 inset-x-0 flex flex-col items-center leading-none">
            <div className="font-hud font-bold text-base sm:text-lg text-white tracking-wider mb-0.5">
              {gear} <span className="text-xs text-slate-300">GR</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-hud font-extrabold text-4xl sm:text-5xl text-white tracking-tight tabular-nums drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                {speedKmh}
              </span>
              <span className="font-hud font-bold text-sm sm:text-base text-slate-200">
                KM/h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM RIGHT: METALLIC BRAKE & ACCELERATOR PEDALS (Exact match to Image 2) ==================== */}
      <div className="absolute bottom-3 right-4 z-20 flex items-end gap-4">
        {/* Brake / Drift Pedal (Shorter Wide Perforated Metallic Pedal) */}
        <button
          onPointerDown={() => {
            inputRef.current.brake = true;
          }}
          onPointerUp={() => {
            inputRef.current.brake = false;
          }}
          onPointerLeave={() => {
            inputRef.current.brake = false;
          }}
          title="Brake / Handbrake Drift (S / Down / Space)"
          className="group relative w-16 h-24 sm:w-20 sm:h-28 flex flex-col items-center justify-end cursor-pointer active:translate-y-1.5 transition-transform"
        >
          <div className="w-full h-20 sm:h-22 rounded-xl bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 border-2 border-slate-300 shadow-[0_8px_20px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between p-2 group-active:from-red-400 group-active:to-red-700">
            <div className="grid grid-cols-3 gap-1.5 w-full justify-items-center">
              {[1, 2, 3].map((dot) => (
                <span key={dot} className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-inner" />
              ))}
            </div>
            <span className="text-[10px] font-display font-black text-slate-900 tracking-wider">
              BRAKE
            </span>
            <div className="grid grid-cols-3 gap-1.5 w-full justify-items-center">
              {[1, 2, 3].map((dot) => (
                <span key={dot} className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-inner" />
              ))}
            </div>
          </div>
          <div className="w-5 h-4 bg-slate-700 rounded-b" />
        </button>

        {/* Accelerator Pedal (Tall Perforated Metallic Pedal) */}
        <button
          onPointerDown={() => {
            inputRef.current.pedalAccel = true;
          }}
          onPointerUp={() => {
            inputRef.current.pedalAccel = false;
          }}
          onPointerLeave={() => {
            inputRef.current.pedalAccel = false;
          }}
          title="Accelerate Full Throttle (W / Up Arrow)"
          className="group relative w-16 h-32 sm:w-20 sm:h-36 flex flex-col items-center justify-end cursor-pointer active:translate-y-1.5 transition-transform"
        >
          <div className="w-full h-28 sm:h-32 rounded-2xl bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 border-2 border-slate-300 shadow-[0_8px_20px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between p-2.5 group-active:from-sky-300 group-active:to-sky-600">
            <div className="grid grid-cols-3 gap-1.5 w-full justify-items-center">
              {[1, 2, 3, 4, 5, 6].map((dot) => (
                <span key={dot} className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-inner" />
              ))}
            </div>
            <span className="text-[10px] font-display font-black text-slate-900 tracking-wider">
              GAS
            </span>
            <div className="grid grid-cols-3 gap-1.5 w-full justify-items-center">
              {[1, 2, 3].map((dot) => (
                <span key={dot} className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-inner" />
              ))}
            </div>
          </div>
          <div className="w-6 h-4 bg-slate-700 rounded-b" />
        </button>
      </div>

      {/* ==================== 1) AFTER 3 SEC ACCIDENT OUT OPTIONS: CONTINUE (1000 COINS) OR RESPAWN (60 KM/H) ==================== */}
      {showAccidentOptionsModal && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="panel-glass rounded-2xl p-6 max-w-md w-full flex flex-col items-center gap-4 border-2 border-red-500/70 shadow-[0_0_50px_rgba(239,68,68,0.6)]">
            <div className="px-3 py-1 rounded-md bg-red-600/30 border border-red-400/60 text-red-300 font-hud font-bold text-xs tracking-widest uppercase">
              VEHICLE SPUN OUT • BONNET DEFORMED
            </div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-wider text-center">
              ACCIDENT! -500 COINS
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 text-center">
              Your <span className="text-sky-400 font-bold">{car.name}</span> spun out to the road shoulder. Choose how to get back in the race:
            </p>

            <div className="flex flex-col w-full gap-3 mt-1">
              <button
                onClick={handleContinueFromAccident}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 border border-yellow-200 text-slate-950 font-display font-black text-base tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.7)] flex items-center justify-between cursor-pointer active:scale-98 transition-all"
              >
                <span>CONTINUE & FULL REPAIR</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/90 text-yellow-400 font-hud font-extrabold text-sm">
                  1,000 COINS
                </span>
              </button>

              <button
                onClick={handleRespawnFromAccident}
                className="neon-play-btn w-full py-3.5 px-4 rounded-xl font-display font-black text-base text-white tracking-wider flex items-center justify-between cursor-pointer active:scale-98 transition-all"
              >
                <span>RESPAWN (ROAD CENTER)</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/60 text-sky-200 font-hud font-bold text-xs">
                  60 KM/H • FREE
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MULTIPLAYER 2000M (2KM) FINISH RESULT SCREEN (1 TO 5 RANKING + 5000 COINS + CROWN) ==================== */}
      {isMultiplayer && mpRaceFinishedModal && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
          <div className="panel-glass rounded-2xl p-5 sm:p-6 max-w-2xl w-full border-2 border-amber-400/70 shadow-[0_0_60px_rgba(245,158,11,0.45)] text-white flex flex-col gap-4">
            {(() => {
              const myRankIdx = mpStandings.findIndex((s) => s.playerId === MultiplayerClient.playerId);
              const myRank = myRankIdx >= 0 ? myRankIdx + 1 : 1;
              const coinPrize =
                myRank === 1 ? 5000 : myRank === 2 ? 2500 : myRank === 3 ? 1000 : 500;

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-3">
                    <div>
                      <span className="font-hud font-bold text-xs text-amber-300 uppercase tracking-widest">
                        🏁 2000M (2.0 KM) HIGHWAY MULTIPLAYER FINISH
                      </span>
                      <h2 className="font-display font-black text-xl sm:text-3xl text-white tracking-wider uppercase mt-0.5">
                        {myRank === 1
                          ? '👑 1ST PLACE VICTORY! +5,000 COINS'
                          : `FINISHED #${myRank} OF ${mpStandings.length}! +${coinPrize.toLocaleString()} COINS`}
                      </h2>
                    </div>

                    {!mpRewardClaimed ? (
                      <button
                        onClick={() => {
                          SoundEngine.playCoinCollect();
                          setMpRewardClaimed(true);
                          onUpdatePrefs((prev) => ({
                            ...prev,
                            coins: prev.coins + coinPrize,
                          }));
                        }}
                        className="btn-punch px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(250,204,21,0.8)] cursor-pointer"
                      >
                        CLAIM +{coinPrize.toLocaleString()} COINS {myRank === 1 ? '👑' : '🪙'}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400 text-emerald-300 font-hud font-extrabold text-xs uppercase">
                        ✓ +{coinPrize.toLocaleString()} COINS CLAIMED
                      </span>
                    )}
                  </div>

                  {/* 1 to 5 Ranking Table */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {mpStandings.map((slot, idx) => {
                      const rank = idx + 1;
                      const isMe = slot.playerId === MultiplayerClient.playerId;
                      const prize = rank === 1 ? 5000 : rank === 2 ? 2500 : rank === 3 ? 1000 : 500;
                      return (
                        <div
                          key={slot.playerId}
                          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                            isMe
                              ? 'bg-sky-950/80 border-2 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.35)]'
                              : rank === 1
                                ? 'bg-amber-950/50 border-amber-400/60'
                                : 'bg-slate-900/80 border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-black text-sm ${
                                rank === 1
                                  ? 'bg-amber-400 text-slate-950 shadow-[0_0_12px_#facc15]'
                                  : rank === 2
                                    ? 'bg-slate-300 text-slate-950'
                                    : rank === 3
                                      ? 'bg-amber-700 text-white'
                                      : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {rank === 1 ? '👑1' : `#${rank}`}
                            </span>
                            <div>
                              <div className="font-display font-bold text-sm text-white">
                                {slot.playerName} {isMe ? '(You)' : ''}{' '}
                                {rank === 1 && <span className="text-amber-300">👑 WINNER</span>}
                              </div>
                              <div className="font-hud text-xs text-slate-400">
                                🏎️ {slot.carName} · Distance: {Math.round(slot.distanceM)}m / 2000m
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-hud font-extrabold text-sm text-amber-400">
                              +{prize.toLocaleString()} Coins
                            </div>
                            <div className="font-hud text-xs text-slate-300">
                              {slot.finishTimeSec ? `${slot.finishTimeSec.toFixed(1)}s` : 'Racing...'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-white/15">
                    {onRematchLobby && (
                      <button
                        onClick={() => {
                          if (!mpRewardClaimed) {
                            onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + coinPrize }));
                          }
                          MultiplayerClient.requestRematch();
                          onRematchLobby();
                        }}
                        className="btn-punch px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
                      >
                        🔄 REMATCH IN LOBBY
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!mpRewardClaimed) {
                          onUpdatePrefs((prev) => ({ ...prev, coins: prev.coins + coinPrize }));
                        }
                        MultiplayerClient.leaveRoom();
                        onExitToGarage();
                      }}
                      className="btn-punch px-5 py-2.5 rounded-xl green-play-btn text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
                    >
                      🏠 RETURN TO GARAGE
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ==================== PAUSE OVERLAY MODAL ==================== */}
      {isPaused && (
        <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="panel-glass rounded-2xl p-6 max-w-md w-full flex flex-col items-center gap-4 border border-sky-400/40">
            <h2 className="font-display font-black text-2xl text-white tracking-wider">
              RACE PAUSED
            </h2>
            <p className="text-sm text-slate-300 text-center">
              Distance Covered: <span className="text-lime-400 font-bold">{distanceKm.toFixed(1)} km</span> · Vehicle:{' '}
              <span className="text-sky-400 font-bold">{car.name}</span>
            </p>
            <div className="flex flex-col w-full gap-2.5 mt-2">
              <button
                onClick={() => setIsPaused(false)}
                className="neon-play-btn w-full py-3 rounded-xl font-display font-black text-lg text-white tracking-wider cursor-pointer"
              >
                RESUME RACE
              </button>
              <button
                onClick={toggleDayNight}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 font-hud font-bold text-sm text-white cursor-pointer"
              >
                SWITCH HIGHWAY TIME: {dayMode === 'Day' ? 'BRIGHT DAYTIME' : 'WET NIGHT NEON'}
              </button>
              <button
                onClick={onOpenSettings}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 font-hud font-bold text-sm text-white cursor-pointer"
              >
                GRAPHICS & AUDIO SETTINGS
              </button>
              <button
                onClick={onExitToGarage}
                className="w-full py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-400/30 font-hud font-bold text-sm text-white cursor-pointer"
              >
                RETURN TO GARAGE LOBBY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
