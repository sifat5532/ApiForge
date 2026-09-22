/* ===================================================================
   ApiForge — app.js
   Shared across index.html, login.html, signup.html.
   Each block checks for its target element before running, so this
   single file is safe to include on every page.
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initTerminalTyping();
  initPricingPlans();
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

function initPricingPlans() {
  const grid = document.getElementById('pricing-grid');
  if (!grid) return;

  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';

  function fmtLimit(value, singular, plural) {
    if (value == null) return 'Unlimited ' + plural;
    const n = Number(value);
    if (n === 1) return '1 ' + singular;
    return n.toLocaleString() + ' ' + plural;
  }

  function planTagline(name, price) {
    const key = String(name || '').toLowerCase();
    if (price === 0 || key === 'free') return 'For trying ApiForge out.';
    if (key === 'lite') return 'For growing projects.';
    if (key === 'pro') return 'For everything else.';
    return name + ' plan.';
  }

  fetch(backendUrl + '/view/billingPlans', { credentials: 'include' })
    .then((r) => {
      if (!r.ok) throw new Error('Failed to load plans');
      return r.json();
    })
    .then((data) => {
      const plans = data.plans || [];
      if (!plans.length) {
        grid.innerHTML = '<p class="pricing__status">No plans available right now.</p>';
        return;
      }

      const heroMeta = document.querySelector('.hero__meta span:first-child');
      if (heroMeta) {
        const cheapest = plans.reduce((min, p) => {
          const cost = Number(p.cost_per_month) || 0;
          return cost < min ? cost : min;
        }, Infinity);
        const from = cheapest === 0 ? 'from free' : 'from ৳' + cheapest;
        heroMeta.innerHTML = '<strong>' + plans.length + '</strong> plans, ' + from;
      }

      grid.innerHTML = plans.map((p) => {
        const key = String(p.name || '').toLowerCase();
        const price = Number(p.cost_per_month) || 0;
        const highlight = key === 'lite';
        const displayName = p.name
          ? p.name.charAt(0).toUpperCase() + p.name.slice(1)
          : 'Plan';
        const btnClass = highlight ? 'btn btn--primary btn--block' : 'btn btn--ghost btn--block';
        const btnLabel = price === 0 ? 'Start free' : 'Get ' + escapeHtml(displayName);
        return ''
          + '<div class="plan' + (highlight ? ' plan--highlight' : '') + '">'
          +   (highlight ? '<span class="plan__badge">Most popular</span>' : '')
          +   '<div class="plan__name">' + escapeHtml(displayName) + '</div>'
          +   '<p class="plan__price">' + (price === 0 ? 'Free' : '৳' + price + '<span> / mo</span>') + '</p>'
          +   '<p class="plan__tagline">' + escapeHtml(planTagline(displayName, price)) + '</p>'
          +   '<ul class="plan__list">'
          +     '<li>' + escapeHtml(fmtLimit(p.project_count, 'project', 'projects')) + '</li>'
          +     '<li>' + escapeHtml(fmtLimit(p.table_per_project, 'table per project', 'tables per project')) + '</li>'
          +     '<li>' + escapeHtml(fmtLimit(p.api_per_project, 'API per project', 'APIs per project')) + '</li>'
          +     '<li>' + escapeHtml(fmtLimit(p.api_call_per_day, 'API call per day', 'API calls per day')) + '</li>'
          +   '</ul>'
          +   '<a href="/signup" class="' + btnClass + '">' + btnLabel + '</a>'
          + '</div>';
      }).join('');
    })
    .catch(() => {
      grid.innerHTML = '<p class="pricing__status">Unable to load plans. Try again later.</p>';
    });
}

