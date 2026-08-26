/* ===================================================================
   ApiForge — liked.js
   Handles search, sort, shimmer loading, dynamic card rendering,
   pagination, and unlike actions for liked.html.
   =================================================================== */

// ─── Mock dataset ──────────────────────────────────────────────────────────────
const MOCK_LIKED_TEMPLATES = [
  {
    id: 'lt1',
    name: 'Inventory Manager Pro',
    description: 'A full-featured inventory API with SKU tracking, low-stock alerts, multi-warehouse support, and automated reorder triggers.',
    author: { name: 'Alex Rivera', username: 'alexr', initials: 'AR', color: '#6366f1' },
    tags: ['inventory', 'e-commerce', 'REST', 'alerts'],
    createdAt: 'Jul 14, 2026',
    createdTimestamp: 1752537600000,
    likedAt: 'Jul 31, 2026',
    likedTimestamp: 1753920000000,
    stars: 218
  },
  {
    id: 'lt2',
    name: 'Auth & Permissions Starter',
    description: 'JWT-based authentication with role-based access control (RBAC), refresh token rotation, and audit log endpoints.',
    author: { name: 'Sarah Okafor', username: 'sarahokafor', initials: 'SO', color: '#ec4899' },
    tags: ['auth', 'JWT', 'RBAC', 'security'],
    createdAt: 'Jun 22, 2026',
    createdTimestamp: 1750550400000,
    likedAt: 'Jul 30, 2026',
    likedTimestamp: 1753833600000,
    stars: 504
  },
  {
    id: 'lt3',
    name: 'Blog CMS API',
    description: 'Headless CMS REST API with markdown parsing, media asset management, category taxonomy, and nested comment threads.',
    author: { name: 'Sifat Hossain', username: 'sifat5532', initials: 'SH', color: '#f97316' },
    tags: ['CMS', 'blog', 'headless', 'media'],
    createdAt: 'Jun 10, 2026',
    createdTimestamp: 1749513600000,
    likedAt: 'Jul 29, 2026',
    likedTimestamp: 1753747200000,
    stars: 381
  },
  {
    id: 'lt4',
    name: 'E-Commerce Checkout API',
    description: 'Cart, coupon, and checkout pipeline with Stripe & PayPal webhook handlers, tax calculation engine, and order state machine.',
    author: { name: 'Dave Kim', username: 'davekim', initials: 'DK', color: '#14b8a6' },
    tags: ['e-commerce', 'payments', 'Stripe', 'webhooks'],
    createdAt: 'May 28, 2026',
    createdTimestamp: 1748390400000,
    likedAt: 'Jul 28, 2026',
    likedTimestamp: 1753660800000,
    stars: 763
  },
  {
    id: 'lt5',
    name: 'Real-Time Chat Backend',
    description: 'WebSocket-based messaging API with rooms, typing indicators, read receipts, message history, and file attachment endpoints.',
    author: { name: 'Julian Moreno', username: 'julianm', initials: 'JM', color: '#8b5cf6' },
    tags: ['WebSocket', 'chat', 'real-time', 'messaging'],
    createdAt: 'May 15, 2026',
    createdTimestamp: 1747267200000,
    likedAt: 'Jul 27, 2026',
    likedTimestamp: 1753574400000,
    stars: 612
  },
  {
    id: 'lt6',
    name: 'Analytics & Reporting Engine',
    description: 'Clickstream event collector, funnel aggregation, custom report builder, and automated CSV/JSON export pipeline.',
    author: { name: 'Laura Chen', username: 'laurachen', initials: 'LC', color: '#22c55e' },
    tags: ['analytics', 'reporting', 'metrics', 'export'],
    createdAt: 'Apr 30, 2026',
    createdTimestamp: 1746057600000,
    likedAt: 'Jul 25, 2026',
    likedTimestamp: 1753401600000,
    stars: 299
  },
  {
    id: 'lt7',
    name: 'Multi-Tenant SaaS Scaffold',
    description: 'Workspace isolation, per-tenant plan enforcement, usage metering API, and team member invitation system.',
    author: { name: 'Ryan Patel', username: 'ryanp', initials: 'RP', color: '#f43f5e' },
    tags: ['SaaS', 'multi-tenant', 'billing', 'teams'],
    createdAt: 'Apr 12, 2026',
    createdTimestamp: 1744416000000,
    likedAt: 'Jul 20, 2026',
    likedTimestamp: 1752969600000,
    stars: 447
  },
  {
    id: 'lt8',
    name: 'Notification Hub',
    description: 'Omnichannel router for FCM push notifications, Twilio SMS, and SendGrid email with template engine and delivery tracking.',
    author: { name: 'Julian Moreno', username: 'julianm', initials: 'JM', color: '#8b5cf6' },
    tags: ['notifications', 'FCM', 'SMS', 'email'],
    createdAt: 'Mar 25, 2026',
    createdTimestamp: 1742860800000,
    likedAt: 'Jul 18, 2026',
    likedTimestamp: 1752796800000,
    stars: 183
  },
  {
    id: 'lt9',
    name: 'CRM & Lead Pipeline',
    description: 'Customer relations tracker with lead scoring, interaction timeline, deal stages, and automated follow-up reminders.',
    author: { name: 'Alex Rivera', username: 'alexr', initials: 'AR', color: '#6366f1' },
    tags: ['CRM', 'leads', 'sales', 'automation'],
    createdAt: 'Mar 8, 2026',
    createdTimestamp: 1741392000000,
    likedAt: 'Jul 15, 2026',
    likedTimestamp: 1752537600000,
    stars: 326
  },
  {
    id: 'lt10',
    name: 'AI Prompt Store',
    description: 'Vector database wrapper for storing prompt templates, embedding cache management, and token usage analytics endpoints.',
    author: { name: 'Sifat Hossain', username: 'sifat5532', initials: 'SH', color: '#f97316' },
    tags: ['AI', 'LLM', 'embeddings', 'vector-db'],
    createdAt: 'Feb 18, 2026',
    createdTimestamp: 1739836800000,
    likedAt: 'Jul 10, 2026',
    likedTimestamp: 1752105600000,
    stars: 591
  },
  {
    id: 'lt11',
    name: 'File Upload & CDN Manager',
    description: 'S3-compatible storage API with presigned URL generation, image resizing pipeline, folder management, and access policies.',
    author: { name: 'Sarah Okafor', username: 'sarahokafor', initials: 'SO', color: '#ec4899' },
    tags: ['storage', 'S3', 'CDN', 'uploads'],
    createdAt: 'Jan 30, 2026',
    createdTimestamp: 1738195200000,
    likedAt: 'Jul 5, 2026',
    likedTimestamp: 1751673600000,
    stars: 254
  },
  {
    id: 'lt12',
    name: 'Support Ticket System',
    description: 'Helpdesk API with SLA escalation rules, auto-assignment engine, priority queuing, and agent performance metrics.',
    author: { name: 'Ryan Patel', username: 'ryanp', initials: 'RP', color: '#f43f5e' },
    tags: ['support', 'helpdesk', 'SLA', 'tickets'],
    createdAt: 'Jan 12, 2026',
    createdTimestamp: 1736640000000,
    likedAt: 'Jun 28, 2026',
    likedTimestamp: 1751068800000,
    stars: 138
  }
];

