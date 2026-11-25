import * as THREE from 'three';
import { TrackData, projectToTrack } from './tracks';
import { CHASSIS_SPECS, GameMode, GhostSample, VehicleConfig } from './types';

export interface AiRacerState {
  id: string;
  name: string;
  config: VehicleConfig;
  pos: THREE.Vector3;
  yaw: number;
  speedMs: number;
  steerAngle: number;
  wheelSpin: number;
  lateralOffset: number;
  targetLateralOffset: number;
  sampleIdx: number;
  lap: number;
  lastT: number;
  totalProgress: number; // lap + t
  skillFactor: number;
  finished: boolean;
  finishTimeMs: number | null;
  eliminated: boolean;
}

const AI_PRESETS: Array<{
  id: string;
  name: string;
  skill: number;
  lateral: number;
  startOffset: number;
  config: VehicleConfig;
}> = [
  {
    id: 'ai-f1',
    name: 'K. Takahashi',
    skill: 1.03,
    lateral: -2.4,
    startOffset: -6,
    config: {
      chassis: 'formula_f1',
      primaryColor: '#ef4444',
      accentColor: '#f8fafc',
      rimColor: '#1e293b',
      paintFinish: 'metallic',
      livery: 'apex',
      racingNumber: 1,
      wing: 'timeattack',
      rims: 'turbofan',
      tires: 'slick',
      suspension: 'stiff',
      gearRatio: 'balanced',
      engineMap: 1.15,
    },
  },
  {
    id: 'ai-spectre',
    name: 'E. Lindstrom',
    skill: 1.0,
    lateral: 2.4,
    startOffset: -10,
    config: {
      chassis: 'spectre',
      primaryColor: '#06b6d4',
      accentColor: '#0f172a',
      rimColor: '#cbd5e1',
      paintFinish: 'pearl',
      livery: 'stripe',
      racingNumber: 14,
      wing: 'gt',
      rims: 'forged5',
      tires: 'slick',
      suspension: 'track',
      gearRatio: 'balanced',
      engineMap: 1.12,
    },
  },
  {
    id: 'ai-titan',
    name: 'L. Moretti',
    skill: 0.97,
    lateral: -2.4,
    startOffset: -14,
    config: {
      chassis: 'titan',
      primaryColor: '#f59e0b',
      accentColor: '#0f172a',
      rimColor: '#1e293b',
      paintFinish: 'pearl',
      livery: 'apex',
      racingNumber: 12,
      wing: 'timeattack',
      rims: 'mesh',
      tires: 'semislick',
      suspension: 'stiff',
      gearRatio: 'topspeed',
      engineMap: 1.12,
    },
  },
  {
    id: 'ai-monza',
    name: 'S. Moreau',
    skill: 0.95,
    lateral: 2.4,
    startOffset: -18,
    config: {
      chassis: 'monza',
      primaryColor: '#2563eb',
      accentColor: '#f8fafc',
      rimColor: '#e2e8f0',
      paintFinish: 'metallic',
      livery: 'stripe',
      racingNumber: 7,
      wing: 'gt',
      rims: 'forged5',
      tires: 'slick',
      suspension: 'track',
      gearRatio: 'balanced',
      engineMap: 1.1,
    },
  },
  {
    id: 'ai-stratos',
    name: 'M. Solberg',
    skill: 0.93,
    lateral: -2.4,
    startOffset: -22,
    config: {
      chassis: 'stratos',
      primaryColor: '#10b981',
      accentColor: '#fbbf24',
      rimColor: '#f8fafc',
      paintFinish: 'metallic',
      livery: 'checker',
      racingNumber: 22,
      wing: 'gt',
      rims: 'turbofan',
      tires: 'semislick',
      suspension: 'soft',
      gearRatio: 'accel',
      engineMap: 1.1,
    },
  },
  {
    id: 'ai-dominator',
    name: 'J. Mercer',
    skill: 0.91,
    lateral: 2.4,
    startOffset: -26,
    config: {
      chassis: 'dominator',
      primaryColor: '#f43f5e',
      accentColor: '#0f172a',
      rimColor: '#94a3b8',
      paintFinish: 'matte',
      livery: 'stripe',
      racingNumber: 68,
      wing: 'lip',
      rims: 'forged5',
      tires: 'semislick',
      suspension: 'track',
      gearRatio: 'accel',
      engineMap: 1.08,
    },
  },
  {
    id: 'ai-fjr',
    name: 'K. Lindqvist',
    skill: 0.89,
    lateral: -2.4,
    startOffset: -30,
    config: {
      chassis: 'formula_jr',
      primaryColor: '#f8fafc',
      accentColor: '#ef4444',
      rimColor: '#1e293b',
      paintFinish: 'metallic',
      livery: 'apex',
      racingNumber: 88,
      wing: 'gt',
      rims: 'mesh',
      tires: 'semislick',
      suspension: 'stiff',
      gearRatio: 'balanced',
      engineMap: 1.05,
    },
  },
];

