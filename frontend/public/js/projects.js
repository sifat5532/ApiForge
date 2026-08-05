/* ===================================================================
   ApiForge — projects.js
   Handles interactive Tab navigation, Search & Filtering,
   Skeleton shimmer loading states, Dynamic card rendering, and Pagination
   for projects.html.
   =================================================================== */

// Mock Dataset for ApiForge Projects
const MOCK_MY_PROJECTS = [
  {
    id: 'p1',
    name: 'task-app',
    description: 'Task & workspace management backend with real-time WebSocket notifications and role-based ACL.',
    route: '/api/v1/tasks',
    tablesCount: 6,
    apisCount: 4,
    updatedAt: '2 hours ago',
    updatedTimestamp: 1785963550056,
    createdTimestamp: 1783371550056,
    createdAt: 'Jul 7, 2026',
    updatedBy: 'Sifat',
    authEnabled: true
  },
  {
    id: 'p2',
    name: 'blog-cms',
    description: 'Headless CMS REST API with markdown parsing, asset uploads, and category tagging.',
    route: '/api/v1/cms',
    tablesCount: 8,
    apisCount: 6,
    updatedAt: 'Yesterday',
    updatedTimestamp: 1785884350056,
    createdTimestamp: 1783292350056,
    createdAt: 'Jul 6, 2026',
    updatedBy: 'Sifat',
    authEnabled: true
  },
  {
    id: 'p3',
    name: 'e-commerce-inventory',
    description: 'Product catalog, SKU tracking, warehouse stock level alerts, and variant management.',
    route: '/api/v2/inventory',
    tablesCount: 12,
    apisCount: 8,
    updatedAt: '3 days ago',
    updatedTimestamp: 1785711550056,
    createdTimestamp: 1783119550056,
    createdAt: 'Jul 4, 2026',
    updatedBy: 'Alex',
    authEnabled: false
  },
  {
    id: 'p4',
    name: 'user-auth-service',
    description: 'OAuth2 / OIDC identity provider proxy, JWT token issuer, and session refresh handler.',
    route: '/api/v1/auth',
    tablesCount: 4,
    apisCount: 5,
    updatedAt: '4 days ago',
    updatedTimestamp: 1785625150056,
    createdTimestamp: 1783033150056,
    createdAt: 'Jul 3, 2026',
    updatedBy: 'Sifat',
    authEnabled: true
  },
  {
    id: 'p5',
    name: 'payment-gateway-stub',
    description: 'Stripe & PayPal webhooks testing stub with idempotent event replay simulation.',
    route: '/api/v1/payments',
    tablesCount: 5,
    apisCount: 3,
    updatedAt: '5 days ago',
    updatedTimestamp: 1785538750056,
    createdTimestamp: 1782946750056,
    createdAt: 'Jul 2, 2026',
    updatedBy: 'Dave',
    authEnabled: true
  },
  {
    id: 'p6',
    name: 'analytics-engine',
    description: 'Clickstream log collector, user event aggregator, and automated CSV export pipeline.',
    route: '/api/v1/analytics',
    tablesCount: 15,
    apisCount: 2,
    updatedAt: '1 week ago',
    updatedTimestamp: 1785365950056,
    createdTimestamp: 1782773950056,
    createdAt: 'Jun 30, 2026',
    updatedBy: 'Sifat',
    authEnabled: false
  },
  {
    id: 'p7',
    name: 'notification-hub',
    description: 'Omnichannel message router supporting FCM push notifications, Twilio SMS, and SendGrid mailers.',
    route: '/api/v1/notify',
    tablesCount: 7,
    apisCount: 4,
    updatedAt: '1 week ago',
    updatedTimestamp: 1785365950056,
    createdTimestamp: 1782773950056,
    createdAt: 'Jun 30, 2026',
    updatedBy: 'Julian',
    authEnabled: true
  },
  {
    id: 'p8',
    name: 'ai-prompt-store',
    description: 'Vector database wrapper storing prompt templates, embeddings cache, and token usage logs.',
    route: '/api/v1/prompts',
    tablesCount: 9,
    apisCount: 7,
    updatedAt: '2 weeks ago',
    updatedTimestamp: 1784761150056,
    createdTimestamp: 1782169150056,
    createdAt: 'Jun 23, 2026',
    updatedBy: 'Sifat',
    authEnabled: true
  },
  {
    id: 'p9',
    name: 'crm-contacts-api',
    description: 'Customer relations pipeline, lead scoring matrix, and interaction history logger.',
    route: '/api/v1/crm',
    tablesCount: 11,
    apisCount: 9,
    updatedAt: '2 weeks ago',
    updatedTimestamp: 1784761150056,
    createdTimestamp: 1782169150056,
    createdAt: 'Jun 23, 2026',
    updatedBy: 'Laura',
    authEnabled: false
  },
  {
    id: 'p10',
    name: 'shipment-tracker',
    description: 'Logistics tracking API with carrier status normalization (FedEx, UPS, DHL).',
    route: '/api/v1/logistics',
    tablesCount: 6,
    apisCount: 3,
    updatedAt: '3 weeks ago',
    updatedTimestamp: 1784156350056,
    createdTimestamp: 1781564350056,
    createdAt: 'Jun 16, 2026',
    updatedBy: 'Sifat',
    authEnabled: true
  },
  {
    id: 'p11',
    name: 'support-ticket-sys',
    description: 'Helpdesk ticketing system with automated SLA escalation rules and agent assignment.',
    route: '/api/v1/support',
    tablesCount: 8,
    apisCount: 5,
    updatedAt: '1 month ago',
    updatedTimestamp: 1783378750056,
    createdTimestamp: 1780786750056,
    createdAt: 'Jun 7, 2026',
    updatedBy: 'Ryan',
    authEnabled: true
  },
  {
    id: 'p12',
    name: 'order-fulfillment',
    description: 'Warehouse picking & packing status pipeline with barcode validation API.',
    route: '/api/v1/fulfillment',
    tablesCount: 10,
    apisCount: 6,
    updatedAt: '1 month ago',
    updatedTimestamp: 1783378750056,
    createdTimestamp: 1780786750056,
    createdAt: 'Jun 7, 2026',
    updatedBy: 'Sifat',
    authEnabled: false
  }
];

