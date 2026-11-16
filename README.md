# PulseVault — Autonomous Bandwidth Rescue & Personal Media Sync Utility

**Turn expiring daily mobile data into an offline Morning Commute Brief—automatically.**

---

## The Core Idea

Across many mobile carrier plans (such as daily 1.5 GB – 2.5 GB cellular caps), **unused daily data expires at midnight** and disappears permanently. At the same time, commuters, students, and travelers spend hours on trains, buses, and flights dealing with buffering, dead zones, or battery drain.

**PulseVault** solves both problems without wasting a single megabyte or risking overage charges:

1. **Predicts & Measures Expiring Surplus:** Just before the carrier's midnight reset window (e.g., 90 minutes prior), PulseVault calculates how much daily data would otherwise go unused while reserving a strict safety buffer for late-night messaging or calls.
2. **Checks Device Health First:** Before transferring a single byte, it verifies battery level, charging state, thermal envelope, foreground network contention, and local disk headroom.
3. **Curates Based on Your Tastes & Languages:** During first-run setup, you choose your preferred **languages**, **favorite topics/genres**, **disliked/excluded subjects**, and connect your own **RSS/Atom podcasts, OpenCourseWare feeds, or personal Google Drive folders**. An AI curation agent (`gemini-4-hydrogen`) + deterministic knapsack solver selects and ranks media tailored to you.
4. **Fits Bandwidth Precisely via Dynamic Bitrate Scaling:** Automatically downgrades video tiers (`1080p → 720p → 480p → 320kbps_audio`) so the manifest uses **95%–100% of net surplus** without exceeding your daily cap.
5. **Stages Your 06:00 AM Morning Commute Brief:** Downloaded audio briefings, lectures, and personal Drive media are verified (MD5/byte integrity) and grouped into a zero-signal offline playlist ready by morning—with automatic 48-hour FIFO cleanup so local storage never bloats.

---

## Play Store–Compliant Open Architecture

PulseVault is designed strictly as an **Automated Bandwidth & Personal Media Sync Utility** built on open protocols and user-owned storage—with **zero third-party stream scraping or DRM circumvention**:

- **`RSS_PODCAST` (Open Protocols):** Standard RSS 2.0 / Atom XML podcast feeds, university OpenCourseWare (e.g., MIT OCW, NPTEL), and Public Domain / Creative Commons archives (Internet Archive, Blender Open Movies) using conditional HTTP `If-None-Match` (ETag) polling and `HEAD` `Content-Length` byte resolution.
- **`GOOGLE_DRIVE_FOLDER` (User-Owned Cloud Storage):** Scoped OAuth2 (`https://www.googleapis.com/auth/drive.readonly`) via Firebase Auth and Google Drive REST v3 (`files.list` delta sync + HTTP `Range`-capable media streaming).

---

## How the Autonomous Allocation Engine Works

Every manifest evaluation (`POST /api/manifest/generate`) enforces deterministic hardware and quota guardrails alongside Gemini-powered taste ranking:

### 1. Net Surplus Calculation
```text
Net_Surplus_MB = Daily_Limit_MB - (Current_Used_MB + Predicted_User_Usage_Until_Reset_MB + Safety_Buffer_MB)
```
- If `Net_Surplus_MB <= 0` → **`ABORT_INSUFFICIENT_QUOTA`** (empty manifest, zero cellular spend).

### 2. Device Telemetry Gates
- **Thermal Gate:** If `thermal_state == "CRITICAL"` → **`DEFER_THERMAL_THROTTLE`** (pauses transfers immediately until device cools).
- **Battery Gate:** If `battery_level < min_battery_percent` (default `20%`) and `is_charging == false` → restricts downloads strictly to **`320kbps_audio` digests under 50 MB**.
- **Foreground Contention Guard:** Simulates/detects foreground traffic spikes and suspends active transfers into **`PAUSED_INTERRUPT`** at exact **2 MB byte checkpoints**.

### 3. Zero-Bloat FIFO Storage Policy
- Tracks downloaded files with a 48-hour retention ceiling and a **2.0 GB free disk floor**.
- When free storage drops below `2.0 GB`, `WATCHED` and `EXPIRED` items are automatically flagged in `purge_queue_ids` for one-click or automated FIFO cleanup.

### 4. Resilient 7-State Sync Lifecycle
```text
DISCOVERED → QUOTA_APPROVED → FETCHING ⇄ PAUSED_INTERRUPT → COMPLETED → WATCHED → EXPIRED
```

---

## Key Application Screens

| Screen | What It Does |
| --- | --- |
| **First-Run Onboarding** | Collects preferred languages, favorite genres, excluded topics, open RSS/Drive sources, daily carrier cap, and user-ownership acknowledgment. |
| **Quota Radar** | Live quota formula visualization, telemetry sliders, one-click hardware scenario presets, foreground spike simulator, deterministic JSON schema inspector, 5-stage pipeline tracker, and 2 MB chunked job queue. |
| **Connector Hub** | Connect personal Google Drive folders via Google Sign-In, poll RSS/Atom feeds with ETag caching, manage source `priority_weight` (1–100), adjust category weights (`Audio / Lecture / PersonalDrive`), and like/dislike candidate items. |
| **Offline Vault** | Features the **06:00 AM Morning Commute Brief** offline player (with authenticated Drive `<audio>`/`<video>` streaming when signed in), local sandbox paths, MD5 checksum badges, `+24h` age simulation, and FIFO purge controls. |
| **Analytics** | Data-to-Value KPIs (GB rescued, estimated carrier currency saved, playback hours banked), interactive 14-day rescue ledger bar chart, category balance, and manifest execution audit log. |

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons
- **Backend:** Node.js + Express (`server.ts` / `esbuild` production bundle)
- **AI Engine:** `@google/genai` (`gemini-4-hydrogen` with structured JSON `responseSchema`)
- **Cloud Auth & Files:** Firebase Auth + Google Drive REST API v3
- **Containers & CI/CD:** Multi-stage `Dockerfile` + GitHub Actions (`.github/workflows/deploy.yml`)

---

## Quick Start (Local & Docker)

### 1. Run Locally (Development)
```bash
npm install
cp .env.example .env
# Add your GEMINI_API_KEY in .env
npm run dev
```
Open `http://localhost:3000`.

### 2. Run with Docker (Production Full-Stack)
```bash
docker build -t pulsevault:local .
docker run --rm -p 3000:3000 -e GEMINI_API_KEY="your_api_key_here" pulsevault:local
```

> **Note on Google Drive OAuth:** To enable live Google Sign-In and Drive folder browsing in your own deployment, populate `apiKey` and `oAuthClientId` in `firebase-applet-config.json` from your Firebase Web App & OAuth client settings.

---

## Documentation & Deployment Guides

- **[`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md)** — Full engineering specification, SQLite-aligned schemas, API contracts, and build chronology.
- **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** — Step-by-step instructions for pushing to GitHub, viewing the **GitHub Actions** pipeline, pulling from **GitHub Container Registry (`ghcr.io`)**, and viewing **GitHub Pages / Cloud Run** deployments.
