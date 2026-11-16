import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AuthorizedSource,
  CandidateMediaItem,
  DownloadManifestItem,
  LocalVaultItem,
  ManifestResponse,
  TelemetryConfig,
  UserPreferences,
} from './src/types/pulsevault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const SYSTEM_INSTRUCTION = `You are the Autonomous Bandwidth Allocation & Personal Media Sync Engine running on a user's mobile device. Your objective is to prevent daily cellular data wastage by calculating net surplus bandwidth prior to the carrier's midnight reset and generating an optimized, deterministic sync manifest strictly from authorized open RSS/Atom podcast feeds and user-owned Google Drive folders.

Operational Rules & Constraints:
1. Quota Calculation: Compute Net_Surplus_MB = Daily_Limit_MB - (Current_Used_MB + Predicted_User_Usage_Until_Reset_MB + Safety_Buffer_MB). If Net_Surplus_MB <= 0, return an empty manifest with status "ABORT_INSUFFICIENT_QUOTA".
2. Device Telemetry Gate: Check battery_level and thermal_state. If battery_level < 20% and is_charging == false, restrict downloads strictly to audio/light digests under 50 MB total using "320kbps_audio". If thermal_state == "CRITICAL", output "DEFER_THERMAL_THROTTLE" with an empty download_manifest.
3. User Taste & Subscription Filtering (Likes, Dislikes, Languages, Genres):
   - NEVER include any item matching user_preferences.disliked_topics or user_preferences.disliked_item_ids.
   - Strongly prioritize items matching user_preferences.languages, user_preferences.favorite_genres, user_preferences.liked_item_ids, and higher source priority_weight (1-100).
