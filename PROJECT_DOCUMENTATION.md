# PulseVault — Complete Project Specification & Implementation Record

**Last Updated:** 2026-11-14  
**Positioning:** Automated Bandwidth & Personal Media Sync Utility (Google Play Store–Compliant Architecture)  
**Primary Runtime:** React 19 + Vite 8 + Express 4 + TypeScript (`tsx`) + `@google/genai` (`gemini-4-hydrogen`) + Firebase Auth & Google Drive REST v3  

---

## 1. Executive Summary & Product Positioning

**PulseVault** is an autonomous daily cellular bandwidth rescue and scheduled offline media sync application. Many mobile data plans reset unused daily cellular allowances at midnight (`00:00`). PulseVault monitors remaining daily data before reset, evaluates device battery/thermal/storage telemetry, and schedules deterministic offline downloads from **open protocols (`RSS_PODCAST`)** and **user-owned cloud storage (`GOOGLE_DRIVE_FOLDER`)** so unused data becomes a ready-to-play **06:00 AM Morning Commute Brief**.

### Google Play Store Compliance Architecture
To ensure strict compliance with Google Play Developer Policies (**Intellectual Property**, **Device and Network Abuse**, and **Deceptive Behavior**):
- **Zero unauthorized scraping or DRM circumvention:** No YouTube stream extraction, no third-party movie/OTT rippers, and no `youtube_api` scraping connectors.
- **Strictly authorized connectors:**
  1. `RSS_PODCAST` — Open RSS 2.0 / Atom XML podcast feeds, Creative Commons university OpenCourseWare (MIT OCW, NPTEL), and Public Domain archives (Internet Archive, Blender Open Movies) with conditional `If-None-Match` ETag + `HEAD` `Content-Length` resolution.
  2. `GOOGLE_DRIVE_FOLDER` — User-owned personal folders connected via Firebase Google Sign-In (`https://www.googleapis.com/auth/drive.readonly`) and Google Drive REST v3 APIs.
- **Mandatory user acknowledgment:** Onboarding requires explicit user confirmation that all connected RSS feeds and Drive folders are user-owned or open-protocol sources.

---

## 2. Technology Stack & Dependencies

| Layer | Technology | Version / Notes |
| --- | --- | --- |
| **Frontend UI** | React + TypeScript | `react@^19.0.1`, `react-dom@^19.0.1`, `typescript@^7.0.2` |
| **Styling** | Tailwind CSS v4 | `@tailwindcss/vite@^4.3.3`, `tailwindcss@^4.3.3` |
| **Icons & Motion** | Lucide + Motion | `lucide-react@^0.546.0`, `motion@^12.23.24` |
| **Backend Server** | Express on Node.js | `express@^4.21.2`, `tsx@^4.21.0`, Vite middleware in dev |
| **AI Curation Engine** | Google GenAI SDK | `@google/genai@^3.3.0` using `gemini-4-hydrogen` (structured JSON output) |
| **Auth & Cloud Storage** | Firebase Auth + Drive API v3 | `firebase@^13.3.0`, scope `https://www.googleapis.com/auth/drive.readonly` |
| **Build Tooling** | Vite + esbuild | `vite@^8.3.0`, `esbuild@^0.25.0` |

### Provisioned Project Configuration
- **GCP / Firebase Project ID:** `core-outcome-429014-s9` (Project Number: `431299840841`)
- **OAuth Scope Provisioned:** `https://www.googleapis.com/auth/drive.readonly`
- **Server Port:** `3000` (`http://localhost:3000` / `0.0.0.0:3000`)

---

## 3. Complete File Tree & Module Responsibilities

