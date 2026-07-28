const contentArea = document.getElementById('contentArea');
const loading = document.getElementById('loading');
const searchInput = document.getElementById('searchInput');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

let currentPage = 'home';
let searchTimeout = null;
let currentDetail = null;
let currentSection = null;

// --- Sidebar ---
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
    sidebar.classList.remove('open');
  }
});

document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    currentPage = item.dataset.page;
    currentSection = null;
    sidebar.classList.remove('open');
    loadPage();
  });
});

// --- Search ---
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q.length >= 2) searchMovies(q);
    else if (q.length === 0) { currentSection = null; loadPage(); }
  }, 400);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q) searchMovies(q);
  }
});

// --- Fetch ---
async function apiFetch(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    console.error('API error:', url, e);
    return { movies: [] };
  }
}

// --- Extract language from title (legacy) ---
function extractLanguage(title) {
  if (!title) return null;
  const langPatterns = {
    'Hindi': /\[?hindi\]?/i,
    'Tamil': /\[?tamil\]?/i,
    'Telugu': /\[?telugu\]?/i,
    'Malayalam': /\[?malayalam\]?/i,
    'Kannada': /\[?kannada\]?/i,
    'Bengali': /\[?bengali\]?/i,
    'Punjabi': /\[?punjabi\]?/i,
    'Marathi': /\[?marathi\]?/i,
    'Gujarati': /\[?gujarati\]?/i,
    'Korean': /\[?korean\]?|k-drama/i,
    'Japanese': /\[?japanese\]?|anime/i,
    'Chinese': /\[?chinese\]?/i,
    'Thai': /\[?thai\]?/i,
    'Spanish': /\[?spanish\]?/i,
    'French': /\[?french\]?/i,
    'Portuguese': /\[?portuguese\]?/i,
    'Turkish': /\[?turkish\]?/i,
  };

  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(title)) return lang;
  }
  return null;
}

// Map a language code or a title/badge into a display label.
function mapLanguage(value) {
  if (!value) return null;
  // If it's already a 2-letter code, map commonly used ones
  const code = ('' + value).trim().toLowerCase();
  const codeMap = {
    en: 'English',
    hi: 'Hindi',
    ta: 'Tamil',
    te: 'Telugu',
    ml: 'Malayalam',
    kn: 'Kannada',
    bn: 'Bengali',
    pa: 'Punjabi',
    mr: 'Marathi',
    gu: 'Gujarati',
    ko: 'Korean',
    ja: 'Japanese',
    zh: 'Chinese',
    th: 'Thai',
    es: 'Spanish',
    fr: 'French',
    pt: 'Portuguese',
    tr: 'Turkish',
  };
  if (code.length === 2 && codeMap[code]) return codeMap[code];

  // If it's a full name already (e.g. 'Japanese'), normalize capitalization
  const normalized = value.trim();
  for (const v of Object.values(codeMap)) {
    if (v.toLowerCase() === normalized.toLowerCase()) return v;
  }

  // Fall back to extracting from the title string (legacy bracketed markers or 'anime')
  return extractLanguage(normalized);
}

// --- Extract quality from badge ---
function extractQuality(badge) {
  if (!badge) return null;
  const match = badge.match(/(\d+p)/i);
  return match ? match[1] : null;
}

// --- Load page ---
async function loadPage() {
  // Clear global scroll handlers from previous pages
  if (window.__mtScrollHandler) { window.removeEventListener('scroll', window.__mtScrollHandler); window.__mtScrollHandler = null; }
  if (window.__sectionScrollHandler) { window.removeEventListener('scroll', window.__sectionScrollHandler); window.__sectionScrollHandler = null; }
  if (window.__mwScrollHandler) { window.removeEventListener('scroll', window.__mwScrollHandler); window.__mwScrollHandler = null; }
  if (window.__imdbScrollHandler) { window.removeEventListener('scroll', window.__imdbScrollHandler); window.__imdbScrollHandler = null; }

  showLoading();
  contentArea.innerHTML = '';
  if (currentSection) {
    await loadSectionPage(currentSection);
  } else if (currentPage === 'home') {
    await loadHomePage();
  } else if (currentPage === 'tv') {
    await loadCategoryPage('tv', 'TV Shows', '/api/tv-series');
  } else if (currentPage === 'movie') {
    await loadCategoryPage('movie', 'Movies', '/api/movies');
  } else if (currentPage === 'animation') {
    await loadCategoryPage('animation', 'Animation', '/api/animation');
  } else if (currentPage === 'trending') {
    await loadMostWatchedPage();
  } else if (currentPage === 'top-imdb') {
    await loadTopImdbPage();
  } else {
    await loadHomePage();
  }
  hideLoading();
}

// --- Home page with sectioned layout ---
async function loadHomePage() {
  // Show light skeletons while we fetch data to avoid blank content
  contentArea.innerHTML = `<div class="hero-banner skeleton-hero" style="height:400px;margin-bottom:32px;border-radius:12px;background:linear-gradient(90deg,#0d0d0d,#111)"></div><div id="skeletonRows"></div>`;

  const data = await apiFetch('/api/home');
  const sections = data.sections || [];

  // Find a hero from the Banner section if present
  const bannerSection = sections.find(s => /banner/i.test(s.title));
  const hero = bannerSection && bannerSection.items.length > 0 ? bannerSection.items[0] : null;

  if (!sections.length) {
    contentArea.innerHTML = '<div class="no-results"><p>No content found</p></div>';
    return;
  }

  // Build the hero slide list (Banner section items, fallback to first few sections)
  const heroSlides = [];
  if (bannerSection && bannerSection.items.length > 0) {
    bannerSection.items.forEach(it => {
      const img = it.backdrop || it.poster || '';
      if (img) heroSlides.push(it);
    });
  }
  // Fallback: collect a few slides from trending/sections if no Banner section
  if (heroSlides.length === 0) {
    for (const s of sections) {
      for (const it of (s.items || [])) {
        const img = it.backdrop || it.poster || '';
        if (img) heroSlides.push(it);
        if (heroSlides.length >= 6) break;
      }
      if (heroSlides.length >= 6) break;
    }
  }

  let html = '';

  // Hero banner — auto-rotating slideshow
  if (heroSlides.length > 0) {
    const slidesHtml = heroSlides.map((it, i) => {
      const img = it.backdrop || it.poster || '';
      const lang = mapLanguage(it.language || it.title || it.badge || '');
      const year = it.year || '';
      return `
        <div class="hero-slide${i === 0 ? ' active' : ''}" data-source="${it.source || 'moviebox'}" data-type="${it.type || 'movie'}" data-id="${it.id || ''}" data-slug="${it.slug || ''}">
          <img src="${img}" alt="${esc(it.title)}" class="hero-backdrop" loading="${i === 0 ? 'eager' : 'lazy'}">
          <div class="hero-overlay"></div>
          <div class="hero-content">
            <h2 class="hero-title">${esc(it.title)}</h2>
            <div class="hero-meta">
              ${lang ? `<span class="hero-badge">${lang}</span>` : ''}
              ${year ? `<span>${year}</span>` : ''}
              ${it.badge ? `<span>${esc(it.badge)}</span>` : ''}
              ${it.rating ? `<span class="hero-rating">⭐ ${it.rating}</span>` : ''}
            </div>
            <button class="hero-play-btn" data-action="play">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Play Now
            </button>
          </div>
        </div>`;
    }).join('');

    const dotsHtml = heroSlides.map((_, i) =>
      `<button class="hero-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Go to slide ${i + 1}"></button>`
    ).join('');

    html += `
      <div class="hero-banner" id="heroBanner">
        <div class="hero-slides">${slidesHtml}</div>
        ${heroSlides.length > 1 ? `
        <button class="hero-arrow hero-prev" aria-label="Previous slide">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <button class="hero-arrow hero-next" aria-label="Next slide">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
        </button>
        <div class="hero-dots">${dotsHtml}</div>` : ''}
      </div>`;
  }

  // Render each real section as a horizontal row
  for (const section of sections) {
    const items = section.items || [];
    if (!items.length) continue;

    // Skip the Banner section from being rendered again as a row (used as hero)
    const isBanner = /banner/i.test(section.title);
    if (isBanner && hero) continue;

    const sectionKey = section.title.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    html += `<div class="movie-row">
      <div class="row-header">
        <h2 class="row-title">${esc(section.title)}</h2>
        <div class="row-header-right">
          <a href="#" class="row-more" data-section="${esc(sectionKey)}" data-section-title="${esc(section.title)}">More ›</a>
          <div class="row-nav">
            <button class="row-arrow arrow-left" aria-label="Scroll left">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <button class="row-arrow arrow-right" aria-label="Scroll right">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="row-scroll">${items.map(renderCard).join('')}</div>
    </div>`;
  }

  // Most Trending — infinite-scroll grid at the bottom
  html += `<div class="movie-row most-trending">
    <div class="row-header"><h2 class="row-title">🔥 Most Trending</h2></div>
    <div class="mt-grid" id="mtGrid"></div>
    <div class="mt-loading" id="mtLoading">Loading more...</div>
  </div>`;

  // Top IMDB Rated — horizontal row
  try {
    const imdbData = await apiFetch('/api/top-imdb?page=1');
    const imdbItems = (imdbData.items || []).slice(0, 20).map(it => ({
      id: it.subject_id, title: it.name || 'Untitled', poster: it.poster_url || '',
      slug: it.slug, badge: it.badge || '', rating: it.rating || null,
      source: 'moviebox', type: 'moviebox',
    }));
    if (imdbItems.length) {
      html += `<div class="movie-row">
        <div class="row-header">
          <h2 class="row-title">🏆 Top IMDB Rated</h2>
          <div class="row-header-right">
            <a href="#" class="row-more" onclick="event.preventDefault(); currentPage='top-imdb'; currentSection=null; loadPage();">More ›</a>
            <div class="row-nav">
              <button class="row-arrow arrow-left" aria-label="Scroll left">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="row-arrow arrow-right" aria-label="Scroll right">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41-1.41L13.17 12z"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="row-scroll">${imdbItems.map(renderCard).join('')}</div>
      </div>`;
    }
  } catch (e) { /* skip if unavailable */ }

  contentArea.innerHTML = html;
  attachCardListeners();
  bindCarouselArrows();
  bindSectionLinks();
  initHeroBanner();
  initMostTrending();
}

