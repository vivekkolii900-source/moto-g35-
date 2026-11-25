import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatTimeMs } from './RacingHud';
import {
  CHASSIS_SPECS,
  FullRaceSession,
  ReplayCameraAngle,
  ReplayPlaybackTelemetry,
  TRACK_SPECS,
} from '../game/types';

interface ReplayDockProps {
  session: FullRaceSession;
  telemetry: ReplayPlaybackTelemetry;
  playing: boolean;
  speedMultiplier: number;
  cameraAngle: ReplayCameraAngle;
  focusIndex: number;
  isSaved: boolean;
  muted: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onSetSpeed: (speed: number) => void;
  onSetCameraAngle: (angle: ReplayCameraAngle) => void;
  onSetFocusIndex: (idx: number) => void;
  onSaveSession: () => Promise<void>;
  onExportSession: () => void;
  onToggleMute: () => void;
  onExit: () => void;
}

const CAMERA_ANGLES: Array<{ id: ReplayCameraAngle; label: string; keyHint: string }> = [
  { id: 'tv', label: 'TV Broadcast', keyHint: '1' },
  { id: 'chase', label: 'Chase', keyHint: '2' },
  { id: 'hood', label: 'Hood', keyHint: '3' },
  { id: 'bumper', label: 'Bumper', keyHint: '4' },
  { id: 'fender', label: 'Fender', keyHint: '5' },
  { id: 'helicopter', label: 'Helicopter', keyHint: '6' },
];

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4];

function formatSec(sec: number): string {
  return formatTimeMs(sec * 1000);
}

