---
title: MovieBox Frontend
emoji: 🎬
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# MovieBox

A movie / TV / animation streaming front end: one Node + Express server that serves the
web UI **and** acts as the proxy in front of everything the player needs.

The browser only ever talks to this server. Catalog, search, detail and stream
resolution come from the companion [`moviebox-api`](https://github.com/SagorT3K/moviebox-api)
service, poster art and metadata come from TMDB, and the video itself is proxied —
and, when a browser can't play the source format, transcoded on the fly — right here.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](Dockerfile)
[![Fly.io](https://img.shields.io/badge/Fly.io-live-8B5CF6?style=flat-square)](https://hdmoviebox.fly.dev)

Live: <https://hdmoviebox.fly.dev> · Catalog API: <https://moviebox-api-steel.vercel.app>

## Features

| Feature | Backed by |
| --- | --- |
| Home rows, hero banner, category rows | `GET /api/home`, `/api/home/categories`, `/api/section` |
| Browse movies / TV / animation / dubbed / recent | `GET /api/movies`, `/api/tv-series`, `/api/animation`, `/api/dubbed`, `/api/recent-movies` |
| Genres, rankings, IMDb top list, trending | `GET /api/genres`, `/api/genre/:name`, `/api/ranking`, `/api/top-imdb`, `/api/trending` |
| Search, type-ahead, TMDB fallback search | `GET /api/search`, `/api/search/suggest`, `/api/tmdb-search` |
| Title page: detail, cast, related, TMDB id, comments | `GET /api/detail`, `/api/cast`, `/api/related`, `/api/tmdb-id`, `GET|POST /api/comments/:subjectId` |
| Playback: stream resolution, DASH manifest, subtitles | `GET /api/stream`, `/api/dash-manifest`, `/api/stream/:subject_id/captions` |
| Media passthrough (CDN Referer/CORS rules) | `GET /api/proxy`, `GET /api/download` |
| On-the-fly HLS transcoding with ffmpeg | `GET /api/transcode/status`, `/api/transcode/start`, `/api/transcode/:id/stop`, `/api/transcode/:id/:file` |

The UI is a small SPA (`public/index.html` + `app.js` + `style.css`), and the player is
[ArtPlayer](https://artplayer.org) 5.1.7 with `dash.js` 4.7.4 and `hls.js` 1.5.13 (from
jsDelivr, including the DASH control plugin) — DASH is preferred, HLS via
`/api/transcode` is the fallback.

## Quick start

Requires **Node 18+** and a reachable catalog API.

```bash
git clone https://github.com/SagorT3K/moviebox.git
cd moviebox
npm install
npm start                                   # http://localhost:7860
```

By default the server expects the API on `http://localhost:8000`. To use the hosted API:

```bash
# bash
API_URL=https://moviebox-api-steel.vercel.app npm start

# PowerShell
$env:API_URL='https://moviebox-api-steel.vercel.app'; npm start
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_URL` | `http://localhost:8000` | Base URL of the `moviebox-api` service (catalog, search, detail, streams) |
| `MOVIEBOX_API_KEY` | *(unset)* | When set, every API request carries `X-API-Key`; must match `API_KEY` on the API deployment |
| `TMDB_API_KEY` | bundled key | TMDB metadata/posters — override with your own key |
| `PORT` | `7860` | HTTP port (7860 is what the Dockerfile, Fly config and Space config expose) |

`API_URL`/`MOVIEBOX_API_KEY` are the two settings a Hugging Face Space needs under
*Settings → Variables and Secrets*.

## Playback pipeline

1. `/api/stream` resolves the subject through the API and returns the direct
   `mp4` / `hls` / `dash` sources together with the headers they need.
2. The player consumes DASH natively through `dash.js`.
3. If the source or codec isn't playable in the browser, the UI calls
   `/api/transcode/start`: ffmpeg (from `ffmpeg-static`, or the system package in the
   Docker image) repackages the stream into HLS under `os.tmpdir()/mb-transcode/<id>`,
   and `/api/transcode/:id/:file` serves the playlist and segments. At most **2**
   sessions run at once (`TRANSCODE_MAX_SESSIONS`), idle sessions are reaped, the oldest
   is evicted at the limit, and `/api/transcode/status` reports whether ffmpeg is
   available. If it isn't, the transcode endpoints answer `501` and the player stays on
   the direct source.
4. `/api/proxy` and `/api/download` fetch upstream media/CDN URLs server-side with the
   `Referer`/`Origin` headers those CDNs expect, which also sidesteps browser CORS.

## Hardening

- Baseline security headers on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `trust proxy = 1` — Fly terminates TLS and sets `X-Forwarded-For`, so exactly one hop
  is trusted and `req.ip` is the real client IP without trusting spoofable chains.
- Per-IP fixed-window rate limits: `/api/proxy` 240/min, `/api/download` 10/min,
  `/api/transcode/start` 4/min, `POST /api/comments/:subjectId` 5/min → `429` JSON.
- A small TTL cache wraps upstream calls (never caching `null`, so a cache miss and a
  failed upstream stay indistinguishable) to avoid hammering a slow upstream.

## Deployment

**Fly.io (current)** — `fly.toml` targets the app `hdmoviebox`, region `sin`, internal
port `7860`, 512 MB / 1 shared CPU, and keeps one machine warm
(`min_machines_running = 1`) so the first visitor doesn't pay for a cold start.
`.github/workflows/fly-deploy.yml` deploys on every push to `main`/`master` with
`flyctl deploy --remote-only`, using the `FLY_API_TOKEN` repository secret:

```bash
flyctl secrets set API_URL=https://moviebox-api-steel.vercel.app
flyctl secrets set MOVIEBOX_API_KEY=...   # only if the API has API_KEY set
flyctl secrets set TMDB_API_KEY=...       # optional, to use your own key
flyctl deploy --remote-only
```

**Docker / any VPS** — the image is `node:18-slim` with `ffmpeg` and `curl` installed:

```bash
docker build -t moviebox .
docker run -d -p 7860:7860 -e API_URL=https://moviebox-api-steel.vercel.app moviebox
```

`Procfile` (`web: npm start`) covers Heroku-style platforms, and the YAML front matter at
the top of this file is a Hugging Face **Docker Space** config (`app_port: 7860`).

## Project structure

```
moviebox/
├── server.js                 Express app: static UI + all /api/* routes, cache, rate limits, ffmpeg
├── public/
│   ├── index.html            page shell + player/CDN scripts
│   ├── app.js                UI logic, catalog rendering, player wiring
│   ├── style.css             theme
│   ├── overlay-nav.js/.css   navigation overlay
│   └── image-1.*.svg         logo mark
├── Dockerfile                node:18-slim + ffmpeg
├── fly.toml                  Fly app / region / port / VM + warm-machine settings
├── Procfile                  `web: npm start`
└── .github/workflows/fly-deploy.yml
```

## Disclaimer

Personal aggregator project. Metadata and artwork come from TMDB (mind its attribution
terms) while the catalog and streams are resolved from third-party services — no media
is hosted in this repository. Respect the copyright of what you stream and the terms of
the upstream services.
