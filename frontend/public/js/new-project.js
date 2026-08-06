document.addEventListener('DOMContentLoaded', () => {
  initTagManager();
  initPlanOverview();
  initProjectForm();
});

// State for active selected tags
let selectedTags = [];

/**
 * Tag Manager: Handles popular tag toggling, custom tag adding & tag deletion
 */
function initTagManager() {
  const popularContainer = document.getElementById('popular-tags-container');
  const selectedContainer = document.getElementById('selected-tags-container');
  const customInput = document.getElementById('custom-tag-input');
  const addBtn = document.getElementById('add-custom-tag-btn');

  if (!popularContainer || !selectedContainer) return; // Guard clause

  // 1. Click popular tag chip -> toggle selection
  popularContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;

    const tagVal = chip.getAttribute('data-tag');
    if (!tagVal) return;

    if (selectedTags.includes(tagVal)) {
      removeTag(tagVal);
    } else {
      addTag(tagVal);
    }
  });

  // 2. Add custom tag via button
  if (addBtn && customInput) {
    addBtn.addEventListener('click', () => {
      handleAddCustomTag();
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCustomTag();
      }
    });
  }

  function handleAddCustomTag() {
    if (!customInput) return;
    const val = customInput.value.trim();
    if (!val) return;

    // Prevent duplicates
    if (selectedTags.some(t => t.toLowerCase() === val.toLowerCase())) {
      customInput.value = '';
      return;
    }

    addTag(val);
    customInput.value = '';
  }

  // 3. Remove tag via selected tags container click
  selectedContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag-chip__remove');
    if (!removeBtn) return;
    const tagVal = removeBtn.getAttribute('data-tag-val');
    if (tagVal) {
      removeTag(tagVal);
    }
  });

  function addTag(tag) {
    if (!selectedTags.includes(tag)) {
      selectedTags.push(tag);
      renderTags();
    }
  }

  function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t !== tag);
    renderTags();
  }

  function renderTags() {
    // Sync popular chips highlight
    const popularChips = popularContainer.querySelectorAll('.tag-chip');
    popularChips.forEach(chip => {
      const tagVal = chip.getAttribute('data-tag');
      if (selectedTags.includes(tagVal)) {
        chip.classList.add('is-selected');
      } else {
        chip.classList.remove('is-selected');
      }
    });

    // Render selected container
    selectedContainer.innerHTML = '';

    if (selectedTags.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'selected-tags-empty';
      emptySpan.id = 'selected-tags-empty';
      emptySpan.textContent = 'No tags selected. Click popular tags above or add custom tags below.';
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
 * Plan Overview Data & Switcher
 */
function initPlanOverview() {
  const badgePill = document.getElementById('tier-badge-pill');
  const limitsContainer = document.getElementById('plan-limits-container');

  if (!limitsContainer) return; // Guard clause

  const planData = {
    free: {
      badgeClass: 'plan-badge-pill--free',
      badgeText: 'FREE TIER',
      limits: [
        { label: 'Max Projects', usage: '2 Projects max', percent: 50, isUnlimited: false },
        { label: 'Tables per Project', usage: 'Up to 10 tables', percent: 40, isUnlimited: false },
        { label: 'APIs per Project', usage: 'Up to 20 APIs', percent: 30, isUnlimited: false }
      ]
    },
    lite: {
      badgeClass: 'plan-badge-pill--lite',
      badgeText: 'LITE TIER',
      limits: [
        { label: 'Max Projects', usage: '5 Projects max', percent: 20, isUnlimited: false },
        { label: 'Tables per Project', usage: 'Unlimited tables', percent: 100, isUnlimited: true },
        { label: 'APIs per Project', usage: 'Up to 150 APIs', percent: 35, isUnlimited: false }
      ]
    },
    pro: {
      badgeClass: 'plan-badge-pill--pro',
      badgeText: 'PRO TIER',
      limits: [
        { label: 'Max Projects', usage: 'Unlimited Projects', percent: 100, isUnlimited: true },
        { label: 'Tables per Project', usage: 'Unlimited tables', percent: 100, isUnlimited: true },
        { label: 'APIs per Project', usage: 'Unlimited APIs', percent: 100, isUnlimited: true }
      ]
    }
  };

  function updateTierDisplay(tierKey) {
    const tier = planData[tierKey] || planData.free;

    // Update Badge
    if (badgePill) {
      badgePill.className = `plan-badge-pill ${tier.badgeClass}`;
      badgePill.textContent = tier.badgeText;
    }

    // Render Limits & Quotas
    limitsContainer.innerHTML = tier.limits.map(lim => `
      <div class="plan-limit-row">
        <div class="plan-limit-meta">
          <span class="plan-limit-name">${escapeHtml(lim.label)}</span>
          <span class="plan-limit-val ${lim.isUnlimited ? 'plan-limit-val--unlimited' : ''}">${escapeHtml(lim.usage)}</span>
        </div>
        <div class="plan-meter-track">
          <div class="plan-meter-fill ${lim.isUnlimited ? 'plan-meter-fill--full' : ''}" style="width: ${lim.percent}%;"></div>
        </div>
      </div>
    `).join('');
  }

  // Bind Tier Toggle Buttons
  const tierBtns = document.querySelectorAll('.tier-toggle-btn');
  tierBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tierBtns.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');

      const targetTier = btn.getAttribute('data-tier');
      updateTierDisplay(targetTier);
    });
  });

  // Default to Free tier display initially
  updateTierDisplay('free');
}

/**
 * Form Submit Handler
 */
function initProjectForm() {
  const form = document.getElementById('create-project-form');
  const submitBtn = document.getElementById('submit-project-btn');
  const errorEl = document.getElementById('form-error');

  if (!form || !submitBtn) return; // Guard clause

  form.addEventListener('submit', (e) => {
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

    // Set Loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating project...';

    // Simulate API project creation delay
    setTimeout(() => {
      // Redirect to projects listing page
      window.location.href = 'projects.html';
    }, 800);
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
