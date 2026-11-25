import * as THREE from 'three';
import { CHASSIS_SPECS, VehicleConfig } from './types';

export interface BuiltCar {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  frontSteerPivots: [THREE.Group, THREE.Group];
  wheelSpinGroups: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  brakeDiscMaterials: THREE.MeshStandardMaterial[];
  taillightMaterial: THREE.MeshStandardMaterial;
  exhaustFlames: [THREE.Mesh, THREE.Mesh];
  headlightSpot: THREE.SpotLight | null;
  dispose: () => void;
}

function createCarbonTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14161b';
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = (x + y) % 16 === 0 ? '#1f232c' : '#101216';
      ctx.fillRect(x, y, 4, 8);
      ctx.fillStyle = (x + y) % 16 === 0 ? '#272c38' : '#171920';
      ctx.fillRect(x + 4, y, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createLiveryTexture(
  config: VehicleConfig,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = config.primaryColor;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle metallic clearcoat gradient depth
  const sheen = ctx.createLinearGradient(0, 0, 1024, 1024);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 1024, 1024);

  if (config.livery === 'stripe') {
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(432, 0, 64, 1024);
    ctx.fillRect(528, 0, 64, 1024);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(422, 0, 6, 1024);
    ctx.fillRect(596, 0, 6, 1024);
  } else if (config.livery === 'apex') {
    ctx.fillStyle = config.accentColor;
    ctx.beginPath();
    ctx.moveTo(0, 720);
    ctx.lineTo(1024, 320);
    ctx.lineTo(1024, 470);
    ctx.lineTo(0, 870);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, 890);
    ctx.lineTo(1024, 490);
    ctx.lineTo(1024, 560);
    ctx.lineTo(0, 960);
    ctx.closePath();
    ctx.fill();
  } else if (config.livery === 'checker') {
    ctx.fillStyle = config.accentColor;
    const size = 64;
    for (let y = 640; y < 1024; y += size) {
      for (let x = 0; x < 1024; x += size) {
        if (((x / size) + (y / size)) % 2 === 0) {
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  }

  // Subtle bodywork panel shutlines (hood seam & intake vents)
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(220, 40, 584, 360);
  ctx.beginPath();
  ctx.moveTo(220, 620);
  ctx.lineTo(804, 620);
  ctx.stroke();

  // Racing number roundel
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(512, 512, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 104px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(config.racingNumber).padStart(2, '0'), 512, 516);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export function buildVehicleMesh(
  config: VehicleConfig,
  options: {
    isSoftwareGl: boolean;
    maxAnisotropy: number;
    isGhost?: boolean;
    enableHeadlights?: boolean;
  }
): BuiltCar {
  const spec = CHASSIS_SPECS[config.chassis];
  const { isSoftwareGl, maxAnisotropy, isGhost = false, enableHeadlights = false } = options;
  const disposables: Array<{ dispose: () => void }> = [];

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const halfL = spec.bodyLengthM * 0.5;
  const halfW = spec.bodyWidthM * 0.5;
  const wheelRadius = spec.wheelRadius;
  const wheelWidth = spec.wheelWidth;
  const frontAxleZ = spec.wheelbaseM * 0.5;
  const rearAxleZ = -spec.wheelbaseM * 0.5;
  const isFormula = spec.vehicleClass === 'formula';
  const isMuscle = spec.vehicleClass === 'muscle';
  const isRally = spec.vehicleClass === 'rally';
  const isHypercar = spec.vehicleClass === 'hypercar';
  const rideY = spec.rideHeightOffset;

  const wheelTrackHalf = isFormula
    ? spec.trackWidthM * 0.5
    : spec.trackWidthM * 0.5 + 0.08;

  // Materials
  const carbonTex = createCarbonTexture(maxAnisotropy);
  const liveryTex = createLiveryTexture(config, maxAnisotropy);
  disposables.push(carbonTex, liveryTex);

  let paintMat: THREE.Material;
  if (isGhost) {
    paintMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.75,
      transparent: true,
      opacity: 0.38,
      roughness: 0.2,
      metalness: 0.3,
      depthWrite: false,
    });
  } else {
    const isMatte = config.paintFinish === 'matte';
    const isPearl = config.paintFinish === 'pearl';
    paintMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: config.livery === 'clean' ? null : liveryTex,
      roughness: isMatte ? 0.58 : isPearl ? 0.16 : 0.24,
      metalness: isMatte ? 0.32 : isPearl ? 0.72 : 0.85,
      clearcoat: isMatte ? 0.08 : 1.0,
      clearcoatRoughness: isMatte ? 0.6 : 0.08,
      iridescence: isPearl ? 0.75 : 0.0,
      iridescenceIOR: 1.4,
    });
    if (config.livery === 'clean') {
      (paintMat as THREE.MeshPhysicalMaterial).color.set(config.primaryColor);
    }
  }
  disposables.push(paintMat);

  const carbonMat = new THREE.MeshStandardMaterial({
    map: isGhost ? null : carbonTex,
    color: isGhost ? 0x0891b2 : 0xffffff,
    roughness: 0.34,
    metalness: 0.28,
    transparent: isGhost,
    opacity: isGhost ? 0.32 : 1,
    depthWrite: !isGhost,
  });
  disposables.push(carbonMat);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: isGhost ? 0x67e8f9 : 0x0b1320,
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1.0,
    transmission: isSoftwareGl || isGhost ? 0 : 0.52,
    ior: 1.52,
    thickness: 0.4,
    transparent: true,
    opacity: isGhost ? 0.28 : isSoftwareGl ? 0.55 : 1,
    depthWrite: false,
  });
  disposables.push(glassMat);

  const metalTrimMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x22d3ee : 0xdbe3ee,
    roughness: 0.18,
    metalness: 0.94,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1,
  });
  disposables.push(metalTrimMat);

  const tireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x0e7490 : 0x16181d,
    roughness: 0.86,
    metalness: 0.05,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x67e8f9 : config.rimColor,
    roughness: 0.2,
    metalness: 0.9,
    transparent: isGhost,
    opacity: isGhost ? 0.45 : 1,
  });
  disposables.push(tireMat, rimMat);

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.0,
    roughness: 0.15,
  });
  disposables.push(taillightMaterial, headlightMat);

  // 1. Contact Shadow Plane (grounded at y = 0.03)
  if (!isGhost) {
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(spec.bodyWidthM * 1.35, spec.bodyLengthM * 1.16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = 0.03;
    root.add(shadowMesh);
    disposables.push(shadowTex, shadowGeo, shadowMat);
  }

  // Helper to normalize UVs for extruded hull parts
  const applyHullUvs = (geo: THREE.BufferGeometry, w: number) => {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      uv.setXY(i, (px + w * 0.5) / w, (pz + halfL) / spec.bodyLengthM);
    }
    uv.needsUpdate = true;
  };

  if (isFormula) {
    // === OPEN-WHEEL FORMULA SILHOUETTE ===
    // Slender center monocoque tub + tapered nosecone
    const tubShape = new THREE.Shape();
    tubShape.moveTo(-halfL + 0.25, 0.18 + rideY);
    tubShape.lineTo(halfL - 0.1, 0.14 + rideY);
    tubShape.lineTo(halfL, 0.24 + rideY);
    tubShape.lineTo(halfL - 0.65, 0.42 + rideY);
    tubShape.lineTo(0.45, 0.58 + rideY);
    tubShape.lineTo(-0.35, 0.60 + rideY);
    tubShape.lineTo(-0.65, 0.88 + rideY);
    tubShape.lineTo(-halfL + 0.45, 0.74 + rideY);
    tubShape.lineTo(-halfL + 0.20, 0.36 + rideY);
    tubShape.closePath();

    const tubWidth = 0.64;
    const tubGeo = new THREE.ExtrudeGeometry(tubShape, {
      depth: tubWidth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    tubGeo.translate(0, 0, -tubWidth * 0.5);
    tubGeo.rotateY(-Math.PI / 2);
    tubGeo.computeVertexNormals();
    applyHullUvs(tubGeo, tubWidth);

    const tubMesh = new THREE.Mesh(tubGeo, paintMat);
    tubMesh.castShadow = !isGhost;
    bodyPivot.add(tubMesh);
    disposables.push(tubGeo);

    // Sculpted Sidepods (L/R)
    const podGeo = new THREE.BoxGeometry(0.44, 0.38, 1.85);
    const podL = new THREE.Mesh(podGeo, paintMat);
    podL.position.set(-0.56, 0.36 + rideY, -0.35);
    podL.castShadow = !isGhost;
    const podR = new THREE.Mesh(podGeo, paintMat);
    podR.position.set(0.56, 0.36 + rideY, -0.35);
    podR.castShadow = !isGhost;
    bodyPivot.add(podL, podR);

    // Carbon Floor Plank
    const floorGeo = new THREE.BoxGeometry(1.48, 0.04, 2.55);
    const floorPlank = new THREE.Mesh(floorGeo, carbonMat);
    floorPlank.position.set(0, 0.14 + rideY, -0.38);
    bodyPivot.add(floorPlank);

    // Multi-Element Front Wing + Endplates
    const fWingGeo = new THREE.BoxGeometry(spec.bodyWidthM + 0.06, 0.05, 0.48);
    const fWing = new THREE.Mesh(fWingGeo, carbonMat);
    fWing.position.set(0, 0.16 + rideY, halfL - 0.12);
    fWing.castShadow = !isGhost;

    const fEndGeo = new THREE.BoxGeometry(0.04, 0.24, 0.54);
    const fEndL = new THREE.Mesh(fEndGeo, paintMat);
    fEndL.position.set(-(spec.bodyWidthM + 0.04) * 0.5, 0.25 + rideY, halfL - 0.12);
    const fEndR = new THREE.Mesh(fEndGeo, paintMat);
    fEndR.position.set((spec.bodyWidthM + 0.04) * 0.5, 0.25 + rideY, halfL - 0.12);
    bodyPivot.add(fWing, fEndL, fEndR);

    // Exposed Carbon Suspension Wishbones (4 corners)
    const armGeo = new THREE.BoxGeometry(wheelTrackHalf - 0.25, 0.035, 0.12);
    for (const [sx, az] of [
      [-1, frontAxleZ],
      [1, frontAxleZ],
      [-1, rearAxleZ],
      [1, rearAxleZ],
    ]) {
      const armTop = new THREE.Mesh(armGeo, carbonMat);
      armTop.position.set(sx * (wheelTrackHalf * 0.52), wheelRadius + 0.07, az);
      const armBot = new THREE.Mesh(armGeo, carbonMat);
      armBot.position.set(sx * (wheelTrackHalf * 0.52), wheelRadius - 0.07, az);
      bodyPivot.add(armTop, armBot);
    }

    // Driver Helmet + Titanium Halo Safety Hoop + Overhead T-Cam
    const helmetGeo = new THREE.SphereGeometry(0.16, 16, 14);
    const helmet = new THREE.Mesh(helmetGeo, glassMat);
    helmet.position.set(0, 0.64 + rideY, spec.cabinOffsetZ - 0.05);

    const haloGeo = new THREE.TorusGeometry(0.24, 0.032, 10, 20, Math.PI);
    haloGeo.rotateX(Math.PI / 2);
    const halo = new THREE.Mesh(haloGeo, carbonMat);
    halo.position.set(0, 0.68 + rideY, spec.cabinOffsetZ + 0.08);

    const tCamGeo = new THREE.BoxGeometry(0.32, 0.04, 0.12);
    const tCam = new THREE.Mesh(tCamGeo, carbonMat);
    tCam.position.set(0, 0.94 + rideY, -0.62);

    // Single central exhaust + rain taillight
    const exGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.26, 14);
    exGeo.rotateX(Math.PI / 2);
    const exCenter = new THREE.Mesh(exGeo, metalTrimMat);
    exCenter.position.set(0, 0.28 + rideY, -halfL + 0.12);

    const rainLightGeo = new THREE.BoxGeometry(0.12, 0.14, 0.08);
    const rainLight = new THREE.Mesh(rainLightGeo, taillightMaterial);
    rainLight.position.set(0, 0.38 + rideY, -halfL + 0.08);

    bodyPivot.add(helmet, halo, tCam, exCenter, rainLight);
    disposables.push(
      podGeo,
      floorGeo,
      fWingGeo,
      fEndGeo,
      armGeo,
      helmetGeo,
      haloGeo,
      tCamGeo,
      exGeo,
      rainLightGeo
    );
  } else {
    // === CLOSED-WHEEL SILHOUETTES (GT / MUSCLE / RALLY / HYPERCAR) ===
    const hullShape = new THREE.Shape();
    if (isMuscle) {
      // Boxy muscular long-hood fastback
      hullShape.moveTo(-halfL + 0.08, 0.22 + rideY);
      hullShape.lineTo(halfL - 0.08, 0.22 + rideY);
      hullShape.lineTo(halfL, 0.44 + rideY);
      hullShape.lineTo(halfL - 0.06, 0.72 + rideY);
      hullShape.lineTo(0.45, 0.78 + rideY);
      hullShape.lineTo(-0.35, 0.84 + rideY);
      hullShape.lineTo(-halfL + 0.12, 0.86 + rideY);
      hullShape.lineTo(-halfL, 0.42 + rideY);
      hullShape.closePath();
    } else if (isRally) {
      // Compact raised rally stance with steeper nose & tall tail
      hullShape.moveTo(-halfL + 0.14, 0.24 + rideY);
      hullShape.lineTo(halfL - 0.14, 0.24 + rideY);
      hullShape.lineTo(halfL, 0.42 + rideY);
      hullShape.lineTo(halfL - 0.18, 0.66 + rideY);
      hullShape.lineTo(0.48, 0.82 + rideY);
      hullShape.lineTo(-halfL + 0.45, 0.88 + rideY);
      hullShape.lineTo(-halfL + 0.08, 0.84 + rideY);
      hullShape.lineTo(-halfL, 0.44 + rideY);
      hullShape.closePath();
    } else if (isHypercar) {
      // Aggressive low-slung wedge with sculpted rear deck
      hullShape.moveTo(-halfL + 0.10, 0.18 + rideY);
      hullShape.lineTo(halfL - 0.18, 0.17 + rideY);
      hullShape.lineTo(halfL, 0.28 + rideY);
      hullShape.lineTo(halfL - 0.26, 0.50 + rideY);
      hullShape.lineTo(0.42, 0.68 + rideY);
      hullShape.lineTo(-0.42, 0.74 + rideY);
      hullShape.lineTo(-halfL + 0.08, 0.70 + rideY);
      hullShape.lineTo(-halfL, 0.34 + rideY);
      hullShape.closePath();
    } else {
      // Balanced GT endurance coupe
      hullShape.moveTo(-halfL + 0.12, 0.20 + rideY);
      hullShape.lineTo(halfL - 0.20, 0.19 + rideY);
      hullShape.lineTo(halfL, 0.34 + rideY);
      hullShape.lineTo(halfL - 0.18, 0.58 - spec.noseSlope * 0.25 + rideY);
      hullShape.lineTo(halfL * 0.35, 0.74 + rideY);
      hullShape.lineTo(spec.cabinOffsetZ + 0.55, 0.80 + rideY);
      hullShape.lineTo(-halfL * 0.45, 0.84 + rideY);
      hullShape.lineTo(-halfL + 0.05, 0.76 + rideY);
      hullShape.lineTo(-halfL, 0.40 + rideY);
      hullShape.closePath();
    }

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: spec.bodyWidthM - 0.18,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.09,
    });
    hullGeo.translate(0, 0, -(spec.bodyWidthM - 0.18) * 0.5);
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.computeVertexNormals();
    applyHullUvs(hullGeo, spec.bodyWidthM);

    const hullMesh = new THREE.Mesh(hullGeo, paintMat);
    hullMesh.castShadow = !isGhost;
    hullMesh.receiveShadow = !isGhost;
    bodyPivot.add(hullMesh);
    disposables.push(hullGeo);

    // Greenhouse / Cabin Canopy
    const cabinShape = new THREE.Shape();
    const cOff = spec.cabinOffsetZ;
    if (isMuscle) {
      cabinShape.moveTo(cOff - 1.32, 0.82 + rideY);
      cabinShape.lineTo(cOff + 0.72, 0.78 + rideY);
      cabinShape.lineTo(cOff + 0.28, spec.bodyHeightM + rideY);
      cabinShape.lineTo(cOff - 0.62, spec.bodyHeightM - 0.01 + rideY);
    } else if (isRally) {
      cabinShape.moveTo(cOff - 1.25, 0.84 + rideY);
      cabinShape.lineTo(cOff + 0.82, 0.80 + rideY);
      cabinShape.lineTo(cOff + 0.34, spec.bodyHeightM + rideY);
      cabinShape.lineTo(cOff - 0.88, spec.bodyHeightM - 0.03 + rideY);
    } else {
      cabinShape.moveTo(cOff - 1.08, 0.74 + rideY);
      cabinShape.lineTo(cOff + 0.92, 0.72 + rideY);
      cabinShape.lineTo(cOff + 0.36, spec.bodyHeightM + rideY);
      cabinShape.lineTo(cOff - 0.52, spec.bodyHeightM - 0.02 + rideY);
    }
    cabinShape.closePath();

    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
      depth: spec.bodyWidthM * (isHypercar ? 0.58 : 0.65),
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.08,
    });
    cabinGeo.translate(0, 0, -spec.bodyWidthM * (isHypercar ? 0.29 : 0.325));
    cabinGeo.rotateY(-Math.PI / 2);
    cabinGeo.computeVertexNormals();
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.renderOrder = 2;
    bodyPivot.add(cabinMesh);
    disposables.push(cabinGeo);

    // Roof Cap
    const roofGeo = new THREE.BoxGeometry(spec.bodyWidthM * 0.58, 0.07, isRally ? 1.15 : 0.88);
    const roofMesh = new THREE.Mesh(roofGeo, paintMat);
    roofMesh.position.set(0, spec.bodyHeightM + 0.03 + rideY, cOff - (isRally ? 0.22 : 0.08));
    roofMesh.castShadow = !isGhost;
    bodyPivot.add(roofMesh);
    disposables.push(roofGeo);

    // Class-Specific Signature Aero / Body Details
    if (isMuscle) {
      // Supercharger Hood Blower Scoop + Fastback Louvers
      const blowerGeo = new THREE.BoxGeometry(0.48, 0.22, 0.68);
      const blower = new THREE.Mesh(blowerGeo, metalTrimMat);
      blower.position.set(0, 0.86 + rideY, halfL * 0.48);
      const intakeRingGeo = new THREE.BoxGeometry(0.42, 0.14, 0.08);
      const intakeFront = new THREE.Mesh(intakeRingGeo, taillightMaterial);
      intakeFront.position.set(0, 0.89 + rideY, halfL * 0.48 + 0.35);

      const louverGeo = new THREE.BoxGeometry(spec.bodyWidthM * 0.54, 0.03, 0.12);
      for (let l = 0; l < 4; l++) {
        const louver = new THREE.Mesh(louverGeo, carbonMat);
        louver.position.set(0, 0.96 - l * 0.04 + rideY, cOff - 0.82 - l * 0.18);
        louver.rotation.x = 0.22;
        bodyPivot.add(louver);
      }
      bodyPivot.add(blower, intakeFront);
      disposables.push(blowerGeo, intakeRingGeo, louverGeo);
    } else if (isRally) {
      // Roof Quad Rally Light Pod + Rally Scoop + 4 Mudflaps
      const podBarGeo = new THREE.BoxGeometry(1.12, 0.14, 0.24);
      const podBar = new THREE.Mesh(podBarGeo, carbonMat);
      podBar.position.set(0, spec.bodyHeightM + 0.13 + rideY, cOff + 0.32);
      const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12);
      lampGeo.rotateX(Math.PI / 2);
      for (let lx = -0.39; lx <= 0.40; lx += 0.26) {
        const lamp = new THREE.Mesh(lampGeo, headlightMat);
        lamp.position.set(lx, spec.bodyHeightM + 0.13 + rideY, cOff + 0.45);
        bodyPivot.add(lamp);
      }
      const flapGeo = new THREE.BoxGeometry(0.32, 0.24, 0.04);
      for (const [fx, fz] of [
        [-wheelTrackHalf, frontAxleZ - 0.38],
        [wheelTrackHalf, frontAxleZ - 0.38],
        [-wheelTrackHalf, rearAxleZ - 0.38],
        [wheelTrackHalf, rearAxleZ - 0.38],
      ]) {
        const flap = new THREE.Mesh(flapGeo, carbonMat);
        flap.position.set(fx, 0.22 + rideY, fz);
        bodyPivot.add(flap);
      }
      bodyPivot.add(podBar);
      disposables.push(podBarGeo, lampGeo, flapGeo);
    } else if (isHypercar) {
      // Dorsal Aero Shark Fin + Side Aero Vent Blades
      const finGeo = new THREE.BoxGeometry(0.045, 0.30, 1.32);
      const fin = new THREE.Mesh(finGeo, carbonMat);
      fin.position.set(0, spec.bodyHeightM - 0.02 + rideY, cOff - 0.95);
      fin.rotation.x = 0.22;

      const bladeSideGeo = new THREE.BoxGeometry(0.10, 0.32, 0.95);
      const sideL = new THREE.Mesh(bladeSideGeo, carbonMat);
      sideL.position.set(-halfW + 0.03, 0.44 + rideY, -0.15);
      const sideR = new THREE.Mesh(bladeSideGeo, carbonMat);
      sideR.position.set(halfW - 0.03, 0.44 + rideY, -0.15);
      bodyPivot.add(fin, sideL, sideR);
      disposables.push(finGeo, bladeSideGeo);
    } else {
      // GT Roof Scoop
      const scoopGeo = new THREE.BoxGeometry(0.32, 0.12, 0.56);
      const scoopMesh = new THREE.Mesh(scoopGeo, carbonMat);
      scoopMesh.position.set(0, spec.bodyHeightM + 0.1 + rideY, cOff - 0.2);
      bodyPivot.add(scoopMesh);
      disposables.push(scoopGeo);
    }

    // Splitter, Skirts, Diffuser, Mirrors
    const splitterGeo = new THREE.BoxGeometry(spec.bodyWidthM + 0.08, 0.06, 0.62);
    const splitter = new THREE.Mesh(splitterGeo, carbonMat);
    splitter.position.set(0, 0.17 + rideY, halfL - 0.14);
    splitter.castShadow = !isGhost;

    const skirtGeo = new THREE.BoxGeometry(0.14, 0.08, spec.wheelbaseM - 0.65);
    const skirtL = new THREE.Mesh(skirtGeo, carbonMat);
    skirtL.position.set(-halfW + 0.02, 0.17 + rideY, 0);
    const skirtR = new THREE.Mesh(skirtGeo, carbonMat);
    skirtR.position.set(halfW - 0.02, 0.17 + rideY, 0);

    const diffuserGeo = new THREE.BoxGeometry(spec.bodyWidthM * 0.84, 0.16, 0.45);
    const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
    diffuser.position.set(0, 0.22 + rideY, -halfL + 0.1);

    // Diffuser aero strakes (3 vertical blades)
    const strakeGeo = new THREE.BoxGeometry(0.035, 0.15, 0.42);
    for (const sx of [-0.36, 0, 0.36]) {
      const strake = new THREE.Mesh(strakeGeo, carbonMat);
      strake.position.set(sx, 0.19 + rideY, -halfL + 0.04);
      bodyPivot.add(strake);
    }

    // Interior cockpit driver seat + roll-cage silhouette visible through canopy
    const seatGeo = new THREE.BoxGeometry(0.44, 0.46, 0.36);
    const seatMesh = new THREE.Mesh(seatGeo, carbonMat);
    seatMesh.position.set(0, 0.78 + rideY, cOff - 0.15);
    const rollBarGeo = new THREE.TorusGeometry(0.32, 0.025, 8, 16, Math.PI);
    const rollBar = new THREE.Mesh(rollBarGeo, metalTrimMat);
    rollBar.position.set(0, 0.84 + rideY, cOff - 0.35);

    const mirrorGeo = new THREE.BoxGeometry(0.24, 0.1, 0.16);
    const mirrorL = new THREE.Mesh(mirrorGeo, carbonMat);
    mirrorL.position.set(-halfW + 0.02, 0.84 + rideY, cOff + 0.35);
    const mirrorR = new THREE.Mesh(mirrorGeo, carbonMat);
    mirrorR.position.set(halfW - 0.02, 0.84 + rideY, cOff + 0.35);

    bodyPivot.add(splitter, skirtL, skirtR, diffuser, seatMesh, rollBar, mirrorL, mirrorR);
    disposables.push(splitterGeo, skirtGeo, diffuserGeo, strakeGeo, seatGeo, rollBarGeo, mirrorGeo);

    // Headlight DRLs & Full-Width Taillight Blade
    const headGeo = new THREE.BoxGeometry(0.42, 0.07, 0.12);
    const headL = new THREE.Mesh(headGeo, headlightMat);
    headL.position.set(-halfW + 0.36, 0.50 + rideY, halfL - 0.06);
    const headR = new THREE.Mesh(headGeo, headlightMat);
    headR.position.set(halfW - 0.36, 0.50 + rideY, halfL - 0.06);

    const tailGeo = new THREE.BoxGeometry(spec.bodyWidthM * 0.78, 0.07, 0.08);
    const tailBar = new THREE.Mesh(tailGeo, taillightMaterial);
    tailBar.position.set(0, 0.62 + rideY, -halfL + 0.02);
    bodyPivot.add(headL, headR, tailBar);
    disposables.push(headGeo, tailGeo);
  }

  // Forward SpotLight Headlight Cone (castShadow = false to keep single shadow caster budget)
  let headlightSpot: THREE.SpotLight | null = null;
  if (enableHeadlights && !isGhost) {
    headlightSpot = new THREE.SpotLight(0xe0f2fe, 0, 72, 0.48, 0.65, 1.3);
    headlightSpot.castShadow = false;
    headlightSpot.position.set(0, 0.56 + rideY, halfL - 0.1);
    headlightSpot.target.position.set(0, 0.1, halfL + 24);
    bodyPivot.add(headlightSpot);
    bodyPivot.add(headlightSpot.target);
  }

  // Twin Titanium Exhausts + Dual-Core Backfire Flames (all classes)
  const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.24, 14);
  exhaustGeo.rotateX(Math.PI / 2);
  const exOffsetX = isFormula ? 0.14 : 0.34;
  const exY = 0.24 + rideY;
  const exhaustL = new THREE.Mesh(exhaustGeo, metalTrimMat);
  exhaustL.position.set(-exOffsetX, exY, -halfL - 0.02);
  const exhaustR = new THREE.Mesh(exhaustGeo, metalTrimMat);
  exhaustR.position.set(exOffsetX, exY, -halfL - 0.02);
  bodyPivot.add(exhaustL, exhaustR);

  const flameGeo = new THREE.ConeGeometry(0.095, 0.54, 12);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
  });
  const coreGeo = new THREE.ConeGeometry(0.045, 0.32, 10);
  coreGeo.rotateX(-Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(-exOffsetX, exY, -halfL - 0.34);
  flameL.visible = false;
  flameL.add(new THREE.Mesh(coreGeo, coreMat));
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(exOffsetX, exY, -halfL - 0.34);
  flameR.visible = false;
  flameR.add(new THREE.Mesh(coreGeo, coreMat));
  bodyPivot.add(flameL, flameR);
  disposables.push(exhaustGeo, flameGeo, flameMat, coreGeo, coreMat);

  // Customizable Rear Aero Wing (adapted to Formula vs Closed-Wheel deck height)
  const wingGroup = new THREE.Group();
  const baseDeckY = (isFormula ? 0.56 : 0.78) + rideY;
  if (config.wing === 'lip' && !isFormula) {
    const lipGeo = new THREE.BoxGeometry(spec.bodyWidthM * 0.82, 0.09, 0.22);
    const lip = new THREE.Mesh(lipGeo, carbonMat);
    lip.position.set(0, baseDeckY + 0.04, -halfL + 0.16);
    wingGroup.add(lip);
    disposables.push(lipGeo);
  } else {
    const isDual = config.wing === 'timeattack' || (isFormula && config.wing !== 'lip');
    const wingW = isFormula
      ? 1.38
      : isDual
        ? spec.bodyWidthM + 0.14
        : spec.bodyWidthM * 0.94;
    const wingY = (isFormula ? 1.06 : isDual ? 1.24 : 1.08) + rideY;
    const pylonGeo = new THREE.BoxGeometry(0.05, Math.max(0.2, wingY - baseDeckY), 0.24);
    const pylonSpan = isFormula ? 0.24 : 0.46;
    const pylonL = new THREE.Mesh(pylonGeo, carbonMat);
    pylonL.position.set(-pylonSpan, baseDeckY + (wingY - baseDeckY) * 0.5, -halfL + 0.22);
    const pylonR = new THREE.Mesh(pylonGeo, carbonMat);
    pylonR.position.set(pylonSpan, baseDeckY + (wingY - baseDeckY) * 0.5, -halfL + 0.22);

    const bladeGeo = new THREE.BoxGeometry(wingW, 0.05, isDual ? 0.36 : 0.28);
    const bladeMain = new THREE.Mesh(bladeGeo, carbonMat);
    bladeMain.position.set(0, wingY, -halfL + 0.14);
    bladeMain.rotation.x = 0.14;
    bladeMain.castShadow = !isGhost;

    const endplateGeo = new THREE.BoxGeometry(0.04, isDual ? 0.34 : 0.22, isDual ? 0.44 : 0.34);
    const endL = new THREE.Mesh(endplateGeo, paintMat);
    endL.position.set(-wingW * 0.5, wingY + 0.02, -halfL + 0.14);
    const endR = new THREE.Mesh(endplateGeo, paintMat);
    endR.position.set(wingW * 0.5, wingY + 0.02, -halfL + 0.14);

    wingGroup.add(pylonL, pylonR, bladeMain, endL, endR);
    disposables.push(pylonGeo, bladeGeo, endplateGeo);

    if (isDual) {
      const upperGeo = new THREE.BoxGeometry(wingW * 0.96, 0.04, 0.20);
      const upper = new THREE.Mesh(upperGeo, paintMat);
      upper.position.set(0, wingY + 0.14, -halfL + 0.02);
      upper.rotation.x = 0.24;
      wingGroup.add(upper);
      disposables.push(upperGeo);
    }
  }
  bodyPivot.add(wingGroup);

  // 4 Wheel Assemblies (Tire + Customizable Rim + Glowing Brake Rotor)
  const tireGeoFront = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  tireGeoFront.rotateZ(Math.PI / 2);
  const rearW = isMuscle || isFormula ? wheelWidth * 1.18 : wheelWidth;
  const tireGeoRear = new THREE.CylinderGeometry(wheelRadius, wheelRadius, rearW, 24);
  tireGeoRear.rotateZ(Math.PI / 2);

  const rimBarrelGeo = new THREE.CylinderGeometry(wheelRadius * 0.7, wheelRadius * 0.7, wheelWidth + 0.01, 20);
  rimBarrelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, wheelWidth + 0.04, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.04, wheelRadius * 1.32, 0.045);
  const rimLipGeo = new THREE.TorusGeometry(wheelRadius * 0.69, 0.024, 8, 22);
  rimLipGeo.rotateY(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(wheelRadius * 0.56, wheelRadius * 0.56, 0.05, 18);
  discGeo.rotateZ(Math.PI / 2);
  const caliperGeo = new THREE.BoxGeometry(0.08, 0.15, 0.11);
  const caliperMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x22d3ee : 0xdc2626,
    roughness: 0.28,
    metalness: 0.6,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1,
  });
  disposables.push(
    tireGeoFront,
    tireGeoRear,
    rimBarrelGeo,
    hubGeo,
    spokeGeo,
    rimLipGeo,
    discGeo,
    caliperGeo,
    caliperMat
  );

  const frontSteerPivots: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];
  const brakeDiscMaterials: THREE.MeshStandardMaterial[] = [];

  const wheelPositions: Array<[number, number, boolean]> = [
    [-wheelTrackHalf, frontAxleZ, true],
    [wheelTrackHalf, frontAxleZ, true],
    [-wheelTrackHalf, rearAxleZ, false],
    [wheelTrackHalf, rearAxleZ, false],
  ];

  for (const [wx, wz, isFront] of wheelPositions) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, wheelRadius, wz);
    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);

    const wW = isFront ? wheelWidth : rearW;
    const tire = new THREE.Mesh(isFront ? tireGeoFront : tireGeoRear, tireMat);
    tire.castShadow = !isGhost;
    spinGroup.add(tire);

    const sideSign = wx < 0 ? -1 : 1;

    // Stationary performance brake caliper mounted to knuckle (does not spin)
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(sideSign * 0.02, 0.02, isFront ? -wheelRadius * 0.44 : wheelRadius * 0.44);
    steerPivot.add(caliper);

    // Brake disc inside wheel
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0xff4500,
      emissiveIntensity: 0,
    });
    brakeDiscMaterials.push(discMat);
    disposables.push(discMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.x = -sideSign * 0.04;
    spinGroup.add(disc);

    // Rim styling + machined outer lip
    const hub = new THREE.Mesh(hubGeo, rimMat);
    spinGroup.add(hub);
    const rimLip = new THREE.Mesh(rimLipGeo, metalTrimMat);
    rimLip.position.x = sideSign * (wW * 0.45);
    spinGroup.add(rimLip);

    if (config.rims === 'turbofan') {
      const fan = new THREE.Mesh(rimBarrelGeo, rimMat);
      fan.scale.set(0.25, 0.96, 0.96);
      fan.position.x = sideSign * (wW * 0.42);
      spinGroup.add(fan);
    } else {
      const spokeCount = config.rims === 'forged5' ? 5 : 8;
      for (let s = 0; s < spokeCount; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.position.x = sideSign * (wW * 0.44);
        spoke.rotation.x = (s / spokeCount) * Math.PI;
        spinGroup.add(spoke);
      }
    }

    root.add(steerPivot);
    if (isFront) {
      frontSteerPivots.push(steerPivot);
    }
    wheelSpinGroups.push(spinGroup);
  }

  return {
    root,
    bodyPivot,
    frontSteerPivots: [frontSteerPivots[0], frontSteerPivots[1]],
    wheelSpinGroups: [
      wheelSpinGroups[0],
      wheelSpinGroups[1],
      wheelSpinGroups[2],
      wheelSpinGroups[3],
    ],
    brakeDiscMaterials,
    taillightMaterial,
    exhaustFlames: [flameL, flameR],
    headlightSpot,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
