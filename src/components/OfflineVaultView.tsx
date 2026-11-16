import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  GraduationCap,
  Headphones,
  Pause,
  Play,
  Search,
  ShieldCheck,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { LocalVaultItem, UserPreferences } from '../types/pulsevault';

interface OfflineVaultViewProps {
  vaultItems: LocalVaultItem[];
  freeStorageGb: number;
  purgeQueueIds: string[];
  userPrefs: UserPreferences;
  driveAccessToken: string | null;
  onToggleLikeItem: (id: string) => void;
  onToggleDislikeItem: (id: string) => void;
  onMarkWatched: (id: string) => void;
  onAgeItem24h: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onRunFifoPurge: () => void;
}

type VaultFilter = 'ALL' | 'COMMUTE' | 'WATCHED' | 'EXPIRED' | 'PURGE';

const SAMPLE_DRIVE_IDS = new Set([
  '1A2B3C_personal_workshop_rec',
  '9Z8Y7X_personal_voice_notes',
  'drive-sat-telemetry-04',
]);

export function OfflineVaultView({
  vaultItems,
  freeStorageGb,
  purgeQueueIds,
  userPrefs,
  driveAccessToken,
  onToggleLikeItem,
  onToggleDislikeItem,
  onMarkWatched,
  onAgeItem24h,
  onDeleteItem,
  onRunFifoPurge,
}: OfflineVaultViewProps) {
  const [filter, setFilter] = useState<VaultFilter>('ALL');
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(24);

  const commuteItems = vaultItems.filter(
    (v) => v.commute_brief_tag && v.state !== 'EXPIRED'
  );
  const activeBriefItem =
    commuteItems.find((v) => v.item_id === playingId) || commuteItems[0] || null;

  const canStreamRealDriveMedia = Boolean(
    activeBriefItem &&
      activeBriefItem.provider_type === 'GOOGLE_DRIVE_FOLDER' &&
      driveAccessToken &&
      !SAMPLE_DRIVE_IDS.has(activeBriefItem.remote_guid)
  );

  useEffect(() => {
    if (!isPlaying || !activeBriefItem || canStreamRealDriveMedia) return;
    const timer = setInterval(() => {
      setPlayProgress((prev) => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return prev + 2;
      });
    }, 350);
    return () => clearInterval(timer);
  }, [isPlaying, activeBriefItem, canStreamRealDriveMedia]);

  const purgeSet = new Set(purgeQueueIds);
  const fifoEligibleCount = vaultItems.filter(
    (v) =>
      v.state === 'EXPIRED' ||
      v.age_hours >= 48 ||
      (freeStorageGb < 2.0 && v.state === 'WATCHED') ||
      purgeSet.has(v.item_id)
  ).length;

  const totalVaultMb = vaultItems.reduce((sum, item) => sum + item.size_mb, 0);
  const commuteMinutes = commuteItems.reduce((sum, item) => sum + item.duration_min, 0);

  const filteredItems = vaultItems.filter((item) => {
    if (query.trim()) {
      const q = query.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.source_title.toLowerCase().includes(q) &&
        !item.local_file_path.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filter === 'COMMUTE') return item.commute_brief_tag;
    if (filter === 'WATCHED') return item.state === 'WATCHED';
    if (filter === 'EXPIRED') return item.state === 'EXPIRED' || item.age_hours >= 48;
    if (filter === 'PURGE') {
      return (
        item.state === 'EXPIRED' ||
        item.age_hours >= 48 ||
        (freeStorageGb < 2.0 && item.state === 'WATCHED') ||
        purgeSet.has(item.item_id)
      );
    }
    return true;
  });

  const renderCategoryIcon = (cat: LocalVaultItem['category']) => {
    if (cat === 'Audio') return <Headphones className="h-4 w-4 text-[#0284C7] shrink-0" />;
    if (cat === 'PersonalDrive')
      return <FolderOpen className="h-4 w-4 text-[#10B981] shrink-0" />;
    return <GraduationCap className="h-4 w-4 text-[#475569] shrink-0" />;
  };

  const handleNextBriefTrack = () => {
    if (commuteItems.length === 0) return;
    const currentIdx = commuteItems.findIndex(
      (c) => c.item_id === activeBriefItem?.item_id
    );
    const nextItem = commuteItems[(currentIdx + 1) % commuteItems.length];
    setPlayingId(nextItem.item_id);
    setPlayProgress(0);
    setIsPlaying(true);
  };

  return (
    <div className="space-y-6">
      {/* Morning Commute Brief Featured Module */}
      <div className="telemetry-card p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs font-medium text-[#0284C7]">
              <span>06:00 AM Offline Playlist</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{commuteItems.length} tracks</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{commuteMinutes} min total</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
              Morning Commute Brief
            </h2>
            <p className="text-sm text-[#475569] leading-relaxed max-w-xl">
              Overnight quota-rescued open RSS podcasts, lectures, and personal Drive files staged in a unified offline pack for zero-signal transit playback.
            </p>

            {activeBriefItem ? (
              <div className="pt-2 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0F172A] truncate">
                      {activeBriefItem.title}
                    </div>
                    <div className="font-mono text-xs text-[#64748B]">
                      {activeBriefItem.provider_type} · {activeBriefItem.selected_resolution} ·{' '}
                      {activeBriefItem.size_mb} MB
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!canStreamRealDriveMedia && (
                      <button
                        type="button"
                        onClick={() => {
                          setPlayingId(activeBriefItem.item_id);
                          setIsPlaying((p) => !p);
                        }}
                        className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0284C7] text-xs font-semibold text-white hover:bg-[#0369A1] transition-colors whitespace-nowrap"
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            <span>Pause Brief</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            <span>Play Offline</span>
                          </>
                        )}
                      </button>
                    )}
                    {commuteItems.length > 1 && (
                      <button
                        type="button"
                        onClick={handleNextBriefTrack}
                        aria-label="Next commute brief track"
                        className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    )}
                    {activeBriefItem.state !== 'WATCHED' && (
                      <button
                        type="button"
                        onClick={() => onMarkWatched(activeBriefItem.item_id)}
                        className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] whitespace-nowrap"
                      >
                        Mark Watched
                      </button>
                    )}
                  </div>
                </div>

                {canStreamRealDriveMedia && driveAccessToken ? (
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
                    <div className="font-mono text-[11px] text-[#065F46]">
                      Authenticated Google Drive Range Stream ({activeBriefItem.mime_type})
                    </div>
                    {activeBriefItem.mime_type.startsWith('video/') ? (
                      <video
                        controls
                        className="w-full max-h-48 rounded-md bg-black"
                        src={`/api/drive/media/${encodeURIComponent(
                          activeBriefItem.remote_guid
                        )}?token=${encodeURIComponent(driveAccessToken)}`}
                      />
                    ) : (
                      <audio
                        controls
                        className="w-full"
                        src={`/api/drive/media/${encodeURIComponent(
                          activeBriefItem.remote_guid
                        )}?token=${encodeURIComponent(driveAccessToken)}`}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={playProgress}
                      onChange={(e) => setPlayProgress(Number(e.target.value))}
                      aria-label="Playback progress"
                      className="w-full telemetry-slider"
                    />
                    <div className="flex justify-between font-mono text-[11px] tabular-nums text-[#64748B]">
                      <span>
                        {Math.round((activeBriefItem.duration_min * playProgress) / 100)}:00
                      </span>
                      <span>{activeBriefItem.duration_min}:00</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#64748B] pt-2">
                No commute brief items currently cached. Run Manifest Evaluation on Quota Radar and execute transfer.
              </p>
            )}
          </div>

          {/* Right 5 cols: Architectural Waveform & Vault Metrics */}
          <div className="lg:col-span-5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-5 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                Vault Telemetry
              </span>
              <span className="font-mono text-[#10B981] font-medium">
                Local App Sandbox
              </span>
            </div>

            {/* Clean SVG Acoustic Waveform Graphic */}
            <svg viewBox="0 0 320 64" className="w-full h-16" aria-hidden="true">
              {Array.from({ length: 32 }).map((_, idx) => {
                const height = 14 + Math.round(Math.abs(Math.sin(idx * 0.55 + 1.2)) * 42);
                const active = (idx / 32) * 100 <= playProgress;
                return (
                  <rect
                    key={idx}
                    x={idx * 10 + 2}
                    y={(64 - height) / 2}
                    width="5"
                    height={height}
                    rx="2.5"
                    fill={active ? '#0284C7' : '#CBD5E1'}
                  />
                );
              })}
            </svg>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#E2E8F0] text-xs">
              <div>
                <div className="text-[#64748B]">Cached Size</div>
                <div className="font-mono font-semibold tabular-nums text-[#0F172A] mt-0.5">
                  {totalVaultMb} MB
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">Free Disk</div>
                <div
                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                    freeStorageGb < 2.0 ? 'text-[#EF4444]' : 'text-[#0F172A]'
                  }`}
                >
                  {freeStorageGb.toFixed(1)} GB
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">FIFO Eligible</div>
                <div className="font-mono font-semibold tabular-nums text-[#0F172A] mt-0.5">
                  {fifoEligibleCount} files
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Local Vault Index & FIFO Auto-Pruning Table */}
      <div className="telemetry-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F172A]">
              Local Vault Index & Zero-Bloat FIFO Policy
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Files marked WATCHED or older than 48 hours are automatically pruned when free disk drops below 2.0 GB.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search cached media..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-lg border border-[#E2E8F0] text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0284C7]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'COMMUTE', label: 'Commute' },
                  { id: 'WATCHED', label: 'Watched' },
                  { id: 'EXPIRED', label: 'Expired' },
                  { id: 'PURGE', label: 'Purge Queue' },
                ] as { id: VaultFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={fifoEligibleCount === 0}
              onClick={onRunFifoPurge}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Execute FIFO Purge ({fifoEligibleCount})</span>
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#475569]">
            No local vault entries match the active filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] h-10">
                  <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Media File & Local Sandbox Path
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Tier
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                    Size
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                    Age / TTL
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    State
                  </th>
                  <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                    Lifecycle Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredItems.map((item) => {
                  const flagged =
                    item.state === 'EXPIRED' ||
                    item.age_hours >= 48 ||
                    (freeStorageGb < 2.0 && item.state === 'WATCHED') ||
                    purgeSet.has(item.item_id);
                  return (
                    <tr key={item.item_id} className="h-[64px] hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-6 py-2.5 max-w-md">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">{renderCategoryIcon(item.category)}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[#0F172A] truncate">
                              {item.title}
                            </div>
                            <div className="font-mono text-[11px] text-[#64748B] truncate">
                              {item.provider_type} · {item.local_file_path}
                            </div>
                            {item.md5_checksum && (
                              <div className="inline-flex items-center gap-1 font-mono text-[10px] text-[#10B981]">
                                <ShieldCheck className="h-3 w-3" />
                                <span>MD5 {item.md5_checksum.slice(0, 12)}…</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 font-mono text-xs text-[#0284C7] whitespace-nowrap">
                        {item.selected_resolution}
                      </td>
                      <td className="px-4 font-mono text-xs tabular-nums text-[#0F172A] text-right whitespace-nowrap">
                        {item.size_mb} MB
                      </td>
                      <td className="px-4 font-mono text-xs tabular-nums text-[#475569] text-right whitespace-nowrap">
                        {item.age_hours}h / 48h
                      </td>
                      <td className="px-4 font-mono text-xs whitespace-nowrap">
                        <span
                          className={
                            flagged
                              ? 'text-[#EF4444] font-semibold'
                              : item.state === 'WATCHED'
                                ? 'text-[#475569] font-medium'
                                : 'text-[#10B981] font-semibold'
                          }
                        >
                          {flagged ? 'PURGE_QUEUED' : item.state}
                        </span>
                      </td>
                      <td className="px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onToggleLikeItem(item.item_id)}
                            aria-label={`Like ${item.title}`}
                            title="Like (boost similar items)"
                            className={`h-7 px-2 rounded-md border transition-colors inline-flex items-center ${
                              userPrefs.liked_item_ids.includes(item.item_id)
                                ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]'
                                : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#10B981]'
                            }`}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleDislikeItem(item.item_id)}
                            aria-label={`Dislike ${item.title}`}
                            title="Dislike (exclude similar items)"
                            className={`h-7 px-2 rounded-md border transition-colors inline-flex items-center ${
                              userPrefs.disliked_item_ids.includes(item.item_id)
                                ? 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B]'
                                : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#EF4444]'
                            }`}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                          {item.state === 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() => onMarkWatched(item.item_id)}
                              title="Mark as Watched"
                              className="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                              <span>Watched</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onAgeItem24h(item.item_id)}
                            title="Simulate +24h retention age"
                            className="h-7 px-2 rounded-md border border-[#E2E8F0] bg-white text-xs font-mono text-[#475569] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                          >
                            <Clock className="h-3 w-3" />
                            <span>+24h</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.item_id)}
                            aria-label={`Delete ${item.title}`}
                            className="h-7 px-2 rounded-md text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
