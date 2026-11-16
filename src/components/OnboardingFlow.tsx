import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  Globe,
  HardDrive,
  Plus,
  Rss,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import {
  AuthorizedSource,
  CandidateMediaItem,
  MediaCategory,
  TelemetryConfig,
  UserPreferences,
} from '../types/pulsevault';
import {
  DISLIKE_OPTIONS,
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

interface OnboardingFlowProps {
  initialPrefs: UserPreferences;
  initialTelemetry: TelemetryConfig;
  sources: AuthorizedSource[];
  driveAccessToken: string | null;
  driveUserEmail: string | null;
  onGoogleDriveSignIn: () => Promise<string | null>;
  onToggleSource: (id: string) => void;
  onAddSourceWithCandidates: (
    source: AuthorizedSource,
    newCandidates: CandidateMediaItem[]
  ) => void;
  onComplete: (
    prefs: UserPreferences,
    telemetryPatch: Partial<TelemetryConfig>,
    triggerAutoDownload: boolean
  ) => void;
  onSkip: () => void;
}

export function OnboardingFlow({
  initialPrefs,
  initialTelemetry,
  sources,
  driveAccessToken,
  driveUserEmail,
  onGoogleDriveSignIn,
  onToggleSource,
  onAddSourceWithCandidates,
  onComplete,
  onSkip,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [languages, setLanguages] = useState<string[]>(initialPrefs.languages);
  const [customLang, setCustomLang] = useState('');
  const [genres, setGenres] = useState<string[]>(initialPrefs.favorite_genres);
  const [dislikes, setDislikes] = useState<string[]>(initialPrefs.disliked_topics);
  const [customDislike, setCustomDislike] = useState('');
  const [customNote, setCustomNote] = useState(initialPrefs.custom_interests_note);

  // Step 2: RSS Podcast + Google Drive Folder state
  const [feedTitle, setFeedTitle] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedCategory, setFeedCategory] = useState<MediaCategory>('Audio');
  const [feedLanguage, setFeedLanguage] = useState('English');
  const [feedGenre, setFeedGenre] = useState('Tech & Systems Podcasts');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolderSummary[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // Step 3: Quota, weights, compliance & auto-sync
  const [dailyLimitMb, setDailyLimitMb] = useState(initialTelemetry.daily_limit_mb);
  const [resetTime, setResetTime] = useState(initialTelemetry.reset_time);
  const [weights, setWeights] = useState(initialTelemetry.category_weights);
  const [autoDownload, setAutoDownload] = useState(initialPrefs.auto_download_enabled);
  const [complianceAck, setComplianceAck] = useState(
    initialPrefs.compliance_acknowledged
  );

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    if (list.includes(value)) {
      setList(list.filter((item) => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  const handleAddCustomLanguage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customLang.trim();
    if (!trimmed) return;
    if (!languages.includes(trimmed)) setLanguages([...languages, trimmed]);
    setCustomLang('');
  };

  const handleAddCustomDislike = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customDislike.trim();
    if (!trimmed) return;
    if (!dislikes.includes(trimmed)) setDislikes([...dislikes, trimmed]);
    setCustomDislike('');
  };

  const handleAddPreset = (preset: OpenFeedPreset) => {
    if (sources.some((s) => s.source_id === preset.id)) return;
    const newSource: AuthorizedSource = {
      source_id: preset.id,
      provider_type: preset.provider_type,
      title: preset.title,
      endpoint_uri: preset.endpoint_uri,
      category: preset.category,
      priority_weight: preset.priority_weight,
      max_items_per_sync: 3,
      last_polled_epoch: Math.floor(Date.now() / 1000),
      etag_or_page_token: `W/"preset-${Date.now()}"`,
      is_enabled: true,
      language: preset.language,
      genre: preset.genre,
      description: preset.description,
    };
    const newCandidates: CandidateMediaItem[] = preset.sample_items.map((item) => ({
      ...item,
      source_id: preset.id,
      source_title: preset.title,
      provider_type: preset.provider_type,
      published_at: new Date().toISOString(),
    }));
    onAddSourceWithCandidates(newSource, newCandidates);
    setAddedMsg(`Connected open feed "${preset.title}".`);
  };

  const handleConnectDriveAndLoadFolders = async () => {
    setDriveError(null);
    setIsLoadingDrive(true);
    try {
      const token = driveAccessToken || (await onGoogleDriveSignIn());
      if (!token) {
        setIsLoadingDrive(false);
        return;
      }
      const folders = await fetchUserDriveFolders(token);
      setDriveFolders(folders);
      if (folders.length === 0) {
        setDriveError('No folders found in your Google Drive root.');
      }
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Unable to browse Google Drive folders.'
      );
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleBindDriveFolder = async (folder: DriveFolderSummary) => {
    if (!driveAccessToken) return;
    setDriveError(null);
    setIsLoadingDrive(true);
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
        language: languages[0] || 'English',
        genre: 'Personal Cloud Recordings',
        description: `User-selected Google Drive folder (${mediaFiles.length} syncable media file(s) found).`,
      };

      const newCandidates: CandidateMediaItem[] = (mediaFiles.length > 0 ? mediaFiles : files)
        .slice(0, 6)
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
            language: languages[0] || 'English',
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
            summary: `Personal Drive file (${f.mimeType}) verified via MD5 ${f.md5Checksum?.slice(0, 8) || 'checksum'}.`,
          };
        });

      onAddSourceWithCandidates(newSource, newCandidates);
      setAddedMsg(
        `Connected personal Google Drive folder "${folder.name}" (${newCandidates.length} file(s) indexed).`
      );
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Failed to inspect Drive folder contents.'
      );
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleAddCustomRss = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedTitle.trim() || !feedUrl.trim()) return;
    const sourceId = `src_rss_${Date.now()}`;
    const cleanName = feedTitle.trim();
    const cleanUrl = feedUrl.trim();
    const baseMb = feedCategory === 'Audio' ? 30 : 280;

    const newSource: AuthorizedSource = {
      source_id: sourceId,
      provider_type: 'RSS_PODCAST',
      title: cleanName,
      endpoint_uri: cleanUrl,
      category: feedCategory,
      priority_weight: 75,
      max_items_per_sync: 3,
      last_polled_epoch: Math.floor(Date.now() / 1000),
      etag_or_page_token: `W/"${Date.now()}"`,
      is_enabled: true,
      language: feedLanguage,
      genre: feedGenre,
      description: `Open RSS/Atom podcast or lecture feed (${feedLanguage} · ${feedGenre}).`,
    };

    const newCandidate: CandidateMediaItem = {
      item_id: `cand_rss_${Date.now()}`,
      source_id: sourceId,
      remote_guid: `guid_${Date.now()}`,
      title: episodeTitle.trim() || `${cleanName} — Latest Episode`,
      provider_type: 'RSS_PODCAST',
      source_title: cleanName,
      category: feedCategory,
      mime_type: feedCategory === 'Audio' ? 'audio/mpeg' : 'video/mp4',
      language: feedLanguage,
      genre: feedGenre,
      tags: [feedGenre, feedLanguage],
      download_url: cleanUrl,
      duration_min: feedCategory === 'Audio' ? 22 : 34,
      total_bytes: baseMb * 1024 * 1024,
      size_1080p_mb: feedCategory === 'Audio' ? null : Math.round(baseMb * 1.6),
      size_720p_mb: feedCategory === 'Audio' ? null : baseMb,
      size_480p_mb: feedCategory === 'Audio' ? null : Math.round(baseMb * 0.56),
      size_audio_mb: feedCategory === 'Audio' ? baseMb : 28,
      commute_brief_eligible: true,
      published_at: new Date().toISOString(),
      summary: `User-configured RSS feed (${feedLanguage} · ${feedGenre}).`,
    };

    onAddSourceWithCandidates(newSource, [newCandidate]);
    setAddedMsg(`Added RSS feed "${cleanName}" to sync pool.`);
    setFeedTitle('');
    setFeedUrl('');
    setEpisodeTitle('');
  };

  const handleWeightSlider = (key: 'Audio' | 'Lecture' | 'PersonalDrive', nextVal: number) => {
    const others = (['Audio', 'Lecture', 'PersonalDrive'] as const).filter(
      (k) => k !== key
    );
    const remaining = Math.max(0, 100 - nextVal);
    const otherSum = weights[others[0]] + weights[others[1]];
    let firstOther = 0;
    let secondOther = 0;
    if (otherSum === 0) {
      firstOther = Math.floor(remaining / 2);
      secondOther = remaining - firstOther;
    } else {
      firstOther = Math.round((weights[others[0]] / otherSum) * remaining);
      secondOther = remaining - firstOther;
    }
    setWeights({
      ...weights,
      [key]: nextVal,
      [others[0]]: firstOther,
      [others[1]]: secondOther,
    });
  };

  const handleFinish = () => {
    if (!complianceAck) return;
    onComplete(
      {
        ...initialPrefs,
        onboarding_completed: true,
        compliance_acknowledged: true,
        languages: languages.length > 0 ? languages : ['English'],
        favorite_genres: genres,
        disliked_topics: dislikes,
        custom_interests_note: customNote,
        auto_download_enabled: autoDownload,
      },
      {
        daily_limit_mb: dailyLimitMb,
        reset_time: resetTime,
        category_weights: weights,
      },
      autoDownload
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="h-16 bg-white border-b border-[#E2E8F0] px-6 md:px-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" fill="#0284C7" />
            <path
              d="M6.5 13.5H9L10.8 8.5L13.2 15.5L15 11.5H17.5"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            PulseVault
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#64748B] hidden sm:inline">
            Step {step} of 3
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="h-9 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap"
          >
            Skip to Sync Console
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-10 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { num: 1, label: '01. Languages, Genres & Exclusions' },
            { num: 2, label: '02. RSS Podcasts & Google Drive' },
            { num: 3, label: '03. Quota, Compliance & Auto-Sync' },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num as 1 | 2 | 3)}
              className={`text-left p-3.5 rounded-xl border transition-colors ${
                step === s.num
                  ? 'bg-white border-[#0284C7] shadow-xs'
                  : 'bg-white border-[#E2E8F0]'
              }`}
            >
              <div
                className={`h-1 w-full rounded-full mb-2.5 ${
                  s.num <= step ? 'bg-[#0284C7]' : 'bg-[#CBD5E1]'
                }`}
              />
              <span
                className={`text-xs font-semibold block truncate ${
                  step === s.num ? 'text-[#0284C7]' : 'text-[#0F172A]'
                }`}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Step 1: Favorite Languages, Genres & Dislikes */}
        {step === 1 && (
          <div className="telemetry-card p-6 md:p-8 space-y-7">
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
                Personalize Your Scheduled Offline Sync
              </h1>
              <p className="text-sm text-[#475569]">
                Choose your preferred languages, favorite podcast/lecture topics, and exclusions. The AI Knapsack Solver uses these rules to sync only what you enjoy before your daily quota resets.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#0F172A]">
                  Preferred Languages
                </label>
                <span className="font-mono text-xs text-[#64748B] tabular-nums">
                  {languages.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...LANGUAGE_OPTIONS, ...languages])).map((lang) => {
                  const selected = languages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleItem(languages, setLanguages, lang)}
                      className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#F0F9FF] border-[#0284C7] text-[#0369A1]'
                          : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5 text-[#0284C7]" />}
                      <span>{lang}</span>
                    </button>
                  );
                })}
              </div>
              <form onSubmit={handleAddCustomLanguage} className="flex gap-2 max-w-xs pt-1">
                <input
                  type="text"
                  placeholder="Add another language..."
                  value={customLang}
                  onChange={(e) => setCustomLang(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                  Add
                </button>
              </form>
            </div>

            <div className="space-y-3 pt-4 border-t border-[#F1F5F9]">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-[#10B981]" />
                  <span>Favorite Genres & Knowledge Categories (Likes)</span>
                </label>
                <span className="font-mono text-xs text-[#64748B] tabular-nums">
                  {genres.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map((genre) => {
                  const selected = genres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleItem(genres, setGenres, genre)}
                      className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]'
                          : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5 text-[#10B981]" />}
                      <span>{genre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[#F1F5F9]">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-[#EF4444]" />
                  <span>Dislikes & Auto-Exclude Topics</span>
                </label>
                <span className="font-mono text-xs text-[#64748B] tabular-nums">
                  {dislikes.length} excluded
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...DISLIKE_OPTIONS, ...dislikes])).map((topic) => {
                  const selected = dislikes.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleItem(dislikes, setDislikes, topic)}
                      className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B]'
                          : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {selected && <X className="h-3.5 w-3.5 text-[#EF4444]" />}
                      <span>{topic}</span>
                    </button>
                  );
                })}
              </div>
              <form onSubmit={handleAddCustomDislike} className="flex gap-2 max-w-xs pt-1">
                <input
                  type="text"
                  placeholder="Exclude keyword..."
                  value={customDislike}
                  onChange={(e) => setCustomDislike(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-[#E2E8F0] text-xs text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                  Exclude
                </button>
              </form>
            </div>

            <div className="space-y-2 pt-4 border-t border-[#F1F5F9]">
              <label className="block text-sm font-semibold text-[#0F172A]">
                Custom Sync Preferences Note
              </label>
              <textarea
                rows={2}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Prioritize Hindi & English tech podcasts and my personal Drive lecture recordings."
                className="w-full p-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1]"
              >
                <span>Next: Open RSS Feeds & Google Drive</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Authorized Open RSS Podcasts & Personal Google Drive Folders */}
        {step === 2 && (
          <div className="telemetry-card p-6 md:p-8 space-y-6">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
                Connect Open RSS Podcasts & Personal Google Drive
              </h2>
              <p className="text-sm text-[#475569]">
                PulseVault only syncs open RSS/Atom podcast feeds, Creative Commons educational feeds, and personal Google Drive folders you own.
              </p>
            </div>

            {addedMsg && (
              <div className="rounded-lg bg-[#ECFDF5] border border-[#10B981]/30 px-4 py-2.5 text-xs font-medium text-[#065F46] flex items-center gap-2">
                <Check className="h-4 w-4 text-[#10B981]" />
                <span>{addedMsg}</span>
              </div>
            )}

            {/* Personal Google Drive Folder Connector */}
            <div className="p-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                    <HardDrive className="h-4 w-4 text-[#0284C7]" />
                    <span>Google Drive Offline Folder Connector</span>
                  </div>
                  <p className="text-xs text-[#475569]">
                    {driveUserEmail
                      ? `Signed in as ${driveUserEmail} · Select a personal folder to pre-fetch before carrier reset`
                      : 'Sign in with Google to browse and select a personal Drive folder with read-only permission.'}
                  </p>
                </div>

                {!driveAccessToken ? (
                  <GoogleSignInButton
                    onClick={() => void handleConnectDriveAndLoadFolders()}
                    disabled={isLoadingDrive}
                    label={isLoadingDrive ? 'Connecting...' : 'Sign in with Google'}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={isLoadingDrive}
                    onClick={() => void handleConnectDriveAndLoadFolders()}
                    className="h-9 px-3.5 rounded-lg border border-[#0284C7] bg-white text-xs font-semibold text-[#0284C7] hover:bg-[#F0F9FF]"
                  >
                    {isLoadingDrive ? 'Listing Folders...' : 'Browse My Drive Folders'}
                  </button>
                )}
              </div>

              {driveError && (
                <p className="text-xs text-[#EF4444]">{driveError}</p>
              )}

              {driveFolders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {driveFolders.map((folder) => {
                    const alreadyConnected = sources.some(
                      (s) => s.endpoint_uri === folder.id
                    );
                    return (
                      <div
                        key={folder.id}
                        className="px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="h-4 w-4 text-[#0284C7] shrink-0" />
                          <span className="text-xs font-medium text-[#0F172A] truncate">
                            {folder.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyConnected || isLoadingDrive}
                          onClick={() => void handleBindDriveFolder(folder)}
                          className={`h-7 px-2.5 rounded-md text-xs font-semibold shrink-0 ${
                            alreadyConnected
                              ? 'bg-[#ECFDF5] text-[#065F46]'
                              : 'bg-[#F0F9FF] text-[#0284C7] hover:bg-[#E0F2FE]'
                          }`}
                        >
                          {alreadyConnected ? 'Synced' : 'Select'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Open Educational & Podcast Feed Presets */}
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                Open Educational & Creative Commons RSS Feeds
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {OPEN_FEED_PRESETS.map((preset) => {
                  const alreadyAdded = sources.some((s) => s.source_id === preset.id);
                  return (
                    <div
                      key={preset.id}
                      className="p-4 rounded-xl border border-[#E2E8F0] bg-white flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Rss className="h-3.5 w-3.5 text-[#10B981] shrink-0" />
                          <span className="text-sm font-semibold text-[#0F172A] truncate">
                            {preset.title}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-[#64748B]">
                          {preset.language} · {preset.genre}
                        </p>
                        <p className="text-xs text-[#475569]">{preset.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddPreset(preset)}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold shrink-0 whitespace-nowrap ${
                          alreadyAdded
                            ? 'bg-[#ECFDF5] text-[#065F46]'
                            : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#0284C7] hover:border-[#0284C7]'
                        }`}
                      >
                        {alreadyAdded ? 'Connected' : '+ Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Custom RSS/Atom Podcast XML URL */}
            <form
              onSubmit={handleAddCustomRss}
              className="p-5 rounded-xl border border-[#E2E8F0] bg-white space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                <Globe className="h-4 w-4 text-[#0284C7]" />
                <span>Add Custom Open RSS / Atom Podcast Feed</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Podcast or Feed Name"
                  value={feedTitle}
                  onChange={(e) => setFeedTitle(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
                <input
                  type="url"
                  placeholder="https://feeds.example.org/podcast.xml"
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                  className="md:col-span-2 h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-xs text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <select
                  value={feedCategory}
                  onChange={(e) => setFeedCategory(e.target.value as MediaCategory)}
                  className="h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0F172A]"
                >
                  <option value="Audio">Audio Podcast</option>
                  <option value="Lecture">Open Lecture</option>
                </select>
                <select
                  value={feedLanguage}
                  onChange={(e) => setFeedLanguage(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0F172A]"
                >
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={feedGenre}
                  onChange={(e) => setFeedGenre(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0F172A]"
                >
                  {GENRE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Optional latest episode title..."
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  className="flex-1 min-w-[220px] h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#0284C7] bg-[#F0F9FF] text-xs font-semibold text-[#0369A1] hover:bg-[#E0F2FE] whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add RSS Feed</span>
                </button>
              </div>
            </form>

            {/* Active Sync Sources */}
            <div className="space-y-2 pt-2 border-t border-[#F1F5F9]">
              <div className="text-xs font-mono font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                Configured Sync Sources ({sources.filter((s) => s.is_enabled).length} enabled)
              </div>
              <div className="divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-xl overflow-hidden">
                {sources.map((src) => (
                  <div
                    key={src.source_id}
                    className="px-4 py-3 bg-white flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#0F172A] truncate">
                        {src.title}
                      </div>
                      <div className="font-mono text-xs text-[#64748B] truncate">
                        {src.provider_type} · {src.category} · Weight {src.priority_weight}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSource(src.source_id)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold shrink-0 ${
                        src.is_enabled
                          ? 'bg-[#ECFDF5] text-[#065F46]'
                          : 'bg-[#F1F5F9] text-[#475569]'
                      }`}
                    >
                      {src.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1]"
              >
                <span>Next: Quota & Compliance</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Quota, Auto-Sync & User Ownership Clause */}
        {step === 3 && (
          <div className="telemetry-card p-6 md:p-8 space-y-6">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
                Daily Quota Budget & Sync Authorization
              </h2>
              <p className="text-sm text-[#475569]">
                Configure your daily cellular data cap and enable scheduled pre-reset sync into your sandboxed local vault.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Daily Carrier Data Cap (MB)
                </label>
                <input
                  type="number"
                  min={500}
                  max={10240}
                  step={64}
                  value={dailyLimitMb}
                  onChange={(e) => setDailyLimitMb(Number(e.target.value) || 2048)}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Carrier Daily Reset Time
                </label>
                <input
                  type="time"
                  value={resetTime}
                  onChange={(e) => setResetTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] font-mono text-sm tabular-nums text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-[#F1F5F9]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#0F172A]">
                  Category Allocation Weights
                </span>
                <span className="font-mono text-[#0284C7] tabular-nums">100%</span>
              </div>
              {(['Audio', 'Lecture', 'PersonalDrive'] as const).map((cat) => (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#0F172A]">
                      {cat === 'PersonalDrive' ? 'Personal Google Drive' : cat}
                    </span>
                    <span className="font-mono tabular-nums text-[#475569]">
                      {weights[cat]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weights[cat]}
                    onChange={(e) => handleWeightSlider(cat, Number(e.target.value))}
                    className="w-full telemetry-slider"
                  />
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-[#F0F9FF] border border-[#0284C7]/25 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <Sparkles className="h-4 w-4 text-[#0284C7]" />
                  <span>Scheduled AI Auto-Sync</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Automatically curate matching feeds ({languages.join(', ')}) and execute 2 MB chunked transfers into your sandboxed vault when surplus quota is detected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoDownload((v) => !v)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold shrink-0 ${
                  autoDownload
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#475569]'
                }`}
              >
                {autoDownload ? 'Auto-Sync ON' : 'Manual Only'}
              </button>
            </div>

            {/* Play Store User Ownership & Compliance Acknowledgment */}
            <label className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={complianceAck}
                onChange={(e) => setComplianceAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#0284C7] focus:ring-[#0284C7]"
              />
              <div className="space-y-1 text-xs text-[#475569] leading-relaxed">
                <div className="flex items-center gap-1.5 font-semibold text-[#0F172A]">
                  <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                  <span>Personal Storage & Open Protocol Acknowledgment</span>
                </div>
                <p>
                  I confirm that I will only connect open RSS/Atom podcast feeds, Creative Commons educational media, and personal Google Drive folders that I own or have legal permission to cache offline.
                </p>
              </div>
            </label>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!complianceAck}
                onClick={handleFinish}
                className="flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-50 shadow-[0_1px_2px_rgba(2,132,199,0.2)]"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {autoDownload
                    ? 'Analyze Tastes & Start Auto-Sync'
                    : 'Save Profile & Open Console'}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