// --- Hero banner auto-rotation + controls ---
let heroState = { timer: null, index: 0, slides: [], dots: [], paused: false };

function initHeroBanner() {
  const banner = document.getElementById('heroBanner');
  if (!banner) return;
  const slides = Array.from(banner.querySelectorAll('.hero-slide'));
  const dots = Array.from(banner.querySelectorAll('.hero-dot'));
  if (slides.length <= 1) return;

  // Respect user motion preference
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  heroState = { timer: null, index: 0, slides, dots, paused: false };

  const show = (idx) => {
    heroState.index = (idx + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === heroState.index));
    dots.forEach((d, i) => d.classList.toggle('active', i === heroState.index));

    // staggered overlay reveal (simple CSS-friendly toggle)
    slides.forEach((s, i) => {
      const content = s.querySelector('.hero-content');
      if (!content) return;
      if (i === heroState.index) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(8px)';
        // allow the crossfade to settle then animate content in
        requestAnimationFrame(() => setTimeout(() => {
          content.style.transition = 'opacity 360ms ease, transform 360ms ease';
          content.style.opacity = '1';
          content.style.transform = 'none';
        }, 80));
      } else {
        content.style.transition = ''; content.style.opacity = '0'; content.style.transform = 'translateY(8px)';
      }
    });

    // Preload the next slide's image for smoother transitions
    const nextIndex = (heroState.index + 1) % slides.length;
    const nextImg = slides[nextIndex].querySelector('.hero-backdrop');
    if (nextImg && nextImg.dataset && nextImg.dataset.preloaded !== '1') {
      const pre = new Image();
      pre.src = nextImg.src;
      nextImg.dataset.preloaded = '1';
    }
  };

  const next = () => show(heroState.index + 1);
  const prev = () => show(heroState.index - 1);

  const start = () => {
    stop();
    if (prefersReduced) return; // do not auto-start when user requests reduced motion
    heroState.timer = setInterval(() => {
      if (!heroState.paused) next();
    }, 6000);
  };
  const stop = () => { if (heroState.timer) { clearInterval(heroState.timer); heroState.timer = null; } };

  // Controls
  const prevBtn = banner.querySelector('.hero-prev');
  const nextBtn = banner.querySelector('.hero-next');
  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prev(); start(); });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); start(); });

  dots.forEach((d, i) => d.addEventListener('click', (e) => { e.stopPropagation(); show(i); start(); }));

  // Pause on hover and on focus-within
  banner.setAttribute('tabindex', '0');
  banner.addEventListener('mouseenter', () => { heroState.paused = true; });
  banner.addEventListener('mouseleave', () => { heroState.paused = false; });
  banner.addEventListener('focusin', () => { heroState.paused = true; });
  banner.addEventListener('focusout', () => { heroState.paused = false; });

  // Keyboard navigation when focused
  banner.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); start(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); start(); }
  });

  // Touch / swipe support (simple thresholded swipe)
  let touchStartX = 0, touchMoveX = 0;
  banner.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) touchStartX = e.touches[0].clientX;
  }, { passive: true });
  banner.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) touchMoveX = e.touches[0].clientX;
  }, { passive: true });
  banner.addEventListener('touchend', (e) => {
    const delta = touchMoveX - touchStartX;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next(); else prev();
      start();
    }
    touchStartX = touchMoveX = 0;
  });

  // Click on active slide opens detail
  slides.forEach((s) => {
    s.addEventListener('click', (e) => {
      if (e.target.closest('.hero-arrow') || e.target.closest('.hero-dot') || e.target.closest('[data-action="play"]')) return;
      openDetail(s.dataset.source, s.dataset.type, s.dataset.id, s.dataset.slug);
    });
  });

  // Play button opens detail
  banner.querySelectorAll('[data-action="play"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slide = btn.closest('.hero-slide');
      openDetail(slide.dataset.source, slide.dataset.type, slide.dataset.id, slide.dataset.slug);
    });
  });

  // Initialize content opacity for slides
  slides.forEach((s, i) => {
    const content = s.querySelector('.hero-content');
    if (content) { content.style.opacity = i === 0 ? '1' : '0'; content.style.transform = i === 0 ? 'none' : 'translateY(8px)'; }
  });

  start();
}

// --- Carousel arrow navigation ---
function bindCarouselArrows() {
  document.querySelectorAll('.movie-row').forEach(row => {
    const scroll = row.querySelector('.row-scroll');
    if (!scroll) return;
    const left = row.querySelector('.arrow-left');
    const right = row.querySelector('.arrow-right');

    const updateArrows = () => {
      if (!left || !right) return;
      const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      left.classList.toggle('disabled', scroll.scrollLeft <= 1);
      right.classList.toggle('disabled', scroll.scrollLeft >= maxScroll - 1);
    };

    // rAF-throttled handler for scroll/resize
    let rafId = null;
    const rafHandler = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { updateArrows(); rafId = null; });
    };

    if (left) left.addEventListener('click', () => {
      scroll.scrollBy({ left: -Math.round(scroll.clientWidth * 0.85), behavior: 'smooth' });
    });
    if (right) right.addEventListener('click', () => {
      scroll.scrollBy({ left: Math.round(scroll.clientWidth * 0.85), behavior: 'smooth' });
    });

    scroll.addEventListener('scroll', rafHandler, { passive: true });
    window.addEventListener('resize', rafHandler);

    // Initial state
    updateArrows();
  });
}

