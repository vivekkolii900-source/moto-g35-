import * as THREE from 'three';
import { TRACK_SPECS, TrackId, TrackSpec } from './types';

export interface TrackSample {
  t: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  curvature: number; // signed curvature for AI & curb generation
  distFromStart: number;
}

export interface TrackProjection {
  t: number;
  sampleIndex: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralOffset: number; // +right, -left
  roadY: number;
  onAsphalt: boolean;
  onCurb: boolean;
  offTrack: boolean;
  wallPenetration: number; // > 0 when hitting outer barrier
  curvature: number;
}

export interface TrackData {
  spec: TrackSpec;
  curve: THREE.CatmullRomCurve3;
  samples: TrackSample[];
  totalLength: number;
  halfWidth: number;
  barrierOffset: number;
  minimapPoints: Array<{ x: number; z: number }>;
  minimapBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const _up = new THREE.Vector3(0, 1, 0);

function getControlPoints(trackId: TrackId): THREE.Vector3[] {
  if (trackId === 'redstone') {
    // High-speed canyon & ridge circuit (~1580m) with sweeping esses, crest, and hairpin
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.4, -140),
      new THREE.Vector3(24, 3.2, -255),
      new THREE.Vector3(105, 7.5, -310),
      new THREE.Vector3(195, 11.0, -270),
      new THREE.Vector3(230, 8.2, -165),
      new THREE.Vector3(175, 4.0, -90),
      new THREE.Vector3(210, 2.5, 5),
      new THREE.Vector3(285, 5.5, 95),
      new THREE.Vector3(255, 7.8, 210),
      new THREE.Vector3(145, 4.2, 245),
      new THREE.Vector3(75, 1.5, 180),
      new THREE.Vector3(15, 0.2, 130),
    ];
  }

  // Neon Harbor Street (~1440m) — fast harborfront straight, technical 90s, wide bay sweep
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -165),
    new THREE.Vector3(52, 0.2, -228),
    new THREE.Vector3(155, 1.5, -228),
    new THREE.Vector3(215, 3.8, -165),
    new THREE.Vector3(215, 2.2, -55),
    new THREE.Vector3(145, 0.4, -5),
    new THREE.Vector3(145, 0.0, 90),
    new THREE.Vector3(215, 0.0, 165),
    new THREE.Vector3(155, 0.0, 240),
    new THREE.Vector3(45, 0.0, 215),
    new THREE.Vector3(0, 0.0, 135),
  ];
}

export function buildTrackData(trackId: TrackId): TrackData {
  const spec = TRACK_SPECS[trackId];
  const controlPts = getControlPoints(trackId);
  const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();
  const sampleCount = 720;
  const samples: TrackSample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, _up).normalize();
    samples.push({
      t,
      point,
      tangent,
      right,
      curvature: 0,
      distFromStart: t * totalLength,
    });
  }

  // Compute signed horizontal curvature for each sample
  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 2 + sampleCount) % sampleCount];
    const next = samples[(i + 2) % sampleCount];
    const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
    const ds = (4 / sampleCount) * totalLength;
    samples[i].curvature = dTan.dot(samples[i].right) / Math.max(ds, 1);
  }

  const minimapPoints: Array<{ x: number; z: number }> = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < sampleCount; i += 4) {
    const p = samples[i].point;
    minimapPoints.push({ x: p.x, z: p.z });
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const halfWidth = spec.roadWidth * 0.5;
  const barrierOffset = halfWidth + 4.8;

  return {
    spec,
    curve,
    samples,
    totalLength,
    halfWidth,
    barrierOffset,
    minimapPoints,
    minimapBounds: { minX, maxX, minZ, maxZ },
  };
}

