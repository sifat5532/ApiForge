document.addEventListener('DOMContentLoaded', () => {
  initBreadcrumbFlow();
  initTagManager();
  initProjectForm();
});

/**
 * Dynamic Breadcrumb Flow based on entry origin URL parameter or referrer
 */
function initBreadcrumbFlow() {
  const breadcrumbNav = document.getElementById('nav-breadcrumb');
  if (!breadcrumbNav) return;

  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get('from');
  const referrer = document.referrer || '';

  let origin = 'dashboard'; // default

  if (fromParam) {
    origin = fromParam.toLowerCase();
  } else if (referrer.includes('/projects')) {
    origin = 'projects';
  } else if (referrer.includes('/templates')) {
    origin = 'templates';
  } else if (referrer.includes('/liked')) {
    origin = 'liked';
  } else if (referrer.includes('/dashboard') || referrer === '') {
    origin = 'dashboard';
  }

  let html = '';

  if (origin === 'dashboard' || origin === 'home') {
    html = `
      <a href="/dashboard" class="breadcrumb__item">Home</a>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <span class="breadcrumb__item breadcrumb__item--current" aria-current="page">New Project</span>
    `;
  } else if (origin === 'projects') {
    html = `
      <a href="/dashboard" class="breadcrumb__item">Home</a>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <a href="/projects" class="breadcrumb__item">Projects</a>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <span class="breadcrumb__item breadcrumb__item--current" aria-current="page">New Project</span>
    `;
  } else {
    // Capitalize generic origin
    const originLabel = origin.charAt(0).toUpperCase() + origin.slice(1);
    html = `
      <a href="/dashboard" class="breadcrumb__item">Home</a>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <a href="/${escapeHtml(origin)}" class="breadcrumb__item">${escapeHtml(originLabel)}</a>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <span class="breadcrumb__item breadcrumb__item--current" aria-current="page">New Project</span>
    `;
  }

  breadcrumbNav.innerHTML = html;
}

// Active selected tags array
let selectedTags = [];

// Existing database dictionary of tags for search/autocomplete
const TAG_DATABASE = [
  'REST', 'GraphQL', 'Auth', 'Database', 'E-Commerce', 'Webhooks',
  'Microservice', 'AI', 'Stripe', 'PostgreSQL', 'MongoDB', 'JWT',
  'OAuth', 'Serverless', 'Docker', 'WebSockets', 'gRPC', 'Redis',
  'Python', 'Node.js', 'Go', 'Payment', 'Cloud', 'Analytics', 'SaaS'
];

// Curated list of popular tags for direct one-click selection
const POPULAR_TAGS = [
  'REST', 'Database', 'Auth', 'GraphQL', 'Stripe', 'PostgreSQL', 'Microservice', 'JWT', 'Webhooks', 'Docker'
];

/**
 * Dark Mode Tag Search & Autocomplete Manager
 */
