/**
 * leaderboard.js — Page-specific logic for leaderboard.html
 * Renders top templates in four categories using liked-card style cards.
 * Follows the same guard pattern as other page JS modules.
 */

document.addEventListener('DOMContentLoaded', () => {
  initLeaderboard();
});

/* ─── Mock Data ─────────────────────────────────────────────────────────── */

const MOCK_TEMPLATES = [
  {
    id: 1,
    title: 'E-Commerce REST API',
    description: 'Full-featured store schema with products, orders, cart, and user management endpoints.',
    author: 'alex_dev',
    authorInitial: 'A',
    rating: 4.9,
    clones: 3812,
    likes: 2940,
    tags: ['e-commerce', 'REST', 'orders'],
    createdAt: '2025-01-14',
  },
  {
    id: 2,
    title: 'Auth & JWT Starter',
    description: 'Secure authentication with refresh tokens, role-based access, and session management.',
    author: 'marina_k',
    authorInitial: 'M',
    rating: 4.8,
    clones: 2994,
    likes: 2105,
    tags: ['auth', 'JWT', 'security'],
    createdAt: '2025-02-03',
  },
  {
    id: 3,
    title: 'Blog & CMS API',
    description: 'Posts, categories, tags, comments, and media upload endpoints ready to use.',
    author: 'codesmith',
    authorInitial: 'C',
    rating: 4.7,
    clones: 2148,
    likes: 1870,
    tags: ['blog', 'CMS', 'media'],
    createdAt: '2025-01-28',
  },
  {
    id: 4,
    title: 'SaaS Multi-Tenant',
    description: 'Organisation, workspace, and member management for multi-tenant SaaS applications.',
    author: 'saascraft',
    authorInitial: 'S',
    rating: 4.7,
    clones: 1734,
    likes: 1564,
    tags: ['SaaS', 'multi-tenant', 'teams'],
    createdAt: '2025-03-10',
  },
  {
    id: 5,
    title: 'Inventory Manager',
    description: 'Warehouse stock tracking with suppliers, purchase orders, and barcode scanning.',
    author: 'devtanya',
    authorInitial: 'D',
    rating: 4.6,
    clones: 1590,
    likes: 1340,
    tags: ['inventory', 'warehouse', 'REST'],
    createdAt: '2025-02-18',
  },
  {
    id: 6,
    title: 'Real-time Chat API',
    description: 'WebSocket-ready messaging schema with rooms, threads, reactions, and moderation.',
    author: 'bytewolf',
    authorInitial: 'B',
    rating: 4.6,
    clones: 1403,
    likes: 1290,
    tags: ['chat', 'real-time', 'WebSocket'],
    createdAt: '2025-04-02',
  },
  {
    id: 7,
    title: 'Analytics Dashboard API',
    description: 'Event tracking, funnels, and aggregation endpoints for product analytics.',
    author: 'dataflow',
    authorInitial: 'D',
    rating: 4.5,
    clones: 1205,
    likes: 1120,
    tags: ['analytics', 'events', 'reporting'],
    createdAt: '2025-03-22',
  },
  {
    id: 8,
    title: 'Booking & Scheduling',
    description: 'Appointment slots, availability, cancellations, and reminders for service businesses.',
    author: 'calendarx',
    authorInitial: 'C',
    rating: 4.5,
    clones: 1180,
    likes: 1050,
    tags: ['booking', 'scheduling', 'calendar'],
    createdAt: '2025-05-01',
  },
];

const POPULAR_TAGS = [
  { name: 'REST', count: 214 },
  { name: 'auth', count: 187 },
  { name: 'e-commerce', count: 143 },
  { name: 'SaaS', count: 131 },
  { name: 'real-time', count: 98 },
  { name: 'analytics', count: 87 },
  { name: 'blog', count: 76 },
  { name: 'inventory', count: 61 },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function starsHtml(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      html += '<span class="ldb-star ldb-star--full" aria-hidden="true">&#9733;</span>';
    } else if (i === full && half) {
      html += '<span class="ldb-star ldb-star--full" aria-hidden="true">&#9733;</span>';
    } else {
      html += '<span class="ldb-star ldb-star--empty" aria-hidden="true">&#9733;</span>';
    }
  }
  return html;
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function buildCard(tpl, badge) {
  const tags = tpl.tags.map(t => `<span class="liked-tag">${t}</span>`).join('');
  const badgeHtml = badge
    ? `<span class="ldb-rank-badge">${badge}</span>`
    : '';

  return `
    <article class="liked-card ldb-card">
      <div class="liked-card__author">
        <span class="liked-card__avatar">${tpl.authorInitial}</span>
        <div class="liked-card__author-info">
          <span class="liked-card__author-name">${tpl.author}</span>
          <span class="liked-card__author-handle">@${tpl.author.toLowerCase().replace(/\s+/g, '_')}</span>
        </div>
        ${badgeHtml}
      </div>

      <div class="liked-card__title">
        <a href="templates.html#${tpl.id}" class="liked-card__title-link">${tpl.title}</a>
      </div>

      <p class="liked-card__desc">${tpl.description}</p>

      <div class="liked-card__tags">${tags}</div>

      <div class="liked-card__footer">
        <div class="liked-card__stars">
          ${starsHtml(tpl.rating)}
          <span class="ldb-rating-val">${tpl.rating}</span>
        </div>
        <div class="ldb-card-meta">
          <span class="ldb-meta-item" title="Clones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            ${formatNum(tpl.clones)}
          </span>
          <span class="ldb-meta-item" title="Likes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            ${formatNum(tpl.likes)}
          </span>
        </div>
      </div>
    </article>
  `;
}

