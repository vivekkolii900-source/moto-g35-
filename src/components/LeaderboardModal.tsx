import React, { useEffect, useState } from 'react';
import { Ghost, Trophy, X } from 'lucide-react';
import { formatTimeMs } from './RacingHud';
import { LeaderboardEntry, TRACK_SPECS, TrackId } from '../game/types';

interface LeaderboardEntryRow extends Omit<LeaderboardEntry, 'ghost'> {
  hasGhost?: boolean;
}

interface LeaderboardModalProps {
  open: boolean;
  initialTrackId: TrackId;
  activeGhostId: string | null;
  onClose: () => void;
  onSelectGhost: (entryId: string, driverName: string) => Promise<void>;
  onClearGhost: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  open,
  initialTrackId,
  activeGhostId,
  onClose,
  onSelectGhost,
  onClearGhost,
}) => {
  const [trackId, setTrackId] = useState<TrackId>(initialTrackId);
  const [entries, setEntries] = useState<LeaderboardEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingGhostId, setLoadingGhostId] = useState<string | null>(null);

  useEffect(() => {
    setTrackId(initialTrackId);
  }, [initialTrackId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/leaderboard?trackId=${trackId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load global leaderboard.');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
          setLoading(false);
        }
      });

    // Real-time SSE updates when other drivers post times
    const es = new EventSource('/api/leaderboard/stream');
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.trackId === trackId && Array.isArray(msg.entries)) {
          setEntries(msg.entries);
        }
      } catch {
        // Ignore non-JSON heartbeat
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [open, trackId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div className="w-full max-w-4xl bg-[#0b0f17] border border-white/15 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display font-bold text-lg text-white">
                Global Competitive Leaderboards
              </h2>
              <p className="text-xs text-slate-400">
                Challenge any recorded driver as a 3D Ghost Rival on track
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="p-2 rounded-lg bg-white/[0.05] text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Circuit Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            {(['redstone', 'harbor'] as TrackId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTrackId(id)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  trackId === id
                    ? 'bg-red-600 text-white'
                    : 'bg-white/[0.05] text-slate-300 hover:text-white'
                }`}
              >
                {TRACK_SPECS[id].name}
              </button>
            ))}
          </div>

          {activeGhostId && (
            <button
              type="button"
              onClick={onClearGhost}
              className="text-xs text-cyan-300 hover:text-cyan-200 font-medium cursor-pointer"
            >
              Clear Active Ghost
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading global standings...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-400">{error}</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No times recorded for this circuit yet. Set the first benchmark!
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-semibold text-slate-400">
                  <th className="py-2.5 pr-3">Rank</th>
                  <th className="py-2.5 px-3">Driver</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Vehicle Setup</th>
                  <th className="py-2.5 px-3 text-right">Best Lap</th>
                  <th className="py-2.5 px-3 text-right">3-Lap Total</th>
                  <th className="py-2.5 px-3 text-right hidden sm:table-cell">Top Speed</th>
                  <th className="py-2.5 pl-3 text-right">Ghost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {entries.map((entry, idx) => {
                  const isSelected = activeGhostId === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-3 pr-3 font-mono-tabular font-bold text-slate-200">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: entry.primaryColor }}
                          />
                          <span className="font-semibold text-white">{entry.driverName}</span>
                          <span className="text-[11px] text-slate-500 font-mono-tabular">
                            {entry.country}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-400 hidden md:table-cell">
                        {entry.vehicleSummary}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-emerald-400">
                        {formatTimeMs(entry.bestLapMs)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-white">
                        {formatTimeMs(entry.totalTimeMs)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-slate-300 hidden sm:table-cell">
                        {entry.topSpeedKmh} km/h
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {entry.hasGhost ? (
                          <button
                            type="button"
                            disabled={loadingGhostId === entry.id}
                            onClick={async () => {
                              setLoadingGhostId(entry.id);
                              try {
                                await onSelectGhost(entry.id, entry.driverName);
                              } finally {
                                setLoadingGhostId(null);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                              isSelected
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-white/[0.06] text-cyan-300 hover:bg-cyan-500/20'
                            }`}
                          >
                            <Ghost className="w-3.5 h-3.5" />
                            <span>
                              {loadingGhostId === entry.id
                                ? 'Loading'
                                : isSelected
                                  ? 'Active'
                                  : 'Race Ghost'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
