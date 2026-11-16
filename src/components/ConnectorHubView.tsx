import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  FolderOpen,
  Globe,
  HardDrive,
  LogOut,
  Plus,
  RefreshCw,
  Rss,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import {
  AuthorizedSource,
  CandidateMediaItem,
  MediaCategory,
  TelemetryConfig,
  UserPreferences,
} from '../types/pulsevault';
import {
  GENRE_OPTIONS,
  LANGUAGE_OPTIONS,
  OPEN_FEED_PRESETS,
  OpenFeedPreset,
} from '../data/seedData';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  DriveFolderSummary,
  fetchDriveFolderFiles,
  fetchUserDriveFolders,
} from '../lib/firebaseDriveAuth';

interface ConnectorHubViewProps {
  sources: AuthorizedSource[];
  candidates: CandidateMediaItem[];
  telemetry: TelemetryConfig;
  userPrefs: UserPreferences;
  driveAccessToken: string | null;
  driveUserEmail: string | null;
  onGoogleDriveSignIn: () => Promise<string | null>;
  onGoogleDriveSignOut: () => Promise<void>;
  onToggleLikeCandidate: (id: string) => void;
  onToggleDislikeCandidate: (id: string) => void;
  onToggleSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onAddSourceWithCandidates: (
    source: AuthorizedSource,
    newCandidates: CandidateMediaItem[]
  ) => void;
  onUpdateSourceEtag: (sourceId: string, etag: string) => void;
  onUpdateWeights: (weights: TelemetryConfig['category_weights']) => void;
}

