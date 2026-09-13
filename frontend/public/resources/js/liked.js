/* ===================================================================
   ApiForge — liked.js
   Loads the user's liked templates from the backend (/view/likedTemplates),
   sending page + limit so the server paginates. Search and sort are applied
   client-side on the current page; pagination, page size and navigation
   re-fetch from the backend. Clicking a template name or the "View" button
   navigates to /template/:id (view-template.html). Unliking calls the
   backend and removes the card from the current page.
   =================================================================== */

// ─── App state ──────────────────────────────────────────────────────────────────
const likedState = {
  searchQuery: '',
  sortOption: 'liked',
  sortDir: 'desc',
  currentPage: 1,
  pageSize: 10,
  total: 0,         // total liked templates from the backend (ignores local search)
  isLoading: false,
  data: [],         // normalized templates for the current page (from backend)
  error: null
};

const likedApiBase = window.BACKEND_URL || 'http://localhost:3000';

// ─── Entry point ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLikedPage();
});

function initLikedPage() {
  const container = document.getElementById('liked-container');
  if (!container) return; // Guard: only run on liked.html

  bindLikedEvents();
  renderLikedWithShimmer();
}

// ─── Event bindings ─────────────────────────────────────────────────────────────
function bindLikedEvents() {
  // Search input — server still returns the full (paginated) set, so we
  // filter the current page locally and reset to page 1.
  const searchInput = document.getElementById('liked-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      likedState.searchQuery = e.target.value.trim().toLowerCase();
      renderLiked();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('liked-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      likedState.sortOption = e.target.value;
      renderLiked();
    });
  }

  // Sort direction toggle
  const sortDirBtn = document.getElementById('liked-sort-dir');
  if (sortDirBtn) {
    sortDirBtn.addEventListener('click', () => {
      likedState.sortDir = likedState.sortDir === 'desc' ? 'asc' : 'desc';
      const iconDesc = document.getElementById('liked-sort-icon-desc');
      const iconAsc  = document.getElementById('liked-sort-icon-asc');
      if (likedState.sortDir === 'desc') {
        if (iconDesc) iconDesc.style.display = 'block';
        if (iconAsc)  iconAsc.style.display  = 'none';
      } else {
        if (iconDesc) iconDesc.style.display = 'none';
        if (iconAsc)  iconAsc.style.display  = 'block';
      }
      renderLiked();
    });
  }

  // Items per page — re-fetch from backend with new page size
  const pageSizeSelect = document.getElementById('liked-items-per-page');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      likedState.pageSize = parseInt(e.target.value, 10);
      likedState.currentPage = 1;
      renderLikedWithShimmer();
    });
  }

  // Pagination prev / next
  const btnPrev = document.getElementById('liked-btn-prev');
  const btnNext = document.getElementById('liked-btn-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (likedState.currentPage > 1) {
        likedState.currentPage--;
        renderLikedWithShimmer();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const totalPages = Math.ceil(likedState.total / likedState.pageSize) || 1;
      if (likedState.currentPage < totalPages) {
        likedState.currentPage++;
        renderLikedWithShimmer();
      }
    });
  }
}

// ─── Backend fetch ───────────────────────────────────────────────────────────────
async function fetchLikedTemplates() {
  const params = new URLSearchParams({
    page: String(likedState.currentPage),
    limit: String(likedState.pageSize)
  });
  const res = await fetch(`${likedApiBase}/view/likedTemplates?${params.toString()}`, {
    method: 'GET',
    credentials: 'include'
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  const payload = await res.json();
  if (!res.ok) {
    throw new Error((payload && payload.msg) || 'Failed to load liked templates');
  }
  return {
    rows: Array.isArray(payload.templates) ? payload.templates : [],
    total: Number(payload.total) || 0
  };
}

function normalizeTemplate(raw) {
  const tags = Array.isArray(raw.template_tags)
    ? raw.template_tags.map(t => (t && t.name) || t)
    : [];
  const createdTs = raw.created_at ? new Date(raw.created_at).getTime() : 0;
  const likedTs   = raw.liked_at   ? new Date(raw.liked_at).getTime()   : 0;
  return {
    id: raw.id,
    name: raw.template_name || raw.name || 'Untitled template',
    description: raw.description || '',
    author: {
      name: raw.author_name || raw.author || 'Unknown',
      username: raw.author_username || '',
      initials: getInitials(raw.author_name || raw.author || '?')
    },
    tags,
    createdAt: formatDate(raw.created_at),
    createdTimestamp: isNaN(createdTs) ? 0 : createdTs,
    likedAt: formatDate(raw.liked_at),
    likedTimestamp: isNaN(likedTs) ? 0 : likedTs,
    stars: Number(raw.avg_ratings) || 0,
    authEnabled: !!raw.auth_enabled
  };
}

function getInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '?';
}

// ─── Data helpers (local search + sort on the current page) ───────────────────────
function getFilteredLiked() {
  let items = [...likedState.data];

  // Search filter — name, tags, author name
  if (likedState.searchQuery) {
    const q = likedState.searchQuery;
    items = items.filter(t => {
      const nameMatch   = t.name.toLowerCase().includes(q);
      const authorMatch = t.author.name.toLowerCase().includes(q);
      const tagMatch    = t.tags.some(tag => tag.toLowerCase().includes(q));
      const descMatch   = t.description.toLowerCase().includes(q);
      return nameMatch || authorMatch || tagMatch || descMatch;
    });
  }

  // Sort
  items.sort((a, b) => {
    let result = 0;
    switch (likedState.sortOption) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'created':
        result = (a.createdTimestamp || 0) - (b.createdTimestamp || 0);
        break;
      case 'author':
        result = a.author.name.localeCompare(b.author.name);
        break;
      case 'liked':
      default:
        result = (a.likedTimestamp || 0) - (b.likedTimestamp || 0);
        break;
    }
    return likedState.sortDir === 'desc' ? -result : result;
  });

  return items;
}

