export type VehicleCategory =
  | 'Supercar'
  | 'Convertible GT'
  | 'SUV'
  | 'Offroad 4x4'
  | 'Sedan'
  | 'Heavy Truck'
  | 'Coach Bus'
  | 'Sports Coupe'
  | 'Hypercar';

export type EngineAudioProfile =
  | 'v12_ferrari'
  | 'v8_diesel'
  | 'thar_turbo'
  | 'heavy_truck'
  | 'ev_hum'
  | 'v10_scream'
  | 'v8_muscle'
  | 'offroad_diesel'
  | 'heavy_turbine'
  | 'hyper_hybrid';

export interface RigidbodyPhysicsConfig {
  mass: number; // 1550 kg
  drag: number; // 0.2
  angularDrag: number; // 1.5
  interpolate: 'Interpolate' | 'Extrapolate' | 'None';
  collisionDetection: 'Continuous Dynamic' | 'Continuous' | 'Discrete';
  centerOfMass: { x: number; y: number; z: number }; // y = -0.9 for stability
  wheelSpring: number; // 18500
  wheelDamper: number; // 4000
  frictionStiffness: number; // 1.95 (0.7 - 0.8 on drift)
  downforceFactor: number; // 7 * velocity.magnitude
}

export const DEFAULT_RIGIDBODY_SETUP: RigidbodyPhysicsConfig = {
  mass: 1550,
  drag: 0.2,
  angularDrag: 1.5,
  interpolate: 'Interpolate',
  collisionDetection: 'Continuous Dynamic',
  centerOfMass: { x: 0, y: -0.9, z: 0.08 },
  wheelSpring: 18500,
  wheelDamper: 4000,
  frictionStiffness: 1.95,
  downforceFactor: 7.0,
};

export const TRAFFIC_SEDAN_MASS_KG = 1400;

export interface CarStatsScriptableObject {
  id: string;
  name: string;
  realModelName: string;
  numberPlate: string;
  interiorColor: string;
  badgeType: 'ferrari' | 'jaguar' | 'lamborghini' | 'fortuner' | 'thar' | 'sport' | 'hyper';
  subtitle: string;
  category: VehicleCategory;
  primaryColor: string;
  secondaryColor: string;
  stripeStyle: 'dual_white' | 'none' | 'carbon_hood' | 'racing_side' | 'cyber_trim';
  bodyStyle:
    | 'ferrari_f8'
    | 'jaguar_ftype'
    | 'lambo_huracan'
    | 'fortuner_suv'
    | 'mahindra_thar'
    | 'sedan'
    | 'truck'
    | 'bus'
    | 'sports'
    | 'hypercar';
  engineProfile: EngineAudioProfile;
  massKg: number; // Realistic mass in kg for momentum impact physics
  // Base performance stats
  baseTopSpeedKmh: number;
  baseAcceleration: number;
  baseHandling: number;
  baseNitroDuration: number;
  // Default upgrade levels (1 to 10)
  defaultUpgrades: {
    engine: number;
    turbo: number;
    tires: number;
    nitro: number;
  };
  // Unlock price
  unlockedByDefault: boolean;
  priceCoins: number;
  priceDiamonds: number;
  // Garage lineup position index (0-9)
  garageSlot: number;
}

export interface CarUpgradeLevels {
  engine: number; // 1..10
  turbo: number;  // 1..10
  tires: number;  // 1..10
  nitro: number;  // 1..10
}

export type GraphicsQuality = 'Low' | 'Med' | 'High';
export type ControlType = 'wheel' | 'buttons' | 'tilt';
export type CameraViewMode = 'chase' | 'close' | 'hood' | 'top';

export interface CustomButtonPosition {
  x: number; // percentage 5..95
  y: number; // percentage 10..90
}

export interface PlayerPrefsData {
  level: number;
  xp: number;
  coins: number;
  diamonds: number;
  selectedCarId: string;
  ownedCarIds: string[];
  upgrades: Record<string, CarUpgradeLevels>;
  // Custom Controller Settings
  steeringWheel: boolean;
  buttons: boolean;
  tilt: boolean;
  tiltSensitivity: number; // 0-100, default 65
  tiltCalibrationOffsetY: number; // Saved rawY center offset from "Calibrate Tilt" button
  steeringSensitivity: number; // 0-100, default 85
  buttonSize: number; // 50-150%, default 100
  vibrationOn: boolean;
  customButtonLayout: Record<string, CustomButtonPosition>;
  // General Settings
  soundOn: boolean;
  musicOn: boolean;
  musicVolume: number; // 0-100, default 77
  graphicsQuality: GraphicsQuality;
  timeOfDay: 'Day' | 'Night';
  garageDisplayMode: 'lineup5' | 'single360';
  // Daily Rewards
  lastClaimedDay: number; // 0..7
  bestDistanceKm: number;
}

