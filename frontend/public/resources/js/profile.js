/* ===================================================================
   ApiForge — profile.js
   Frontend logic for the Profile page. Profile, Security, Login
   history (with per-device logout + login-notify toggle), and the
   Danger zone are wired to the backend.
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTabsFromHash();
  initProfileForm();
  initPasswordForm();
  initSessions();
  initLoginNotify();
  initPreferences();
});

/* ----- Tab switching ----- */
function initTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  const panels = document.querySelectorAll('.settings-panel');
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      panels.forEach((p) => p.classList.toggle('is-active', p.id === 'tab-' + name));
      try { history.replaceState(null, '', '/profile#' + name); } catch (e) {}
    });
  });
}

function initTabsFromHash() {
  const hash = (location.hash || '').replace('#', '');
  if (!hash) return;
  const tab = document.querySelector('.settings-tab[data-tab="' + hash + '"]');
  if (tab) tab.click();
}

/* ----- Helpers ----- */
function apiFetch(url, opts) {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  return fetch(backendUrl + url, Object.assign({ credentials: 'include' }, opts));
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
}
function hideError(el) {
  if (!el) return;
  el.classList.remove('is-visible');
  el.textContent = '';
}
function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.textContent;
    if (label) btn.textContent = label;
    btn.classList.add('btn--loading');
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.classList.remove('btn--loading');
    btn.disabled = false;
  }
}

/* ----- Profile ----- */
function initProfileForm() {
  const form = document.getElementById('profile-form');
  if (!form) return;

  const uErr = document.getElementById('username-error');
  const eErr = document.getElementById('email-error');
  const success = document.getElementById('profile-success');

  apiFetch('/auth/me')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !data.user) return;
      const u = data.user;
      const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
      set('username', u.username);
      set('displayname', u.name || u.display_name);
      set('email', u.email);
      const initials = (u.name || u.username || 'U').charAt(0).toUpperCase();
      const navAvatar = document.getElementById('nav-avatar');
      const preview = document.getElementById('avatar-preview');
      if (navAvatar) navAvatar.textContent = initials;
      if (preview) preview.textContent = initials;
    })
    .catch(() => { /* backend not wired yet */ });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(uErr); hideError(eErr);
    if (success) success.textContent = '';

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const name = document.getElementById('displayname').value.trim();
    let ok = true;

    if (!/^[a-z0-9-]+$/.test(username)) {
      showError(uErr, 'Username may only contain lowercase letters, numbers, and dashes.');
      ok = false;
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showError(eErr, 'Enter a valid email address.');
      ok = false;
    }
    if (!ok) return;

    const btn = document.getElementById('profile-save');
    setLoading(btn, true, 'Saving…');
    try {
      const res = await apiFetch('/profile/updateProfile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.msg || 'Could not save profile. Please try again.');
      }
      if (success) success.textContent = 'Profile saved.';
      setTimeout(() => { if (success) success.textContent = ''; }, 3000);
    } catch (err) {
      showError(uErr, err.message || 'Could not save profile. Please try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ----- Change password ----- */
function initPasswordForm() {
  const form = document.getElementById('password-form');
  if (!form) return;

  const err = document.getElementById('password-error');
  const success = document.getElementById('password-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(err);
    if (success) success.textContent = '';

    const current = document.getElementById('current-password').value;
    const next = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;

    const btn = document.getElementById('password-save');
    setLoading(btn, true, 'Updating…');
    try {
      const res = await apiFetch('/profile/changePassword', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next, confirm_password: confirm })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.msg || 'Could not update password. Check your current password.');
      }
      form.reset();
      openSignOutModal();
    } catch (err2) {
      showError(err, err2.message || 'Could not update password. Check your current password.');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ----- Post-password-change: ask to sign out other devices ----- */
function openSignOutModal() {
  const modal = document.getElementById('pw-signout-modal');
  if (!modal) return;
  const success = document.getElementById('password-success');
  if (success) success.textContent = 'Password updated.';
  setTimeout(() => { if (success) success.textContent = ''; }, 3000);

  modal.hidden = false;

  const close = () => { modal.hidden = true; };
  const keepBtn = document.getElementById('pw-signout-keep');
  const confirmBtn = document.getElementById('pw-signout-confirm');
  const closeBtn = document.getElementById('pw-signout-close');

  const onKeep = () => close();
  const onConfirm = async () => {
    setLoading(confirmBtn, true, 'Signing out…');
    try {
      const res = await apiFetch('/profile/logoutothersSessions', { method: 'POST' });
      if (!res.ok) throw new Error();
      if (success) success.textContent = 'Password updated. Signed out of other devices.';
      setTimeout(() => { if (success) success.textContent = ''; }, 3000);
      loadSessions();
    } catch (e) {
      alert('Could not sign out other devices. Your password was still changed.');
    } finally {
      setLoading(confirmBtn, false);
      close();
    }
  };

  keepBtn.onclick = onKeep;
  confirmBtn.onclick = onConfirm;
  closeBtn.onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

/* ----- Login history ----- */
function renderSessions(list) {
  const host = document.getElementById('session-list');
  if (!host) return;
  if (!list || !list.length) {
    host.innerHTML = '<div class="session-empty">No login history found in the last month.</div>';
    return;
  }
  host.innerHTML = list.map((s) => {
    const active = !s.revoked_at && new Date(s.expires_at) > new Date();
    const isCurrent = !!s.is_current;
    const d = s.last_active_at || s.created_at;
    const when = d ? new Date(d).toLocaleString() : '';
    const device = s.device_label || 'Unknown device';
    const ip = s.ip_address || '';
    return (
      '<div class="session-row' + (isCurrent ? ' session-row--current' : '') + '">' +
        '<div class="session-row__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"></rect><path d="M8 20h8M12 18v2"></path></svg>' +
        '</div>' +
        '<div class="session-row__body">' +
          '<div class="session-row__device">' + escapeHtml(device) +
            (isCurrent ? ' <span class="session-row__badge">This device</span>' : '') +
            (!active && !isCurrent ? ' <span class="session-row__badge session-row__badge--muted">Signed out</span>' : '') +
          '</div>' +
          '<div class="session-row__meta">' + escapeHtml(ip) + '</div>' +
        '</div>' +
        '<div class="session-row__time">' + escapeHtml(when) + '</div>' +
        (isCurrent || !active ? '' :
          '<button class="btn btn--ghost btn--sm session-row__action" type="button" data-session-id="' + s.id + '">Log out</button>') +
      '</div>'
    );
  }).join('');

  host.querySelectorAll('.session-row__action').forEach((btn) => {
    btn.addEventListener('click', () => revokeSession(btn.dataset.sessionId, btn));
  });
}

function revokeSession(sessionId, btn) {
  if (!confirm('Sign out this device?')) return;
  setLoading(btn, true, 'Signing out…');
  apiFetch('/profile/removeSessions/' + encodeURIComponent(sessionId), {
    method: 'DELETE'
  })
    .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to sign out device')))
    .then(() => loadSessions())
    .catch(() => { alert('Could not sign out that device. Please try again.'); setLoading(btn, false); });
}

function loadSessions() {
  return apiFetch('/profile/viewUserSessions')
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data || !Array.isArray(data.data)) return;
      renderSessions(data.data);
    })
    .catch(() => { /* backend not reachable */ });
}