// --- Section "See More" links ---
function bindSectionLinks() {
  document.querySelectorAll('.row-more').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentSection = link.dataset.section;
      window.scrollTo({ top: 0 });
      loadPage();
    });
  });
}

// --- Most Trending infinite scroll ---
let mtState = { page: 1, loading: false, done: false, seen: new Set() };

async function initMostTrending() {
  mtState = { page: 1, loading: false, done: false, seen: new Set() };
  const grid = document.getElementById('mtGrid');
  if (grid) grid.innerHTML = '';
  await loadMoreTrending();

  // Infinite scroll on window
  window.__mtScrollHandler = async () => {
    const loading = document.getElementById('mtLoading');
    if (!loading) return;
    const rect = loading.getBoundingClientRect();
    if (rect.top < window.innerHeight + 300) {
      await loadMoreTrending();
    }
  };
  window.addEventListener('scroll', window.__mtScrollHandler, { passive: true });
}

async function fetchTrendingPage(page) {
  const cats = ['movie', 'tv', 'animation'];
  const idx = (page - 1) % cats.length;
  const cat = cats[idx];
  const endpoint = cat === 'movie' ? '/api/movies'
    : cat === 'tv' ? '/api/tv-series' : '/api/animation';
  const data = await apiFetch(`${endpoint}?page=${page}`);
  const items = (data.items || []).map(it => ({
    id: it.subject_id,
    title: it.name || 'Untitled',
    poster: it.poster_url || '',
    slug: it.slug,
    badge: it.badge || '',
    source: 'moviebox',
    type: 'moviebox',
  }));
  return items;
}

async function loadMoreTrending() {
  if (mtState.loading || mtState.done) return;
  mtState.loading = true;

  const grid = document.getElementById('mtGrid');
  const loading = document.getElementById('mtLoading');
  if (loading) loading.textContent = 'Loading more...';

  try {
    const items = await fetchTrendingPage(mtState.page);
    if (!items.length) {
      mtState.done = true;
      if (loading) {
        loading.textContent = mtState.seen.size ? 'You have reached the end.' : 'No content found.';
        loading.classList.add('mt-end');
      }
      mtState.loading = false;
      return;
    }

    const fresh = items.filter(it => it.id && !mtState.seen.has(it.id));
    fresh.forEach(it => mtState.seen.add(it.id));

    if (grid && fresh.length) {
      grid.insertAdjacentHTML('beforeend', fresh.map(renderCard).join(''));
      attachCardListeners();
    }

    mtState.page += 1;
    if (mtState.page > 30) {
      mtState.done = true;
      if (loading) { loading.textContent = 'You have reached the end.'; loading.classList.add('mt-end'); }
    }
  } catch (e) {
    console.error('Most Trending load error:', e);
    mtState.done = true;
    if (loading) { loading.textContent = 'Failed to load more.'; loading.classList.add('mt-end'); }
  }
  mtState.loading = false;
}

// --- Section "See More" page ---
let sectionState = { page: 1, loading: false, done: false, title: '' };

async function loadSectionPage(sectionKey) {
  // show a lightweight skeleton page while first page loads
  contentArea.innerHTML = `<div class="section-page">
    <div class="section-head">
      <button class="back-btn" onclick="goHome()">‹ Back</button>
      <h1 class="section-title">${esc(sectionKey)}</h1>
    </div>
    <div class="movie-grid section-grid" id="sectionGrid">
      ${new Array(12).fill(0).map(()=> `<div class="movie-card skeleton-card"><div class="card-poster" style="background:linear-gradient(90deg,#111,#0f0f0f);height:230px;border-radius:10px"></div><div style="height:12px;margin-top:8px;background:#111;border-radius:4px"></div></div>`).join('')}
    </div>
    <div class="mt-loading" id="sectionLoading"></div>
  </div>`;

  const data = await apiFetch(`/api/section?name=${encodeURIComponent(sectionKey)}&page=1`);
  const items = data.items || [];
  sectionState = { page: 1, loading: false, done: !data.hasMore, title: data.title || sectionKey };

  if (!items.length) {
    contentArea.innerHTML = `<div class="section-page">
      <button class="back-btn" onclick="goHome()">‹ Back</button>
      <div class="no-results"><p>No content found</p></div>
    </div>`;
    hideLoading();
    return;
  }

  contentArea.innerHTML = `<div class="section-page">
    <div class="section-head">
      <button class="back-btn" onclick="goHome()">‹ Back</button>
      <h1 class="section-title">${esc(sectionState.title)}</h1>
    </div>
    <div class="movie-grid section-grid" id="sectionGrid">${items.map(renderCard).join('')}</div>
    <div class="mt-loading" id="sectionLoading"></div>
  </div>`;
  attachCardListeners();
  initSectionMore();
}

function goHome() {
  currentSection = null;
  loadPage();
}

function initSectionMore() {
  const loading = document.getElementById('sectionLoading');
  const sentinel = loading;
  if (!sentinel) return;
  window.__sectionScrollHandler = async () => {
    const rect = sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 400) await loadMoreSection();
  };
  window.addEventListener('scroll', window.__sectionScrollHandler, { passive: true });
}

async function loadMoreSection() {
  if (sectionState.loading || sectionState.done) return;
  sectionState.loading = true;
  const grid = document.getElementById('sectionGrid');
  const loading = document.getElementById('sectionLoading');
  if (loading) loading.textContent = 'Loading more...';
  try {
    const data = await apiFetch(`/api/section?name=${encodeURIComponent(sectionState.title)}&page=${sectionState.page + 1}`);
    const items = data.items || [];
    sectionState.page += 1;
    if (!items.length) {
      sectionState.done = true;
      if (loading) { loading.textContent = 'You have reached the end.'; loading.classList.add('mt-end'); }
    } else {
      if (grid) { grid.insertAdjacentHTML('beforeend', items.map(renderCard).join('')); attachCardListeners(); }
      if (!data.hasMore) {
        sectionState.done = true;
        if (loading) { loading.textContent = 'You have reached the end.'; loading.classList.add('mt-end'); }
      }
    }
  } catch (e) {
    sectionState.done = true;
    if (loading) { loading.textContent = 'Failed to load more.'; loading.classList.add('mt-end'); }
  }
  sectionState.loading = false;
}

// --- Category pages (using home sections data) ---
async function loadCategoryPage(category, title, endpoint) {
  const data = await apiFetch('/api/home/categories');
  const sections = data[category] || [];

  if (!sections.length) {
    contentArea.innerHTML = `<div class="no-results"><p>No ${title} content found</p></div>`;
    return;
  }

  let html = '';
  for (const section of sections) {
    if (!section.items || !section.items.length) continue;
    const sectionKey = section.title.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    html += `<div class="movie-row">
      <div class="row-header">
        <h2 class="row-title">${esc(section.title)}</h2>
        <div class="row-header-right">
          <a href="#" class="row-more" data-section="${esc(sectionKey)}" data-section-title="${esc(section.title)}">More ›</a>
          <div class="row-nav">
            <button class="row-arrow arrow-left" aria-label="Scroll left">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <button class="row-arrow arrow-right" aria-label="Scroll right">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41-1.41L13.17 12z"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="row-scroll">${section.items.map(renderCard).join('')}</div>
    </div>`;
  }

  contentArea.innerHTML = html;
  attachCardListeners();
  bindCarouselArrows();
  bindSectionLinks();
}