// ─── Shimmer loader (fetches a server page) ───────────────────────────────────────
function renderLikedWithShimmer() {
  const container = document.getElementById('liked-container');
  if (!container) return;

  likedState.isLoading = true;

  let shimmerHtml = '';
  for (let i = 0; i < 6; i++) {
    shimmerHtml += `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-box" style="width: 40px; height: 40px; border-radius: 50%; margin-bottom: 14px;"></div>
        <div class="skeleton-box skeleton-box--title"></div>
        <div class="skeleton-box skeleton-box--desc"></div>
        <div class="skeleton-box skeleton-box--route"></div>
        <div class="skeleton-box skeleton-box--stat"></div>
      </div>
    `;
  }
  container.innerHTML = shimmerHtml;

  fetchLikedTemplates()
    .then(payload => {
      if (payload == null) return; // redirect already handled
      likedState.data = payload.rows.map(normalizeTemplate);
      likedState.total = payload.total;
      likedState.error = null;
    })
    .catch(err => {
      likedState.error = err.message || 'Failed to load liked templates';
      likedState.data = [];
    })
    .finally(() => {
      likedState.isLoading = false;
      renderLiked();
    });
}

// ─── Main render ─────────────────────────────────────────────────────────────────
function renderLiked() {
  const container = document.getElementById('liked-container');
  if (!container || likedState.isLoading) return;

  const filtered    = getFilteredLiked();
  const totalCount  = filtered.length; // items on the current page after local search
  const totalPages  = Math.ceil(likedState.total / likedState.pageSize) || 1;

  // Clamp current page to valid range
  if (likedState.total > 0 && likedState.currentPage > totalPages) {
    likedState.currentPage = totalPages;
  }

  // "Showing X–Y of Z" is based on the backend total for accurate pagination,
  // but if a local search is active we reflect the filtered page count instead.
  let startIndex = (likedState.currentPage - 1) * likedState.pageSize;
  let endIndex   = Math.min(startIndex + likedState.pageSize, likedState.total);
  let pageItems  = likedState.data;

  if (likedState.searchQuery) {
    startIndex = 0;
    endIndex   = totalCount;
    pageItems  = filtered;
  } else {
    // When no search, the server page is already sorted; honor local sort.
    pageItems  = filtered;
  }

  // Update header count badge (total liked across all pages)
  const countEl = document.getElementById('liked-total-count');
  if (countEl) {
    const n = likedState.total;
    countEl.textContent = n === 1 ? '1 template liked' : `${n} templates liked`;
  }

  if (likedState.error) {
    container.innerHTML = `
      <div class="projects-empty" style="grid-column: 1 / -1;">
        <h3 class="projects-empty__title">Couldn't load liked templates</h3>
        <p class="projects-empty__text">${escapeHtml(likedState.error)}</p>
        <button class="btn btn--ghost btn--sm" id="liked-retry" type="button">Try again</button>
      </div>
    `;
    const retryBtn = document.getElementById('liked-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        likedState.error = null;
        renderLikedWithShimmer();
      });
    }
  } else if (totalCount === 0) {
    container.innerHTML = `
      <div class="projects-empty" style="grid-column: 1 / -1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="projects-empty__icon">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <h3 class="projects-empty__title">${likedState.searchQuery ? 'No results found' : 'No liked templates'}</h3>
        <p class="projects-empty__text">
          ${likedState.searchQuery
            ? `Nothing matched "<strong>${escapeHtml(likedState.searchQuery)}</strong>". Try a different name, tag, or author.`
            : 'You haven\'t liked any templates yet. Head to the Templates page to discover and like some.'}
        </p>
        ${likedState.searchQuery ? `
          <button class="btn btn--ghost btn--sm" id="liked-reset-search" type="button">Clear search</button>
        ` : `
          <a href="/templates" class="btn btn--primary btn--sm">Browse Templates →</a>
        `}
      </div>
    `;

    const resetBtn = document.getElementById('liked-reset-search');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        likedState.searchQuery = '';
        const searchInput = document.getElementById('liked-search');
        if (searchInput) searchInput.value = '';
        renderLiked();
      });
    }
  } else {
    container.innerHTML = pageItems.map(t => createLikedCardHtml(t)).join('');
    bindLikedCardActions();
  }

  updateLikedPaginationUI(startIndex, endIndex, likedState.total, totalPages);
}

