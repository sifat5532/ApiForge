/* ===================================================================
   ApiForge — view-project.js
   Dashboard page for a single project (/project/:projectId).
   Provides tabbed sub-views for Tables, Foreign Keys, CORS Origins,
   Collaborators, and Settings. APIs and Project Logs tabs are stubs.
   All data is fetched from the backend via session cookie auth.
   Redirects to /login on 401.
   =================================================================== */

const vpState = {
  projectId: null,
  authorId: null,
  loggedInUserId: null,
  isAuthor: false,
  project: null,
  tables: [],
  loaded: { tables: false, fk: false, cors: false, collab: false, settings: false },
  settingsTags: [],
};

document.addEventListener('DOMContentLoaded', () => {
  initViewProject();
});

/* -----------------------------------------------------------------------
   Bootstrap
   ----------------------------------------------------------------------- */

async function initViewProject() {
  const projectId = extractProjectId();
  if (!projectId) {
    window.location.href = '/projects';
    return;
  }
  vpState.projectId = projectId;

  try {
    const meRes = await apiFetch('/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      vpState.loggedInUserId = me.user ? me.user.id : null;
    }
  } catch (_) { /* non-fatal — gating degrades to read-only */ }

  initTabs();
  initModal();
  bindGlobalActions();
  await loadProjectHeader();

  // Load the default (active) tab's content on first paint
  const activeTabBtn = document.querySelector('.vp-tab.is-active');
  if (activeTabBtn) activeTabBtn.click();
}

function extractProjectId() {
  const match = window.location.pathname.match(/\/project\/(\d+)/);
  return match ? match[1] : null;
}

/* -----------------------------------------------------------------------
   Project header
   ----------------------------------------------------------------------- */

async function loadProjectHeader() {
  const titleEl = document.getElementById('vp-project-title');
  const metaEl = document.getElementById('vp-meta-grid');
  const tagsEl = document.getElementById('vp-tags');
  const cloneEl = document.getElementById('vp-clone-badge');
  const crumbEl = document.getElementById('breadcrumb-project-name');

  try {
    const res = await apiFetch(`/view/viewProject/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (res.status === 404) { renderHeaderError('Project not found'); return; }
    if (!res.ok) { renderHeaderError('Failed to load project'); return; }

    const data = await res.json();
    const p = data.project;
    vpState.project = p;
    vpState.authorId = p.author_id;
    vpState.isAuthor = String(vpState.loggedInUserId) === String(p.author_id);

    const leaveBtn = document.getElementById('vp-leave-project');
    if (leaveBtn) leaveBtn.hidden = vpState.isAuthor;

    if (titleEl) titleEl.textContent = p.name || 'Untitled project';
    if (crumbEl) crumbEl.textContent = p.name || 'Project';

    if (cloneEl) cloneEl.hidden = !p.is_clone;

    if (metaEl) {
      metaEl.innerHTML = [
        metaChip('API key', p.api_key_prefix ? `${escHtml(p.api_key_prefix)}…` : '—'),
        metaChip('Auth', p.auth_enabled ? 'Enabled' : 'Disabled'),
        metaChip('Cloned', p.is_clone ? 'Yes' : 'No'),
        metaChip('Created', formatDate(p.created_at)),
      ].join('');
    }

    if (tagsEl) {
      const tags = Array.isArray(p.project_tags) ? p.project_tags : [];
      tagsEl.innerHTML = tags.length
        ? tags.map(t => `<span class="tag">${escHtml(t.name)}</span>`).join('')
        : '<span class="vp-tags__empty" style="color:var(--text-faint);font-size:0.8rem;">No tags</span>';
    }

    // Settings form depends on header data + author gate
    vpState.loaded.settings = false;
    initSettingsForm();
    // Collaborators are embedded in the header response
    vpState.loaded.collab = false;
    locateCollaboratorsInHeader(p);
  } catch (_) {
    renderHeaderError('Network error. Is the backend reachable?');
  }
}

function locateCollaboratorsInHeader(p) {
  // The backend does not expose /view/collaborators; collaborators are part of
  // the viewProject payload (project_collaborators). Cache for the tab loader.
  vpState.collaborators = Array.isArray(p.project_collaborators) ? p.project_collaborators : [];
}

function renderHeaderError(msg) {
  const titleEl = document.getElementById('vp-project-title');
  if (titleEl) titleEl.textContent = msg;
  const metaEl = document.getElementById('vp-meta-grid');
  if (metaEl) metaEl.innerHTML = '';
}

function metaChip(label, value) {
  return `<span class="vp-meta-chip"><span class="vp-meta-chip__label">${escHtml(label)}</span><span class="vp-meta-chip__value">${escHtml(value)}</span></span>`;
}

/* -----------------------------------------------------------------------
   Tab switching (lazy load)
   ----------------------------------------------------------------------- */

function initTabs() {
  const tabs = {
    'tab-tables':   { panel: 'panel-tables',   load: loadTables },
    'tab-fk':       { panel: 'panel-fk',       load: loadForeignKeys },
    'tab-apis':     { panel: 'panel-apis' },
    'tab-cors':     { panel: 'panel-cors',     load: loadCorsOrigins },
    'tab-logs':     { panel: 'panel-logs' },
    'tab-collab':   { panel: 'panel-collab',   load: loadCollaborators },
    'tab-settings': { panel: 'panel-settings' },
  };

  Object.keys(tabs).forEach(tabId => {
    const tabBtn = document.getElementById(tabId);
    if (!tabBtn) return;
    const cfg = tabs[tabId];
    tabBtn.addEventListener('click', () => {
      // toggle active states
      Object.keys(tabs).forEach(otherId => {
        const otherBtn = document.getElementById(otherId);
        const otherPanel = document.getElementById(tabs[otherId].panel);
        if (!otherBtn || !otherPanel) return;
        const active = otherId === tabId;
        otherBtn.classList.toggle('is-active', active);
        otherBtn.setAttribute('aria-selected', active ? 'true' : 'false');
        otherPanel.classList.toggle('is-active', active);
        otherPanel.hidden = !active;
      });

      // lazy-load content once
      const key = tabId.replace('tab-', '');
      if (cfg.load && !vpState.loaded[key]) {
        vpState.loaded[key] = true;
        cfg.load();
      }
    });
  });
}

/* -----------------------------------------------------------------------
   Tables
   ----------------------------------------------------------------------- */

async function loadTables() {
  const body = document.getElementById('vp-tables-body');
  if (!body) return;
  renderShimmer(body, 4);

  try {
    const res = await apiFetch(`/view/allTables/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) { body.innerHTML = emptyState('Could not load tables'); return; }

    const data = await res.json();
    const tables = Array.isArray(data.tables) ? data.tables : [];
    vpState.tables = tables;

    if (tables.length === 0) {
      body.innerHTML = emptyState('No tables yet. Create your first table to get started.');
      return;
    }

    const rows = tables.map(t => `
      <tr>
        <td>
          <button class="vp-table__link" type="button" data-table-id="${t.id}" data-stub="table-structure">
            ${escHtml(t.table_name)} <span aria-hidden="true">→</span>
          </button>
        </td>
        <td>${escHtml(t.total_columns != null ? t.total_columns : '0')}</td>
        <td>${escHtml(formatDate(t.created_at))}</td>
      </tr>
    `).join('');

    body.innerHTML = `
      <table class="vp-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Columns</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div id="vp-struct-wrap"></div>
    `;

    body.querySelectorAll('.vp-table__link').forEach(btn => {
      btn.addEventListener('click', () => toggleTableStructure(btn.getAttribute('data-table-id')));
    });
  } catch (_) {
    body.innerHTML = emptyState('Network error. Is the backend reachable?');
  }
}

