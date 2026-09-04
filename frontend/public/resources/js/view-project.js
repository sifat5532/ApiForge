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
  apis: [],
  loaded: { tables: false, fk: false, apis: false, cors: false, collab: false, settings: false },
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
  const match = window.location.pathname.match(/\/project\/([^/]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
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
    vpState.projectId = p.id; // backend may have matched a name; pin numeric id for subsequent calls
    vpState.authorId = p.author_id;
    vpState.isAuthor = String(vpState.loggedInUserId) === String(p.author_id);

    const leaveBtn = document.getElementById('vp-leave-project');
    const regenBtn = document.getElementById('vp-regen-key');
    if (leaveBtn) leaveBtn.hidden = vpState.isAuthor;
    if (regenBtn) regenBtn.hidden = !vpState.isAuthor;

    // Apply all author-only action button visibility immediately after role is known.
    // These buttons live in the panel action bars and should not wait for lazy tab load.
    // Author-only: invite collaborators & manage CORS origins.
    // Collaborators MAY create/edit tables and add FKs, so those stay visible.
    const inviteBtn    = document.getElementById('btn-invite-collab');
    const addCorsBtn   = document.getElementById('btn-add-cors');
    if (inviteBtn)    inviteBtn.hidden    = !vpState.isAuthor;
    if (addCorsBtn)   addCorsBtn.hidden   = !vpState.isAuthor;

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
    'tab-apis':     { panel: 'panel-apis',     load: loadApis },
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

  // Collaborators may create tables too — keep the button visible.

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
        <td>
          <button class="btn btn--ghost btn--sm vp-table-view-data" type="button" data-table-id="${t.id}" title="View table data">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="3" y1="15" x2="21" y2="15"></line>
              <line x1="9" y1="9" x2="9" y2="21"></line>
            </svg>
            View Data
          </button>
        </td>
        <td>
          <button class="btn btn--ghost btn--sm vp-table-edit" type="button" data-table-id="${t.id}" title="Edit table (coming soon)" disabled style="opacity:0.5;cursor:not-allowed;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
        </td>
      </tr>
    `).join('');

    body.innerHTML = `
      <table class="vp-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Columns</th>
            <th>Created</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div id="vp-struct-wrap"></div>
      <div id="vp-data-wrap"></div>
    `;

    body.querySelectorAll('.vp-table__link').forEach(btn => {
      btn.addEventListener('click', () => toggleTableStructure(btn.getAttribute('data-table-id')));
    });

    body.querySelectorAll('.vp-table-view-data').forEach(btn => {
      btn.addEventListener('click', () => toggleTableData(btn.getAttribute('data-table-id')));
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
    const tableMeta = (vpState.tables || []).find(t => String(t.id) === String(tableId));
    const tableName = tableMeta ? tableMeta.table_name : '';
    const rows = cols.length
      ? cols.map(c => `
        <tr>
          <td>${escHtml(c.col_name)}</td>
          <td>${escHtml(c.col_type)}</td>
          <td>${c.is_primary_key ? '<span class="tag">PK</span>' : ''}${c.is_unique ? ' <span class="tag">UNIQUE</span>' : ''}
          ${c.is_auto_increment ? ' <span class="tag">AUTO INCREMENT</span>' : ''}</td>
          <td>${escHtml(c.is_nullable ? 'NULL' : 'NOT NULL')}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="color:var(--text-faint)">No columns</td></tr>`;

    wrap.innerHTML = `
      <div class="vp-struct-panel">
        ${tableName ? `<h4 class="vp-struct-panel__title">${escHtml(tableName)}</h4>` : ''}
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
   Table Data (view rows)
   ----------------------------------------------------------------------- */

const _tableDataState = { tableId: null, limit: 10, offset: 0 };

async function toggleTableData(tableId) {
  const wrap = document.getElementById('vp-data-wrap');
  if (!wrap) return;

  // Collapse if the same table is already open
  if (_tableDataState.tableId === tableId && !wrap.hidden && wrap.innerHTML !== '') {
    wrap.innerHTML = '';
    wrap.removeAttribute('data-open');
    _tableDataState.tableId = null;
    return;
  }

  _tableDataState.tableId = tableId;
  _tableDataState.offset = 0;
  wrap.setAttribute('data-open', tableId);

  await renderTableData(tableId);
}

async function renderTableData(tableId) {
  const wrap = document.getElementById('vp-data-wrap');
  if (!wrap) return;

  const { limit, offset } = _tableDataState;
  const tableMeta = (vpState.tables || []).find(t => String(t.id) === String(tableId));
  const tableName = tableMeta ? tableMeta.table_name : `Table #${tableId}`;

  wrap.innerHTML = `<div class="vp-struct-panel"><div class="vp-struct-panel__shimmer">Loading data…</div></div>`;

  try {
    const res = await apiFetch(`/view/viewTableData/${tableId}?limit=${limit}&offset=${offset}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      wrap.innerHTML = `<div class="vp-struct-panel"><p class="vp-empty__text">${escHtml(errData.msg || 'Could not load table data.')}</p></div>`;
      return;
    }

    const data = await res.json();
    const rows = Array.isArray(data.data) ? data.data : [];

    if (rows.length === 0 && offset === 0) {
      wrap.innerHTML = `
        <div class="vp-struct-panel">
          <div class="vp-struct-panel__header">
            <h4 class="vp-struct-panel__title">${escHtml(tableName)} — Data</h4>
          </div>
          <p class="vp-empty__text">No rows in this table.</p>
        </div>`;
      return;
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const headerCells = columns.map(c => `<th>${escHtml(c)}</th>`).join('');
    const bodyRows = rows.map(row =>
      `<tr>${columns.map(c => `<td>${escHtml(row[c] != null ? String(row[c]) : 'NULL')}</td>`).join('')}</tr>`
    ).join('');

    const hasPrev = offset > 0;
    const hasNext = rows.length === limit;
    const pageInfo = `Rows ${offset + 1}–${offset + rows.length}`;

    wrap.innerHTML = `
      <div class="vp-struct-panel">
        <div class="vp-struct-panel__header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <h4 class="vp-struct-panel__title" style="margin:0;">${escHtml(tableName)} — Data</h4>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:0.78rem;color:var(--text-faint);">${escHtml(pageInfo)}</span>
            <button class="btn btn--ghost btn--sm" id="vp-data-prev" type="button" ${hasPrev ? '' : 'disabled'}>← Prev</button>
            <button class="btn btn--ghost btn--sm" id="vp-data-next" type="button" ${hasNext ? '' : 'disabled'}>Next →</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="vp-table">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('vp-data-prev')?.addEventListener('click', () => {
      _tableDataState.offset = Math.max(0, offset - limit);
      renderTableData(tableId);
    });
    document.getElementById('vp-data-next')?.addEventListener('click', () => {
      _tableDataState.offset = offset + limit;
      renderTableData(tableId);
    });
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

  // Collaborators may add FKs too — keep the button visible.

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
    <div class="modal-form">
      <div class="modal-form__row">
        <div class="field">
          <label class="field__label" for="fk-child-table">Child table</label>
          <select id="fk-child-table" class="modal-select">${tableOptions}</select>
        </div>
        <div class="field">
          <label class="field__label" for="fk-child-col">Child column</label>
          <select id="fk-child-col" class="modal-select" disabled><option>Select child table first</option></select>
        </div>
      </div>
      <div class="modal-form__row">
        <div class="field">
          <label class="field__label" for="fk-parent-table">Parent table</label>
          <select id="fk-parent-table" class="modal-select">${tableOptions}</select>
        </div>
        <div class="field">
          <label class="field__label" for="fk-parent-col">Parent column <span class="field__hint-inline">(PK / Unique)</span></label>
          <select id="fk-parent-col" class="modal-select" disabled><option>Select parent table first</option></select>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="fk-name">Constraint name</label>
        <input class="modal-input" type="text" id="fk-name" maxlength="30" placeholder="e.g. fk_order_user" autocomplete="off" />
        <span class="field__hint">Lowercase letters, digits and underscores only.</span>
      </div>
      <div class="modal-form__row">
        <div class="field">
          <label class="field__label" for="fk-on-delete">On Delete</label>
          <select id="fk-on-delete" class="modal-select">
            <option>CASCADE</option><option>SET NULL</option><option>RESTRICT</option><option selected>NO ACTION</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="fk-on-update">On Update</label>
          <select id="fk-on-update" class="modal-select">
            <option>CASCADE</option><option>SET NULL</option><option>RESTRICT</option><option selected>NO ACTION</option>
          </select>
        </div>
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
   APIs
   ----------------------------------------------------------------------- */

async function loadApis() {
  const body = document.getElementById('vp-apis-body');
  if (!body) return;
  renderShimmer(body, 3);

  try {
    const res = await apiFetch(`/view/apis/${vpState.projectId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) { body.innerHTML = emptyState('Could not load APIs'); return; }

    const data = await res.json();
    const apis = Array.isArray(data.apis) ? data.apis : [];
    vpState.apis = apis;

    if (apis.length === 0) {
      body.innerHTML = emptyState('No APIs defined yet. Click “+ API” to create your first endpoint.');
      return;
    }

    body.innerHTML = apis.map(apiCardHtml).join('');

    body.querySelectorAll('.vp-api-copy').forEach(btn => {
      btn.addEventListener('click', () => copyApiUrl(btn));
    });
    body.querySelectorAll('.vp-api-details').forEach(btn => {
      btn.addEventListener('click', () => openApiDetailsModal(btn.getAttribute('data-api-id')));
    });
    body.querySelectorAll('.vp-api-edit').forEach(btn => {
      btn.addEventListener('click', () => editApi(btn.getAttribute('data-api-id')));
    });
    body.querySelectorAll('.vp-api-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteApi(btn.getAttribute('data-api-id'), btn.getAttribute('data-api-name')));
    });
  } catch (_) {
    body.innerHTML = emptyState('Network error. Is the backend reachable?');
  }
}

/* Build the public call URL: BACKEND/api/:username/:projectname/:apiname */
function buildApiUrl(api) {
  const base = window.BACKEND_URL || 'http://localhost:3000';
  const username = api.author_username || '';
  const projectName = api.project_name || (vpState.project && vpState.project.name) || '';
  return `${base}/api/${encodeURIComponent(username)}/${encodeURIComponent(projectName)}/${encodeURIComponent(api.name)}`;
}

function apiCardHtml(api) {
  const method = String(api.method || 'GET').toUpperCase();
  const methodClass = `vp-api-method--${method.toLowerCase()}`;
  const url = buildApiUrl(api);
  const active = api.is_active !== false;

  return `
    <div class="vp-api-card" data-api-id="${api.id}">
      <div class="vp-api-card__head">
        <span class="vp-api-method ${methodClass}">${escHtml(method)}</span>
        <span class="vp-api-card__name">${escHtml(api.name)}</span>
        <span class="vp-api-status ${active ? 'vp-api-status--active' : 'vp-api-status--inactive'}">${active ? 'Active' : 'Inactive'}</span>
        <div class="vp-api-card__actions">
          <button class="btn btn--ghost btn--sm vp-api-details" type="button" data-api-id="${api.id}" title="View request details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="vp-api-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            View details
          </button>
          <button class="btn btn--ghost btn--sm vp-api-edit" type="button" data-api-id="${api.id}" title="Edit API">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="vp-api-icon">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
          <button class="btn btn--ghost btn--sm vp-api-delete" type="button" data-api-id="${api.id}" data-api-name="${escHtml(api.name)}" title="Delete API">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="vp-api-icon">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
            Delete
          </button>
        </div>
      </div>
      <div class="vp-api-url" data-url="${escHtml(url)}">
        <span class="vp-api-url__method">${escHtml(method)}</span>
        <code class="vp-api-url__code">${escHtml(url)}</code>
        <button class="btn btn--ghost btn--sm vp-api-copy" type="button" title="Copy API URL">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="vp-api-icon">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        </button>
      </div>
      <div class="vp-api-meta">
        <span class="vp-api-meta__item"><span class="vp-api-meta__label">Rate limit</span> ${escHtml(api.rate_limit_per_day != null ? api.rate_limit_per_day + '/day' : '—')}</span>
        <span class="vp-api-meta__sep" aria-hidden="true">·</span>
        <span class="vp-api-meta__item"><span class="vp-api-meta__label">Created</span> ${escHtml(formatDate(api.created_at))}</span>
      </div>
    </div>`;
}

function copyApiUrl(btn) {
  const card = btn.closest('.vp-api-url');
  const url = card ? card.getAttribute('data-url') : '';
  if (!url) return;
  navigator.clipboard?.writeText(url).then(() => {
    const original = btn.innerHTML;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }).catch(() => showToast('Could not copy to clipboard', 'error'));
}

function editApi(apiId) {
  // The API query builder is not part of this view; direct the user to the builder.
  showToast('API editing is available in the API builder (coming soon).', 'error');
}

/* ---- Dynamic parameter extraction from query_definition ----
   Walks a stored query_definition (per HTTP method) and returns the list of
   dynamic inputs a caller must / may supply, so consumers know exactly how to
   invoke the endpoint. Shapes come from backend/routes/api.js.               */

/* Normalises a GET/PUT/DELETE where-value (val1/val2) into a param row. */
function paramFromWhereVal(val, ctxLabel) {
  if (!val || !val.is_dynamic) return null;
  return {
    name: val.dynamic_field_name || '(unnamed)',
    source: normaliseSource(val.dynamic_value_getting_type),
    required: !!val.is_dynamic_required,
    fallback: val.fallback_value,
    context: ctxLabel,
  };
}

/* Normalises a POST/PUT value_obj_array entry into a param row. */
function paramFromValueObj(v) {
  // A value entry may be nested as { value: {...} } or be the object directly.
  const val = v && v.value ? v.value : v;
  if (!val) return null;
  const source = normaliseSource(val.source);
  // static_value entries are not caller-supplied inputs.
  if (!val.is_dynamic || source === 'Static value') return null;
  return {
    name: val.dynamic_field_name || '(unnamed)',
    source,
    required: val.default_value === undefined || val.default_value === null,
    fallback: val.default_value,
    context: 'Insert/Update value',
  };
}

function normaliseSource(raw) {
  switch (raw) {
    case 'query_param': return 'Query param';
    case 'route_param': return 'Route param';
    case 'body':
    case 'body_field': return 'Body field';
    case 'static_value': return 'Static value';
    default: return raw || '—';
  }
}

/* Recursively walk a where[] array (conditions + nested groups). */
function collectWhereParams(nodes, out) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach(node => {
    if (!node) return;
    if (node.node_type === 'group') {
      collectWhereParams(node.children, out);
      return;
    }
    // condition
    const label = 'Filter (where)';
    const p1 = paramFromWhereVal(node.val1, label);
    if (p1) out.push(p1);
    const p2 = paramFromWhereVal(node.val2, label);
    if (p2) out.push(p2);
  });
}

/* Returns { params: [...], meta: {...} } describing a stored definition. */
function extractApiParams(method, def) {
  const params = [];
  const meta = {};
  if (!def || typeof def !== 'object') return { params, meta };

  const m = String(method || 'GET').toUpperCase();

  if (m === 'GET') {
    collectWhereParams(def.where, params);
    if (Array.isArray(def.having)) {
      def.having.forEach(h => {
        const p = paramFromWhereVal(h, 'Having (aggregate filter)');
        if (p) params.push(p);
      });
    }
    meta.limit = def.limit;
    meta.offset = def.offset;
    meta.allow_client_paging = !!def.allow_client_paging;
  } else if (m === 'POST') {
    if (Array.isArray(def.value_obj_array)) {
      def.value_obj_array.forEach(v => {
        const p = paramFromValueObj(v);
        if (p) params.push(p);
      });
    }
  } else if (m === 'PUT') {
    if (Array.isArray(def.value_obj_array)) {
      def.value_obj_array.forEach(v => {
        const p = paramFromValueObj(v);
        if (p) params.push(p);
      });
    }
    collectWhereParams(def.where, params);
  } else if (m === 'DELETE') {
    collectWhereParams(def.where, params);
  }

  // De-duplicate by name + source (same field can be referenced twice).
  const seen = new Set();
  const deduped = [];
  params.forEach(p => {
    const key = `${p.source}::${p.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(p);
  });

  return { params: deduped, meta };
}

function openApiDetailsModal(apiId) {
  const api = (vpState.apis || []).find(a => String(a.id) === String(apiId));
  if (!api) { showToast('API not found', 'error'); return; }

  const method = String(api.method || 'GET').toUpperCase();
  const url = buildApiUrl(api);
  const authRequired = !!(vpState.project && vpState.project.auth_enabled);

  // query_definition may arrive as an object (JSONB) or a JSON string.
  let def = api.query_definition;
  if (typeof def === 'string') {
    try { def = JSON.parse(def); } catch (_) { def = null; }
  }

  const { params, meta } = extractApiParams(method, def);

  const queryParams = params.filter(p => p.source === 'Query param');
  const routeParams = params.filter(p => p.source === 'Route param');
  const bodyParams  = params.filter(p => p.source === 'Body field');

  const paramRows = (list) => list.map(p => `
    <tr>
      <td><code class="vp-api-param__name">${escHtml(p.name)}</code></td>
      <td>${p.required
            ? '<span class="vp-api-req vp-api-req--yes">Required</span>'
            : '<span class="vp-api-req vp-api-req--no">Optional</span>'}</td>
      <td>${p.fallback === undefined || p.fallback === null
            ? '<span class="vp-api-param__none">—</span>'
            : `<code>${escHtml(String(p.fallback))}</code>`}</td>
      <td class="vp-api-param__ctx">${escHtml(p.context || '')}</td>
    </tr>
  `).join('');

  const paramTable = (title, list) => list.length ? `
    <div class="vp-api-detail-section">
      <h4 class="vp-api-detail-section__title">${escHtml(title)} <span class="vp-api-detail-count">${list.length}</span></h4>
      <table class="vp-table vp-api-param-table">
        <thead><tr><th>Field name</th><th>Required</th><th>Fallback / default</th><th>Used in</th></tr></thead>
        <tbody>${paramRows(list)}</tbody>
      </table>
    </div>` : '';

  const noParams = params.length === 0;

  // Build a copy-ready example call
  const exampleUrl = buildExampleCall(url, method, routeParams, queryParams);

  const pagingHtml = (method === 'GET')
    ? `<div class="vp-api-detail-section">
         <h4 class="vp-api-detail-section__title">Paging</h4>
         <div class="vp-api-meta" style="margin-top:0;">
           <span class="vp-api-meta__item"><span class="vp-api-meta__label">Default limit</span> ${escHtml(meta.limit != null ? String(meta.limit) : '—')}</span>
           <span class="vp-api-meta__sep" aria-hidden="true">·</span>
           <span class="vp-api-meta__item"><span class="vp-api-meta__label">Default offset</span> ${escHtml(meta.offset != null ? String(meta.offset) : '—')}</span>
           <span class="vp-api-meta__sep" aria-hidden="true">·</span>
           <span class="vp-api-meta__item"><span class="vp-api-meta__label">Client paging</span> ${meta.allow_client_paging ? 'Allowed (?limit &amp; ?offset)' : 'Disabled'}</span>
         </div>
       </div>`
    : '';

  const bodyHtml = `
    <div class="vp-api-detail">
      <div class="vp-api-url" data-url="${escHtml(url)}" style="margin-top:0;">
        <span class="vp-api-url__method vp-api-method--${method.toLowerCase()}">${escHtml(method)}</span>
        <code class="vp-api-url__code">${escHtml(url)}</code>
        <button class="btn btn--ghost btn--sm vp-api-copy" type="button" title="Copy API URL">Copy</button>
      </div>

      <div class="vp-api-detail-badges">
        <span class="vp-api-status ${api.is_active !== false ? 'vp-api-status--active' : 'vp-api-status--inactive'}">${api.is_active !== false ? 'Active' : 'Inactive'}</span>
        <span class="vp-api-detail-badge">${authRequired ? 'Auth required — send <code>x-api-key</code> header' : 'No auth required'}</span>
        <span class="vp-api-detail-badge">Rate limit: ${escHtml(api.rate_limit_per_day != null ? api.rate_limit_per_day + '/day' : '—')}</span>
      </div>

      ${noParams
        ? '<p class="vp-empty__text vp-api-detail-empty">This endpoint takes no dynamic parameters — call the URL as-is.</p>'
        : `${paramTable('Route parameters', routeParams)}
           ${paramTable('Query parameters', queryParams)}
           ${paramTable('Body fields', bodyParams)}`}

      ${pagingHtml}

      <div class="vp-api-detail-section">
        <h4 class="vp-api-detail-section__title">Example request</h4>
        <div class="vp-api-example">
          <code class="vp-api-example__code">${escHtml(exampleUrl)}</code>
          <button class="btn btn--ghost btn--sm vp-api-example-copy" type="button" data-example="${escHtml(exampleUrl)}">Copy</button>
        </div>
        ${bodyParams.length ? `<pre class="vp-api-example__body"><code>${escHtml(buildExampleBody(bodyParams))}</code></pre>` : ''}
      </div>
    </div>
  `;

  const footHtml = `<button class="btn btn--primary btn--sm" id="api-detail-close" type="button">Done</button>`;

  const overlay = document.getElementById('vp-modal-overlay');
  if (overlay) overlay.classList.add('vp-modal--wide');
  showModal(`API — ${method} ${api.name}`, bodyHtml, footHtml);

  document.getElementById('api-detail-close')?.addEventListener('click', closeModal);

  // Copy handlers inside modal
  document.querySelectorAll('#vp-modal-body .vp-api-copy').forEach(btn => {
    btn.addEventListener('click', () => copyApiUrl(btn));
  });
  const exCopy = document.querySelector('#vp-modal-body .vp-api-example-copy');
  if (exCopy) {
    exCopy.addEventListener('click', () => {
      const text = exCopy.getAttribute('data-example') || '';
      navigator.clipboard?.writeText(text).then(() => {
        exCopy.textContent = 'Copied!';
        setTimeout(() => { exCopy.textContent = 'Copy'; }, 1500);
      });
    });
  }
}

/* Build an example call URL: substitutes route params inline and appends query string. */
function buildExampleCall(baseUrl, method, routeParams, queryParams) {
  let url = baseUrl;
  // Route params are appended as extra path segments (best-effort illustration).
  routeParams.forEach(p => {
    const sample = p.fallback !== undefined && p.fallback !== null ? p.fallback : `<${p.name}>`;
    url += `/${encodeURIComponent(String(sample))}`;
  });
  if (queryParams.length) {
    const qs = queryParams.map(p => {
      const sample = p.fallback !== undefined && p.fallback !== null ? p.fallback : `<${p.name}>`;
      return `${encodeURIComponent(p.name)}=${encodeURIComponent(String(sample))}`;
    }).join('&');
    url += `?${qs}`;
  }
  return url;
}

/* Build an example JSON body from body-field params. */
function buildExampleBody(bodyParams) {
  const obj = {};
  bodyParams.forEach(p => {
    obj[p.name] = (p.fallback !== undefined && p.fallback !== null) ? p.fallback : `<${p.name}>`;
  });
  return JSON.stringify(obj, null, 2);
}

function deleteApi(apiId, apiName) {
  confirmModal({
    title: 'Delete API',
    message: `Delete the API "${apiName}"? This permanently removes the endpoint and cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await apiFetch('/project/deleteApi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proj_id: vpState.projectId, api_id: apiId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showToast(data.msg || 'API deleted', 'success');
          vpState.loaded.apis = false;
          loadApis();
        } else {
          showToast(data.msg || 'Failed to delete API', 'error');
        }
      } catch (_) {
        showToast('Network error', 'error');
      }
    },
  });
}

function openAddApiModal() {
  const bodyHtml = `
    <div class="modal-form">
      <p class="vp-empty__text" style="margin:0;">
        New API endpoints are created in the visual API builder, where you select tables,
        columns, filters and the HTTP method for your query. The endpoint will then appear
        in this list with its public call URL.
      </p>
    </div>
  `;
  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="api-cancel" type="button">Close</button>
    <button class="btn btn--primary btn--sm" id="api-open-builder" type="button">Open API Builder</button>
  `;
  showModal('Create API', bodyHtml, footHtml);
  document.getElementById('api-cancel')?.addEventListener('click', closeModal);
  document.getElementById('api-open-builder')?.addEventListener('click', () => {
    closeModal();
    showToast('The API builder is coming soon.', 'error');
  });
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
    <div class="modal-form">
      <div class="field">
        <label class="field__label" for="cors-origin-input">Origin URL</label>
        <input class="modal-input" type="text" id="cors-origin-input" placeholder="https://app.example.com" maxlength="200" autocomplete="off" />
        <span class="field__hint">Must include the scheme (https://). Wildcards are not supported.</span>
      </div>
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
    // 404 means no collaborators yet — treat as empty list rather than an error
    if (res.status === 404) {
      vpState.collaborators = [];
    } else if (!res.ok) {
      body.innerHTML = emptyState('Could not load collaborators');
      return;
    } else {
      const data = await res.json();
      vpState.collaborators = Array.isArray(data.collaborators) ? data.collaborators : [];
    }
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

  let actionHtml = '';
  if (status === 'pending') {
    // Only author can cancel a pending invitation
    if (vpState.isAuthor) {
      actionHtml = `<button class="btn btn--ghost btn--sm vp-collab-remove" type="button"
        data-user-id="${c.user_id}" data-self="false" data-status="pending">Cancel invite</button>`;
    }
  } else {
    if (vpState.isAuthor) {
      // Author can remove any collaborator
      actionHtml = `<button class="btn btn--ghost btn--sm vp-collab-remove" type="button" data-user-id="${c.user_id}" data-self="${isSelf}" data-status="accepted">${isSelf ? 'Leave' : 'Remove'}</button>`;
    } else if (isSelf) {
      // A collaborator can leave the project (remove themselves)
      actionHtml = `<button class="btn btn--ghost btn--sm vp-collab-remove" type="button" data-user-id="${c.user_id}" data-self="true" data-status="accepted" style="color:var(--error);border-color:var(--error);">Leave</button>`;
    }
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
    <div class="modal-form">
      <div class="field">
        <label class="field__label" for="collab-search">Search by username</label>
        <input class="modal-input" type="text" id="collab-search" placeholder="Type a username…" maxlength="50" autocomplete="off" />
        <span class="field__hint">Results update as you type. Invitations must be accepted by the user.</span>
      </div>
      <div id="collab-search-results" class="vp-collab-search-results" aria-live="polite">
        <p class="vp-empty__text">Start typing to search users.</p>
      </div>
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
   Create Table
   ----------------------------------------------------------------------- */

/* Counter used to give each column card a stable local id */
let _ctColCounter = 0;

const CT_TYPES = ['INTEGER', 'TEXT', 'NUMERIC', 'BOOLEAN', 'VARCHAR', 'DATE', 'TIMESTAMP'];
/* Types that require a length field */
const CT_NEEDS_LEN = new Set(['VARCHAR', 'NUMERIC']);
/* Types that support auto-increment (PK or UNIQUE + INTEGER) */
const CT_AUTO_INC_TYPE = 'INTEGER';

function openCreateTableModal() {
  _ctColCounter = 0;

  const overlay = document.getElementById('vp-modal-overlay');
  if (overlay) overlay.classList.add('vp-modal--wide');

  const bodyHtml = `
    <div class="modal-form" id="ct-form">
      <div class="field ct-name-row">
        <label class="field__label" for="ct-table-name">Table name</label>
        <input class="modal-input" type="text" id="ct-table-name" maxlength="30"
          placeholder="e.g. orders" autocomplete="off" />
        <span class="field__hint">Lowercase letters, digits and underscores only. Must start with a letter or underscore.</span>
      </div>
      <div class="ct-form-error" id="ct-form-error"></div>
      <div class="ct-col-list" id="ct-col-list"></div>
      <div class="ct-add-col-row">
        <button class="btn btn--ghost btn--sm" id="ct-add-col" type="button">+ Add Column</button>
      </div>
    </div>
  `;

  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="ct-cancel" type="button">Cancel</button>
    <button class="btn btn--primary btn--sm" id="ct-submit" type="button">Create Table</button>
  `;

  showModal('Create Table', bodyHtml, footHtml);

  /* Add a first column by default */
  ctAddColumn();

  document.getElementById('ct-add-col').addEventListener('click', ctAddColumn);
  document.getElementById('ct-cancel').addEventListener('click', () => {
    if (overlay) overlay.classList.remove('vp-modal--wide');
    closeModal();
  });
  document.getElementById('ct-submit').addEventListener('click', submitCreateTable);

  const tableNameEl = document.getElementById('ct-table-name');
  if (tableNameEl) tableNameEl.focus();
}

function ctAddColumn() {
  const list = document.getElementById('ct-col-list');
  if (!list) return;

  const id = ++_ctColCounter;
  const typeOptions = CT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

  const card = document.createElement('div');
  card.className = 'ct-col-card';
  card.setAttribute('data-col-id', id);
  card.innerHTML = `
    <div class="ct-col-top">
      <div class="field">
        <label class="field__label" for="ct-col-name-${id}">Column name</label>
        <input class="modal-input ct-col-name" type="text" id="ct-col-name-${id}"
          maxlength="30" placeholder="e.g. user_id" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field__label" for="ct-col-type-${id}">Type</label>
        <select class="modal-select ct-col-type" id="ct-col-type-${id}">${typeOptions}</select>
      </div>
      <div class="ct-col-len-wrap ct-hidden">
        <div class="field">
          <label class="field__label" for="ct-col-len-${id}">Length</label>
          <input class="modal-input ct-col-len" type="number" id="ct-col-len-${id}"
            min="1" max="9999" placeholder="255" />
        </div>
      </div>
    </div>
    <div class="ct-col-bottom">
      <label class="ct-check ct-check-pk">
        <input type="checkbox" class="ct-pk" id="ct-pk-${id}" />
        Primary Key
      </label>
      <label class="ct-check ct-check-ai">
        <input type="checkbox" class="ct-ai" id="ct-ai-${id}" />
        Auto Increment
      </label>
      <label class="ct-check ct-check-uq">
        <input type="checkbox" class="ct-uq" id="ct-uq-${id}" />
        Unique
      </label>
      <label class="ct-check ct-check-nl">
        <input type="checkbox" class="ct-nl" id="ct-nl-${id}" />
        Nullable
      </label>
      <div class="field ct-col-default">
        <label class="field__label" for="ct-col-def-${id}">Default</label>
        <input class="modal-input ct-def" type="text" id="ct-col-def-${id}"
          placeholder="(none)" autocomplete="off" />
      </div>
      <button type="button" class="ct-col-delete" title="Remove column" aria-label="Remove column">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>
    <span class="ct-col-error" id="ct-col-err-${id}"></span>
  `;

  list.appendChild(card);

  /* Bind delete */
  card.querySelector('.ct-col-delete').addEventListener('click', () => {
    card.remove();
  });

  /* Bind type change → show/hide length, enforce AI rules */
  const typeEl = card.querySelector('.ct-col-type');
  const lenWrap = card.querySelector('.ct-col-len-wrap');
  const pkEl = card.querySelector('.ct-pk');
  const aiEl = card.querySelector('.ct-ai');
  const uqEl = card.querySelector('.ct-uq');
  const nlEl = card.querySelector('.ct-nl');
  const defEl = card.querySelector('.ct-def');
  const aiCheckWrap = card.querySelector('.ct-check-ai');
  const uqCheckWrap = card.querySelector('.ct-check-uq');
  const nlCheckWrap = card.querySelector('.ct-check-nl');

  function syncTypeControls() {
    const type = typeEl.value;
    /* Length field visibility */
    lenWrap.classList.toggle('ct-hidden', !CT_NEEDS_LEN.has(type));

    /* Auto-increment is only available for INTEGER */
    const aiAllowed = type === CT_AUTO_INC_TYPE && (pkEl.checked || uqEl.checked);
    if (!aiAllowed) {
      aiEl.checked = false;
    }
    aiCheckWrap.classList.toggle('ct-disabled', !aiAllowed);

    /* Default value is not meaningful when auto-increment is on */
    const aiActive = aiEl.checked;
    if (defEl) {
      defEl.disabled = aiActive;
      if (aiActive) defEl.value = '';
      defEl.placeholder = aiActive ? '(auto — no default allowed)' : '(none)';
    }
  }

  function syncPkControls() {
    if (pkEl.checked) {
      /* PK → disable and uncheck unique and nullable */
      uqEl.checked = false;
      nlEl.checked = false;
      uqCheckWrap.classList.add('ct-disabled');
      nlCheckWrap.classList.add('ct-disabled');
    } else {
      uqCheckWrap.classList.remove('ct-disabled');
      nlCheckWrap.classList.remove('ct-disabled');
    }
    syncTypeControls();
  }

  function syncCheckboxControls() {
    /* Re-evaluate AI eligibility when unique changes too */
    syncTypeControls();
  }

  typeEl.addEventListener('change', syncTypeControls);
  pkEl.addEventListener('change', syncPkControls);
  uqEl.addEventListener('change', syncCheckboxControls);
  aiEl.addEventListener('change', syncTypeControls);

  /* Initialise */
  syncTypeControls();
}

async function submitCreateTable() {
  const nameEl = document.getElementById('ct-table-name');
  const errorBanner = document.getElementById('ct-form-error');
  const submitBtn = document.getElementById('ct-submit');

  function showFormError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    errorBanner.classList.add('is-visible');
  }
  function clearFormError() {
    if (!errorBanner) return;
    errorBanner.textContent = '';
    errorBanner.classList.remove('is-visible');
  }
  function showColError(card, msg) {
    card.classList.add('ct-col-card--error');
    const errEl = card.querySelector('.ct-col-error');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('is-visible'); }
  }
  function clearColErrors() {
    document.querySelectorAll('.ct-col-card').forEach(c => {
      c.classList.remove('ct-col-card--error');
      const e = c.querySelector('.ct-col-error');
      if (e) { e.textContent = ''; e.classList.remove('is-visible'); }
    });
  }

  clearFormError();
  clearColErrors();

  const tableName = (nameEl ? nameEl.value : '').trim();
  if (!tableName) {
    showFormError('Please enter a table name.');
    if (nameEl) nameEl.focus();
    return;
  }

  const cards = document.querySelectorAll('#ct-col-list .ct-col-card');
  if (cards.length === 0) {
    showFormError('Add at least one column.');
    return;
  }

  /* Build cols array: [col_name, col_type, default, col_len, is_pk, is_auto_inc, is_nullable, is_unique, element_id] */
  const cols = [];
  let hasError = false;

  cards.forEach((card) => {
    if (hasError) return;
    const colId = card.getAttribute('data-col-id');
    const colName = card.querySelector('.ct-col-name').value.trim();
    const colType = card.querySelector('.ct-col-type').value;
    const colDefRaw = card.querySelector('.ct-def').value.trim();
    const colDef = colDefRaw === '' ? null : colDefRaw;
    const lenEl = card.querySelector('.ct-col-len');
    const colLen = CT_NEEDS_LEN.has(colType) ? (lenEl ? parseInt(lenEl.value, 10) || null : null) : null;
    const isPk = card.querySelector('.ct-pk').checked;
    const isAi = card.querySelector('.ct-ai').checked;
    const isNl = isPk ? false : card.querySelector('.ct-nl').checked;
    const isUq = isPk ? false : card.querySelector('.ct-uq').checked;

    if (!colName) {
      showColError(card, 'Column name is required.');
      hasError = true;
      return;
    }

    if (CT_NEEDS_LEN.has(colType)) {
      if (!colLen || colLen < 1) {
        showColError(card, `${colType} requires a valid length (≥ 1).`);
        hasError = true;
        return;
      }
    }

    if (isAi && colType !== CT_AUTO_INC_TYPE) {
      showColError(card, 'Auto Increment is only available for INTEGER columns.');
      hasError = true;
      return;
    }

    if (isAi && !isPk && !isUq) {
      showColError(card, 'Auto Increment requires the column to be a Primary Key or Unique.');
      hasError = true;
      return;
    }

    cols.push([colName, colType, colDef, colLen, isPk, isAi, isNl, isUq, colId]);
  });

  if (hasError) return;

  /* Send request */
  setLoading(submitBtn, true);
  try {
    const res = await apiFetch('/project/createTable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proj_id: vpState.projectId, name: tableName, cols }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const overlay = document.getElementById('vp-modal-overlay');
      if (overlay) overlay.classList.remove('vp-modal--wide');
      closeModal();
      showToast(data.msg || 'Table created successfully', 'success');
      /* Reload tables list */
      vpState.loaded.tables = false;
      loadTables();
    } else {
      /* If the backend returns an element id, highlight that column */
      if (data.id != null) {
        const errCard = document.querySelector(`#ct-col-list .ct-col-card[data-col-id="${data.id}"]`);
        if (errCard) showColError(errCard, data.msg || 'Invalid column.');
        else showFormError(data.msg || 'Validation error.');
      } else {
        showFormError(data.msg || 'Failed to create table.');
      }
      setLoading(submitBtn, false);
    }
  } catch (_) {
    showFormError('Network error. Is the backend reachable?');
    setLoading(submitBtn, false);
  }
}

/* -----------------------------------------------------------------------
   Global actions / bindings
   ----------------------------------------------------------------------- */

function bindGlobalActions() {
  const createTableBtn = document.getElementById('btn-create-table');
  if (createTableBtn) createTableBtn.addEventListener('click', openCreateTableModal);

  const addFkBtn = document.getElementById('btn-add-fk');
  if (addFkBtn) addFkBtn.addEventListener('click', openAddFkModal);

  const addApiBtn = document.getElementById('btn-add-api');
  if (addApiBtn) addApiBtn.addEventListener('click', openAddApiModal);

  const addCorsBtn = document.getElementById('btn-add-cors');
  if (addCorsBtn) addCorsBtn.addEventListener('click', openAddCorsModal);

  const inviteBtn = document.getElementById('btn-invite-collab');
  if (inviteBtn) inviteBtn.addEventListener('click', inviteCollaborator);

  const leaveBtn = document.getElementById('vp-leave-project');
  if (leaveBtn) leaveBtn.addEventListener('click', () => removeCollaborator(vpState.loggedInUserId, true, 'accepted'));

  const deleteBtn = document.getElementById('btn-delete-project');
  if (deleteBtn) deleteBtn.addEventListener('click', deleteProject);

  const regenBtn = document.getElementById('vp-regen-key');
  if (regenBtn) regenBtn.addEventListener('click', regenerateApiKey);
}

async function regenerateApiKey() {
  if (!vpState.isAuthor) return;
  confirmModal({
    title: 'Regenerate API Key',
    message: 'Generating a new API key will invalidate the current key immediately. Any services using the old key will lose access. Continue?',
    confirmLabel: 'Regenerate',
    danger: true,
    onConfirm: async () => {
      const regenBtn = document.getElementById('vp-regen-key');
      setLoading(regenBtn, true);
      try {
        const res = await apiFetch('/project/regenerateKey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proj_id: vpState.projectId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showModal('New API Key', `
            <p class="vp-confirm-msg" style="margin-bottom:14px;">Your new API key has been generated. Copy it now — it will <strong>not</strong> be shown again.</p>
            <div class="vp-api-key-display">
              <code id="new-api-key-value" class="vp-api-key-code">${escHtml(data.api_key || '')}</code>
              <button class="btn btn--ghost btn--sm" id="copy-new-api-key" type="button">Copy</button>
            </div>
          `, `<button class="btn btn--primary btn--sm" id="close-regen-modal" type="button">Done</button>`);
          document.getElementById('copy-new-api-key')?.addEventListener('click', () => {
            navigator.clipboard?.writeText(data.api_key || '').then(() => {
              const btn = document.getElementById('copy-new-api-key');
              if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1600); }
            });
          });
          document.getElementById('close-regen-modal')?.addEventListener('click', closeModal);
          await loadProjectHeader();
        } else {
          showToast(data.msg || 'Failed to regenerate API key', 'error');
        }
      } catch (_) {
        showToast('Network error', 'error');
      } finally {
        setLoading(regenBtn, false);
      }
    },
  });
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
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('vp-modal--wide');
  }
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
