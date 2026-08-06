/* ===================================================================
   ApiForge — templates.js
   Handles search, Auth On/Off chip filter, multi-tag filter chips,
   popularity chips, shimmer loading, dynamic card rendering, and
   pagination for templates.html.
   =================================================================== */

// ─── Mock dataset ──────────────────────────────────────────────────────────────
const MOCK_TEMPLATES = [
  {
    id: 'tpl1',
    name: 'Auth & Permissions Starter',
    description: 'JWT-based authentication with role-based access control (RBAC), refresh token rotation, and audit log endpoints.',
    author: { name: 'Sarah Okafor', username: 'sarahokafor', initials: 'SO' },
    tags: ['auth', 'JWT', 'RBAC', 'security'],
    authEnabled: true,
    stars: 504,
    rating: 4.9,
    ratingCount: 148,
    createdAt: 'Jun 22, 2026',
    createdTimestamp: 1750550400000,
    useCount: 3210,
  },
  {
    id: 'tpl2',
    name: 'E-Commerce Checkout API',
    description: 'Cart, coupon, and checkout pipeline with Stripe & PayPal webhook handlers, tax calculation engine, and order state machine.',
    author: { name: 'Dave Kim', username: 'davekim', initials: 'DK' },
    tags: ['e-commerce', 'payments', 'REST', 'webhooks'],
    authEnabled: true,
    stars: 763,
    rating: 4.8,
    ratingCount: 210,
    createdAt: 'May 28, 2026',
    createdTimestamp: 1748390400000,
    useCount: 5870,
  },
  {
    id: 'tpl3',
    name: 'Real-Time Chat Backend',
    description: 'WebSocket-based messaging API with rooms, typing indicators, read receipts, message history, and file attachment endpoints.',
    author: { name: 'Julian Moreno', username: 'julianm', initials: 'JM' },
    tags: ['real-time', 'WebSocket', 'chat', 'messaging'],
    authEnabled: true,
    stars: 612,
    rating: 4.7,
    ratingCount: 187,
    createdAt: 'May 15, 2026',
    createdTimestamp: 1747267200000,
    useCount: 4120,
  },
  {
    id: 'tpl4',
    name: 'Multi-Tenant SaaS Scaffold',
    description: 'Workspace isolation, per-tenant plan enforcement, usage metering API, and team member invitation system.',
    author: { name: 'Ryan Patel', username: 'ryanp', initials: 'RP'},
    tags: ['SaaS', 'auth', 'billing', 'teams'],
    authEnabled: true,
    stars: 447,
    rating: 4.7,
    ratingCount: 131,
    createdAt: 'Apr 12, 2026',
    createdTimestamp: 1744416000000,
    useCount: 2980,
  },
  {
    id: 'tpl5',
    name: 'AI Content Generator API',
    description: 'Wrapper API over OpenAI and Anthropic models with streaming support, prompt caching, token metering, and safety filters.',
    author: { name: 'Priya Sharma', username: 'priyasharma', initials: 'PS' },
    tags: ['AI', 'REST', 'streaming', 'LLM'],
    authEnabled: true,
    stars: 891,
    rating: 4.9,
    ratingCount: 274,
    createdAt: 'Jul 01, 2026',
    createdTimestamp: 1751328000000,
    useCount: 7460,
  },
  {
    id: 'tpl6',
    name: 'Blog CMS API',
    description: 'Headless CMS REST API with markdown parsing, media asset management, category taxonomy, and nested comment threads.',
    author: { name: 'Sifat Hossain', username: 'sifat5532', initials: 'SH' },
    tags: ['CMS', 'REST', 'headless', 'media'],
    authEnabled: true,
    stars: 381,
    rating: 4.5,
    ratingCount: 112,
    createdAt: 'Jun 10, 2026',
    createdTimestamp: 1749513600000,
    useCount: 2450,
  },
  {
    id: 'tpl7',
    name: 'Inventory Manager Pro',
    description: 'Full-featured inventory API with SKU tracking, low-stock alerts, multi-warehouse support, and automated reorder triggers.',
    author: { name: 'Alex Rivera', username: 'alexr', initials: 'AR' },
    tags: ['inventory', 'e-commerce', 'REST', 'alerts'],
    authEnabled: true,
    stars: 218,
    rating: 4.3,
    ratingCount: 64,
    createdAt: 'Jul 14, 2026',
    createdTimestamp: 1752537600000,
    useCount: 1740,
  },
  {
    id: 'tpl8',
    name: 'Analytics & Reporting Engine',
    description: 'Clickstream event collector, funnel aggregation, custom report builder, and automated CSV/JSON export pipeline.',
    author: { name: 'Laura Chen', username: 'laurachen', initials: 'LC'},
    tags: ['analytics', 'AI', 'metrics', 'export'],
    authEnabled: false,
    stars: 299,
    rating: 4.4,
    ratingCount: 88,
    createdAt: 'Apr 30, 2026',
    createdTimestamp: 1746057600000,
    useCount: 2100,
  },
  {
    id: 'tpl9',
    name: 'Notification Hub',
    description: 'Omnichannel router for FCM push, Twilio SMS, and SendGrid email with template engine and delivery tracking.',
    author: { name: 'Julian Moreno', username: 'julianm', initials: 'JM' },
    tags: ['notifications', 'REST', 'email', 'SMS'],
    authEnabled: true,
    stars: 334,
    rating: 4.5,
    ratingCount: 97,
    createdAt: 'Mar 25, 2026',
    createdTimestamp: 1742860800000,
    useCount: 2600,
  },
  {
    id: 'tpl10',
    name: 'OAuth 2.0 Provider',
    description: 'Full OAuth 2.0 authorization server with PKCE, client credentials, device flow, and OpenID Connect discovery endpoint.',
    author: { name: 'Sarah Okafor', username: 'sarahokafor', initials: 'SO' },
    tags: ['auth', 'OAuth', 'security', 'OpenID'],
    authEnabled: true,
    stars: 572,
    rating: 4.8,
    ratingCount: 165,
    createdAt: 'Mar 10, 2026',
    createdTimestamp: 1741564800000,
    useCount: 3890,
  },
  {
    id: 'tpl11',
    name: 'File Storage & CDN API',
    description: 'S3-compatible file upload, chunked transfers, CDN URL signing, image resizing pipeline, and folder management endpoints.',
    author: { name: 'Alex Rivera', username: 'alexr', initials: 'AR' },
    tags: ['storage', 'REST', 'CDN', 'media'],
    authEnabled: true,
    stars: 406,
    rating: 4.6,
    ratingCount: 122,
    createdAt: 'Jul 20, 2026',
    createdTimestamp: 1753056000000,
    useCount: 2870,
  },
  {
    id: 'tpl12',
    name: 'AI Image Generation API',
    description: 'Stable Diffusion and DALL-E wrapper with prompt queuing, style presets, variation endpoints, and credit metering.',
    author: { name: 'Priya Sharma', username: 'priyasharma', initials: 'PS' },
    tags: ['AI', 'image', 'REST', 'queuing'],
    authEnabled: false,
    stars: 748,
    rating: 4.8,
    ratingCount: 221,
    createdAt: 'Jul 05, 2026',
    createdTimestamp: 1751673600000,
    useCount: 6120,
  },
  {
    id: 'tpl13',
    name: 'Booking & Scheduling API',
    description: 'Calendar availability engine, appointment booking, timezone handling, reminders, and cancellation flow with webhook hooks.',
    author: { name: 'Dave Kim', username: 'davekim', initials: 'DK'},
    tags: ['scheduling', 'REST', 'calendar', 'webhooks'],
    authEnabled: true,
    stars: 283,
    rating: 4.4,
    ratingCount: 76,
    createdAt: 'Jun 05, 2026',
    createdTimestamp: 1749081600000,
    useCount: 1950,
  },
  {
    id: 'tpl14',
    name: 'Realtime Leaderboard API',
    description: 'Redis-backed score board with live rank updates over SSE, seasonal resets, player stats, and embeddable widget endpoints.',
    author: { name: 'Ryan Patel', username: 'ryanp', initials: 'RP'},
    tags: ['real-time', 'gaming', 'REST', 'Redis'],
    authEnabled: false,
    stars: 197,
    rating: 4.2,
    ratingCount: 53,
    createdAt: 'May 02, 2026',
    createdTimestamp: 1746230400000,
    useCount: 1380,
  },
  {
    id: 'tpl15',
    name: 'No-Auth Public API Starter',
    description: 'Rate-limited public read-only API template — perfect for open datasets, static config delivery, and public status endpoints.',
    author: { name: 'Laura Chen', username: 'laurachen', initials: 'LC' },
    tags: ['public', 'REST', 'rate-limiting', 'starter'],
    authEnabled: false,
    stars: 164,
    rating: 4.1,
    ratingCount: 41,
    createdAt: 'Apr 18, 2026',
    createdTimestamp: 1744934400000,
    useCount: 1120,
  },
];