export const DEFAULT_BUTTON_LAYOUT: Record<string, CustomButtonPosition> = {
  left: { x: 10, y: 78 },
  right: { x: 22, y: 78 },
  brake: { x: 76, y: 80 },
  accel: { x: 90, y: 76 },
  nitro: { x: 92, y: 52 },
  horn: { x: 12, y: 56 },
};

export const CAR_ROSTER: CarStatsScriptableObject[] = [
  {
    id: 'apex_r1',
    name: 'Apex R1',
    realModelName: 'Ferrari F8 Tributo 2023',
    numberPlate: 'MH 12 XR 8847',
    interiorColor: '#c27838', // Tan Leather Interior
    badgeType: 'ferrari',
    subtitle: '2023 Ferrari F8 Tributo • V12 8500 RPM • 1550 kg',
    category: 'Supercar',
    primaryColor: '#d91b1b', // Rosso Corsa Red
    secondaryColor: '#ffffff', // Dual White Racing Stripes
    stripeStyle: 'dual_white',
    bodyStyle: 'ferrari_f8',
    engineProfile: 'v12_ferrari',
    massKg: 1550,
    baseTopSpeedKmh: 340,
    baseAcceleration: 9.4,
    baseHandling: 9.1,
    baseNitroDuration: 5.5,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: true,
    priceCoins: 0,
    priceDiamonds: 0,
    garageSlot: 0,
  },
  {
    id: 'vortex_blue',
    name: 'Vortex Blue',
    realModelName: 'Jaguar F-Type Convertible 2024',
    numberPlate: 'MH 04 JK 6123',
    interiorColor: '#d6b48a',
    badgeType: 'jaguar',
    subtitle: '2024 Blue Jaguar F-Type R Convertible • 1480 kg',
    category: 'Convertible GT',
    primaryColor: '#1d4ed8', // Velocity Metallic Blue
    secondaryColor: '#0f172a',
    stripeStyle: 'none',
    bodyStyle: 'jaguar_ftype',
    engineProfile: 'v8_diesel',
    massKg: 1480,
    baseTopSpeedKmh: 322,
    baseAcceleration: 9.0,
    baseHandling: 9.2,
    baseNitroDuration: 5.8,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 42000,
    priceDiamonds: 0,
    garageSlot: 1,
  },
  {
    id: 'nova_yellow',
    name: 'Nova Yellow',
    realModelName: 'Lamborghini Huracán EVO',
    numberPlate: 'MH 01 LM 9090',
    interiorColor: '#18181b',
    badgeType: 'lamborghini',
    subtitle: 'Giallo Inti Lamborghini Huracán EVO • 1520 kg',
    category: 'Supercar',
    primaryColor: '#eab308', // Giallo Orion Yellow
    secondaryColor: '#111827',
    stripeStyle: 'carbon_hood',
    bodyStyle: 'lambo_huracan',
    engineProfile: 'v12_ferrari',
    massKg: 1520,
    baseTopSpeedKmh: 352,
    baseAcceleration: 9.6,
    baseHandling: 9.3,
    baseNitroDuration: 6.0,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 64000,
    priceDiamonds: 0,
    garageSlot: 2,
  },
  {
    id: 'shadow_suv',
    name: 'Shadow SUV',
    realModelName: 'Toyota Fortuner Legender 2024',
    numberPlate: 'MH 14 FT 3321',
    interiorColor: '#451a03',
    badgeType: 'fortuner',
    subtitle: '2024 Black Fortuner Legender V8 Diesel • 2100 kg',
    category: 'SUV',
    primaryColor: '#141619', // Attitude Black Mica
    secondaryColor: '#d4d4d8', // Chrome Grille Trim
    stripeStyle: 'none',
    bodyStyle: 'fortuner_suv',
    engineProfile: 'v8_diesel',
    massKg: 2100,
    baseTopSpeedKmh: 265,
    baseAcceleration: 8.0,
    baseHandling: 8.4,
    baseNitroDuration: 6.5,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 48000,
    priceDiamonds: 0,
    garageSlot: 3,
  },
  {
    id: 'thar_4x4',
    name: 'Thar 4x4',
    realModelName: 'Mahindra Thar 2024 Hardtop',
    numberPlate: 'MH 20 MT 7788',
    interiorColor: '#1f2937',
    badgeType: 'thar',
    subtitle: '2024 Mahindra Thar Turbo Diesel Whistle • 1850 kg',
    category: 'Offroad 4x4',
    primaryColor: '#f8fafc', // Everest White
    secondaryColor: '#111827', // Matte Black Hardtop & Cladding
    stripeStyle: 'none',
    bodyStyle: 'mahindra_thar',
    engineProfile: 'thar_turbo',
    massKg: 1850,
    baseTopSpeedKmh: 245,
    baseAcceleration: 8.2,
    baseHandling: 9.0,
    baseNitroDuration: 7.0,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 38000,
    priceDiamonds: 0,
    garageSlot: 4,
  },
  {
    id: 'city_mover',
    name: 'City Mover',
    realModelName: 'Executive EV Aero Saloon',
    numberPlate: 'MH 02 CM 4410',
    interiorColor: '#92400e',
    badgeType: 'sport',
    subtitle: 'Executive EV Silent Hum Saloon • 3500 kg Armored',
    category: 'Sedan',
    primaryColor: '#64748b', // Metallic Grigio Silver
    secondaryColor: '#0f172a',
    stripeStyle: 'racing_side',
    bodyStyle: 'sedan',
    engineProfile: 'ev_hum',
    massKg: 3500,
    baseTopSpeedKmh: 305,
    baseAcceleration: 8.8,
    baseHandling: 8.7,
    baseNitroDuration: 5.5,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 35000,
    priceDiamonds: 0,
    garageSlot: 5,
  },
  {
    id: 'titan_truck',
    name: 'Titan Hauler',
    realModelName: '1200HP Racing Highway Semi',
    numberPlate: 'MH 43 TH 9900',
    interiorColor: '#1e293b',
    badgeType: 'sport',
    subtitle: '1200HP Highway Semi Truck • Heavy Air Horn • 3500 kg',
    category: 'Heavy Truck',
    primaryColor: '#b91c1c', // Deep Crimson & Chrome
    secondaryColor: '#e2e8f0',
    stripeStyle: 'racing_side',
    bodyStyle: 'truck',
    engineProfile: 'heavy_truck',
    massKg: 3500,
    baseTopSpeedKmh: 240,
    baseAcceleration: 7.5,
    baseHandling: 7.6,
    baseNitroDuration: 8.5,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 55000,
    priceDiamonds: 0,
    garageSlot: 6,
  },
  {
    id: 'metro_bus',
    name: 'Metro Express',
    realModelName: 'Aero Touring Highway Coach',
    numberPlate: 'MH 01 ME 2024',
    interiorColor: '#334155',
    badgeType: 'sport',
    subtitle: 'Touring Highway Aero Coach Bus • 3500 kg',
    category: 'Coach Bus',
    primaryColor: '#0284c7', // Sky Blue & Pearl White
    secondaryColor: '#f8fafc',
    stripeStyle: 'racing_side',
    bodyStyle: 'bus',
    engineProfile: 'heavy_truck',
    massKg: 3500,
    baseTopSpeedKmh: 230,
    baseAcceleration: 7.0,
    baseHandling: 7.4,
    baseNitroDuration: 9.0,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 68000,
    priceDiamonds: 0,
    garageSlot: 7,
  },
  {
    id: 'pulse_sports',
    name: 'Pulse GT',
    realModelName: 'Emerald GT3 Track Coupe',
    numberPlate: 'MH 12 PG 0007',
    interiorColor: '#b45309',
    badgeType: 'sport',
    subtitle: 'Emerald Track-Tuned GT3 Coupe • 1510 kg',
    category: 'Sports Coupe',
    primaryColor: '#059669', // British Racing Emerald Green
    secondaryColor: '#ffffff',
    stripeStyle: 'dual_white',
    bodyStyle: 'sports',
    engineProfile: 'v12_ferrari',
    massKg: 1510,
    baseTopSpeedKmh: 362,
    baseAcceleration: 9.6,
    baseHandling: 9.5,
    baseNitroDuration: 6.5,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 95000,
    priceDiamonds: 0,
    garageSlot: 8,
  },
  {
    id: 'hyperion_x',
    name: 'Hyperion X',
    realModelName: '1600HP Carbon-Cyan Hypercar',
    numberPlate: 'MH 01 HX 0001',
    interiorColor: '#06b6d4',
    badgeType: 'hyper',
    subtitle: '1600HP Carbon-Cyan Ultimate Hypercar • 1450 kg',
    category: 'Hypercar',
    primaryColor: '#0f172a', // Exposed Carbon Obsidian
    secondaryColor: '#06b6d4', // Electric Cyan Aero Trim
    stripeStyle: 'cyber_trim',
    bodyStyle: 'hypercar',
    engineProfile: 'ev_hum',
    massKg: 1450,
    baseTopSpeedKmh: 418,
    baseAcceleration: 10.0,
    baseHandling: 9.9,
    baseNitroDuration: 8.0,
    defaultUpgrades: { engine: 4, turbo: 3, tires: 3, nitro: 2 },
    unlockedByDefault: false,
    priceCoins: 145000,
    priceDiamonds: 350,
    garageSlot: 9,
  },
];

