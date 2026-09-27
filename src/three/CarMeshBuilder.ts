import * as THREE from 'three';
import { CarStatsScriptableObject } from '../data/carData';

export interface BuiltCarMesh {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
  nitroFlames: THREE.Mesh[];
  headlightBeams: THREE.Mesh[];
  taillightMeshes: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  leftIndicators: THREE.Mesh[];
  rightIndicators: THREE.Mesh[];
}

// Cached procedural textures so we don't recreate canvases unnecessarily
let cachedTireTreadTexture: THREE.CanvasTexture | null = null;
let cachedEnvCubeMap: THREE.CubeTexture | null = null;
const plateTextureCache = new Map<string, THREE.CanvasTexture>();
const badgeTextureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Generates a realistic studio/daylight reflection CubeTexture so all car bodies
 * and windows show bright showroom ceiling lights, blue sky, and horizon reflections.
 */
export function getShowroomEnvMap(): THREE.CubeTexture {
  if (cachedEnvCubeMap) return cachedEnvCubeMap;

  const faces: HTMLCanvasElement[] = [];
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    if (i === 2) {
      // +Y Top: dark ceiling with bright white studio LED light strips
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(24, 40, 208, 22);
      ctx.fillRect(24, 118, 208, 22);
      ctx.fillRect(24, 194, 208, 22);
    } else if (i === 3) {
      // -Y Bottom: dark polished concrete floor
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 256, 256);
    } else {
      // Side faces: bright sky gradient + city horizon + studio softbox highlights
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#bae6fd');
      grad.addColorStop(0.48, '#f8fafc');
      grad.addColorStop(0.52, '#334155');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      // Soft studio reflection streak
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(20, 45, 216, 18);
    }
    faces.push(canvas);
  }

  const cubeTex = new THREE.CubeTexture(faces);
  cubeTex.needsUpdate = true;
  cachedEnvCubeMap = cubeTex;
  return cubeTex;
}

/**
 * Generates a realistic grooved rubber tyre tread bump/diffuse texture
 */
function getTireTreadTexture(): THREE.CanvasTexture {
  if (cachedTireTreadTexture) return cachedTireTreadTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, 256, 128);

  // Longitudinal channels
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 26, 256, 8);
  ctx.fillRect(0, 60, 256, 8);
  ctx.fillRect(0, 94, 256, 8);

  // Diagonal V-tread blocks
  ctx.strokeStyle = '#262930';
  ctx.lineWidth = 5;
  for (let x = -32; x < 288; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 18, 64);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  cachedTireTreadTexture = tex;
  return tex;
}

/**
 * Generates an authentic Indian HSRP Number Plate texture (e.g. "MH 12 XR 8847")
 */
function getIndianNumberPlateTexture(plateText: string): THREE.CanvasTexture {
  const existing = plateTextureCache.get(plateText);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;

  // White reflective HSRP background with black border
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 112);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#0f172a';
  ctx.strokeRect(4, 4, 504, 104);

  // Blue "IND" strip on left
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(10, 10, 56, 92);

  // Gold Ashoka Chakra wheel dot + IND text
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(38, 38, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IND', 38, 82);

  // Crisp Registration Number (MH 12 XR 8847)
  ctx.fillStyle = '#090d16';
  ctx.font = '900 54px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateText, 286, 58);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  plateTextureCache.set(plateText, tex);
  return tex;
}

/**
 * Generates a realistic hood/grille emblem badge texture (Ferrari shield, Lambo bull shield, Thar grille logo, etc.)
 */