// ─── State ──────────────────────────────────────────────────────────────────────
let _page = 1;
let _perPage = 12;
let _searchQuery = '';
let _popularityFilter = 'popular'; // 'popular' | 'recent'
let _activeTags = new Set();       // multi-select; empty = all tags
let _authFilter = '';              // '' = all | 'on' = auth enabled | 'off' = no auth

// ─── Entry point ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTemplatesPage();
});

function initTemplatesPage() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;
  bindTemplateEvents();
  renderWithShimmer();
}

// ─── Event bindings ─────────────────────────────────────────────────────────────
function bindTemplateEvents() {
  // Search
  const searchInput = document.getElementById('tmpl-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _searchQuery = searchInput.value.trim().toLowerCase();
      _page = 1;
      renderTemplates();
    });
  }

  // Popularity chips (Popular / Recent) — mutually exclusive
  document.querySelectorAll('.tmpl-chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tmpl-chip[data-filter]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      _popularityFilter = btn.dataset.filter;
      _page = 1;
      renderTemplates();
    });
  });

  // Auth On / Off chips — toggle on click, deactivate on second click
  document.querySelectorAll('.tmpl-chip[data-auth]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.auth; // 'on' or 'off'
      if (_authFilter === val) {
        // clicking active chip again → clear filter
        _authFilter = '';
        btn.classList.remove('is-active');
      } else {
        // activate this chip, deactivate the other
        _authFilter = val;
        document.querySelectorAll('.tmpl-chip[data-auth]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      }
      _page = 1;
      renderTemplates();
    });
  });

  // Tag chips — multi-select (click to toggle; all deselected = show all)
  document.querySelectorAll('.tmpl-chip[data-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (_activeTags.has(tag)) {
        _activeTags.delete(tag);
        btn.classList.remove('is-active');
      } else {
        _activeTags.add(tag);
        btn.classList.add('is-active');
      }
      _page = 1;
      renderTemplates();
    });
  });

  // Per-page select
  const pageSizeSel = document.getElementById('tmpl-items-per-page');
  if (pageSizeSel) {
    pageSizeSel.addEventListener('change', () => {
      _perPage = parseInt(pageSizeSel.value, 10);
      _page = 1;
      renderTemplates();
    });
  }

  // Pagination buttons
  const btnPrev = document.getElementById('tmpl-btn-prev');
  const btnNext = document.getElementById('tmpl-btn-next');
  if (btnPrev) btnPrev.addEventListener('click', () => { _page--; renderTemplates(); });
  if (btnNext) btnNext.addEventListener('click', () => { _page++; renderTemplates(); });
}