/**
 * Render the top-3 cards for a leaderboard section.
 *
 * @param {string} gridId   - DOM id of the grid container
 * @param {Array}  templates - templates in display order (may be sorted by date)
 * @param {string} metric   - the section's primary metric ('rating'|'clones'|'likes')
 *                            used to pre-compute each template's default rank so the
 *                            rank badge always reflects standing in the default sort,
 *                            not the current display order.
 */
function renderSection(gridId, templates, metric) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  // Build a default-sorted index once so rank badges are always stable.
  // defaultRankOf[id] = 1-based rank in the by-metric (default) order.
  const defaultOrder = [...MOCK_TEMPLATES].sort((a, b) => b[metric] - a[metric]);
  const defaultRankOf = {};
  defaultOrder.forEach((t, i) => { defaultRankOf[t.id] = i + 1; });

  grid.innerHTML = templates
    .slice(0, 3)
    .map(t => {
      const rank = defaultRankOf[t.id];
      const badge = rank <= 3 ? `#${rank}` : null;
      return buildCard(t, badge);
    })
    .join('');
}

/* ─── Tag Section ─────────────────────────────────────────────────────────── */

let activeTag = null;

function renderTagPills() {
  const container = document.getElementById('ldb-tag-pills');
  if (!container) return;

  container.innerHTML = POPULAR_TAGS.map(tag => `
    <button
      class="ldb-tag-pill${activeTag === tag.name ? ' ldb-tag-pill--active' : ''}"
      type="button"
      data-tag="${tag.name}"
      role="listitem"
      aria-pressed="${activeTag === tag.name}"
    >
      ${tag.name}
      <span class="ldb-tag-count">${tag.count}</span>
    </button>
  `).join('');

  container.querySelectorAll('.ldb-tag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      activeTag = activeTag === tag ? null : tag;
      renderTagPills();
      renderTagTemplates();
    });
  });
}

function renderTagTemplates() {
  const container = document.getElementById('ldb-tag-templates');
  if (!container) return;

  if (!activeTag) {
    container.innerHTML = '<p class="ldb-tag-hint">Select a tag above to see top templates for that category.</p>';
    return;
  }

  const matched = MOCK_TEMPLATES.filter(t =>
    t.tags.some(tag => tag.toLowerCase() === activeTag.toLowerCase())
  );

  if (matched.length === 0) {
    container.innerHTML = `<p class="ldb-tag-hint">No templates found for <strong>${activeTag}</strong>.</p>`;
    return;
  }

  container.innerHTML = `
    <p class="ldb-tag-subhead">Top templates tagged <span class="ldb-tag-name">${activeTag}</span></p>
    <div class="liked-grid ldb-grid">
      ${matched.slice(0, 3).map((t, i) => buildCard(t, ['#1', '#2', '#3'][i] || null)).join('')}
    </div>
  `;
}

/* ─── Sort ────────────────────────────────────────────────────────────────── */

function initSort() {
  const select = document.getElementById('ldb-sort');
  if (!select) return;
  select.addEventListener('change', () => {
    renderAll();
  });
}

/** Returns templates sorted by category metric (default) or by created date. */
function getSortedFor(metric) {
  const select = document.getElementById('ldb-sort');
  const mode = select ? select.value : 'default';

  if (mode === 'created') {
    // newest first, then secondary-sort by metric so ties are stable
    return [...MOCK_TEMPLATES].sort((a, b) => {
      const dateDiff = new Date(b.createdAt) - new Date(a.createdAt);
      if (dateDiff !== 0) return dateDiff;
      return b[metric] - a[metric];
    });
  }

  // default: sort by the section's own metric (rating / clones / likes)
  return [...MOCK_TEMPLATES].sort((a, b) => b[metric] - a[metric]);
}

/* ─── Init ────────────────────────────────────────────────────────────────── */

function renderAll() {
  renderSection('ldb-rated-grid',  getSortedFor('rating'),  'rating');
  renderSection('ldb-cloned-grid', getSortedFor('clones'),  'clones');
  renderSection('ldb-liked-grid',  getSortedFor('likes'),   'likes');
  renderTagPills();
  renderTagTemplates();
}

function initLeaderboard() {
  const root = document.getElementById('ldb-sections');
  if (!root) return;

  // default: show hint for tags
  activeTag = null;
  renderAll();
  initSort();
}