function getBadgeTexture(badgeType: CarStatsScriptableObject['badgeType']): THREE.CanvasTexture {
  const existing = badgeTextureCache.get(badgeType);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  if (badgeType === 'ferrari') {
    // Modena Yellow Shield with Italian Tricolore top & Black Prancing Silhouette
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(20, 12);
    ctx.lineTo(108, 12);
    ctx.lineTo(102, 84);
    ctx.lineTo(64, 120);
    ctx.lineTo(26, 84);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    // Green/White/Red top bar
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(24, 15, 26, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 15, 28, 8);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(78, 15, 26, 8);

    // Prancing emblem center
    ctx.fillStyle = '#090d16';
    ctx.font = '900 44px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐎', 64, 78);
  } else if (badgeType === 'lamborghini') {
    // Black & Gold Bull Shield
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(20, 12);
    ctx.lineTo(108, 12);
    ctx.lineTo(100, 84);
    ctx.lineTo(64, 120);
    ctx.lineTo(28, 84);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#eab308';
    ctx.stroke();
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐂', 64, 76);
  } else if (badgeType === 'thar') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(4, 28, 120, 72);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 28, 120, 72);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 34px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THAR', 64, 75);
  } else {
    // Chrome Crest Emblem
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('R', 64, 77);
  }

  const tex = new THREE.CanvasTexture(canvas);
  badgeTextureCache.set(badgeType, tex);
  return tex;
}

/**
 * Helper to create a smooth contoured 3D car body from a 2D side-silhouette [z, y] polygon
 */