async function toggleTableStructure(tableId) {
  const wrap = document.getElementById('vp-struct-wrap');
  if (!wrap) return;
  if (wrap.getAttribute('data-open') === tableId) {
    wrap.innerHTML = '';
    wrap.removeAttribute('data-open');
    return;
  }
  wrap.setAttribute('data-open', tableId);
  wrap.innerHTML = `<div class="vp-struct-panel"><div class="vp-struct-panel__shimmer">Loading structure…</div></div>`;

  try {
    const res = await apiFetch(`/view/viewTableStructure/${tableId}`);
    if (!res.ok) {
      wrap.innerHTML = `<div class="vp-struct-panel"><p class="vp-empty__text">Could not load table structure.</p></div>`;
      return;
    }
    const data = await res.json();
    const cols = Array.isArray(data.coloumns) ? data.coloumns : [];
    const rows = cols.length
      ? cols.map(c => `
        <tr>
          <td>${escHtml(c.col_name)}</td>
          <td>${escHtml(c.col_type)}</td>
          <td>${c.is_primary_key ? '<span class="tag">PK</span>' : ''}${c.is_unique ? ' <span class="tag">UNIQUE</span>' : ''}</td>
          <td>${escHtml(c.is_nullable ? 'NULL' : 'NOT NULL')}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="color:var(--text-faint)">No columns</td></tr>`;

    wrap.innerHTML = `
      <div class="vp-struct-panel">
        <h4 class="vp-struct-panel__title">Columns</h4>
        <table class="vp-table">
          <thead>
            <tr><th>Column</th><th>Type</th><th>Key</th><th>Null</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (_) {
    wrap.innerHTML = `<div class="vp-struct-panel"><p class="vp-empty__text">Network error.</p></div>`;
  }
}

/* -----------------------------------------------------------------------
   Foreign Keys
   ----------------------------------------------------------------------- */

async function loadForeignKeys() {
  const body = document.getElementById('vp-fk-body');
  if (!body) return;
  renderShimmer(body, 4);

  try {
    const res = await apiFetch(`/view/viewAllForeignkeys/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) { body.innerHTML = emptyState('Could not load foreign keys'); return; }

    const data = await res.json();
    const fks = Array.isArray(data.data) ? data.data : [];

    if (fks.length === 0) {
      body.innerHTML = emptyState('No foreign keys defined yet.');
      return;
    }

    const rows = fks.map(fk => `
      <tr>
        <td>${escHtml(fk.fk_name)}</td>
        <td>${escHtml(fk.child_table_name)}.${escHtml(fk.child_col_name)} <span style="color:var(--text-faint)">→</span> ${escHtml(fk.parent_table_name)}.${escHtml(fk.parent_col_name)}</td>
        <td>${escHtml(fk.on_delete)}</td>
        <td>${escHtml(fk.on_update)}</td>
        <td>${escHtml(formatDate(fk.created_at))}</td>
        <td>
          <button class="btn btn--ghost btn--sm vp-fk-remove" type="button"
            data-child-col-id="${fk.child_col_id}" data-schema-table-id="${fk.child_table_id}">Remove</button>
        </td>
      </tr>
    `).join('');

    body.innerHTML = `
      <table class="vp-table">
        <thead>
          <tr>
            <th>Constraint</th><th>Relationship</th><th>On Delete</th><th>On Update</th><th>Created</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    body.querySelectorAll('.vp-fk-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const childColId = btn.getAttribute('data-child-col-id');
        const schemaTableId = btn.getAttribute('data-schema-table-id');
        removeFk(childColId, schemaTableId);
      });
    });
  } catch (_) {
    body.innerHTML = emptyState('Network error. Is the backend reachable?');
  }
}

function removeFk(childColId, schemaTableId) {
  confirmModal({
    title: 'Remove Foreign Key',
    message: 'Remove this foreign key? This cannot be undone.',
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await apiFetch('/project/removeForeignKey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proj_id: vpState.projectId,
            schema_table_id: schemaTableId,
            child_col_id: childColId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showToast(data.msg || 'Foreign key removed', 'success');
          vpState.loaded.fk = false;
          loadForeignKeys();
        } else {
          showToast(data.msg || 'Failed to remove foreign key', 'error');
        }
      } catch (_) {
        showToast('Network error', 'error');
      }
    },
  });
}

async function openAddFkModal() {
  if (!vpState.isAuthor && !vpState.loggedInUserId) {
    // allow editors (requireProjectAccess) — fetch tables to confirm access
  }
  showModal('Add Foreign Key', '<p class="vp-empty__text">Loading tables…</p>', '');

  let tables;
  try {
    const res = await apiFetch(`/view/allTables/${vpState.projectId}`);
    if (!res.ok) {
      setModalBody('<p class="vp-empty__text">Could not load tables for this project.</p>');
      return;
    }
    const data = await res.json();
    tables = Array.isArray(data.tables) ? data.tables : [];
  } catch (_) {
    setModalBody('<p class="vp-empty__text">Network error.</p>');
    return;
  }

  if (tables.length === 0) {
    setModalBody('<p class="vp-empty__text">Create at least one table before adding a foreign key.</p>');
    return;
  }

  const tableOptions = tables.map(t => `<option value="${t.id}">${escHtml(t.table_name)}</option>`).join('');

  const bodyHtml = `
    <div class="field">
      <label for="fk-child-table">Child table</label>
      <select id="fk-child-table" class="filter-select">${tableOptions}</select>
    </div>
    <div class="field">
      <label for="fk-child-col">Child column</label>
      <select id="fk-child-col" class="filter-select" disabled><option>Select a child table first</option></select>
    </div>
    <div class="field">
      <label for="fk-parent-table">Parent table</label>
      <select id="fk-parent-table" class="filter-select">${tableOptions}</select>
    </div>
    <div class="field">
      <label for="fk-parent-col">Parent column (must be PK/Unique)</label>
      <select id="fk-parent-col" class="filter-select" disabled><option>Select a parent table first</option></select>
    </div>
    <div class="field">
      <label for="fk-name">FK constraint name</label>
      <input type="text" id="fk-name" maxlength="30" placeholder="e.g. fk_order_user" />
    </div>
    <div class="vp-modal__grid">
      <div class="field">
        <label for="fk-on-delete">On Delete</label>
        <select id="fk-on-delete" class="filter-select">
          <option>CASCADE</option><option>SET NULL</option><option>RESTRICT</option><option selected>NO ACTION</option>
        </select>
      </div>
      <div class="field">
        <label for="fk-on-update">On Update</label>
        <select id="fk-on-update" class="filter-select">
          <option>CASCADE</option><option>SET NULL</option><option>RESTRICT</option><option selected>NO ACTION</option>
        </select>
      </div>
    </div>
  `;

  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="fk-cancel" type="button">Cancel</button>
    <button class="btn btn--primary btn--sm" id="fk-submit" type="button">Add Foreign Key</button>
  `;

  setModalBody(bodyHtml);
  setModalFoot(footHtml);

  const childTableEl = document.getElementById('fk-child-table');
  const parentTableEl = document.getElementById('fk-parent-table');
  const childColEl = document.getElementById('fk-child-col');
  const parentColEl = document.getElementById('fk-parent-col');

  childTableEl.addEventListener('change', () => loadColumns(childTableEl.value, childColEl));
  parentTableEl.addEventListener('change', () => loadColumns(parentTableEl.value, parentColEl));
  if (childTableEl.value) loadColumns(childTableEl.value, childColEl);
  if (parentTableEl.value) loadColumns(parentTableEl.value, parentColEl);

  document.getElementById('fk-cancel').addEventListener('click', closeModal);
  document.getElementById('fk-submit').addEventListener('click', submitAddFk);
}

async function loadColumns(tableId, selectEl) {
  if (!selectEl) return;
  selectEl.disabled = true;
  selectEl.innerHTML = '<option>Loading…</option>';
  try {
    const res = await apiFetch(`/view/viewTableStructure/${tableId}`);
    if (!res.ok) { selectEl.innerHTML = '<option>Failed to load</option>'; return; }
    const data = await res.json();
    const cols = Array.isArray(data.coloumns) ? data.coloumns : [];
    if (cols.length === 0) { selectEl.innerHTML = '<option>No columns</option>'; selectEl.disabled = true; return; }
    selectEl.innerHTML = cols.map(c => {
      const key = c.is_primary_key ? ' (PK)' : (c.is_unique ? ' (Unique)' : '');
      const tag = (c.is_primary_key || c.is_unique) ? ' data-key="1"' : '';
      return `<option value="${c.id}"${tag}>${escHtml(c.col_name)}${escHtml(key)}</option>`;
    }).join('');
    selectEl.disabled = false;
  } catch (_) {
    selectEl.innerHTML = '<option>Network error</option>';
  }
}

async function submitAddFk() {
  const childTableEl = document.getElementById('fk-child-table');
  const childColEl = document.getElementById('fk-child-col');
  const parentColEl = document.getElementById('fk-parent-col');
  const nameEl = document.getElementById('fk-name');
  const onDeleteEl = document.getElementById('fk-on-delete');
  const onUpdateEl = document.getElementById('fk-on-update');

  if (!childColEl.value || !parentColEl.value) {
    showToast('Select both child and parent columns', 'error');
    return;
  }
  if (!nameEl.value.trim()) {
    showToast('Enter a foreign key constraint name', 'error');
    return;
  }

  const payload = {
    proj_id: vpState.projectId,
    schema_table_id: childTableEl.value,
    child_col_id: childColEl.value,
    parent_col_id: parentColEl.value,
    fk_constraint_name: nameEl.value.trim(),
    on_dlt: onDeleteEl.value,
    on_upd: onUpdateEl.value,
  };

  const submitBtn = document.getElementById('fk-submit');
  setLoading(submitBtn, true);
  try {
    const res = await apiFetch('/project/addForeignKey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.msg || 'Foreign key added', 'success');
      closeModal();
      vpState.loaded.fk = false;
      loadForeignKeys();
    } else {
      showToast(data.msg || 'Failed to add foreign key', 'error');
      setLoading(submitBtn, false);
    }
  } catch (_) {
    showToast('Network error', 'error');
    setLoading(submitBtn, false);
  }
}

/* -----------------------------------------------------------------------
   CORS Origins
   ----------------------------------------------------------------------- */

async function loadCorsOrigins() {
  const body = document.getElementById('vp-cors-body');
  if (!body) return;
  body.innerHTML = '<p class="vp-empty__text">Loading…</p>';

  const addBtn = document.getElementById('btn-add-cors');

  try {
    const res = await apiFetch(`/view/corsOrigin/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }

    const origins = res.ok ? ((await res.json()).cors_origins || []) : [];

    if (!vpState.isAuthor && addBtn) addBtn.hidden = true;
    else if (addBtn) addBtn.hidden = false;

    const list = origins.map(o => `
      <div class="vp-origin-row" data-origin="${escHtml(o.origin)}">
        <span class="vp-origin-row__url">${escHtml(o.origin)}</span>
        <button class="btn btn--ghost btn--sm vp-origin-remove" type="button" ${vpState.isAuthor ? '' : 'hidden'}>Remove</button>
      </div>
    `).join('');

    const listHtml = origins.length
      ? list
      : '<p class="vp-empty__text">No CORS origins configured.</p>';

    body.innerHTML = listHtml;

    if (vpState.isAuthor) {
      body.querySelectorAll('.vp-origin-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.vp-origin-row');
          removeCorsOrigin(row.getAttribute('data-origin'));
        });
      });
    } else if (!body.querySelector('.vp-origin-notice')) {
      const n = document.createElement('p');
      n.className = 'vp-origin-notice';
      n.textContent = 'Read-only — only the project author can manage CORS origins.';
      body.appendChild(n);
    }
  } catch (_) {
    body.innerHTML = '<p class="vp-empty__text">Network error. Is the backend reachable?</p>';
  }
}

async function addCorsOrigin(origin) {
  try {
    const res = await apiFetch('/project/addCorsOrigin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proj_id: vpState.projectId, origin }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast(data.msg || 'CORS origin added', 'success'); vpState.loaded.cors = false; loadCorsOrigins(); }
    else showToast(data.msg || 'Failed to add origin', 'error');
  } catch (_) { showToast('Network error', 'error'); }
}

function removeCorsOrigin(origin) {
  confirmModal({
    title: 'Remove CORS Origin',
    message: `Remove CORS origin "${origin}"? This cannot be undone.`,
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await apiFetch('/project/removeCorsOrigin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proj_id: vpState.projectId, origin }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { showToast(data.msg || 'CORS origin removed', 'success'); vpState.loaded.cors = false; loadCorsOrigins(); }
        else showToast(data.msg || 'Failed to remove origin', 'error');
      } catch (_) { showToast('Network error', 'error'); }
    },
  });
}

async function openAddCorsModal() {
  if (!vpState.isAuthor) return;
  const bodyHtml = `
    <div class="field">
      <label for="cors-origin-input">Origin URL</label>
      <input type="text" id="cors-origin-input" placeholder="https://app.example.com" maxlength="200" />
      <span class="field__hint">Include the scheme (https://). Wildcards are not supported.</span>
    </div>
  `;
  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="cors-cancel" type="button">Cancel</button>
    <button class="btn btn--primary btn--sm" id="cors-submit" type="button">Add Origin</button>
  `;
  showModal('Add CORS Origin', bodyHtml, footHtml);

  const input = document.getElementById('cors-origin-input');
  if (input) input.focus();
  document.getElementById('cors-cancel').addEventListener('click', closeModal);
  document.getElementById('cors-submit').addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) { showToast('Enter an origin URL', 'error'); return; }
    closeModal();
    addCorsOrigin(value);
  });
}

/* -----------------------------------------------------------------------
   Collaborators
   ----------------------------------------------------------------------- */

async function loadCollaborators() {
  const body = document.getElementById('vp-collab-body');
  if (!body) return;

  const inviteBtn = document.getElementById('btn-invite-collab');
  if (inviteBtn) inviteBtn.hidden = !vpState.isAuthor;

  body.innerHTML = '<p class="vp-empty__text">Loading…</p>';

  try {
    const res = await apiFetch(`/view/collaborators/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) { body.innerHTML = emptyState('Could not load collaborators'); return; }
    const data = await res.json();
    vpState.collaborators = Array.isArray(data.collaborators) ? data.collaborators : [];
  } catch (_) {
    body.innerHTML = emptyState('Network error. Is the backend reachable?');
    return;
  }

  const collabs = vpState.collaborators;
  const accepted = collabs.filter(c => !c.status || c.status === 'accepted');
  const pending = collabs.filter(c => c.status === 'pending');

  let html = '';

  html += '<h3 class="vp-collab-section__title">Collaborators</h3>';
  html += accepted.length
    ? accepted.map(c => collabRowHtml(c, 'accepted')).join('')
    : '<p class="vp-empty__text">No collaborators yet.</p>';

  if (vpState.isAuthor) {
    html += '<h3 class="vp-collab-section__title">Pending invitations</h3>';
    html += pending.length
      ? pending.map(c => collabRowHtml(c, 'pending')).join('')
      : '<p class="vp-empty__text">No pending invitations.</p>';
  }

  body.innerHTML = html;

  body.querySelectorAll('.vp-collab-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.getAttribute('data-user-id');
      const isSelf = btn.getAttribute('data-self') === 'true';
      const status = btn.getAttribute('data-status') || 'accepted';
      removeCollaborator(userId, isSelf, status);
    });
  });
}

async function searchUsers(queryStr, resultsEl) {
  resultsEl.innerHTML = '<p class="vp-empty__text">Searching…</p>';
  try {
    const res = await apiFetch('/view/getUsername', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: queryStr }),
    });
    if (!res.ok) { resultsEl.innerHTML = '<p class="vp-empty__text">Search failed.</p>'; return; }
    const users = await res.json();
    const list = Array.isArray(users) ? users : [];

    const knownIds = new Set((vpState.collaborators || []).map(c => String(c.user_id)));
    const filtered = list.filter(u =>
      String(u.id) !== String(vpState.loggedInUserId) && !knownIds.has(String(u.id))
    );

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<p class="vp-empty__text">No matching users.</p>';
      return;
    }

    resultsEl.innerHTML = filtered.map(u => `
      <div class="vp-collab-row" data-user-id="${u.id}">
        <span class="vp-collab-row__avatar" aria-hidden="true">${escHtml((u.name || u.username || '?').charAt(0).toUpperCase())}</span>
        <div class="vp-collab-row__info">
          <span class="vp-collab-row__name">${escHtml(u.name || u.username || 'Unknown')}</span>
          <span class="vp-collab-row__handle">@${escHtml(u.username || '')}</span>
        </div>
        <button class="btn btn--primary btn--sm vp-collab-invite" type="button" data-user-id="${u.id}">Invite</button>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.vp-collab-invite').forEach(btn => {
      btn.addEventListener('click', () => inviteUser(btn));
    });
  } catch (_) {
    resultsEl.innerHTML = '<p class="vp-empty__text">Network error.</p>';
  }
}