```text
/
├── .env.example                       # Environment variable template (GEMINI_API_KEY, APP_URL)
├── .gitignore                         # Standard Git ignore rules
├── firebase-applet-config.json        # Auto-provisioned Firebase web app configuration
├── index.html                         # Entry HTML, SEO/OG metadata, Google Fonts (Hanken Grotesk, DM Sans, JetBrains Mono)
├── metadata.json                      # App name, compliant description, and server-side Gemini capability flag
├── package.json                       # Scripts (dev, build, start, lint) and dependencies
├── server.ts                          # Express backend: Drive v3 proxy, RSS XML parser, Gemini manifest solver, Vite dev middleware
├── tsconfig.json                      # TypeScript compiler configuration
├── vite.config.ts                     # Vite + React + Tailwind configuration
├── PROJECT_DOCUMENTATION.md           # This complete project & progress reference
└── src/
    ├── main.tsx                       # React root mount
    ├── index.css                      # Tailwind v4 import, Precision Telemetry card/slider tokens, typography setup
    ├── App.tsx                        # Top-level state orchestration, Drive auth listener, 2 MB checkpoint transfer ticker
    ├── lib/
    │   └── firebaseDriveAuth.ts       # Firebase GoogleAuthProvider popup auth, in-memory token cache, Drive API fetch wrappers
    ├── types/
    │   └── pulsevault.ts              # Strict TypeScript interfaces aligned with Android SQLite Room/Drift schema
    ├── data/
    │   └── seedData.ts                # Compliant seed data: presets, sources, candidates, vault items, 14-day history, telemetry presets
    └── components/
        ├── Sidebar.tsx                # Navigation rail, reset/surplus/disk readout, quick access to Taste Setup & Policy Wizard
        ├── OnboardingFlow.tsx         # 3-step first-run personalization (Languages/Genres/Dislikes -> RSS & Drive -> Quota & Compliance)
        ├── QuotaRadarView.tsx         # Telemetry sliders, scenario presets, gate matrix, JSON inspector, 5-stage pipeline, job queue
        ├── ConnectorHubView.tsx       # Google Drive folder picker, open RSS presets/custom XML parser, weights, like/dislike candidate pool
        ├── OfflineVaultView.tsx       # 06:00 AM Morning Commute Brief player (plus authenticated Drive streaming), FIFO index & purge actions
        ├── AnalyticsView.tsx          # Data-to-value KPIs, interactive 14-day rescue SVG bar chart, category balance, audit log
        ├── PolicyWizardModal.tsx      # 3-step modal editing quota_config singleton (cap, buffer, weights, min battery, vault cap)
        └── GoogleSignInButton.tsx     # Official Google Sign-In button component
```

---

## 4. Data Models & SQLite-Aligned State Machine

All TypeScript models in `src/types/pulsevault.ts` mirror the mobile SQLite (`Room` / `Drift`) offline sync architecture:

### Core Entities
1. **`TelemetryConfig` (`quota_config` singleton)**
   - `daily_limit_mb`, `current_used_mb`, `predicted_usage_until_reset_mb`, `safety_buffer_mb`
   - `reset_time` (`"00:00"`), `prefetch_window_offset_mins` (`90`), `min_battery_percent` (`20`), `max_vault_gb` (`8`)
   - `active_sim_label`, `network_interface` (`5G_CELLULAR | LTE_METERED | WIFI_OFFLOAD`)
   - `battery_level`, `is_charging`, `thermal_state` (`NOMINAL | WARM | CRITICAL`), `free_storage_gb`, `foreground_traffic_spike`
   - `category_weights`: `{ Audio: number, Lecture: number, PersonalDrive: number }`
2. **`AuthorizedSource` (`sync_sources`)**
   - `source_id`, `provider_type` (`RSS_PODCAST | GOOGLE_DRIVE_FOLDER`), `title`, `endpoint_uri` (XML URL or Drive Folder ID)
   - `category` (`Audio | Lecture | PersonalDrive`), `priority_weight` (`1–100`), `max_items_per_sync`
   - `last_polled_epoch`, `etag_or_page_token`, `is_enabled`, `language`, `genre`
3. **`LocalVaultItem` (`media_vault_items`)**
   - `item_id` (SHA-256 style ID), `source_id`, `remote_guid`, `provider_type`, `selected_resolution` (`1080p | 720p | 480p | 320kbps_audio`)
   - `total_bytes`, `downloaded_bytes`, `size_mb`, `local_file_path` (`/Android/data/app.pulsevault/files/vault/...`)
   - `state`: **7-State Lifecycle** (`DISCOVERED -> QUOTA_APPROVED -> FETCHING -> PAUSED_INTERRUPT -> COMPLETED -> WATCHED -> EXPIRED`)
   - `commute_brief_date`, `commute_brief_tag`, `created_at_epoch`, `expires_at_epoch` (`+48h` TTL), `age_hours`, `md5_checksum`
4. **`DailyRescuePoint` (`daily_rescue_ledger`)**
   - `date_iso`, `date_label`, `used_mb`, `rescued_mb`, `wasted_mb`, `daily_limit_mb`, `items_fetched_count`
   - `execution_status`: `SUCCESS | SKIPPED_LOW_QUOTA | ABORTED_BATTERY`

### Resilient 5-Stage Transfer Pipeline (Frontend Simulation)
1. **ETag & Drive Delta Poll:** Tracks `etag_or_page_token` to skip unchanged feeds (`HTTP 304`) or fetch Drive deltas.
2. **Quota & Gate Solver:** Evaluates net surplus, thermal envelope, battery threshold, and user taste preferences.
3. **2 MB Chunked Transfer:** Advances `downloaded_bytes` in `2 * 1024 * 1024` (2 MB) checkpoint increments; immediately transitions active jobs to `PAUSED_INTERRUPT` if `thermal_state === 'CRITICAL'` or `foreground_traffic_spike === true`.
4. **MD5 / Byte Integrity:** Verifies `downloaded_bytes >= total_bytes` (`integrity_verified = true`).
5. **06:00 Commute Commit:** Writes completed items into `vaultItems`, deducts used quota / free disk space, and updates the daily rescue ledger.