export const ReplayDock: React.FC<ReplayDockProps> = ({
  session,
  telemetry,
  playing,
  speedMultiplier,
  cameraAngle,
  focusIndex,
  isSaved,
  muted,
  onTogglePlay,
  onSeek,
  onSetSpeed,
  onSetCameraAngle,
  onSetFocusIndex,
  onSaveSession,
  onExportSession,
  onToggleMute,
  onExit,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);

  const durationSec = Math.max(
    0.1,
    telemetry.durationSec ||
      (session.frames.length > 0 ? session.frames[session.frames.length - 1].t : 1)
  );
  const currentSec = Math.min(durationSec, Math.max(0, telemetry.currentTimeSec));
  const rpmPct = Math.min(100, (telemetry.rpm / Math.max(1, telemetry.redlineRpm)) * 100);
  const gearLabel =
    telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : String(telemetry.gear);

  const focusedParticipant =
    focusIndex >= 0 && focusIndex < session.aiParticipants.length
      ? session.aiParticipants[focusIndex]
      : null;
  const focusedCarName = focusedParticipant
    ? CHASSIS_SPECS[focusedParticipant.config.chassis].name
    : CHASSIS_SPECS[session.vehicleConfig.chassis].name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.code === 'KeyH') {
        setCollapsed((v) => !v);
      } else if (e.code === 'Escape') {
        onExit();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        onSeek(Math.max(0, currentSec - 5));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        onSeek(Math.min(durationSec, currentSec + 5));
      } else if (e.key >= '1' && e.key <= '6') {
        const angle = CAMERA_ANGLES[Number(e.key) - 1];
        if (angle) onSetCameraAngle(angle.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTogglePlay, onExit, onSeek, onSetCameraAngle, currentSec, durationSec]);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Top Broadcast Bar */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Live Replay Telemetry */}
        <div
          className={`bg-[#0a0d14]/88 border border-white/12 rounded-xl px-4 py-3 transition-opacity duration-200 ${
            collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-amber-400">REPLAY</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-200 font-medium">{TRACK_SPECS[session.trackId].name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">LAP {telemetry.lap}</span>
          </div>

          <div className="flex items-center gap-4 mt-2">
            <div>
              <div className="text-sm font-display font-bold text-white whitespace-nowrap">
                {telemetry.focusName || session.driverName}
              </div>
              <div className="text-[11px] text-slate-400 whitespace-nowrap">
                {focusedCarName}
              </div>
            </div>

            <div className="h-8 w-px bg-white/12" />

            <div className="flex items-baseline gap-2 font-mono-tabular">
              <span className="text-2xl font-bold text-white leading-none">
                {telemetry.speedKmh}
              </span>
              <span className="text-[11px] text-slate-400">KM/H</span>
              <span className="ml-1 px-2 py-0.5 rounded bg-white/10 text-amber-300 font-display font-bold text-xs">
                {gearLabel}
              </span>
            </div>

            <div className="hidden sm:block w-24">
              <div className="flex justify-between text-[10px] font-mono-tabular text-slate-400 mb-1">
                <span>RPM</span>
                <span>{telemetry.rpm}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    rpmPct > 88 ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${rpmPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Session Save / Export / Exit */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            disabled={isSaved || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaveSession();
              } finally {
                setSaving(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isSaved
                ? 'bg-emerald-600/90 border-emerald-400/50 text-white'
                : 'bg-[#0a0d14]/88 border-white/15 text-slate-100 hover:border-amber-400/60'
            }`}
          >
            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5 text-amber-400" />}
            <span>{isSaved ? 'Saved' : saving ? 'Saving...' : 'Save Session'}</span>
          </button>

          <button
            type="button"
            onClick={onExportSession}
            title="Download full session telemetry (.json)"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title="Mute / Unmute (M)"
            className="p-2 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-200 hover:text-white hover:border-white/35 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-200 hover:text-white hover:border-red-500/60 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Replay Theater Dock (Zero Center Occlusion) */}
      <div
        className="pointer-events-auto fixed left-1/2 bottom-5 -translate-x-1/2 w-[min(960px,94vw)] transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 26px))'
            : 'translate(-50%, 0)',
        }}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-1 rounded-t-lg bg-[#0a0d14]/92 border border-b-0 border-white/15 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Cinema Mode (H)</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0a0d14]/92 border border-white/15 rounded-xl p-4 shadow-[0_14px_40px_rgba(0,0,0,0.68)] space-y-3">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-tabular text-slate-200 w-20">
              {formatSec(currentSec)}
            </span>
            <input
              type="range"
              min={0}
              max={durationSec}
              step={0.05}
              value={currentSec}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Replay timeline scrubber"
              className="flex-1 accent-red-500 cursor-pointer"
            />
            <span className="text-xs font-mono-tabular text-slate-400 w-20 text-right">
              {formatSec(durationSec)}
            </span>
          </div>

          {/* Transport + Camera Angles + Focus Car */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/10">
            {/* Transport + Speed */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSeek(0)}
                title="Restart replay"
                className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, currentSec - 5))}
                title="Back 5s"
                className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                title="Play / Pause (Space)"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{playing ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={() => onSeek(Math.min(durationSec, currentSec + 5))}
                title="Forward 5s"
                className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 ml-1 bg-white/[0.04] rounded-lg p-0.5">
                {PLAYBACK_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onSetSpeed(spd)}
                    className={`px-2 py-1 rounded text-[11px] font-mono-tabular font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      speedMultiplier === spd
                        ? 'bg-white text-slate-900'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Focus Car Dropdown */}
            <div className="flex items-center gap-2">
              <label htmlFor="replay-focus-car" className="text-[11px] text-slate-400">
                Focus Car
              </label>
              <select
                id="replay-focus-car"
                value={focusIndex}
                onChange={(e) => onSetFocusIndex(Number(e.target.value))}
                className="bg-[#121824] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
              >
                <option value={-1}>
                  {session.driverName} (You)
                </option>
                {session.aiParticipants.map((ai, idx) => (
                  <option key={ai.id} value={idx}>
                    {ai.name} · {CHASSIS_SPECS[ai.config.chassis].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 6 Multi-Angle Camera Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-white/10">
            <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            {CAMERA_ANGLES.map((cam) => {
              const active = cameraAngle === cam.id;
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => onSetCameraAngle(cam.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] hover:text-white'
                  }`}
                >
                  {cam.keyHint} · {cam.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