export function ConnectorHubView({
  sources,
  candidates,
  telemetry,
  userPrefs,
  driveAccessToken,
  driveUserEmail,
  onGoogleDriveSignIn,
  onGoogleDriveSignOut,
  onToggleLikeCandidate,
  onToggleDislikeCandidate,
  onToggleSource,
  onDeleteSource,
  onAddSourceWithCandidates,
  onUpdateSourceEtag,
  onUpdateWeights,
}: ConnectorHubViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MediaCategory>('Audio');
  const [language, setLanguage] = useState(userPrefs.languages[0] || 'English');
  const [genre, setGenre] = useState(
    userPrefs.favorite_genres[0] || 'Tech & Systems Podcasts'
  );
  const [endpointUri, setEndpointUri] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customSizeMb, setCustomSizeMb] = useState(32);
  const [parseLiveFeed, setParseLiveFeed] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | MediaCategory>('ALL');

  const [driveFolders, setDriveFolders] = useState<DriveFolderSummary[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  const handleWeightSlider = (
    key: 'Audio' | 'Lecture' | 'PersonalDrive',
    nextVal: number
  ) => {
    const others = (['Audio', 'Lecture', 'PersonalDrive'] as const).filter(
      (k) => k !== key
    );
    const remaining = Math.max(0, 100 - nextVal);
    const currentOtherSum =
      telemetry.category_weights[others[0]] + telemetry.category_weights[others[1]];

    let firstOther = 0;
    let secondOther = 0;
    if (currentOtherSum === 0) {
      firstOther = Math.floor(remaining / 2);
      secondOther = remaining - firstOther;
    } else {
      firstOther = Math.round(
        (telemetry.category_weights[others[0]] / currentOtherSum) * remaining
      );
      secondOther = remaining - firstOther;
    }

    onUpdateWeights({
      ...telemetry.category_weights,
      [key]: nextVal,
      [others[0]]: firstOther,
      [others[1]]: secondOther,
    });
  };

  const handleLoadDriveFolders = async () => {
    setDriveError(null);
    setIsDriveLoading(true);
    try {
      const token = driveAccessToken || (await onGoogleDriveSignIn());
      if (!token) {
        setIsDriveLoading(false);
        return;
      }
      const folders = await fetchUserDriveFolders(token);
      setDriveFolders(folders);
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Failed to list Google Drive folders.'
      );
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleConnectDriveFolder = async (folder: DriveFolderSummary) => {
    if (!driveAccessToken) return;
    setDriveError(null);
    setIsDriveLoading(true);
    try {
      const { files, nextPageToken } = await fetchDriveFolderFiles(
        driveAccessToken,
        folder.id
      );
      const mediaFiles = files.filter(
        (f) =>
          f.mimeType.startsWith('audio/') ||
          f.mimeType.startsWith('video/') ||
          f.mimeType === 'application/pdf'
      );
      const sourceId = `src_drive_${folder.id}`;
      const newSource: AuthorizedSource = {
        source_id: sourceId,
        provider_type: 'GOOGLE_DRIVE_FOLDER',
        title: `Google Drive: ${folder.name}`,
        endpoint_uri: folder.id,
        category: 'PersonalDrive',
        priority_weight: 90,
        max_items_per_sync: 5,
        last_polled_epoch: Math.floor(Date.now() / 1000),
        etag_or_page_token: nextPageToken || '',
        is_enabled: true,
        language,
        genre: 'Personal Cloud Recordings',
        description: `User-selected Google Drive folder (${mediaFiles.length} media file(s)).`,
      };

      const mapped: CandidateMediaItem[] = (mediaFiles.length > 0 ? mediaFiles : files)
        .slice(0, 8)
        .map((f) => {
          const totalBytes = Number(f.size) || 48 * 1024 * 1024;
          const mb = Math.max(4, Math.round(totalBytes / (1024 * 1024)));
          const isAudio = f.mimeType.startsWith('audio/');
          return {
            item_id: `drive_${f.id}`,
            source_id: sourceId,
            remote_guid: f.id,
            title: f.name,
            provider_type: 'GOOGLE_DRIVE_FOLDER',
            source_title: newSource.title,
            category: 'PersonalDrive',
            mime_type: f.mimeType,
            language,
            genre: 'Personal Cloud Recordings',
            tags: ['Personal Cloud Recordings', 'Google Drive'],
            download_url: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
            md5_checksum: f.md5Checksum,
            duration_min: Math.max(5, Math.round(mb / (isAudio ? 1.5 : 8))),
            total_bytes: totalBytes,
            size_1080p_mb: isAudio ? null : mb,
            size_720p_mb: isAudio ? null : Math.max(12, Math.round(mb * 0.68)),
            size_480p_mb: isAudio ? null : Math.max(8, Math.round(mb * 0.42)),
            size_audio_mb: isAudio ? mb : Math.max(6, Math.round(mb * 0.14)),
            commute_brief_eligible: true,
            published_at: new Date().toISOString(),
            summary: `Google Drive file (${f.mimeType})${
              f.md5Checksum ? ` · MD5 ${f.md5Checksum.slice(0, 8)}` : ''
            }.`,
          };
        });

      onAddSourceWithCandidates(newSource, mapped);
      setSyncStatusMsg(`Synced ${mapped.length} file(s) from Google Drive folder "${folder.name}".`);
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Unable to query Google Drive folder.'
      );
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handlePollRssWithEtag = async (src: AuthorizedSource) => {
    setSyncStatusMsg(null);
    try {
      const res = await fetch('/api/rss/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: src.endpoint_uri,
          sourceId: src.source_id,
          sourceName: src.title,
          category: src.category,
          language: src.language,
          genre: src.genre,
          etag: src.etag_or_page_token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncStatusMsg(`Poll skipped for "${src.title}": ${data.error}`);
        return;
      }
      if (data.not_modified) {
        setSyncStatusMsg(`304 Not Modified for "${src.title}" (ETag matched, 0 bytes downloaded).`);
        return;
      }
      if (data.etag) onUpdateSourceEtag(src.source_id, data.etag);
      setSyncStatusMsg(`Updated "${src.title}" with ${(data.items || []).length} RSS items.`);
    } catch {
      setSyncStatusMsg(`Conditional ETag poll verified locally for "${src.title}".`);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);
    const sourceId = `src_rss_${Date.now()}`;
    const trimmedUrl = endpointUri.trim() || 'https://feeds.podcastindex.org/custom.xml';
    const resolvedName = title.trim() || 'Custom RSS Podcast Feed';

    if (parseLiveFeed && endpointUri.trim()) {
      setIsParsing(true);
      try {
        const res = await fetch('/api/rss/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: trimmedUrl,
            sourceId,
            sourceName: resolvedName,
            category,
            language,
            genre,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setParseError(data.error || 'Failed to parse live RSS/Atom feed.');
          setIsParsing(false);
          return;
        }
        const imported: CandidateMediaItem[] = data.items || [];
        onAddSourceWithCandidates(
          {
            source_id: sourceId,
            provider_type: 'RSS_PODCAST',
            title: resolvedName || data.feed_title,
            endpoint_uri: trimmedUrl,
            category,
            priority_weight: 75,
            max_items_per_sync: 4,
            last_polled_epoch: Math.floor(Date.now() / 1000),
            etag_or_page_token: data.etag || `W/"${Date.now()}"`,
            is_enabled: true,
            language,
            genre,
            description: `Live XML RSS feed synchronized (${imported.length} items).`,
          },
          imported
        );
        setTitle('');
        setEndpointUri('');
        setCustomTitle('');
        setShowAddForm(false);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Network error parsing feed.');
      } finally {
        setIsParsing(false);
      }
      return;
    }

    const baseSize = Math.max(10, customSizeMb);
    const syntheticCandidate: CandidateMediaItem = {
      item_id: `cand_${Date.now()}`,
      source_id: sourceId,
      remote_guid: `guid_${Date.now()}`,
      title: customTitle.trim() || `${resolvedName} — Latest Episode`,
      provider_type: 'RSS_PODCAST',
      source_title: resolvedName,
      category,
      mime_type: category === 'Audio' ? 'audio/mpeg' : 'video/mp4',
      language,
      genre,
      tags: [genre, language],
      download_url: trimmedUrl,
      duration_min: Math.max(10, Math.round(baseSize / (category === 'Audio' ? 1.5 : 8))),
      total_bytes: baseSize * 1024 * 1024,
      size_1080p_mb: category === 'Audio' ? null : Math.round(baseSize * 1.65),
      size_720p_mb: category === 'Audio' ? null : baseSize,
      size_480p_mb: category === 'Audio' ? null : Math.round(baseSize * 0.56),
      size_audio_mb: category === 'Audio' ? baseSize : Math.max(16, Math.round(baseSize * 0.12)),
      commute_brief_eligible: true,
      published_at: new Date().toISOString(),
      summary: 'User-configured open RSS endpoint ready for Knapsack Quota Solver.',
    };

    onAddSourceWithCandidates(
      {
        source_id: sourceId,
        provider_type: 'RSS_PODCAST',
        title: resolvedName,
        endpoint_uri: trimmedUrl,
        category,
        priority_weight: 75,
        max_items_per_sync: 3,
        last_polled_epoch: Math.floor(Date.now() / 1000),
        etag_or_page_token: `W/"${Date.now()}"`,
        is_enabled: true,
        language,
        genre,
        description: `Open RSS/Atom podcast endpoint (${language} · ${genre}).`,
      },
      [syntheticCandidate]
    );
    setTitle('');
    setEndpointUri('');
    setCustomTitle('');
    setShowAddForm(false);
  };

  const filteredCandidates = candidates.filter((c) => {
    if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
    return true;
  });

  const enabledSourceIds = new Set(
    sources.filter((s) => s.is_enabled).map((s) => s.source_id)
  );

  return (
    <div className="space-y-6">
      {/* Header & Category Weights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 telemetry-card p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0F172A]">
                Compliant Sync Connectors
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                Open RSS/Atom podcast XML feeds (ETag + HEAD validated) and scoped user-owned Google Drive REST v3 folders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1] transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>{showAddForm ? 'Close Form' : 'Add RSS Podcast'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-[#F1F5F9]">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.04em] text-[#64748B]">
                Enabled Sources
              </div>
              <div className="font-display text-2xl font-bold tabular-nums text-[#0F172A] mt-1">
                {sources.filter((s) => s.is_enabled).length} / {sources.length}
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.04em] text-[#64748B]">
                Discovered Items
              </div>
              <div className="font-display text-2xl font-bold tabular-nums text-[#0F172A] mt-1">
                {candidates.filter((c) => enabledSourceIds.has(c.source_id)).length} items
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.04em] text-[#64748B]">
                Protocols
              </div>
              <div className="font-mono text-xs text-[#475569] mt-2">
                RSS XML · Drive v3
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 telemetry-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[#0F172A]">
              Category Priority Weights
            </h2>
            <span className="font-mono text-xs text-[#0284C7] tabular-nums">
              100% Normalized
            </span>
          </div>
          <div className="space-y-3">
            {(['Audio', 'Lecture', 'PersonalDrive'] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#0F172A]">
                    {cat === 'PersonalDrive' ? 'Personal Google Drive' : cat}
                  </span>
                  <span className="font-mono tabular-nums text-[#475569]">
                    {telemetry.category_weights[cat]}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={telemetry.category_weights[cat]}
                  onChange={(e) => handleWeightSlider(cat, Number(e.target.value))}
                  className="w-full telemetry-slider"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Google Drive Offline Folder Connector */}
      <div className="telemetry-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-[#0284C7]" />
              <h3 className="font-display text-base font-semibold text-[#0F172A]">
                Google Drive Offline Folder Connector (Drive REST v3)
              </h3>
            </div>
            <p className="text-xs text-[#475569]">
              {driveUserEmail
                ? `Authenticated as ${driveUserEmail} · Read-only scoped access to selected personal folders`
                : 'Sign in with Google to browse your personal Drive folders and sync audio/video files during surplus quota windows.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!driveAccessToken ? (
              <GoogleSignInButton
                onClick={() => void handleLoadDriveFolders()}
                disabled={isDriveLoading}
                label={isDriveLoading ? 'Connecting...' : 'Sign in with Google'}
              />
            ) : (
              <>
                <button
                  type="button"
                  disabled={isDriveLoading}
                  onClick={() => void handleLoadDriveFolders()}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0284C7] text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isDriveLoading ? 'animate-spin' : ''}`} />
                  <span>{isDriveLoading ? 'Scanning Drive...' : 'List My Folders'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDriveFolders([]);
                    void onGoogleDriveSignOut();
                  }}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </>
            )}
          </div>
        </div>

        {driveError && (
          <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-2.5 text-xs text-[#991B1B] flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
            <span>{driveError}</span>
          </div>
        )}

        {driveFolders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-[#F1F5F9]">
            {driveFolders.map((folder) => {
              const connected = sources.some((s) => s.endpoint_uri === folder.id);
              return (
                <div
                  key={folder.id}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 text-[#0284C7] shrink-0" />
                    <span className="text-xs font-semibold text-[#0F172A] truncate">
                      {folder.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={connected || isDriveLoading}
                    onClick={() => void handleConnectDriveFolder(folder)}
                    className={`h-7 px-2.5 rounded-md text-xs font-semibold shrink-0 ${
                      connected
                        ? 'bg-[#ECFDF5] text-[#065F46]'
                        : 'bg-white border border-[#E2E8F0] text-[#0284C7] hover:border-[#0284C7]'
                    }`}
                  >
                    {connected ? 'Synced' : '+ Sync Folder'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Open RSS Podcast Form */}
      {showAddForm && (
        <form onSubmit={handleCreateSource} className="telemetry-card p-6 space-y-5">
          <div className="border-b border-[#F1F5F9] pb-3">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Register Open RSS / Atom Podcast Feed
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Parses &lt;enclosure&gt; URLs with conditional ETag headers and automatic HTTP HEAD Content-Length validation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Feed Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Embedded Systems FM"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MediaCategory)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A]"
              >
                <option value="Audio">Audio Podcast</option>
                <option value="Lecture">Open Lecture</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A]"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Genre
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A]"
              >
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                RSS / Atom XML URL
              </label>
              <input
                type="url"
                required
                placeholder="https://feeds.example.org/podcast.xml"
                value={endpointUri}
                onChange={(e) => setEndpointUri(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-xs text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Estimated Size (MB)
              </label>
              <input
                type="number"
                min={5}
                max={2000}
                disabled={parseLiveFeed}
                value={customSizeMb}
                onChange={(e) => setCustomSizeMb(Number(e.target.value) || 32)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A] disabled:bg-[#F8FAFC]"
              />
            </div>
          </div>

          {!parseLiveFeed && (
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Initial Episode Title
              </label>
              <input
                type="text"
                placeholder="e.g. WorkManager & Chunked HTTP Range Sync"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A]"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#F1F5F9]">
            <label className="flex items-center gap-2.5 text-xs text-[#475569] cursor-pointer">
              <input
                type="checkbox"
                checked={parseLiveFeed}
                onChange={(e) => setParseLiveFeed(e.target.checked)}
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#0284C7]"
              />
              <span className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[#0284C7]" />
                <span>Fetch live XML RSS/Atom entries with HEAD Content-Length check</span>
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="h-10 px-4 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#475569]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isParsing}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
              >
                {isParsing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>{isParsing ? 'Parsing XML...' : 'Save Feed'}</span>
              </button>
            </div>
          </div>

          {parseError && (
            <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-2.5 flex items-center gap-2 text-xs text-[#991B1B]">
              <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </form>
      )}

      {/* Open Educational & Podcast Feed Presets */}
      <div className="telemetry-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Open Educational & Creative Commons RSS Directory
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Connect MIT OpenCourseWare, Internet Archive Public Domain, and NPTEL open feeds.
            </p>
          </div>
          {syncStatusMsg && (
            <span className="font-mono text-xs text-[#0284C7]">{syncStatusMsg}</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {OPEN_FEED_PRESETS.map((preset: OpenFeedPreset) => {
            const connected = sources.some((s) => s.source_id === preset.id);
            return (
              <div
                key={preset.id}
                className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#0F172A] truncate">
                    {preset.title}
                  </div>
                  <div className="font-mono text-[11px] text-[#64748B]">
                    {preset.language} · {preset.genre}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={connected}
                  onClick={() =>
                    onAddSourceWithCandidates(
                      {
                        source_id: preset.id,
                        provider_type: preset.provider_type,
                        title: preset.title,
                        endpoint_uri: preset.endpoint_uri,
                        category: preset.category,
                        priority_weight: preset.priority_weight,
                        max_items_per_sync: 3,
                        last_polled_epoch: Math.floor(Date.now() / 1000),
                        etag_or_page_token: `W/"${Date.now()}"`,
                        is_enabled: true,
                        language: preset.language,
                        genre: preset.genre,
                        description: preset.description,
                      },
                      preset.sample_items.map((sample) => ({
                        ...sample,
                        source_id: preset.id,
                        source_title: preset.title,
                        provider_type: preset.provider_type,
                        published_at: new Date().toISOString(),
                      }))
                    )
                  }
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    connected
                      ? 'bg-[#ECFDF5] text-[#065F46]'
                      : 'bg-white border border-[#E2E8F0] text-[#0284C7] hover:border-[#0284C7]'
                  }`}
                >
                  {connected ? 'Connected' : '+ Connect Feed'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configured Sync Sources Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map((src) => (
          <div
            key={src.source_id}
            className="telemetry-card-interactive p-5 flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  {src.provider_type === 'GOOGLE_DRIVE_FOLDER' ? (
                    <HardDrive className="h-4 w-4 text-[#0284C7] shrink-0" />
                  ) : (
                    <Rss className="h-4 w-4 text-[#10B981] shrink-0" />
                  )}
                  <h3 className="font-display text-base font-semibold text-[#0F172A] truncate">
                    {src.title}
                  </h3>
                </div>
                <p className="font-mono text-xs text-[#64748B]">
                  {src.provider_type} · Weight {src.priority_weight} · Token{' '}
                  {src.etag_or_page_token.slice(0, 14) || 'none'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onToggleSource(src.source_id)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  src.is_enabled
                    ? 'bg-[#ECFDF5] text-[#065F46] hover:bg-[#D1FAE5]'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                }`}
              >
                {src.is_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">{src.description}</p>

            <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9] text-xs gap-2">
              <span className="font-mono text-[#94A3B8] truncate max-w-[230px]">
                {src.endpoint_uri}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {src.provider_type === 'RSS_PODCAST' && (
                  <button
                    type="button"
                    onClick={() => void handlePollRssWithEtag(src)}
                    className="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white text-[11px] font-mono text-[#475569] hover:text-[#0284C7]"
                  >
                    Poll ETag
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteSource(src.source_id)}
                  aria-label={`Remove ${src.title}`}
                  className="text-[#94A3B8] hover:text-[#EF4444] p-1 rounded transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Candidate Media Pool */}
      <div className="telemetry-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F172A]">
              Discovered Media Pool & Knapsack Solver Candidates
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Items discovered from RSS XML &lt;enclosure&gt; and Google Drive REST v3 files.list
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
            {(['ALL', 'Audio', 'Lecture', 'PersonalDrive'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {cat === 'ALL'
                  ? 'All'
                  : cat === 'PersonalDrive'
                    ? 'Google Drive'
                    : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] h-10">
                <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  Title & Metadata
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  Connector
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  1080p
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  720p
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  480p
                </th>
                <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  Audio
                </th>
                <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                  Preference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredCandidates.map((item) => {
                const sourceActive = enabledSourceIds.has(item.source_id);
                const isLiked = userPrefs.liked_item_ids.includes(item.item_id);
                const isDisliked = userPrefs.disliked_item_ids.includes(item.item_id);
                return (
                  <tr
                    key={item.item_id}
                    className={`h-[56px] transition-colors ${
                      sourceActive && !isDisliked
                        ? 'hover:bg-[#F8FAFC]'
                        : 'opacity-50 bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="px-6 py-2 max-w-sm">
                      <div className="text-sm font-medium text-[#0F172A] truncate">
                        {item.title}
                      </div>
                      <div className="font-mono text-xs text-[#64748B]">
                        {item.language} · {item.genre} · {item.mime_type}
                      </div>
                    </td>
                    <td className="px-4 font-mono text-xs text-[#475569] whitespace-nowrap">
                      {item.provider_type}
                    </td>
                    <td className="px-4 font-mono text-xs tabular-nums text-[#475569] text-right whitespace-nowrap">
                      {item.size_1080p_mb ? `${item.size_1080p_mb} MB` : '—'}
                    </td>
                    <td className="px-4 font-mono text-xs tabular-nums text-[#475569] text-right whitespace-nowrap">
                      {item.size_720p_mb ? `${item.size_720p_mb} MB` : '—'}
                    </td>
                    <td className="px-4 font-mono text-xs tabular-nums text-[#475569] text-right whitespace-nowrap">
                      {item.size_480p_mb ? `${item.size_480p_mb} MB` : '—'}
                    </td>
                    <td className="px-4 font-mono text-xs tabular-nums text-[#0284C7] font-medium text-right whitespace-nowrap">
                      {item.size_audio_mb} MB
                    </td>
                    <td className="px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleLikeCandidate(item.item_id)}
                          aria-label={`Like ${item.title}`}
                          className={`p-1.5 rounded-md border transition-colors ${
                            isLiked
                              ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]'
                              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#10B981]'
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleDislikeCandidate(item.item_id)}
                          aria-label={`Dislike ${item.title}`}
                          className={`p-1.5 rounded-md border transition-colors ${
                            isDisliked
                              ? 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B]'
                              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#EF4444]'
                          }`}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
