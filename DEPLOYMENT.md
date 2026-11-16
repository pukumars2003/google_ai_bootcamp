# PulseVault — Docker & GitHub Actions Deployment Guide

This repository includes a production multi-stage `Dockerfile` and an automated GitHub Actions pipeline (`.github/workflows/deploy.yml`) so you can inspect builds, container images, and live deployments directly inside GitHub.

---

## 1. What Happens Automatically When You Push to GitHub

Once you push this repository to `main` (or `master`) on GitHub, `.github/workflows/deploy.yml` runs three stages:

1. **`ci-and-docker` (Lint, Build, Smoke Test & Push Container)**
   - Runs `npm run lint` (`tsc --noEmit`), `npm run build` (`vite build`), and `npm run build:server` (`esbuild` server bundle).
   - Builds the production `Dockerfile`, boots a temporary container, and verifies `http://127.0.0.1:3000/api/health`.
   - Publishes the container image to **GitHub Container Registry (GHCR)** at:
     `ghcr.io/<your-github-username>/<your-repo>:latest`
     using GitHub's built-in `GITHUB_TOKEN` (no extra secrets required).

2. **`deploy-github-pages` (Visible in GitHub Deployments & Pages)**
   - Publishes the compiled Vite frontend to **GitHub Pages** under the `github-pages` environment so a live clickable **Deployment** appears directly in your GitHub repository sidebar.
   - *Note:* GitHub Pages hosts static frontend files only. Full-stack endpoints (`/api/manifest/generate`, `/api/rss/parse`, `/api/drive/*`) require running the Express backend via the Docker container (locally, on Cloud Run, or on any container host).

3. **`deploy-cloud-run` (Optional Full-Stack Container Deploy)**
   - Runs automatically if you configure repository variables (`GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`) and secret (`GEMINI_API_KEY`) in **Settings → Secrets and variables → Actions**.

---

## 2. How to Push This Project to Your GitHub Repository

This AI Studio workspace is not currently linked to a GitHub remote. To push it and watch the workflow execute in GitHub:

```bash
git init
git add .
git commit -m "Add PulseVault app, Dockerfile, and GitHub Actions deployment"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```

### Enable GitHub Actions Permissions (One-Time Repo Check)
In your GitHub repository:
1. Open **Settings → Actions → General → Workflow permissions**, select **Read and write permissions**, and save.
2. Open **Settings → Pages → Build and deployment → Source** and ensure **GitHub Actions** is selected (the workflow also passes `enablement: true` to configure it automatically when permitted).

### Where to See the Deployments in GitHub
- **Workflow Logs:** Repository **Actions** tab → `Build, Containerize & Deploy PulseVault`
- **Published Docker Image:** Repository **Packages** tab (or right sidebar)
- **Live Deployment Link:** Repository right sidebar → **Deployments** (`github-pages` and, if configured, `production`)

---

## 3. Running the Docker Container Locally

Build and run the full-stack app (Frontend + Express API + Gemini + Google Drive proxy) locally with Docker:

```bash
docker build -t pulsevault:local .
docker run --rm -p 3000:3000 -e GEMINI_API_KEY="your_api_key_here" pulsevault:local
```

Or pull the published image from GitHub Container Registry:

```bash
docker pull ghcr.io/<YOUR_USERNAME>/<YOUR_REPO>:latest
docker run --rm -p 3000:3000 -e GEMINI_API_KEY="your_api_key_here" ghcr.io/<YOUR_USERNAME>/<YOUR_REPO>:latest
```

Then open `http://localhost:3000`.