---

## 5. Autonomous Bandwidth Allocation Engine Rules

Implemented in `server.ts` (`POST /api/manifest/generate`) combining `gemini-4-hydrogen` structured generation (`responseSchema`) with deterministic server-side guardrails (`enforceDeterministicGuards`):

1. **Net Surplus Formula:**
   $$\text{Net\_Surplus\_MB} = \text{Daily\_Limit\_MB} - (\text{Current\_Used\_MB} + \text{Predicted\_User\_Usage\_Until\_Reset\_MB} + \text{Safety\_Buffer\_MB})$$
   If $\text{Net\_Surplus\_MB} \le 0$, immediately returns `ABORT_INSUFFICIENT_QUOTA` with an empty manifest.
2. **Hardware Telemetry Gates:**
   - `thermal_state === "CRITICAL"` $\rightarrow$ returns `DEFER_THERMAL_THROTTLE` with an empty manifest.
   - `battery_level < min_battery_percent && !is_charging` $\rightarrow$ caps transfers strictly to `320kbps_audio` digests under `50 MB`.
3. **User Taste & Subscription Filtering:**
   - Excludes every candidate matching `user_preferences.disliked_topics` or `user_preferences.disliked_item_ids`.
   - Prioritizes items matching `user_preferences.languages`, `user_preferences.favorite_genres`, `user_preferences.liked_item_ids`, and source `priority_weight`.
4. **Dynamic Bitrate Downgrading (Knapsack Fit):**
   - Downgrades video tiers (`1080p -> 720p -> 480p -> 320kbps_audio`) so `allocated_mb` fits cleanly within `Net_Surplus_MB` without exceeding it.
5. **Zero-Bloat FIFO Enforcement:**
   - Flags `EXPIRED` (`age_hours >= 48`) or `WATCHED` (when `free_storage_gb < 2.0`) vault items in `purge_queue_ids`.

### Exact Manifest JSON Output Schema
```json
{
  "execution_status": "READY_TO_FETCH | ABORT_INSUFFICIENT_QUOTA | DEFER_THERMAL_THROTTLE",
  "telemetry_summary": {
    "net_surplus_mb": 0,
    "allocated_mb": 0,
    "unallocated_buffer_mb": 0
  },
  "purge_queue_ids": ["string"],
  "download_manifest": [
    {
      "priority_rank": 1,
      "title": "string",
      "source_connector": "RSS_PODCAST | GOOGLE_DRIVE_FOLDER",
      "resolved_url": "string",
      "selected_resolution": "1080p | 720p | 480p | 320kbps_audio",
      "estimated_size_mb": 0,
      "commute_brief_tag": true
    }
  ]
}
```

---

## 6. Backend API Routes (`server.ts`)

| Method & Path | Purpose | Auth / Notes |
| --- | --- | --- |
| `GET /api/health` | Health check | Returns `{ status: "ok", service: "pulsevault-sync-utility" }` |
| `GET /api/drive/folders` | List user's Google Drive folders | Requires `Authorization: Bearer <token>`; returns `401` if missing |
| `GET /api/drive/files?folderId=...&pageToken=...` | Delta-list files inside a Drive folder | Requires `Authorization: Bearer <token>`; returns `files(id, name, mimeType, size, md5Checksum)` and `nextPageToken` |
| `GET /api/drive/media/:fileId` | Proxy Drive media stream with `Range` support | Supports `Authorization` header or `?token=...` for HTML5 `<audio>` / `<video>` |
| `POST /api/rss/parse` | Conditional RSS/Atom XML parser | Sends `If-None-Match` ETag header (`304` handling) and `HEAD` request for `Content-Length` byte resolution |
| `POST /api/manifest/generate` | Run AI + deterministic quota solver | Calls `gemini-4-hydrogen` when `GEMINI_API_KEY` is present; enforces deterministic hardware & taste guards |

---

## 7. Design System ("Precision Telemetry")

- **Canvas & Surfaces:** Light slate canvas (`#F8FAFC`), pure white cards (`#FFFFFF`), `1px` crisp borders (`#E2E8F0`).
- **Color Palette:** Deep Navy text (`#0F172A`), Slate Muted (`#475569`), Telemetry Cyan (`#0284C7`), Emerald (`#10B981`), Alert Crimson (`#EF4444`).
- **Typography:**
  - Display / Headings: `Hanken Grotesk`
  - Body UI: `DM Sans`
  - Telemetry & Numeric Data: `JetBrains Mono` with `tabular-nums` (`font-variant-numeric: tabular-nums`)
