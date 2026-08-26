/* ===================================================================
   ApiForge — projects.js
   Handles interactive Tab navigation, Search & Filtering,
   Skeleton shimmer loading states, Dynamic card rendering, and Pagination
   for projects.html.
   Fetches real data from GET /view/allProjects (requires auth cookie).
   Redirects to /login on 401.
   =================================================================== */

// App State
const state = {
  activeTab: 'my-projects', // 'my-projects' | 'shared-projects'
  searchQuery: '',
  sortOption: 'updated',
  sortDir: 'desc',
  authFilter: 'all', // 'all' | 'auth-on' | 'auth-off'
  currentPage: 1,
  pageSize: 10,
  isLoading: false,
  myProjectsData: [],
  sharedProjectsData: [],
};

document.addEventListener('DOMContentLoaded', () => {
  initProjectsPage();
});

async function initProjectsPage() {
  const container = document.getElementById('projects-container');
  if (!container) return; // Guard for non-projects pages

  bindEvents();
  await fetchAndRenderProjects();
}

/* -----------------------------------------------------------------------
   Data fetching
----------------------------------------------------------------------- */

async function fetchAndRenderProjects() {
  const container = document.getElementById('projects-container');
  if (!container) return;

  renderShimmer(container);

  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';

  try {
    const res = await fetch(
      `${backendUrl}/view/allProjects`, // fetch all; pagination is client-side
      { credentials: 'include' }
    );

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!res.ok) {
      renderFetchError(container, 'Failed to load projects. Please try again.');
      return;
    }

    const data = await res.json();
    state.myProjectsData = (data.projects || []).map(mapProject);

  } catch (err) {
    renderFetchError(container, 'Network error. Is the backend reachable?');
    return;
  }

  updateTabBadges();
  state.isLoading = false;
  renderProjects();
}

/**
 * Normalises a backend project row into the shape expected by the card renderer.
 */
function mapProject(p) {
  const updatedAt = p.last_updated_at || p.created_at;
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    route: `/api/${p.name}`,
    tablesCount: parseInt(p.total_tables, 10) || 0,
    apisCount: parseInt(p.total_apis, 10) || 0,
    authEnabled: p.auth_enabled,
    subscriptionStatus: p.subscription_status || 'active', // 'active' | 'locked'
    createdAt: formatDate(p.created_at),
    createdTimestamp: new Date(p.created_at).getTime(),
    updatedAt: formatRelativeTime(updatedAt),
    updatedTimestamp: new Date(updatedAt).getTime(),
    updatedBy: p.last_updater_name || '',
  };
}

/* -----------------------------------------------------------------------
   Tab badges
----------------------------------------------------------------------- */

function updateTabBadges() {
  const myCountEl = document.getElementById('count-my-projects');
  const sharedCountEl = document.getElementById('count-shared-projects');
  if (myCountEl) myCountEl.textContent = state.myProjectsData.length;
  if (sharedCountEl) sharedCountEl.textContent = state.sharedProjectsData.length;
}

/* -----------------------------------------------------------------------
   Event bindings
----------------------------------------------------------------------- */

function bindEvents() {
  // Tab buttons
  const tabMy = document.getElementById('tab-my-projects');
  const tabShared = document.getElementById('tab-shared-projects');

  if (tabMy) {
    tabMy.addEventListener('click', () => {
      if (state.activeTab === 'my-projects') return;
      state.activeTab = 'my-projects';
      state.currentPage = 1;
      tabMy.classList.add('is-active');
      tabMy.setAttribute('aria-selected', 'true');
      if (tabShared) {
        tabShared.classList.remove('is-active');
        tabShared.setAttribute('aria-selected', 'false');
      }
      renderProjects();
    });
  }

  if (tabShared) {
    tabShared.addEventListener('click', () => {
      if (state.activeTab === 'shared-projects') return;
      state.activeTab = 'shared-projects';
      state.currentPage = 1;
      tabShared.classList.add('is-active');
      tabShared.setAttribute('aria-selected', 'true');
      if (tabMy) {
        tabMy.classList.remove('is-active');
        tabMy.setAttribute('aria-selected', 'false');
      }
      renderProjects();
    });
  }

  // Search input
  const searchInput = document.getElementById('project-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      state.currentPage = 1;
      renderProjects();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('project-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortOption = e.target.value;
      state.currentPage = 1;
      renderProjects();
    });
  }

  // Sort direction toggle
  const sortDirBtn = document.getElementById('project-sort-dir');
  if (sortDirBtn) {
    sortDirBtn.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      const iconDesc = document.getElementById('sort-icon-desc');
      const iconAsc = document.getElementById('sort-icon-asc');
      if (state.sortDir === 'desc') {
        if (iconDesc) iconDesc.style.display = 'block';
        if (iconAsc) iconAsc.style.display = 'none';
      } else {
        if (iconDesc) iconDesc.style.display = 'none';
        if (iconAsc) iconAsc.style.display = 'block';
      }
      state.currentPage = 1;
      renderProjects();
    });
  }

  // Filter dropdown
  const filterSelect = document.getElementById('project-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.authFilter = e.target.value;
      state.currentPage = 1;
      renderProjects();
    });
  }

  // Page size select
  const pageSizeSelect = document.getElementById('items-per-page');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10);
      state.currentPage = 1;
      renderProjects();
    });
  }

  // Pagination Next / Prev buttons
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderProjects();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const filtered = getFilteredProjects();
      const totalPages = Math.ceil(filtered.length / state.pageSize) || 1;
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderProjects();
      }
    });
  }
}

