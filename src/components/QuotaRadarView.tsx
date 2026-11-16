import React, { useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  DownloadJob,
  LocalVaultItem,
  ManifestGenerationResult,
  TelemetryConfig,
  ThermalState,
  UserPreferences,
} from '../types/pulsevault';
import { computeNetSurplusMb, TELEMETRY_PRESETS } from '../data/seedData';

interface QuotaRadarViewProps {
  telemetry: TelemetryConfig;
  userPrefs: UserPreferences;
  onToggleAutoDownload: () => void;
  onOpenOnboarding: () => void;
  onUpdateTelemetry: (patch: Partial<TelemetryConfig>) => void;
  manifestResult: ManifestGenerationResult | null;
  jobs: DownloadJob[];
  vaultItems: LocalVaultItem[];
  isGenerating: boolean;
  errorMsg: string | null;
  onGenerateManifest: () => void;
  isTransferRunning: boolean;
  onToggleTransfer: () => void;
  onExecutePurgeQueue: (ids: string[]) => void;
  activeSourcesCount: number;
}

export function QuotaRadarView({
  telemetry,
  userPrefs,
  onToggleAutoDownload,
  onOpenOnboarding,
  onUpdateTelemetry,
  manifestResult,
  jobs,
  vaultItems,
  isGenerating,
  errorMsg,
  onGenerateManifest,
  isTransferRunning,
  onToggleTransfer,
  onExecutePurgeQueue,
  activeSourcesCount,
}: QuotaRadarViewProps) {
  const [showJson, setShowJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const netSurplus = computeNetSurplusMb(telemetry);
  const dailyLimit = Math.max(1, telemetry.daily_limit_mb);
  const usedPct = Math.min(100, (telemetry.current_used_mb / dailyLimit) * 100);
  const predictedPct = Math.min(
    100 - usedPct,
    (telemetry.predicted_usage_until_reset_mb / dailyLimit) * 100
  );
  const bufferPct = Math.min(
    100 - usedPct - predictedPct,
    (telemetry.safety_buffer_mb / dailyLimit) * 100
  );
  const surplusPct = Math.max(0, 100 - usedPct - predictedPct - bufferPct);

  const lowBatteryRestricted =
    telemetry.battery_level < telemetry.min_battery_percent && !telemetry.is_charging;
  const thermalBlocked = telemetry.thermal_state === 'CRITICAL';
  const lowStorage = telemetry.free_storage_gb < 2.0;

  const manifest = manifestResult?.manifest;
  const allocatedMb = manifest?.telemetry_summary.allocated_mb ?? 0;
  const efficiencyPct =
    netSurplus > 0 && manifest?.execution_status === 'READY_TO_FETCH'
      ? Math.round((allocatedMb / netSurplus) * 100)
      : 0;

  const pendingPurgeIds =
    manifest?.purge_queue_ids.filter((id) =>
      vaultItems.some((v) => v.item_id === id)
    ) ?? [];

  // Determine 5-stage WorkManager pipeline stage
  const hasCompletedJob = jobs.some((j) => j.state === 'COMPLETED');
  const hasFetchingOrPaused = jobs.some(
    (j) =>
      j.state === 'FETCHING' ||
      j.state === 'QUOTA_APPROVED' ||
      j.state === 'PAUSED_INTERRUPT'
  );
  const allCompleted = jobs.length > 0 && jobs.every((j) => j.state === 'COMPLETED');

  const pipelineStages = [
    { id: 1, label: 'ETag & Drive Delta Poll', done: activeSourcesCount > 0 },
    {
      id: 2,
      label: 'Quota & Gate Solver',
      done: Boolean(manifest && manifest.execution_status === 'READY_TO_FETCH'),
    },
    {
      id: 3,
      label: '2 MB Chunked Transfer',
      done: allCompleted,
      active: isTransferRunning || hasFetchingOrPaused,
    },
    {
      id: 4,
      label: 'MD5 / Byte Integrity',
      done: allCompleted,
      active: hasCompletedJob && !allCompleted,
    },
    {
      id: 5,
      label: '06:00 Commute Commit',
      done: allCompleted,
    },
  ];

  const handleCopyJson = async () => {
    if (!manifest) return;
    await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  };

  const renderExecutionBadge = () => {
    if (!manifest) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#475569]">
          <RefreshCw className="h-3.5 w-3.5 text-[#0284C7]" />
          <span>Awaiting Manifest Evaluation</span>
        </span>
      );
    }
    if (manifest.execution_status === 'READY_TO_FETCH') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#065F46] bg-[#ECFDF5] px-2.5 py-1 rounded-md border border-[#10B981]/30">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
          <span>READY_TO_FETCH</span>
        </span>
      );
    }
    if (manifest.execution_status === 'DEFER_THERMAL_THROTTLE') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#92400E] bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#F59E0B]/30">
          <Thermometer className="h-3.5 w-3.5 text-[#D97706]" />
          <span>DEFER_THERMAL_THROTTLE</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#991B1B] bg-[#FEE2E2] px-2.5 py-1 rounded-md border border-[#EF4444]/30">
        <ShieldAlert className="h-3.5 w-3.5 text-[#EF4444]" />
        <span>ABORT_INSUFFICIENT_QUOTA</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top 4-column Telemetry KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="telemetry-card p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Net Surplus Quota
            </span>
            <span className="font-mono text-xs tabular-nums text-[#475569]">
              Cap {telemetry.daily_limit_mb} MB
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums ${
                netSurplus > 0 ? 'text-[#0F172A]' : 'text-[#EF4444]'
              }`}
            >
              {netSurplus} MB
            </span>
          </div>
          <p className="mt-2 text-xs text-[#475569] tabular-nums">
            {netSurplus > 0
              ? `${(netSurplus / 1024).toFixed(2)} GB rescuable before ${telemetry.reset_time}`
              : 'Quota depleted · transfer aborted'}
          </p>
        </div>

        <div className="telemetry-card p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Manifest Allocation
            </span>
            <span className="font-mono text-xs tabular-nums text-[#0284C7]">
              {efficiencyPct}% fit
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0F172A]">
              {allocatedMb} MB
            </span>
          </div>
          <p className="mt-2 text-xs text-[#475569] tabular-nums">
            {manifest
              ? `${manifest.download_manifest.length} queued items · ${manifest.telemetry_summary.unallocated_buffer_mb} MB reserve`
              : `${activeSourcesCount} active connectors ready`}
          </p>
        </div>

        <div className="telemetry-card p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Device Telemetry Gate
            </span>
            {telemetry.is_charging ? (
              <BatteryCharging className="h-4 w-4 text-[#10B981]" />
            ) : lowBatteryRestricted ? (
              <BatteryLow className="h-4 w-4 text-[#D97706]" />
            ) : (
              <BatteryMedium className="h-4 w-4 text-[#475569]" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums text-[#0F172A]">
              {telemetry.battery_level}%
            </span>
            <span
              className={`font-mono text-xs font-medium ${
                thermalBlocked
                  ? 'text-[#EF4444]'
                  : telemetry.thermal_state === 'WARM'
                    ? 'text-[#D97706]'
                    : 'text-[#10B981]'
              }`}
            >
              {telemetry.thermal_state}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#475569]">
            {thermalBlocked
              ? 'Thermal critical · transfers deferred'
              : telemetry.foreground_traffic_spike
                ? 'Foreground traffic spike · PAUSED_INTERRUPT'
                : lowBatteryRestricted
                  ? `Unplugged <${telemetry.min_battery_percent}% · audio <50 MB only`
                  : telemetry.is_charging
                    ? 'Charging · full bitrate enabled'
                    : 'Battery nominal · adaptive bitrate'}
          </p>
        </div>

        <div className="telemetry-card p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Local Vault Storage
            </span>
            <span
              className={`font-mono text-xs font-medium ${
                lowStorage ? 'text-[#EF4444]' : 'text-[#10B981]'
              }`}
            >
              {lowStorage ? 'FIFO Triggered' : 'Healthy'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums ${
                lowStorage ? 'text-[#EF4444]' : 'text-[#0F172A]'
              }`}
            >
              {telemetry.free_storage_gb.toFixed(1)} GB
            </span>
          </div>
          <p className="mt-2 text-xs text-[#475569] tabular-nums">
            {lowStorage
              ? `Below 2.0 GB floor · ${pendingPurgeIds.length} prune candidate(s)`
              : `${vaultItems.length} cached files · cap ${telemetry.max_vault_gb} GB`}
          </p>
        </div>
      </div>

      {/* Active User Taste Profile & Autonomous Auto-Sync Bar */}
      <div className="telemetry-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0284C7] shrink-0" />
              <h2 className="font-display text-sm font-semibold text-[#0F172A]">
                Personal Sync Profile & Open Protocol Filter
              </h2>
            </div>
            <p className="text-xs text-[#475569] leading-relaxed">
              <span className="font-medium text-[#0F172A]">Languages:</span>{' '}
              {userPrefs.languages.join(', ') || 'Any'}
              <span aria-hidden="true"> · </span>
              <span className="font-medium text-[#0F172A]">Topics:</span>{' '}
              {userPrefs.favorite_genres.join(', ') || 'All'}
              {userPrefs.disliked_topics.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-medium text-[#EF4444]">Excluded:</span>{' '}
                  {userPrefs.disliked_topics.join(', ')}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleAutoDownload}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                userPrefs.auto_download_enabled
                  ? 'bg-[#ECFDF5] border-[#10B981]/40 text-[#065F46]'
                  : 'bg-white border-[#E2E8F0] text-[#475569]'
              }`}
            >
              {userPrefs.auto_download_enabled
                ? 'Auto-Sync: ON'
                : 'Auto-Sync: Manual'}
            </button>
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] whitespace-nowrap"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#475569]" />
              <span>Edit Languages & Tastes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scenario Presets Strip */}
      <div className="telemetry-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#0F172A]">
              Telemetry Condition Scenarios
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Load realistic device telemetry states to test quota math, thermal gating, battery restrictions, and FIFO storage pruning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TELEMETRY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.summary}
                onClick={() => onUpdateTelemetry(preset.patch)}
                className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0F172A] hover:bg-[#F0F9FF] hover:border-[#0284C7] hover:text-[#0369A1] transition-colors whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split: Quota & Telemetry Controls + Allocation Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 cols: Interactive Telemetry Controls */}
        <div className="lg:col-span-5 telemetry-card p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#0F172A]">
                Bandwidth & Device Telemetry
              </h2>
              <span className="font-mono text-xs text-[#64748B]">
                {telemetry.active_sim_label} · {telemetry.network_interface}
              </span>
            </div>

            {/* Quota Sliders */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#475569]">Current Used Today</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.current_used_mb} / {telemetry.daily_limit_mb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={telemetry.daily_limit_mb}
                  step={20}
                  value={telemetry.current_used_mb}
                  onChange={(e) =>
                    onUpdateTelemetry({ current_used_mb: Number(e.target.value) })
                  }
                  className="w-full telemetry-slider"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#475569]">
                    Predicted User Usage Until Reset
                  </span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.predicted_usage_until_reset_mb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={800}
                  step={10}
                  value={telemetry.predicted_usage_until_reset_mb}
                  onChange={(e) =>
                    onUpdateTelemetry({
                      predicted_usage_until_reset_mb: Number(e.target.value),
                    })
                  }
                  className="w-full telemetry-slider"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#475569]">Safety Buffer</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.safety_buffer_mb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={10}
                  value={telemetry.safety_buffer_mb}
                  onChange={(e) =>
                    onUpdateTelemetry({ safety_buffer_mb: Number(e.target.value) })
                  }
                  className="w-full telemetry-slider"
                />
              </div>
            </div>

            <div className="border-t border-[#F1F5F9] pt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#475569]">Battery Level</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.battery_level}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={telemetry.battery_level}
                  onChange={(e) =>
                    onUpdateTelemetry({ battery_level: Number(e.target.value) })
                  }
                  className="w-full telemetry-slider"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#475569]">Available Device Storage</span>
                  <span
                    className={`font-mono font-medium tabular-nums ${
                      lowStorage ? 'text-[#EF4444]' : 'text-[#0F172A]'
                    }`}
                  >
                    {telemetry.free_storage_gb.toFixed(1)} GB
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={16.0}
                  step={0.1}
                  value={telemetry.free_storage_gb}
                  onChange={(e) =>
                    onUpdateTelemetry({ free_storage_gb: Number(e.target.value) })
                  }
                  className="w-full telemetry-slider"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="block text-xs font-medium text-[#475569] mb-1.5">
                    Thermal State
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#F1F5F9] rounded-lg">
                    {(['NOMINAL', 'WARM', 'CRITICAL'] as ThermalState[]).map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={() => onUpdateTelemetry({ thermal_state: state })}
                        className={`py-1.5 text-[11px] font-mono font-medium rounded-md transition-colors ${
                          telemetry.thermal_state === state
                            ? state === 'CRITICAL'
                              ? 'bg-[#EF4444] text-white shadow-xs'
                              : 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#475569] hover:text-[#0F172A]'
                        }`}
                      >
                        {state === 'NOMINAL' ? 'NOM' : state === 'WARM' ? 'WARM' : 'CRIT'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-[#475569] mb-1.5">
                    Power Adapter
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTelemetry({ is_charging: !telemetry.is_charging })
                    }
                    className={`w-full h-[34px] px-3 rounded-lg border text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      telemetry.is_charging
                        ? 'bg-[#ECFDF5] border-[#10B981]/40 text-[#065F46]'
                        : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <BatteryCharging className="h-3.5 w-3.5" />
                    <span>{telemetry.is_charging ? 'Charging' : 'On Battery'}</span>
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTelemetry({
                      foreground_traffic_spike: !telemetry.foreground_traffic_spike,
                    })
                  }
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-medium transition-colors flex items-center justify-between ${
                    telemetry.foreground_traffic_spike
                      ? 'bg-[#FEF3C7] border-[#F59E0B]/40 text-[#92400E]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Wifi className="h-3.5 w-3.5" />
                    <span>Simulate Foreground Traffic Spike</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold">
                    {telemetry.foreground_traffic_spike ? 'ACTIVE · PAUSED_INTERRUPT' : 'IDLE'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-xs text-[#475569]">
            <span>Category Weights</span>
            <span className="font-mono tabular-nums text-[#0F172A]">
              Audio {telemetry.category_weights.Audio}% · Lecture{' '}
              {telemetry.category_weights.Lecture}% · Drive{' '}
              {telemetry.category_weights.PersonalDrive}%
            </span>
          </div>
        </div>

        {/* Right 7 cols: Quota Formula Breakdown, Pre-Flight Gates & Manifest Status */}
        <div className="lg:col-span-7 telemetry-card p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0F172A]">
                  Quota Allocation Radar
                </h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Deterministic pre-reset bandwidth budget ({telemetry.prefetch_window_offset_mins} min before {telemetry.reset_time})
                </p>
              </div>
              {renderExecutionBadge()}
            </div>

            {/* Segmented Quota Bar */}
            <div className="space-y-2.5">
              <div className="h-4 w-full rounded-lg bg-[#F1F5F9] overflow-hidden flex border border-[#E2E8F0]">
                <div
                  style={{ width: `${usedPct}%` }}
                  className="bg-[#64748B] transition-all duration-200"
                  title={`Used: ${telemetry.current_used_mb} MB`}
                />
                <div
                  style={{ width: `${predictedPct}%` }}
                  className="bg-[#94A3B8] transition-all duration-200"
                  title={`Predicted: ${telemetry.predicted_usage_until_reset_mb} MB`}
                />
                <div
                  style={{ width: `${bufferPct}%` }}
                  className="bg-[#CBD5E1] transition-all duration-200"
                  title={`Safety Buffer: ${telemetry.safety_buffer_mb} MB`}
                />
                {netSurplus > 0 && (
                  <div
                    style={{ width: `${surplusPct}%` }}
                    className="bg-[#0284C7] transition-all duration-200"
                    title={`Net Surplus: ${netSurplus} MB`}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#64748B] shrink-0" />
                  <span className="text-[#475569]">Used</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.current_used_mb} MB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#94A3B8] shrink-0" />
                  <span className="text-[#475569]">Predicted</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.predicted_usage_until_reset_mb} MB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#CBD5E1] shrink-0" />
                  <span className="text-[#475569]">Buffer</span>
                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                    {telemetry.safety_buffer_mb} MB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#0284C7] shrink-0" />
                  <span className="text-[#475569]">Surplus</span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      netSurplus > 0 ? 'text-[#0284C7]' : 'text-[#EF4444]'
                    }`}
                  >
                    {netSurplus} MB
                  </span>
                </div>
              </div>
            </div>

            {/* Formula Readout */}
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-[#475569]">
                Net_Surplus_MB = {telemetry.daily_limit_mb} - ({telemetry.current_used_mb} +{' '}
                {telemetry.predicted_usage_until_reset_mb} + {telemetry.safety_buffer_mb})
              </span>
              <span
                className={`font-mono text-sm font-semibold tabular-nums ${
                  netSurplus > 0 ? 'text-[#0284C7]' : 'text-[#EF4444]'
                }`}
              >
                = {netSurplus} MB
              </span>
            </div>

            {/* Pre-Flight Gate Matrix */}
            <div className="divide-y divide-[#F1F5F9] border-t border-b border-[#F1F5F9]">
              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#475569]">Quota Headroom Gate (&gt; 0 MB)</span>
                <span
                  className={`font-mono font-medium ${
                    netSurplus > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {netSurplus > 0 ? 'PASS · Ready' : 'FAIL · ABORT_INSUFFICIENT_QUOTA'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#475569]">Thermal Envelope Gate (!= CRITICAL)</span>
                <span
                  className={`font-mono font-medium ${
                    thermalBlocked ? 'text-[#EF4444]' : 'text-[#10B981]'
                  }`}
                >
                  {thermalBlocked
                    ? 'HOLD · DEFER_THERMAL_THROTTLE'
                    : `PASS · ${telemetry.thermal_state}`}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#475569]">
                  Battery Policy Gate (&ge; {telemetry.min_battery_percent}% or Charging)
                </span>
                <span
                  className={`font-mono font-medium ${
                    lowBatteryRestricted ? 'text-[#D97706]' : 'text-[#10B981]'
                  }`}
                >
                  {lowBatteryRestricted
                    ? 'CONSTRAINED · Audio <50 MB only'
                    : 'PASS · Full Bitrate'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#475569]">Zero-Bloat Storage Gate (&ge; 2.0 GB Free)</span>
                <span
                  className={`font-mono font-medium ${
                    lowStorage ? 'text-[#D97706]' : 'text-[#10B981]'
                  }`}
                >
                  {lowStorage
                    ? `PURGE REQUIRED · ${pendingPurgeIds.length} queued`
                    : 'PASS · Nominal'}
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-start gap-2.5 text-xs text-[#991B1B]">
              <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {manifestResult && (
            <div className="space-y-2">
              {manifestResult.notes.map((note, idx) => (
                <p key={idx} className="text-xs text-[#475569]">
                  {note}
                </p>
              ))}
              {manifestResult.agent_reasoning && manifestResult.agent_reasoning.length > 0 && (
                <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-1.5">
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#0284C7]">
                    AI Agent Curation Rationale
                  </div>
                  <ul className="space-y-1 text-xs text-[#475569]">
                    {manifestResult.agent_reasoning.map((reason, rIdx) => (
                      <li key={rIdx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              {manifest && (
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  className="flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap"
                >
                  <Code2 className="h-4 w-4 text-[#475569]" />
                  <span>{showJson ? 'Hide JSON Output' : 'Inspect JSON Schema'}</span>
                </button>
              )}
              {pendingPurgeIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onExecutePurgeQueue(pendingPurgeIds)}
                  className="flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] transition-colors whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Purge {pendingPurgeIds.length} Flagged File(s)</span>
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={isGenerating}
              onClick={onGenerateManifest}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-[#0284C7] text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors whitespace-nowrap shadow-[0_1px_2px_rgba(2,132,199,0.2)]"
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Evaluating Telemetry...' : 'Generate Manifest'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Deterministic JSON Payload Inspector */}
      {showJson && manifest && (
        <div className="telemetry-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <span className="font-display text-sm font-semibold text-[#0F172A]">
                Deterministic Engine Output JSON
              </span>
              <span className="font-mono text-xs text-[#64748B]">
                Engine: {manifestResult?.engine_source}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
            >
              <Copy className="h-3.5 w-3.5 text-[#475569]" />
              <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="p-6 text-xs font-mono text-[#0F172A] overflow-x-auto leading-relaxed bg-white">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </div>
      )}

      {/* 5-Stage WorkManager Sync Pipeline Status Strip */}
      <div className="telemetry-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Resilient 5-Stage Sync Pipeline
          </span>
          <span className="font-mono text-xs text-[#475569]">
            2 MB Checkpoint Commits · HTTP Range Resumable
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          {pipelineStages.map((stage) => (
            <div
              key={stage.id}
              className={`rounded-lg border px-3 py-2.5 text-xs ${
                stage.done
                  ? 'border-[#10B981]/40 bg-[#ECFDF5] text-[#065F46]'
                  : stage.active
                    ? 'border-[#0284C7] bg-[#F0F9FF] text-[#0369A1]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]'
              }`}
            >
              <div className="font-mono text-[10px] font-semibold uppercase">
                Stage 0{stage.id}
              </div>
              <div className="font-medium mt-0.5 truncate">{stage.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Download Manifest & State Machine Queue Table */}
      <div className="telemetry-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F172A]">
              Sync State Machine & Manifest Queue
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Chunked HTTP Range execution pipeline with 2 MB byte checkpoints and MD5 / length verification
            </p>
          </div>

          {jobs.length > 0 && manifest?.execution_status === 'READY_TO_FETCH' && (
            <button
              type="button"
              onClick={onToggleTransfer}
              disabled={
                !isTransferRunning &&
                (telemetry.thermal_state === 'CRITICAL' || telemetry.foreground_traffic_spike)
              }
              className={`flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
                isTransferRunning
                  ? 'border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
                  : 'bg-[#10B981] text-white hover:bg-[#059669]'
              }`}
            >
              {isTransferRunning ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span>Pause Chunked Transfer</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Execute Manifest Transfer</span>
                </>
              )}
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <Download className="h-6 w-6 text-[#94A3B8] mx-auto" />
            <p className="text-sm font-medium text-[#0F172A]">
              {manifest
                ? `No items queued (${manifest.execution_status})`
                : 'No manifest evaluated for the current telemetry state'}
            </p>
            <p className="text-xs text-[#475569] max-w-md mx-auto">
              {manifest?.execution_status === 'ABORT_INSUFFICIENT_QUOTA'
                ? 'Daily surplus quota is 0 MB or negative. Lower predicted usage or increase daily limit to resume curation.'
                : manifest?.execution_status === 'DEFER_THERMAL_THROTTLE'
                  ? 'Device thermal state is CRITICAL. Transfers remain paused until thermal state returns to WARM or NOMINAL.'
                  : 'Click Generate Manifest to run the Autonomous Bandwidth Allocation Engine against your active RSS and Google Drive connectors.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] h-10">
                  <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Rank
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Media Item
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Tier
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                    Byte Checkpoint
                  </th>
                  <th className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    State Machine
                  </th>
                  <th className="px-6 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] text-right">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {jobs.map((job) => {
                  const downloadedMb = (job.downloaded_bytes / (1024 * 1024)).toFixed(0);
                  const totalMb = Math.max(
                    job.estimated_size_mb,
                    Math.round(job.total_bytes / (1024 * 1024))
                  );
                  return (
                    <tr key={job.job_id} className="hover:bg-[#F8FAFC] transition-colors h-[64px]">
                      <td className="px-6 font-mono text-xs font-semibold tabular-nums text-[#475569]">
                        #{job.priority_rank}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        <div className="text-sm font-medium text-[#0F172A] truncate">
                          {job.title}
                        </div>
                        <div className="text-xs text-[#64748B] font-mono">
                          {job.source_connector} · {job.category}
                          {job.commute_brief_tag ? ' · 06:00 Commute Brief' : ''}
                          {job.integrity_verified ? ' · MD5 OK' : ''}
                        </div>
                      </td>
                      <td className="px-4 font-mono text-xs text-[#0284C7] font-medium whitespace-nowrap">
                        {job.selected_resolution}
                      </td>
                      <td className="px-4 font-mono text-xs tabular-nums text-[#0F172A] text-right whitespace-nowrap">
                        {downloadedMb} / {totalMb} MB
                      </td>
                      <td className="px-4 font-mono text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            job.state === 'COMPLETED'
                              ? 'text-[#10B981] font-semibold'
                              : job.state === 'FETCHING'
                                ? 'text-[#0284C7] font-semibold'
                                : job.state === 'PAUSED_INTERRUPT'
                                  ? 'text-[#D97706] font-semibold'
                                  : 'text-[#475569]'
                          }`}
                        >
                          {job.integrity_verified && <ShieldCheck className="h-3.5 w-3.5" />}
                          <span>{job.state}</span>
                        </span>
                      </td>
                      <td className="px-6 text-right min-w-[160px]">
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-24 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                            <div
                              style={{ width: `${job.progress_pct}%` }}
                              className={`h-full transition-all duration-200 ${
                                job.state === 'COMPLETED'
                                  ? 'bg-[#10B981]'
                                  : job.state === 'PAUSED_INTERRUPT'
                                    ? 'bg-[#D97706]'
                                    : 'bg-[#0284C7]'
                              }`}
                            />
                          </div>
                          <span className="font-mono text-xs tabular-nums text-[#475569] w-10 text-right">
                            {job.progress_pct}%
                          </span>
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
