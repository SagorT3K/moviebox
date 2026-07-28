const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// TMDB for metadata (set TMDB_API_KEY env var for production)
const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

// Moviebox-API for search & content
const MOVIEBOX_API = 'http://localhost:8000';

// CDN proxy headers (bypass CORS/Referer)
const CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'Referer': 'https://moviebox.ph/',
  'Origin': 'https://moviebox.ph',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- VIDEO PROXY (bypass CORS/Referer) ---
// Allowed CDN domains (add more as needed)
const ALLOWED_PROXY_HOSTS = [
  'bcdnxw.hakunaymatata.com',
  'sbcdnw.hakunaymatata.com',
  'sacdn.hakunaymatata.com',
  'cacdn.hakunaymatata.com',
  'netfilm.world',
  'moviebox.ph',
  'image.tmdb.org',
  'pbcdnw.aoneroom.com',
  'pbcdn.aoneroom.com',
  'macdn.aoneroom.com',
  'h5-api.aoneroom.com',
];

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  // Validate URL — only allow known CDN hosts
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isAllowed = ALLOWED_PROXY_HOSTS.some(h => host === h || host.endsWith('.' + h));
    if (!isAllowed) {
      return res.status(403).send('Host not allowed');
    }
  } catch (e) {
    return res.status(400).send('Invalid URL');
  }

  try {
    // Forward range header for seeking support
    const proxyHeaders = { ...CDN_HEADERS };
    if (req.headers.range) {
      proxyHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(url, {
      headers: proxyHeaders,
      redirect: 'follow',
      timeout: 30000,
    });

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).send(`Upstream error: ${response.status}`);
    }

    // Forward content type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // Forward content length for progress
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Forward content range for partial responses
    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    // Allow range requests for seeking
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Forward status 206 (Partial Content) for range requests
    if (response.status === 206) {
      res.status(206);
    }

    // Stream the video
    response.body.pipe(res);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).send('Proxy failed');
  }
});

// --- TMDB helpers ---
async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`TMDB error: ${endpoint} - ${e.message}`);
    return null;
  }
}

function formatTmdbMovie(item, type) {
  return {
    id: item.id,
    title: item.title || item.name || 'Untitled',
    poster: item.poster_path ? TMDB_IMG + item.poster_path : '',
    backdrop: item.backdrop_path ? TMDB_IMG + item.backdrop_path : '',
    year: (item.release_date || item.first_air_date || '').substring(0, 4) || 'N/A',
    rating: item.vote_average ? item.vote_average.toFixed(1) : null,
    overview: item.overview || '',
    type: type || (item.title ? 'movie' : 'tv'),
    source: 'tmdb',
    // TMDB original_language is a two-letter code (en, ja, ko, hi, etc.) — preserve it for the client
    language: item.original_language || (item.spoken_languages && item.spoken_languages[0] && item.spoken_languages[0].iso_639_1) || '',
  };
}

// Paginated catalog endpoints (round-robin used by Most Trending)
app.get('/api/movies', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const data = await movieboxFetch(`/movies?page=${page}`);
  if (!data) return res.json({ items: [] });
  res.json({ page, items: (data.items || []).map(item => ({
    subject_id: item.subject_id, name: item.name, poster_url: item.poster_url || '',
    slug: item.slug, badge: item.badge || '',
  })) });
});

app.get('/api/tv-series', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const data = await movieboxFetch(`/tv-series?page=${page}`);
  if (!data) return res.json({ items: [] });
  res.json({ page, items: (data.items || []).map(item => ({
    subject_id: item.subject_id, name: item.name, poster_url: item.poster_url || '',
    slug: item.slug, badge: item.badge || '',
  })) });
});

app.get('/api/animation', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const data = await movieboxFetch(`/animation?page=${page}`);
  if (!data) return res.json({ items: [] });
  res.json({ page, items: (data.items || []).map(item => ({
    subject_id: item.subject_id, name: item.name, poster_url: item.poster_url || '',
    slug: item.slug, badge: item.badge || '',
  })) });
});

app.get('/api/ranking', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const data = await movieboxFetch(`/ranking?page=${page}`);
  if (!data) return res.json({ items: [] });
  res.json({ page, total: data.total || 0, items: (data.items || []).map(item => ({
    subject_id: item.subject_id, name: item.name, poster_url: item.poster_url || '',
    slug: item.slug, badge: item.badge || '', rating: item.rating || null,
  })) });
});

