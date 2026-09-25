/**
 * leaderboard.js — Page-specific logic for leaderboard.html
 * Pulls top templates from the backend (/view/highratedTemplates,
 * /view/mostClonedTemplates, /view/mostLikedTemplates)
 * and renders them using liked-card style cards.
 * Follows the same guard pattern as other page JS modules.
 */

const LEADERBOARD_API = window.BACKEND_URL || 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  initLeaderboard();
});

/* ─── State ───────────────────────────────────────────────────────────── */

const leaderboardState = {
  rated: [],
  cloned: [],
  liked: [],
  error: null,
  isLoading: false,
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function getInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '?';
}

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

function formatNum(n) {
  const num = Number(n) || 0;
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num);
}

/**
 * Normalize a raw template row from the backend into the shape the card
 * builder expects.
 */
function normalizeTemplate(raw) {
  const tags = Array.isArray(raw.template_tags)
    ? raw.template_tags.map(t => (t && t.name) || t)
    : [];
  return {
    id: raw.id,
    name: raw.template_name || raw.name || 'Untitled template',
    description: raw.description || '',
    author: {
      name: raw.name || raw.author_name || 'Unknown',
      username: raw.username || raw.author_username || '',
      initials: getInitials(raw.name || raw.author_name || '?'),
    },
    tags,
    createdAt: formatDate(raw.created_at),
    rating: Number(raw.avg_ratings) || 0,
    clones: Number(raw.clone_count) || 0,
    likes: Number(raw.like_count) || 0,
  };
}

function starsHtml(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < full || (i === full && half)) {
      html += '<span class="ldb-star ldb-star--full" aria-hidden="true">&#9733;</span>';
    } else {
      html += '<span class="ldb-star ldb-star--empty" aria-hidden="true">&#9733;</span>';
    }
  }
  return html;
}

function buildCard(tpl, badge) {
  const tags = tpl.tags.map(t => `<span class="liked-tag">${escapeHtml(t)}</span>`).join('');
  const badgeHtml = badge
    ? `<span class="ldb-rank-badge">${badge}</span>`
    : '';

  return `
    <article class="liked-card ldb-card">
      <div class="liked-card__author">
        <span class="liked-card__avatar">${escapeHtml(tpl.author.initials)}</span>
        <div class="liked-card__author-info">
          <span class="liked-card__author-name">${escapeHtml(tpl.author.name)}</span>
          <span class="liked-card__author-handle">@${escapeHtml(tpl.author.username.toLowerCase())}</span>
        </div>
        ${badgeHtml}
      </div>

      <div class="liked-card__title">
        <a href="/template/${escapeHtml(tpl.id)}" class="liked-card__title-link">${escapeHtml(tpl.name)}</a>
      </div>

      <p class="liked-card__desc">${escapeHtml(tpl.description)}</p>

      <div class="liked-card__tags">${tags}</div>

      <div class="liked-card__footer">
        <div class="liked-card__stars">
          ${starsHtml(tpl.rating)}
          <span class="ldb-rating-val">${tpl.rating.toFixed(1)}</span>
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

/* ─── Backend fetch ────────────────────────────────────────────────────── */

async function fetchRated() {
  const payload = await fetchJson('/view/highratedTemplates');
  return payload.templates || [];
}

async function fetchJson(path) {
  const res = await fetch(`${LEADERBOARD_API}${path}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  let payload = {};
  try { payload = await res.json(); } catch (_) { /* non-JSON body */ }
  if (!res.ok) {
    throw new Error(payload.msg || `Request to ${path} failed`);
  }
  return payload;
}

async function fetchMostCloned() {
  return (await fetchJson('/view/mostClonedTemplates')).templates || [];
}

async function fetchMostLiked() {
  return (await fetchJson('/view/mostLikedTemplates')).templates || [];
}

/* ─── Render ───────────────────────────────────────────────────────────── */

function renderTopThree(gridId, templates) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = templates
    .slice(0, 3)
    .map((t, i) => buildCard(t, ['#1', '#2', '#3'][i] || null))
    .join('');
}

function renderSectionGrids() {
  renderTopThree('ldb-rated-grid', leaderboardState.rated);
  renderTopThree('ldb-cloned-grid', leaderboardState.cloned);
  renderTopThree('ldb-liked-grid', leaderboardState.liked);
}

function renderError() {
  const root = document.getElementById('ldb-sections');
  if (!root) return;
  root.innerHTML = `
    <div class="projects-empty" style="grid-column: 1 / -1;">
      <h3 class="projects-empty__title">Couldn't load the leaderboard</h3>
      <p class="projects-empty__text">${escapeHtml(leaderboardState.error || 'Something went wrong')}</p>
      <button class="btn btn--ghost btn--sm" id="ldb-retry" type="button">Try again</button>
    </div>
  `;
  const retry = document.getElementById('ldb-retry');
  if (retry) retry.addEventListener('click', loadLeaderboard);
}

/* ─── Load orchestration ───────────────────────────────────────────────── */

async function loadLeaderboard() {
  leaderboardState.isLoading = true;
  leaderboardState.error = null;

  try {
    const [rated, cloned, liked] = await Promise.all([
      fetchRated(),
      fetchMostCloned(),
      fetchMostLiked(),
    ]);

    if (rated == null) return; // 401 redirect already handled

    leaderboardState.rated = rated.map(normalizeTemplate);
    leaderboardState.cloned = cloned.map(normalizeTemplate);
    leaderboardState.liked = liked.map(normalizeTemplate);

    renderSectionGrids();
  } catch (err) {
    leaderboardState.error = err.message || 'Failed to load leaderboard';
    renderError();
  } finally {
    leaderboardState.isLoading = false;
  }
}

/* ─── Init ─────────────────────────────────────────────────────────────── */

function initLeaderboard() {
  const root = document.getElementById('ldb-sections');
  if (!root) return;
  loadLeaderboard();
}
