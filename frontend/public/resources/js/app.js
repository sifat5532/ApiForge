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
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  fetch(backendUrl + '/auth/me', { credentials: 'include' })
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

