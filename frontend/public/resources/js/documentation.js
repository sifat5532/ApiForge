/* ===================================================================
   ApiForge — documentation.js
   Powers the standalone Documentation page: sidebar collapse/expand
   (desktop), off-canvas open/close (mobile), the account dropdown,
   and the tab-based doc layout. Self-contained — does not depend on
   dashboard.js or view-project.js.
   =================================================================== */

const DOC_SIDEBAR_STORAGE_KEY = 'apiforge-sidebar-collapsed';
const DOC_MOBILE_BREAKPOINT = '(max-width: 840px)';

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  initAccountMenu();
  initDocTabs();
});

/* -----------------------------------------------------------------------
   Sidebar (collapse on desktop, off-canvas on mobile)
   ----------------------------------------------------------------------- */
function initSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggle) return;

  const mobileQuery = window.matchMedia(DOC_MOBILE_BREAKPOINT);

  syncToggleAria(toggle, mobileQuery.matches);

  toggle.addEventListener('click', () => {
    if (mobileQuery.matches) {
      const isOpen = document.documentElement.classList.toggle('sidebar-mobile-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    } else {
      const isCollapsed = document.documentElement.classList.toggle('sidebar-collapsed');
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      try {
        localStorage.setItem(DOC_SIDEBAR_STORAGE_KEY, String(isCollapsed));
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

  function syncToggleAria(el, isMobile) {
    if (isMobile) {
      el.setAttribute('aria-expanded', String(document.documentElement.classList.contains('sidebar-mobile-open')));
    } else {
      el.setAttribute('aria-expanded', String(!document.documentElement.classList.contains('sidebar-collapsed')));
    }
  }
}

/* -----------------------------------------------------------------------
   Account dropdown
   ----------------------------------------------------------------------- */
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
      } finally {
        window.location.href = '/login';
      }
    });
  }
}

/* -----------------------------------------------------------------------
   Documentation tabs (static content, no network calls — every panel's
   markup is already in the page, so switching just toggles visibility).
   ----------------------------------------------------------------------- */

const DOC_TAB_HASH_MAP = {
  start: 'tab-start',
  api: 'tab-api',
  call: 'tab-call',
  auth: 'tab-auth',
  advanced: 'tab-advanced',
};

const DOC_TABS = {
  'tab-start':    { panel: 'panel-start' },
  'tab-api':      { panel: 'panel-api' },
  'tab-call':     { panel: 'panel-call' },
  'tab-auth':     { panel: 'panel-auth' },
  'tab-advanced': { panel: 'panel-advanced' },
};

function initDocTabs() {
  Object.keys(DOC_TABS).forEach((tabId) => {
    const tabBtn = document.getElementById(tabId);
    if (!tabBtn) return;
    tabBtn.addEventListener('click', () => activateDocTab(tabId));
  });

  // Quick-link chips on the "Getting Started" tab jump straight to a tab.
  document.querySelectorAll('[data-jump]').forEach((chip) => {
    chip.addEventListener('click', () => activateDocTab(chip.getAttribute('data-jump')));
  });

  // Keep the active tab in sync when the URL hash changes (back/forward, manual edit)
  window.addEventListener('hashchange', () => {
    const tabId = docTabIdFromHash();
    if (tabId) activateDocTab(tabId, { updateHash: false });
  });

  const initialTabId = docTabIdFromHash() || 'tab-start';
  activateDocTab(initialTabId, { updateHash: false, scroll: false });
}

function docTabIdFromHash() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (!hash) return null;
  return DOC_TAB_HASH_MAP[hash] || null;
}

function activateDocTab(tabId, opts = {}) {
  const cfg = DOC_TABS[tabId];
  if (!cfg) return;

  Object.keys(DOC_TABS).forEach((otherId) => {
    const otherBtn = document.getElementById(otherId);
    const otherPanel = document.getElementById(DOC_TABS[otherId].panel);
    if (!otherBtn || !otherPanel) return;
    const active = otherId === tabId;
    otherBtn.classList.toggle('is-active', active);
    otherBtn.setAttribute('aria-selected', active ? 'true' : 'false');
    otherPanel.classList.toggle('is-active', active);
    otherPanel.hidden = !active;
  });

  if (opts.updateHash !== false) {
    const hash = Object.keys(DOC_TAB_HASH_MAP).find((k) => DOC_TAB_HASH_MAP[k] === tabId);
    try { history.replaceState(null, '', window.location.pathname + (hash ? '#' + hash : '')); } catch (e) {}
  }

  if (opts.scroll !== false) {
    const tabsNav = document.getElementById('doc-tabs');
    if (tabsNav) tabsNav.scrollIntoView({ block: 'nearest' });
  }
}
