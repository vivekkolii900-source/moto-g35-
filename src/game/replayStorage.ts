import * as THREE from 'three';
import {
  CHASSIS_SPECS,
  DEFAULT_VEHICLE_CONFIG,
  FullRaceSession,
  ReplayAiSnapshot,
  ReplayCarSnapshot,
  ReplayFrame,
  SavedSessionSummary,
  TrackId,
  VehicleConfig,
} from './types';

const DB_NAME = 'apex_circuit_replays_v1';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

const memoryFallback = new Map<string, FullRaceSession>();

function openReplayDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function toSummary(s: FullRaceSession): SavedSessionSummary {
  const durationSec =
    s.frames.length > 0 ? s.frames[s.frames.length - 1].t : s.totalTimeMs / 1000;
  return {
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    trackId: s.trackId,
    gameMode: s.gameMode,
    driverName: s.driverName,
    vehicleConfig: s.vehicleConfig,
    totalTimeMs: s.totalTimeMs,
    bestLapMs: s.bestLapMs,
    topSpeedKmh: s.topSpeedKmh,
    position: s.position,
    totalRacers: s.totalRacers,
    driftScore: s.driftScore,
    frameCount: s.frames.length,
    durationSec,
  };
}

export async function saveRaceSession(session: FullRaceSession): Promise<void> {
  memoryFallback.set(session.id, session);
  const db = await openReplayDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listRaceSessions(): Promise<SavedSessionSummary[]> {
  const db = await openReplayDb();
  if (!db) {
    return Array.from(memoryFallback.values())
      .map(toSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as FullRaceSession[]) || [];
      const summaries = rows
        .map(toSummary)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(summaries);
    };
    req.onerror = () => {
      db.close();
      resolve(
        Array.from(memoryFallback.values())
          .map(toSummary)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    };
  });
}

export async function getRaceSession(id: string): Promise<FullRaceSession | null> {
  const mem = memoryFallback.get(id);
  if (mem) return mem;

  const db = await openReplayDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as FullRaceSession) || null);
    };
    req.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