- **Layout Discipline:** Fixed `240px` left sidebar on desktop (drawer on mobile), `16px` card radius, inline `·` metadata separators instead of excessive pill badges.

---

## 8. Work Completed Chronology (Up To Now)

1. **Initial Architecture & Design System Setup:**
   - Configured `index.html` (`Hanken Grotesk`, `DM Sans`, `JetBrains Mono`), `src/index.css` (Precision Telemetry design tokens & range slider styles), and `metadata.json`.
   - Built core UI views (`Sidebar`, `QuotaRadarView`, `ConnectorHubView`, `OfflineVaultView`, `AnalyticsView`, `PolicyWizardModal`) and Express + Vite dev server (`server.ts`).
2. **First-Run Personalization & Taste Filtering:**
   - Added `OnboardingFlow.tsx` asking users for languages, favorite genres, disliked/excluded topics, custom feeds, and auto-sync toggle on startup.
   - Updated `server.ts` and `@google/genai` (`gemini-4-hydrogen`) prompt/schema + deterministic filters to exclude dislikes and boost liked items/languages/genres.
3. **Google Play Store Compliance Pivot & SQLite Schema Alignment:**
   - Audited and removed all unauthorized third-party scraping / YouTube / movie-site references across types, seed data, prompts, and UI copy.
   - Refactored schemas to SQLite-compatible structures (`item_id`, `source_id`, `remote_guid`, `total_bytes`, `downloaded_bytes`, `etag_or_page_token`, `md5_checksum`, `local_file_path`, `commute_brief_date`, 7-state lifecycle, `Audio / Lecture / PersonalDrive`).
4. **Real Google Drive OAuth Provisioning & Integration:**
   - Installed `firebase` and `@google/genai@^3.3.0`.
   - Provisioned Google OAuth client (`core-outcome-429014-s9`, scope `https://www.googleapis.com/auth/drive.readonly`) and generated `firebase-applet-config.json`.
   - Created `src/lib/firebaseDriveAuth.ts` (in-memory token cache — never persisted to `localStorage`) and `src/components/GoogleSignInButton.tsx`.
   - Implemented Drive REST v3 proxy routes in `server.ts` and folder/file picker + Drive media playback in `OnboardingFlow`, `ConnectorHubView`, and `OfflineVaultView`.
5. **Resilient Sync Pipeline & Interrupt Simulation:**
   - Upgraded `App.tsx` and `QuotaRadarView.tsx` with 2 MB byte-checkpoint commits, a 5-stage pipeline indicator, and a **Simulate Foreground Traffic Spike (`PAUSED_INTERRUPT`)** toggle alongside thermal/battery/storage scenario presets.
6. **Verification & Server Restart:**
   - Ran `npm run build` (`compile_applet`) and `tsc --noEmit` (`lint_applet`) — both passed with zero errors.
   - Restarted the Express + Vite server on port `3000` and verified `/api/health`, `/api/drive/folders` (`401` unauthenticated guard), `/api/rss/parse` URL validation, and `/api/manifest/generate` deterministic deferral/abort gates (`DEFER_THERMAL_THROTTLE`, `ABORT_INSUFFICIENT_QUOTA`).

---

## 9. Environment & Run Commands

### Environment Variables (`.env.example`)
- `GEMINI_API_KEY`: Required server-side for `gemini-4-hydrogen` manifest curation.
- `APP_URL`: Runtime Cloud Run / hosting URL.

### Useful Scripts (`package.json`)
```bash
npm run dev      # Start Express + Vite dev server on port 3000 (tsx server.ts)
npm run lint     # TypeScript typecheck (tsc --noEmit)
npm run build    # Build production frontend bundle to dist/ (vite build)
npm run start    # Start production Express server (tsx server.ts)
```

---

## 10. Recommended Future Enhancements (If Porting to Native Android / Production)
1. **Persistent Server/Client Database:** Wire the SQLite (`Room`/`Drift`) schema or Firestore persistence for multi-device `sync_sources` and `daily_rescue_ledger` history.
2. **Android Foreground Service + WorkManager:** Port the 2 MB HTTP `Range` chunked downloader (`FETCHING -> PAUSED_INTERRUPT`) to Android `WorkManager` with `NetworkType.CONNECTED` and `StorageNotLow` constraints.
3. **Real Local Media Encryption & AES-256 Sandbox:** Store downloaded RSS/Drive blobs in app-private storage (`Context.getFilesDir()`) with automated `PeriodicWorkRequest` FIFO cleanup at 48h TTL.
