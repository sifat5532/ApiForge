/* ===================================================================
   ApiForge — notifications.js
   Notification types: invite, collab, activity (like/rating/feedback/clone),
   session (login), billing (payment/limit).
   =================================================================== */

// ─── SVG icon map per subtype (no emoji — professional minimal icons) ─────────
function systemIconSvg(type, subtype) {
  // session / login: monitor icon
  if (type === 'session') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>`;
  }
  // billing / payment: credit card
  if (type === 'billing' && subtype === 'payment') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>`;
  }
  // billing / limit: warning triangle
  if (type === 'billing' && subtype === 'limit') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;
  }
  // activity / like: heart
  if (subtype === 'like') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>`;
  }
  // activity / rating: star
  if (subtype === 'rating') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>`;
  }
  // activity / feedback: message square
  if (subtype === 'feedback') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  }
  // activity / clone: copy icon
  if (subtype === 'clone') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }
  // fallback: bell
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 3-1.5 4.5-1.5 6.5h15C18 12.5 18 11 18 8z"/>
    <path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>
  </svg>`;
}

// ─── Mock dataset ─────────────────────────────────────────────────────────────
const MOCK_NOTIFICATIONS = [

  // ── INVITE (pending) ──────────────────────────────────────────────────────
  {
    id: 'n1', type: 'invite', subtype: 'pending', read: false,
    timestamp: Date.now() - 4 * 60 * 1000,
    actor: { name: 'Alex Rivera', username: 'alexr', initials: 'AR' },
    payload: { projectName: 'inventory-api', projectHref: '#', role: 'Editor' }
  },
  {
    id: 'n2', type: 'invite', subtype: 'pending', read: false,
    timestamp: Date.now() - 55 * 60 * 1000,
    actor: { name: 'Dave Kim', username: 'davekim', initials: 'DK' },
    payload: { projectName: 'shop-backend', projectHref: '#', role: 'Viewer' }
  },

  // ── COLLAB ACCEPTED ───────────────────────────────────────────────────────
  {
    id: 'n3', type: 'collab', subtype: 'accepted', read: false,
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    actor: { name: 'Lena Müller', username: 'lena.dev', initials: 'LM' },
    payload: { projectName: 'blog-cms', projectHref: '#', role: 'Editor' }
  },

  // ── COLLAB DECLINED ───────────────────────────────────────────────────────
  {
    id: 'n4', type: 'collab', subtype: 'declined', read: false,
    timestamp: Date.now() - 3.5 * 60 * 60 * 1000,
    actor: { name: 'Tom Nguyen', username: 'tom.nguyen', initials: 'TN' },
    payload: { projectName: 'task-app', projectHref: '#', role: 'Editor' }
  },

  // ── ACTIVITY — LIKE ───────────────────────────────────────────────────────
  {
    id: 'n5', type: 'activity', subtype: 'like', read: true,
    timestamp: Date.now() - 5 * 60 * 60 * 1000,
    actor: { name: 'Priya Sharma', username: 'priya.codes', initials: 'PS' },
    payload: { templateName: 'Auth & Permissions Starter', templateHref: '#' }
  },

  // ── ACTIVITY — RATING (with review) ──────────────────────────────────────
  {
    id: 'n6', type: 'activity', subtype: 'rating', read: false,
    timestamp: Date.now() - 7 * 60 * 60 * 1000,
    actor: { name: 'Minahil Khan', username: 'minahil.dev', initials: 'MK' },
    payload: {
      templateName: 'Blog CMS API', templateHref: '#',
      rating: 4,
      reviewText: 'Really clean schema design. Would love to see GraphQL support in future versions.'
    }
  },

  // ── ACTIVITY — FEEDBACK ───────────────────────────────────────────────────
  {
    id: 'n7', type: 'activity', subtype: 'feedback', read: true,
    timestamp: Date.now() - 22 * 60 * 60 * 1000,
    actor: { name: 'Sarah Okafor', username: 'sarahokafor', initials: 'SO' },
    payload: {
      templateName: 'E-Commerce Checkout API', templateHref: '#',
      message: 'The coupon system works great out of the box, but the tax calculation logic needs a bit more flexibility for EU VAT rules.'
    }
  },

  // ── ACTIVITY — CLONE ─────────────────────────────────────────────────────
  {
    id: 'n8', type: 'activity', subtype: 'clone', read: true,
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    actor: { name: 'James Wu', username: 'jameswu99', initials: 'JW' },
    payload: { templateName: 'Auth & Permissions Starter', templateHref: '#' }
  },

  // ── ACTIVITY — RATING (no review text) ───────────────────────────────────
  {
    id: 'n9', type: 'activity', subtype: 'rating', read: true,
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
    actor: { name: 'Anna Bell', username: 'anna.bell', initials: 'AB' },
    payload: { templateName: 'Real-Time Chat Backend', templateHref: '#', rating: 5, reviewText: null }
  },

  // ── SESSION — Login ───────────────────────────────────────────────────────
  {
    id: 'n10', type: 'session', subtype: 'login', read: false,
    timestamp: Date.now() - 6 * 60 * 60 * 1000,
    actor: null,
    payload: { deviceLabel: 'Chrome 127 on Windows 11', location: 'Dhaka, Bangladesh', ip: '103.42.xx.xx' }
  },
  {
    id: 'n11', type: 'session', subtype: 'login', read: true,
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    actor: null,
    payload: { deviceLabel: 'Firefox 128 on macOS Sonoma', location: 'Dhaka, Bangladesh', ip: '103.42.xx.xx' }
  },

  // ── BILLING — Payment success (Lite) ─────────────────────────────────────
  {
    id: 'n12', type: 'billing', subtype: 'payment', read: false,
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    actor: null,
    payload: { plan: 'Lite', amount: '$12.00', period: 'Aug 2026', invoiceHref: '#' }
  },

  // ── BILLING — Payment success (Pro) ──────────────────────────────────────
  {
    id: 'n13', type: 'billing', subtype: 'payment', read: true,
    timestamp: Date.now() - 32 * 24 * 60 * 60 * 1000,
    actor: null,
    payload: { plan: 'Pro', amount: '$39.00', period: 'Jul 2026', invoiceHref: '#' }
  },

  // ── BILLING — Limit reached (Lite plan — tables) ──────────────────────────
  {
    id: 'n14', type: 'billing', subtype: 'limit', read: false,
    timestamp: Date.now() - 3 * 60 * 60 * 1000,
    actor: null,
    payload: { plan: 'Lite', resource: 'tables', used: 50, max: 50, upgradeHref: '#' }
  },

  // ── BILLING — Limit reached (Pro plan — API requests) ────────────────────
  {
    id: 'n15', type: 'billing', subtype: 'limit', read: true,
    timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
    actor: null,
    payload: { plan: 'Pro', resource: 'API requests', used: 100000, max: 100000, upgradeHref: '#' }
  },

  // ── BILLING — Free plan project limit reached ─────────────────────────────
  {
    id: 'n16', type: 'billing', subtype: 'limit', read: false,
    timestamp: Date.now() - 30 * 60 * 1000,
    actor: null,
    payload: { plan: 'Free', resource: 'projects', used: 2, max: 2, upgradeHref: '#' }
  },

  // ── ACTIVITY — LIKE on collaborated project ───────────────────────────────
  {
    id: 'n17', type: 'activity', subtype: 'like', read: true,
    timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
    actor: { name: 'Carlos Mendez', username: 'c.mendez', initials: 'CM' },
    payload: { templateName: 'Inventory Manager Pro', templateHref: '#' }
  }
];

// ─── State ────────────────────────────────────────────────────────────────────
let _notifications = MOCK_NOTIFICATIONS.map(n => ({ ...n, payload: { ...n.payload } }));
let _activeFilter  = 'all';
const _respondedInvites = new Set(); // ids of invites already acted on

// ─── Entry point ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNotificationsPage();
});

function initNotificationsPage() {
  const feed = document.getElementById('notif-feed');
  if (!feed) return;
  renderWithShimmer();
  bindTabEvents();
  bindToolbarEvents();
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
function renderWithShimmer() {
  const feed = document.getElementById('notif-feed');
  if (!feed) return;
  feed.innerHTML = buildShimmerHtml(5);
  setTimeout(() => {
    renderNotifications();
    updateTabCounts();
    updateUnreadBadge();
  }, 420);
}

function buildShimmerHtml(count) {
  let html = '<ul class="notif-list" aria-busy="true">';
  for (let i = 0; i < count; i++) {
    html += `
      <li class="notif-item notif-item--shimmer" aria-hidden="true">
        <div class="notif-avatar-col">
          <div class="notif-avatar notif-avatar--shimmer"></div>
        </div>
        <div class="notif-body">
          <div class="notif-shimmer-line notif-shimmer-line--title"></div>
          <div class="notif-shimmer-line notif-shimmer-line--body"></div>
          <div class="notif-shimmer-line notif-shimmer-line--short"></div>
        </div>
      </li>`;
  }
  return html + '</ul>';
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderNotifications() {
  const feed = document.getElementById('notif-feed');
  if (!feed) return;
  const visible = getFiltered();
  feed.innerHTML = visible.length === 0
    ? buildEmptyStateHtml()
    : `<ul class="notif-list">${visible.map(createNotifItemHtml).join('')}</ul>`;
  bindCardActions();
}

function getFiltered() {
  return _notifications.filter(n =>
    _activeFilter === 'all' || n.type === _activeFilter
  );
}

// ─── Item HTML ────────────────────────────────────────────────────────────────
function createNotifItemHtml(n) {
  const cls = n.read ? '' : 'notif-item--unread';
  return `
    <li class="notif-item ${cls}" data-notif-id="${esc(n.id)}" data-type="${esc(n.type)}" role="article">
      <div class="notif-avatar-col">
        ${buildAvatarHtml(n)}
        ${!n.read ? '<span class="notif-unread-dot" aria-label="Unread"></span>' : ''}
      </div>
      <div class="notif-body">
        ${buildBodyHtml(n)}
      </div>
      <div class="notif-controls">
        ${buildControlsHtml(n)}
      </div>
    </li>`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
// User avatar: plain initials on dark surface — matches liked.html card style
// System avatar: SVG icon inside neutral circle (no emoji)
function buildAvatarHtml(n) {
  if (!n.actor) {
    // Determine modifier class for system icon colour per type
    let modCls = 'notif-avatar--system';
    if (n.type === 'session')  modCls += ' notif-avatar--system-session';
    if (n.type === 'billing' && n.subtype === 'limit') modCls += ' notif-avatar--system-warn';
    if (n.type === 'billing' && n.subtype === 'payment') modCls += ' notif-avatar--system-billing';
    if (n.type === 'activity') modCls += ' notif-avatar--system-activity';
    return `<div class="${modCls}" aria-hidden="true">${systemIconSvg(n.type, n.subtype)}</div>`;
  }
  return `
    <a href="#" class="notif-avatar notif-avatar--user" title="View ${esc(n.actor.name)}'s profile" data-stub="profile">
      <span class="notif-avatar__initials">${esc(n.actor.initials)}</span>
    </a>`;
}

// ─── Body content per type ────────────────────────────────────────────────────
function buildBodyHtml(n) {
  const time = `<span class="notif-time">${esc(relativeTime(n.timestamp))}</span>`;

  switch (n.type) {

    // ── Invitation ─────────────────────────────────────────────────────────
    case 'invite': {
      const p = n.payload;
      const responded = _respondedInvites.has(n.id);
      let outcome = '';
      if (n._outcome === 'accepted') {
        outcome = `<span class="notif-outcome-badge notif-outcome-badge--accepted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
          Accepted
        </span>`;
      }
      if (n._outcome === 'declined') {
        outcome = `<span class="notif-outcome-badge notif-outcome-badge--declined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="11" height="11" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          Declined
        </span>`;
      }

      const actions = !responded ? `
        <div class="notif-actions">
          <button class="notif-btn-accept notif-action-btn" data-notif-id="${esc(n.id)}" data-action="invite-accept" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
            Accept
          </button>
          <button class="notif-btn-decline notif-action-btn" data-notif-id="${esc(n.id)}" data-action="invite-decline" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="13" height="13" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
            Decline
          </button>
        </div>` : '';

      return `
        <div class="notif-meta">
          <a href="#" class="notif-actor" data-stub="profile">${esc(n.actor.name)}</a>
          <span class="notif-username">@${esc(n.actor.username)}</span>
          ${time}
        </div>
        <p class="notif-text">
          Invited you to join
          <a href="${esc(p.projectHref)}" class="notif-link" data-stub="view-project">${esc(p.projectName)}</a>
          as <span class="notif-role-badge">${esc(p.role)}</span>
        </p>
        ${outcome}
        ${actions}`;
    }

    // ── Collab accepted / declined ─────────────────────────────────────────
    case 'collab': {
      const p = n.payload;
      const isAccepted = n.subtype === 'accepted';
      const roleCls = isAccepted ? '' : 'notif-role-badge--muted';
      const statusIcon = isAccepted
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="13" height="13" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
      const statusLabel = isAccepted
        ? `<span class="notif-collab-status notif-collab-status--accepted">${statusIcon} Accepted</span>`
        : `<span class="notif-collab-status notif-collab-status--declined">${statusIcon} Declined</span>`;
      return `
        <div class="notif-meta">
          <a href="#" class="notif-actor" data-stub="profile">${esc(n.actor.name)}</a>
          <span class="notif-username">@${esc(n.actor.username)}</span>
          ${time}
        </div>
        <p class="notif-text">
          ${statusLabel}
          your invitation to
          <a href="${esc(p.projectHref)}" class="notif-link" data-stub="view-project">${esc(p.projectName)}</a>
          as <span class="notif-role-badge ${roleCls}">${esc(p.role)}</span>
        </p>`;
    }

    // ── Activity ───────────────────────────────────────────────────────────
    case 'activity': {
      const p = n.payload;
      const actorLine = `
        <div class="notif-meta">
          <a href="#" class="notif-actor" data-stub="profile">${esc(n.actor.username)}</a>
          <span class="notif-username">@${esc(n.actor.username)}</span>
          ${time}
        </div>`;

      if (n.subtype === 'like') {
        return actorLine + `
          <p class="notif-text">
            Liked your template
            <a href="${esc(p.templateHref)}" class="notif-link" data-stub="view-project">${esc(p.templateName)}</a>
          </p>`;
      }

      if (n.subtype === 'rating') {
        const stars = buildStarsHtml(p.rating);
        const review = p.reviewText
          ? `<blockquote class="notif-review">"${esc(p.reviewText)}"</blockquote>` : '';
        return actorLine + `
          <p class="notif-text">
            Rated
            <a href="${esc(p.templateHref)}" class="notif-link" data-stub="view-project">${esc(p.templateName)}</a>
            ${stars}
          </p>
          ${review}`;
      }

      if (n.subtype === 'feedback') {
        return actorLine + `
          <p class="notif-text">
            Left feedback on
            <a href="${esc(p.templateHref)}" class="notif-link" data-stub="view-project">${esc(p.templateName)}</a>
          </p>
          <blockquote class="notif-review">"${esc(p.message)}"</blockquote>`;
      }

      if (n.subtype === 'clone') {
        return actorLine + `
          <p class="notif-text">
            Cloned your template
            <a href="${esc(p.templateHref)}" class="notif-link" data-stub="view-project">${esc(p.templateName)}</a>
          </p>`;
      }

      return `<p class="notif-text">Activity notification</p>`;
    }

    // ── Session / login ────────────────────────────────────────────────────
    case 'session': {
      const p = n.payload;
      return `
        <div class="notif-meta">
          <span class="notif-actor">New sign-in detected</span>
          ${time}
        </div>
        <p class="notif-text">
          From <strong class="notif-strong">${esc(p.deviceLabel)}</strong>
        </p>
        <div class="notif-session-meta">
          <span class="notif-session-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            ${esc(p.location)}
          </span>
          <span class="notif-session-chip notif-session-chip--mono">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            ${esc(p.ip)}
          </span>
        </div>`;
    }

    // ── Billing ────────────────────────────────────────────────────────────
    case 'billing': {
      const p = n.payload;
      const planCls = p.plan === 'Pro' ? 'notif-plan-badge--pro' : p.plan === 'Lite' ? 'notif-plan-badge--lite' : 'notif-plan-badge--free';

      if (n.subtype === 'payment') {
        return `
          <div class="notif-meta">
            <span class="notif-actor">Payment successful</span>
            ${time}
          </div>
          <p class="notif-text">
            Your <span class="notif-plan-badge ${planCls}">${esc(p.plan)}</span> plan payment of
            <strong class="notif-strong">${esc(p.amount)}</strong> for ${esc(p.period)} was processed.
          </p>
          <div class="notif-actions">
            <a href="${esc(p.invoiceHref)}" class="notif-btn-ghost" data-stub="billing">View invoice</a>
          </div>`;
      }

      if (n.subtype === 'limit') {
        return `
          <div class="notif-meta">
            <span class="notif-actor notif-actor--warn">Limit reached</span>
            ${time}
          </div>
          <p class="notif-text">
            Your <span class="notif-plan-badge ${planCls}">${esc(p.plan)}</span> plan
            ${esc(p.resource)} limit is full
            <span class="notif-limit-val">(${esc(String(p.used))} / ${esc(String(p.max))})</span>.
          </p>
          <div class="notif-actions">
            <a href="${esc(p.upgradeHref)}" class="notif-btn-upgrade" data-stub="billing">
              Upgrade plan
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>`;
      }

      return `<p class="notif-text">Billing notification</p>`;
    }

    default:
      return `<p class="notif-text">Notification</p>`;
  }
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function buildStarsHtml(rating) {
  let s = '<span class="notif-stars" aria-label="' + rating + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    s += `<span class="${i <= rating ? 'notif-star--filled' : 'notif-star--empty'}">★</span>`;
  }
  return s + '</span>';
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function buildControlsHtml(n) {
  const markRead = !n.read
    ? `<button class="notif-ctrl-btn notif-ctrl-btn--read" data-notif-id="${esc(n.id)}" type="button" title="Mark as read" aria-label="Mark as read">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
       </button>` : '';
  return markRead + `
    <button class="notif-ctrl-btn notif-ctrl-btn--dismiss" data-notif-id="${esc(n.id)}" type="button" title="Dismiss" aria-label="Dismiss">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function buildEmptyStateHtml() {
  const label = {
    all: 'notifications',
    invite: 'invitations',
    collab: 'collaborator updates',
    activity: 'activity',
    session: 'login sessions',
    billing: 'billing events'
  };
  return `
    <div class="notif-empty" role="status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" width="44" height="44" aria-hidden="true">
        <path d="M18 8a6 6 0 1 0-12 0c0 3-1.5 4.5-1.5 6.5h15C18 12.5 18 11 18 8z"/>
        <path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>
      </svg>
      <p>No ${label[_activeFilter] || 'notifications'}</p>
      <span>You're all caught up.</span>
    </div>`;
}