function initTagManager() {
  const searchInput = document.getElementById('tag-search-input');
  const dropdownMenu = document.getElementById('tag-dropdown-menu');
  const addBtn = document.getElementById('add-custom-tag-btn');
  const selectedContainer = document.getElementById('selected-tags-container');
  const container = document.getElementById('tag-search-container');

  if (!searchInput || !dropdownMenu || !selectedContainer) return; // Guard clause

  let focusedIndex = -1;

  // Render initial empty state, active tags, and popular tags
  renderSelectedTags();
  renderPopularTags();

  // 1. Show dropdown on focus or input
  searchInput.addEventListener('focus', () => {
    updateDropdown();
  });

  searchInput.addEventListener('input', () => {
    focusedIndex = -1;
    updateDropdown();
  });

  // 2. Keyboard Navigation in dropdown
  searchInput.addEventListener('keydown', (e) => {
    const items = dropdownMenu.querySelectorAll('.tag-dropdown-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownMenu.hidden) updateDropdown();
      if (items.length > 0) {
        focusedIndex = (focusedIndex + 1) % items.length;
        highlightItem(items);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        focusedIndex = (focusedIndex - 1 + items.length) % items.length;
        highlightItem(items);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!dropdownMenu.hidden && focusedIndex >= 0 && items[focusedIndex]) {
        items[focusedIndex].click();
      } else {
        handleAddCurrentInput();
      }
    } else if (e.key === 'Escape') {
      dropdownMenu.hidden = true;
    }
  });

  function highlightItem(items) {
    items.forEach((item, idx) => {
      if (idx === focusedIndex) {
        item.classList.add('is-focused');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('is-focused');
      }
    });
  }

  // 3. Add Tag via "+ Add Tag" button
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      handleAddCurrentInput();
    });
  }

  function handleAddCurrentInput() {
    const query = searchInput.value.trim();
    if (!query) return;
    addTag(query);
    searchInput.value = '';
    dropdownMenu.hidden = true;
  }

  // 4. Update and filter dropdown options
  function updateDropdown() {
    const query = searchInput.value.trim().toLowerCase();

    // Filter database matching query & excluding already selected tags
    const matches = TAG_DATABASE.filter(tag => {
      const isAlreadySelected = selectedTags.some(st => st.toLowerCase() === tag.toLowerCase());
      if (isAlreadySelected) return false;
      if (!query) return true; // show all available if query is empty
      return tag.toLowerCase().includes(query);
    });

    dropdownMenu.innerHTML = '';

    if (matches.length === 0 && !query) {
      dropdownMenu.innerHTML = '<div class="tag-dropdown-empty">All preset database tags have been selected!</div>';
      dropdownMenu.hidden = false;
      return;
    }

    // Render matches
    matches.forEach(tag => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'tag-dropdown-item';
      itemDiv.innerHTML = `<span>${escapeHtml(tag)}</span> <span style="font-size: 0.72rem; color: var(--text-faint);">Database Tag</span>`;
      itemDiv.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent input blur before click finishes
        addTag(tag);
        searchInput.value = '';
        dropdownMenu.hidden = true;
      });
      dropdownMenu.appendChild(itemDiv);
    });

    // If typed text is not an exact match in matches or selected, offer "+ Add as custom tag"
    const exactMatchExists = TAG_DATABASE.some(t => t.toLowerCase() === query) || selectedTags.some(st => st.toLowerCase() === query);
    if (query && !exactMatchExists) {
      const customDiv = document.createElement('div');
      customDiv.className = 'tag-dropdown-item tag-dropdown-item--add';
      customDiv.innerHTML = `<span>+ Add "<strong>${escapeHtml(searchInput.value.trim())}</strong>" as custom tag</span>`;
      customDiv.addEventListener('mousedown', (e) => {
        e.preventDefault();
        addTag(searchInput.value.trim());
        searchInput.value = '';
        dropdownMenu.hidden = true;
      });
      dropdownMenu.appendChild(customDiv);
    }

    dropdownMenu.hidden = false;
  }

  // 5. Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (container && !container.contains(e.target)) {
      dropdownMenu.hidden = true;
    }
  });

  // 6. Handle tag removal click
  selectedContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag-chip__remove');
    if (!removeBtn) return;
    const tagVal = removeBtn.getAttribute('data-tag-val');
    if (tagVal) {
      removeTag(tagVal);
    }
  });

  function addTag(tag) {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    if (!selectedTags.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
      selectedTags.push(cleanTag);
      renderSelectedTags();
      renderPopularTags();
    }
  }

  function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t.toLowerCase() !== tag.toLowerCase());
    renderSelectedTags();
    renderPopularTags();
  }

  function renderPopularTags() {
    const popularContainer = document.getElementById('popular-tags-group');
    if (!popularContainer) return;

    popularContainer.innerHTML = '';
    POPULAR_TAGS.forEach(tag => {
      const isSelected = selectedTags.some(t => t.toLowerCase() === tag.toLowerCase());
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `tag-chip${isSelected ? ' is-selected' : ''}`;
      chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      chip.innerHTML = `${escapeHtml(tag)}`;
      chip.addEventListener('click', () => {
        if (isSelected) {
          removeTag(tag);
        } else {
          addTag(tag);
        }
      });
      popularContainer.appendChild(chip);
    });
  }

  function renderSelectedTags() {
    selectedContainer.innerHTML = '';

    if (selectedTags.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'selected-tags-empty';
      emptySpan.id = 'selected-tags-empty';
      emptySpan.textContent = 'No tags selected yet. Search or type tags above to attach them.';
      selectedContainer.appendChild(emptySpan);
      return;
    }

    selectedTags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag-chip is-selected';
      tagSpan.innerHTML = `${escapeHtml(tag)} <span class="tag-chip__remove" data-tag-val="${escapeHtml(tag)}" title="Remove tag">&times;</span>`;
      selectedContainer.appendChild(tagSpan);
    });
  }
}