app.get('/api/top-imdb', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const data = await movieboxFetch(`/top-imdb?page=${page}`);
  if (!data) return res.json({ items: [] });
  res.json({ page, total: data.total || 0, items: (data.items || []).map(item => ({
    subject_id: item.subject_id, name: item.name, poster_url: item.poster_url || '',
    slug: item.slug, badge: item.badge || '', rating: item.rating || null,
  })) });
});

// --- Moviebox-API helper ---
async function movieboxFetch(endpoint) {
  try {
    const res = await fetch(`${MOVIEBOX_API}${endpoint}`, { timeout: 10000 });
    if (!res.ok) throw new Error(`Moviebox-API ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`Moviebox-API error: ${endpoint} - ${e.message}`);
    return null;
  }
}

function formatMovieboxItem(item) {
  return {
    id: item.subject_id,
    title: item.name,
    poster: item.poster_url || '',
    slug: item.slug,
    badge: item.badge || '',
    source: 'moviebox',
    type: 'moviebox',
    // Moviebox API sometimes exposes language under different keys — preserve if present
    language: item.language || item.lang || item.locale || '',
  };
}

// --- API Routes ---

// Trending - try Moviebox-API first, fallback to TMDB
app.get('/api/trending', async (req, res) => {
  const data = await movieboxFetch('/home');
  if (data && data.sections) {
    const movies = [];
    for (const section of data.sections) {
      if (section.items) {
        for (const item of section.items) {
          movies.push(formatMovieboxItem(item));
        }
      }
    }
    if (movies.length > 0) return res.json({ movies: movies.slice(0, 40), total: movies.length });
  }

  // Fallback to TMDB
  const [moviesRes, tvRes] = await Promise.allSettled([
    tmdbFetch('/trending/movie/week'),
    tmdbFetch('/trending/tv/week'),
  ]);
  const movies = (moviesRes.value?.results || []).map(m => formatTmdbMovie(m, 'movie'));
  const tv = (tvRes.value?.results || []).map(m => formatTmdbMovie(m, 'tv'));
  res.json({ movies: [...movies, ...tv], total: movies.length + tv.length });
});

// Home - full sectioned layout from Moviebox-API /home (with TMDB fallback)
app.get('/api/home', async (req, res) => {
  const data = await movieboxFetch('/home');
  if (data && Array.isArray(data.sections) && data.sections.length > 0) {
    const sections = data.sections
      .filter(s => s.items && s.items.length > 0)
      .map(s => ({
        title: s.section,
        items: s.items.map(item => ({
          id: item.subject_id,
          title: item.name || 'Untitled',
          poster: item.poster_url || '',
          backdrop: item.image_url || item.poster_url || '',
          slug: item.slug,
          badge: item.badge || '',
          source: 'moviebox',
          type: 'moviebox',
          // Preserve language info from Moviebox-API when available
          language: item.language || item.lang || item.locale || '',
        })),
      }));
    if (sections.length > 0) {
      return res.json({ sections });
    }
  }

  // Fallback: reuse trending flat list as a single section
  const trending = await movieboxFetch('/home');
  if (data && data.sections) {
    const all = [];
    for (const s of data.sections) {
      for (const it of (s.items || [])) {
        all.push({
          id: it.subject_id, title: it.name || 'Untitled',
          poster: it.poster_url || '', slug: it.slug,
          badge: it.badge || '', source: 'moviebox', type: 'moviebox',
        });
      }
    }
    if (all.length) return res.json({ sections: [{ title: 'Trending', items: all.slice(0, 40) }] });
  }
  res.json({ sections: [] });
});

// Home categories — sections grouped by type (movie, tv, animation)
app.get('/api/home/categories', async (req, res) => {
  const data = await movieboxFetch('/home/categories');
  const result = { movie: [], tv: [], animation: [] };

  if (data && data.categories) {
    for (const [cat, sections] of Object.entries(data.categories)) {
      result[cat] = (sections || []).map(s => ({
        title: s.title,
        items: (s.items || []).map(item => ({
          id: item.subject_id,
          title: item.name || 'Untitled',
          poster: item.poster_url || '',
          slug: item.slug,
          badge: item.badge || '',
          rating: item.rating || null,
          source: 'moviebox',
          type: 'moviebox',
        }))
      }));
    }
  }

  // Add TMDB animation sections for more content — paginate until a healthy number of posters found
  try {
    async function collectTmdb(endpoint, maxItems = 20, maxPages = 6) {
      const collected = [];
      const seen = new Set();
      for (let p = 1; p <= maxPages && collected.length < maxItems; p++) {
        const res = await tmdbFetch(endpoint, { with_genres: '16', sort_by: 'popularity.desc', page: p, include_adult: false });
        const results = (res?.results || []).map(m => formatTmdbMovie(m, endpoint.includes('/movie') ? 'movie' : 'tv')).filter(m => m.poster);
        for (const it of results) {
          if (!seen.has(it.id)) { seen.add(it.id); collected.push(it); if (collected.length >= maxItems) break; }
        }
      }
      return collected;
    }

    const animeTvItems = await collectTmdb('/discover/tv', 20, 6);
    const animeMovieItems = await collectTmdb('/discover/movie', 20, 6);

    if (animeTvItems.length) {
      result.animation.push({ title: 'Popular Anime TV', items: animeTvItems });
    }
    if (animeMovieItems.length) {
      result.animation.push({ title: 'Popular Anime Movies', items: animeMovieItems });
    }
  } catch (e) { /* skip TMDB fallback */ }

  res.json(result);
});

// Section view — "See More" for a home section.
// Page 1 returns that section's items from /home; further pages pull from the
// paginated category endpoints so the section page can keep loading more.
const SECTION_CATEGORY = {
  'Banner': 'movie',
  'Trending Now': 'movie',
  'Cinema': 'movie',
  'Hot Short TV': 'movie',
  'Bollywood': 'movie',
  'Hollywood': 'movie',
  'South Indian': 'movie',
  'Asian': 'tv',
  'Top Series This Week': 'tv',
  'Top Anime Series': 'tv',
  'Best Asian Dramas': 'tv',
  'Indian Dramas': 'tv',
  'Western TV': 'tv',
  'Turkish Drama': 'tv',
};

app.get('/api/section', async (req, res) => {
  const name = (req.query.name || '').replace(/^[^\w]+|[^\w]+$/g, ''); // strip leading/trailing emoji
  const page = parseInt(req.query.page) || 1;

  if (page === 1) {
    // Return the actual section's items from /home
    const data = await movieboxFetch('/home');
    if (data && Array.isArray(data.sections)) {
      const match = data.sections.find(s =>
        (s.section || '').replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase() === name.toLowerCase()
      );
      if (match && match.items && match.items.length) {
        return res.json({
          title: match.section,
          page: 1,
          items: match.items.map(item => ({
            id: item.subject_id,
            title: item.name || 'Untitled',
            poster: item.poster_url || '',
            backdrop: item.image_url || item.poster_url || '',
            slug: item.slug,
            badge: item.badge || '',
            source: 'moviebox',
            type: 'moviebox',
          })),
          hasMore: true,
        });
      }
    }
  }

  // Pages > 1 (or fallback) — pull from the mapped paginated category endpoint
  const cat = SECTION_CATEGORY[name] || 'movie';
  const endpoint = cat === 'movie' ? '/api/movies' : cat === 'tv' ? '/api/tv-series' : '/api/animation';
  const data = await movieboxFetch(`${endpoint.replace('/api', '')}?page=${page}`);
  if (!data) return res.json({ title: name, page, items: [], hasMore: false });
  return res.json({
    title: name,
    page,
    items: (data.items || []).map(it => ({
      id: it.subject_id,
      title: it.name || 'Untitled',
      poster: it.poster_url || '',
      slug: it.slug,
      badge: it.badge || '',
      source: 'moviebox',
      type: 'moviebox',
    })),
    hasMore: (data.items || []).length > 0,
  });
});

// Search - Moviebox-API first (has Hindi/Tamil/Telugu), fallback TMDB
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ movies: [], total: 0 });

  // Try Moviebox-API (has Hindi dubbed content)
  const data = await movieboxFetch(`/search?q=${encodeURIComponent(q)}`);
  if (data && data.items && data.items.length > 0) {
    const movies = data.items.map(item => ({
      id: item.subject_id,
      title: item.name,
      poster: item.poster_url || '',
      slug: item.slug,
      year: item.year || '',
      badge: item.badge || '',
      source: 'moviebox',
      type: 'moviebox',
    }));
    return res.json({ movies, total: movies.length });
  }

  // Fallback to TMDB
  const tmdb = await tmdbFetch('/search/multi', { query: q, include_adult: false });
  const movies = (tmdb?.results || [])
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .map(m => formatTmdbMovie(m, m.media_type));
  res.json({ movies, total: movies.length });
});

// Detail
app.get('/api/detail', async (req, res) => {
  const { type, id, slug, source } = req.query;

  // Moviebox-API detail (has Hindi/Tamil/Telugu dubs, episodes, etc.)
  if (source === 'moviebox' && slug) {
    const data = await movieboxFetch(`/detail/${slug}`);
    if (data && data.data && data.data.subject) {
      const s = data.data.subject;
      const year = s.releaseDate ? s.releaseDate.substring(0, 4) : '';
      const genres = s.genre ? s.genre.split(',').map(g => g.trim()) : [];

      // Get resource info (seasons, episodes, source)
      const resource = data.data.resource || {};

      return res.json({
        id: s.subjectId || id,
        title: s.title || 'Untitled',
        poster: s.cover?.url || '',
        backdrop: s.stills?.url || s.cover?.url || '',
        year: year,
        rating: s.imdbRatingValue || '',
        ratingCount: s.imdbRatingCount || 0,
        overview: s.description || '',
        genres: genres,
        country: s.countryName || '',
        corner: s.corner || '',
        subtitles: s.subtitles || '',
        type: s.subjectType === 2 ? 'tv' : 'movie',
        slug: s.detailPath || slug,
        source: 'moviebox',
        hasResource: s.hasResource || false,
        resource: resource,
        dubs: s.dubs || [],
        trailer: s.trailer?.videoAddress?.url || '',
      });
    }

    // Detail API returned empty — fallback: build response from slug
    const slugParts = slug.split('-');
    const fallbackTitle = slug
      .replace(/-[a-zA-Z0-9]{8,}$/, '')  // Remove trailing hash
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    return res.json({
      id: id,
      title: fallbackTitle || 'Untitled',
      poster: '',
      backdrop: '',
      year: '',
      rating: '',
      ratingCount: 0,
      overview: '',
      genres: [],
      country: '',
      corner: '',
      subtitles: '',
      type: 'movie',
      slug: slug,
      source: 'moviebox',
      hasResource: true,
      resource: {},
      dubs: [],
      trailer: '',
    });
  }

  // TMDB detail
  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdbFetch(`/${mediaType}/${id}`);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: data.id,
    title: data.title || data.name,
    poster: data.poster_path ? TMDB_IMG + data.poster_path : '',
    backdrop: data.backdrop_path ? TMDB_IMG + data.backdrop_path : '',
    year: (data.release_date || data.first_air_date || '').substring(0, 4),
    rating: data.vote_average ? data.vote_average.toFixed(1) : null,
    overview: data.overview || '',
    genres: (data.genres || []).map(g => g.name),
    type: mediaType,
    source: 'tmdb',
  });
});

// Stream - Moviebox-API
app.get('/api/stream', async (req, res) => {
  const { subject_id, slug, se, ep } = req.query;
  if (!subject_id || !slug) return res.status(400).json({ error: 'Missing params' });

  const season = se || 1;
  const episode = ep || 1;
  const data = await movieboxFetch(`/api/stream/${subject_id}?detail_path=${slug}&se=${season}&ep=${episode}`);

  if (!data) return res.status(502).json({ error: 'Stream fetch failed' });

  // Return ALL streams (including VIP-locked with empty URLs) so client can show all resolutions
  // Only filter out streams that have truly missing data
  const allSources = (data.sources || []).filter(s => s.resolution);
  const allDash = (data.dash || []).filter(d => d.format);

  res.json({
    ...data,
    sources: allSources,
    dash: allDash,
  });
});

// DASH Manifest Parser — extract all resolutions from .mpd
app.get('/api/dash-manifest', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Referer': 'https://moviebox.ph/',
        'Accept': 'application/dash+xml, application/xml, */*',
      },
      redirect: 'follow',
      timeout: 15000,
    });

    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch manifest', status: response.status });

    const xml = await response.text();

    // Parse ALL video representations from MPD XML (handle any attribute order)
    const resolutions = [];
    const videoAdaptation = xml.match(/<AdaptationSet[^>]*contentType="video"[^>]*>[\s\S]*?<\/AdaptationSet>/);
    const searchBlock = videoAdaptation ? videoAdaptation[0] : xml;

    // Match each Representation tag and extract attributes individually
    const repMatches = searchBlock.matchAll(/<Representation[^>]+>/g);
    for (const rep of repMatches) {
      const tag = rep[0];
      const idMatch = tag.match(/ id="([^"]+)"/);
      const bwMatch = tag.match(/ bandwidth="(\d+)"/);
      const wMatch = tag.match(/ width="(\d+)"/);
      const hMatch = tag.match(/ height="(\d+)"/);
      const mimeMatch = tag.match(/ mimeType="([^"]+)"/);

      // Skip audio-only representations
      if (mimeMatch && mimeMatch[1].startsWith('audio')) continue;
      if (!hMatch) continue;

      resolutions.push({
        id: idMatch ? idMatch[1] : String(resolutions.length),
        bandwidth: bwMatch ? parseInt(bwMatch[1]) : 0,
        width: wMatch ? parseInt(wMatch[1]) : 0,
        height: parseInt(hMatch[1]),
        label: `${hMatch[1]}p`,
      });
    }

    // Parse codec
    const codecMatch = xml.match(/codecs="([^"]+)"/);
    const codec = codecMatch ? codecMatch[1] : 'unknown';

    // Parse duration
    const durMatch = xml.match(/mediaPresentationDuration="PT(?:(\d+)H)?(?:(\d+)M)?(\d+\.?\d*)S"/);
    let duration = 0;
    if (durMatch) {
      duration = (parseInt(durMatch[1] || 0) * 3600) + (parseInt(durMatch[2] || 0) * 60) + parseFloat(durMatch[3]);
    }

    res.json({
      url: url,
      codec: codec,
      duration: duration,
      resolutions: resolutions.sort((a, b) => b.height - a.height),
    });
  } catch (e) {
    console.error('DASH manifest parse error:', e.message);
    res.status(500).json({ error: 'Failed to parse manifest: ' + e.message });
  }
});

// Captions/Subtitles — proxy from Moviebox-API
app.get('/api/stream/:subject_id/captions', async (req, res) => {
  const { subject_id } = req.params;
  const { detail_path, se, ep } = req.query;
  if (!subject_id || !detail_path) return res.status(400).json({ error: 'Missing params' });

  const season = se || 1;
  const episode = ep || 1;
  const data = await movieboxFetch(`/api/stream/${subject_id}/captions?detail_path=${encodeURIComponent(detail_path)}&se=${season}&ep=${episode}`);

  if (!data) return res.status(502).json({ error: 'Captions fetch failed', count: 0, captions: [] });
  res.json(data);
});

// Cast
app.get('/api/cast', async (req, res) => {
  const { type, id } = req.query;
  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdbFetch(`/${mediaType}/${id}/credits`);
  if (!data) return res.json({ cast: [] });
  res.json({ cast: (data.cast || []).slice(0, 20) });
});

// TMDB ID lookup — search TMDB by movie title for embed fallback
app.get('/api/tmdb-id', async (req, res) => {
  const { title, year, type } = req.query;
  if (!title) return res.json({ tmdb_id: null });

  // Clean title — remove [Hindi], [CAM], etc.
  const cleanTitle = title.replace(/\[.*?\]/g, '').trim();

  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdbFetch(`/search/${mediaType}`, { query: cleanTitle, year: year || '' });
  if (!data || !data.results || data.results.length === 0) return res.json({ tmdb_id: null });

  // Return the first match
  const best = data.results[0];
  res.json({
    tmdb_id: best.id,
    title: best.title || best.name,
    type: mediaType,
    poster: best.poster_path ? TMDB_IMG + best.poster_path : '',
    year: (best.release_date || best.first_air_date || '').substring(0, 4),
  });
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎬 MovieBox running at http://localhost:${PORT}`);
  console.log(`📡 Moviebox-API: ${MOVIEBOX_API}`);
  console.log(`🔍 Search: MovieBox.ph (Hindi/Tamil/Telugu available)\n`);
});
