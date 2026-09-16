/* ===================================================================
   ApiForge — dashboard.js
   Handles the dashboard shell only: sidebar collapse/expand (desktop),
   off-canvas open/close (mobile), and the account dropdown.
   Separate from js/app.js, which only handles the landing/login/signup
   pages. Include this file on every page that uses the dashboard shell.
   =================================================================== */

const SIDEBAR_STORAGE_KEY = 'apiforge-sidebar-collapsed';
const ONBOARDING_STORAGE_KEY = 'apiforge-onboarding-dismissed';
const MOBILE_BREAKPOINT = '(max-width: 840px)';

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  initAccountMenu();
  initOnboardingCard();
  loadDashboardData();
});

/* ------------------------- dashboard data -------------------------
   Fetches stats, recent projects, and recent activity from the
   backend (mounted at /dashboard/*) and renders them into the page. */
async function loadDashboardData() {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';

  try {
    const [statsRes, projectsRes, activityRes] = await Promise.all([
      fetch(`${backendUrl}/dashboard/stats`, { credentials: 'include' }),
      fetch(`${backendUrl}/dashboard/recentProjects`, { credentials: 'include' }),
      fetch(`${backendUrl}/dashboard/recentActivity`, { credentials: 'include' })
    ]);

    if (statsRes.ok) {
      const stats = await statsRes.json();
      renderStats(stats);
      renderOnboarding(stats);
    }
    if (projectsRes.ok) {
      const data = await projectsRes.json();
      renderRecentProjects(data.projects || []);
    }
    if (activityRes.ok) {
      const data = await activityRes.json();
      renderRecentActivity(data.activities || []);
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

function renderStats(stats) {
  setText('stat-projects', stats.projects);
  setText('stat-tables', stats.tables);
  setText('stat-apis', stats.apis);
  setText('stat-requests', stats.requests30d ?? 0);

  setText('stat-tables-hint', `across ${stats.projects} project${stats.projects === 1 ? '' : 's'}`);
  setText('stat-apis-hint', `${stats.apis} of ${stats.tables} tables exposed`);
  setText('stat-requests-hint', stats.requests30d > 0 ? 'last 30 days' : 'create an API to see traffic here');

  const projectsHint = document.getElementById('stat-projects-hint');
  if (projectsHint) {
    // Free plan limit is 2 projects (mirrors backend project cap).
    if (stats.projects >= 2) {
      projectsHint.textContent = 'Free plan limit reached';
      projectsHint.classList.add('stat-card__hint--warn');
    } else {
      projectsHint.classList.remove('stat-card__hint--warn');
    }
  }
}

function renderRecentProjects(projects) {
  const container = document.getElementById('recent-projects');
  if (!container) return;

  if (!projects.length) {
    container.innerHTML = '<p class="panel__empty">No recent projects yet.</p>';
    return;
  }
  
  container.innerHTML = projects.map((p) => {
    const updated = p.last_update ? formatRelative(p.last_update) : 'unknown';
    const href = p.is_template === true
  ? `/template/${encodeURIComponent(p.id)}`
  : `/project/${encodeURIComponent(p.name)}`;
    return `
      <div class="project-row">
        <div>
          <div class="project-row__name">${escapeHtml(p.name)}</div>
          <div class="project-row__meta">
            <span>${p.total_tables} tables</span>
            <span>·</span>
            <span>${p.total_apis} APIs</span>
            <span>·</span>
            <span>updated ${updated}</span>
          </div>
        </div>
        <a href="${href}" class="project-row__link" aria-label="Open ${escapeHtml(p.name)}">→</a>
      </div>`;
  }).join('');
}

function renderRecentActivity(activities) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  if (!activities.length) {
    container.innerHTML = '<p class="panel__empty">No recent activity.</p>';
    return;
  }

  container.innerHTML = activities.map((a) => {
    const when = a.created_at ? formatRelative(a.created_at) : '';
    const summary = describeActivity(a);
    return `
      <div class="activity-item">
        <span class="activity-item__dot" aria-hidden="true"></span>
        <div class="activity-item__text">
          ${summary}
          <span class="activity-item__time">${when}</span>
        </div>
      </div>`;
  }).join('');
}

function describeActivity(a) {
  const change = a.change_type || 'updated';
  const verb = change === 'insert' ? 'Created'
    : change === 'delete' ? 'Deleted'
    : change === 'update' ? 'Updated'
    : capitalize(change);

  // Prefer the new state, fall back to the old (e.g. on delete there is no new).
  const data = a.new_data && Object.keys(a.new_data).length ? a.new_data : (a.old_data || {});

  const project = a.project_name
    ? `<strong>${escapeHtml(a.project_name)}</strong>`
    : (data.project_name ? `<strong>${escapeHtml(data.project_name)}</strong>` : 'a project');

  const table = data.table_name ? `<strong>${escapeHtml(data.table_name)}</strong>` : '';
  const column = data.col_name ? `<strong>${escapeHtml(data.col_name)}</strong>` : '';
  const api = data.name && a.entity_type === 'api_definition' ? `<strong>${escapeHtml(data.name)}</strong>` : '';

  const label = {
    project: 'project',
    schema_table: 'table',
    schema_column: 'column',
    api_definition: 'API',
    collaborator: 'collaborator',
    cors_origin: 'CORS origin',
    foreign_key: 'foreign key'
  }[a.entity_type] || 'item';

  let detail = '';
  if (a.entity_type === 'schema_column' && column) {
    detail = ` <span class="activity-item__of">in ${table}</span>`;
  } else if (a.entity_type === 'schema_table' && table) {
    detail = ` <span class="activity-item__of">${table}</span>`;
  } else if (a.entity_type === 'api_definition' && api) {
    detail = ` <span class="activity-item__of">${api}</span>`;
  } else if (a.entity_type === 'collaborator' && data.username) {
    detail = ` <span class="activity-item__of">${escapeHtml(data.username)}</span>`;
  }

  return `${verb} ${label} ${detail} <span class="activity-item__of">in ${project}</span>`.trim();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatRelative(iso) {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------- sidebar toggle -------------------------
   Desktop  (>840px): collapses to icon-only, ~72px. State persists
                       in localStorage and is read pre-paint (see the
                       inline <script> in dashboard.html's <head>) so
                       there's no flash of the wrong width.
   Mobile   (≤840px): behaves as an off-canvas drawer instead; the
                       persisted "collapsed" preference is ignored so
                       the drawer always opens at full width.
   ------------------------------------------------------------------ */
function initSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggle) return;

  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);

  syncToggleAria(toggle, mobileQuery.matches);

  toggle.addEventListener('click', () => {
    if (mobileQuery.matches) {
      const isOpen = document.documentElement.classList.toggle('sidebar-mobile-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    } else {
      const isCollapsed = document.documentElement.classList.toggle('sidebar-collapsed');
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
      } catch (e) {
        /* localStorage unavailable — collapse state just won't persist */
      }
    }
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileSidebar();
  });

  // Crossing the breakpoint while a menu is open shouldn't leave the
  // sidebar stuck in a mismatched state.
  mobileQuery.addEventListener('change', () => {
    document.documentElement.classList.remove('sidebar-mobile-open');
    syncToggleAria(toggle, mobileQuery.matches);
  });

  function closeMobileSidebar() {
    if (!mobileQuery.matches) return;
    document.documentElement.classList.remove('sidebar-mobile-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
}

function syncToggleAria(toggle, isMobile) {
  if (isMobile) {
    toggle.setAttribute('aria-expanded', 'false');
  } else {
    const isCollapsed = document.documentElement.classList.contains('sidebar-collapsed');
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
  }
}

/* ------------------------- account dropdown ------------------------- */
function initAccountMenu() {
  const trigger = document.getElementById('account-menu-trigger');
  const dropdown = document.getElementById('account-dropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('is-open') && !dropdown.contains(e.target) && e.target !== trigger) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  function closeDropdown() {
    dropdown.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  const signOutLink = document.querySelector('.account-menu__dropdown a.is-danger');
  if (signOutLink) {
    signOutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
      try {
        const res = await fetch(`${backendUrl}/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
        if (!res.ok) {
          console.error('Logout request was not successful:', res.status);
        }
      } catch (err) {
        console.error('Logout error:', err);
      }
      window.location.href = '/login';
    });
  }
}

/* ------------------------- getting-started checklist -------------------------
    Dismissing hides the card and remembers the choice in localStorage.
    The pre-paint <script> in dashboard.html's <head> reads the same key
    so a returning visitor who dismissed it never sees it flash back in. */
function renderOnboarding(stats) {
  const card = document.getElementById('onboarding-card');
  if (!card) return;

  const steps = {
    project: stats.projects > 0,
    table: stats.tables > 0,
    api: stats.apis > 0
  };

  let done = 0;
  const total = Object.keys(steps).length;
  for (const [key, completed] of Object.entries(steps)) {
    const stepEl = card.querySelector(`.onboarding-step[data-step="${key}"]`);
    if (!stepEl) continue;
    stepEl.classList.toggle('is-done', completed);
    stepEl.classList.toggle('is-pending', !completed);
    if (completed) done++;
  }

  const progressEl = document.getElementById('onboarding-progress');
  if (progressEl) {
    progressEl.textContent = `${done} of ${total} steps complete`;
  }

  const fillEl = document.getElementById('onboarding-fill');
  if (fillEl) {
    fillEl.style.width = `${Math.round((done / total) * 100)}%`;
  }
}

function initOnboardingCard() {
  const card = document.getElementById('onboarding-card');
  const dismissBtn = document.getElementById('onboarding-dismiss');
  if (!card || !dismissBtn) return;

  dismissBtn.addEventListener('click', () => {
    card.classList.add('is-dismissed');
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (e) {
      /* localStorage unavailable — dismissal just won't persist */
    }
  });
}