async function inviteUser(btn) {
  const userId = btn.getAttribute('data-user-id');
  setLoading(btn, true);
  try {
    const res = await apiFetch('/project/collabInvitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proj_id: vpState.projectId, user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.msg || 'Invitation sent', 'success');
      if (btn.parentNode) {
        btn.parentNode.innerHTML = '<span class="vp-collab-row__invited">Invited</span>';
      }
      vpState.loaded.collab = false;
      loadCollaborators();
    } else {
      showToast(data.msg || 'Failed to invite', 'error');
      setLoading(btn, false);
    }
  } catch (_) {
    showToast('Network error', 'error');
    setLoading(btn, false);
  }
}

function collabRowHtml(c, status) {
  const initial = (c.name || c.username || '?').charAt(0).toUpperCase();
  const isSelf = String(c.user_id) === String(vpState.loggedInUserId);

  let actionHtml;
  if (status === 'pending') {
    actionHtml = `<button class="btn btn--ghost btn--sm vp-collab-remove" type="button"
      data-user-id="${c.user_id}" data-self="false" data-status="pending">Cancel</button>`;
  } else {
    const showRemove = vpState.isAuthor;
    actionHtml = showRemove
      ? `<button class="btn btn--ghost btn--sm vp-collab-remove" type="button" data-user-id="${c.user_id}" data-self="${isSelf}" data-status="accepted">Remove</button>`
      : '';
  }

  return `
    <div class="vp-collab-row" data-user-id="${c.user_id}">
      <span class="vp-collab-row__avatar" aria-hidden="true">${escHtml(initial)}</span>
      <div class="vp-collab-row__info">
        <span class="vp-collab-row__name">${escHtml(c.name || c.username || 'Unknown')}</span>
        <span class="vp-collab-row__handle">@${escHtml(c.username || '')}</span>
      </div>
      <span class="vp-collab-row__date">${escHtml(formatDate(c.created_at))}</span>
      ${actionHtml}
    </div>`;
}