// --- Most Watched page ---
let mwState = { page: 1, loading: false, done: false };

async function loadMostWatchedPage() {
  mwState = { page: 1, loading: false, done: false };

  contentArea.innerHTML = `<div class="movie-row">
    <div class="row-header"><h2 class="row-title">📈 Most Watched</h2></div>
    <div class="movie-grid" id="mwGrid"></div>
    <div class="mt-loading" id="mwLoading">Loading...</div>
  </div>`;

  await loadMoreMostWatched();

  window.__mwScrollHandler = async () => {
    const el = document.getElementById('mwLoading');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 300) await loadMoreMostWatched();
  };
  window.addEventListener('scroll', window.__mwScrollHandler, { passive: true });
}

async function loadMoreMostWatched() {
  if (mwState.loading || mwState.done) return;
  mwState.loading = true;

  const grid = document.getElementById('mwGrid');
  const loadEl = document.getElementById('mwLoading');
  if (loadEl) loadEl.textContent = 'Loading more...';

  try {
    const data = await apiFetch(`/api/ranking?page=${mwState.page}`);
    const items = (data.items || []).map(it => ({
      id: it.subject_id, title: it.name || 'Untitled', poster: it.poster_url || '',
      slug: it.slug, badge: it.badge || '', rating: it.rating || null,
      source: 'moviebox', type: 'moviebox',
    }));

    if (!items.length) {
      mwState.done = true;
      if (loadEl) { loadEl.textContent = mwState.page === 1 ? 'No content found.' : 'You have reached the end.'; loadEl.classList.add('mt-end'); }
      mwState.loading = false;
      return;
    }

    if (grid) { grid.insertAdjacentHTML('beforeend', items.map(renderCard).join('')); attachCardListeners(); }
    mwState.page += 1;
    if (mwState.page > 30) {
      mwState.done = true;
      if (loadEl) { loadEl.textContent = 'You have reached the end.'; loadEl.classList.add('mt-end'); }
    }
  } catch (e) {
    mwState.done = true;
    if (loadEl) { loadEl.textContent = 'Failed to load more.'; loadEl.classList.add('mt-end'); }
  }
  mwState.loading = false;
}

// --- Top IMDB Rated page ---
let imdbState = { page: 1, loading: false, done: false };

async function loadTopImdbPage() {
  imdbState = { page: 1, loading: false, done: false };

  contentArea.innerHTML = `<div class="movie-row">
    <div class="row-header"><h2 class="row-title">🏆 Top IMDB Rated</h2></div>
    <div class="movie-grid" id="imdbGrid"></div>
    <div class="mt-loading" id="imdbLoading">Loading...</div>
  </div>`;

  await loadMoreTopImdb();

  window.__imdbScrollHandler = async () => {
    const el = document.getElementById('imdbLoading');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 300) await loadMoreTopImdb();
  };
  window.addEventListener('scroll', window.__imdbScrollHandler, { passive: true });
}

async function loadMoreTopImdb() {
  if (imdbState.loading || imdbState.done) return;
  imdbState.loading = true;

  const grid = document.getElementById('imdbGrid');
  const loadEl = document.getElementById('imdbLoading');
  if (loadEl) loadEl.textContent = 'Loading more...';

  try {
    const data = await apiFetch(`/api/top-imdb?page=${imdbState.page}`);
    const items = (data.items || []).map(it => ({
      id: it.subject_id, title: it.name || 'Untitled', poster: it.poster_url || '',
      slug: it.slug, badge: it.badge || '', rating: it.rating || null,
      source: 'moviebox', type: 'moviebox',
    }));

    if (!items.length) {
      imdbState.done = true;
      if (loadEl) { loadEl.textContent = imdbState.page === 1 ? 'No content found.' : 'You have reached the end.'; loadEl.classList.add('mt-end'); }
      imdbState.loading = false;
      return;
    }

    if (grid) { grid.insertAdjacentHTML('beforeend', items.map(renderCard).join('')); attachCardListeners(); }
    imdbState.page += 1;
    if (imdbState.page > 30) {
      imdbState.done = true;
      if (loadEl) { loadEl.textContent = 'You have reached the end.'; loadEl.classList.add('mt-end'); }
    }
  } catch (e) {
    imdbState.done = true;
    if (loadEl) { loadEl.textContent = 'Failed to load more.'; loadEl.classList.add('mt-end'); }
  }
  imdbState.loading = false;
}

async function searchMovies(query) {
  showLoading();
  const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
  const movies = data.movies || [];
  if (!movies.length) {
    contentArea.innerHTML = `<div class="no-results"><p>No results for "${esc(query)}"</p></div>`;
  } else {
    contentArea.innerHTML = `<div class="movie-row"><div class="row-header"><h2 class="row-title">🔍 "${esc(query)}" — ${movies.length} results</h2></div><div class="movie-grid">${movies.map(renderCard).join('')}</div></div>`;
    attachCardListeners();
  }
  hideLoading();
}

// --- Card ---
function renderCard(movie) {
  const poster = movie.poster
    ? `<img src="${movie.poster}" alt="${esc(movie.title)}" loading="lazy">`
    : `<div class="no-poster"><svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div>`;

  // Determine language (prefer explicit movie.language) and quality
  const lang = mapLanguage(movie.language || movie.title || movie.badge || '');
  const badge = movie.badge || '';
  const quality = extractQuality(badge) || extractQuality(movie.title);

  // Clean title (remove [Hindi], [CAM], etc.)
  const cleanTitle = (movie.title || '').replace(/\[.*?\]/g, '').trim();

  // Build badge HTML
  let badgeHtml = '';
  if (lang) {
    badgeHtml = `<span class="card-lang">${lang}</span>`;
  } else if (badge) {
    badgeHtml = `<span class="card-badge">${badge}</span>`;
  }

  return `
    <div class="movie-card" data-source="${movie.source || 'tmdb'}" data-type="${movie.type || 'movie'}" data-id="${movie.id || ''}" data-slug="${movie.slug || ''}">
      <div class="card-poster">
        ${poster}
        ${badgeHtml}
        ${quality ? `<span class="card-quality">${quality}</span>` : ''}
        <div class="card-play-overlay">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title" title="${esc(cleanTitle)}">${esc(cleanTitle)}</div>
        <div class="card-meta">${movie.year || ''}${movie.rating ? ' · ⭐ ' + movie.rating : ''}</div>
      </div>
    </div>`;
}

function attachCardListeners() {
  document.querySelectorAll('.movie-card').forEach(card => {
    card.onclick = () => openDetail(card.dataset.source, card.dataset.type, card.dataset.id, card.dataset.slug);
  });
}

