/* ===================================================================
   ApiForge — templates.js
   Handles search, dynamic card rendering, and pagination for templates.html.
   =================================================================== */

// ─── State ──────────────────────────────────────────────────────────────────────
let _page = 1;
let _perPage = 10;
let _searchQuery = '';
let _activeTab = 'all';            // 'all' | 'mine'
let _allTemplates = [];
let _allTemplatesTotal = 0;
let _allTemplatesLoading = false;
let _myTemplates = null;           // cached backend dataset for "mine" tab (null = not loaded)
let _myTemplatesLoading = false;

// Realtime backend search state
let _searchResults = null;         // array of normalized templates from /view/searchTemplate (null = not searching)
let _searchLoading = false;
let _searchToken = 0;              // guards against out-of-order responses
let _searchDebounce = null;

// ─── Entry point ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTemplatesPage();
});

function initTemplatesPage() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;
  bindTemplateEvents();
  renderTemplates();
}

// ─── Event bindings ─────────────────────────────────────────────────────────────
function bindTemplateEvents() {
  // Tab switcher (All Templates / My Templates)
  document.querySelectorAll('.tmpl-tabs .vp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tmpl-tabs .vp-tab').forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      _activeTab = tab.dataset.tab;
      _page = 1;
      renderTemplates();
    });
  });

  // Search — realtime backend search via /view/searchTemplate
  const searchInput = document.getElementById('tmpl-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const raw = searchInput.value.trim();
      _searchQuery = raw.toLowerCase();
      _page = 1;
      runRealtimeSearch(raw);
    });
  }

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

// ─── Main render ────────────────────────────────────────────────────────────────
function renderTemplates() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  if (_activeTab === 'mine') {
    renderMyTemplates();
    return;
  }

  if (_searchQuery) {
    renderSearchResults();
    return;
  }

  renderAllTemplates();
}

// ─── Toggle toolbar visibility per active tab ───────────────────────────────────
function toggleToolbarForTab() {
  const toolbar = document.querySelector('.tmpl-toolbar');
  if (toolbar) toolbar.style.display = _activeTab === 'mine' ? 'none' : '';
}

// ─── Realtime backend search (wired to /view/searchTemplate) ────────────────────
function runRealtimeSearch(rawQuery) {
  // Empty query → fall back to the normal mock listing immediately.
  if (!rawQuery) {
    _searchResults = null;
    if (_searchDebounce) clearTimeout(_searchDebounce);
    renderTemplates();
    return;
  }

  const token = ++_searchToken;

  // Debounce the network call so we only hit the backend when typing pauses.
  if (_searchDebounce) clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    _searchLoading = true;
    fetchSearchTemplates(rawQuery).then(data => {
      if (token !== _searchToken) return; // a newer search superseded this one
      _searchLoading = false;
      _searchResults = data;
      if (_activeTab === 'all') renderSearchResults();
    }).catch(err => {
      if (token !== _searchToken) return;
      _searchLoading = false;
      _searchResults = [];
      if (err && err.notFound) {
        // 404 — simply no matches; render the empty state
        if (_activeTab === 'all') renderSearchResults();
      } else {
        console.error('Template search failed:', err);
        if (_activeTab === 'all') renderSearchResults();
      }
    });
  }, 250);
}

function fetchSearchTemplates(queryStr) {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  return fetch(`${backendUrl}/view/searchTemplate?q=${encodeURIComponent(queryStr)}`, {
    credentials: 'include'
  }).then(res => {
    if (res.status === 404) {
      const e = new Error('NO template found');
      e.notFound = true;
      return Promise.reject(e);
    }
    if (!res.ok) return Promise.reject(new Error('Search request failed'));
    return res.json();
  }).then(payload => {
    const rows = (payload && payload.result) || [];
    return rows.map(normalizeSearchRow);
  });
}

// Map the backend search row into the card shape used by createTemplateCardHtml.
function normalizeSearchRow(row) {
  return {
    id: row.template_id,
    name: row.template_name || row.name,
    description: row.description || '',
    author: {
      id: row.author_id,
      name: row.author_name || 'Unknown',
      username: row.author_username || '',
      initials: buildInitials(row.author_name || '?')
    },
    tags: Array.isArray(row.template_tags)
      ? row.template_tags.map(t => (typeof t === 'string' ? t : t.name))
      : [],
    authEnabled: row.auth_enabled === true || row.auth_enabled === 'true',
    stars: 0,
    rating: Number(row.avg_ratings) || 0,
    ratingCount: Number(row.count_ratings) || 0,
    createdAt: formatOwnDate(row.template_created_at),
    createdTimestamp: row.template_created_at ? new Date(row.template_created_at).getTime() : 0,
    useCount: Number(row.total_clone) || 0
  };
}

function buildInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// Render the backend search results (replacing the mock dataset listing).
function renderSearchResults() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  if (_searchLoading && !_searchResults) {
    container.innerHTML = '';
    const infoEl = document.getElementById('tmpl-pagination-info');
    if (infoEl) infoEl.textContent = 'Searching…';
    return;
  }

  toggleToolbarForTab();

  const results = _searchResults || [];
  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / _perPage));
  if (_page > totalPages) _page = totalPages;
  if (_page < 1) _page = 1;

  const start = (_page - 1) * _perPage;
  const end = Math.min(start + _perPage, total);
  const slice = results.slice(start, end);

  const countEl = document.getElementById('tmpl-total-count');
  if (countEl) {
    countEl.textContent = total > 0 ? total + ' template' + (total !== 1 ? 's' : '') : '';
  }

  if (slice.length === 0) {
    container.innerHTML =
      '<div class="tmpl-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
      '</svg>' +
      '<p>No templates match "' + escapeHtml(_searchQuery) + '".</p>' +
      '<button type="button" class="btn btn--ghost" id="tmpl-clear-filters">Clear search</button>' +
      '</div>';
    const clearBtn = document.getElementById('tmpl-clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);
  } else {
    container.innerHTML = slice.map(t => createTemplateCardHtml(t)).join('');
  }

  updatePaginationUI(total, start, end, totalPages);
}

// ─── All Templates (fetched from backend via /view/allTemplates) ─────────────────
function renderAllTemplates() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;
  if (_allTemplatesLoading) return;

  toggleToolbarForTab();
  _allTemplatesLoading = true;
  container.innerHTML = '';
  const infoEl = document.getElementById('tmpl-pagination-info');
  if (infoEl) infoEl.textContent = 'Loading…';

  fetchAllTemplates(_page, _perPage).then(payload => {
    _allTemplatesLoading = false;
    _allTemplates = payload.templates;
    _allTemplatesTotal = payload.total;
    if (_activeTab === 'all' && !_searchQuery) paintAllTemplates();
  }).catch(err => {
    _allTemplatesLoading = false;
    _allTemplates = [];
    _allTemplatesTotal = 0;
    console.error('Failed to load templates:', err);
    if (_activeTab === 'all' && !_searchQuery) paintAllTemplates();
  });
}

function paintAllTemplates() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  toggleToolbarForTab();

  const total = _allTemplatesTotal;
  const totalPages = Math.max(1, Math.ceil(total / _perPage));
  if (_page > totalPages) {
    _page = totalPages;
    renderAllTemplates();
    return;
  }
  if (_page < 1) _page = 1;

  const start = total === 0 ? 0 : (_page - 1) * _perPage;
  const end = start + _allTemplates.length;

  const countEl = document.getElementById('tmpl-total-count');
  if (countEl) {
    countEl.textContent = total > 0 ? total + ' template' + (total !== 1 ? 's' : '') : '';
  }

  if (_allTemplates.length === 0) {
    container.innerHTML =
      '<div class="tmpl-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">' +
      '<path d="M12 2 3 7l9 5 9-5-9-5"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>' +
      '</svg>' +
      '<p>No templates found.</p>' +
      '</div>';
  } else {
    container.innerHTML = _allTemplates.map(t => createTemplateCardHtml(t)).join('');
  }

  updatePaginationUI(total, start, end, totalPages);
}