4. Knapsack Quota Solver & Dynamic Bitrate: Allocate Net_Surplus_MB according to category_weights (Audio, Lecture, PersonalDrive) and connected enabled authorized_sources. Dynamically downgrade video resolution (1080p -> 720p -> 480p) so total manifest size fits within 95%–100% of Net_Surplus_MB without exceeding it (unless battery-restricted under 50 MB).
5. Zero-Bloat FIFO Enforcement: Flag EXPIRED or WATCHED files in local_vault_index in purge_queue_ids if available device storage drops below 2.0 GB (or if state == 'EXPIRED' or age_hours >= 48).
6. Output Format: Respond exclusively in valid JSON matching the schema. Use exact resolved_url, title, and source_connector ("RSS_PODCAST" | "GOOGLE_DRIVE_FOLDER") from the candidate pool.`;

function computePurgeQueue(vault: LocalVaultItem[], freeStorageGb: number): string[] {
  const needsStorageReclaim = freeStorageGb < 2.0;
  return vault
    .filter((item) => {
      if (item.state === 'EXPIRED' || item.age_hours >= 48) return true;
      if (needsStorageReclaim && item.state === 'WATCHED') return true;
      return false;
    })
    .map((item) => item.item_id);
}

function isCandidateDisliked(
  item: CandidateMediaItem,
  prefs?: UserPreferences
): boolean {
  if (!prefs) return false;
  if (prefs.disliked_item_ids.includes(item.item_id)) return true;
  const dislikedLower = prefs.disliked_topics.map((d) => d.toLowerCase());
  const itemText = `${item.genre} ${item.tags.join(' ')} ${item.title} ${item.summary}`.toLowerCase();
  return dislikedLower.some((topic) => itemText.includes(topic));
}

function enforceDeterministicGuards(
  raw: ManifestResponse,
  telemetry: TelemetryConfig,
  netSurplusMb: number,
  purgeIds: string[],
  candidates: CandidateMediaItem[],
  enabledSourceIds: Set<string>,
  userPrefs?: UserPreferences
): { manifest: ManifestResponse; notes: string[]; agentReasoning: string[] } {
  const notes: string[] = [];
  const agentReasoning: string[] = [];
  const lowBatteryRestricted =
    telemetry.battery_level < telemetry.min_battery_percent && !telemetry.is_charging;

  if (telemetry.thermal_state === 'CRITICAL') {
    notes.push('Thermal gate CRITICAL triggered DEFER_THERMAL_THROTTLE.');
    return {
      manifest: {
        execution_status: 'DEFER_THERMAL_THROTTLE',
        telemetry_summary: {
          net_surplus_mb: Math.max(0, netSurplusMb),
          allocated_mb: 0,
          unallocated_buffer_mb: Math.max(0, netSurplusMb),
        },
        purge_queue_ids: purgeIds,
        download_manifest: [],
      },
      notes,
      agentReasoning: ['Transfers deferred due to critical thermal envelope.'],
    };
  }

  if (netSurplusMb <= 0) {
    notes.push('Net surplus <= 0 MB triggered ABORT_INSUFFICIENT_QUOTA.');
    return {
      manifest: {
        execution_status: 'ABORT_INSUFFICIENT_QUOTA',
        telemetry_summary: {
          net_surplus_mb: netSurplusMb,
          allocated_mb: 0,
          unallocated_buffer_mb: 0,
        },
        purge_queue_ids: purgeIds,
        download_manifest: [],
      },
      notes,
      agentReasoning: ['Insufficient surplus data before reset; no items scheduled.'],
    };
  }

  const candidateByUrl = new Map(candidates.map((c) => [c.download_url, c]));
  const maxAllowedMb = lowBatteryRestricted ? Math.min(50, netSurplusMb) : netSurplusMb;
  if (lowBatteryRestricted) {
    notes.push(
      `Battery < ${telemetry.min_battery_percent}% unplugged: capped sync at 50 MB audio digests.`
    );
  }

  const excludedByDislikeCount = candidates.filter((c) =>
    isCandidateDisliked(c, userPrefs)
  ).length;
  if (excludedByDislikeCount > 0 && userPrefs) {
    agentReasoning.push(
      `Excluded ${excludedByDislikeCount} item(s) matching your dislikes (${
        userPrefs.disliked_topics.join(', ') || 'explicit dislikes'
      }).`
    );
  }

  const validatedItems: DownloadManifestItem[] = [];
  let runningMb = 0;

  for (const item of raw.download_manifest || []) {
    const matched = candidateByUrl.get(item.resolved_url);
    if (matched && !enabledSourceIds.has(matched.source_id)) {
      continue;
    }
    if (matched && isCandidateDisliked(matched, userPrefs)) {
      continue;
    }

    let resolution = item.selected_resolution;
    let sizeMb = Number(item.estimated_size_mb) || 0;

    if (lowBatteryRestricted) {
      resolution = '320kbps_audio';
      sizeMb = matched ? matched.size_audio_mb : Math.min(sizeMb, 45);
      if (sizeMb > 50) continue;
    } else if (matched) {
      if (resolution === '1080p' && matched.size_1080p_mb) {
        sizeMb = matched.size_1080p_mb;
      } else if (resolution === '720p' && matched.size_720p_mb) {
        sizeMb = matched.size_720p_mb;
      } else if (resolution === '480p' && matched.size_480p_mb) {
        sizeMb = matched.size_480p_mb;
      } else {
        resolution = '320kbps_audio';
        sizeMb = matched.size_audio_mb;
      }

      if (runningMb + sizeMb > maxAllowedMb) {
        if (matched.size_720p_mb && runningMb + matched.size_720p_mb <= maxAllowedMb) {
          resolution = '720p';
          sizeMb = matched.size_720p_mb;
          notes.push(`Downgraded "${matched.title}" to 720p to fit remaining surplus.`);
        } else if (matched.size_480p_mb && runningMb + matched.size_480p_mb <= maxAllowedMb) {
          resolution = '480p';
          sizeMb = matched.size_480p_mb;
          notes.push(`Downgraded "${matched.title}" to 480p to fit remaining surplus.`);
        } else if (runningMb + matched.size_audio_mb <= maxAllowedMb) {
          resolution = '320kbps_audio';
          sizeMb = matched.size_audio_mb;
          notes.push(`Downgraded "${matched.title}" to 320kbps_audio to fit quota.`);
        } else {
          continue;
        }
      }
    }

    if (sizeMb > 0 && runningMb + sizeMb <= maxAllowedMb) {
      runningMb += sizeMb;
      const finalRank = validatedItems.length + 1;
      validatedItems.push({
        priority_rank: finalRank,
        title: matched ? matched.title : item.title,
        source_connector: matched ? matched.provider_type : item.source_connector,
        resolved_url: matched ? matched.download_url : item.resolved_url,
        selected_resolution: resolution,
        estimated_size_mb: Math.round(sizeMb),
        commute_brief_tag: Boolean(item.commute_brief_tag),
      });

      if (matched) {
        const langMatch = userPrefs?.languages.includes(matched.language);
        const genreMatch = userPrefs?.favorite_genres.includes(matched.genre);
        const likedMatch = userPrefs?.liked_item_ids.includes(matched.item_id);
        const reasons: string[] = [];
        if (likedMatch) reasons.push('explicitly liked');
        if (langMatch) reasons.push(`${matched.language} match`);
        if (genreMatch) reasons.push(`${matched.genre}`);
        if (matched.provider_type === 'GOOGLE_DRIVE_FOLDER') reasons.push('personal Drive');
        agentReasoning.push(
          `#${finalRank} "${matched.title}" (${resolution}, ${Math.round(sizeMb)} MB) — ${
            reasons.length > 0 ? reasons.join(', ') : `knapsack ${matched.category} fit`
          }.`
        );
      }
    }
  }

  const mergedPurgeIds = Array.from(
    new Set([...purgeIds, ...(Array.isArray(raw.purge_queue_ids) ? raw.purge_queue_ids : [])])
  );

  if (mergedPurgeIds.length > 0 && telemetry.free_storage_gb < 2.0) {
    notes.push(`Storage < 2.0 GB: flagged ${mergedPurgeIds.length} vault item(s) for FIFO purge.`);
  }

  return {
    manifest: {
      execution_status: 'READY_TO_FETCH',
      telemetry_summary: {
        net_surplus_mb: netSurplusMb,
        allocated_mb: Math.round(runningMb),
        unallocated_buffer_mb: Math.max(0, Math.round(netSurplusMb - runningMb)),
      },
      purge_queue_ids: mergedPurgeIds,
      download_manifest: validatedItems,
    },
    notes,
    agentReasoning,
  };
}

function extractXmlTag(block: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = block.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  const stdRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const stdMatch = block.match(stdRegex);
  return stdMatch ? stdMatch[1].replace(/<[^>]+>/g, '').trim() : '';
}

async function resolveHeadContentLength(url: string): Promise<number> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3500);
    const headRes = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(t);
    const len = headRes.headers.get('content-length');
    return len ? Number(len) || 0 : 0;
  } catch {
    return 0;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'pulsevault-sync-utility' });
  });

  // Google Drive REST v3 — List user folders (requires Bearer token from Firebase Auth)
  app.get('/api/drive/folders', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Google Drive Bearer access token.' });
      return;
    }

    try {
      const params = new URLSearchParams({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name, modifiedTime)',
        pageSize: '25',
        orderBy: 'modifiedTime desc',
      });
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        {
          headers: { Authorization: authHeader },
        }
      );
      const data = await driveRes.json();
      if (!driveRes.ok) {
        res
          .status(driveRes.status)
          .json({ error: data.error?.message || 'Google Drive folders query failed.' });
        return;
      }
      res.json({ folders: data.files || [] });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach Google Drive REST v3.',
      });
    }
  });

  // Google Drive REST v3 — Delta query files inside selected folder
  app.get('/api/drive/files', async (req, res) => {
    const authHeader = req.headers.authorization;
    const folderId = String(req.query.folderId || '').trim();
    const pageToken = String(req.query.pageToken || '').trim();

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Google Drive Bearer access token.' });
      return;
    }
    if (!folderId) {
      res.status(400).json({ error: 'folderId query parameter is required.' });
      return;
    }

    try {
      const sanitizedFolderId = folderId.replace(/'/g, "\\'");
      const params = new URLSearchParams({
        q: `'${sanitizedFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum)',
        pageSize: '20',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        {
          headers: { Authorization: authHeader },
        }
      );
      const data = await driveRes.json();
      if (!driveRes.ok) {
        res
          .status(driveRes.status)
          .json({ error: data.error?.message || 'Google Drive files.list failed.' });
        return;
      }
      res.json({
        files: data.files || [],
        nextPageToken: data.nextPageToken || '',
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach Google Drive REST v3.',
      });
    }
  });

  // Authenticated Google Drive media stream proxy supporting HTTP Range headers
  app.get('/api/drive/media/:fileId', async (req, res) => {
    const authHeader =
      req.headers.authorization ||
      (typeof req.query.token === 'string' ? `Bearer ${req.query.token}` : '');
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Google Drive Bearer token.' });
      return;
    }

    const fileId = req.params.fileId;
    try {
      const headers: Record<string, string> = { Authorization: authHeader };
      if (req.headers.range) {
        headers.Range = req.headers.range;
      }
      const upstream = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers }
      );
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (ct) res.setHeader('Content-Type', ct);
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Accept-Ranges', 'bytes');

      if (!upstream.body) {
        res.end();
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Drive media fetch failed.',
      });
    }
  });

  // Conditional RSS / Atom XML Podcast & Open Media Parser with HEAD Content-Length validation
  app.post('/api/rss/parse', async (req, res) => {
    try {
      const { url, sourceId, sourceName, category, language, genre, etag } =
        req.body as {
          url: string;
          sourceId?: string;
          sourceName?: string;
          category?: 'Audio' | 'Lecture' | 'PersonalDrive';
          language?: string;
          genre?: string;
          etag?: string;
        };

      if (!url || !/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: 'Please provide a valid http:// or https:// RSS or Atom feed URL.' });
        return;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'PulseVault-RSS-Sync/1.0',
      };
      if (etag) headers['If-None-Match'] = etag;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const upstream = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

      if (upstream.status === 304) {
        res.json({ items: [], etag, not_modified: true, feed_title: sourceName || url });
        return;
      }

      if (!upstream.ok) {
        res.status(502).json({ error: `Feed endpoint returned HTTP ${upstream.status}.` });
        return;
      }

      const nextEtag = upstream.headers.get('etag') || `W/"${Date.now()}"`;
      const xml = await upstream.text();
      const itemBlocks =
        xml.match(/<item\b[\s\S]*?<\/item>/gi) ||
        xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ||
        [];

      if (itemBlocks.length === 0) {
        res.status(422).json({ error: 'No <item> or <entry> media elements found in this XML feed.' });
        return;
      }

      const resolvedCategory = category || 'Audio';
      const resolvedGenre = genre || 'Tech & Systems Podcasts';
      const resolvedLang = language || 'English';

      const items: CandidateMediaItem[] = [];
      for (let index = 0; index < Math.min(6, itemBlocks.length); index++) {
        const block = itemBlocks[index];
        const title = extractXmlTag(block, 'title') || `Feed Episode ${index + 1}`;
        const guid = extractXmlTag(block, 'guid') || extractXmlTag(block, 'id') || `guid_${index}`;
        const linkTag = extractXmlTag(block, 'link');
        const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
        const lengthMatch = block.match(/<enclosure[^>]+length=["'](\d+)["']/i);
        const typeMatch = block.match(/<enclosure[^>]+type=["']([^"']+)["']/i);
        const pubDate =
          extractXmlTag(block, 'pubDate') ||
          extractXmlTag(block, 'updated') ||
          new Date().toISOString();
        const desc =
          extractXmlTag(block, 'description') ||
          extractXmlTag(block, 'summary') ||
          'Synchronized from open RSS/Atom XML enclosure.';

        const resolvedUrl = enclosureMatch?.[1] || linkTag || hrefMatch?.[1] || url;
        const mimeType = typeMatch?.[1] || (resolvedCategory === 'Audio' ? 'audio/mpeg' : 'video/mp4');

        let rawBytes = lengthMatch ? Number(lengthMatch[1]) : 0;
        if (rawBytes <= 0 && enclosureMatch?.[1]) {
          rawBytes = await resolveHeadContentLength(enclosureMatch[1]);
        }

        const baseMb =
          rawBytes > 100000
            ? Math.max(8, Math.round(rawBytes / (1024 * 1024)))
            : resolvedCategory === 'Audio'
              ? 28
              : 240;

        items.push({
          item_id: `rss_${Date.now()}_${index}`,
          source_id: sourceId || `src_rss_${Date.now()}`,
          remote_guid: guid,
          title: title.slice(0, 110),
          provider_type: 'RSS_PODCAST',
          source_title: sourceName || new URL(url).hostname,
          category: resolvedCategory,
          mime_type: mimeType,
          language: resolvedLang,
          genre: resolvedGenre,
          tags: [resolvedGenre, resolvedLang],
          download_url: resolvedUrl,
          duration_min: Math.max(8, Math.round(baseMb / (resolvedCategory === 'Audio' ? 1.5 : 9))),
          total_bytes: rawBytes > 0 ? rawBytes : baseMb * 1024 * 1024,
          size_1080p_mb: mimeType.startsWith('audio/') ? null : Math.round(baseMb * 1.6),
          size_720p_mb: mimeType.startsWith('audio/') ? null : baseMb,
          size_480p_mb: mimeType.startsWith('audio/') ? null : Math.round(baseMb * 0.58),
          size_audio_mb:
            mimeType.startsWith('audio/') ? baseMb : Math.max(16, Math.round(baseMb * 0.12)),
          commute_brief_eligible: true,
          published_at: pubDate,
          summary: desc.slice(0, 140),
        });
      }

      res.json({
        items,
        etag: nextEtag,
        not_modified: false,
        feed_title: extractXmlTag(xml, 'title') || new URL(url).hostname,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch or parse RSS feed.';
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/manifest/generate', async (req, res) => {
    try {
      const {
        telemetry,
        authorized_sources,
        candidate_pool,
        local_vault_index,
        user_preferences,
      } = req.body as {
        telemetry: TelemetryConfig;
        authorized_sources: AuthorizedSource[];
        candidate_pool: CandidateMediaItem[];
        local_vault_index: LocalVaultItem[];
        user_preferences?: UserPreferences;
      };

      if (!telemetry || !Array.isArray(candidate_pool) || !Array.isArray(local_vault_index)) {
        res.status(400).json({ error: 'Invalid telemetry or candidate payload.' });
        return;
      }

      const netSurplusMb =
        telemetry.daily_limit_mb -
        (telemetry.current_used_mb +
          telemetry.predicted_usage_until_reset_mb +
          telemetry.safety_buffer_mb);

      const purgeIds = computePurgeQueue(local_vault_index, telemetry.free_storage_gb);
      const enabledSources = (authorized_sources || []).filter((s) => s.is_enabled);
      const enabledIds = new Set(enabledSources.map((s) => s.source_id));
      const activeCandidates = candidate_pool.filter((c) => enabledIds.has(c.source_id));

      if (telemetry.thermal_state === 'CRITICAL') {
        res.json({
          manifest: {
            execution_status: 'DEFER_THERMAL_THROTTLE',
            telemetry_summary: {
              net_surplus_mb: Math.max(0, netSurplusMb),
              allocated_mb: 0,
              unallocated_buffer_mb: Math.max(0, netSurplusMb),
            },
            purge_queue_ids: purgeIds,
            download_manifest: [],
          },
          engine_source: 'deterministic-gate',
          evaluated_at: new Date().toISOString(),
          notes: ['Thermal gate CRITICAL: background sync deferred until device cools.'],
          agent_reasoning: ['Thermal safety gate paused AI curation until device cools.'],
        });
        return;
      }

      if (netSurplusMb <= 0) {
        res.json({
          manifest: {
            execution_status: 'ABORT_INSUFFICIENT_QUOTA',
            telemetry_summary: {
              net_surplus_mb: netSurplusMb,
              allocated_mb: 0,
              unallocated_buffer_mb: 0,
            },
            purge_queue_ids: purgeIds,
            download_manifest: [],
          },
          engine_source: 'deterministic-gate',
          evaluated_at: new Date().toISOString(),
          notes: [`Net surplus is ${netSurplusMb} MB (<= 0 MB). Quota gate aborted sync.`],
          agent_reasoning: ['Net surplus is exhausted; zero items scheduled.'],
        });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to run the Gemini sync solver.',
        });
        return;
      }

      const eligibleCandidates = activeCandidates.filter(
        (c) => !isCandidateDisliked(c, user_preferences)
      );

      const evaluationPrompt = JSON.stringify(
        {
          telemetry: {
            daily_limit_mb: telemetry.daily_limit_mb,
            current_used_mb: telemetry.current_used_mb,
            predicted_user_usage_until_reset_mb: telemetry.predicted_usage_until_reset_mb,
            safety_buffer_mb: telemetry.safety_buffer_mb,
            computed_net_surplus_mb: netSurplusMb,
            battery_level: telemetry.battery_level,
            is_charging: telemetry.is_charging,
            thermal_state: telemetry.thermal_state,
            available_storage_gb: telemetry.free_storage_gb,
            category_weights: telemetry.category_weights,
          },
          user_preferences: user_preferences
            ? {
                favorite_languages: user_preferences.languages,
                favorite_genres: user_preferences.favorite_genres,
                disliked_topics: user_preferences.disliked_topics,
                explicitly_liked_ids: user_preferences.liked_item_ids,
                explicitly_disliked_ids: user_preferences.disliked_item_ids,
                custom_interests_note: user_preferences.custom_interests_note,
              }
            : null,
          authorized_sources: enabledSources.map((s) => ({
            source_id: s.source_id,
            title: s.title,
            provider_type: s.provider_type,
            priority_weight: s.priority_weight,
            category: s.category,
            language: s.language,
            genre: s.genre,
          })),
          local_vault_index: local_vault_index.map((v) => ({
            item_id: v.item_id,
            title: v.title,
            state: v.state,
            age_hours: v.age_hours,
            size_mb: v.size_mb,
          })),
          candidate_media_pool: eligibleCandidates.map((c) => ({
            item_id: c.item_id,
            title: c.title,
            source_connector: c.provider_type,
            category: c.category,
            mime_type: c.mime_type,
            language: c.language,
            genre: c.genre,
            tags: c.tags,
            explicitly_liked: user_preferences?.liked_item_ids.includes(c.item_id) ?? false,
            resolved_url: c.download_url,
            commute_brief_eligible: c.commute_brief_eligible,
            size_options_mb: {
              '1080p': c.size_1080p_mb,
              '720p': c.size_720p_mb,
              '480p': c.size_480p_mb,
              '320kbps_audio': c.size_audio_mb,
            },
          })),
        },
        null,
        2
      );

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze the user's favorite languages, genres, likes, dislikes, priority_weight of connected RSS podcasts and Google Drive folders, device telemetry, and candidate pool. Curate and rank the optimal download manifest:\n\n${evaluationPrompt}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              execution_status: {
                type: Type.STRING,
                enum: [
                  'READY_TO_FETCH',
                  'ABORT_INSUFFICIENT_QUOTA',
                  'DEFER_THERMAL_THROTTLE',
                ],
              },
              telemetry_summary: {
                type: Type.OBJECT,
                properties: {
                  net_surplus_mb: { type: Type.NUMBER },
                  allocated_mb: { type: Type.NUMBER },
                  unallocated_buffer_mb: { type: Type.NUMBER },
                },
                required: ['net_surplus_mb', 'allocated_mb', 'unallocated_buffer_mb'],
              },
              purge_queue_ids: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              download_manifest: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    priority_rank: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    source_connector: {
                      type: Type.STRING,
                      enum: ['RSS_PODCAST', 'GOOGLE_DRIVE_FOLDER'],
                    },
                    resolved_url: { type: Type.STRING },
                    selected_resolution: {
                      type: Type.STRING,
                      enum: ['1080p', '720p', '480p', '320kbps_audio'],
                    },
                    estimated_size_mb: { type: Type.NUMBER },
                    commute_brief_tag: { type: Type.BOOLEAN },
                  },
                  required: [
                    'priority_rank',
                    'title',
                    'source_connector',
                    'resolved_url',
                    'selected_resolution',
                    'estimated_size_mb',
                    'commute_brief_tag',
                  ],
                },
              },
            },
            required: [
              'execution_status',
              'telemetry_summary',
              'purge_queue_ids',
              'download_manifest',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini engine returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText) as ManifestResponse;
      const { manifest, notes, agentReasoning } = enforceDeterministicGuards(
        parsed,
        telemetry,
        netSurplusMb,
        purgeIds,
        activeCandidates,
        enabledIds,
        user_preferences
      );

      res.json({
        manifest,
        engine_source: 'gemini-4-hydrogen',
        evaluated_at: new Date().toISOString(),
        notes:
          notes.length > 0
            ? notes
            : [
                `Allocated ${manifest.telemetry_summary.allocated_mb} MB of ${manifest.telemetry_summary.net_surplus_mb} MB (${Math.round(
                  (manifest.telemetry_summary.allocated_mb /
                    Math.max(1, manifest.telemetry_summary.net_surplus_mb)) *
                    100
                )}% quota efficiency).`,
              ],
        agent_reasoning: agentReasoning,
      });
    } catch (err: unknown) {
      console.error('Manifest generation error:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to generate autonomous sync manifest.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseVault server listening on http://localhost:${PORT}`);
  });
}

startServer();