// --- Embed sources ---
function getEmbedServers(type, id, se, ep) {
  const s = se || 1, e = ep || 1;
  if (type === 'tv') {
    return [
      { name: 'Server 1', url: `https://yapgrid.com/embed/tv/${id}/${s}/${e}` },
      { name: 'Server 2', url: `https://vidcore.org/embed/tv/${id}/${s}/${e}` },
      { name: 'Server 3', url: `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
      { name: 'Server 4', url: `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
    ];
  }
  return [
    { name: 'Server 1', url: `https://yapgrid.com/embed/movie/${id}` },
    { name: 'Server 2', url: `https://vidcore.org/embed/movie/${id}` },
    { name: 'Server 3', url: `https://multiembed.mov/?video_id=${id}&tmdb=1` },
    { name: 'Server 4', url: `https://www.2embed.cc/embed/${id}` },
  ];
}

// --- Detail page ---
async function openDetail(source, type, id, slug) {
  showLoading();
  contentArea.innerHTML = '';

  try {
    const detail = await fetch(`/api/detail?type=${type}&id=${id}&source=${source}&slug=${slug || ''}`).then(r => r.json());
    currentDetail = detail;

    // Get cast
    let cast = [];
    try {
      const castRes = await fetch(`/api/cast?type=${type === 'tv' ? 'tv' : 'movie'}&id=${id}`);
      if (castRes.ok) {
        const castData = await castRes.json();
        cast = castData.cast || [];
      }
    } catch (e) {}

    // Get stream
    let streamData = null;
    let captionData = null;
    if (source === 'moviebox' && slug && id) {
      const isMovie = detail.type === 'movie';
      const se = isMovie ? 0 : 1;
      const ep = isMovie ? 0 : 1;
      try {
        streamData = await fetch(`/api/stream?subject_id=${id}&slug=${encodeURIComponent(slug)}&se=${se}&ep=${ep}`).then(r => r.json());
      } catch (e) {}
      try {
        captionData = await fetch(`/api/stream/${id}/captions?detail_path=${encodeURIComponent(slug)}&se=${se}&ep=${ep}`).then(r => r.json());
      } catch (e) {}
    }

    // Filter valid sources
    const validSources = (streamData && streamData.sources || []).filter(s => s.url && s.url.length > 0);
    const validDASH = (streamData && streamData.dash || []).filter(d => d.url && d.url.length > 0);
    const validHLS = (streamData && streamData.hls || []).filter(h => h.url && h.url.length > 0);

    let playerSrc = '';
    let playerType = '';
    let formatLabel = 'Loading...';
    let isEmbed = false;
    let resolutions = [];

    if (validDASH.length > 0) {
      playerSrc = validDASH[0].url;
      playerType = 'application/dash+xml';
      formatLabel = 'High efficiency (DASH/H.265)';

      try {
        const manifestData = await fetch(`/api/dash-manifest?url=${encodeURIComponent(playerSrc)}`).then(r => r.json());
        window.__dashManifest = manifestData;
        if (manifestData.resolutions && manifestData.resolutions.length > 0) {
          resolutions = manifestData.resolutions;
        }
      } catch (e) {}
    } else if (validSources.length > 0) {
      playerSrc = `/api/proxy?url=${encodeURIComponent(validSources[0].url)}`;
      playerType = 'video/mp4';
      formatLabel = 'MP4 (H.264)';
      const allMp4Sources = streamData.sources || [];
      resolutions = allMp4Sources.map(s => ({
        height: parseInt(s.resolutions) || parseInt(s.resolution) || 0,
        label: s.resolution || s.resolutions + 'p',
        url: s.url ? `/api/proxy?url=${encodeURIComponent(s.url)}` : '',
      })).filter(r => r.height > 0).sort((a, b) => b.height - a.height);
    } else if (validHLS.length > 0) {
      playerSrc = validHLS[0].url;
      playerType = 'application/x-mpegURL';
      formatLabel = 'HLS Streaming';
    } else {
      isEmbed = true;
      formatLabel = 'External Source';
      let tmdbId = null;
      try {
        const year = detail.year || '';
        const tmdbResult = await fetch(`/api/tmdb-id?title=${encodeURIComponent(detail.title)}&year=${year}&type=${type === 'tv' ? 'tv' : 'movie'}`).then(r => r.json());
        tmdbId = tmdbResult.tmdb_id;
      } catch (e) {}

      if (tmdbId) {
        const servers = getEmbedServers(type === 'tv' ? 'tv' : 'movie', tmdbId);
        playerSrc = servers[0].url;
        resolutions = servers;
      } else {
        playerSrc = `https://www.2embed.cc/embed/${id}`;
        resolutions = [{ label: 'Server 1', url: playerSrc }];
      }
    }

    window.__currentStream = {
      src: playerSrc,
      type: playerType,
      mp4Sources: validSources,
      dashUrl: validDASH.length > 0 ? validDASH[0].url : '',
      hlsUrl: validHLS.length > 0 ? validHLS[0].url : '',
      captionData: captionData,
      resolutions: resolutions,
      isEmbed: isEmbed,
    };

    // Resources panel (season/episode)
    let resourcesHtml = '';
    if (detail.type === 'tv') {
      const resource = detail.resource || {};
      const seasonsData = resource.seasons || [];
      const sourceName = resource.source || 'MovieBox.ph';

      const seasonMap = {};
      for (const s of seasonsData) {
        seasonMap[s.se] = s.maxEp || 1;
      }

      const seasonNums = Object.keys(seasonMap).map(Number).sort((a, b) => a - b);
      const hasSeasons = seasonNums.length > 0;

      window.__seasonMap = seasonMap;
      window.__resourceSource = sourceName;

      let seasonTabs = '';
      if (hasSeasons) {
        for (const se of seasonNums) {
          seasonTabs += `<button class="season-tab${se === seasonNums[0] ? ' active' : ''}" data-season="${se}">S${String(se).padStart(2, '0')}</button>`;
        }
      } else {
        seasonTabs = `<button class="season-tab active" data-season="1">S01</button>`;
      }

      const firstSeason = hasSeasons ? seasonNums[0] : 1;
      const firstMaxEp = seasonMap[firstSeason] || 1;
      let episodeGrid = '';
      for (let i = 1; i <= firstMaxEp; i++) {
        episodeGrid += `<button class="ep-btn" data-ep="${i}">${String(i).padStart(2, '0')}</button>`;
      }

      resourcesHtml = `
        <div class="detail-resources">
          <div class="format-section">
            <span class="format-title">Format</span>
            <span class="format-info">${esc(formatLabel)}</span>
          </div>
          <div class="resources-title">Resources</div>
          <div class="resources-source">Source: ${esc(sourceName)} | By ${esc(resource.uploadBy || 'N/A')}</div>
          <div class="season-tabs" id="seasonTabs">${seasonTabs}</div>
          <div class="episode-grid" id="episodeGrid">${episodeGrid}</div>
        </div>`;
    } else {
      const resource = detail.resource || {};
      const sourceName = resource.source || 'MovieBox.ph';
      resourcesHtml = `
        <div class="detail-resources">
          <div class="format-section">
            <span class="format-title">Format</span>
            <span class="format-info">${esc(formatLabel)}</span>
          </div>
          <div class="resources-title">Resources</div>
          <div class="resources-source">Source: ${esc(sourceName)} | By ${esc(resource.uploadBy || 'N/A')}</div>
          <div class="ep-btn playing" style="text-align:left;padding:8px 12px;white-space:normal;font-size:12px;">
            <span class="equalizer"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>
            ${esc(detail.title)}
          </div>
        </div>`;
    }

    // Cast HTML
    let castHtml = '';
    if (cast.length > 0) {
      const castCards = cast.slice(0, 15).map(c => `
        <div class="cast-card">
          <div class="cast-img">
            ${c.profile_path ? `<img src="https://image.tmdb.org/t/p/w200${c.profile_path}" alt="${esc(c.name)}" loading="lazy">` : ''}
          </div>
          <div class="cast-name">${esc(c.name)}</div>
          <div class="cast-role">${esc(c.character || '')}</div>
        </div>`).join('');
      castHtml = `<div class="cast-section"><h3>Top Cast</h3><div class="cast-scroll">${castCards}</div></div>`;
    }

    // Render
    const genres = (detail.genres || []).map(g => `<span>${esc(g)}</span>`).join(' / ');
    const cornerHtml = detail.corner ? `<span class="detail-badge">${detail.corner}</span>` : '';

    contentArea.innerHTML = `
      <div class="detail-page">
        <div class="detail-top">
          <div class="detail-player-wrap">
            <div class="player-wrap">
              <div class="player-frame" id="playerFrame">
                <div id="artplayer-app"></div>
              </div>
            </div>
          </div>
          ${resourcesHtml}
        </div>
        <div class="detail-info">
          <div class="detail-title-row">
            <h1>${esc(detail.title || 'Untitled')}</h1>
          </div>
          <div class="detail-meta">
            ${cornerHtml}
            ${detail.year ? `<span>${detail.year}</span>` : ''}
            ${detail.country ? `<span>${detail.country}</span>` : ''}
            <span>${genres}</span>
          </div>
          ${detail.rating ? `<div style="margin-bottom:12px;"><span class="detail-rating">⭐ ${detail.rating}</span><span class="detail-rating-count">${(detail.ratingCount || 0).toLocaleString()} people rated</span></div>` : ''}
          ${detail.overview ? `<div class="detail-overview"><p>${esc(detail.overview)}</p></div>` : ''}
        </div>
        ${castHtml}
        <div class="playback-issue">
          <span>Having playback issues? Please contact us.</span>
          <button class="report-btn">⚠ Report</button>
        </div>
      </div>`;

    // Initialize player
    if (isEmbed) {
      initEmbedPlayer(playerSrc, resolutions);
    } else {
      initArtPlayer();
    }

    // Bind season/episode buttons
    bindSeasonEpisodeButtons(source, type, id);
    if (detail.type === 'tv') {
      setPlayingEpisode(1);
    }

    hideLoading();
  } catch (e) {
    console.error('Detail error:', e);
    contentArea.innerHTML = '<div class="no-results"><p>Failed to load</p></div>';
    hideLoading();
  }
}

// --- Embed player (iframe) ---
function initEmbedPlayer(src, servers) {
  const frame = document.getElementById('playerFrame');
  if (!frame) return;

  let serverBtnsHtml = '';
  if (servers.length > 1) {
    serverBtnsHtml = `<div class="server-selector" id="serverSelector">
      ${servers.map((s, i) => `<button class="server-btn${i === 0 ? ' active' : ''}" data-url="${s.url}">${s.name || s.label}</button>`).join('')}
    </div>`;
  }

  const playerWrap = frame.closest('.player-wrap');
  if (playerWrap && serverBtnsHtml) {
    playerWrap.insertAdjacentHTML('afterbegin', serverBtnsHtml);
    bindEmbedServerButtons();
  }

  frame.innerHTML = `<iframe id="movie-iframe" src="${src}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" style="width:100%;aspect-ratio:16/9;border:none;border-radius:12px;"></iframe>`;
}

function bindEmbedServerButtons() {
  document.querySelectorAll('#serverSelector .server-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#serverSelector .server-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const url = btn.dataset.url;
      if (url) {
        const frame = document.getElementById('playerFrame');
        if (frame) {
          frame.innerHTML = `<iframe id="movie-iframe" src="${url}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" style="width:100%;aspect-ratio:16/9;border:none;border-radius:12px;"></iframe>`;
        }
      }
    });
  });
}