async function inviteCollaborator() {
  if (!vpState.isAuthor) return;
  const bodyHtml = `
    <div class="field">
      <label for="collab-search">Search by username</label>
      <input type="text" id="collab-search" placeholder="Type a username…" maxlength="50" autocomplete="off" />
      <span class="field__hint">Results update as you type. Invite sends an invitation the user can accept.</span>
    </div>
    <div id="collab-search-results" class="vp-collab-search-results" aria-live="polite">
      <p class="vp-empty__text">Start typing to search users.</p>
    </div>
  `;
  showModal('Invite Collaborator', bodyHtml, '');

  const searchEl = document.getElementById('collab-search');
  const resultsEl = document.getElementById('collab-search-results');
  if (searchEl) searchEl.focus();

  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = searchEl.value.trim();
    if (!q) {
      resultsEl.innerHTML = '<p class="vp-empty__text">Start typing to search users.</p>';
      return;
    }
    debounce = setTimeout(() => searchUsers(q, resultsEl), 250);
  });
}

function removeCollaborator(userId, isSelf, status) {
  let title, message, confirmLabel, cancelLabel;
  if (status === 'pending') {
    title = 'Cancel Invitation';
    message = 'Cancel this invitation? The user will no longer be invited to this project.';
    confirmLabel = 'Cancel invitation';
    cancelLabel = 'Close';
  } else if (isSelf) {
    title = 'Leave Project';
    message = 'Leave this project? You will lose access to it.';
    confirmLabel = 'Leave';
  } else {
    title = 'Remove Collaborator';
    message = 'Remove this collaborator? This cannot be undone.';
    confirmLabel = 'Remove';
  }
  confirmModal({
    title,
    message,
    confirmLabel,
    cancelLabel: cancelLabel || 'Cancel',
    danger: true,
    onConfirm: async () => {
      try {
    const res = await apiFetch('/project/removeCollaboration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, proj_id: vpState.projectId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (isSelf) {
        showToast(data.msg || 'You left the project', 'success');
        window.location.href = '/projects';
        return;
      }
      showToast(data.msg || (status === 'pending' ? 'Invitation cancelled' : 'Collaborator removed'), 'success');
      const meRes = await apiFetch(`/view/collaborators/${vpState.projectId}`);
      if (meRes.ok) {
        const d = await meRes.json();
        vpState.collaborators = Array.isArray(d.collaborators) ? d.collaborators : [];
      }
      vpState.loaded.collab = false;
      loadCollaborators();
    } else {
      showToast(data.msg || 'Failed to remove collaborator', 'error');
    }
  } catch (_) { showToast('Network error', 'error'); }
  },
  });
}