export function getStatPercentage(stat: keyof CarUpgradeLevels, level: number): number {
  const clamped = Math.max(1, Math.min(10, level));
  if (stat === 'turbo' && clamped === 3) return 35;
  if (clamped === 10) return 100;
  return Math.min(100, clamped * 10);
}

export function getUpgradeCost(level: number): { coins: number; diamonds: number } {
  if (level >= 10) return { coins: 0, diamonds: 0 };
  const coins = level * 4500;
  const diamonds = level >= 8 ? (level - 7) * 25 : 0;
  return { coins, diamonds };
}

export function getComputedCarStats(car: CarStatsScriptableObject, u: CarUpgradeLevels) {
  const topSpeedKmh = Math.round(car.baseTopSpeedKmh + (u.engine - 1) * 9);
  const acceleration = +(car.baseAcceleration + (u.turbo - 1) * 0.45).toFixed(1);
  const handling = +(car.baseHandling + (u.tires - 1) * 0.35).toFixed(1);
  const nitroDuration = +(car.baseNitroDuration + (u.nitro - 1) * 0.55).toFixed(1);
  return {
    topSpeedKmh,
    acceleration,
    handling,
    nitroDuration,
  };
}

const STORAGE_KEY = 'CNR_ULTIMATE_PLAYER_PREFS_V5';