// --- ArtPlayer initialization ---
function initArtPlayer() {
  const stream = window.__currentStream;
  if (!stream || !stream.src) return;

  if (window.__artPlayer) {
    window.__artPlayer.destroy();
    window.__artPlayer = null;
  }
  if (window.__dashPlayer) {
    try { window.__dashPlayer.reset(); } catch (e) {}
    window.__dashPlayer = null;
  }

  const container = document.getElementById('artplayer-app');
  if (!container) return;

  const src = stream.src;
  const type = stream.type || 'video/mp4';
  const isDASH = type === 'application/dash+xml';
  const resolutions = stream.resolutions || [];

  const qualityList = resolutions.map(r => ({
    default: r.height === 1080 || (resolutions.indexOf(r) === 0),
    html: r.label || `${r.height}p`,
    url: isDASH ? null : (r.url || src),
    height: r.height,
  }));

  const artOptions = {
    container: container,
    url: src,
    type: isDASH ? 'mpd' : (type === 'application/x-mpegURL' ? 'm3u8' : 'mp4'),
    autoplay: true,
    pip: true,
    autoSize: false,
    autoMini: true,
    fullscreen: true,
    fullscreenLock: true,
    mutex: true,
    backdrop: false,
    playsInline: true,
    autoPlayback: true,
    airplay: true,
    theme: '#1db954',
    volume: 0.7,
    lock: true,
    fastForward: true,
    autoOrientation: true,
    screenshot: false,
    setting: true,
    flip: true,
    playbackRate: true,
    aspectRatio: true,
    hotkey: true,
    subtitleOffset: true,
    miniProgressBar: false,
    useSSR: false,
    lock: false,
    settings: [],
    controls: [],
  };

  if (stream.captionData && stream.captionData.captions && stream.captionData.captions.length > 0) {
    const firstCap = stream.captionData.captions[0];
    const subUrl = `/api/proxy?url=${encodeURIComponent(firstCap.url)}`;
    artOptions.subtitle = {
      url: subUrl,
      type: 'srt',
      style: {
        color: '#fff',
        fontSize: '16px',
        fontFamily: 'sans-serif',
      },
      encoding: 'utf-8',
    };
  }

  const art = new Artplayer(artOptions);
  window.__artPlayer = art;

  addPlayerControls(art, stream);

  if (isDASH && typeof dashjs !== 'undefined') {
    try {
      const dashPlayer = dashjs.MediaPlayer().create();
      window.__dashPlayer = dashPlayer;

      dashPlayer.updateSettings({
        streaming: {
          abr: {
            autoSwitchBitrate: { video: true, audio: true },
          },
          bufferTimeAtTopQuality: 30,
          bufferTimeAtTopQualityLongForm: 60,
        },
      });

      dashPlayer.initialize(art.video, src, true);
      art.dash = dashPlayer;
      window.__dashReady = true;

      dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        const bitrateList = dashPlayer.getBitrateInfoListFor('video');
        if (bitrateList && bitrateList.length > 0) {
          window.__dashBitrates = bitrateList;
          updateQualityControl(bitrateList);
        }
      });

      console.log('ArtPlayer + dash.js initialized');
    } catch (e) {
      console.error('dash.js init failed:', e);
    }
  } else if (!isDASH && resolutions.length > 0 && !stream.isEmbed) {
    art.setting.add({
      name: 'Quality',
      width: 200,
      html: qualityList.map(q => `<div data-quality-url="${q.url}" data-quality-h="${q.height}" style="padding:8px 16px;cursor:pointer;">${q.html}</div>`).join(''),
      onSelect: function(item) {
        const url = item.dataset.qualityUrl;
        art.switchUrl(url);
        return item.innerHTML;
      },
    });
  }

  art.on('error', (error) => {
    console.error('ArtPlayer error:', error);
  });

  art.on('ready', () => {
    console.log('ArtPlayer ready');
  });
}