/* -----------------------------------------------------------------------
   Settings
   ----------------------------------------------------------------------- */

function initSettingsForm() {
  const form = document.getElementById('vp-settings-form');
  if (!form) return;
  const p = vpState.project;
  if (!p) return;

  const nameEl = document.getElementById('vp-settings-name');
  const descEl = document.getElementById('vp-settings-desc');
  const authEl = document.getElementById('vp-settings-auth');
  const banner = document.getElementById('vp-settings-readonly-banner');
  const saveBtn = document.getElementById('btn-save-settings');
  const dangerZone = document.getElementById('vp-danger-zone');

  if (nameEl) nameEl.value = p.name || '';
  if (descEl) descEl.value = p.description || '';
  if (authEl) authEl.checked = !!p.auth_enabled;

  const tags = Array.isArray(p.project_tags) ? p.project_tags.map(t => t.name) : [];
  vpState.settingsTags = tags.slice();
  renderSettingsTags();

  if (!vpState.isAuthor) {
    [nameEl, descEl, authEl].forEach(el => { if (el) el.disabled = true; });
    if (saveBtn) saveBtn.hidden = true;
    if (dangerZone) dangerZone.hidden = true;
    if (banner) banner.hidden = false;
    const addTagBtn = document.getElementById('btn-add-tag');
    const tagInput = document.getElementById('vp-settings-tag-input');
    if (addTagBtn) addTagBtn.disabled = true;
    if (tagInput) tagInput.disabled = true;
  }

  form.addEventListener('submit', submitSettings);
  const addTagBtn = document.getElementById('btn-add-tag');
  if (addTagBtn && vpState.isAuthor) addTagBtn.addEventListener('click', addSettingsTag);
}