function createContouredBodyMesh(
  profilePoints: [number, number][],
  halfWidth: number,
  bevelSize: number,
  bevelThickness: number,
  material: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(profilePoints[0][0], profilePoints[0][1]);
  for (let i = 1; i < profilePoints.length; i++) {
    shape.lineTo(profilePoints[i][0], profilePoints[i][1]);
  }
  shape.closePath();

  const depth = (halfWidth - bevelThickness) * 2;
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: Math.max(0.2, depth),
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelOffset: 0,
    bevelSegments: 5,
    curveSegments: 16,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate so X is width (-halfWidth..+halfWidth), Y is height, Z is length (-front..+rear)
  geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const centerX = (bb.min.x + bb.max.x) * 0.5;
  geo.translate(-centerX, 0, 0);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds an ultra-detailed, realistic 3D vehicle mesh with:
 * - Sculpted aerodynamic body curves (no block cubes)
 * - Glossy clearcoat paint with environment reflection CubeTexture
 * - Transparent glass windshield + visible interior seats (tan leather on Ferrari F8, etc.) & steering wheel
 * - Detailed multi-spoke alloy wheels, brake rotors, red calipers & grooved rubber tyre treads
 * - Authentic Indian HSRP Number Plates (MH 12 XR 8847, etc.) & Brand Badges
 */
export function buildVehicleMesh(
  car: CarStatsScriptableObject,
  isTrafficBot = false
): BuiltCarMesh {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const nitroFlames: THREE.Mesh[] = [];
  const headlightBeams: THREE.Mesh[] = [];
  const taillightMeshes: THREE.Mesh[] = [];
  const leftIndicators: THREE.Mesh[] = [];
  const rightIndicators: THREE.Mesh[] = [];

  const envMap = getShowroomEnvMap();
  const treadTex = getTireTreadTexture();

  // Ultra-glossy automotive clearcoat paint material with real environment reflections
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(car.primaryColor),
    metalness: car.bodyStyle === 'mahindra_thar' ? 0.35 : 0.72,
    roughness: car.bodyStyle === 'mahindra_thar' ? 0.22 : 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 1.0,
    envMap,
    envMapIntensity: 1.35,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(car.secondaryColor),
    metalness: 0.45,
    roughness: 0.2,
    clearcoat: 0.85,
    envMap,
    envMapIntensity: 1.1,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x11151c,
    metalness: 0.45,
    roughness: 0.35,
    envMap,
    envMapIntensity: 0.8,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.08,
    envMap,
    envMapIntensity: 1.5,
  });

  // Transparent Automotive Glass so the Tan Leather / Sport Interior is clearly visible!
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.1,
    roughness: 0.05,
    transparent: true,
    opacity: 0.44,
    envMap,
    envMapIntensity: 1.6,
  });

  const interiorLeatherMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(car.interiorColor || '#c27838'),
    roughness: 0.55,
    metalness: 0.08,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x181a1f,
    map: treadTex,
    BumpMap: treadTex,
    bumpScale: 0.03,
    roughness: 0.78,
    metalness: 0.08,
  } as THREE.MeshStandardMaterialParameters);

  const rimMat = new THREE.MeshStandardMaterial({
    color: car.bodyStyle === 'fortuner_suv' || car.bodyStyle === 'lambo_huracan' ? 0x1e293b : 0xe2e8f0,
    metalness: 0.9,
    roughness: 0.16,
    envMap,
    envMapIntensity: 1.3,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    metalness: 0.5,
    roughness: 0.3,
  });

  const headlightGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const drlAmberMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1e27 });

  const style = car.bodyStyle;

  // Dimensions & Wheel Setup per Real-World Vehicle Archetype
  let wheelRadius = 0.37;
  let wheelWidth = 0.29;
  let wheelX = 0.98;
  let frontZ = -1.42;
  let rearZ = 1.38;
  let frontBumperZ = -2.28;
  let rearBumperZ = 2.24;

  if (
    style === 'ferrari_f8' ||
    style === 'lambo_huracan' ||
    style === 'sports' ||
    style === 'hypercar'
  ) {
    // 1. SCULPTED SUPERCAR / FERRARI F8 TRIBUTO / LAMBORGHINI HURACAN EVO
    wheelRadius = 0.37;
    wheelWidth = 0.31;
    wheelX = 1.02;
    frontZ = -1.38;
    rearZ = 1.36;
    frontBumperZ = -2.32;
    rearBumperZ = 2.25;

    // Lower Aerodynamic Sculpted Body Profile [z, y]
    const lowerProfile: [number, number][] = [
      [-2.28, 0.20], // Front carbon splitter tip
      [-2.18, 0.44], // Low nose cone
      [-1.55, 0.68], // S-Duct sculpted hood
      [-0.85, 0.82], // Base of windshield
      [0.55, 0.86],  // Mid-engine decklid
      [1.65, 0.92],  // Rear haunches
      [2.18, 0.84],  // Rear spoiler lip
      [2.24, 0.36],  // Rear diffuser top
      [2.05, 0.20],  // Rear underbody
    ];
    const mainBody = createContouredBodyMesh(lowerProfile, 1.04, 0.11, 0.14, paintMat);
    root.add(mainBody);

    // Sculpted Muscular Front & Rear Wheel Arch Fenders (Left & Right)
    const fenderProfileFront: [number, number][] = [
      [-1.95, 0.24],
      [-1.78, 0.72],
      [-1.15, 0.78],
      [-0.85, 0.26],
    ];
    const fenderProfileRear: [number, number][] = [
      [0.65, 0.26],
      [0.95, 0.94],
      [1.75, 0.92],
      [2.08, 0.34],
    ];
    [-0.92, 0.92].forEach((fx) => {
      const fFender = createContouredBodyMesh(fenderProfileFront, 0.2, 0.06, 0.06, paintMat);
      fFender.position.x = fx;
      root.add(fFender);

      const rFender = createContouredBodyMesh(fenderProfileRear, 0.22, 0.07, 0.07, paintMat);
      rFender.position.x = fx;
      root.add(rFender);
    });

    // Aerodynamic Tear-Drop Glass Canopy (Transparent so Tan Leather seats show!)
    const canopyProfile: [number, number][] = [
      [-1.05, 0.78], // Raked front windshield base
      [-0.25, 1.24], // Roof peak
      [0.52, 1.20],  // Rear roof arch
      [1.55, 0.86],  // Sloped rear Louvered Engine Bay glass
    ];
    const glassCanopy = createContouredBodyMesh(canopyProfile, 0.74, 0.08, 0.1, glassMat);
    root.add(glassCanopy);

    // Roof panel strip in body paint
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.05, 0.76), paintMat);
    roofCap.position.set(0, 1.25, 0.12);
    root.add(roofCap);

    // Visible Interior Cockpit: 2 Tan Leather Bucket Seats + Dashboard + Steering Wheel
    [-0.34, 0.34].forEach((sx) => {
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), interiorLeatherMat);
      seatBack.position.set(sx, 0.82, 0.25);
      seatBack.rotation.x = 0.22;
      root.add(seatBack);

      const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), interiorLeatherMat);
      seatBase.position.set(sx, 0.56, 0.02);
      root.add(seatBase);
    });
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.22, 0.35), carbonMat);
    dash.position.set(0, 0.78, -0.58);
    root.add(dash);

    // Side Air Intakes (Ferrari F8 / Huracan signature side scoops)
    [-1.01, 1.01].forEach((sx) => {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.65), carbonMat);
      scoop.position.set(sx, 0.58, 0.48);
      root.add(scoop);

      // Wing Mirrors on stalks
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.14), paintMat);
      mirror.position.set(sx * 1.08, 0.94, -0.58);
      root.add(mirror);
    });

    // Dual White Racing Stripes for Apex R1 (Ferrari F8 Tributo 2023)
    if (car.stripeStyle === 'dual_white') {
      [-0.17, 0.17].forEach((sx) => {
        const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.35), accentMat);
        hoodStripe.position.set(sx, 0.72, -1.52);
        hoodStripe.rotation.x = 0.26;
        root.add(hoodStripe);

        const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.78), accentMat);
        roofStripe.position.set(sx, 1.27, 0.12);
        root.add(roofStripe);

        const rearStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.95), accentMat);
        rearStripe.position.set(sx, 0.92, 1.68);
        rearStripe.rotation.x = -0.08;
        root.add(rearStripe);
      });
    }

    // Front Carbon Splitter & Rear Diffuser Fins
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.06, 0.36), carbonMat);
    splitter.position.set(0, 0.2, -2.18);
    root.add(splitter);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.22, 0.25), carbonMat);
    diffuser.position.set(0, 0.28, 2.16);
    root.add(diffuser);

    // Sculpted Aerodynamic Rear Wing
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 0.28), paintMat);
    wingBlade.position.set(0, 1.06, 2.04);
    wingBlade.rotation.x = 0.12;
    root.add(wingBlade);
    [-0.55, 0.55].forEach((wx) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.2), carbonMat);
      strut.position.set(wx, 0.95, 2.0);
      root.add(strut);
    });

    // Swept LED Headlights & Y-DRLs
    [-0.74, 0.74].forEach((hx) => {
      const hlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.28), carbonMat);
      hlHousing.position.set(hx, 0.58, -2.06);
      hlHousing.rotation.y = hx < 0 ? 0.24 : -0.24;
      root.add(hlHousing);

      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.06), headlightGlowMat);
      ledStrip.position.set(hx, 0.6, -2.18);
      ledStrip.rotation.y = hx < 0 ? 0.24 : -0.24;
      root.add(ledStrip);
    });

    // Ferrari F8 Quad Round LED Taillights / Huracan Twin Blade Taillights
    [-0.72, -0.48, 0.48, 0.72].forEach((tx) => {
      const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 20), taillightMat);
      tl.rotation.x = Math.PI / 2;
      tl.position.set(tx, 0.74, 2.22);
      root.add(tl);
      taillightMeshes.push(tl);
    });
  } else if (style === 'jaguar_ftype') {
    // 2. BLUE JAGUAR F-TYPE CONVERTIBLE 2024 (Open-Top Roadster with Real Grille & Tan Seats)
    wheelRadius = 0.37;
    wheelWidth = 0.29;
    wheelX = 0.98;
    frontZ = -1.4;
    rearZ = 1.35;
    frontBumperZ = -2.26;
    rearBumperZ = 2.2;

    const roadsterProfile: [number, number][] = [
      [-2.22, 0.22],
      [-2.14, 0.54], // Jaguar oval grille front
      [-1.35, 0.76], // Long sculpted clamshell bonnet
      [-0.65, 0.82], // Cowl
      [0.85, 0.80],  // Open convertible beltline
      [1.65, 0.88],  // Rear deck haunches
      [2.16, 0.78],
      [2.20, 0.32],
    ];
    const body = createContouredBodyMesh(roadsterProfile, 0.98, 0.12, 0.14, paintMat);
    root.add(body);

    // Frameless Raked Convertible Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.46, 0.08), glassMat);
    windshield.position.set(0, 1.0, -0.58);
    windshield.rotation.x = -0.55;
    root.add(windshield);

    // Convertible Open Cockpit: Luxury Tan Leather Seats + Roll Hoops + Steering Wheel
    [-0.36, 0.36].forEach((sx) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.14), interiorLeatherMat);
      seat.position.set(sx, 0.88, 0.35);
      seat.rotation.x = 0.2;
      root.add(seat);

      const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 16), chromeMat);
      hoop.position.set(sx, 1.02, 0.56);
      root.add(hoop);
    });

    // Signature Jaguar Oval Mesh Grille with Chrome Surround
    const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.28, 0.08), chromeMat);
    grilleFrame.position.set(0, 0.46, -2.21);
    root.add(grilleFrame);
    const grilleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.22, 0.1), carbonMat);
    grilleMesh.position.set(0, 0.46, -2.22);
    root.add(grilleMesh);

    // Pixel-Slim J-Blade LED Headlights
    [-0.72, 0.72].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.24), headlightGlowMat);
      hl.position.set(hx, 0.62, -2.08);
      hl.rotation.y = hx < 0 ? 0.22 : -0.22;
      root.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.06), taillightMat);
      tl.position.set(hx, 0.72, 2.18);
      root.add(tl);
      taillightMeshes.push(tl);
    });
  } else if (style === 'fortuner_suv') {
    // 4. BLACK TOYOTA FORTUNER LEGENDER 2024 SUV (Tall Muscular SUV, Split Grille, Quad LED DRLs)
    wheelRadius = 0.45;
    wheelWidth = 0.32;
    wheelX = 1.04;
    frontZ = -1.48;
    rearZ = 1.44;
    frontBumperZ = -2.36;
    rearBumperZ = 2.34;

    const suvBodyProfile: [number, number][] = [
      [-2.32, 0.34],
      [-2.26, 1.06], // High muscular Fortuner Legender front fascia
      [-1.15, 1.16], // Hood
      [-0.45, 1.74], // Windshield top
      [1.85, 1.72],  // Floating roofline with rear spoiler
      [2.26, 1.12],  // Rear tailgate
      [2.32, 0.38],
    ];
    const suvBody = createContouredBodyMesh(suvBodyProfile, 1.04, 0.1, 0.12, paintMat);
    root.add(suvBody);

    // Wrap-around SUV Tinted Windows
    const suvGlass = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.48, 2.25), glassMat);
    suvGlass.position.set(0, 1.44, 0.68);
    root.add(suvGlass);

    // Chrome Roof Rails & Side Steps
    [-0.72, 0.72].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.95), chromeMat);
      rail.position.set(rx, 1.78, 0.72);
      root.add(rail);
    });

    // Fortuner Legender Split Mesh Grille & Chrome Boomerang Trim
    const upperGrille = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 0.08), carbonMat);
    upperGrille.position.set(0, 0.96, -2.31);
    root.add(upperGrille);

    const lowerGrille = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.34, 0.08), carbonMat);
    lowerGrille.position.set(0, 0.58, -2.32);
    root.add(lowerGrille);

    // Quad-Projector LED Headlights with Waterfall DRLs
    [-0.74, 0.74].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.12), headlightGlowMat);
      hl.position.set(hx, 0.98, -2.29);
      root.add(hl);

      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.12), drlAmberMat);
      drl.position.set(hx, 0.74, -2.31);
      root.add(drl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.11, 0.08), taillightMat);
      tl.position.set(hx, 1.12, 2.31);
      root.add(tl);
      taillightMeshes.push(tl);
    });
  } else if (style === 'mahindra_thar') {
    // 5. WHITE MAHINDRA THAR 2024 HARDTOP (Iconic 7-Slot Grille, Round Headlights, Black Fenders & Spare Tire)
    wheelRadius = 0.47;
    wheelWidth = 0.35;
    wheelX = 1.04;
    frontZ = -1.36;
    rearZ = 1.32;
    frontBumperZ = -2.18;
    rearBumperZ = 2.15;

    // White Lower Body & Hood
    const tharBodyProfile: [number, number][] = [
      [-2.05, 0.38],
      [-2.02, 1.12], // Upright 7-slot grille front
      [-0.85, 1.18], // Cowl
      [-0.82, 1.22],
      [1.92, 1.22],
      [1.95, 0.40],
    ];
    const tharLower = createContouredBodyMesh(tharBodyProfile, 0.94, 0.07, 0.08, paintMat);
    root.add(tharLower);

    // Matte Black Hardtop Cabin (Signature Thar contrast roof)
    const hardtop = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.68, 2.18), accentMat);
    hardtop.position.set(0, 1.52, 0.48);
    hardtop.castShadow = true;
    root.add(hardtop);

    // Front Windshield & Side Windows
    const tharWindshield = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.52, 0.08), glassMat);
    tharWindshield.position.set(0, 1.5, -0.58);
    tharWindshield.rotation.x = -0.14;
    root.add(tharWindshield);

    const tharSideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.44, 1.75), glassMat);
    tharSideGlass.position.set(0, 1.52, 0.58);
    root.add(tharSideGlass);

    // Muscular Matte-Black Offroad Fender Flares & Heavy-Duty Bumpers
    [-0.98, 0.98].forEach((fx) => {
      const fFlare = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.95), accentMat);
      fFlare.position.set(fx, 0.72, -1.36);
      root.add(fFlare);

      const rFlare = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.95), accentMat);
      rFlare.position.set(fx, 0.72, 1.32);
      root.add(rFlare);
    });

    const offroadBumperF = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.24, 0.28), accentMat);
    offroadBumperF.position.set(0, 0.44, -2.08);
    root.add(offroadBumperF);

    // Iconic 7-Slot Vertical Mahindra Thar Grille + THAR Logo Badge
    const grillePlate = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.56, 0.06), accentMat);
    grillePlate.position.set(0, 0.86, -2.04);
    root.add(grillePlate);
    for (let s = -3; s <= 3; s++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.08), chromeMat);
      slot.position.set(s * 0.12, 0.84, -2.06);
      root.add(slot);
    }

    // Classic Round LED Halo Headlamps
    [-0.56, 0.56].forEach((hx) => {
      const roundHl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.08, 24),
        headlightGlowMat
      );
      roundHl.rotation.x = Math.PI / 2;
      roundHl.position.set(hx, 0.88, -2.06);
      root.add(roundHl);
    });

    // Tailgate-Mounted Full-Size Offroad Spare Tyre
    const spareWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.3, 28),
      tireMat
    );
    spareWheel.position.set(0, 1.05, 2.06);
    spareWheel.rotation.x = Math.PI / 2;
    root.add(spareWheel);

    [-0.78, 0.78].forEach((tx) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.08), taillightMat);
      tl.position.set(tx, 0.92, 1.98);
      root.add(tl);
      taillightMeshes.push(tl);
    });
  } else if (style === 'truck' || style === 'bus') {
    // TITAN HAULER SEMI TRUCK & METRO EXPRESS COACH BUS
    wheelRadius = 0.48;
    wheelWidth = 0.34;
    wheelX = 1.12;
    frontZ = -1.95;
    rearZ = 1.95;
    frontBumperZ = -2.95;
    rearBumperZ = 2.95;

    const heavyBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.38, style === 'bus' ? 2.1 : 1.5, 5.8),
      paintMat
    );
    heavyBody.position.set(0, style === 'bus' ? 1.42 : 1.1, 0);
    heavyBody.castShadow = true;
    root.add(heavyBody);

    if (style === 'truck') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 2.3), paintMat);
      cab.position.set(0, 1.85, -1.35);
      cab.castShadow = true;
      root.add(cab);
    }

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.72, 0.1), glassMat);
    windshield.position.set(0, 1.88, -2.52);
    root.add(windshield);
  } else {
    // 6. CITY MOVER SEDAN (Executive RS Twin-Turbo Saloon)
    wheelRadius = 0.37;
    wheelWidth = 0.28;
    wheelX = 0.96;
    frontZ = -1.42;
    rearZ = 1.38;
    frontBumperZ = -2.28;
    rearBumperZ = 2.24;

    const sedanProfile: [number, number][] = [
      [-2.24, 0.24],
      [-2.16, 0.68],
      [-1.12, 0.84],
      [-0.42, 1.34],
      [0.85, 1.32],
      [1.68, 0.90],
      [2.20, 0.84],
      [2.22, 0.30],
    ];
    const sedanBody = createContouredBodyMesh(sedanProfile, 0.96, 0.1, 0.12, paintMat);
    root.add(sedanBody);

    const sedanGlass = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.42, 1.85), glassMat);
    sedanGlass.position.set(0, 1.14, 0.22);
    root.add(sedanGlass);

    [-0.72, 0.72].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.12), headlightGlowMat);
      hl.position.set(hx, 0.62, -2.2);
      root.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.08), taillightMat);
      tl.position.set(hx, 0.78, 2.2);
      root.add(tl);
      taillightMeshes.push(tl);
    });
  }

  // ==================== AUTHENTIC INDIAN HSRP NUMBER PLATES (Front & Rear) ====================
  const plateTex = getIndianNumberPlateTexture(car.numberPlate || 'MH 12 XR 8847');
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  const plateGeo = new THREE.PlaneGeometry(0.56, 0.125);

  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(0, 0.36, frontBumperZ - 0.02);
  frontPlate.rotation.y = Math.PI;
  root.add(frontPlate);

  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.48, rearBumperZ + 0.02);
  root.add(rearPlate);

  // ==================== BRAND EMBLEM BADGE ON HOOD / GRILLE ====================
  const badgeTex = getBadgeTexture(car.badgeType);
  const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true });
  const hoodBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), badgeMat);
  hoodBadge.position.set(
    0,
    style === 'fortuner_suv' || style === 'mahindra_thar' ? 0.98 : 0.62,
    frontBumperZ + 0.16
  );
  hoodBadge.rotation.x = -Math.PI / 2.6;
  hoodBadge.rotation.z = Math.PI;
  root.add(hoodBadge);

  // ==================== DETAILED WHEELS WITH GROOVED TREAD, 10-SPOKE RIMS & RED CALIPERS ====================
  const wheelZPositions =
    style === 'truck' ? [frontZ, 0.85, rearZ] : [frontZ, rearZ];

  wheelZPositions.forEach((wz) => {
    [-wheelX, wheelX].forEach((wx) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wx, wheelRadius, wz);

      // Grooved Rubber Tyre
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 32);
      tireGeo.rotateZ(Math.PI / 2);
      const tireMesh = new THREE.Mesh(tireGeo, tireMat);
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      // Metallic Outer Rim Lip
      const rimGeo = new THREE.CylinderGeometry(
        wheelRadius * 0.68,
        wheelRadius * 0.68,
        wheelWidth + 0.015,
        24
      );
      rimGeo.rotateZ(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rimMesh);

      // Ventilated Brake Disc + Red Brembo Brake Caliper
      const rotorGeo = new THREE.CylinderGeometry(
        wheelRadius * 0.52,
        wheelRadius * 0.52,
        wheelWidth * 0.4,
        20
      );
      rotorGeo.rotateZ(Math.PI / 2);
      const rotorMesh = new THREE.Mesh(rotorGeo, chromeMat);
      wheelGroup.add(rotorMesh);

      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(wheelWidth * 0.65, wheelRadius * 0.32, wheelRadius * 0.22),
        caliperMat
      );
      caliper.position.set(wx < 0 ? -0.04 : 0.04, wheelRadius * 0.28, -wheelRadius * 0.25);
      wheelGroup.add(caliper);

      // 5 Twin-Spokes (10 Spokes Total)
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(wheelWidth + 0.025, wheelRadius * 1.28, 0.045),
          chromeMat
        );
        spoke.rotation.x = (s * Math.PI) / 5;
        wheelGroup.add(spoke);
      }

      root.add(wheelGroup);
      wheels.push(wheelGroup);
    });
  });

  // ==================== VOLUMETRIC HEADLIGHT CONES & NITRO EXHAUST FLAMES ====================
  if (!isTrafficBot) {
    const coneGeo = new THREE.ConeGeometry(1.1, 7.5, 16, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    [-0.68, 0.68].forEach((hx) => {
      const beam = new THREE.Mesh(coneGeo, coneMat);
      beam.position.set(hx, 0.48, frontBumperZ - 3.6);
      root.add(beam);
      headlightBeams.push(beam);
    });

    const flameGeo = new THREE.ConeGeometry(0.16, 1.35, 12);
    flameGeo.rotateX(Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });

    [-0.45, 0.45].forEach((nx) => {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(nx, 0.34, rearBumperZ + 0.65);
      flame.visible = false;
      root.add(flame);
      nitroFlames.push(flame);
    });
  }

  // ==================== DETAILED INTERIOR DASHBOARD CLUSTER & INFOTAINMENT ====================
  if (style !== 'truck' && style !== 'bus') {
    const dashPodMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const dashCluster = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.04), dashPodMat);
    dashCluster.position.set(-0.34, 0.88, -0.58);
    dashCluster.rotation.x = -0.25;
    root.add(dashCluster);

    const infotainment = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    infotainment.position.set(0.0, 0.85, -0.56);
    infotainment.rotation.x = -0.2;
    root.add(infotainment);
  }

  // ==================== LEFT & RIGHT ORANGE BLINKING TURN INDICATOR LIGHTS (Fix 8) ====================
  const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xff8c00 });
  const indFrontGeo = new THREE.BoxGeometry(0.18, 0.055, 0.08);
  const indRearGeo = new THREE.BoxGeometry(0.22, 0.065, 0.08);

  // Front Left & Rear Left Orange Turn Signals
  const frontLeftInd = new THREE.Mesh(indFrontGeo, indicatorMat);
  frontLeftInd.position.set(-0.84, 0.52, frontBumperZ + 0.06);
  frontLeftInd.visible = false;
  root.add(frontLeftInd);
  leftIndicators.push(frontLeftInd);

  const rearLeftInd = new THREE.Mesh(indRearGeo, indicatorMat);
  rearLeftInd.position.set(-0.84, 0.66, rearBumperZ - 0.02);
  rearLeftInd.visible = false;
  root.add(rearLeftInd);
  leftIndicators.push(rearLeftInd);

  // Front Right & Rear Right Orange Turn Signals
  const frontRightInd = new THREE.Mesh(indFrontGeo, indicatorMat);
  frontRightInd.position.set(0.84, 0.52, frontBumperZ + 0.06);
  frontRightInd.visible = false;
  root.add(frontRightInd);
  rightIndicators.push(frontRightInd);

  const rearRightInd = new THREE.Mesh(indRearGeo, indicatorMat);
  rearRightInd.position.set(0.84, 0.66, rearBumperZ - 0.02);
  rearRightInd.visible = false;
  root.add(rearRightInd);
  rightIndicators.push(rearRightInd);

  return {
    root,
    bodyGroup: root,
    wheels,
    frontWheels: wheels.slice(0, 2),
    nitroFlames,
    headlightBeams,
    taillightMeshes,
    brakeLights: taillightMeshes,
    leftIndicators,
    rightIndicators,
  };
}