export function projectToTrack(
  track: TrackData,
  x: number,
  z: number,
  hintIndex?: number
): TrackProjection {
  const { samples, halfWidth, barrierOffset } = track;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    const window = 45;
    for (let offset = -window; offset <= window; offset++) {
      const idx = (hintIndex + offset + n) % n;
      const p = samples[idx].point;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
  }

  // Fallback global search if car jumped far away
  if (bestDistSq > 1600 || hintIndex === undefined) {
    bestDistSq = Infinity;
    for (let i = 0; i < n; i++) {
      const p = samples[i].point;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const sCurr = samples[bestIdx];
  const sNext = samples[(bestIdx + 1) % n];
  const sPrev = samples[(bestIdx - 1 + n) % n];

  const dx = x - sCurr.point.x;
  const dz = z - sCurr.point.z;
  const forwardProj = dx * sCurr.tangent.x + dz * sCurr.tangent.z;

  let interpSample = sCurr;
  let frac = 0;
  if (forwardProj > 0) {
    const segLen = sCurr.point.distanceTo(sNext.point);
    frac = THREE.MathUtils.clamp(forwardProj / Math.max(segLen, 0.01), 0, 1);
    interpSample = sCurr;
  } else {
    const segLen = sPrev.point.distanceTo(sCurr.point);
    frac = -THREE.MathUtils.clamp(-forwardProj / Math.max(segLen, 0.01), 0, 1);
  }

  const neighbor = frac >= 0 ? sNext : sPrev;
  const alpha = Math.abs(frac);

  const point = new THREE.Vector3().lerpVectors(interpSample.point, neighbor.point, alpha);
  const tangent = new THREE.Vector3().lerpVectors(interpSample.tangent, neighbor.tangent, alpha).normalize();
  const right = new THREE.Vector3().crossVectors(tangent, _up).normalize();

  const relX = x - point.x;
  const relZ = z - point.z;
  const lateralOffset = relX * right.x + relZ * right.z;

  const absLat = Math.abs(lateralOffset);
  const onCurb = absLat > halfWidth - 0.6 && absLat <= halfWidth + 1.1 && Math.abs(sCurr.curvature) > 0.004;
  const onAsphalt = absLat <= halfWidth;
  const offTrack = absLat > halfWidth + 0.4;
  const wallPenetration = Math.max(0, absLat - barrierOffset);

  let t = (bestIdx + frac) / n;
  if (t < 0) t += 1;
  if (t >= 1) t -= 1;

  return {
    t,
    sampleIndex: bestIdx,
    point,
    tangent,
    right,
    lateralOffset,
    roadY: point.y,
    onAsphalt,
    onCurb,
    offTrack,
    wallPenetration,
    curvature: sCurr.curvature,
  };
}

function createAsphaltTextures(
  maxAnisotropy: number,
  isNight: boolean
): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 512;
  const rCtx = rCanvas.getContext('2d')!;

  ctx.fillStyle = isNight ? '#191e28' : '#24272e';
  ctx.fillRect(0, 0, 1024, 1024);

  rCtx.fillStyle = isNight ? '#6e6e6e' : '#b8b8b8';
  rCtx.fillRect(0, 0, 512, 512);

  // Deterministic PRNG for clean, artifact-free aggregate grain
  let seed = isNight ? 9021 : 31415;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Multi-scale asphalt aggregate & micro-pebbles
  for (let i = 0; i < 42000; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const v = isNight ? 18 + rand() * 34 : 26 + rand() * 42;
    ctx.fillStyle = `rgb(${v | 0},${v | 0},${(v + 4) | 0})`;
    ctx.fillRect(x, y, 2, 2);
  }

  for (let i = 0; i < 12000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const rv = isNight ? 70 + rand() * 75 : 140 + rand() * 75;
    rCtx.fillStyle = `rgb(${rv | 0},${rv | 0},${rv | 0})`;
    rCtx.fillRect(x, y, 2, 2);
  }

  // Rubber racing groove near center + polished specular sheen in roughnessMap
  const groove = ctx.createLinearGradient(0, 0, 1024, 0);
  groove.addColorStop(0, 'rgba(0,0,0,0)');
  groove.addColorStop(0.22, 'rgba(8,8,12,0.28)');
  groove.addColorStop(0.5, 'rgba(5,5,9,0.38)');
  groove.addColorStop(0.78, 'rgba(8,8,12,0.28)');
  groove.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = groove;
  ctx.fillRect(0, 0, 1024, 1024);

  const rGroove = rCtx.createLinearGradient(0, 0, 512, 0);
  rGroove.addColorStop(0, 'rgba(0,0,0,0)');
  rGroove.addColorStop(0.3, isNight ? 'rgba(35,35,35,0.45)' : 'rgba(95,95,95,0.35)');
  rGroove.addColorStop(0.5, isNight ? 'rgba(28,28,28,0.55)' : 'rgba(80,80,80,0.42)');
  rGroove.addColorStop(0.7, isNight ? 'rgba(35,35,35,0.45)' : 'rgba(95,95,95,0.35)');
  rGroove.addColorStop(1, 'rgba(0,0,0,0)');
  rCtx.fillStyle = rGroove;
  rCtx.fillRect(0, 0, 512, 512);

  // Subtle tarmac seam cracks
  ctx.fillStyle = 'rgba(10, 12, 16, 0.35)';
  ctx.fillRect(340, 0, 2, 1024);
  ctx.fillRect(682, 0, 2, 1024);

  // Crisp FIA outer track boundary white lines
  ctx.fillStyle = 'rgba(241, 245, 249, 0.90)';
  ctx.fillRect(28, 0, 20, 1024);
  ctx.fillRect(976, 0, 20, 1024);

  // Subtle dashed center guideline
  ctx.fillStyle = isNight ? 'rgba(56, 189, 248, 0.36)' : 'rgba(248, 250, 252, 0.24)';
  for (let y = 0; y < 1024; y += 128) {
    ctx.fillRect(506, y, 12, 56);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, roughnessMap };
}

function createSkyscraperTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 512);

  let seed = 7711;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 12; y < 500; y += 14) {
    for (let x = 10; x < 246; x += 16) {
      const r = rand();
      if (r < 0.28) {
        ctx.fillStyle = r < 0.14 ? '#38bdf8' : r < 0.22 ? '#fde68a' : '#94a3b8';
        ctx.fillRect(x, y, 10, 7);
      } else {
        ctx.fillStyle = '#182338';
        ctx.fillRect(x, y, 10, 7);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBrakeMarkerTexture(label: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 54px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSkyDome(track: TrackData): { mesh: THREE.Mesh; dispose: () => void } {
  const geo = new THREE.SphereGeometry(980, 32, 20);
  const isNight = track.spec.ambientTone === 'night';
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(track.spec.skyTopColor) },
      horizonColor: { value: new THREE.Color(track.spec.skyHorizonColor) },
      sunDir: {
        value: new THREE.Vector3(isNight ? -0.4 : 0.65, isNight ? 0.22 : 0.18, isNight ? -0.75 : 0.55).normalize(),
      },
      sunColor: { value: new THREE.Color(isNight ? 0x38bdf8 : 0xffb36b) },
      sunStrength: { value: isNight ? 0.28 : 0.72 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float sunStrength;
      varying vec3 vWorldDir;
      void main() {
        float h = clamp(vWorldDir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.58));
        float sunDot = max(dot(normalize(vWorldDir), sunDir), 0.0);
        col += sunColor * pow(sunDot, 24.0) * sunStrength;
        col += sunColor * pow(sunDot, 220.0) * (sunStrength * 1.4);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

function createCurbTexture(maxAnisotropy: number, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const stripeA = isNight ? '#06b6d4' : '#dc2626';
  const stripeB = '#f1f5f9';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? stripeA : stripeB;
    ctx.fillRect(0, i * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCheckeredTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const w = 512 / cols;
  const h = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(c * w, r * h, w, h);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildRibbonGeometry(
  track: TrackData,
  leftOffset: number,
  rightOffset: number,
  yOffset: number,
  uvRepeatPerMeter: number,
  filterFn?: (sample: TrackSample) => boolean
): THREE.BufferGeometry {
  const { samples, totalLength } = track;
  const n = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const dist = i === n ? totalLength : s.distFromStart;
    const v = dist * uvRepeatPerMeter;

    const pL = new THREE.Vector3().copy(s.point).addScaledVector(s.right, leftOffset);
    const pR = new THREE.Vector3().copy(s.point).addScaledVector(s.right, rightOffset);
    pL.y += yOffset;
    pR.y += yOffset;

    positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, v, 1, v);

    if (i < n) {
      if (!filterFn || filterFn(s)) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBarrierGeometry(
  track: TrackData,
  lateralOffset: number,
  height: number
): THREE.BufferGeometry {
  const { samples } = track;
  const n = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const thickness = 0.45;
  const sign = lateralOffset > 0 ? 1 : -1;

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const inner = new THREE.Vector3().copy(s.point).addScaledVector(s.right, lateralOffset);
    const outer = new THREE.Vector3().copy(s.point).addScaledVector(s.right, lateralOffset + sign * thickness);

    // 4 vertices per cross section: inner-bottom, inner-top, outer-top, outer-bottom
    positions.push(
      inner.x, inner.y - 0.2, inner.z,
      inner.x, inner.y + height, inner.z,
      outer.x, outer.y + height, outer.z,
      outer.x, outer.y - 0.2, outer.z
    );
    const v = i * 0.2;
    uvs.push(0, v, 0.5, v, 0.75, v, 1, v);

    if (i < n) {
      const a = i * 4;
      const b = (i + 1) * 4;
      if (sign > 0) {
        // inner face
        indices.push(a, a + 1, b, a + 1, b + 1, b);
        // top face
        indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        // outer face
        indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      } else {
        indices.push(a, b, a + 1, a + 1, b, b + 1);
        indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
        indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface TvCameraAnchor {
  pos: THREE.Vector3;
  trackT: number;
}

export function buildTrackEnvironment(
  track: TrackData,
  maxAnisotropy: number
): {
  group: THREE.Group;
  startLights: THREE.Mesh[];
  tvCameraAnchors: TvCameraAnchor[];
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const isNight = track.spec.ambientTone === 'night';

  // 0. Atmospheric Procedural Sky Dome
  const skyDome = createSkyDome(track);
  group.add(skyDome.mesh);
  disposables.push(skyDome);

  // 1. Extensive Ground / Terrain Mesh (never boxed in!)
  const terrainGeo = new THREE.PlaneGeometry(2400, 2400, 96, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const baseCol = new THREE.Color(track.spec.groundColor);
  const ridgeCol = new THREE.Color(isNight ? '#1c2436' : '#734b38');
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const proj = projectToTrack(track, vx, vz);
    const absLat = Math.abs(proj.lateralOffset);

    let y = proj.roadY - 0.35;
    if (absLat > track.barrierOffset + 6) {
      const distOut = absLat - (track.barrierOffset + 6);
      const hill =
        Math.sin(vx * 0.012) * Math.cos(vz * 0.012) * 14 +
        Math.sin(vx * 0.028 + vz * 0.02) * 5;
      const blend = Math.min(1, distOut / 65);
      if (isNight) {
        y = -0.6;
      } else {
        y = THREE.MathUtils.lerp(proj.roadY - 0.35, Math.max(-2, hill + 6), blend);
      }
      tmpCol.copy(baseCol).lerp(ridgeCol, blend * 0.85);
    } else {
      tmpCol.copy(baseCol);
    }
    posAttr.setY(i, y);
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.04,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // Harbor water plane on Neon Harbor
  if (isNight) {
    const waterGeo = new THREE.PlaneGeometry(2400, 2400);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x071324,
      roughness: 0.12,
      metalness: 0.85,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -1.2;
    group.add(water);
    disposables.push(waterGeo, waterMat);
  }

  // 2. Runoff / Shoulder Apron (slightly below asphalt to avoid Z-fighting)
  const runoffGeo = buildRibbonGeometry(
    track,
    -track.barrierOffset - 0.5,
    track.barrierOffset + 0.5,
    -0.06,
    0.05
  );
  const runoffMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1e2533 : 0x5c4a3c,
    roughness: 0.92,
    metalness: 0.05,
  });
  const runoffMesh = new THREE.Mesh(runoffGeo, runoffMat);
  runoffMesh.receiveShadow = true;
  group.add(runoffMesh);
  disposables.push(runoffGeo, runoffMat);

  // 3. Main Asphalt Ribbon (1024px albedo + linear roughnessMap)
  const asphaltTex = createAsphaltTextures(maxAnisotropy, isNight);
  const roadGeo = buildRibbonGeometry(track, -track.halfWidth, track.halfWidth, 0.02, 0.08);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex.map,
    roughnessMap: asphaltTex.roughnessMap,
    roughness: isNight ? 0.56 : 0.82,
    metalness: isNight ? 0.18 : 0.06,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  disposables.push(asphaltTex.map, asphaltTex.roughnessMap, roadGeo, roadMat);

  // 4. FIA Apex Curbs on corners
  const curbTex = createCurbTexture(maxAnisotropy, isNight);
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: 0.55,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const leftCurbGeo = buildRibbonGeometry(
    track,
    -track.halfWidth - 1.05,
    -track.halfWidth + 0.35,
    0.045,
    0.22,
    (s) => Math.abs(s.curvature) > 0.0045
  );
  const rightCurbGeo = buildRibbonGeometry(
    track,
    track.halfWidth - 0.35,
    track.halfWidth + 1.05,
    0.045,
    0.22,
    (s) => Math.abs(s.curvature) > 0.0045
  );
  const leftCurb = new THREE.Mesh(leftCurbGeo, curbMat);
  const rightCurb = new THREE.Mesh(rightCurbGeo, curbMat);
  leftCurb.receiveShadow = true;
  rightCurb.receiveShadow = true;
  group.add(leftCurb, rightCurb);
  disposables.push(curbTex, curbMat, leftCurbGeo, rightCurbGeo);

  // 5. Safety Guardrail Barriers
  const barrierMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x334155 : 0x94a3b8,
    roughness: 0.45,
    metalness: 0.55,
  });
  const leftBarrierGeo = buildBarrierGeometry(track, -track.barrierOffset, 1.15);
  const rightBarrierGeo = buildBarrierGeometry(track, track.barrierOffset, 1.15);
  const leftBarrier = new THREE.Mesh(leftBarrierGeo, barrierMat);
  const rightBarrier = new THREE.Mesh(rightBarrierGeo, barrierMat);
  leftBarrier.castShadow = true;
  rightBarrier.castShadow = true;
  leftBarrier.receiveShadow = true;
  rightBarrier.receiveShadow = true;
  group.add(leftBarrier, rightBarrier);
  disposables.push(barrierMat, leftBarrierGeo, rightBarrierGeo);

  // 6. Start / Finish Line & Gantry Arch
  const s0 = track.samples[0];
  const sfGroup = new THREE.Group();
  sfGroup.position.copy(s0.point);
  const startYaw = Math.atan2(s0.tangent.x, s0.tangent.z);
  sfGroup.rotation.y = startYaw;

  const sfTex = createCheckeredTexture(maxAnisotropy);
  const sfGeo = new THREE.PlaneGeometry(track.spec.roadWidth, 3.6);
  sfGeo.rotateX(-Math.PI / 2);
  const sfMat = new THREE.MeshStandardMaterial({
    map: sfTex,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const sfLine = new THREE.Mesh(sfGeo, sfMat);
  sfLine.position.y = 0.04;
  sfGroup.add(sfLine);
  disposables.push(sfTex, sfGeo, sfMat);

  // Gantry Pillars & Truss
  const pillarGeo = new THREE.BoxGeometry(0.9, 7.2, 0.9);
  const gantryMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.28,
  });
  const pillarL = new THREE.Mesh(pillarGeo, gantryMat);
  pillarL.position.set(-track.halfWidth - 1.2, 3.6, 0);
  pillarL.castShadow = true;
  const pillarR = new THREE.Mesh(pillarGeo, gantryMat);
  pillarR.position.set(track.halfWidth + 1.2, 3.6, 0);
  pillarR.castShadow = true;

  const beamGeo = new THREE.BoxGeometry(track.spec.roadWidth + 3.4, 1.3, 1.1);
  const beam = new THREE.Mesh(beamGeo, gantryMat);
  beam.position.set(0, 7.0, 0);
  beam.castShadow = true;

  const bannerGeo = new THREE.PlaneGeometry(track.spec.roadWidth * 0.7, 0.9);
  const bannerMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x06b6d4 : 0xe63946,
    emissive: isNight ? 0x06b6d4 : 0xe63946,
    emissiveIntensity: 0.65,
    roughness: 0.3,
  });
  const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
  bannerFront.position.set(0, 7.0, 0.58);
  const bannerBack = new THREE.Mesh(bannerGeo, bannerMat);
  bannerBack.position.set(0, 7.0, -0.58);
  bannerBack.rotation.y = Math.PI;

  sfGroup.add(pillarL, pillarR, beam, bannerFront, bannerBack);
  disposables.push(pillarGeo, gantryMat, beamGeo, bannerGeo, bannerMat);

  // 5 Start Lights on Gantry
  const startLights: THREE.Mesh[] = [];
  const lightGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 16);
  lightGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const lMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x000000,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    const lMesh = new THREE.Mesh(lightGeo, lMat);
    lMesh.position.set((i - 2) * 1.1, 6.0, 0.52);
    sfGroup.add(lMesh);
    startLights.push(lMesh);
    disposables.push(lMat);
  }
  disposables.push(lightGeo);
  group.add(sfGroup);

  // 7. Instanced Trackside Landmarks (Floodlights, Canyon Rocks/Trees or Harbor Towers)
  // Place light poles every ~45m safely outside barriers
  const poleCount = Math.floor(track.samples.length / 20);
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 8.5, 8);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.75,
    roughness: 0.35,
  });
  const lampGeo = new THREE.BoxGeometry(1.6, 0.3, 0.6);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: isNight ? 0xbae6fd : 0xfde68a,
    emissiveIntensity: isNight ? 1.8 : 0.4,
  });

  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, poleCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < poleCount; i++) {
    const s = track.samples[(i * 20) % track.samples.length];
    const side = i % 2 === 0 ? 1 : -1;
    const pos = new THREE.Vector3()
      .copy(s.point)
      .addScaledVector(s.right, side * (track.barrierOffset + 2.2));
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    dummy.position.set(pos.x, pos.y + 4.25, pos.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    const lampPos = new THREE.Vector3()
      .copy(pos)
      .addScaledVector(s.right, -side * 0.9);
    dummy.position.set(lampPos.x, pos.y + 8.4, lampPos.z);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.computeBoundingSphere();
  lampInst.computeBoundingSphere();
  group.add(poleInst, lampInst);
  disposables.push(poleGeo, poleMat, lampGeo, lampMat);

  // Scenery Props via InstancedMesh (Trees + Monoliths for Redstone, Lit Skyline Towers for Harbor)
  const propCount = 130;
  if (!isNight) {
    // Canyon Pine Trees + Sandstone Monoliths
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.9 });
    const crownGeo = new THREE.ConeGeometry(2.4, 7.2, 8);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f4f38, roughness: 0.85 });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, propCount);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, propCount);
    const tint = new THREE.Color();

    let placed = 0;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    let guard = 0;
    while (placed < propCount && guard < 1500) {
      guard++;
      const rx = (rand() - 0.5) * 900 + 110;
      const rz = (rand() - 0.5) * 900;
      const proj = projectToTrack(track, rx, rz);
      if (Math.abs(proj.lateralOffset) < track.barrierOffset + 9) continue;

      const scale = 0.85 + rand() * 0.65;
      const hillY = proj.roadY - 0.2;

      dummy.position.set(rx, hillY + 1.6 * scale, rz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(rx, hillY + 5.6 * scale, rz);
      dummy.updateMatrix();
      crowns.setMatrixAt(placed, dummy.matrix);

      tint.setHSL(0.32 + (rand() - 0.5) * 0.04, 0.35, 0.24 + rand() * 0.1);
      crowns.setColorAt(placed, tint);
      placed++;
    }
    trunks.count = placed;
    crowns.count = placed;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks, crowns);
    disposables.push(trunkGeo, trunkMat, crownGeo, crownMat);

    // Canyon Sandstone Rock Monoliths / Buttes
    const rockGeo = new THREE.CylinderGeometry(7, 13, 24, 7);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8b4c39,
      roughness: 0.92,
      metalness: 0.04,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 28);
    let rocksPlaced = 0;
    let rGuard = 0;
    while (rocksPlaced < 28 && rGuard < 600) {
      rGuard++;
      const rx = (rand() - 0.5) * 1050 + 110;
      const rz = (rand() - 0.5) * 1050;
      const proj = projectToTrack(track, rx, rz);
      if (Math.abs(proj.lateralOffset) < track.barrierOffset + 28) continue;
      const sx = 0.9 + rand() * 1.6;
      const sy = 0.7 + rand() * 1.4;
      dummy.position.set(rx, 8 * sy, rz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(sx, sy, sx * (0.7 + rand() * 0.6));
      dummy.updateMatrix();
      rocks.setMatrixAt(rocksPlaced, dummy.matrix);
      tint.setHSL(0.04 + rand() * 0.03, 0.42, 0.30 + rand() * 0.12);
      rocks.setColorAt(rocksPlaced, tint);
      rocksPlaced++;
    }
    rocks.count = rocksPlaced;
    rocks.computeBoundingSphere();
    group.add(rocks);
    disposables.push(rockGeo, rockMat);
  } else {
    // Illuminated Harbor Skyline Towers with Lit Window Grid Texture
    const winTex = createSkyscraperTexture(maxAnisotropy);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x162033,
      map: winTex,
      emissive: 0x38bdf8,
      emissiveMap: winTex,
      emissiveIntensity: 0.65,
      roughness: 0.32,
      metalness: 0.65,
    });
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, 85);
    const tint = new THREE.Color();
    let placed = 0;
    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let guard = 0;
    while (placed < 85 && guard < 1200) {
      guard++;
      const rx = (rand() - 0.5) * 950 + 95;
      const rz = (rand() - 0.5) * 950;
      const proj = projectToTrack(track, rx, rz);
      if (Math.abs(proj.lateralOffset) < track.barrierOffset + 16) continue;

      const w = 14 + rand() * 20;
      const h = 24 + rand() * 88;
      const d = 14 + rand() * 20;
      dummy.position.set(rx, h * 0.5 - 1, rz);
      dummy.rotation.set(0, (Math.floor(rand() * 4) * Math.PI) / 2, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      towers.setMatrixAt(placed, dummy.matrix);

      tint.setHSL(0.58 + rand() * 0.08, 0.35, 0.45 + rand() * 0.25);
      towers.setColorAt(placed, tint);
      placed++;
    }
    towers.count = placed;
    towers.computeBoundingSphere();
    group.add(towers);
    disposables.push(winTex, towerGeo, towerMat);
  }

  // 8. Trackside Grandstands near Start/Finish Straight
  const standBaseGeo = new THREE.BoxGeometry(34, 4.2, 8.5);
  const standRoofGeo = new THREE.BoxGeometry(36, 0.45, 9.8);
  const standMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1e293b : 0x334155,
    roughness: 0.65,
    metalness: 0.35,
  });
  const standAccentMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x06b6d4 : 0xdc2626,
    emissive: isNight ? 0x06b6d4 : 0x7f1d1d,
    emissiveIntensity: isNight ? 0.5 : 0.25,
    roughness: 0.4,
  });

  const standSamples = [Math.floor(track.samples.length * 0.96), 18];
  for (let i = 0; i < standSamples.length; i++) {
    const s = track.samples[standSamples[i]];
    const side = i === 0 ? -1 : 1;
    const standPos = new THREE.Vector3()
      .copy(s.point)
      .addScaledVector(s.right, side * (track.barrierOffset + 9.5));
    const sGroup = new THREE.Group();
    sGroup.position.set(standPos.x, standPos.y, standPos.z);
    sGroup.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);

    const base = new THREE.Mesh(standBaseGeo, standMat);
    base.position.y = 2.1;
    base.castShadow = true;
    base.receiveShadow = true;
    const roof = new THREE.Mesh(standRoofGeo, standMat);
    roof.position.y = 7.4;
    roof.rotation.x = 0.08;
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(36, 0.55, 0.4), standAccentMat);
    fascia.position.set(0, 7.1, 4.7);
    sGroup.add(base, roof, fascia);
    group.add(sGroup);
    disposables.push(fascia.geometry);
  }
  disposables.push(standBaseGeo, standRoofGeo, standMat, standAccentMat);

  // 9. Braking Distance Boards (150 / 100 / 50m) ahead of Major Corners
  const boardGeo = new THREE.BoxGeometry(1.5, 1.5, 0.12);
  const postGeo = new THREE.BoxGeometry(0.14, 2.4, 0.14);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
  const markerLabels = ['150', '100', '50'];
  const markerMats = markerLabels.map((lbl) => {
    const tex = createBrakeMarkerTexture(lbl, maxAnisotropy);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
    disposables.push(tex, mat);
    return mat;
  });

  // Detect corner entry clusters along spline
  const n = track.samples.length;
  let lastZoneIdx = -60;
  for (let i = 30; i < n - 15; i++) {
    const k = Math.abs(track.samples[i].curvature);
    if (k > 0.011 && i - lastZoneIdx > 65) {
      lastZoneIdx = i;
      const turnSign = Math.sign(track.samples[i].curvature);
      const outsideSign = -turnSign || 1;
      // Place 150, 100, 50m boards roughly 24, 16, 8 samples ahead
      [22, 14, 7].forEach((offsetSamples, bIdx) => {
        const s = track.samples[(i - offsetSamples + n) % n];
        const bPos = new THREE.Vector3()
          .copy(s.point)
          .addScaledVector(s.right, outsideSign * (track.barrierOffset - 0.6));
        const boardGroup = new THREE.Group();
        boardGroup.position.set(bPos.x, bPos.y, bPos.z);
        boardGroup.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 1.2;
        const signMesh = new THREE.Mesh(boardGeo, markerMats[bIdx]);
        signMesh.position.y = 2.05;
        boardGroup.add(post, signMesh);
        group.add(boardGroup);
      });
    }
  }
  disposables.push(boardGeo, postGeo, postMat);

  // 10. Starting Grid Boxes on Asphalt (-6m to -34m behind S/F)
  const gridMarkGeo = new THREE.PlaneGeometry(2.3, 4.2);
  gridMarkGeo.rotateX(-Math.PI / 2);
  const gridMarkMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const gridPositions = [
    [-6, -2.4],
    [-10, 2.4],
    [-14, -2.4],
    [-18, 2.4],
    [-22, -2.4],
    [-26, 2.4],
    [-30, -2.4],
    [-34, 2.4],
  ];
  for (const [distOff, latOff] of gridPositions) {
    let gt = distOff / track.totalLength;
    while (gt < 0) gt += 1;
    const gsIdx = Math.floor(gt * track.samples.length) % track.samples.length;
    const gs = track.samples[gsIdx];
    const gPos = new THREE.Vector3().copy(gs.point).addScaledVector(gs.right, latOff);
    const box = new THREE.Mesh(gridMarkGeo, gridMarkMat);
    box.position.set(gPos.x, gPos.y + 0.038, gPos.z);
    box.rotation.y = Math.atan2(gs.tangent.x, gs.tangent.z);
    group.add(box);
  }
  disposables.push(gridMarkGeo, gridMarkMat);

  // 11. Sector Overhead Light Arches (Sectors 2 & 3)
  const archSpan = track.spec.roadWidth + 3.0;
  const archPillarGeo = new THREE.BoxGeometry(0.65, 6.4, 0.65);
  const archBeamGeo = new THREE.BoxGeometry(archSpan, 0.85, 0.9);
  const archStripGeo = new THREE.BoxGeometry(archSpan * 0.88, 0.18, 0.95);
  const archStripMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x22d3ee : 0xf59e0b,
    emissive: isNight ? 0x06b6d4 : 0xd97706,
    emissiveIntensity: isNight ? 1.4 : 0.45,
    roughness: 0.25,
  });
  for (const frac of [0.333, 0.666]) {
    const s = track.samples[Math.floor(track.samples.length * frac)];
    const archGroup = new THREE.Group();
    archGroup.position.copy(s.point);
    archGroup.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

    const pL = new THREE.Mesh(archPillarGeo, gantryMat);
    pL.position.set(-track.halfWidth - 1.1, 3.2, 0);
    const pR = new THREE.Mesh(archPillarGeo, gantryMat);
    pR.position.set(track.halfWidth + 1.1, 3.2, 0);
    const topBeam = new THREE.Mesh(archBeamGeo, gantryMat);
    topBeam.position.set(0, 6.3, 0);
    const strip = new THREE.Mesh(archStripGeo, archStripMat);
    strip.position.set(0, 5.95, 0);
    archGroup.add(pL, pR, topBeam, strip);
    group.add(archGroup);
  }
  disposables.push(archPillarGeo, archBeamGeo, archStripGeo, archStripMat);

  // 12. Apex Tire-Stack Chicane Barriers (InstancedMesh along sharp bends)
  const tireStackGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.35, 12);
  const tireStackMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.08,
  });
  const tireStacks = new THREE.InstancedMesh(tireStackGeo, tireStackMat, 120);
  const stackTint = new THREE.Color();
  let stackCount = 0;
  for (let i = 10; i < n - 10 && stackCount < 120; i += 3) {
    const s = track.samples[i];
    if (Math.abs(s.curvature) > 0.0115) {
      const outsideSign = -Math.sign(s.curvature) || 1;
      const tPos = new THREE.Vector3()
        .copy(s.point)
        .addScaledVector(s.right, outsideSign * (track.barrierOffset - 0.55));
      dummy.position.set(tPos.x, tPos.y + 0.67, tPos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tireStacks.setMatrixAt(stackCount, dummy.matrix);
      const isAlt = stackCount % 2 === 0;
      stackTint.setHex(
        isNight ? (isAlt ? 0x06b6d4 : 0x1e293b) : isAlt ? 0xdc2626 : 0xf1f5f9
      );
      tireStacks.setColorAt(stackCount, stackTint);
      stackCount++;
    }
  }
  tireStacks.count = stackCount;
  tireStacks.computeBoundingSphere();
  group.add(tireStacks);
  disposables.push(tireStackGeo, tireStackMat);

  // 13. Broadcast TV Camera Anchors + Trackside Boom Towers
  const tvCameraAnchors: TvCameraAnchor[] = [];
  const anchorCount = 9;
  const towerMastGeo = new THREE.CylinderGeometry(0.16, 0.24, 6.2, 8);
  const camPodGeo = new THREE.BoxGeometry(0.65, 0.45, 0.9);
  for (let a = 0; a < anchorCount; a++) {
    const sIdx = Math.floor(((a + 0.35) / anchorCount) * n) % n;
    const s = track.samples[sIdx];
    const side = a % 2 === 0 ? 1 : -1;
    const basePos = new THREE.Vector3()
      .copy(s.point)
      .addScaledVector(s.right, side * (track.barrierOffset + 4.5));
    const camY = basePos.y + 6.4;

    tvCameraAnchors.push({
      pos: new THREE.Vector3(basePos.x, camY, basePos.z),
      trackT: s.t,
    });

    const mast = new THREE.Mesh(towerMastGeo, poleMat);
    mast.position.set(basePos.x, basePos.y + 3.1, basePos.z);
    const pod = new THREE.Mesh(camPodGeo, gantryMat);
    pod.position.set(basePos.x, camY, basePos.z);
    pod.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    group.add(mast, pod);
  }
  disposables.push(towerMastGeo, camPodGeo);

  return {
    group,
    startLights,
    tvCameraAnchors,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
