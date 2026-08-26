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
});

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