// ─── Filtering & sorting ────────────────────────────────────────────────────────
function getFilteredTemplates() {
  let results = [...MOCK_TEMPLATES];

  // Search
  if (_searchQuery) {
    results = results.filter(t =>
      t.name.toLowerCase().includes(_searchQuery) ||
      t.description.toLowerCase().includes(_searchQuery) ||
      t.author.name.toLowerCase().includes(_searchQuery) ||
      t.author.username.toLowerCase().includes(_searchQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(_searchQuery))
    );
  }

  // Multi-tag filter — template must match ALL selected tags
  if (_activeTags.size > 0) {
    results = results.filter(t =>
      [..._activeTags].every(activeTag =>
        t.tags.some(tag => tag.toLowerCase() === activeTag.toLowerCase())
      )
    );
  }

  // Auth filter
  if (_authFilter === 'on') {
    results = results.filter(t => t.authEnabled);
  } else if (_authFilter === 'off') {
    results = results.filter(t => !t.authEnabled);
  }

  // Sort by popularity chip selection
  results.sort((a, b) => {
    if (_popularityFilter === 'recent') return b.createdTimestamp - a.createdTimestamp;
    return b.useCount - a.useCount; // 'popular' (default)
  });

  return results;
}

// ─── Shimmer loading ────────────────────────────────────────────────────────────
function renderWithShimmer() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  const count = 6;
  let shimmerHtml = '';
  for (let i = 0; i < count; i++) {
    shimmerHtml += `
      <div class="tmpl-card tmpl-card--shimmer" aria-hidden="true">
        <div class="tmpl-shimmer-line tmpl-shimmer-line--short"></div>
        <div class="tmpl-shimmer-line tmpl-shimmer-line--long"></div>
        <div class="tmpl-shimmer-line tmpl-shimmer-line--long"></div>
        <div class="tmpl-shimmer-tags">
          <div class="tmpl-shimmer-tag"></div>
          <div class="tmpl-shimmer-tag"></div>
          <div class="tmpl-shimmer-tag"></div>
        </div>
        <div class="tmpl-shimmer-footer"></div>
      </div>`;
  }
  container.innerHTML = shimmerHtml;

  const paginationInfo = document.getElementById('tmpl-pagination-info');
  if (paginationInfo) paginationInfo.textContent = 'Loading\u2026';

  setTimeout(() => renderTemplates(), 420);
}

