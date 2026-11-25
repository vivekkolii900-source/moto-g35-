import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Play, Trash2, Upload, X } from 'lucide-react';
import { formatTimeMs } from './RacingHud';
import {
  deleteRaceSession,
  exportSessionJson,
  getRaceSession,
  listRaceSessions,
  saveRaceSession,
  validateImportedSession,
} from '../game/replayStorage';
import {
  CHASSIS_SPECS,
  FullRaceSession,
  SavedSessionSummary,
  TRACK_SPECS,
} from '../game/types';

interface SavedReplaysModalProps {
  open: boolean;
  onClose: () => void;
  onWatchSession: (session: FullRaceSession) => void;
}

export const SavedReplaysModal: React.FC<SavedReplaysModalProps> = ({
  open,
  onClose,
  onWatchSession,
}) => {
  const [sessions, setSessions] = useState<SavedSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listRaceSessions();
      setSessions(list);
    } catch {
      setError('Unable to load saved sessions from browser storage.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open]);

  if (!open) return null;

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = validateImportedSession(JSON.parse(text));
      if (!parsed) {
        setError('Invalid session telemetry JSON file.');
        return;
      }
      await saveRaceSession(parsed);
      await refresh();
    } catch {
      setError('Could not read or parse the selected JSON file.');
    }
  };

  const handleWatch = async (id: string) => {
    setLoadingId(id);
    try {
      const full = await getRaceSession(id);
      if (!full) {
        setError('Replay data could not be loaded.');
        return;
      }
      onWatchSession(full);
    } finally {
      setLoadingId(null);
    }
  };

  const handleExport = async (id: string) => {
    const full = await getRaceSession(id);
    if (full) {
      exportSessionJson(full);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteRaceSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-4xl bg-[#0b0f17] border border-white/15 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display font-bold text-lg text-white">
                Saved Race Sessions & Replay Vault
              </h2>
              <p className="text-xs text-slate-400">
                Full 20 Hz multi-car telemetry stored locally for multi-angle playback or JSON export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close replay vault"
              className="p-2 rounded-lg bg-white/[0.05] text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-3 px-4 py-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading saved sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm text-slate-300 font-medium">
                No saved race sessions yet.
              </p>
              <p className="text-xs text-slate-500">
                Finish a race or save a Free Roam session to replay it from 6 camera angles or export telemetry JSON.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {sessions.map((s) => {
                const carName = CHASSIS_SPECS[s.vehicleConfig.chassis].name;
                const trackName = TRACK_SPECS[s.trackId].name;
                return (
                  <div
                    key={s.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: s.vehicleConfig.primaryColor }}
                        />
                        <span className="font-display font-bold text-sm text-white truncate">
                          {s.title}
                        </span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          · {s.driverName}
                        </span>
                        {s.gameMode === 'elimination' && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                            Knockout
                          </span>
                        )}
                        {s.gameMode === 'drift' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                            Drift
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 mt-1 font-mono-tabular">
                        <span>{trackName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{carName}</span>
                        <span aria-hidden="true">·</span>
                        {s.gameMode === 'drift' && s.driftScore !== undefined ? (
                          <span className="text-amber-300 font-semibold">
                            {s.driftScore.toLocaleString()} pts
                          </span>
                        ) : (
                          <span className="text-slate-200">{formatTimeMs(s.totalTimeMs)}</span>
                        )}
                        {s.bestLapMs && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">
                              Best {formatTimeMs(s.bestLapMs)}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{s.topSpeedKmh} km/h</span>
                        <span aria-hidden="true">·</span>
                        <span>{s.frameCount} frames</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={loadingId === s.id}
                        onClick={() => handleWatch(s.id)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{loadingId === s.id ? 'Loading' : 'Watch Replay'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(s.id)}
                        title="Export telemetry JSON"
                        className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        title="Delete saved session"
                        className="p-2 rounded-lg bg-white/[0.06] hover:bg-red-500/25 text-slate-300 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