// ─── Card HTML builder ───────────────────────────────────────────────────────────
function createLikedCardHtml(t) {
  const tagsHtml = t.tags
    .map(tag => `<span class="tag liked-tag">${escapeHtml(tag)}</span>`)
    .join('');

  const starsHtml = t.stars
    ? `
      <span class="liked-card__stars">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:13px;height:13px;color:var(--accent-light);">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
        ${t.stars.toFixed(1)}
      </span>
    `
    : '';

  return `
    <article class="project-card liked-card" id="liked-card-${escapeHtml(t.id)}">

      <!-- Author row -->
      <div class="liked-card__author">
        <span class="liked-card__avatar" aria-hidden="true">${escapeHtml(t.author.initials)}</span>
        <div class="liked-card__author-info">
          <span class="liked-card__author-name">${escapeHtml(t.author.name)}</span>
          <span class="liked-card__author-handle">@${escapeHtml(t.author.username)}</span>
        </div>
        <button
          class="liked-card__unlike-btn"
          data-id="${escapeHtml(t.id)}"
          type="button"
          title="Unlike this template"
          aria-label="Unlike ${escapeHtml(t.name)}"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:15px;height:15px;">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>

      <!-- Template name (link to view-template.html) -->
      <div>
        <h3 class="project-card__title liked-card__title">
          <a href="/template/${escapeHtml(t.id)}">${escapeHtml(t.name)}</a>
        </h3>
      </div>

      <!-- Description -->
      <p class="project-card__desc liked-card__desc">${escapeHtml(t.description)}</p>

      <!-- Tags -->
      <div class="liked-card__tags template-card__tags">
        ${tagsHtml}
      </div>

      <!-- Footer: created date + stars + view link -->
      <div class="project-card__footer liked-card__footer">
        <span class="liked-card__date">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <path d="M16 2v4M8 2v4M3 10h18"></path>
          </svg>
          ${escapeHtml(t.createdAt)}
        </span>
        ${starsHtml}
        <a href="/template/${escapeHtml(t.id)}" class="btn btn--ghost btn--sm liked-card__open-btn">View →</a>
      </div>

    </article>
  `;
}

// ─── Card action bindings ─────────────────────────────────────────────────────────
function bindLikedCardActions() {
  document.querySelectorAll('.liked-card__unlike-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const id   = btn.getAttribute('data-id');
      const card = document.getElementById(`liked-card-${id}`);
      if (!id || !card) return;

      // Animate out
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      card.style.opacity    = '0';
      card.style.transform  = 'scale(0.96)';

      try {
        await fetch(`${likedApiBase}/template/like`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: id })
        });
      } catch (_) { /* swallow — optimistic removal */ }

      // Remove from the current page and refresh counts, then re-render.
      likedState.data = likedState.data.filter(t => String(t.id) !== String(id));
      likedState.total = Math.max(0, likedState.total - 1);
      setTimeout(() => renderLiked(), 200);
    });
  });
}

// ─── Pagination UI ───────────────────────────────────────────────────────────────
function updateLikedPaginationUI(startIndex, endIndex, totalCount, totalPages) {
  const infoEl        = document.getElementById('liked-pagination-info');
  const btnPrev       = document.getElementById('liked-btn-prev');
  const btnNext       = document.getElementById('liked-btn-next');
  const pagesContainer = document.getElementById('liked-pagination-pages');

  if (infoEl) {
    infoEl.textContent = totalCount === 0
      ? 'Showing 0–0 of 0 templates'
      : `Showing ${startIndex + 1}–${endIndex} of ${totalCount} templates`;
  }

  if (btnPrev) btnPrev.disabled = likedState.currentPage <= 1;
  if (btnNext) btnNext.disabled = likedState.currentPage >= totalPages || totalCount === 0;

  if (pagesContainer) {
    if (totalPages <= 1) {
      pagesContainer.innerHTML = '';
      return;
    }

    let pagesHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      const activeClass = i === likedState.currentPage ? 'is-active' : '';
      pagesHtml += `<button class="page-num ${activeClass}" data-page="${i}" type="button">${i}</button>`;
    }
    pagesContainer.innerHTML = pagesHtml;

    pagesContainer.querySelectorAll('.page-num').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(btn.getAttribute('data-page'), 10);
        if (targetPage !== likedState.currentPage) {
          likedState.currentPage = targetPage;
          renderLikedWithShimmer();
        }
      });
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