// ─── Tab counts & badge ───────────────────────────────────────────────────────
function updateTabCounts() {
  const counts = { all: 0, invite: 0, collab: 0, activity: 0, session: 0, billing: 0 };
  _notifications.forEach(n => {
    counts.all++;
    if (n.type in counts) counts[n.type]++;
  });
  const idMap = {
    all: 'count-all', invite: 'count-invite', collab: 'count-collab',
    activity: 'count-activity', session: 'count-session', billing: 'count-billing'
  };
  Object.keys(idMap).forEach(k => {
    const el = document.getElementById(idMap[k]);
    if (el) el.textContent = counts[k];
  });
}

function updateUnreadBadge() {
  const badge = document.getElementById('notif-unread-count');
  if (!badge) return;
  const count = _notifications.filter(n => !n.read).length;
  badge.textContent = count > 0 ? `${count} unread` : '';
  badge.style.display = count > 0 ? '' : 'none';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function bindTabEvents() {
  const tabs = document.getElementById('notif-tabs');
  if (!tabs) return;
  tabs.addEventListener('click', e => {
    const btn = e.target.closest('.notif-tab');
    if (!btn) return;
    tabs.querySelectorAll('.notif-tab').forEach(t => {
      t.classList.remove('is-active');
      t.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    _activeFilter = btn.dataset.filter || 'all';
    renderNotifications();
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function bindToolbarEvents() {
  const btnMarkAll   = document.getElementById('btn-mark-all-read');
  const btnClearRead = document.getElementById('btn-clear-read');

  if (btnMarkAll) {
    btnMarkAll.addEventListener('click', () => {
      _notifications.forEach(n => { n.read = true; });
      renderNotifications();
      updateUnreadBadge();
    });
  }
  if (btnClearRead) {
    btnClearRead.addEventListener('click', () => {
      _notifications = _notifications.filter(n => !n.read);
      renderNotifications();
      updateTabCounts();
      updateUnreadBadge();
    });
  }
}

// ─── Card actions ─────────────────────────────────────────────────────────────
function bindCardActions() {
  const feed = document.getElementById('notif-feed');
  if (!feed) return;

  feed.querySelectorAll('.notif-ctrl-btn--read').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); markRead(btn.dataset.notifId); });
  });

  feed.querySelectorAll('.notif-ctrl-btn--dismiss').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); dismissItem(btn.dataset.notifId); });
  });

  feed.querySelectorAll('.notif-action-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); handleInviteAction(btn.dataset.notifId, btn.dataset.action); });
  });

  // Click item body to mark read (but not on interactive elements)
  feed.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      markRead(item.dataset.notifId);
    });
  });
}

function markRead(id) {
  const n = _notifications.find(x => x.id === id);
  if (n && !n.read) { n.read = true; renderNotifications(); updateUnreadBadge(); }
}

function dismissItem(id) {
  const feed = document.getElementById('notif-feed');
  const item = feed && feed.querySelector(`.notif-item[data-notif-id="${id}"]`);
  if (item) {
    item.classList.add('notif-item--removing');
    setTimeout(() => {
      _notifications = _notifications.filter(n => n.id !== id);
      _respondedInvites.delete(id);
      renderNotifications();
      updateTabCounts();
      updateUnreadBadge();
    }, 260);
  }
}

function handleInviteAction(id, action) {
  const n = _notifications.find(x => x.id === id);
  if (!n) return;
  n.read = true;
  n._outcome = action === 'invite-accept' ? 'accepted' : 'declined';
  _respondedInvites.add(id);
  renderNotifications();
  updateUnreadBadge();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr  < 24) return `${hr}h ago`;
  if (day < 7)  return `${day}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
