import React, { useMemo } from 'react';
import { Camera, Pause, RotateCcw, Sliders, Volume2, VolumeX } from 'lucide-react';
import { buildTrackData } from '../game/tracks';
import { CameraMode, GameMode, GamePhase, RaceTelemetry, TrackId } from '../game/types';

interface RacingHudProps {
  phase: GamePhase;
  gameMode: GameMode;
  trackId: TrackId;
  telemetry: RaceTelemetry;
  countdownValue: number | 'GO' | null;
  cameraMode: CameraMode;
  muted: boolean;
  activeGhostName: string | null;
  touchInputRef: React.MutableRefObject<{
    throttle: number;
    brake: number;
    steer: number;
    handbrake: boolean;
    nitro?: boolean;
  }>;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onResetCar: () => void;
  onOpenGarage: () => void;
}

export function formatTimeMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--:--.---';
  const totalMs = Math.max(0, Math.round(ms));
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function formatCountdownSec(sec: number): string {
  const clamped = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(clamped / 60);
  const rem = clamped % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const RacingHud: React.FC<RacingHudProps> = ({
  phase,
  gameMode,
  trackId,
  telemetry,
  countdownValue,
  cameraMode,
  muted,
  activeGhostName,
  touchInputRef,
  onTogglePause,
  onCycleCamera,
  onToggleMute,
  onResetCar,
  onOpenGarage,
}) => {
  const trackData = useMemo(() => buildTrackData(trackId), [trackId]);

  const minimapSvg = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = trackData.minimapBounds;
    const pad = 20;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min((136 - pad * 2) / spanX, (136 - pad * 2) / spanZ);
    const offsetX = (136 - spanX * scale) * 0.5 - minX * scale;
    const offsetY = (136 - spanZ * scale) * 0.5 - minZ * scale;

    const toSvg = (x: number, z: number) => ({
      sx: x * scale + offsetX,
      sy: z * scale + offsetY,
    });

    const d =
      trackData.minimapPoints
        .map((p, idx) => {
          const { sx, sy } = toSvg(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
        })
        .join(' ') + ' Z';

    return { d, toSvg };
  }, [trackData]);

  const rpmFraction = Math.min(1, telemetry.rpm / Math.max(1, telemetry.redlineRpm));
  const arcRadius = 56;
  const arcCircumference = 2 * Math.PI * arcRadius;
  const arcMaxSweep = arcCircumference * 0.72;
  const arcFill = arcMaxSweep * rpmFraction;
  const isRedline = rpmFraction > 0.88;
  const gearLabel =
    telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : String(telemetry.gear);

  const playerSvgPos = minimapSvg.toSvg(telemetry.playerPos.x, telemetry.playerPos.z);

  const speedStreakIntensity =
    phase === 'racing'
      ? Math.max(
          telemetry.nitroActive ? 0.55 : 0,
          Math.min(0.65, Math.max(0, telemetry.speedKmh - 195) / 145)
        )
      : 0;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Perimeter High-Speed Radial Framing (Zero center occlusion, reduced-motion safe) */}
      {speedStreakIntensity > 0.04 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 motion-reduce:hidden transition-opacity duration-150"
          style={{
            opacity: speedStreakIntensity,
            background: telemetry.nitroActive
              ? 'radial-gradient(ellipse at center, transparent 58%, rgba(34,211,238,0.22) 100%)'
              : 'radial-gradient(ellipse at center, transparent 62%, rgba(255,255,255,0.14) 100%)',
          }}
        />
      )}

      {/* Top Perimeter Clusters */}
      <div className="relative flex items-start justify-between gap-4">
        {/* Top-Left: Mode-Specific Standings / Timing */}
        <div
          className={`bg-[#0a0d14]/86 border rounded-xl px-4 py-3 flex items-center gap-5 ${
            gameMode === 'elimination' && telemetry.knockoutWarning
              ? 'border-rose-500/80'
              : 'border-white/12'
          }`}
        >
          {gameMode === 'freeroam' ? (
            <>
              <div>
                <div className="text-[11px] text-cyan-300 font-semibold tracking-wide">
                  FREE ROAM
                </div>
                <div className="font-mono-tabular font-semibold text-base text-white leading-tight mt-0.5">
                  {formatTimeMs(telemetry.totalRaceMs)}
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div>
                <div className="text-[11px] text-slate-400 font-medium">LAP {telemetry.lap}</div>
                <div className="font-mono-tabular font-semibold text-base text-white leading-tight mt-0.5">
                  {formatTimeMs(telemetry.currentLapMs)}
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[100px]">
                <div className="text-[11px] text-slate-400">BEST PRACTICE</div>
                <div className="font-mono-tabular font-semibold text-sm text-emerald-400 mt-0.5">
                  {formatTimeMs(telemetry.bestLapMs)}
                </div>
              </div>
            </>
          ) : gameMode === 'elimination' ? (
            <>
              <div>
                <div className="text-[11px] text-rose-300 font-semibold tracking-wide">
                  KNOCKOUT
                </div>
                <div className="font-display font-bold text-2xl text-white font-mono-tabular leading-tight">
                  P{telemetry.position}
                  <span className="text-sm text-slate-400 font-normal">
                    /{telemetry.activeRacersCount}
                  </span>
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[84px]">
                <div className="text-[11px] text-slate-400 font-medium">NEXT KO</div>
                <div
                  className={`font-mono-tabular font-bold text-xl leading-tight ${
                    telemetry.knockoutNextSec <= 6 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {formatCountdownSec(telemetry.knockoutNextSec)}
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[96px]">
                <div className="text-[11px] text-slate-400">STATUS</div>
                <div
                  className={`text-xs font-bold mt-1 whitespace-nowrap ${
                    telemetry.knockoutWarning ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {telemetry.knockoutWarning ? 'DANGER ZONE' : `LAP ${telemetry.lap}`}
                </div>
              </div>
            </>
          ) : gameMode === 'drift' ? (
            <>
              <div>
                <div className="text-[11px] text-amber-300 font-semibold tracking-wide">
                  TIME LEFT
                </div>
                <div
                  className={`font-mono-tabular font-bold text-2xl leading-tight ${
                    telemetry.driftTimeRemainingSec <= 12 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {formatCountdownSec(telemetry.driftTimeRemainingSec)}
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[110px]">
                <div className="text-[11px] text-slate-400 font-medium">DRIFT SCORE</div>
                <div className="font-mono-tabular font-bold text-2xl text-amber-300 leading-tight">
                  {telemetry.driftScore.toLocaleString()}
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[96px]">
                <div className="text-[11px] text-slate-400">BEST LAP</div>
                <div className="font-mono-tabular font-semibold text-sm text-emerald-400 mt-0.5">
                  {formatTimeMs(telemetry.bestLapMs)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">POS</div>
                <div className="font-display font-bold text-2xl text-white font-mono-tabular leading-tight">
                  P{telemetry.position}
                  <span className="text-sm text-slate-400 font-normal">/{telemetry.totalRacers}</span>
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div>
                <div className="text-[11px] text-slate-400 font-medium">LAP</div>
                <div className="font-display font-bold text-2xl text-white font-mono-tabular leading-tight">
                  {telemetry.lap}
                  <span className="text-sm text-slate-400 font-normal">/{telemetry.totalLaps}</span>
                </div>
              </div>

              <div className="h-8 w-px bg-white/12" />

              <div className="min-w-[116px]">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>CURRENT</span>
                </div>
                <div className="font-mono-tabular font-semibold text-base text-white">
                  {formatTimeMs(telemetry.currentLapMs)}
                </div>
                <div className="text-[11px] font-mono-tabular text-emerald-400">
                  Best {formatTimeMs(telemetry.bestLapMs)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Upper-Center Mode Event Banner (Never covers player car) */}
        <div className="flex flex-col items-center gap-2">
          {gameMode === 'drift' &&
            phase === 'racing' &&
            (telemetry.driftCurrentPts > 0 ||
              telemetry.driftStatus === 'banked' ||
              telemetry.driftStatus === 'lost') && (
              <div
                className={`bg-[#0a0d14]/90 border rounded-xl px-5 py-2 text-center shadow-lg ${
                  telemetry.driftStatus === 'lost'
                    ? 'border-red-500/60'
                    : telemetry.driftStatus === 'banked'
                      ? 'border-emerald-400/60'
                      : 'border-amber-400/60'
                }`}
              >
                {telemetry.driftStatus === 'lost' ? (
                  <div className="font-display font-bold text-sm text-red-400 tracking-wide">
                    IMPACT — COMBO LOST
                  </div>
                ) : telemetry.driftStatus === 'banked' ? (
                  <div className="font-display font-bold text-sm text-emerald-400 tracking-wide">
                    DRIFT BANKED
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2.5 font-mono-tabular">
                    <span className="font-display font-bold text-xl text-amber-300">
                      +{telemetry.driftCurrentPts.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">
                      {telemetry.driftMultiplier.toFixed(1)}x
                    </span>
                  </div>
                )}
              </div>
            )}

          {gameMode === 'elimination' && phase === 'racing' && telemetry.knockoutBanner && (
            <div className="bg-rose-950/92 border border-rose-500/70 rounded-xl px-5 py-2 text-rose-100 font-display font-bold text-sm tracking-wide shadow-lg">
              {telemetry.knockoutBanner}
            </div>
          )}
        </div>

        {/* Top-Right: Circuit Minimap & Action Controls */}
        <div className="flex items-start gap-2.5">
          <div className="hidden sm:block bg-[#0a0d14]/86 border border-white/12 rounded-xl p-2">
            <svg width="136" height="136" viewBox="0 0 136 136" aria-label="Circuit minimap">
              <path
                d={minimapSvg.d}
                fill="none"
                stroke="rgba(148,163,184,0.35)"
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <path
                d={minimapSvg.d}
                fill="none"
                stroke="rgba(241,245,249,0.72)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {telemetry.rivals.map((r) => {
                const pt = minimapSvg.toSvg(r.x, r.z);
                return (
                  <circle
                    key={r.id}
                    cx={pt.sx}
                    cy={pt.sy}
                    r={r.isGhost ? 4.2 : 3.5}
                    fill={r.isGhost ? '#22d3ee' : r.color}
                    fillOpacity={r.isGhost ? 0.85 : 0.95}
                    stroke="#0a0d14"
                    strokeWidth="1"
                  />
                );
              })}
              <circle
                cx={playerSvgPos.sx}
                cy={playerSvgPos.sy}
                r={5}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={onTogglePause}
              title="Pause (Esc)"
              className="p-2.5 rounded-lg bg-[#0a0d14]/86 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCycleCamera}
              title={`Camera: ${cameraMode} (C)`}
              className="p-2.5 rounded-lg bg-[#0a0d14]/86 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onResetCar}
              title="Reset Car onto Track (R)"
              className="p-2.5 rounded-lg bg-[#0a0d14]/86 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            {gameMode === 'freeroam' && (
              <button
                type="button"
                onClick={onOpenGarage}
                title="Switch Vehicle in Garage"
                className="p-2.5 rounded-lg bg-[#0a0d14]/86 border border-white/15 text-cyan-300 hover:text-white hover:border-cyan-400/50 transition-colors cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              title="Mute / Unmute (M)"
              className="p-2.5 rounded-lg bg-[#0a0d14]/86 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Center Alerts (Countdown / Wrong Way / Mobile Drift Score) */}
      <div className="relative flex flex-col items-center justify-center gap-3">
        {phase === 'countdown' && countdownValue !== null && (
          <div className="bg-[#0a0d14]/90 border border-white/20 rounded-2xl px-10 py-5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.7)]">
            <div className="font-display font-bold text-6xl md:text-7xl tracking-wider text-white font-mono-tabular">
              {countdownValue}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Hold W / Up to build launch revs
            </div>
          </div>
        )}

        {phase === 'racing' && telemetry.wrongWay && (
          <div className="bg-red-950/90 border border-red-500/70 rounded-lg px-5 py-2 text-red-200 font-display font-bold text-lg tracking-wider">
            WRONG WAY
          </div>
        )}
      </div>

      {/* Bottom Perimeter Clusters */}
      <div className="relative flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          {(activeGhostName ||
            telemetry.offTrack ||
            telemetry.drafting ||
            telemetry.nitroActive ||
            telemetry.sectorSplitsMs[0]) && (
            <div className="bg-[#0a0d14]/86 border border-white/12 rounded-xl px-4 py-2.5 text-xs space-y-1">
              {telemetry.nitroActive && (
                <div className="text-cyan-300 font-semibold">
                  Nitrous Boost Active
                </div>
              )}
              {telemetry.drafting && (
                <div className="text-sky-300 font-medium">
                  Slipstream Draft — Reduced Drag & Fast NOS Charge
                </div>
              )}
              {activeGhostName && (
                <div className="text-cyan-300 font-medium">
                  Ghost Rival: {activeGhostName}
                </div>
              )}
              {telemetry.offTrack && (
                <div className="text-amber-300 font-medium">
                  Off-Track Surface — Reduced Grip
                </div>
              )}
              {telemetry.sectorSplitsMs[0] !== null && (
                <div className="flex items-center gap-3 font-mono-tabular text-slate-300">
                  <span>S1 {formatTimeMs(telemetry.sectorSplitsMs[0])}</span>
                  {telemetry.sectorSplitsMs[1] !== null && (
                    <span>S2 {formatTimeMs(telemetry.sectorSplitsMs[1])}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mobile / Touch Steer Pad */}
          <div className="pointer-events-auto flex md:hidden items-center gap-2">
            <button
              type="button"
              onPointerDown={() => {
                touchInputRef.current.steer = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.steer = 0;
              }}
              className="w-14 h-14 rounded-xl bg-[#0a0d14]/88 border border-white/20 text-white font-display font-bold text-lg active:bg-white/20"
            >
              L
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchInputRef.current.steer = -1;
              }}
              onPointerUp={() => {
                touchInputRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.steer = 0;
              }}
              className="w-14 h-14 rounded-xl bg-[#0a0d14]/88 border border-white/20 text-white font-display font-bold text-lg active:bg-white/20"
            >
              R
            </button>
          </div>
        </div>

        {/* Bottom-Right: Nitrous + Tachometer + Touch Pedals */}
        <div className="flex items-end gap-3">
          <div className="pointer-events-auto flex md:hidden items-center gap-2">
            <button
              type="button"
              onPointerDown={() => {
                touchInputRef.current.nitro = true;
              }}
              onPointerUp={() => {
                touchInputRef.current.nitro = false;
              }}
              onPointerLeave={() => {
                touchInputRef.current.nitro = false;
              }}
              className="w-14 h-14 rounded-xl bg-cyan-950/90 border border-cyan-400/50 text-cyan-200 font-display font-bold text-xs active:bg-cyan-600/50"
            >
              NOS
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchInputRef.current.brake = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.brake = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.brake = 0;
              }}
              className="w-14 h-14 rounded-xl bg-amber-950/90 border border-amber-500/40 text-amber-200 font-display font-bold text-xs active:bg-amber-700/50"
            >
              BRK
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchInputRef.current.throttle = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.throttle = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.throttle = 0;
              }}
              className="w-16 h-16 rounded-xl bg-red-950/90 border border-red-500/50 text-white font-display font-bold text-xs active:bg-red-600/60"
            >
              GAS
            </button>
          </div>

          <div className="bg-[#0a0d14]/88 border border-white/12 rounded-2xl p-3 flex flex-col items-center gap-2">
            <div className="relative w-[132px] h-[132px] flex items-center justify-center">
              <svg width="132" height="132" viewBox="0 0 132 132" className="rotate-[140deg]">
                <circle
                  cx="66"
                  cy="66"
                  r={arcRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="9"
                  strokeDasharray={`${arcMaxSweep} ${arcCircumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={arcRadius}
                  fill="none"
                  stroke={isRedline ? '#ef4444' : telemetry.nitroActive ? '#22d3ee' : '#f59e0b'}
                  strokeWidth="9"
                  strokeDasharray={`${arcFill} ${arcCircumference}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="font-mono-tabular font-bold text-3xl text-white leading-none">
                  {telemetry.speedKmh}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-1">KM/H</div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span
                    className={`font-display font-bold px-2 py-0.5 rounded ${
                      isRedline
                        ? 'bg-red-600 text-white'
                        : telemetry.nitroActive
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-white/10 text-amber-300'
                    }`}
                  >
                    {gearLabel}
                  </span>
                  {telemetry.absActive && (
                    <span className="text-[10px] font-semibold text-amber-400">ABS</span>
                  )}
                  {!telemetry.absActive && telemetry.slipRatio > 0.45 && (
                    <span className="text-[10px] font-semibold text-cyan-300">SLIP</span>
                  )}
                </div>
              </div>
            </div>

            {/* Compact Nitrous Bar (Shift) */}
            <div className="w-full px-1">
              <div className="flex items-center justify-between text-[10px] font-mono-tabular mb-1">
                <span className={telemetry.nitroActive ? 'text-cyan-300 font-bold' : 'text-slate-400'}>
                  NOS · SHIFT
                </span>
                <span className="text-cyan-300 font-semibold">
                  {Math.round(telemetry.nitroPct)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    telemetry.nitroActive ? 'bg-cyan-300' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, telemetry.nitroPct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