function renderSettingsTags() {
  const wrap = document.getElementById('vp-settings-tags');
  if (!wrap) return;
  wrap.innerHTML = vpState.settingsTags.map((t, i) => `
    <span class="tag" data-tag-index="${i}">${escHtml(t)}${vpState.isAuthor ? ' <button type="button" class="tag__remove" data-tag-index="${i}" aria-label="Remove tag">&times;</button>' : ''}</span>
  `).join('');
  wrap.querySelectorAll('.tag__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-tag-index'), 10);
      vpState.settingsTags.splice(idx, 1);
      renderSettingsTags();
    });
  });
}

function addSettingsTag() {
  const input = document.getElementById('vp-settings-tag-input');
  if (!input) return;
  const val = input.value.trim().toLowerCase();
  if (!val) return;
  if (!(val[0] >= 'a' && val[0] <= 'z')) { showToast('Tag must start with a–z', 'error'); return; }
  if (val.length < 2 || val.length > 20) { showToast('Tag must be 2–20 characters', 'error'); return; }
  if (vpState.settingsTags.length >= 10) { showToast('Max 10 tags allowed', 'error'); return; }
  if (vpState.settingsTags.includes(val)) { showToast('Tag already added', 'error'); return; }
  vpState.settingsTags.push(val);
  input.value = '';
  renderSettingsTags();
}

