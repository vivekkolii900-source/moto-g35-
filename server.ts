import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { buildTrackData } from './src/game/tracks.ts';
import { synthesizeTrackGhost } from './src/game/rivals.ts';
import { ChassisId, GhostSample, LeaderboardEntry, TrackId } from './src/game/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.resolve(DATA_DIR, 'leaderboard.json');

const VALID_TRACKS = new Set<TrackId>(['redstone', 'harbor']);
const VALID_CHASSIS = new Set<ChassisId>([
  'valkyrie',
  'monza',
  'dominator',
  'outlaw',
  'kurogane',
  'stratos',
  'titan',
  'spectre',
  'formula_f1',
  'formula_jr',
]);

interface StoredDb {
  entries: LeaderboardEntry[];
}

function createInitialSeedEntries(): LeaderboardEntry[] {
  const redstone = buildTrackData('redstone');
  const harbor = buildTrackData('harbor');

  const seeds: Array<{
    id: string;
    driverName: string;
    country: string;
    trackId: TrackId;
    chassis: ChassisId;
    vehicleSummary: string;
    primaryColor: string;
    bestLapMs: number;
    totalTimeMs: number;
    topSpeedKmh: number;
    createdAt: string;
  }> = [
    {
      id: 'seed-rs-1',
      driverName: 'K. Takahashi',
      country: 'JPN',
      trackId: 'redstone',
      chassis: 'titan',
      vehicleSummary: 'Titan V10 · Track Slick · Dual Wing',
      primaryColor: '#ef4444',
      bestLapMs: 31840,
      totalTimeMs: 97420,
      topSpeedKmh: 268,
      createdAt: '2026-11-20T14:22:00.000Z',
    },
    {
      id: 'seed-rs-2',
      driverName: 'E. Lindstrom',
      country: 'SWE',
      trackId: 'redstone',
      chassis: 'valkyrie',
      vehicleSummary: 'Valkyrie GT3 · Track Slick · GT Wing',
      primaryColor: '#3b82f6',
      bestLapMs: 32690,
      totalTimeMs: 99850,
      topSpeedKmh: 256,
      createdAt: '2026-11-21T09:10:00.000Z',
    },
    {
      id: 'seed-rs-3',
      driverName: 'M. Alvarez',
      country: 'ESP',
      trackId: 'redstone',
      chassis: 'kurogane',
      vehicleSummary: 'Kurogane RS · Semi-Slick · GT Wing',
      primaryColor: '#10b981',
      bestLapMs: 33920,
      totalTimeMs: 103410,
      topSpeedKmh: 244,
      createdAt: '2026-11-22T18:45:00.000Z',
    },
    {
      id: 'seed-hb-1',
      driverName: 'R. Kurosawa',
      country: 'JPN',
      trackId: 'harbor',
      chassis: 'kurogane',
      vehicleSummary: 'Kurogane RS · Track Slick · Dual Wing',
      primaryColor: '#06b6d4',
      bestLapMs: 29410,
      totalTimeMs: 90120,
      topSpeedKmh: 249,
      createdAt: '2026-11-21T21:15:00.000Z',
    },
    {
      id: 'seed-hb-2',
      driverName: 'S. Moreau',
      country: 'FRA',
      trackId: 'harbor',
      chassis: 'valkyrie',
      vehicleSummary: 'Valkyrie GT3 · Semi-Slick · GT Wing',
      primaryColor: '#f59e0b',
      bestLapMs: 30280,
      totalTimeMs: 92940,
      topSpeedKmh: 242,
      createdAt: '2026-11-23T11:30:00.000Z',
    },
    {
      id: 'seed-hb-3',
      driverName: 'J. Mercer',
      country: 'USA',
      trackId: 'harbor',
      chassis: 'titan',
      vehicleSummary: 'Titan V10 · Semi-Slick · Lip Spoiler',
      primaryColor: '#f43f5e',
      bestLapMs: 31550,
      totalTimeMs: 96380,
      topSpeedKmh: 261,
      createdAt: '2026-11-24T04:12:00.000Z',
    },
  ];

  return seeds.map((s) => ({
    ...s,
    isVerifiedRun: true,
    ghost: synthesizeTrackGhost(
      s.trackId === 'redstone' ? redstone : harbor,
      s.totalTimeMs / 1000,
      0.22
    ),
  }));
}