// ─── App state ──────────────────────────────────────────────────────────────────
const likedState = {
  searchQuery: '',
  sortOption: 'liked',
  sortDir: 'desc',
  currentPage: 1,
  pageSize: 10,
  isLoading: false,
  data: [...MOCK_LIKED_TEMPLATES],
  // Track which templates have been unliked in this session
  unlikedIds: new Set()
};

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
  // Search input
  const searchInput = document.getElementById('liked-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      likedState.searchQuery = e.target.value.trim().toLowerCase();
      likedState.currentPage = 1;
      renderLiked();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('liked-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      likedState.sortOption = e.target.value;
      likedState.currentPage = 1;
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
      likedState.currentPage = 1;
      renderLiked();
    });
  }

  // Items per page
  const pageSizeSelect = document.getElementById('liked-items-per-page');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      likedState.pageSize = parseInt(e.target.value, 10);
      likedState.currentPage = 1;
      renderLiked();
    });
  }

  // Pagination prev / next
  const btnPrev = document.getElementById('liked-btn-prev');
  const btnNext = document.getElementById('liked-btn-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (likedState.currentPage > 1) {
        likedState.currentPage--;
        renderLiked();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const filtered   = getFilteredLiked();
      const totalPages = Math.ceil(filtered.length / likedState.pageSize) || 1;
      if (likedState.currentPage < totalPages) {
        likedState.currentPage++;
        renderLiked();
      }
    });
  }
}

