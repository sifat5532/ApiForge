/* ===================================================================
   ApiForge — notifications.js
   Fully dynamic notifications page.
   Notifications are fetched from the backend (/view/notifications) and
   grouped into the UI categories:
     - invite   : collab_invitation (pending) — accept / decline actions
     - collab   : collab_invitation_accept / _reject / own_collab_remove / author_collab_remove
     - activity : feedback, rating (on your templates)
     - session  : new_session (login)
     - billing  : payment / limit (reserved for future use)
   =================================================================== */

const BACKEND_URL = window.BACKEND_URL || 'http://localhost:3000';

// ─── SVG icon map per type ─────────────────────────────────────────────────────
function systemIconSvg(type, subtype) {
  if (type === 'session') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>`;
  }
  if (type === 'billing' && subtype === 'payment') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>`;
  }
  if (type === 'billing' && subtype === 'limit') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;
  }
  if (subtype === 'like') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>`;
  }
  if (subtype === 'rating') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>`;
  }
  if (subtype === 'feedback') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  }
  if (subtype === 'clone') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 3-1.5 4.5-1.5 6.5h15C18 12.5 18 11 18 8z"/>
    <path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>
  </svg>`;
}

// ─── State ────────────────────────────────────────────────────────────────────
let _notifications = [];
let _activeFilter  = 'all';
const _respondedInvites = new Set();

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

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const res = await fetch(`${BACKEND_URL}/view/notifications`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load notifications');
    const data = await res.json();
    _notifications = (data.notifications || []).map(transformNotification);
  } catch (err) {
    console.error('Could not load notifications:', err);
    _notifications = [];
  }
}

// Map a backend notification row into the internal UI model.
function transformNotification(n) {
  const entityName = n.entityName || (n.relatedEntityName === 'projects' ? 'your project' : 'an item');
  const entityId = n.relatedEntityId;
  const isTemplate = n.relatedEntityName === 'projects' && n.type === 'feedback' || n.type === 'rating';
  const entityHref = isTemplate
    ? `/view-project?id=${encodeURIComponent(entityId)}`
    : `/project/${encodeURIComponent(entityName)}`;

  const base = {
    id: String(n.id),
    rawType: n.type,
    read: !!n.isRead,
    timestamp: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
    actor: n.sender
      ? { name: n.sender.name, username: n.sender.username, initials: initialsFrom(n.sender.name || n.sender.username) }
      : null,
    payload: {}
  };

  switch (n.type) {
    case 'collab_invitation': {
      const status = (n.data && n.data.status) || 'pending';
      base.type = 'invite';
      base.subtype = 'pending';
      base.payload = { projectName: entityName, projectHref: entityHref, role: 'Editor', projectId: entityId };
      if (status === 'accepted' || status === 'rejected') {
        base._outcome = status === 'accepted' ? 'accepted' : 'declined';
        _respondedInvites.add(base.id);
      }
      return base;
    }
    case 'collab_invitation_accept':
      return { ...base, type: 'collab', subtype: 'accepted',
        payload: { projectName: entityName, projectHref: entityHref, role: 'Editor' } };
    case 'collab_invitation_reject':
      return { ...base, type: 'collab', subtype: 'declined',
        payload: { projectName: entityName, projectHref: entityHref, role: 'Editor' } };
    case 'own_collab_remove':
      return { ...base, type: 'collab', subtype: 'left',
        payload: { projectName: entityName, projectHref: entityHref, role: 'Editor' } };
    case 'author_collab_remove':
      return { ...base, type: 'collab', subtype: 'removed',
        payload: { projectName: entityName, projectHref: entityHref, role: 'Editor' } };
    case 'feedback':
      return { ...base, type: 'activity', subtype: 'feedback',
        payload: { templateName: entityName, templateHref: entityHref, message: (n.data && n.data.message) || '' } };
    case 'rating':
      return { ...base, type: 'activity', subtype: 'rating',
        payload: {
          templateName: entityName, templateHref: entityHref,
          rating: (n.data && n.data.rating) || 0,
          reviewText: (n.data && n.data.review_text) || null
        } };
    case 'new_session':
      return { ...base, type: 'session', subtype: 'login', actor: null,
        payload: {
          deviceLabel: (n.session && n.session.deviceLabel) || 'Unknown device',
          location: 'Unknown location',
          ip: (n.session && n.session.ip) || 'Unknown'
        } };
    default:
      return { ...base, type: 'activity', subtype: 'unknown', payload: {} };
  }
}

function initialsFrom(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
function renderWithShimmer() {
  const feed = document.getElementById('notif-feed');
  if (!feed) return;
  feed.innerHTML = buildShimmerHtml(5);
  (async () => {
    await loadNotifications();
    renderNotifications();
    updateTabCounts();
    updateUnreadBadge();
  })();
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
function buildAvatarHtml(n) {
  if (!n.actor) {
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

    // ── Invitation (pending) ──────────────────────────────────────────────
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

    // ── Collab accepted / declined / left / removed ───────────────────────
    case 'collab': {
      const p = n.payload;
      const isAccepted = n.subtype === 'accepted';
      const isLeft = n.subtype === 'left';
      const isRemoved = n.subtype === 'removed';
      const roleCls = isAccepted ? '' : 'notif-role-badge--muted';

      let statusLabel;
      if (isAccepted) {
        statusLabel = `<span class="notif-collab-status notif-collab-status--accepted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
          Accepted</span>`;
      } else if (isRemoved) {
        statusLabel = `<span class="notif-collab-status notif-collab-status--declined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="13" height="13" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          Removed</span>`;
      } else {
        statusLabel = `<span class="notif-collab-status notif-collab-status--declined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="13" height="13" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          Declined</span>`;
      }

      const verb = isAccepted
        ? 'accepted your invitation to'
        : isLeft
          ? 'left'
          : isRemoved
            ? 'removed you from'
            : 'declined your invitation to';

      return `
        <div class="notif-meta">
          <a href="#" class="notif-actor" data-stub="profile">${esc(n.actor.name)}</a>
          <span class="notif-username">@${esc(n.actor.username)}</span>
          ${time}
        </div>
        <p class="notif-text">
          ${statusLabel}
          ${esc(verb)}
          <a href="${esc(p.projectHref)}" class="notif-link" data-stub="view-project">${esc(p.projectName)}</a>
          ${isAccepted || isLeft ? `as <span class="notif-role-badge ${roleCls}">${esc(p.role)}</span>` : ''}
        </p>`;
    }

    // ── Activity (feedback / rating) ──────────────────────────────────────
    case 'activity': {
      const p = n.payload;
      const actorLine = `
        <div class="notif-meta">
          <a href="#" class="notif-actor" data-stub="profile">${esc(n.actor.username)}</a>
          <span class="notif-username">@${esc(n.actor.username)}</span>
          ${time}
        </div>`;

      if (n.subtype === 'feedback') {
        return actorLine + `
          <p class="notif-text">
            Left feedback on
            <a href="${esc(p.templateHref)}" class="notif-link" data-stub="view-project">${esc(p.templateName)}</a>
          </p>
          <blockquote class="notif-review">"${esc(p.message)}"</blockquote>`;
      }

      return `<p class="notif-text">Activity notification</p>`;
    }

    // ── Session / login ───────────────────────────────────────────────────
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

    // ── Billing (reserved) ────────────────────────────────────────────────
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
  const r = Number(rating) || 0;
  let s = '<span class="notif-stars" aria-label="' + r + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    s += `<span class="${i <= r ? 'notif-star--filled' : 'notif-star--empty'}">★</span>`;
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
    btnMarkAll.addEventListener('click', async () => {
      await apiPost('/view/notifications/mark-all-read');
      _notifications.forEach(n => { n.read = true; });
      renderNotifications();
      updateUnreadBadge();
    });
  }
  if (btnClearRead) {
    btnClearRead.addEventListener('click', async () => {
      await apiPost('/view/notifications/clear-read');
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

  feed.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      markRead(item.dataset.notifId);
    });
  });
}