/**
 * Form Submit Handler
 */
function initProjectForm() {
  const form = document.getElementById('create-project-form');
  const submitBtn = document.getElementById('submit-project-btn');
  const errorEl = document.getElementById('form-error');

  if (!form || !submitBtn) return; // Guard clause

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('project-name');
    const nameVal = nameInput ? nameInput.value.trim() : '';

    if (!nameVal) {
      if (errorEl) {
        errorEl.textContent = 'Please provide a valid project name.';
        errorEl.classList.add('is-visible');
      }
      return;
    }

    if (errorEl) {
      errorEl.classList.remove('is-visible');
      errorEl.textContent = '';
    }

    const descriptionInput = document.getElementById('project-description');
    const authCheckbox = document.getElementById('auth-enabled');

    const payload = {
      proj_name: nameVal,
      description: descriptionInput ? (descriptionInput.value.trim() || null) : null,
      enable_auth: authCheckbox ? authCheckbox.checked : true,
      tags: selectedTags.length > 0 ? [...selectedTags] : null,
    };

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating project...';

    try {
      const res = await fetch(`${window.BACKEND_URL}/project/createProject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (errorEl) {
          errorEl.textContent = data.msg || 'Failed to create project. Please try again.';
          errorEl.classList.add('is-visible');
        }
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn--loading');
        submitBtn.textContent = originalText;
        return;
      }

      // Success — show API key modal before redirecting
      showApiKeyModal(data.api_key);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'A network error occurred. Please try again.';
        errorEl.classList.add('is-visible');
      }
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
      submitBtn.textContent = originalText;
    }
  });
}

/**
 * Shows a modal with the newly generated API key and redirects on close.
 */
function showApiKeyModal(apiKey) {
  // Build overlay
  const overlay = document.createElement('div');
  overlay.id = 'api-key-modal-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.65)', 'padding:1rem'
  ].join(';');

  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="akm-title" style="
      background:var(--surface, #1a1a2e);
      border:1px solid var(--border, #2e2e4a);
      border-radius:12px;
      padding:2rem;
      max-width:520px;
      width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,0.5);
    ">
      <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        <h2 id="akm-title" style="margin:0;font-size:1.1rem;color:var(--text-primary,#e8e8f0);">Your API Key</h2>
      </div>
      <p style="margin:0 0 1.25rem;font-size:0.875rem;color:var(--text-secondary,#a0a0b8);line-height:1.5;">
        Project created successfully. Copy your API key now —
        <strong style="color:var(--text-primary,#e8e8f0);">it will not be shown again.</strong>
      </p>

      <div style="
        display:flex;align-items:center;gap:0.5rem;
        background:var(--surface-raised,#12122a);
        border:1px solid var(--border,#2e2e4a);
        border-radius:8px;padding:0.6rem 0.75rem;
        margin-bottom:1.5rem;
      ">
        <code id="akm-key-display" style="
          flex:1;font-family:monospace;font-size:0.8rem;
          color:var(--accent,#7c6af7);word-break:break-all;
          background:none;border:none;outline:none;
          cursor:default;user-select:all;
        ">${escapeHtml(apiKey)}</code>
        <button id="akm-copy-btn" title="Copy API key" style="
          flex-shrink:0;background:none;border:none;cursor:pointer;
          color:var(--text-secondary,#a0a0b8);padding:0.25rem;
          border-radius:4px;transition:color 0.15s;
        " aria-label="Copy API key">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>

      <div style="padding:0.75rem 1rem;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.25);border-radius:8px;margin-bottom:1.5rem;font-size:0.8rem;color:var(--text-secondary,#a0a0b8);line-height:1.5;">
        Store this key in a secure place (e.g. environment variables). You can regenerate it later from your project settings, but the old key will stop working immediately.
      </div>

      <button id="akm-continue-btn" class="btn btn--primary btn--block" style="width:100%;">
        I've saved my key — Go to projects
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Copy button
  document.getElementById('akm-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      const btn = document.getElementById('akm-copy-btn');
      btn.style.color = '#4caf7d';
      setTimeout(() => { btn.style.color = ''; }, 1500);
    } catch (_) {
      // Fallback: select the text so user can copy manually
      const codeEl = document.getElementById('akm-key-display');
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });

  // Continue button
  document.getElementById('akm-continue-btn').addEventListener('click', () => {
    window.location.href = '/projects';
  });
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