// ─── Main render ────────────────────────────────────────────────────────────────
function renderTemplates() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  const filtered = getFilteredTemplates();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / _perPage));
  if (_page > totalPages) _page = totalPages;
  if (_page < 1) _page = 1;

  const start = (_page - 1) * _perPage;
  const end = Math.min(start + _perPage, total);
  const slice = filtered.slice(start, end);

  // Update count badge
  const countEl = document.getElementById('tmpl-total-count');
  if (countEl) {
    countEl.textContent = total > 0 ? total + ' template' + (total !== 1 ? 's' : '') : '';
  }

  // Render cards or empty state
  if (slice.length === 0) {
    container.innerHTML =
      '<div class="tmpl-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">' +
      '<path d="M12 2 3 7l9 5 9-5-9-5"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>' +
      '</svg>' +
      '<p>No templates match your filters.</p>' +
      '<button type="button" class="btn btn--ghost" id="tmpl-clear-filters">Clear filters</button>' +
      '</div>';
    const clearBtn = document.getElementById('tmpl-clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);
  } else {
    container.innerHTML = slice.map(t => createTemplateCardHtml(t)).join('');
  }

  updatePaginationUI(total, start, end, totalPages);
}

// ─── Card HTML builder ──────────────────────────────────────────────────────────
function createTemplateCardHtml(t) {
  var tagsHtml = t.tags.slice(0, 4).map(function(tag) {
    return '<span class="liked-tag">' + escapeHtml(tag) + '</span>';
  }).join('');

  var starsHtml = buildStarsHtml(t.rating);

  // Auth badge — matches projects.html style (Auth On / Auth Off)
  var authBadgeHtml = t.authEnabled
    ? '<span class="project-badge project-badge--auth">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        'Auth On</span>'
    : '<span class="project-badge project-badge--no-auth">Auth Off</span>';

  return '<article class="tmpl-card" id="tmpl-card-' + escapeHtml(t.id) + '">' +
    '<div class="tmpl-card__top">' +
      '<div class="tmpl-card__author-row">' +
        '<span class="liked-card__avatar" aria-hidden="true">' + escapeHtml(t.author.initials) + '</span>' +
        '<span class="tmpl-card__author-name">' + escapeHtml(t.author.name) + '</span>' +
        authBadgeHtml +
      '</div>' +
      '<h2 class="tmpl-card__title">' +
        '<a href="view-project.html?id=' + escapeHtml(t.id) + '" class="tmpl-card__title-link">' + escapeHtml(t.name) + '</a>' +
      '</h2>' +
      '<p class="tmpl-card__desc">' + escapeHtml(t.description) + '</p>' +
      '<div class="liked-card__tags tmpl-card__tags">' + tagsHtml + '</div>' +
    '</div>' +
    '<div class="tmpl-card__footer">' +
      '<div class="tmpl-card__rating" aria-label="Rating: ' + t.rating + ' out of 5 from ' + t.ratingCount + ' reviews">' +
        starsHtml +
        '<span class="tmpl-card__rating-val">' + t.rating.toFixed(1) + '</span>' +
        '<span class="tmpl-card__rating-count">(' + t.ratingCount + ')</span>' +
      '</div>' +
      '<div class="tmpl-card__meta">' +
        '<span class="tmpl-card__uses">' + formatUseCount(t.useCount) + ' uses</span>' +
        '<span class="tmpl-card__date">' + escapeHtml(t.createdAt) + '</span>' +
      '</div>' +
    '</div>' +
    '</article>';
}