async function submitSettings(e) {
  e.preventDefault();
  if (!vpState.isAuthor) return;
  const nameEl = document.getElementById('vp-settings-name');
  const descEl = document.getElementById('vp-settings-desc');
  const authEl = document.getElementById('vp-settings-auth');
  const saveBtn = document.getElementById('btn-save-settings');

  const payload = {
    proj_name: nameEl.value.trim(),
    description: descEl.value,
    enable_auth: authEl.checked,
    tags: vpState.settingsTags,
  };

  setLoading(saveBtn, true);
  try {
    const res = await apiFetch(`/project/updateProject/${vpState.projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.msg || 'Project updated', 'success');
      await loadProjectHeader();
    } else {
      showToast(data.msg || 'Failed to update project', 'error');
    }
  } catch (_) { showToast('Network error', 'error'); }
  finally { setLoading(saveBtn, false); }
}

function deleteProject() {
  if (!vpState.isAuthor) return;
  confirmModal({
    title: 'Delete Project',
    message: 'Delete this project permanently? This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {
      try {
    const res = await apiFetch(`/project/deleteProject/${vpState.projectId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.msg || 'Project deleted', 'success');
      window.location.href = '/projects';
    } else {
      showToast(data.msg || 'Failed to delete project', 'error');
    }
  } catch (_) { showToast('Network error', 'error'); }
  },
  });
}

