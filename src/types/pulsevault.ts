export type ThermalState = 'NOMINAL' | 'WARM' | 'CRITICAL';

export type SourceConnectorType = 'RSS_PODCAST' | 'GOOGLE_DRIVE_FOLDER';

export type MediaCategory = 'Audio' | 'Lecture' | 'PersonalDrive';

export type ResolutionTier = '1080p' | '720p' | '480p' | '320kbps_audio';

export type ExecutionStatus =
  | 'READY_TO_FETCH'
  | 'ABORT_INSUFFICIENT_QUOTA'
  | 'DEFER_THERMAL_THROTTLE';

export type VaultLifecycleState =
  | 'DISCOVERED'
  | 'QUOTA_APPROVED'
  | 'FETCHING'
  | 'PAUSED_INTERRUPT'
  | 'COMPLETED'
  | 'WATCHED'
  | 'EXPIRED';

export type LedgerExecutionStatus =
  | 'SUCCESS'
  | 'SKIPPED_LOW_QUOTA'
  | 'ABORTED_BATTERY';

export type ActiveTab = 'radar' | 'connectors' | 'vault' | 'analytics';

export interface CategoryWeights {
  Audio: number;
  Lecture: number;
  PersonalDrive: number;
}

export interface UserPreferences {
  onboarding_completed: boolean;
  compliance_acknowledged: boolean;
  languages: string[];
  favorite_genres: string[];
  disliked_topics: string[];
  liked_item_ids: string[];
  disliked_item_ids: string[];
  custom_interests_note: string;
  auto_download_enabled: boolean;
}

export interface TelemetryConfig {
  daily_limit_mb: number;
  current_used_mb: number;
  predicted_usage_until_reset_mb: number;
  safety_buffer_mb: number;
  reset_time: string;
  prefetch_window_offset_mins: number;
  min_battery_percent: number;
  max_vault_gb: number;
  active_sim_label: string;
  network_interface: '5G_CELLULAR' | 'LTE_METERED' | 'WIFI_OFFLOAD';
  battery_level: number;
  is_charging: boolean;
  thermal_state: ThermalState;
  free_storage_gb: number;
  foreground_traffic_spike: boolean;
  currency_symbol: string;
  rate_per_gb: number;
  category_weights: CategoryWeights;
}

export interface AuthorizedSource {
  source_id: string;
  provider_type: SourceConnectorType;
  title: string;
  endpoint_uri: string; // RSS XML URL or Google Drive Folder ID
  category: MediaCategory;
  priority_weight: number; // 1 to 100
  max_items_per_sync: number;
  last_polled_epoch: number;
  etag_or_page_token: string;
  is_enabled: boolean;
  description: string;
  language?: string;
  genre?: string;
}

export interface CandidateMediaItem {
  item_id: string;
  source_id: string;
  remote_guid: string;
  title: string;
  provider_type: SourceConnectorType;
  source_title: string;
  category: MediaCategory;
  mime_type: string;
  language: string;
  genre: string;
  tags: string[];
  download_url: string;
  md5_checksum?: string;
  duration_min: number;
  total_bytes: number;
  size_1080p_mb: number | null;
  size_720p_mb: number | null;
  size_480p_mb: number | null;
  size_audio_mb: number;
  commute_brief_eligible: boolean;
  published_at: string;
  summary: string;
}

export interface LocalVaultItem {
  item_id: string;
  source_id: string;
  remote_guid: string;
  title: string;
  provider_type: SourceConnectorType;
  source_title: string;
  category: MediaCategory;
  mime_type: string;
  language?: string;
  genre?: string;
  selected_resolution: ResolutionTier;
  total_bytes: number;
  downloaded_bytes: number;
  size_mb: number;
  local_file_path: string;
  state: VaultLifecycleState;
  commute_brief_date: string | null;
  commute_brief_tag: boolean;
  created_at_epoch: number;
  expires_at_epoch: number;
  age_hours: number;
  duration_min: number;
  download_url?: string;
  md5_checksum?: string;
  summary: string;
}

export interface DownloadManifestItem {
  priority_rank: number;
  title: string;
  source_connector: SourceConnectorType;
  resolved_url: string;
  selected_resolution: ResolutionTier;
  estimated_size_mb: number;
  commute_brief_tag: boolean;
}

export interface ManifestResponse {
  execution_status: ExecutionStatus;
  telemetry_summary: {
    net_surplus_mb: number;
    allocated_mb: number;
    unallocated_buffer_mb: number;
  };
  purge_queue_ids: string[];
  download_manifest: DownloadManifestItem[];
}

export interface ManifestGenerationResult {
  manifest: ManifestResponse;
  engine_source: 'gemini-4-hydrogen' | 'deterministic-gate';
  evaluated_at: string;
  notes: string[];
  agent_reasoning?: string[];
}

export interface DownloadJob extends DownloadManifestItem {
  job_id: string;
  item_id: string;
  source_id: string;
  remote_guid: string;
  mime_type: string;
  md5_checksum?: string;
  state: VaultLifecycleState;
  progress_pct: number;
  total_bytes: number;
  downloaded_bytes: number;
  chunk_size_bytes: number; // 2 MB checkpoint commits
  integrity_verified: boolean;
  category: MediaCategory;
  duration_min: number;
  language?: string;
  genre?: string;
}

export interface DailyRescuePoint {
  date_iso: string;
  date_label: string;
  used_mb: number;
  rescued_mb: number;
  wasted_mb: number;
  daily_limit_mb: number;
  items_fetched_count: number;
  execution_status: LedgerExecutionStatus;
}

export interface ExecutionRunRecord {
  id: string;
  timestamp: string;
  execution_status: ExecutionStatus;
  net_surplus_mb: number;
  allocated_mb: number;
  items_count: number;
  purged_count: number;
  engine: string;
}