export function createAiRacers(
  track: TrackData,
  mode: GameMode = 'race',
  includeTraffic = true
): AiRacerState[] {
  if (mode === 'drift' || (mode === 'freeroam' && !includeTraffic)) {
    return [];
  }
  const n = track.samples.length;
  return AI_PRESETS.map((preset, idx) => {
    // In race / elimination mode: staggered 2x4 grid ahead of P8 player (at -34m)
    // In freeroam traffic mode: spread evenly around the entire circuit
    const startDist =
      mode === 'freeroam'
        ? ((idx + 1) / (AI_PRESETS.length + 1)) * track.totalLength
        : preset.startOffset;

    let t = startDist / track.totalLength;
    while (t < 0) t += 1;
    while (t >= 1) t -= 1;

    const sIdx = Math.floor(t * n) % n;
    const s = track.samples[sIdx];
    const pos = new THREE.Vector3().copy(s.point).addScaledVector(s.right, preset.lateral);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    return {
      id: preset.id,
      name: preset.name,
      config: preset.config,
      pos,
      yaw,
      speedMs: mode === 'freeroam' ? 28 : 0,
      steerAngle: 0,
      wheelSpin: 0,
      lateralOffset: preset.lateral,
      targetLateralOffset: preset.lateral,
      sampleIdx: sIdx,
      lap: 1,
      lastT: t,
      totalProgress: mode === 'freeroam' ? t : t - 1,
      skillFactor: mode === 'freeroam' ? 0.78 + (idx % 3) * 0.06 : preset.skill,
      finished: false,
      finishTimeMs: null,
      eliminated: false,
    };
  });
}

export function stepAiRacer(
  ai: AiRacerState,
  allAi: AiRacerState[],
  track: TrackData,
  dt: number,
  raceTimeMs: number
): void {
  const n = track.samples.length;
  const proj = projectToTrack(track, ai.pos.x, ai.pos.z, ai.sampleIdx);
  ai.sampleIdx = proj.sampleIndex;

  let maxKappa = 0;
  for (let look = 4; look <= 28; look += 4) {
    const sAhead = track.samples[(ai.sampleIdx + look) % n];
    maxKappa = Math.max(maxKappa, Math.abs(sAhead.curvature));
  }

  const spec = CHASSIS_SPECS[ai.config.chassis];
  const classGripBonus = spec.vehicleClass === 'formula' ? 1.25 : 1.0;
  const cornerGrip = 14.2 * ai.skillFactor * classGripBonus;
  const cornerLimit = maxKappa > 0.002 ? Math.sqrt(cornerGrip / maxKappa) : 82;
  let targetSpeed = ai.eliminated
    ? 0
    : Math.min(75 * ai.skillFactor, Math.max(19, cornerLimit));

  // Avoid running into another AI car directly ahead
  let laneAvoidance = 0;
  if (!ai.eliminated) {
    for (const other of allAi) {
      if (other === ai || other.eliminated) continue;
      const dx = other.pos.x - ai.pos.x;
      const dz = other.pos.z - ai.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 9.5) {
        const fwdDot = dx * Math.sin(ai.yaw) + dz * Math.cos(ai.yaw);
        if (fwdDot > 0 && dist < 7.5) {
          targetSpeed = Math.min(targetSpeed, other.speedMs * 0.92);
          const sideSign = ai.lateralOffset <= other.lateralOffset ? -1 : 1;
          laneAvoidance += sideSign * 2.2;
        }
      }
    }
  }

  if (ai.speedMs < targetSpeed) {
    const accel =
      THREE.MathUtils.lerp(14.5, 4.8, Math.min(1, ai.speedMs / 70)) * ai.skillFactor;
    ai.speedMs = Math.min(targetSpeed, ai.speedMs + accel * dt);
  } else {
    ai.speedMs = Math.max(targetSpeed, ai.speedMs - (ai.eliminated ? 12.0 : 20.0) * dt);
  }

  const lookSamples = Math.max(5, Math.floor(ai.speedMs * 0.38));
  const targetSample = track.samples[(ai.sampleIdx + lookSamples) % n];

  const apexLane = ai.eliminated
    ? track.halfWidth + 2.2
    : Math.abs(targetSample.curvature) > 0.005
      ? -Math.sign(targetSample.curvature) * (track.halfWidth * 0.45)
      : ai.targetLateralOffset;
  const desiredLane = THREE.MathUtils.clamp(
    apexLane + laneAvoidance,
    -track.halfWidth + 1.5,
    ai.eliminated ? track.barrierOffset - 1.2 : track.halfWidth - 1.5
  );
  ai.lateralOffset = THREE.MathUtils.damp(ai.lateralOffset, desiredLane, 2.4, dt);

  const aimPoint = new THREE.Vector3()
    .copy(targetSample.point)
    .addScaledVector(targetSample.right, ai.lateralOffset);

  const desiredYaw = Math.atan2(aimPoint.x - ai.pos.x, aimPoint.z - ai.pos.z);
  let yawDiff = desiredYaw - ai.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

  const maxTurnRate = 2.7 * dt;
  const yawStep = THREE.MathUtils.clamp(yawDiff * 4.6 * dt, -maxTurnRate, maxTurnRate);
  ai.yaw += yawStep;
  ai.steerAngle = THREE.MathUtils.damp(
    ai.steerAngle,
    THREE.MathUtils.clamp(yawDiff * 0.8, -0.45, 0.45),
    10,
    dt
  );

  ai.pos.x += Math.sin(ai.yaw) * ai.speedMs * dt;
  ai.pos.z += Math.cos(ai.yaw) * ai.speedMs * dt;
  ai.pos.y = THREE.MathUtils.damp(ai.pos.y, proj.roadY, 20, dt);
  ai.wheelSpin += (ai.speedMs / spec.wheelRadius) * dt;

  const newT = proj.t;
  if (ai.lastT > 0.85 && newT < 0.15) {
    if (ai.totalProgress < 0) {
      ai.totalProgress = newT;
    } else {
      ai.lap += 1;
      ai.totalProgress = (ai.lap - 1) + newT;
      if (ai.lap > track.spec.laps && !ai.finished) {
        ai.finished = true;
        ai.finishTimeMs = raceTimeMs;
      }
    }
  } else if (ai.totalProgress < 0) {
    ai.totalProgress = newT - 1;
  } else {
    ai.totalProgress = (ai.lap - 1) + newT;
  }
  ai.lastT = newT;
}