export async function deleteRaceSession(id: string): Promise<void> {
  memoryFallback.delete(id);
  const db = await openReplayDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export function exportSessionJson(session: FullRaceSession): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apex-replay-${session.trackId}-${session.id.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeConfig(raw: Partial<VehicleConfig> | undefined): VehicleConfig {
  const cfg = { ...DEFAULT_VEHICLE_CONFIG, ...(raw || {}) };
  if (!(cfg.chassis in CHASSIS_SPECS)) {
    cfg.chassis = DEFAULT_VEHICLE_CONFIG.chassis;
  }
  return cfg;
}

export function validateImportedSession(raw: unknown): FullRaceSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const trackId = obj.trackId as TrackId;
  if (trackId !== 'redstone' && trackId !== 'harbor') return null;
  if (!Array.isArray(obj.frames) || obj.frames.length < 2) return null;

  const frames: ReplayFrame[] = [];
  for (let i = 0; i < obj.frames.length && i < 20000; i++) {
    const f = obj.frames[i] as Record<string, unknown>;
    if (!f || typeof f !== 'object' || !Number.isFinite(f.t)) continue;
    const p = f.player as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') continue;
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z) ||
      !Number.isFinite(p.yaw)
    ) {
      continue;
    }

    const aiList: ReplayAiSnapshot[] = Array.isArray(f.ai)
      ? f.ai
          .filter(
            (a): a is ReplayAiSnapshot =>
              Boolean(a) &&
              typeof a === 'object' &&
              Number.isFinite((a as ReplayAiSnapshot).x) &&
              Number.isFinite((a as ReplayAiSnapshot).z) &&
              Number.isFinite((a as ReplayAiSnapshot).yaw)
          )
          .map((a) => ({
            x: Number(a.x),
            y: Number(a.y) || 0,
            z: Number(a.z),
            yaw: Number(a.yaw),
            steer: Number(a.steer) || 0,
            wheelSpin: Number(a.wheelSpin) || 0,
            speedKmh: Number(a.speedKmh) || 0,
            eliminated: Boolean(a.eliminated),
          }))
      : [];

    const g = f.ghost as Record<string, unknown> | undefined;
    const ghost =
      g &&
      Number.isFinite(g.x) &&
      Number.isFinite(g.y) &&
      Number.isFinite(g.z) &&
      Number.isFinite(g.yaw)
        ? {
            x: Number(g.x),
            y: Number(g.y),
            z: Number(g.z),
            yaw: Number(g.yaw),
            steer: Number(g.steer) || 0,
          }
        : undefined;

    frames.push({
      t: Math.max(0, Number(f.t)),
      player: {
        x: Number(p.x),
        y: Number(p.y),
        z: Number(p.z),
        yaw: Number(p.yaw),
        pitch: Number(p.pitch) || 0,
        roll: Number(p.roll) || 0,
        slopePitch: Number(p.slopePitch) || 0,
        steer: Number(p.steer) || 0,
        wheelSpin: Number(p.wheelSpin) || 0,
        speedKmh: Number(p.speedKmh) || 0,
        rpm: Number(p.rpm) || 1150,
        gear: Number(p.gear) || 1,
        throttle: Number(p.throttle) || 0,
        brake: Number(p.brake) || 0,
        brakeHeat: Number(p.brakeHeat) || 0,
        backfire: Boolean(p.backfire),
        nitroActive: Boolean(p.nitroActive),
        slipRatio: Number(p.slipRatio) || 0,
        offTrack: Boolean(p.offTrack),
        lap: Number(p.lap) || 1,
      },
      ai: aiList,
      ghost,
    });
  }

  if (frames.length < 2) return null;

  const aiParticipants = Array.isArray(obj.aiParticipants)
    ? obj.aiParticipants.slice(0, 12).map((part, idx) => {
        const rec = (part || {}) as Record<string, unknown>;
        return {
          id: typeof rec.id === 'string' ? rec.id : `ai-${idx}`,
          name: typeof rec.name === 'string' ? rec.name.slice(0, 24) : `Rival ${idx + 1}`,
          config: sanitizeConfig(rec.config as Partial<VehicleConfig>),
        };
      })
    : [];

  const modeRaw = obj.gameMode;
  const gameMode =
    modeRaw === 'freeroam' || modeRaw === 'drift' || modeRaw === 'elimination'
      ? modeRaw
      : 'race';

  return {
    id:
      typeof obj.id === 'string' && obj.id.length >= 4
        ? obj.id.slice(0, 64)
        : `imp-${Date.now().toString(36)}`,
    title:
      typeof obj.title === 'string' && obj.title.trim().length > 0
        ? obj.title.trim().slice(0, 60)
        : 'Imported Race Session',
    createdAt:
      typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    trackId,
    gameMode,
    driverName:
      typeof obj.driverName === 'string' && obj.driverName.trim().length > 0
        ? obj.driverName.trim().slice(0, 24)
        : 'Apex Driver',
    vehicleConfig: sanitizeConfig(obj.vehicleConfig as Partial<VehicleConfig>),
    aiParticipants,
    activeGhostName: typeof obj.activeGhostName === 'string' ? obj.activeGhostName : null,
    totalTimeMs: Math.max(1000, Number(obj.totalTimeMs) || frames[frames.length - 1].t * 1000),
    bestLapMs: Number.isFinite(obj.bestLapMs) ? Number(obj.bestLapMs) : null,
    topSpeedKmh: Math.max(0, Number(obj.topSpeedKmh) || 0),
    position: Math.max(1, Number(obj.position) || 1),
    totalRacers: Math.max(1, Number(obj.totalRacers) || aiParticipants.length + 1),
    driftScore: Number.isFinite(obj.driftScore) ? Number(obj.driftScore) : undefined,
    lapSplitsMs: Array.isArray(obj.lapSplitsMs)
      ? obj.lapSplitsMs.filter((n): n is number => Number.isFinite(n))
      : [],
    frames,
  };
}

function lerpAngle(a: number, b: number, alpha: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * alpha;
}