// ─── Data helpers ────────────────────────────────────────────────────────────────
function getFilteredLiked() {
  // Exclude items the user has unliked in this session
  let items = likedState.data.filter(t => !likedState.unlikedIds.has(t.id));

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

// ─── Shimmer loader ──────────────────────────────────────────────────────────────
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

  setTimeout(() => {
    likedState.isLoading = false;
    renderLiked();
  }, 400);
}

// ─── Main render ─────────────────────────────────────────────────────────────────
function renderLiked() {
  const container = document.getElementById('liked-container');
  if (!container || likedState.isLoading) return;

  const filtered    = getFilteredLiked();
  const totalCount  = filtered.length;
  const totalPages  = Math.ceil(totalCount / likedState.pageSize) || 1;

  if (likedState.currentPage > totalPages) likedState.currentPage = totalPages;

  const startIndex        = (likedState.currentPage - 1) * likedState.pageSize;
  const endIndex          = Math.min(startIndex + likedState.pageSize, totalCount);
  const paginatedItems    = filtered.slice(startIndex, endIndex);

  // Update header count badge
  const countEl = document.getElementById('liked-total-count');
  if (countEl) {
    const allActive = likedState.data.length - likedState.unlikedIds.size;
    countEl.textContent = allActive === 1 ? '1 template liked' : `${allActive} templates liked`;
  }

  if (totalCount === 0) {
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
        likedState.currentPage = 1;
        renderLiked();
      });
    }
  } else {
    container.innerHTML = paginatedItems.map(t => createLikedCardHtml(t)).join('');
    bindLikedCardActions();
  }

  updateLikedPaginationUI(startIndex, endIndex, totalCount, totalPages);
}

// ─── Card HTML builder ───────────────────────────────────────────────────────────
function createLikedCardHtml(t) {
  const tagsHtml = t.tags
    .map(tag => `<span class="tag liked-tag">${escapeHtml(tag)}</span>`)
    .join('');

  const starsHtml = `
    <span class="liked-card__stars">
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:13px;height:13px;color:var(--accent-light);">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
      ${t.stars.toLocaleString()}
    </span>
  `;

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

      <!-- Template name (link to view-project) -->
      <div>
        <h3 class="project-card__title liked-card__title">
          <a href="/view-project?id=${escapeHtml(t.id)}">${escapeHtml(t.name)}</a>
        </h3>
      </div>

      <!-- Description -->
      <p class="project-card__desc liked-card__desc">${escapeHtml(t.description)}</p>

      <!-- Tags -->
      <div class="liked-card__tags template-card__tags">
        ${tagsHtml}
      </div>

      <!-- Footer: created date + stars -->
      <div class="project-card__footer liked-card__footer">
        <span class="liked-card__date">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <path d="M16 2v4M8 2v4M3 10h18"></path>
          </svg>
          ${escapeHtml(t.createdAt)}
        </span>
        ${starsHtml}
        <a href="/view-project?id=${escapeHtml(t.id)}" class="btn btn--ghost btn--sm liked-card__open-btn">View →</a>
      </div>

    </article>
  `;
}

// ─── Card action bindings ────────────────────────────────────────────────────────
function bindLikedCardActions() {
  document.querySelectorAll('.liked-card__unlike-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id   = btn.getAttribute('data-id');
      const card = document.getElementById(`liked-card-${id}`);

      if (!id || !card) return;

      // Animate out
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      card.style.opacity    = '0';
      card.style.transform  = 'scale(0.96)';

      setTimeout(() => {
        likedState.unlikedIds.add(id);
        renderLiked();
      }, 260);
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
          renderLiked();
        }
      });
    });
  }
}

// ─── XSS helper ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
