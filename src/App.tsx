import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, Film, Flag, Play, RotateCcw, Trophy } from 'lucide-react';
import { GarageDock } from './components/GarageDock';
import { LeaderboardModal } from './components/LeaderboardModal';
import { RaceFinishResult, RacingCanvas } from './components/RacingCanvas';
import { RacingHud, formatTimeMs } from './components/RacingHud';
import { ReplayDock } from './components/ReplayDock';
import { SavedReplaysModal } from './components/SavedReplaysModal';
import { TitleOverlay } from './components/TitleOverlay';
import { exportSessionJson, saveRaceSession } from './game/replayStorage';
import {
  CameraMode,
  CHASSIS_SPECS,
  DEFAULT_VEHICLE_CONFIG,
  FullRaceSession,
  GameMode,
  GamePhase,
  GhostSample,
  RaceTelemetry,
  ReplayCameraAngle,
  ReplayPlaybackTelemetry,
  TRACK_SPECS,
  TrackId,
  VehicleConfig,
} from './game/types';

const STORAGE_CAR_KEY = 'apex_circuit_vehicle_v1';
const STORAGE_DRIVER_KEY = 'apex_circuit_driver_v1';

const INITIAL_REPLAY_TELEMETRY: ReplayPlaybackTelemetry = {
  currentTimeSec: 0,
  durationSec: 1,
  speedKmh: 0,
  rpm: 1150,
  redlineRpm: 8600,
  gear: 1,
  lap: 1,
  throttle: 0,
  brake: 0,
  offTrack: false,
  focusName: 'Apex Driver',
};

const INITIAL_TELEMETRY: RaceTelemetry = {
  speedKmh: 0,
  rpm: 1150,
  redlineRpm: 8600,
  gear: 1,
  throttle: 0,
  brake: 0,
  handbrake: false,
  steerAngle: 0,
  slipRatio: 0,
  absActive: false,
  offTrack: false,
  wrongWay: false,
  lap: 1,
  totalLaps: 3,
  position: 8,
  totalRacers: 8,
  currentLapMs: 0,
  bestLapMs: null,
  lastLapMs: null,
  totalRaceMs: 0,
  sectorSplitsMs: [null, null, null],
  deltaBestMs: null,
  topSpeedKmh: 0,
  progressNorm: 0,
  nitroPct: 100,
  nitroActive: false,
  drafting: false,
  driftScore: 0,
  driftCurrentPts: 0,
  driftMultiplier: 1,
  driftTimeRemainingSec: 90,
  driftStatus: 'none',
  knockoutNextSec: 22,
  activeRacersCount: 8,
  knockoutWarning: false,
  knockoutBanner: null,
  playerPos: { x: 0, z: 0, yaw: 0 },
  rivals: [],
};