function interpPlayer(
  a: ReplayCarSnapshot,
  b: ReplayCarSnapshot,
  alpha: number
): ReplayCarSnapshot {
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, alpha),
    y: THREE.MathUtils.lerp(a.y, b.y, alpha),
    z: THREE.MathUtils.lerp(a.z, b.z, alpha),
    yaw: lerpAngle(a.yaw, b.yaw, alpha),
    pitch: THREE.MathUtils.lerp(a.pitch, b.pitch, alpha),
    roll: THREE.MathUtils.lerp(a.roll, b.roll, alpha),
    slopePitch: THREE.MathUtils.lerp(a.slopePitch ?? 0, b.slopePitch ?? 0, alpha),
    steer: THREE.MathUtils.lerp(a.steer, b.steer, alpha),
    wheelSpin: THREE.MathUtils.lerp(a.wheelSpin, b.wheelSpin, alpha),
    speedKmh: THREE.MathUtils.lerp(a.speedKmh, b.speedKmh, alpha),
    rpm: THREE.MathUtils.lerp(a.rpm, b.rpm, alpha),
    gear: alpha < 0.5 ? a.gear : b.gear,
    throttle: THREE.MathUtils.lerp(a.throttle, b.throttle, alpha),
    brake: THREE.MathUtils.lerp(a.brake, b.brake, alpha),
    brakeHeat: THREE.MathUtils.lerp(a.brakeHeat, b.brakeHeat, alpha),
    backfire: alpha < 0.5 ? a.backfire : b.backfire,
    nitroActive: alpha < 0.5 ? Boolean(a.nitroActive) : Boolean(b.nitroActive),
    slipRatio: THREE.MathUtils.lerp(a.slipRatio, b.slipRatio, alpha),
    offTrack: alpha < 0.5 ? a.offTrack : b.offTrack,
    lap: alpha < 0.5 ? a.lap : b.lap,
  };
}

export function sampleReplayAtTime(
  frames: ReplayFrame[],
  timeSec: number
): ReplayFrame | null {
  if (!frames || frames.length === 0) return null;
  if (timeSec <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (timeSec >= last.t) return last;

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= timeSec) lo = mid;
    else hi = mid;
  }

  const a = frames[lo];
  const b = frames[hi];
  const span = Math.max(0.0001, b.t - a.t);
  const alpha = (timeSec - a.t) / span;

  const ai: ReplayAiSnapshot[] = a.ai.map((aiA, idx) => {
    const aiB = b.ai[idx] || aiA;
    return {
      x: THREE.MathUtils.lerp(aiA.x, aiB.x, alpha),
      y: THREE.MathUtils.lerp(aiA.y, aiB.y, alpha),
      z: THREE.MathUtils.lerp(aiA.z, aiB.z, alpha),
      yaw: lerpAngle(aiA.yaw, aiB.yaw, alpha),
      steer: THREE.MathUtils.lerp(aiA.steer, aiB.steer, alpha),
      wheelSpin: THREE.MathUtils.lerp(aiA.wheelSpin, aiB.wheelSpin, alpha),
      speedKmh: THREE.MathUtils.lerp(aiA.speedKmh, aiB.speedKmh, alpha),
      eliminated: alpha < 0.5 ? Boolean(aiA.eliminated) : Boolean(aiB.eliminated),
    };
  });

  let ghost: ReplayFrame['ghost'];
  if (a.ghost && b.ghost) {
    ghost = {
      x: THREE.MathUtils.lerp(a.ghost.x, b.ghost.x, alpha),
      y: THREE.MathUtils.lerp(a.ghost.y, b.ghost.y, alpha),
      z: THREE.MathUtils.lerp(a.ghost.z, b.ghost.z, alpha),
      yaw: lerpAngle(a.ghost.yaw, b.ghost.yaw, alpha),
      steer: THREE.MathUtils.lerp(a.ghost.steer, b.ghost.steer, alpha),
    };
  } else {
    ghost = a.ghost || b.ghost;
  }

  return {
    t: timeSec,
    player: interpPlayer(a.player, b.player, alpha),
    ai,
    ghost,
  };
}