async function markRead(id) {
  const n = _notifications.find(x => x.id === id);
  if (n && !n.read) {
    n.read = true;
    renderNotifications();
    updateUnreadBadge();
    await apiPost('/view/notifications/mark-read', { notificationId: Number(id) });
  }
}

async function dismissItem(id) {
  const feed = document.getElementById('notif-feed');
  const item = feed && feed.querySelector(`.notif-item[data-notif-id="${id}"]`);
  if (item) {
    item.classList.add('notif-item--removing');
    setTimeout(async () => {
      _notifications = _notifications.filter(n => n.id !== id);
      _respondedInvites.delete(id);
      renderNotifications();
      updateTabCounts();
      updateUnreadBadge();
    }, 260);
  }
  await apiPost('/view/notifications/dismiss', { notificationId: Number(id) });
}

async function handleInviteAction(id, action) {
  const n = _notifications.find(x => x.id === id);
  if (!n) return;

  const accept = action === 'invite-accept';
  try {
    const res = await apiPost('/project/proceedCollabInvitation', {
      proj_id: Number(n.payload.projectId),
      acceptInvitation: accept
    });
    if (!res || !res.ok) {
      throw new Error('Request failed');
    }
  } catch (err) {
    console.error('Could not process invitation:', err);
    return;
  }

  n.read = true;
  n._outcome = accept ? 'accepted' : 'declined';
  _respondedInvites.add(id);
  renderNotifications();
  updateUnreadBadge();
}

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined
    });
    return res;
  } catch (err) {
    console.error(`Request to ${path} failed:`, err);
    return null;
  }
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