function initSessions() {
  const refresh = document.getElementById('sessions-refresh');
  const revoke = document.getElementById('revoke-all');

  loadSessions();

  if (refresh) {
    refresh.addEventListener('click', () => loadSessions());
  }
  if (revoke) {
    revoke.addEventListener('click', async () => {
      if (!confirm('Sign out of all other devices?')) return;
      setLoading(revoke, true, 'Signing out…');
      try {
        const res = await apiFetch('/profile/logoutothersSessions', { method: 'POST' });
        if (!res.ok) throw new Error();
        await loadSessions();
      } catch (e) {
        alert('Could not sign out other devices. Please try again.');
      } finally {
        setLoading(revoke, false);
      }
    });
  }
}

/* ----- Login notifications toggle ----- */
function loadSettings() {
  return apiFetch('/profile/settings')
    .then((r) => r.ok ? r.json() : null)
    .then((data) => (data && data.settings) || {})
    .catch(() => ({}));
}

function saveSetting(key, value) {
  return apiFetch('/profile/settings/' + encodeURIComponent(key), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
}

function initLoginNotify() {
  const toggle = document.getElementById('login-notify-toggle');
  const note = document.getElementById('login-notify-note');
  if (!toggle) return;

  loadSettings().then((settings) => {
    const notify = settings.login_notifications !== false;
    toggle.checked = notify;
    if (note) note.textContent = notify ? 'Login notifications are on.' : 'Login notifications are off.';
  });

  toggle.addEventListener('change', async () => {
    const on = toggle.checked;
    if (note) note.textContent = on ? 'Login notifications are on.' : 'Login notifications are off.';
    try {
      const res = await saveSetting('login_notifications', on);
      if (!res.ok) throw new Error();
    } catch (e) {
      toggle.checked = !on;
      if (note) note.textContent = !on ? 'Login notifications are on.' : 'Login notifications are off.';
      alert('Could not save your preference. Please try again.');
    }
  });
}

/* ----- Preferences ----- */
function initPreferences() {
  const ratingToggle = document.getElementById('pref-rating-toggle');
  const feedbackToggle = document.getElementById('pref-feedback-toggle');
  const note = document.getElementById('pref-note');
  if (!ratingToggle && !feedbackToggle) return;

  loadSettings().then((settings) => {
    if (ratingToggle) {
      const on = settings.rating_notifications !== false;
      ratingToggle.checked = on;
    }
    if (feedbackToggle) {
      const on = settings.feedback_notifications !== false;
      feedbackToggle.checked = on;
    }
  });

  const savePref = async (field, on) => {
    if (note) note.textContent = 'Saving preferences…';
    try {
      const res = await saveSetting(field, on);
      if (!res.ok) throw new Error();
      if (note) note.textContent = 'Notification preferences saved.';
    } catch (e) {
      if (note) note.textContent = 'Could not save preferences. Please try again.';
    }
  };

  if (ratingToggle) {
    ratingToggle.addEventListener('change', () => savePref('rating_notifications', ratingToggle.checked));
  }
  if (feedbackToggle) {
    feedbackToggle.addEventListener('change', () => savePref('feedback_notifications', feedbackToggle.checked));
  }
}

/* ----- XSS helper ----- */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
