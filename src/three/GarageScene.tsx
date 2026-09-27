import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CAR_ROSTER, GraphicsQuality } from '../data/carData';
import { buildVehicleMesh, getShowroomEnvMap } from './CarMeshBuilder';

interface GarageSceneProps {
  selectedCarId: string;
  graphicsQuality: GraphicsQuality;
  displayMode: 'lineup5' | 'single360';
  spinTriggerCount?: number;
  isPopupOpen?: boolean;
  onSelectCar?: (carId: string) => void;
}

export const GarageScene: React.FC<GarageSceneProps> = ({
  selectedCarId,
  graphicsQuality,
  displayMode,
  spinTriggerCount = 0,
  isPopupOpen = false,
  onSelectCar,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedCarIdRef = useRef(selectedCarId);
  selectedCarIdRef.current = selectedCarId;
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const isPopupOpenRef = useRef(isPopupOpen);
  isPopupOpenRef.current = isPopupOpen;
  const onSelectCarRef = useRef(onSelectCar);
  onSelectCarRef.current = onSelectCar;
  const spinBurstRef = useRef(0);

  useEffect(() => {
    if (spinTriggerCount > 0) {
      // Trigger a smooth 360-degree showcase spin impulse when user clicks a car card
      spinBurstRef.current = Math.PI * 2;
    }
  }, [spinTriggerCount, selectedCarId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7dd3fc); // Bright sky blue outside
    scene.environment = getShowroomEnvMap();

    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260
    );
    camera.position.set(-4.0, 2.5, 11.6);
    camera.lookAt(3.1, 1.0, -1.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: graphicsQuality !== 'Low',
      powerPreference: 'high-performance',
    });
    const maxDpr =
      graphicsQuality === 'High'
        ? Math.min(window.devicePixelRatio, 2)
        : graphicsQuality === 'Med'
          ? 1.25
          : 1;
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = graphicsQuality !== 'Low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Bright Day Garage Lighting: Ambient + Hemisphere + Directional Sun Light
    const ambientLight = new THREE.AmbientLight(0xe0f2fe, 1.05);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.1);
    scene.add(hemiLight);

    // Directional Sun Light streaming through open shutter
    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.6);
    sunLight.position.set(24, 15, 10);
    sunLight.castShadow = graphicsQuality !== 'Low';
    sunLight.shadow.mapSize.width = graphicsQuality === 'High' ? 2048 : 1024;
    sunLight.shadow.mapSize.height = graphicsQuality === 'High' ? 2048 : 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 65;
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 16;
    sunLight.shadow.camera.bottom = -16;
    scene.add(sunLight);

    // Showroom Ceiling Spot/Point Lights
    const showroomLight1 = new THREE.PointLight(0xffffff, 2.2, 28);
    showroomLight1.position.set(1.2, 5.6, 2.8);
    scene.add(showroomLight1);

    const showroomLight2 = new THREE.PointLight(0xe0f2fe, 2.2, 28);
    showroomLight2.position.set(7.2, 5.6, -1.2);
    scene.add(showroomLight2);

    // Polished Concrete Garage Floor with Real Reflections
    const floorGeo = new THREE.PlaneGeometry(80, 55);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x323944,
      metalness: 0.65,
      roughness: 0.09,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMap: getShowroomEnvMap(),
      envMapIntensity: 1.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Bright Sunlight Reflection Sheen on Polished Floor near Open Shutter
    const sheenGeo = new THREE.PlaneGeometry(28, 30);
    const sheenMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.22,
    });
    const sheen = new THREE.Mesh(sheenGeo, sheenMat);
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(12.5, 0.008, -2);
    scene.add(sheen);

    // Garage Walls & Industrial Roof
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x47505e,
      roughness: 0.65,
      metalness: 0.22,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.45,
      metalness: 0.65,
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8.5, 0.5), wallMat);
    backWall.position.set(-4.8, 4.2, -8.6);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8.5, 30), wallMat);
    leftWall.position.set(-16.5, 4.2, 2);
    scene.add(leftWall);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(68, 44), darkSteelMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(2, 6.9, 0);
    scene.add(ceiling);

    const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let z = -6; z <= 8; z += 4.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(42, 0.28, 0.28), darkSteelMat);
      beam.position.set(2, 6.35, z);
      scene.add(beam);

      for (let x = -6; x <= 10; x += 6.5) {
        const ledTube = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.09, 0.16), ledMat);
        ledTube.position.set(x, 6.16, z);
        scene.add(ledTube);
      }
    }

    // Open Garage Shutter on Right showing Bright City Skyline Outside
    const shutterMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.55,
      roughness: 0.35,
    });
    const shutterRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 15.0, 20),
      shutterMat
    );
    shutterRoll.rotation.z = Math.PI / 2;
    shutterRoll.position.set(14.5, 5.4, -8.3);
    scene.add(shutterRoll);

    const shutterPanel = new THREE.Mesh(new THREE.BoxGeometry(15.0, 1.3, 0.25), shutterMat);
    shutterPanel.position.set(14.5, 4.65, -8.3);
    scene.add(shutterPanel);

    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 8.5, 0.65), darkSteelMat);
    pillarL.position.set(7.0, 4.2, -8.3);
    scene.add(pillarL);

    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 8.5, 0.65), darkSteelMat);
    pillarR.position.set(22.0, 4.2, -8.3);
    scene.add(pillarR);

    // Garage Tool Racks, Tire Racks & Mechanic Cabinets
    const tirePropMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.6, 0.8), darkSteelMat);
    rackFrame.position.set(-4.2, 1.8, -7.9);
    scene.add(rackFrame);

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16), tirePropMat);
        t.rotation.z = Math.PI / 2;
        t.position.set(-5.1 + col * 0.55, 1.2 + row * 1.3, -7.85);
        scene.add(t);
      }
    }

    const redCabinetMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      metalness: 0.35,
      roughness: 0.35,
    });
    const toolCabinet1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.8), redCabinetMat);
    toolCabinet1.position.set(-1.2, 0.65, -7.95);
    scene.add(toolCabinet1);

    const toolCabinet2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 0.8), redCabinetMat);
    toolCabinet2.position.set(4.0, 0.65, -7.95);
    scene.add(toolCabinet2);

    // Outdoor Bright Daytime City Skyline & Sun Disk
    const outdoorGround = new THREE.Mesh(
      new THREE.PlaneGeometry(95, 65),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55 })
    );
    outdoorGround.rotation.x = -Math.PI / 2;
    outdoorGround.position.set(20, -0.02, -35);
    scene.add(outdoorGround);

    const sunDisk = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sunDisk.position.set(28, 16, -42);
    scene.add(sunDisk);

    const buildingColors = [0x94a3b8, 0xcbd5e1, 0x64748b, 0xe2e8f0, 0x38bdf8];
    const buildingSpecs = [
      { x: 8.5, z: -26, w: 3.6, h: 15, d: 3.5 },
      { x: 13.0, z: -30, w: 4.3, h: 22, d: 4.0 },
      { x: 18.0, z: -28, w: 3.9, h: 19, d: 3.8 },
      { x: 23.0, z: -32, w: 4.6, h: 24, d: 4.2 },
      { x: 27.5, z: -25, w: 3.7, h: 16, d: 3.5 },
      { x: 15.5, z: -22, w: 3.3, h: 10, d: 3.0 },
      { x: 20.8, z: -21, w: 3.5, h: 11.5, d: 3.0 },
    ];
    buildingSpecs.forEach((b, idx) => {
      const bMat = new THREE.MeshStandardMaterial({
        color: buildingColors[idx % buildingColors.length],
        metalness: 0.4,
        roughness: 0.28,
      });
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bMat);
      bMesh.position.set(b.x, b.h / 2, b.z);
      scene.add(bMesh);
    });

    // Trees & Cones outside shutter
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    [9.8, 14.8, 19.4].forEach((tx) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.8, 8), trunkMat);
      trunk.position.set(tx, 0.9, -15);
      scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 12), foliageMat);
      crown.position.set(tx, 2.2, -15);
      scene.add(crown);
    });

    // 5-Car Lineup Positions spaced ~3 units apart with Scale 1.18 in the Clean 70% Center Space
    const carPositions: { x: number; z: number; rotY: number }[] = [
      { x: -0.45, z: 3.25, rotY: Math.PI - 0.52 }, // 0: Apex R1 (Ferrari F8 Red w/ White Stripes)
      { x: 2.20, z: 1.80, rotY: Math.PI - 0.52 },  // 1: Vortex Blue (Blue Jaguar F-Type)
      { x: 4.85, z: 0.35, rotY: Math.PI - 0.52 },  // 2: Nova Yellow (Yellow Lamborghini Huracan)
      { x: 7.55, z: -1.10, rotY: Math.PI - 0.52 }, // 3: Shadow SUV (Black Fortuner Legender)
      { x: 10.30, z: -2.55, rotY: Math.PI - 0.52 },// 4: Thar 4x4 (White Mahindra Thar)
      { x: 13.20, z: -4.00, rotY: Math.PI - 0.52 },// 5: City Mover
      { x: 16.50, z: -5.50, rotY: Math.PI - 0.52 },// 6: Titan Hauler
      { x: 20.00, z: -7.00, rotY: Math.PI - 0.52 },// 7: Metro Express
      { x: -3.20, z: 4.70, rotY: Math.PI - 0.52 }, // 8: Pulse GT
      { x: -5.95, z: 6.15, rotY: Math.PI - 0.52 }, // 9: Hyperion X
    ];

    const carMeshes: Record<
      string,
      { group: THREE.Group; slotIdx: number; basePos: { x: number; z: number }; baseRotY: number }
    > = {};
    const clickableGroups: { carId: string; group: THREE.Group }[] = [];

    const shadowDecalMat = new THREE.MeshBasicMaterial({
      color: 0x060911,
      transparent: true,
      opacity: 0.58,
    });

    CAR_ROSTER.forEach((car, idx) => {
      const built = buildVehicleMesh(car, false);
      const slot = carPositions[idx] || { x: idx * 2.8, z: 0, rotY: Math.PI - 0.52 };
      built.root.position.set(slot.x, 0, slot.z);
      built.root.rotation.y = slot.rotY;
      // Scale 1.15 for bold 80% showroom presence
      built.root.scale.setScalar(1.15);

      // Soft contact shadow plate under car on polished concrete floor
      const shadowPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4.9), shadowDecalMat);
      shadowPlate.rotation.x = -Math.PI / 2;
      shadowPlate.position.set(0, 0.012, 0);
      built.root.add(shadowPlate);

      scene.add(built.root);
      carMeshes[car.id] = {
        group: built.root,
        slotIdx: idx,
        basePos: { x: slot.x, z: slot.z },
        baseRotY: slot.rotY,
      };
      clickableGroups.push({ carId: car.id, group: built.root });
    });

    // Glowing Selection Ring & Showroom Turntable Platform under the active car
    const podiumGeo = new THREE.CylinderGeometry(2.75, 2.95, 0.08, 64);
    const podiumMat = new THREE.MeshPhysicalMaterial({
      color: 0x111827,
      metalness: 0.85,
      roughness: 0.08,
      clearcoat: 1.0,
      envMap: getShowroomEnvMap(),
      envMapIntensity: 1.5,
    });
    const turntablePodium = new THREE.Mesh(podiumGeo, podiumMat);
    turntablePodium.position.set(2.4, 0.02, 1.4);
    turntablePodium.receiveShadow = true;
    scene.add(turntablePodium);

    const ringGeo = new THREE.RingGeometry(2.45, 2.72, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.position.set(2.4, 0.068, 1.4);
    scene.add(selectionRing);

    // Interactive Click-to-Select Car + Orbit Drag (Disabled when any popup is open!)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isDragging = false;
    let downX = 0;
    let prevX = 0;
    let userOrbitOffset = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (isPopupOpenRef.current) return;
      isDragging = true;
      downX = e.clientX;
      prevX = e.clientX;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || isPopupOpenRef.current) return;
      const dx = e.clientX - prevX;
      prevX = e.clientX;
      userOrbitOffset = Math.max(-3.2, Math.min(3.2, userOrbitOffset - dx * 0.009));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (isPopupOpenRef.current) return;

      if (Math.abs(e.clientX - downX) < 6 && onSelectCarRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        for (const item of clickableGroups) {
          if (!item.group.visible) continue;
          const intersects = raycaster.intersectObjects(item.group.children, true);
          if (intersects.length > 0) {
            onSelectCarRef.current(item.carId);
            break;
          }
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const currentCamPos = new THREE.Vector3(-4.0, 2.5, 11.6);
    const currentLookAt = new THREE.Vector3(3.1, 1.0, -1.2);
    let turntableAngle = Math.PI - 0.52;

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const activeId = selectedCarIdRef.current;
      const mode = displayModeRef.current;
      const targetCar = carMeshes[activeId];

      // Decay any showcase spin impulse triggered when clicking a car card
      if (spinBurstRef.current > 0.01) {
        spinBurstRef.current = Math.max(0, spinBurstRef.current - dt * 6.5);
      } else {
        spinBurstRef.current = 0;
      }

      // Update visibility & rotation based on mode ('lineup5' vs 'single360')
      const deg15PerSec = (15 * Math.PI) / 180; // 15 deg/sec continuous Y rotation
      turntableAngle += deg15PerSec * dt;

      turntablePodium.visible = mode === 'single360';

      Object.entries(carMeshes).forEach(([carId, entry]) => {
        if (mode === 'single360') {
          // Only show 1 car at a time (currently equipped/selected) in showroom center, rotating 15 deg/sec
          const isSelected = carId === activeId;
          entry.group.visible = isSelected;
          if (isSelected) {
            entry.group.position.set(2.4, 0.06, 1.4);
            entry.group.scale.setScalar(1.32);
            entry.group.rotation.y = turntableAngle + spinBurstRef.current;
          }
        } else {
          // 5-Car Lineup Mode: Show the 5 hero cars side by side (plus any selected car 6-10)
          entry.group.visible = entry.slotIdx <= 4 || carId === activeId;
          entry.group.position.set(entry.basePos.x, 0, entry.basePos.z);
          entry.group.scale.setScalar(1.15);
          if (carId === activeId) {
            entry.group.rotation.y = entry.baseRotY + spinBurstRef.current;
          } else {
            entry.group.rotation.y = entry.baseRotY;
          }
        }
      });

      if (targetCar) {
        const activePos = targetCar.group.position;
        selectionRing.position.x += (activePos.x - selectionRing.position.x) * 0.16;
        selectionRing.position.z += (activePos.z - selectionRing.position.z) * 0.16;
        ringMat.opacity = 0.55 + Math.sin(elapsed * 4) * 0.25;

        let desiredCamX = -4.0 + userOrbitOffset;
        let desiredCamZ = 11.6;
        let desiredLookX = 3.1;
        let desiredLookZ = -1.2;

        if (mode === 'single360') {
          desiredCamX = 0.2 + userOrbitOffset;
          desiredCamZ = 8.4;
          desiredLookX = 2.4;
          desiredLookZ = 1.0;
        } else if (targetCar.slotIdx <= 4) {
          desiredCamX = -4.0 + targetCar.slotIdx * 0.16 + userOrbitOffset;
          desiredCamZ = 11.6 - targetCar.slotIdx * 0.08;
          desiredLookX = 3.1 + targetCar.slotIdx * 0.2;
          desiredLookZ = -1.2 - targetCar.slotIdx * 0.1;
        } else {
          desiredCamX = targetCar.basePos.x - 3.6 + userOrbitOffset;
          desiredCamZ = targetCar.basePos.z + 7.2;
          desiredLookX = targetCar.basePos.x + 0.5;
          desiredLookZ = targetCar.basePos.z - 0.5;
        }

        currentCamPos.x += (desiredCamX - currentCamPos.x) * 0.08;
        currentCamPos.y += (2.45 + Math.sin(elapsed * 0.7) * 0.03 - currentCamPos.y) * 0.08;
        currentCamPos.z += (desiredCamZ - currentCamPos.z) * 0.08;

        currentLookAt.x += (desiredLookX - currentLookAt.x) * 0.08;
        currentLookAt.y += (1.02 - currentLookAt.y) * 0.08;
        currentLookAt.z += (desiredLookZ - currentLookAt.z) * 0.08;

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);
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
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    };
  }, [graphicsQuality]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full relative overflow-hidden ${
        isPopupOpen ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'
      }`}
      aria-label="3D Daytime Premium Garage Showroom"
    />
  );
};