/* -----------------------------------------------------------------------
   Global actions / bindings
   ----------------------------------------------------------------------- */

function bindGlobalActions() {
  const addFkBtn = document.getElementById('btn-add-fk');
  if (addFkBtn) addFkBtn.addEventListener('click', openAddFkModal);

  const addCorsBtn = document.getElementById('btn-add-cors');
  if (addCorsBtn) addCorsBtn.addEventListener('click', openAddCorsModal);

  const inviteBtn = document.getElementById('btn-invite-collab');
  if (inviteBtn) inviteBtn.addEventListener('click', inviteCollaborator);

  const leaveBtn = document.getElementById('vp-leave-project');
  if (leaveBtn) leaveBtn.addEventListener('click', () => removeCollaborator(vpState.loggedInUserId, true, 'accepted'));

  const deleteBtn = document.getElementById('btn-delete-project');
  if (deleteBtn) deleteBtn.addEventListener('click', deleteProject);
}

/* -----------------------------------------------------------------------
   Modal helpers
   ----------------------------------------------------------------------- */

function initModal() {
  const overlay = document.getElementById('vp-modal-overlay');
  const closeBtn = document.getElementById('vp-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

function showModal(title, bodyHtml, footHtml) {
  const overlay = document.getElementById('vp-modal-overlay');
  const titleEl = document.getElementById('vp-modal-title');
  if (titleEl) titleEl.textContent = title;
  setModalBody(bodyHtml);
  setModalFoot(footHtml);
  if (overlay) overlay.hidden = false;
}

function setModalBody(html) {
  const el = document.getElementById('vp-modal-body');
  if (el) el.innerHTML = html;
}

function setModalFoot(html) {
  const el = document.getElementById('vp-modal-foot');
  if (el) el.innerHTML = html;
}

function closeModal() {
  const overlay = document.getElementById('vp-modal-overlay');
  if (overlay) overlay.hidden = true;
  setModalBody('');
  setModalFoot('');
}

function confirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm }) {
  const bodyHtml = `<p class="vp-confirm-msg">${escHtml(message)}</p>`;
  const okClass = danger ? 'btn btn--ghost btn--sm' : 'btn btn--primary btn--sm';
  const okStyle = danger ? ' style="color:var(--error);border-color:var(--error);"' : '';
  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="confirm-cancel" type="button">${escHtml(cancelLabel)}</button>
    <button class="${okClass}" id="confirm-ok" type="button"${okStyle}>${escHtml(confirmLabel)}</button>
  `;
  showModal(title, bodyHtml, footHtml);
  document.getElementById('confirm-cancel').addEventListener('click', closeModal);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal();
    if (typeof onConfirm === 'function') onConfirm();
  });
}

/* -----------------------------------------------------------------------
   Rendering helpers
   ----------------------------------------------------------------------- */

function renderShimmer(container, rows) {
  let html = '';
  for (let i = 0; i < (rows || 4); i++) {
    html += `<div class="vp-shimmer-row" aria-hidden="true"></div>`;
  }
  container.innerHTML = `<div class="vp-shimmer">${html}</div>`;
}

function emptyState(msg) {
  return `
    <div class="vp-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="vp-empty__icon">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <p class="vp-empty__text">${escHtml(msg)}</p>
    </div>`;
}

function showToast(msg, type) {
  let host = document.getElementById('vp-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'vp-toast-host';
    host.className = 'vp-toast-host';
    document.body.appendChild(host);
  }
  const toast = document.createElement('div');
  toast.className = `vp-toast vp-toast--${type === 'error' ? 'error' : 'success'}`;
  toast.textContent = msg;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('btn--loading', on);
  btn.disabled = on;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* -----------------------------------------------------------------------
   Fetch wrapper
   ----------------------------------------------------------------------- */

async function apiFetch(url, opts = {}) {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  opts.credentials = 'include';
  return fetch(`${backendUrl}${url}`, opts);
}