// ─── Star rating builder ────────────────────────────────────────────────────────
function buildStarsHtml(rating) {
  var html = '';
  for (var i = 1; i <= 5; i++) {
    var filled = i <= Math.round(rating);
    html += '<span class="' + (filled ? 'notif-star--filled' : 'notif-star--empty') + '" aria-hidden="true">\u2605</span>';
  }
  return html;
}

// ─── Pagination UI ──────────────────────────────────────────────────────────────
function updatePaginationUI(total, start, end, totalPages) {
  const infoEl = document.getElementById('tmpl-pagination-info');
  if (infoEl) {
    infoEl.textContent = total === 0
      ? 'No templates found'
      : 'Showing ' + (start + 1) + '\u2013' + end + ' of ' + total + ' template' + (total !== 1 ? 's' : '');
  }

  const btnPrev = document.getElementById('tmpl-btn-prev');
  const btnNext = document.getElementById('tmpl-btn-next');
  if (btnPrev) btnPrev.disabled = _page <= 1;
  if (btnNext) btnNext.disabled = _page >= totalPages;

  const pagesContainer = document.getElementById('tmpl-pagination-pages');
  if (!pagesContainer) return;

  if (totalPages <= 1) {
    pagesContainer.innerHTML = '';
    return;
  }

  let pagesHtml = '';
  const maxVisible = 5;
  let startPage = Math.max(1, _page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  for (let i = startPage; i <= endPage; i++) {
    pagesHtml += '<button type="button" class="page-num' + (i === _page ? ' is-active' : '') + '" data-page="' + i + '" aria-label="Page ' + i + '"' + (i === _page ? ' aria-current="page"' : '') + '>' + i + '</button>';
  }
  pagesContainer.innerHTML = pagesHtml;

  pagesContainer.querySelectorAll('.page-num').forEach(btn => {
    btn.addEventListener('click', () => {
      _page = parseInt(btn.dataset.page, 10);
      renderTemplates();
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function clearAllFilters() {
  _searchQuery = '';
  _activeTags.clear();
  _authFilter = '';
  _popularityFilter = 'popular';
  _page = 1;

  const searchInput = document.getElementById('tmpl-search');
  if (searchInput) searchInput.value = '';

  // Reset popularity chips
  document.querySelectorAll('.tmpl-chip[data-filter]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.filter === 'popular');
  });

  // Reset auth chips
  document.querySelectorAll('.tmpl-chip[data-auth]').forEach(b => b.classList.remove('is-active'));

  // Reset tag chips
  document.querySelectorAll('.tmpl-chip[data-tag]').forEach(b => b.classList.remove('is-active'));

  renderTemplates();
}

function formatUseCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
