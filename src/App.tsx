import React, { useEffect, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import {
  ActiveTab,
  AuthorizedSource,
  CandidateMediaItem,
  DailyRescuePoint,
  DownloadJob,
  ExecutionRunRecord,
  LocalVaultItem,
  ManifestGenerationResult,
  TelemetryConfig,
  UserPreferences,
} from './types/pulsevault';
import {
  computeNetSurplusMb,
  INITIAL_CANDIDATES,
  INITIAL_DAILY_RESCUE_HISTORY,
  INITIAL_EXECUTION_LOG,
  INITIAL_SOURCES,
  INITIAL_TELEMETRY,
  INITIAL_USER_PREFERENCES,
  INITIAL_VAULT_ITEMS,
} from './data/seedData';
import {
  initDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from './lib/firebaseDriveAuth';
import { Sidebar } from './components/Sidebar';
import { QuotaRadarView } from './components/QuotaRadarView';
import { ConnectorHubView } from './components/ConnectorHubView';
import { OfflineVaultView } from './components/OfflineVaultView';
import { AnalyticsView } from './components/AnalyticsView';
import { PolicyWizardModal } from './components/PolicyWizardModal';
import { OnboardingFlow } from './components/OnboardingFlow';

const TAB_TITLES: Record<ActiveTab, string> = {
  radar: 'Quota Radar',
  connectors: 'Connector Hub',
  vault: 'Offline Vault',
  analytics: 'Analytics',
};

const PREFS_STORAGE_KEY = 'pulsevault_user_prefs_v2';
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB WorkManager checkpoint commits

function loadInitialPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      return { ...INITIAL_USER_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage read errors
  }
  return INITIAL_USER_PREFERENCES;
}

function buildLocalFilePath(title: string, resolution: string, mimeType: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const ext =
    resolution === '320kbps_audio' || mimeType.startsWith('audio/') ? 'mp3' : 'mp4';
  return `/Android/data/app.pulsevault/files/vault/${slug || 'media_item'}.${ext}`;
}

export default function App() {
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(loadInitialPrefs);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !loadInitialPrefs().onboarding_completed
  );

  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('radar');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [telemetry, setTelemetry] = useState<TelemetryConfig>(INITIAL_TELEMETRY);
  const [sources, setSources] = useState<AuthorizedSource[]>(INITIAL_SOURCES);
  const [candidates, setCandidates] = useState<CandidateMediaItem[]>(INITIAL_CANDIDATES);
  const [vaultItems, setVaultItems] = useState<LocalVaultItem[]>(INITIAL_VAULT_ITEMS);
  const [history, setHistory] = useState<DailyRescuePoint[]>(INITIAL_DAILY_RESCUE_HISTORY);
  const [executionLog, setExecutionLog] = useState<ExecutionRunRecord[]>(
    INITIAL_EXECUTION_LOG
  );

  const [manifestResult, setManifestResult] = useState<ManifestGenerationResult | null>(
    null
  );
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTransferRunning, setIsTransferRunning] = useState(false);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveAccessToken(token);
        setDriveUserEmail(user.email || user.displayName || 'Google Account');
      },
      () => {
        setDriveAccessToken(null);
        setDriveUserEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(userPrefs));
    } catch {
      // Ignore storage write errors
    }
  }, [userPrefs]);

  const handleGoogleDriveSignIn = async (): Promise<string | null> => {
    const { user, accessToken } = await signInWithGoogleDrive();
    setDriveAccessToken(accessToken);
    setDriveUserEmail(user.email || user.displayName || 'Google Account');
    return accessToken;
  };

  const handleGoogleDriveSignOut = async (): Promise<void> => {
    await signOutGoogleDrive();
    setDriveAccessToken(null);
    setDriveUserEmail(null);
  };

  const handleUpdateTelemetry = (patch: Partial<TelemetryConfig>) => {
    setTelemetry((prev) => ({ ...prev, ...patch }));
  };

  // Pause active chunked transfers immediately into PAUSED_INTERRUPT on thermal CRITICAL or foreground traffic spike
  useEffect(() => {
    if (
      (telemetry.thermal_state === 'CRITICAL' || telemetry.foreground_traffic_spike) &&
      isTransferRunning
    ) {
      setIsTransferRunning(false);
      setJobs((prev) =>
        prev.map((j) =>
          j.state === 'FETCHING' || j.state === 'QUOTA_APPROVED'
            ? { ...j, state: 'PAUSED_INTERRUPT' }
            : j
        )
      );
    }
  }, [telemetry.thermal_state, telemetry.foreground_traffic_spike, isTransferRunning]);

  // Chunked HTTP Range Transfer State Machine Ticker (2 MB checkpoint commits)
  useEffect(() => {
    if (!isTransferRunning) return;

    const interval = setInterval(() => {
      setJobs((prevJobs) => {
        const activeIdx = prevJobs.findIndex(
          (j) =>
            j.state === 'DISCOVERED' ||
            j.state === 'QUOTA_APPROVED' ||
            j.state === 'FETCHING' ||
            j.state === 'PAUSED_INTERRUPT'
        );

        if (activeIdx === -1) {
          setIsTransferRunning(false);
          return prevJobs;
        }

        const nextJobs = [...prevJobs];
        const current = { ...nextJobs[activeIdx] };

        if (current.state === 'DISCOVERED' || current.state === 'PAUSED_INTERRUPT') {
          current.state = 'QUOTA_APPROVED';
          nextJobs[activeIdx] = current;
          return nextJobs;
        }

        if (current.state === 'QUOTA_APPROVED') {
          current.state = 'FETCHING';
          nextJobs[activeIdx] = current;
          return nextJobs;
        }

        if (current.state === 'FETCHING') {
          // Commit multiples of 2 MB checkpoints per tick so large lectures complete smoothly
          const totalChunks = Math.max(1, Math.ceil(current.total_bytes / CHUNK_SIZE_BYTES));
          const chunksPerTick = Math.max(1, Math.ceil(totalChunks / 10));
          const nextBytes = Math.min(
            current.total_bytes,
            current.downloaded_bytes + chunksPerTick * CHUNK_SIZE_BYTES
          );
          const nextPct = Math.min(
            100,
            Math.round((nextBytes / Math.max(1, current.total_bytes)) * 100)
          );

          current.downloaded_bytes = nextBytes;
          current.progress_pct = nextPct;

          if (nextBytes >= current.total_bytes) {
            current.state = 'COMPLETED';
            current.progress_pct = 100;
            current.downloaded_bytes = current.total_bytes;
            current.integrity_verified = true;

            const nowEpoch = Math.floor(Date.now() / 1000);
            const expiresEpoch = nowEpoch + 48 * 3600;
            const localPath = buildLocalFilePath(
              current.title,
              current.selected_resolution,
              current.mime_type
            );

            setVaultItems((prevVault) => {
              if (prevVault.some((v) => v.item_id === current.item_id)) return prevVault;
              const entry: LocalVaultItem = {
                item_id: current.item_id,
                source_id: current.source_id,
                remote_guid: current.remote_guid,
                title: current.title,
                provider_type: current.source_connector,
                source_title: current.source_connector,
                category: current.category,
                mime_type: current.mime_type,
                language: current.language,
                genre: current.genre,
                selected_resolution: current.selected_resolution,
                total_bytes: current.total_bytes,
                downloaded_bytes: current.total_bytes,
                size_mb: current.estimated_size_mb,
                local_file_path: localPath,
                state: 'COMPLETED',
                commute_brief_date: current.commute_brief_tag ? '2026-11-14' : null,
                commute_brief_tag: current.commute_brief_tag,
                created_at_epoch: nowEpoch,
                expires_at_epoch: expiresEpoch,
                age_hours: 0,
                duration_min: current.duration_min,
                download_url: current.resolved_url,
                md5_checksum: current.md5_checksum,
                summary:
                  'Synced via chunked HTTP Range transfer with 2 MB checkpoints and verified integrity.',
              };
              return [entry, ...prevVault];
            });

            setTelemetry((t) => ({
              ...t,
              current_used_mb: Math.min(
                t.daily_limit_mb,
                t.current_used_mb + current.estimated_size_mb
              ),
              free_storage_gb: Number(
                Math.max(0.2, t.free_storage_gb - current.estimated_size_mb / 1024).toFixed(2)
              ),
            }));

            setHistory((prevHist) => {
              const updated = [...prevHist];
              const last = updated[updated.length - 1];
              if (last && last.date_label === 'Nov 14') {
                updated[updated.length - 1] = {
                  ...last,
                  rescued_mb: last.rescued_mb + current.estimated_size_mb,
                  items_fetched_count: last.items_fetched_count + 1,
                };
                return updated;
              }
              return [
                ...updated,
                {
                  date_iso: '2026-11-14',
                  date_label: 'Nov 14',
                  used_mb: telemetry.current_used_mb,
                  rescued_mb: current.estimated_size_mb,
                  wasted_mb: telemetry.safety_buffer_mb,
                  daily_limit_mb: telemetry.daily_limit_mb,
                  items_fetched_count: 1,
                  execution_status: 'SUCCESS',
                },
              ];
            });
          }

          nextJobs[activeIdx] = current;
        }

        return nextJobs;
      });
    }, 320);

    return () => clearInterval(interval);
  }, [
    isTransferRunning,
    telemetry.current_used_mb,
    telemetry.daily_limit_mb,
    telemetry.safety_buffer_mb,
  ]);

  const handleGenerateManifest = async (options?: {
    overrideTelemetry?: TelemetryConfig;
    overridePrefs?: UserPreferences;
    overrideSources?: AuthorizedSource[];
    overrideCandidates?: CandidateMediaItem[];
    autoStartTransfer?: boolean;
  }) => {
    const activeTelemetry = options?.overrideTelemetry || telemetry;
    const activePrefs = options?.overridePrefs || userPrefs;
    const activeSources = options?.overrideSources || sources;
    const activeCandidates = options?.overrideCandidates || candidates;
    const shouldAutoStart =
      options?.autoStartTransfer ?? activePrefs.auto_download_enabled;

    setIsGenerating(true);
    setErrorMsg(null);
    setIsTransferRunning(false);

    try {
      const res = await fetch('/api/manifest/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry: activeTelemetry,
          authorized_sources: activeSources,
          candidate_pool: activeCandidates,
          local_vault_index: vaultItems,
          user_preferences: activePrefs,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to evaluate manifest on server.');
        setIsGenerating(false);
        return;
      }

      const result = data as ManifestGenerationResult;
      setManifestResult(result);

      const candidateMap = new Map(activeCandidates.map((c) => [c.download_url, c]));
      const nextJobs: DownloadJob[] = result.manifest.download_manifest.map((item) => {
        const matched = candidateMap.get(item.resolved_url);
        const totalBytes = Math.max(
          CHUNK_SIZE_BYTES,
          Math.round(item.estimated_size_mb * 1024 * 1024)
        );
        return {
          ...item,
          job_id: `job_${Date.now()}_${item.priority_rank}`,
          item_id: matched?.item_id || `item_${Date.now()}_${item.priority_rank}`,
          source_id: matched?.source_id || 'src_unknown',
          remote_guid: matched?.remote_guid || `guid_${item.priority_rank}`,
          mime_type:
            matched?.mime_type ||
            (item.selected_resolution === '320kbps_audio' ? 'audio/mpeg' : 'video/mp4'),
          md5_checksum: matched?.md5_checksum,
          state: 'DISCOVERED',
          progress_pct: 0,
          total_bytes: totalBytes,
          downloaded_bytes: 0,
          chunk_size_bytes: CHUNK_SIZE_BYTES,
          integrity_verified: false,
          category: matched?.category || 'Audio',
          duration_min: matched?.duration_min || 20,
          language: matched?.language,
          genre: matched?.genre,
        };
      });
      setJobs(nextJobs);

      setExecutionLog((prev) => [
        {
          id: `run_${Date.now()}`,
          timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
          execution_status: result.manifest.execution_status,
          net_surplus_mb: computeNetSurplusMb(activeTelemetry),
          allocated_mb: result.manifest.telemetry_summary.allocated_mb,
          items_count: result.manifest.download_manifest.length,
          purged_count: result.manifest.purge_queue_ids.length,
          engine: result.engine_source,
        },
        ...prev,
      ]);

      if (
        shouldAutoStart &&
        result.manifest.execution_status === 'READY_TO_FETCH' &&
        nextJobs.length > 0 &&
        !activeTelemetry.foreground_traffic_spike
      ) {
        setIsTransferRunning(true);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach PulseVault backend.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteOnboarding = (
    prefs: UserPreferences,
    telemetryPatch: Partial<TelemetryConfig>,
    triggerAutoDownload: boolean
  ) => {
    const nextTelemetry = { ...telemetry, ...telemetryPatch };
    setUserPrefs(prefs);
    setTelemetry(nextTelemetry);
    setShowOnboarding(false);
    setActiveTab('radar');
    void handleGenerateManifest({
      overrideTelemetry: nextTelemetry,
      overridePrefs: prefs,
      autoStartTransfer: triggerAutoDownload,
    });
  };

  const handleSkipOnboarding = () => {
    setUserPrefs((prev) => ({
      ...prev,
      onboarding_completed: true,
      compliance_acknowledged: true,
    }));
    setShowOnboarding(false);
  };

  const handleToggleLikeItem = (id: string) => {
    setUserPrefs((prev) => {
      const liked = prev.liked_item_ids.includes(id)
        ? prev.liked_item_ids.filter((x) => x !== id)
        : [...prev.liked_item_ids, id];
      const disliked = prev.disliked_item_ids.filter((x) => x !== id);
      return { ...prev, liked_item_ids: liked, disliked_item_ids: disliked };
    });
  };

  const handleToggleDislikeItem = (id: string) => {
    setUserPrefs((prev) => {
      const disliked = prev.disliked_item_ids.includes(id)
        ? prev.disliked_item_ids.filter((x) => x !== id)
        : [...prev.disliked_item_ids, id];
      const liked = prev.liked_item_ids.filter((x) => x !== id);
      return { ...prev, liked_item_ids: liked, disliked_item_ids: disliked };
    });
  };

  const handleExecutePurgeIds = (ids: string[]) => {
    const idSet = new Set(ids);
    let reclaimedMb = 0;
    setVaultItems((prev) =>
      prev.filter((item) => {
        if (idSet.has(item.item_id)) {
          reclaimedMb += item.size_mb;
          return false;
        }
        return true;
      })
    );
    if (reclaimedMb > 0) {
      setTelemetry((prev) => ({
        ...prev,
        free_storage_gb: Number(
          (prev.free_storage_gb + reclaimedMb / 1024).toFixed(2)
        ),
      }));
    }
  };

  const handleRunFifoPurge = () => {
    const purgeSet = new Set(manifestResult?.manifest.purge_queue_ids || []);
    const eligibleIds = vaultItems
      .filter(
        (v) =>
          v.state === 'EXPIRED' ||
          v.age_hours >= 48 ||
          (telemetry.free_storage_gb < 2.0 && v.state === 'WATCHED') ||
          purgeSet.has(v.item_id)
      )
      .map((v) => v.item_id);
    handleExecutePurgeIds(eligibleIds);
  };

  const handleToggleSource = (sourceId: string) => {
    setSources((prev) =>
      prev.map((s) =>
        s.source_id === sourceId ? { ...s, is_enabled: !s.is_enabled } : s
      )
    );
  };

  const handleDeleteSource = (sourceId: string) => {
    setSources((prev) => prev.filter((s) => s.source_id !== sourceId));
    setCandidates((prev) => prev.filter((c) => c.source_id !== sourceId));
  };

  const handleAddSourceWithCandidates = (
    source: AuthorizedSource,
    newCandidates: CandidateMediaItem[]
  ) => {
    setSources((prev) => [source, ...prev]);
    setCandidates((prev) => [...newCandidates, ...prev]);
  };

  const handleUpdateSourceEtag = (sourceId: string, etag: string) => {
    setSources((prev) =>
      prev.map((s) =>
        s.source_id === sourceId
          ? {
              ...s,
              etag_or_page_token: etag,
              last_polled_epoch: Math.floor(Date.now() / 1000),
            }
          : s
      )
    );
  };

  const handleMarkWatched = (itemId: string) => {
    setVaultItems((prev) =>
      prev.map((v) => (v.item_id === itemId ? { ...v, state: 'WATCHED' } : v))
    );
  };

  const handleAgeItem24h = (itemId: string) => {
    setVaultItems((prev) =>
      prev.map((v) => {
        if (v.item_id !== itemId) return v;
        const nextAge = v.age_hours + 24;
        return {
          ...v,
          age_hours: nextAge,
          state: nextAge >= 48 ? 'EXPIRED' : v.state,
        };
      })
    );
  };

  const handleDeleteVaultItem = (itemId: string) => {
    handleExecutePurgeIds([itemId]);
  };

  if (showOnboarding) {
    return (
      <OnboardingFlow
        initialPrefs={userPrefs}
        initialTelemetry={telemetry}
        sources={sources}
        driveAccessToken={driveAccessToken}
        driveUserEmail={driveUserEmail}
        onGoogleDriveSignIn={handleGoogleDriveSignIn}
        onToggleSource={handleToggleSource}
        onAddSourceWithCandidates={handleAddSourceWithCandidates}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        telemetry={telemetry}
        vaultCount={vaultItems.length}
        sourcesCount={sources.filter((s) => s.is_enabled).length}
        onOpenWizard={() => setWizardOpen(true)}
        onOpenTasteSetup={() => setShowOnboarding(true)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#E2E8F0] px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#64748B] hidden sm:inline">PulseVault</span>
              <span className="text-[#CBD5E1] hidden sm:inline">/</span>
              <h1 className="font-display text-base md:text-lg font-semibold text-[#0F172A] truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <button
            type="button"
            disabled={isGenerating}
            onClick={() => {
              if (activeTab !== 'radar') setActiveTab('radar');
              void handleGenerateManifest();
            }}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(2,132,199,0.2)]"
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Evaluating...' : 'Evaluate Quota & Manifest'}</span>
          </button>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-8">
          {activeTab === 'radar' && (
            <QuotaRadarView
              telemetry={telemetry}
              userPrefs={userPrefs}
              onToggleAutoDownload={() =>
                setUserPrefs((p) => ({
                  ...p,
                  auto_download_enabled: !p.auto_download_enabled,
                }))
              }
              onOpenOnboarding={() => setShowOnboarding(true)}
              onUpdateTelemetry={handleUpdateTelemetry}
              manifestResult={manifestResult}
              jobs={jobs}
              vaultItems={vaultItems}
              isGenerating={isGenerating}
              errorMsg={errorMsg}
              onGenerateManifest={() => void handleGenerateManifest()}
              isTransferRunning={isTransferRunning}
              onToggleTransfer={() => setIsTransferRunning((r) => !r)}
              onExecutePurgeQueue={handleExecutePurgeIds}
              activeSourcesCount={sources.filter((s) => s.is_enabled).length}
            />
          )}

          {activeTab === 'connectors' && (
            <ConnectorHubView
              sources={sources}
              candidates={candidates}
              telemetry={telemetry}
              userPrefs={userPrefs}
              driveAccessToken={driveAccessToken}
              driveUserEmail={driveUserEmail}
              onGoogleDriveSignIn={handleGoogleDriveSignIn}
              onGoogleDriveSignOut={handleGoogleDriveSignOut}
              onToggleLikeCandidate={handleToggleLikeItem}
              onToggleDislikeCandidate={handleToggleDislikeItem}
              onToggleSource={handleToggleSource}
              onDeleteSource={handleDeleteSource}
              onAddSourceWithCandidates={handleAddSourceWithCandidates}
              onUpdateSourceEtag={handleUpdateSourceEtag}
              onUpdateWeights={(weights) =>
                handleUpdateTelemetry({ category_weights: weights })
              }
            />
          )}

          {activeTab === 'vault' && (
            <OfflineVaultView
              vaultItems={vaultItems}
              freeStorageGb={telemetry.free_storage_gb}
              purgeQueueIds={manifestResult?.manifest.purge_queue_ids || []}
              userPrefs={userPrefs}
              driveAccessToken={driveAccessToken}
              onToggleLikeItem={handleToggleLikeItem}
              onToggleDislikeItem={handleToggleDislikeItem}
              onMarkWatched={handleMarkWatched}
              onAgeItem24h={handleAgeItem24h}
              onDeleteItem={handleDeleteVaultItem}
              onRunFifoPurge={handleRunFifoPurge}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              history={history}
              executionLog={executionLog}
              vaultItems={vaultItems}
              telemetry={telemetry}
            />
          )}
        </main>
      </div>

      <PolicyWizardModal
        open={wizardOpen}
        telemetry={telemetry}
        onClose={() => setWizardOpen(false)}
        onSave={handleUpdateTelemetry}
      />
    </div>
  );
}
