import React from 'react';
import {
  Compass,
  Film,
  Flag,
  Flame,
  Globe,
  Sliders,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  CHASSIS_SPECS,
  GameMode,
  TRACK_SPECS,
  TrackId,
  VEHICLE_CLASS_LABELS,
  VehicleConfig,
} from '../game/types';

interface TitleOverlayProps {
  trackId: TrackId;
  gameMode: GameMode;
  freeRoamTraffic: boolean;
  vehicleConfig: VehicleConfig;
  activeGhostName: string | null;
  muted: boolean;
  onSelectTrack: (trackId: TrackId) => void;
  onSelectMode: (mode: GameMode) => void;
  onToggleFreeRoamTraffic: () => void;
  onStartRace: () => void;
  onOpenGarage: () => void;
  onOpenLeaderboard: () => void;
  onOpenReplays: () => void;
  onToggleMute: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  trackId,
  gameMode,
  freeRoamTraffic,
  vehicleConfig,
  activeGhostName,
  muted,
  onSelectTrack,
  onSelectMode,
  onToggleFreeRoamTraffic,
  onStartRace,
  onOpenGarage,
  onOpenLeaderboard,
  onOpenReplays,
  onToggleMute,
}) => {
  const track = TRACK_SPECS[trackId];
  const chassis = CHASSIS_SPECS[vehicleConfig.chassis];

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Top Scrim & Minimal Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto">
          <svg
            viewBox="0 0 420 84"
            className="w-[290px] md:w-[390px] h-auto drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]"
            aria-label="Apex Circuit"
          >
            <defs>
              <linearGradient id="apexAccent" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <path d="M6 58 L28 14 L52 14 L30 58 Z" fill="url(#apexAccent)" />
            <path
              d="M38 58 L60 14 L72 14 L50 58 Z"
              fill="#f8fafc"
              fillOpacity="0.92"
            />
            <text
              x="86"
              y="44"
              fill="#f8fafc"
              fontFamily="Chakra Petch, sans-serif"
              fontWeight="700"
              fontSize="38"
              letterSpacing="3"
            >
              APEX CIRCUIT
            </text>
            <text
              x="88"
              y="66"
              fill="#cbd5e1"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontWeight="500"
              fontSize="13"
              letterSpacing="2.4"
            >
              PRECISION TELEMETRY RACING
            </text>
          </svg>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenReplays}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-100 hover:border-cyan-400/60 hover:text-cyan-300 transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Film className="w-4 h-4 text-cyan-400" />
            <span>Replays</span>
          </button>
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-100 hover:border-amber-400/60 hover:text-amber-300 transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Leaderboard</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="p-2.5 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-200 hover:border-white/35 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bottom Launch Deck leaving center 3D car clear */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="pointer-events-auto bg-[#0a0d14]/88 border border-white/12 rounded-xl p-5 max-w-2xl w-full">
          {/* 4-Mode Selector (Standard + Special Modes) */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-3 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectMode('race')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'race'
                    ? 'bg-red-600 text-white'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white'
                }`}
              >
                3-Lap Race
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('elimination')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'elimination'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white'
                }`}
              >
                Knockout
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('drift')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'drift'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white'
                }`}
              >
                Drift Attack
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('freeroam')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'freeroam'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white'
                }`}
              >
                Free Roam
              </button>
            </div>

            {gameMode === 'freeroam' ? (
              <button
                type="button"
                onClick={onToggleFreeRoamTraffic}
                className="text-xs font-medium text-cyan-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                Traffic: {freeRoamTraffic ? 'On (7 AI)' : 'Solo Track'}
              </button>
            ) : gameMode === 'elimination' ? (
              <span className="text-xs text-rose-300 font-mono-tabular whitespace-nowrap shrink-0">
                8 Cars · KO Every 22s
              </span>
            ) : gameMode === 'drift' ? (
              <span className="text-xs text-amber-300 font-mono-tabular whitespace-nowrap shrink-0">
                90s · Combo Scoring
              </span>
            ) : (
              <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
                {track.laps} Laps · {track.lengthLabel}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            {(['redstone', 'harbor'] as TrackId[]).map((id) => {
              const item = TRACK_SPECS[id];
              const selected = id === trackId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTrack(id)}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-white/10 border-red-500 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="font-display font-semibold text-sm whitespace-nowrap truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 whitespace-nowrap truncate">
                    {item.location}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm inline-block border border-white/25"
                style={{ backgroundColor: vehicleConfig.primaryColor }}
              />
              <span className="font-medium text-white">{chassis.name}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400">
                {VEHICLE_CLASS_LABELS[chassis.vehicleClass]} · {chassis.drivetrain.toUpperCase()}
              </span>
              {activeGhostName && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-cyan-300 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    Ghost: {activeGhostName}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenGarage}
              className="flex items-center gap-1.5 text-slate-200 hover:text-white font-medium whitespace-nowrap cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-red-400" />
              <span>10 Cars · Garage</span>
            </button>
          </div>
        </div>

        {/* Primary CTA + Control Hint */}
        <div className="pointer-events-auto flex flex-col items-start lg:items-end gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenGarage}
              className="px-5 py-3.5 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-100 hover:border-white/35 font-display font-semibold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Garage
            </button>
            <button
              type="button"
              onClick={onStartRace}
              className={`flex items-center gap-2.5 px-7 py-3.5 rounded-lg font-display font-bold text-base tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gameMode === 'freeroam'
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_8px_28px_rgba(6,182,212,0.35)]'
                  : gameMode === 'drift'
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-[0_8px_28px_rgba(245,158,11,0.35)]'
                    : gameMode === 'elimination'
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_8px_28px_rgba(225,29,72,0.42)]'
                      : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_8px_28px_rgba(220,38,38,0.45)]'
              }`}
            >
              {gameMode === 'freeroam' ? (
                <Compass className="w-4 h-4" />
              ) : gameMode === 'drift' ? (
                <Flame className="w-4 h-4" />
              ) : gameMode === 'elimination' ? (
                <Zap className="w-4 h-4" />
              ) : (
                <Flag className="w-4 h-4" />
              )}
              <span>
                {gameMode === 'freeroam'
                  ? 'Start Free Roam'
                  : gameMode === 'drift'
                    ? 'Start Drift Attack'
                    : gameMode === 'elimination'
                      ? 'Start Knockout'
                      : 'Start Race'}
              </span>
            </button>
          </div>
          <p className="text-xs text-slate-300/90 bg-[#0a0d14]/75 px-3 py-1.5 rounded-md border border-white/10">
            WASD / Arrows Drive · Shift Nitrous · Space Handbrake · R Reset · C Camera · Esc Pause
          </p>
        </div>
      </div>
    </div>
  );
};