function ensureStore(): StoredDb {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: StoredDb = { entries: createInitialSeedEntries() };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredDb;
    if (!parsed || !Array.isArray(parsed.entries)) {
      throw new Error('Invalid store format');
    }
    return parsed;
  } catch {
    const fallback: StoredDb = { entries: createInitialSeedEntries() };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function saveStore(db: StoredDb): void {
  if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid DB path');
  }
  const tmpFile = path.resolve(DATA_DIR, `leaderboard.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(db), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

function sanitizeDriverName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.replace(/[^\w\s.\-]/g, '').trim().slice(0, 22);
  return cleaned.length >= 2 ? cleaned : null;
}

function sanitizeColor(color: unknown): string {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return '#e63946';
}

function sanitizeGhost(raw: unknown): GhostSample[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: GhostSample[] = [];
  const step = raw.length > 600 ? Math.ceil(raw.length / 600) : 1;
  for (let i = 0; i < raw.length && out.length < 600; i += step) {
    const s = raw[i];
    if (
      s &&
      typeof s === 'object' &&
      Number.isFinite(s.t) &&
      Number.isFinite(s.x) &&
      Number.isFinite(s.y) &&
      Number.isFinite(s.z) &&
      Number.isFinite(s.yaw)
    ) {
      out.push({
        t: Math.max(0, Math.min(600, Number(s.t))),
        x: Math.max(-2000, Math.min(2000, Number(s.x))),
        y: Math.max(-100, Math.min(200, Number(s.y))),
        z: Math.max(-2000, Math.min(2000, Number(s.z))),
        yaw: Number(s.yaw),
        steer: Number.isFinite(s.steer) ? Math.max(-1, Math.min(1, Number(s.steer))) : 0,
      });
    }
  }
  return out.length >= 4 ? out : undefined;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  const db = ensureStore();
  const sseClients = new Set<express.Response>();
  const recentSubmissions = new Map<string, number>();

  const broadcastLeaderboard = (trackId: TrackId) => {
    const summary = db.entries
      .filter((e) => e.trackId === trackId)
      .sort((a, b) => a.totalTimeMs - b.totalTimeMs)
      .slice(0, 30)
      .map(({ ghost: _g, ...rest }) => ({
        ...rest,
        hasGhost: Array.isArray(_g) && _g.length > 0,
      }));
    const payload = `data: ${JSON.stringify({ trackId, entries: summary })}\n\n`;
    for (const res of sseClients) {
      res.write(payload);
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/leaderboard/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.get('/api/leaderboard', (req, res) => {
    const trackParam = String(req.query.trackId || '');
    const filtered = VALID_TRACKS.has(trackParam as TrackId)
      ? db.entries.filter((e) => e.trackId === trackParam)
      : db.entries;

    const sorted = [...filtered]
      .sort((a, b) => a.totalTimeMs - b.totalTimeMs)
      .slice(0, 50)
      .map(({ ghost, ...rest }) => ({
        ...rest,
        hasGhost: Array.isArray(ghost) && ghost.length > 0,
      }));

    res.json({ entries: sorted });
  });

  app.get('/api/leaderboard/:id/ghost', (req, res) => {
    const entryId = String(req.params.id || '').slice(0, 64);
    const entry = db.entries.find((e) => e.id === entryId);
    if (!entry || !entry.ghost) {
      res.status(404).json({ error: 'Ghost telemetry not found' });
      return;
    }
    res.json({
      id: entry.id,
      driverName: entry.driverName,
      chassis: entry.chassis,
      totalTimeMs: entry.totalTimeMs,
      ghost: entry.ghost,
    });
  });

  app.post('/api/leaderboard', (req, res) => {
    const ip = req.ip || 'local';
    const now = Date.now();
    const lastSub = recentSubmissions.get(ip) || 0;
    if (now - lastSub < 3000) {
      res.status(429).json({ error: 'Please wait a moment before submitting another time.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const driverName = sanitizeDriverName(body.driverName);
    if (!driverName) {
      res.status(400).json({ error: 'Driver name must be 2–22 characters (letters, numbers, spaces, . or -).' });
      return;
    }

    const trackId = body.trackId as TrackId;
    if (!VALID_TRACKS.has(trackId)) {
      res.status(400).json({ error: 'Invalid trackId.' });
      return;
    }

    const chassis = body.chassis as ChassisId;
    if (!VALID_CHASSIS.has(chassis)) {
      res.status(400).json({ error: 'Invalid chassis.' });
      return;
    }

    const bestLapMs = Number(body.bestLapMs);
    const totalTimeMs = Number(body.totalTimeMs);
    const topSpeedKmh = Number(body.topSpeedKmh);

    if (
      !Number.isFinite(bestLapMs) ||
      !Number.isFinite(totalTimeMs) ||
      bestLapMs < 15000 ||
      bestLapMs > 300000 ||
      totalTimeMs < 45000 ||
      totalTimeMs > 900000 ||
      totalTimeMs < bestLapMs * 2.5
    ) {
      res.status(400).json({ error: 'Lap or race time outside valid circuit bounds.' });
      return;
    }

    const countryRaw = typeof body.country === 'string' ? body.country.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : 'INT';
    const country = countryRaw.length >= 2 ? countryRaw : 'INT';
    const vehicleSummary =
      typeof body.vehicleSummary === 'string'
        ? body.vehicleSummary.replace(/[^\w\s·\-]/g, '').trim().slice(0, 64)
        : chassis;

    const entry: LeaderboardEntry = {
      id: `run-${crypto.randomUUID().slice(0, 8)}`,
      driverName,
      country,
      trackId,
      chassis,
      vehicleSummary,
      primaryColor: sanitizeColor(body.primaryColor),
      bestLapMs: Math.round(bestLapMs),
      totalTimeMs: Math.round(totalTimeMs),
      topSpeedKmh: Number.isFinite(topSpeedKmh)
        ? Math.max(40, Math.min(420, Math.round(topSpeedKmh)))
        : 220,
      createdAt: new Date().toISOString(),
      isVerifiedRun: true,
      ghost: sanitizeGhost(body.ghost),
    };

    recentSubmissions.set(ip, now);
    db.entries.push(entry);
    // Keep top 80 entries per track to bound storage
    const perTrack = db.entries
      .filter((e) => e.trackId === trackId)
      .sort((a, b) => a.totalTimeMs - b.totalTimeMs)
      .slice(0, 80);
    const otherTracks = db.entries.filter((e) => e.trackId !== trackId);
    db.entries = [...perTrack, ...otherTracks];

    saveStore(db);
    broadcastLeaderboard(trackId);

    const { ghost: _g, ...publicEntry } = entry;
    res.status(201).json({
      entry: { ...publicEntry, hasGhost: Boolean(_g && _g.length > 0) },
    });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Circuit server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