export function sampleGhostAtTime(
  samples: GhostSample[],
  timeSec: number
): { x: number; y: number; z: number; yaw: number; steer: number } | null {
  if (!samples || samples.length === 0) return null;
  if (timeSec <= samples[0].t) {
    const s = samples[0];
    return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, steer: s.steer };
  }
  const last = samples[samples.length - 1];
  if (timeSec >= last.t) {
    return { x: last.x, y: last.y, z: last.z, yaw: last.yaw, steer: last.steer };
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= timeSec) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = Math.max(0.0001, b.t - a.t);
  const alpha = (timeSec - a.t) / span;

  let dYaw = b.yaw - a.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;

  return {
    x: THREE.MathUtils.lerp(a.x, b.x, alpha),
    y: THREE.MathUtils.lerp(a.y, b.y, alpha),
    z: THREE.MathUtils.lerp(a.z, b.z, alpha),
    yaw: a.yaw + dYaw * alpha,
    steer: THREE.MathUtils.lerp(a.steer, b.steer, alpha),
  };
}

export function synthesizeTrackGhost(
  track: TrackData,
  totalTimeSec: number,
  sampleIntervalSec = 0.2
): GhostSample[] {
  const n = track.samples.length;
  const laps = track.spec.laps;
  const samples: GhostSample[] = [];
  const totalSteps = Math.floor(totalTimeSec / sampleIntervalSec);

  for (let i = 0; i <= totalSteps; i++) {
    const tSec = i * sampleIntervalSec;
    const progress = (tSec / totalTimeSec) * laps;
    const lapFrac = progress % 1;
    const fIdx = lapFrac * n;
    const idx0 = Math.floor(fIdx) % n;
    const idx1 = (idx0 + 1) % n;
    const alpha = fIdx - Math.floor(fIdx);

    const s0 = track.samples[idx0];
    const s1 = track.samples[idx1];
    const p = new THREE.Vector3().lerpVectors(s0.point, s1.point, alpha);
    const tan = new THREE.Vector3().lerpVectors(s0.tangent, s1.tangent, alpha).normalize();
    const right = new THREE.Vector3().lerpVectors(s0.right, s1.right, alpha).normalize();

    const apexShift = THREE.MathUtils.clamp(-s0.curvature * 90, -2.8, 2.8);
    p.addScaledVector(right, apexShift);

    samples.push({
      t: Number(tSec.toFixed(2)),
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      z: Number(p.z.toFixed(2)),
      yaw: Number(Math.atan2(tan.x, tan.z).toFixed(3)),
      steer: Number(THREE.MathUtils.clamp(-s0.curvature * 12, -0.35, 0.35).toFixed(3)),
    });
  }
  return samples;
}