function fetchAllTemplates(page, limit) {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  return fetch(`${backendUrl}/view/allTemplates?page=${page}&limit=${limit}`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(payload => {
      const templates = (payload && payload.templates) || [];
      return {
        total: Number(payload && payload.total) || 0,
        templates: templates.map(row => ({
          id: row.id,
          name: row.template_name,
          description: row.description,
          author: {
            id: row.author_id,
            name: row.author_name || 'Unknown',
            username: row.author_username || '',
            initials: buildInitials(row.author_name || '?')
          },
          tags: Array.isArray(row.template_tags)
            ? row.template_tags.map(t => (typeof t === 'string' ? t : t.name))
            : [],
          authEnabled: !!row.auth_enabled,
          stars: 0,
          rating: Number(row.avg_ratings) || 0,
          ratingCount: Number(row.count_ratings) || 0,
          createdAt: formatOwnDate(row.created_at),
          createdTimestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
          useCount: Number(row.total_clone) || 0
        }))
      };
    });
}

// ─── My Templates (fetched from backend via /view/ownTemplates) ─────────────────
function renderMyTemplates() {
  const container = document.getElementById('tmpl-container');
  if (!container) return;

  const toolbar = document.querySelector('.tmpl-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  if (_myTemplatesLoading) return;

  if (_myTemplates === null) {
    _myTemplatesLoading = true;
    container.innerHTML = '';
    const infoEl = document.getElementById('tmpl-pagination-info');
    if (infoEl) infoEl.textContent = 'Loading…';

    fetchOwnTemplates().then(data => {
      _myTemplatesLoading = false;
      _myTemplates = data;
      if (_activeTab === 'mine') renderMyTemplates();
    }).catch(() => {
      _myTemplatesLoading = false;
      _myTemplates = [];
      if (_activeTab === 'mine') renderMyTemplates();
    });
    return;
  }

  const total = _myTemplates.length;
  const totalPages = Math.max(1, Math.ceil(total / _perPage));
  if (_page > totalPages) _page = totalPages;
  if (_page < 1) _page = 1;

  const start = (_page - 1) * _perPage;
  const end = Math.min(start + _perPage, total);
  const slice = _myTemplates.slice(start, end);

  const countEl = document.getElementById('tmpl-total-count');
  if (countEl) countEl.textContent = total > 0 ? total + ' template' + (total !== 1 ? 's' : '') : '';

  if (slice.length === 0) {
    container.innerHTML =
      '<div class="tmpl-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">' +
      '<path d="M12 2 3 7l9 5 9-5-9-5"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>' +
      '</svg>' +
      '<p>You haven\'t created any templates yet.</p>' +
      '</div>';
  } else {
    container.innerHTML = slice.map(t => createOwnTemplateCardHtml(t)).join('');
  }

  updatePaginationUI(total, start, end, totalPages);
}

function fetchOwnTemplates() {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  return fetch(`${backendUrl}/view/ownTemplates?page=1&limit=1000`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(payload => {
      const templates = (payload && payload.templates) || [];
      return templates.map(row => ({
        id: row.id,
        name: row.template_name,
        description: row.description,
        authEnabled: !!row.auth_enabled,
        rating: Number(row.avg_ratings) || 0,
        useCount: Number(row.clone_count) || 0,
        createdAt: formatOwnDate(row.created_at),
        tags: Array.isArray(row.template_tags)
          ? row.template_tags.map(t => (typeof t === 'string' ? t : t.name))
          : []
      }));
    });
}

function formatOwnDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return iso;
  }
}

// Card for the user's own templates — same style as templates.html, no author name
function createOwnTemplateCardHtml(t) {
  const tagsHtml = (t.tags || []).slice(0, 4).map(tag =>
    '<span class="liked-tag">' + escapeHtml(tag) + '</span>'
  ).join('');

  const starsHtml = buildStarsHtml(t.rating);

  const authBadgeHtml = t.authEnabled
    ? '<span class="project-badge project-badge--auth">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        'Auth On</span>'
    : '<span class="project-badge project-badge--no-auth">Auth Off</span>';

  return '<article class="tmpl-card" id="tmpl-card-' + escapeHtml(t.id) + '">' +
    '<div class="tmpl-card__top">' +
      '<div class="tmpl-card__author-row">' +
        authBadgeHtml +
      '</div>' +
      '<h2 class="tmpl-card__title">' +
        '<a href="/template/' + escapeHtml(t.id) + '" class="tmpl-card__title-link">' + escapeHtml(t.name) + '</a>' +
      '</h2>' +
      '<p class="tmpl-card__desc">' + escapeHtml(t.description) + '</p>' +
      '<div class="liked-card__tags tmpl-card__tags">' + tagsHtml + '</div>' +
    '</div>' +
    '<div class="tmpl-card__footer">' +
      '<div class="tmpl-card__rating" aria-label="Rating: ' + t.rating + ' out of 5">' +
        starsHtml +
        '<span class="tmpl-card__rating-val">' + Number(t.rating).toFixed(1) + '</span>' +
      '</div>' +
      '<div class="tmpl-card__meta">' +
        '<span class="tmpl-card__uses">' + formatUseCount(t.useCount) + ' clones</span>' +
        '<span class="tmpl-card__date">' + escapeHtml(t.createdAt) + '</span>' +
      '</div>' +
    '</div>' +
    '</article>';
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
        '<a href="/template/' + escapeHtml(t.id) + '" class="tmpl-card__title-link">' + escapeHtml(t.name) + '</a>' +
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
  _searchResults = null;
  _searchLoading = false;
  _searchToken++;
  if (_searchDebounce) { clearTimeout(_searchDebounce); _searchDebounce = null; }
  _page = 1;

  const searchInput = document.getElementById('tmpl-search');
  if (searchInput) searchInput.value = '';

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