const MOCK_SHARED_PROJECTS = [
  {
    id: 'sp1',
    name: 'team-metrics-dashboard',
    description: 'Engineering velocity, sprint burndown, and PR code review latency metrics API.',
    route: '/api/v1/team-metrics',
    tablesCount: 9,
    apisCount: 4,
    updatedAt: '3 hours ago',
    updatedTimestamp: 1785963550056,
    createdTimestamp: 1783371550056,
    createdAt: 'Jul 7, 2026',
    updatedBy: 'Alex',
    authEnabled: true,
    owner: 'alex@company.com'
  },
  {
    id: 'sp2',
    name: 'partner-webhook-gateway',
    description: 'B2B integration hub verifying HMAC signatures and dispatching webhook events.',
    route: '/api/v2/webhooks',
    tablesCount: 5,
    apisCount: 3,
    updatedAt: 'Yesterday',
    updatedTimestamp: 1785884350056,
    createdTimestamp: 1783292350056,
    createdAt: 'Jul 6, 2026',
    updatedBy: 'Sarah',
    authEnabled: true,
    owner: 'sarah@partner.io'
  },
  {
    id: 'sp3',
    name: 'legacy-data-bridge',
    description: 'ETL wrapper syncing SQL Server legacy tables to ApiForge schema definitions.',
    route: '/api/v1/bridge',
    tablesCount: 18,
    apisCount: 2,
    updatedAt: '4 days ago',
    updatedTimestamp: 1785625150056,
    createdTimestamp: 1783033150056,
    createdAt: 'Jul 3, 2026',
    updatedBy: 'DevOps',
    authEnabled: false,
    owner: 'devops@company.com'
  }
];

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
  myProjectsData: [...MOCK_MY_PROJECTS],
  sharedProjectsData: [...MOCK_SHARED_PROJECTS]
};

document.addEventListener('DOMContentLoaded', () => {
  initProjectsPage();
});

function initProjectsPage() {
  const container = document.getElementById('projects-container');
  if (!container) return; // Guard for non-projects pages

  updateTabBadges();
  bindEvents();
  renderWithShimmer();
}

function updateTabBadges() {
  const myCountEl = document.getElementById('count-my-projects');
  const sharedCountEl = document.getElementById('count-shared-projects');
  if (myCountEl) myCountEl.textContent = state.myProjectsData.length;
  if (sharedCountEl) sharedCountEl.textContent = state.sharedProjectsData.length;
}

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
      renderWithShimmer();
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
      renderWithShimmer();
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

function renderWithShimmer() {
  const container = document.getElementById('projects-container');
  if (!container) return;

  state.isLoading = true;

  // Render 6 skeleton cards
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

  // Simulate network delay for realistic visual feed
  setTimeout(() => {
    state.isLoading = false;
    renderProjects();
  }, 400);
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
              : 'You have not created any projects yet. Click "+ New project" in top navigation to get started.'}
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

  const authBadgeHtml = p.authEnabled
    ? `<span class="project-badge project-badge--auth">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        Auth ON
       </span>`
    : `<span class="project-badge project-badge--no-auth">Public</span>`;

  const sharedBadgeHtml = isSharedTab
    ? `<span class="project-badge project-badge--shared">Shared by ${p.owner ? p.owner.split('@')[0] : 'Team'}</span>`
    : '';

  return `
    <article class="project-card" id="card-${p.id}">
      <div class="project-card__top">
        <div class="project-card__badges">
          ${authBadgeHtml}
          ${sharedBadgeHtml}
        </div>
      </div>

      <div>
        <h3 class="project-card__title">
          <a href="dashboard.html">${escapeHtml(p.name)}</a>
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
          <span>updated ${p.updatedAt}${p.updatedBy ? ` by ${escapeHtml(p.updatedBy)}` : ''}</span>
        </div>
      </div>

      <div class="project-card__footer" style="justify-content: space-between;">
        <span style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-faint);">created on ${p.createdAt}</span>
        <a href="dashboard.html" class="btn btn--ghost btn--sm">Open →</a>
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
      infoEl.textContent = 'Showing 0–0 of 0 projects';
    } else {
      infoEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalCount} projects`;
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

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