export function getDefaultPlayerPrefs(): PlayerPrefsData {
  const upgrades: Record<string, CarUpgradeLevels> = {};
  for (const car of CAR_ROSTER) {
    upgrades[car.id] = { ...car.defaultUpgrades };
  }

  return {
    level: 28,
    xp: 640,
    coins: 230500,
    diamonds: 1240,
    selectedCarId: 'apex_r1',
    ownedCarIds: ['apex_r1'],
    upgrades,
    steeringWheel: true,
    buttons: false,
    tilt: false,
    tiltSensitivity: 65,
    tiltCalibrationOffsetY: 0,
    steeringSensitivity: 85,
    buttonSize: 100,
    vibrationOn: true,
    customButtonLayout: { ...DEFAULT_BUTTON_LAYOUT },
    soundOn: true,
    musicOn: true,
    musicVolume: 77,
    graphicsQuality: 'High',
    timeOfDay: 'Day',
    // Fix 3: Garage shows 1 premium rotating car in showroom center by default
    garageDisplayMode: 'single360',
    lastClaimedDay: 2,
    bestDistanceKm: 8.3,
  };
}

export const PlayerPrefs = {
  load(): PlayerPrefsData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultPlayerPrefs();
      const parsed = JSON.parse(raw) as Partial<PlayerPrefsData>;
      const defaults = getDefaultPlayerPrefs();
      return {
        ...defaults,
        ...parsed,
        upgrades: {
          ...defaults.upgrades,
          ...(parsed.upgrades || {}),
        },
        customButtonLayout: {
          ...defaults.customButtonLayout,
          ...(parsed.customButtonLayout || {}),
        },
      };
    } catch {
      return getDefaultPlayerPrefs();
    }
  },

  save(data: PlayerPrefsData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem('CurrentCar', data.selectedCarId);
      for (const c of CAR_ROSTER) {
        const isUnlocked = data.ownedCarIds.includes(c.id) ? '1' : '0';
        localStorage.setItem(`CarUnlocked_${c.name.replace(/\s+/g, '')}`, isUnlocked);
      }
    } catch {
      // Ignore storage quota errors
    }
  },

  resetControllerDefaults(current: PlayerPrefsData): PlayerPrefsData {
    const next: PlayerPrefsData = {
      ...current,
      steeringWheel: true,
      buttons: false,
      tilt: false,
      tiltSensitivity: 65,
      tiltCalibrationOffsetY: 0,
      steeringSensitivity: 85,
      buttonSize: 100,
      vibrationOn: true,
      musicVolume: 77,
      graphicsQuality: 'High',
      customButtonLayout: { ...DEFAULT_BUTTON_LAYOUT },
    };
    this.save(next);
    return next;
  },
};