// --- Custom player controls ---
function addPlayerControls(art, stream) {
  const isDASH = stream.type === 'application/dash+xml';
  const resolutions = stream.resolutions || [];
  const captions = (stream.captionData && stream.captionData.captions) || [];
  const hasCaptions = captions.length > 0;

  if (hasCaptions) {
    const langMap = {};
    captions.forEach(cap => {
      const key = cap.lan || 'en';
      if (!langMap[key]) langMap[key] = cap.lanName || cap.lan || key;
    });
    const firstLang = captions[0].lanName || captions[0].lan || 'English';

    art.controls.add({
      name: 'lang-control',
      position: 'right',
      index: 8,
      style: {},
      html: `<div class="player-text-btn" id="langBtn">
        <span class="player-text-btn-label">${esc(firstLang)}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 5.5L7 2.5H1L4 5.5Z" fill="white" fill-opacity="0.8"/></svg>
      </div>`,
      click: function() {
        closeAllDropdowns();
        const dd = document.getElementById('langDropdown');
        if (dd) dd.classList.toggle('show');
      },
    });
  }

  if (hasCaptions) {
    art.controls.add({
      name: 'dualsub-control',
      position: 'right',
      index: 9,
      style: {},
      html: `<div class="player-text-btn" id="dualsubBtn">
        <span class="player-text-btn-label" id="dualsubLabel">DualSub</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 5.5L7 2.5H1L4 5.5Z" fill="white" fill-opacity="0.8"/></svg>
      </div>`,
      click: function() {
        closeAllDropdowns();
        const dd = document.getElementById('dualsubDropdown');
        if (dd) dd.classList.toggle('show');
      },
    });
  }

  const currentQuality = resolutions.length > 0
    ? (resolutions[0].label || resolutions[0].height + 'p')
    : (isDASH ? '1080p' : 'Auto');

  art.controls.add({
    name: 'quality-control',
    position: 'right',
    index: 10,
    style: {},
    html: `<div class="player-text-btn" id="qualityBtn">
      <span class="player-text-btn-label" id="qualityLabel">${esc(currentQuality)}</span>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 5.5L7 2.5H1L4 5.5Z" fill="white" fill-opacity="0.8"/></svg>
    </div>`,
    click: function() {
      closeAllDropdowns();
      const dd = document.getElementById('qualityDropdown');
      if (dd) dd.classList.toggle('show');
    },
  });

  setTimeout(() => {
    const playerEl = art.template.$player;
    if (!playerEl) return;

    const existing = playerEl.querySelector('.player-dropdowns');
    if (existing) existing.remove();

    const dropdowns = document.createElement('div');
    dropdowns.className = 'player-dropdowns';

    if (hasCaptions) {
      const langMap = {};
      captions.forEach(cap => {
        const key = cap.lan || 'en';
        if (!langMap[key]) langMap[key] = cap.lanName || cap.lan || key;
      });
      const langEntries = Object.entries(langMap);

      dropdowns.innerHTML += `
        <div class="player-dropdown" id="langDropdown">
          ${langEntries.map(([code, name], i) => `<div class="player-dropdown-item${i === 0 ? ' active' : ''}" data-lang="${esc(name)}">${esc(name)}</div>`).join('')}
        </div>`;
    }

    if (hasCaptions) {
      let subItems = '';
      subItems += `<div class="player-dropdown-item sub-off" data-sub-action="off">
        <span class="sub-icon">✕</span> Off
      </div>`;

      captions.forEach((cap, i) => {
        const label = cap.lanName || cap.lan || `Sub ${i + 1}`;
        const url = `/api/proxy?url=${encodeURIComponent(cap.url)}`;
        subItems += `<div class="player-dropdown-item" data-sub-action="load" data-sub-url="${esc(url)}" data-sub-label="${esc(label)}" data-sub-lang="${esc(cap.lan || 'en')}">
          ${esc(label)}
        </div>`;
      });

      subItems += `<div class="player-dropdown-item sub-upload" data-sub-action="upload">
        <span class="sub-icon">📁</span> Upload Subtitle (SRT/VTT)
      </div>`;

      dropdowns.innerHTML += `
        <div class="player-dropdown" id="dualsubDropdown">
          ${subItems}
        </div>`;
    }

    let qualityOptions = [];
    if (isDASH && window.__dashBitrates && window.__dashBitrates.length > 0) {
      qualityOptions = window.__dashBitrates.map(b => ({
        label: b.height + 'p',
        height: b.height,
        auto: false,
        available: true,
      }));
    } else if (resolutions.length > 0) {
      qualityOptions = resolutions.map(r => ({
        label: r.label || r.height + 'p',
        height: r.height,
        url: r.url || '',
        auto: false,
        available: !!(r.url && r.url.length > 0),
      }));
    }
    qualityOptions.push({ label: 'Auto', height: 0, auto: true, available: true });

    dropdowns.innerHTML += `
      <div class="player-dropdown" id="qualityDropdown">
        ${qualityOptions.map((q, i) => {
          const disabledClass = q.available === false ? ' sub-unavailable' : '';
          const activeClass = i === 0 ? ' active' : '';
          const vipTag = q.available === false ? ' <span class="vip-tag">VIP</span>' : '';
          return `<div class="player-dropdown-item${activeClass}${disabledClass}" data-qheight="${q.height}" data-qauto="${q.auto}" data-qurl="${q.url || ''}" data-qavailable="${q.available}">${q.label}${vipTag}</div>`;
        }).join('')}
      </div>`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.srt,.vtt,.ass,.ssa,.sub';
    fileInput.style.display = 'none';
    fileInput.id = 'customSubInput';
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result;
        const ext = file.name.split('.').pop().toLowerCase();
        const types = { srt: 'srt', vtt: 'vtt', ass: 'ass', ssa: 'ass', sub: 'srt' };
        const subType = types[ext] || 'srt';

        const blob = new Blob([content], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(blob);

        art.subtitle.url = blobUrl;
        art.subtitle.type = subType;
        art.subtitle.show = true;

        const dualsubLabel = document.getElementById('dualsubLabel');
        if (dualsubLabel) dualsubLabel.textContent = file.name.replace(/\.[^.]+$/, '');

        document.querySelectorAll('#dualsubDropdown .player-dropdown-item').forEach(i => i.classList.remove('active'));

        art.notice.show = `Subtitle loaded: ${file.name}`;
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
    playerEl.appendChild(fileInput);

    playerEl.appendChild(dropdowns);

    dropdowns.querySelectorAll('.player-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = item.closest('.player-dropdown');

        if (dd.id === 'dualsubDropdown') {
          const action = item.dataset.subAction;

          if (action === 'off') {
            art.subtitle.show = false;
            dd.querySelectorAll('.player-dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const dualsubLabel = document.getElementById('dualsubLabel');
            if (dualsubLabel) dualsubLabel.textContent = 'DualSub';
            const dualsubBtn = document.getElementById('dualsubBtn');
            if (dualsubBtn) dualsubBtn.classList.remove('active-control');
            art.notice.show = 'Subtitles: Off';
          } else if (action === 'load') {
            const subUrl = item.dataset.subUrl;
            const subLabel = item.dataset.subLabel;
            art.subtitle.url = subUrl;
            art.subtitle.type = 'srt';
            art.subtitle.show = true;
            dd.querySelectorAll('.player-dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const dualsubLabel = document.getElementById('dualsubLabel');
            if (dualsubLabel) dualsubLabel.textContent = subLabel;
            const dualsubBtn = document.getElementById('dualsubBtn');
            if (dualsubBtn) dualsubBtn.classList.add('active-control');
            art.notice.show = `Subtitle: ${subLabel}`;
          } else if (action === 'upload') {
            document.getElementById('customSubInput').click();
            return;
          }

          dd.classList.remove('show');
          return;
        }

        dd.querySelectorAll('.player-dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (dd.id === 'langDropdown') {
          const langBtn = document.querySelector('#langBtn .player-text-btn-label');
          if (langBtn) langBtn.textContent = item.dataset.lang;
        }

        if (dd.id === 'qualityDropdown') {
          const qAvailable = item.dataset.qavailable;

          if (qAvailable === 'false') {
            art.notice.show = 'This quality requires VIP access';
            dd.classList.remove('show');
            return;
          }

          const qualityLabel = document.getElementById('qualityLabel');
          const cleanText = item.textContent.replace('VIP', '').trim();
          if (qualityLabel) qualityLabel.textContent = cleanText;

          const qHeight = parseInt(item.dataset.qheight);
          const qAuto = item.dataset.qauto === 'true';
          const qUrl = item.dataset.qurl;

          if (isDASH && window.__dashPlayer) {
            if (qAuto) {
              window.__dashPlayer.updateSettings({
                streaming: { abr: { autoSwitchBitrate: { video: true } } },
              });
              art.notice.show = 'Quality: Auto';
            } else {
              window.__dashPlayer.updateSettings({
                streaming: { abr: { autoSwitchBitrate: { video: false } } },
              });
              const bitrates = window.__dashPlayer.getBitrateInfoListFor('video');
              if (bitrates) {
                for (let i = 0; i < bitrates.length; i++) {
                  if (bitrates[i].height === qHeight) {
                    window.__dashPlayer.setQualityFor('video', bitrates[i].qualityIndex);
                    art.notice.show = `Quality: ${qHeight}p`;
                    break;
                  }
                }
              }
            }
          } else if (qUrl) {
            art.switchUrl(qUrl);
            art.notice.show = `Quality: ${item.textContent}`;
          }
        }

        dd.classList.remove('show');
      });
    });
  }, 500);
}