function loadSavedVehicle(): VehicleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CAR_KEY);
    if (!raw) return DEFAULT_VEHICLE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<VehicleConfig>;
    const merged = { ...DEFAULT_VEHICLE_CONFIG, ...parsed };
    if (!(merged.chassis in CHASSIS_SPECS)) {
      merged.chassis = DEFAULT_VEHICLE_CONFIG.chassis;
    }
    return merged;
  } catch {
    return DEFAULT_VEHICLE_CONFIG;
  }
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('title');
  const [gameMode, setGameMode] = useState<GameMode>('race');
  const [freeRoamTraffic, setFreeRoamTraffic] = useState(true);
  const [trackId, setTrackId] = useState<TrackId>('redstone');
  const [vehicleConfig, setVehicleConfig] = useState<VehicleConfig>(loadSavedVehicle);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [muted, setMuted] = useState(false);
  const [raceSessionId, setRaceSessionId] = useState(0);
  const [resetCarToken, setResetCarToken] = useState(0);

  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [countdownValue, setCountdownValue] = useState<number | 'GO' | null>(null);
  const [finishResult, setFinishResult] = useState<RaceFinishResult | null>(null);

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [activeGhost, setActiveGhost] = useState<{
    id: string;
    driverName: string;
    samples: GhostSample[];
  } | null>(null);

  const [driverName, setDriverName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_DRIVER_KEY) || 'Apex Driver';
    } catch {
      return 'Apex Driver';
    }
  });
  const [country, setCountry] = useState('USA');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submittedRun, setSubmittedRun] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Full Session Saving & Multi-Angle Replay State
  const [replaysModalOpen, setReplaysModalOpen] = useState(false);
  const [activeReplaySession, setActiveReplaySession] = useState<FullRaceSession | null>(null);
  const [replayReturnPhase, setReplayReturnPhase] = useState<'title' | 'finished'>('title');
  const [savedSessionIds, setSavedSessionIds] = useState<Set<string>>(() => new Set());
  const [replayPlaying, setReplayPlaying] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayCameraAngle, setReplayCameraAngle] = useState<ReplayCameraAngle>('tv');
  const [replayFocusIndex, setReplayFocusIndex] = useState(-1);
  const [replaySeekTarget, setReplaySeekTarget] = useState<{
    timeSec: number;
    seq: number;
  } | null>(null);
  const [replayTelemetry, setReplayTelemetry] = useState<ReplayPlaybackTelemetry>(
    INITIAL_REPLAY_TELEMETRY
  );

  const captureSessionRef = useRef<(() => FullRaceSession | null) | null>(null);

  const touchInputRef = useRef({
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
  });

  const handleVehicleChange = useCallback((next: VehicleConfig) => {
    setVehicleConfig(next);
    try {
      localStorage.setItem(STORAGE_CAR_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const persistSessionToVault = useCallback(async (session: FullRaceSession) => {
    try {
      await saveRaceSession(session);
      setSavedSessionIds((prev) => {
        const next = new Set(prev);
        next.add(session.id);
        return next;
      });
    } catch {
      // IndexedDB failure handled gracefully; session remains playable in memory
    }
  }, []);

  const handleStartRace = useCallback(() => {
    setFinishResult(null);
    setSubmitMessage(null);
    setSubmittedRun(false);
    setRaceSessionId((id) => id + 1);
    if (gameMode === 'freeroam' || gameMode === 'drift') {
      setCountdownValue(null);
      setPhase('racing');
    } else {
      setCountdownValue(3);
      setPhase('countdown');
    }
  }, [gameMode]);

  const handleRaceStart = useCallback(() => {
    setPhase('racing');
  }, []);

  const handleRaceFinish = useCallback(
    (result: RaceFinishResult) => {
      setFinishResult(result);
      setActiveReplaySession(result.session);
      setPhase('finished');
      void persistSessionToVault(result.session);
    },
    [persistSessionToVault]
  );

  const handleLaunchReplay = useCallback(
    (session: FullRaceSession, returnTo: 'title' | 'finished') => {
      setActiveReplaySession(session);
      setReplayReturnPhase(returnTo);
      setReplayPlaying(true);
      setReplaySpeed(1);
      setReplayCameraAngle('tv');
      setReplayFocusIndex(-1);
      setReplaySeekTarget({ timeSec: 0, seq: Date.now() });
      setReplayTelemetry({
        ...INITIAL_REPLAY_TELEMETRY,
        durationSec:
          session.frames.length > 0
            ? session.frames[session.frames.length - 1].t
            : session.totalTimeMs / 1000,
        focusName: session.driverName,
      });
      setReplaysModalOpen(false);
      setPhase('replay');
    },
    []
  );

  const handleTogglePause = useCallback(() => {
    setPhase((prev) => {
      if (prev === 'racing') return 'paused';
      if (prev === 'paused') return 'racing';
      return prev;
    });
  }, []);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'chase' ? 'hood' : prev === 'hood' ? 'orbit' : 'chase'
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const handleResetCar = useCallback(() => {
    setResetCarToken((t) => t + 1);
  }, []);

  const handleSelectGhost = useCallback(async (entryId: string, ghostDriver: string) => {
    const res = await fetch(`/api/leaderboard/${encodeURIComponent(entryId)}/ghost`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.ghost)) {
      setActiveGhost({
        id: entryId,
        driverName: ghostDriver,
        samples: data.ghost,
      });
      setLeaderboardOpen(false);
    }
  }, []);

  const handleSubmitLeaderboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishResult || submittedRun || submittingScore) return;
    setSubmittingScore(true);
    setSubmitMessage(null);

    try {
      localStorage.setItem(STORAGE_DRIVER_KEY, driverName);
    } catch {
      // Ignore storage error
    }

    const spec = CHASSIS_SPECS[vehicleConfig.chassis];
    const tireLabel =
      vehicleConfig.tires === 'slick'
        ? 'Track Slick'
        : vehicleConfig.tires === 'semislick'
          ? 'Semi-Slick'
          : 'Street Sport';
    const wingLabel =
      vehicleConfig.wing === 'timeattack'
        ? 'Dual Wing'
        : vehicleConfig.wing === 'gt'
          ? 'GT Wing'
          : 'Lip Spoiler';

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName,
          country,
          trackId,
          chassis: vehicleConfig.chassis,
          vehicleSummary: `${spec.name} · ${tireLabel} · ${wingLabel}`,
          primaryColor: vehicleConfig.primaryColor,
          bestLapMs: finishResult.bestLapMs,
          totalTimeMs: finishResult.totalTimeMs,
          topSpeedKmh: finishResult.topSpeedKmh,
          ghost: finishResult.ghost,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMessage({ type: 'err', text: data.error || 'Failed to publish time.' });
      } else {
        setSubmittedRun(true);
        setSubmitMessage({
          type: 'ok',
          text: 'Time and 3D ghost telemetry published to Global Standings.',
        });
      }
    } catch {
      setSubmitMessage({ type: 'err', text: 'Network error submitting leaderboard entry.' });
    } finally {
      setSubmittingScore(false);
    }
  };

  useEffect(() => {
    if (phase !== 'title' || leaderboardOpen || replaysModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartRace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, leaderboardOpen, replaysModalOpen, handleStartRace]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#08090d]">
      {/* Isolated 3D WebGL Viewport */}
      <RacingCanvas
        phase={phase}
        gameMode={gameMode}
        freeRoamTraffic={freeRoamTraffic}
        trackId={trackId}
        driverName={driverName}
        vehicleConfig={vehicleConfig}
        cameraMode={cameraMode}
        muted={muted}
        raceSessionId={raceSessionId}
        resetCarToken={resetCarToken}
        activeGhost={activeGhost}
        replaySession={activeReplaySession}
        replayPlaying={replayPlaying}
        replaySpeed={replaySpeed}
        replayCameraAngle={replayCameraAngle}
        replayFocusIndex={replayFocusIndex}
        replaySeekTarget={replaySeekTarget}
        captureSessionRef={captureSessionRef}
        touchInputRef={touchInputRef}
        onTelemetry={setTelemetry}
        onReplayTelemetry={setReplayTelemetry}
        onReplayEnd={() => setReplayPlaying(false)}
        onCountdownTick={setCountdownValue}
        onRaceStart={handleRaceStart}
        onRaceFinish={handleRaceFinish}
        onTogglePause={handleTogglePause}
        onCycleCamera={handleCycleCamera}
        onToggleMute={handleToggleMute}
        onContextLostChange={setContextLost}
      />

      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#08090d]/95 p-6 text-center">
          <div className="max-w-md bg-[#0f1420] border border-white/15 rounded-xl p-6">
            <h2 className="font-display font-bold text-lg text-white">
              Graphics Context Suspended
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Your browser temporarily reclaimed the WebGL context. Restore or reload to resume racing.
            </p>
          </div>
        </div>
      )}

      {/* Title Screen */}
      {phase === 'title' && (
        <TitleOverlay
          trackId={trackId}
          gameMode={gameMode}
          freeRoamTraffic={freeRoamTraffic}
          vehicleConfig={vehicleConfig}
          activeGhostName={activeGhost?.driverName ?? null}
          muted={muted}
          onSelectTrack={(id) => {
            setTrackId(id);
            setActiveGhost(null);
          }}
          onSelectMode={setGameMode}
          onToggleFreeRoamTraffic={() => setFreeRoamTraffic((v) => !v)}
          onStartRace={handleStartRace}
          onOpenGarage={() => setPhase('garage')}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          onOpenReplays={() => setReplaysModalOpen(true)}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Interactive 3D Garage Customizer */}
      {phase === 'garage' && (
        <GarageDock
          config={vehicleConfig}
          gameMode={gameMode}
          onChange={handleVehicleChange}
          onBack={() => setPhase('title')}
          onStartRace={handleStartRace}
        />
      )}

      {/* Live Racing & Free Roam HUD */}
      {(phase === 'countdown' || phase === 'racing' || phase === 'paused') && (
        <RacingHud
          phase={phase}
          gameMode={gameMode}
          trackId={trackId}
          telemetry={telemetry}
          countdownValue={countdownValue}
          cameraMode={cameraMode}
          muted={muted}
          activeGhostName={activeGhost?.driverName ?? null}
          touchInputRef={touchInputRef}
          onTogglePause={handleTogglePause}
          onCycleCamera={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onResetCar={handleResetCar}
          onOpenGarage={() => setPhase('garage')}
        />
      )}

      {/* Multi-Angle Replay Theater HUD */}
      {phase === 'replay' && activeReplaySession && (
        <ReplayDock
          session={activeReplaySession}
          telemetry={replayTelemetry}
          playing={replayPlaying}
          speedMultiplier={replaySpeed}
          cameraAngle={replayCameraAngle}
          focusIndex={replayFocusIndex}
          isSaved={savedSessionIds.has(activeReplaySession.id)}
          muted={muted}
          onTogglePlay={() => {
            if (!replayPlaying && replayTelemetry.currentTimeSec >= replayTelemetry.durationSec - 0.05) {
              setReplaySeekTarget({ timeSec: 0, seq: Date.now() });
            }
            setReplayPlaying((p) => !p);
          }}
          onSeek={(timeSec) => {
            setReplaySeekTarget({ timeSec, seq: Date.now() });
          }}
          onSetSpeed={setReplaySpeed}
          onSetCameraAngle={setReplayCameraAngle}
          onSetFocusIndex={setReplayFocusIndex}
          onSaveSession={() => persistSessionToVault(activeReplaySession)}
          onExportSession={() => exportSessionJson(activeReplaySession)}
          onToggleMute={handleToggleMute}
          onExit={() => setPhase(replayReturnPhase)}
        />
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-[#0b0f17] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h2 className="font-display font-bold text-xl text-white">
              {gameMode === 'freeroam'
                ? 'Free Roam Paused'
                : gameMode === 'drift'
                  ? 'Drift Attack Paused'
                  : gameMode === 'elimination'
                    ? 'Knockout Paused'
                    : 'Race Paused'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {TRACK_SPECS[trackId].name} ·{' '}
              {gameMode === 'freeroam'
                ? `Practice Lap ${telemetry.lap}`
                : gameMode === 'drift'
                  ? `${telemetry.driftScore.toLocaleString()} pts`
                  : gameMode === 'elimination'
                    ? `${telemetry.activeRacersCount}/8 Survivors · P${telemetry.position}`
                    : `Lap ${telemetry.lap} of ${telemetry.totalLaps}`}
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setPhase('racing')}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm transition-colors cursor-pointer"
              >
                Resume
              </button>
              {telemetry.totalRaceMs > 3000 && (
                <button
                  type="button"
                  onClick={() => {
                    const snap = captureSessionRef.current?.();
                    if (snap) {
                      void persistSessionToVault(snap);
                      handleLaunchReplay(snap, 'title');
                    }
                  }}
                  className="w-full py-2.5 rounded-lg bg-amber-500/15 border border-amber-400/40 hover:bg-amber-500/25 text-amber-300 font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>Save & Watch Replay</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleStartRace}
                className="w-full py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 font-medium text-sm transition-colors cursor-pointer"
              >
                Restart Session
              </button>
              <button
                type="button"
                onClick={() => setPhase('garage')}
                className="w-full py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 font-medium text-sm transition-colors cursor-pointer"
              >
                Open Garage
              </button>
              <button
                type="button"
                onClick={() => setPhase('title')}
                className="w-full py-2.5 rounded-lg bg-transparent border border-white/12 hover:border-white/30 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
              >
                Exit to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Race Finished & Global Leaderboard + Multi-Angle Replay Modal */}
      {phase === 'finished' && finishResult && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-black/78">
          <div className="w-full max-w-xl bg-[#0b0f17] border border-white/15 rounded-2xl p-6 shadow-2xl">
            {(() => {
              const driftPts = finishResult.driftScore ?? 0;
              const driftTier =
                driftPts >= 18000
                  ? 'Apex Master'
                  : driftPts >= 10000
                    ? 'Gold Tier'
                    : driftPts >= 4500
                      ? 'Silver Tier'
                      : 'Bronze Tier';

              return (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium text-amber-400">
                        {TRACK_SPECS[trackId].name}
                      </div>
                      <h2 className="font-display font-bold text-2xl text-white mt-0.5">
                        {gameMode === 'drift'
                          ? `Drift Attack — ${driftTier}`
                          : gameMode === 'elimination'
                            ? finishResult.position === 1
                              ? 'Last Car Standing — P1 Winner'
                              : `Knockout Eliminated — P${finishResult.position}`
                            : `Checkered Flag — P${finishResult.position} Finish`}
                      </h2>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                      <Flag className="w-5 h-5 text-amber-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-5">
                    {gameMode === 'drift' ? (
                      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                        <div className="text-[11px] text-slate-400">Drift Score</div>
                        <div className="font-mono-tabular font-bold text-lg text-amber-300 mt-0.5">
                          {driftPts.toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                        <div className="text-[11px] text-slate-400">
                          {gameMode === 'elimination' ? 'Survival Time' : 'Total Time'}
                        </div>
                        <div className="font-mono-tabular font-bold text-lg text-white mt-0.5">
                          {formatTimeMs(finishResult.totalTimeMs)}
                        </div>
                      </div>
                    )}
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">Best Lap</div>
                      <div className="font-mono-tabular font-bold text-lg text-emerald-400 mt-0.5">
                        {formatTimeMs(finishResult.bestLapMs)}
                      </div>
                    </div>
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">Top Speed</div>
                      <div className="font-mono-tabular font-bold text-lg text-amber-300 mt-0.5">
                        {finishResult.topSpeedKmh} km/h
                      </div>
                    </div>
                  </div>

                  {/* Session Replay Action Banner */}
                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        Full Session Telemetry Saved ({finishResult.session.frames.length} frames)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Playback from 6 camera angles or export session JSON
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => exportSessionJson(finishResult.session)}
                        title="Download full session JSON"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLaunchReplay(finishResult.session, 'finished')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-xs tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Watch Replay</span>
                      </button>
                    </div>
                  </div>

                  {gameMode === 'race' && (
                    <form onSubmit={handleSubmitLeaderboard} className="mt-4 pt-4 border-t border-white/10">
                      <div className="text-xs font-semibold text-slate-200 mb-2.5">
                        Submit Run & Ghost Replay to Global Standings
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={driverName}
                          maxLength={22}
                          required
                          onChange={(e) => setDriverName(e.target.value)}
                          placeholder="Driver name"
                          className="flex-1 px-3.5 py-2 rounded-lg bg-white/[0.05] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                        />
                        <input
                          type="text"
                          value={country}
                          maxLength={3}
                          onChange={(e) => setCountry(e.target.value.toUpperCase())}
                          placeholder="USA"
                          className="w-20 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/15 text-sm font-mono-tabular text-center text-white focus:outline-none focus:border-red-500"
                        />
                        <button
                          type="submit"
                          disabled={submittingScore || submittedRun}
                          className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            submittedRun
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 hover:bg-red-500 text-white disabled:opacity-60'
                          }`}
                        >
                          {submittedRun ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Published</span>
                            </>
                          ) : (
                            <span>{submittingScore ? 'Saving...' : 'Submit Time'}</span>
                          )}
                        </button>
                      </div>
                      {submitMessage && (
                        <p
                          className={`text-xs mt-2 ${
                            submitMessage.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {submitMessage.text}
                        </p>
                      )}
                    </form>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLeaderboardOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trophy className="w-4 h-4" />
                        <span>Standings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaysModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-cyan-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Film className="w-4 h-4" />
                        <span>Replay Vault</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPhase('title')}
                        className="px-4 py-2.5 rounded-lg border border-white/15 text-slate-300 hover:text-white text-sm font-medium transition-colors cursor-pointer"
                      >
                        Title
                      </button>
                      <button
                        type="button"
                        onClick={handleStartRace}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Play Again</span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Global Competitive Leaderboard Modal */}
      <LeaderboardModal
        open={leaderboardOpen}
        initialTrackId={trackId}
        activeGhostId={activeGhost?.id ?? null}
        onClose={() => setLeaderboardOpen(false)}
        onSelectGhost={handleSelectGhost}
        onClearGhost={() => setActiveGhost(null)}
      />

      {/* Saved Race Sessions & Replay Vault Modal */}
      <SavedReplaysModal
        open={replaysModalOpen}
        onClose={() => setReplaysModalOpen(false)}
        onWatchSession={(session) =>
          handleLaunchReplay(session, phase === 'finished' ? 'finished' : 'title')
        }
      />
    </main>
  );
}
