/* ===================================================================
   ApiForge — app.js
   Shared across index.html, login.html, signup.html.
   Each block checks for its target element before running, so this
   single file is safe to include on every page.
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  redirectIfLoggedIn();
  initTerminalTyping();
  initLoginForm();
  initSignupForm();
});

/* ------------------------- mobile nav ------------------------- */
function initNavToggle() {
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

/* ------------------------- session redirect -------------------------
   If the user already has a valid session, skip landing/login/signup
   and send them straight to the dashboard. */
function redirectIfLoggedIn() {
  fetch('/auth/me', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && data.user && !document.body.dataset.skipRedirect) {
        window.location.href = '/dashboard';
      }
    })
    .catch(() => {
      /* not logged in / backend unreachable — stay on page */
    });
}

/* ------------------------- terminal typing demo ------------------------- */
function initTerminalTyping() {
  const el = document.getElementById('terminal-output');
  if (!el) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lines = [
    { type: 'plain', text: '// 1. build a "posts" table in the dashboard form' },
    { type: 'plain', text: '// 2. Create the endpoint using UI' },
    { type: 'gap' },
    { type: 'prompt', text: "fetch('/api/sifat/blog/posts')" },
    { type: 'plain', text: '  .then(r => r.json())' },
    { type: 'plain', text: '  .then(console.log);' },
    { type: 'gap' },
    { type: 'json', text: '{' },
    { type: 'json', text: '  "id": 1,' },
    { type: 'json', text: '  "title": "Hello, ApiForge",' },
    { type: 'json', text: '  "published": true' },
    { type: 'json', text: '}' },
  ];

  if (reduceMotion) {
    el.innerHTML = renderTerminalLines(lines) + '<span class="terminal__cursor"></span>';
    return;
  }

  el.innerHTML = '';
  let lineIndex = 0;

  function typeNextLine() {
    if (lineIndex >= lines.length) {
      el.insertAdjacentHTML('beforeend', '<span class="terminal__cursor"></span>');
      return;
    }
    const line = lines[lineIndex];
    lineIndex += 1;

    if (line.type === 'gap') {
      el.insertAdjacentHTML('beforeend', '<div style="height:10px"></div>');
      typeNextLine();
      return;
    }

    const row = document.createElement('div');
    row.className = 'terminal__line';
    el.appendChild(row);

    let i = 0;
    const speed = line.type === 'prompt' ? 22 : 8;
    const prefix = line.type === 'prompt' ? '<span class="terminal__prompt">$ </span>' : '';

    const timer = setInterval(() => {
      i += 1;
      row.innerHTML = prefix + escapeHtml(line.text.slice(0, i));
      if (i >= line.text.length) {
        clearInterval(timer);
        setTimeout(typeNextLine, line.type === 'prompt' ? 200 : 40);
      }
    }, speed);
  }

  typeNextLine();
}

function renderTerminalLines(lines) {
  return lines
    .filter((l) => l.type !== 'gap')
    .map((l) => {
      const prefix = l.type === 'prompt' ? '<span class="terminal__prompt">$ </span>' : '';
      return `<div class="terminal__line">${prefix}${escapeHtml(l.text)}</div>`;
    })
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ------------------------- login form ------------------------- */
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    hideError(errEl);

    if (!identifier || !password) {
      showError(errEl, 'Enter your email or username, and your password.');
      return;
    }

    setLoading(submitBtn, true, 'Logging in…');

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(errEl, data.error || 'Could not log in. Check your details.');
        setLoading(submitBtn, false, 'Login');
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      showError(errEl, 'Network error. Is the API reachable?');
      setLoading(submitBtn, false, 'Login');
    }
  });
}

/* ------------------------- signup form ------------------------- */
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const errEl = document.getElementById('reg-error');
    const submitBtn = document.getElementById('reg-submit');

    hideError(errEl);

    if (!name) {
      showError(errEl, 'Enter your name.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      showError(errEl, 'Username must be 3–20 characters: letters, digits, underscores only.');
      return;
    }
    if (!email) {
      showError(errEl, 'Enter a valid email.');
      return;
    }
    if (password.length < 6) {
      showError(errEl, 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showError(errEl, 'Passwords do not match.');
      return;
    }

    setLoading(submitBtn, true, 'Creating account…');

    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(errEl, data.error || 'Could not create your account.');
        setLoading(submitBtn, false, 'Create account');
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      showError(errEl, 'Network error. Is the API reachable?');
      setLoading(submitBtn, false, 'Create account');
    }
  });
}

/* ------------------------- shared form helpers ------------------------- */
function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
}
function hideError(el) {
  if (!el) return;
  el.classList.remove('is-visible');
  el.textContent = '';
}
function setLoading(btn, isLoading, label) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('btn--loading', isLoading);
  btn.textContent = label;
}