/* -----------------------------------------------------------------------
   Filtering & sorting
----------------------------------------------------------------------- */

function getActiveSourceData() {
  return state.activeTab === 'my-projects' ? state.myProjectsData : state.sharedProjectsData;
}

function getFilteredProjects() {
  const source = getActiveSourceData();
  let filtered = source.filter(project => {
    // Auth filter
    if (state.authFilter === 'auth-on' && !project.authEnabled) return false;
    if (state.authFilter === 'auth-off' && project.authEnabled) return false;

    // Search query
    if (state.searchQuery) {
      const nameMatch = project.name.toLowerCase().includes(state.searchQuery);
      const routeMatch = project.route.toLowerCase().includes(state.searchQuery);
      const descMatch = project.description.toLowerCase().includes(state.searchQuery);
      return nameMatch || routeMatch || descMatch;
    }

    return true;
  });

  filtered.sort((a, b) => {
    let result = 0;
    switch (state.sortOption) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'created':
        result = (a.createdTimestamp || 0) - (b.createdTimestamp || 0);
        break;
      case 'updated':
      default:
        result = (a.updatedTimestamp || 0) - (b.updatedTimestamp || 0);
        break;
    }
    return state.sortDir === 'desc' ? -result : result;
  });

  return filtered;
}

/* -----------------------------------------------------------------------
   Rendering
----------------------------------------------------------------------- */

function renderShimmer(container) {
  state.isLoading = true;
  let shimmerHtml = '';
  for (let i = 0; i < 6; i++) {
    shimmerHtml += `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-box skeleton-box--top"></div>
        <div class="skeleton-box skeleton-box--title"></div>
        <div class="skeleton-box skeleton-box--desc"></div>
        <div class="skeleton-box skeleton-box--route"></div>
        <div class="skeleton-box skeleton-box--stat"></div>
      </div>
    `;
  }
  container.innerHTML = shimmerHtml;
}

function renderFetchError(container, message) {
  state.isLoading = false;
  container.innerHTML = `
    <div class="projects-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="projects-empty__icon">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3 class="projects-empty__title">Could not load projects</h3>
      <p class="projects-empty__text">${escapeHtml(message)}</p>
      <button class="btn btn--ghost btn--sm" id="btn-retry" type="button">Retry</button>
    </div>
  `;
  const retryBtn = document.getElementById('btn-retry');
  if (retryBtn) retryBtn.addEventListener('click', () => fetchAndRenderProjects());
}

function renderProjects() {
  const container = document.getElementById('projects-container');
  if (!container || state.isLoading) return;

  const filtered = getFilteredProjects();
  const totalCount = filtered.length;

  // Calculate pagination boundaries
  const totalPages = Math.ceil(totalCount / state.pageSize) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;

  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, totalCount);
  const paginatedProjects = filtered.slice(startIndex, endIndex);

  // Render cards or empty state
  if (totalCount === 0) {
    container.innerHTML = `
      <div class="projects-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="projects-empty__icon">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"></path>
          <line x1="9" y1="13" x2="15" y2="13"></line>
        </svg>
        <h3 class="projects-empty__title">No projects found</h3>
        <p class="projects-empty__text">
          ${state.searchQuery || state.authFilter !== 'all'
            ? 'No projects matched your search criteria or auth filter.'
            : state.activeTab === 'shared-projects'
              ? 'No projects have been shared with your account yet.'
              : 'You have not created any projects yet. Click &quot;+ New project&quot; in top navigation to get started.'}
        </p>
        ${state.searchQuery || state.authFilter !== 'all' ? `
          <button class="btn btn--ghost btn--sm" id="btn-reset-filters" type="button">Reset filters</button>
        ` : ''}
      </div>
    `;

    const resetBtn = document.getElementById('btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.searchQuery = '';
        state.authFilter = 'all';
        const searchInput = document.getElementById('project-search');
        const filterSelect = document.getElementById('project-filter');
        if (searchInput) searchInput.value = '';
        if (filterSelect) filterSelect.value = 'all';
        renderProjects();
      });
    }
  } else {
    container.innerHTML = paginatedProjects.map(project => createProjectCardHtml(project)).join('');
    bindCardActions();
  }

  // Update Pagination Controls
  updatePaginationUI(startIndex, endIndex, totalCount, totalPages);
}