function closeAllDropdowns() {
  document.querySelectorAll('.player-dropdown.show').forEach(d => d.classList.remove('show'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.player-text-btn') && !e.target.closest('.player-dropdown')) {
    closeAllDropdowns();
  }
});

function updateQualityControl(bitrates) {
  const qualityLabel = document.getElementById('qualityLabel');
  const qualityDropdown = document.getElementById('qualityDropdown');
  if (!qualityLabel || !qualityDropdown) return;

  const items = bitrates.map(b => `<div class="player-dropdown-item" data-qheight="${b.height}" data-qauto="false">${b.height}p</div>`).join('');
  const autoItem = `<div class="player-dropdown-item active" data-qheight="0" data-qauto="true">Auto</div>`;
  qualityDropdown.innerHTML = items + autoItem;

  qualityDropdown.querySelectorAll('.player-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      qualityDropdown.querySelectorAll('.player-dropdown-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      qualityLabel.textContent = item.textContent;

      const qHeight = parseInt(item.dataset.qheight);
      const qAuto = item.dataset.qauto === 'true';

      if (window.__dashPlayer) {
        if (qAuto) {
          window.__dashPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: true } } },
          });
          window.__artPlayer.notice.show = 'Quality: Auto';
        } else {
          window.__dashPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: false } } },
          });
          const list = window.__dashPlayer.getBitrateInfoListFor('video');
          if (list) {
            for (let i = 0; i < list.length; i++) {
              if (list[i].height === qHeight) {
                window.__dashPlayer.setQualityFor('video', list[i].qualityIndex);
                window.__artPlayer.notice.show = `Quality: ${qHeight}p`;
                break;
              }
            }
          }
        }
      }

      qualityDropdown.classList.remove('show');
    });
  });
}

// --- Season / Episode buttons ---
function bindSeasonEpisodeButtons(source, type, id) {
  let currentSeason = 1;
  let currentEp = 1;

  document.querySelectorAll('.season-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSeason = parseInt(tab.dataset.season);
      currentEp = 1;

      const seasonMap = window.__seasonMap || {};
      const maxEp = seasonMap[currentSeason] || 1;
      const grid = document.getElementById('episodeGrid');
      if (grid) {
        let html = '';
        for (let i = 1; i <= maxEp; i++) {
          html += `<button class="ep-btn${i === 1 ? ' active' : ''}" data-ep="${i}">${String(i).padStart(2, '0')}</button>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('.ep-btn').forEach(btn => {
          btn.addEventListener('click', () => loadEpisode(btn, source, id, () => currentSeason, (v) => { currentEp = v; }));
        });
      }
    });
  });

  document.querySelectorAll('.ep-btn').forEach(btn => {
    btn.addEventListener('click', () => loadEpisode(btn, source, id, () => currentSeason, (v) => { currentEp = v; }));
  });
}

function loadEpisode(btn, source, id, getSeason, setEp) {
  document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const ep = parseInt(btn.dataset.ep);
  setEp(ep);

  if (source === 'moviebox' && currentDetail?.slug && id) {
    const season = getSeason();
    const slug = currentDetail.slug;

    Promise.all([
      fetch(`/api/stream?subject_id=${id}&slug=${encodeURIComponent(slug)}&se=${season}&ep=${ep}`).then(r => r.json()),
      fetch(`/api/stream/${id}/captions?detail_path=${encodeURIComponent(slug)}&se=${season}&ep=${ep}`).then(r => r.json()).catch(() => null)
    ]).then(([streamData, captionData]) => {
      const validSources = (streamData.sources || []).filter(s => s.url && s.url.length > 0);
      const validDASH = (streamData.dash || []).filter(d => d.url && d.url.length > 0);
      const validHLS = (streamData.hls || []).filter(h => h.url && h.url.length > 0);

      let newSrc = '';
      let newType = '';
      let isDASH = false;

      if (validDASH.length > 0) {
        newSrc = validDASH[0].url;
        newType = 'application/dash+xml';
        isDASH = true;
      } else if (validSources.length > 0) {
        newSrc = `/api/proxy?url=${encodeURIComponent(validSources[0].url)}`;
        newType = 'video/mp4';
      } else if (validHLS.length > 0) {
        newSrc = validHLS[0].url;
        newType = 'application/x-mpegURL';
      }

      if (newSrc) {
        const resolutions = isDASH ? (window.__dashManifest?.resolutions || []) : validSources.map(s => ({
          height: parseInt(s.resolutions) || 0,
          label: s.resolution || s.resolutions + 'p',
          url: `/api/proxy?url=${encodeURIComponent(s.url)}`,
        }));

        window.__currentStream = {
          src: newSrc,
          type: newType,
          mp4Sources: validSources,
          dashUrl: validDASH.length > 0 ? validDASH[0].url : '',
          hlsUrl: validHLS.length > 0 ? validHLS[0].url : '',
          captionData: captionData,
          resolutions: resolutions,
          isEmbed: false,
        };

        initArtPlayer();
        setPlayingEpisode(ep);
      } else {
        fetch(`/api/tmdb-id?title=${encodeURIComponent(currentDetail?.title || '')}&type=tv`)
          .then(r => r.json())
          .then(tmdbResult => {
            const tmdbId = tmdbResult.tmdb_id;
            if (tmdbId) {
              const servers = getEmbedServers('tv', tmdbId, season, ep);
              window.__currentStream = {
                src: servers[0].url,
                resolutions: servers,
                isEmbed: true,
              };
              if (window.__artPlayer) {
                window.__artPlayer.destroy();
                window.__artPlayer = null;
              }
              if (window.__dashPlayer) {
                try { window.__dashPlayer.reset(); } catch (e) {}
                window.__dashPlayer = null;
              }
              initEmbedPlayer(servers[0].url, servers);
            }
          })
          .catch(() => {});
      }
    }).catch(() => {});
  }
}

function setPlayingEpisode(epNum) {
  document.querySelectorAll('.ep-btn').forEach(b => {
    b.classList.remove('playing', 'active');
    const n = parseInt(b.dataset.ep);
    if (n) b.innerHTML = String(n).padStart(2, '0');
  });
  const btn = document.querySelector(`.ep-btn[data-ep="${epNum}"]`);
  if (btn) {
    btn.classList.add('playing');
    btn.innerHTML = `<span class="equalizer"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>`;
  }
}

// --- Helpers ---
function showLoading() { loading.classList.remove('hidden'); }
function hideLoading() { loading.classList.add('hidden'); }
function esc(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }

// --- Init ---
loadPage();