function createProjectCardHtml(p) {
  const isSharedTab = state.activeTab === 'shared-projects';
  const isLocked = p.subscriptionStatus === 'locked';

  const authBadgeHtml = p.authEnabled
    ? `<span class="project-badge project-badge--auth">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        Auth ON
       </span>`
    : `<span class="project-badge project-badge--no-auth">Public</span>`;

  const lockBadgeHtml = isLocked
    ? `<span class="project-badge project-badge--locked">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        Locked
       </span>`
    : '';

  const sharedBadgeHtml = isSharedTab
    ? `<span class="project-badge project-badge--shared">Shared by ${p.owner ? escapeHtml(p.owner.split('@')[0]) : 'Team'}</span>`
    : '';

  return `
    <article class="project-card${isLocked ? ' project-card--locked' : ''}" id="card-${p.id}">
      <div class="project-card__top">
        <div class="project-card__badges">
          ${authBadgeHtml}
          ${lockBadgeHtml}
          ${sharedBadgeHtml}
        </div>
      </div>

      <div>
        <h3 class="project-card__title">
          <a href="/dashboard">${escapeHtml(p.name)}</a>
        </h3>
      </div>

      <p class="project-card__desc">${escapeHtml(p.description)}</p>

      <div class="project-card__route">
        <span>${escapeHtml(p.route)}</span>
        <button class="copy-route-btn" data-route="${escapeHtml(p.route)}" type="button" title="Copy endpoint route">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        </button>
      </div>

      <div class="project-card__stats" style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">
        <div style="color: var(--text-muted);">
          <span>${p.tablesCount} tables</span>
          <span class="dot" style="margin: 0 4px; color: var(--text-faint);">•</span>
          <span>${p.apisCount} APIs</span>
        </div>
        <div style="color: var(--text-faint);">
          <span>updated ${escapeHtml(p.updatedAt)}${p.updatedBy ? ` by ${escapeHtml(p.updatedBy)}` : ''}</span>
        </div>
      </div>

      <div class="project-card__footer" style="justify-content: space-between;">
        <span style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-faint);">created on ${escapeHtml(p.createdAt)}</span>
        <a href="/dashboard" class="btn btn--ghost btn--sm">Open &rarr;</a>
      </div>
    </article>
  `;
}

function bindCardActions() {
  // Copy route button
  document.querySelectorAll('.copy-route-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const routeText = btn.getAttribute('data-route');
      if (routeText && navigator.clipboard) {
        navigator.clipboard.writeText(routeText).then(() => {
          const originalText = btn.innerHTML;
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
          setTimeout(() => {
            btn.innerHTML = originalText;
          }, 1600);
        }).catch(() => {});
      }
    });
  });
}

function updatePaginationUI(startIndex, endIndex, totalCount, totalPages) {
  const infoEl = document.getElementById('pagination-info');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pagesContainer = document.getElementById('pagination-pages');

  if (infoEl) {
    if (totalCount === 0) {
      infoEl.textContent = 'Showing 0\u20130 of 0 projects';
    } else {
      infoEl.textContent = `Showing ${startIndex + 1}\u2013${endIndex} of ${totalCount} projects`;
    }
  }

  if (btnPrev) {
    btnPrev.disabled = state.currentPage <= 1;
  }

  if (btnNext) {
    btnNext.disabled = state.currentPage >= totalPages || totalCount === 0;
  }

  if (pagesContainer) {
    if (totalPages <= 1) {
      pagesContainer.innerHTML = '';
      return;
    }

    let pagesHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      const activeClass = i === state.currentPage ? 'is-active' : '';
      pagesHtml += `<button class="page-num ${activeClass}" data-page="${i}" type="button">${i}</button>`;
    }
    pagesContainer.innerHTML = pagesHtml;

    pagesContainer.querySelectorAll('.page-num').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(btn.getAttribute('data-page'), 10);
        if (targetPage !== state.currentPage) {
          state.currentPage = targetPage;
          renderProjects();
        }
      });
    });
  }
}

/* -----------------------------------------------------------------------
   Utility helpers
----------------------------------------------------------------------- */

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch {
    return isoString;
  }
}

function formatRelativeTime(isoString) {
  if (!isoString) return 'recently';
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return '1 week ago';
    if (weeks < 5) return `${weeks} weeks ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } catch {
    return 'recently';
  }
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