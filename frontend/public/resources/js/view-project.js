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

const cabState = {
  tables: [],
  colsByTableId: {},
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
    const limitParam = paramFromWhereVal(typeof def.limit === 'object' ? def.limit : null, 'Limit');
    if (limitParam) params.push(limitParam);
    else meta.limit = def.limit;
    const offsetParam = paramFromWhereVal(typeof def.offset === 'object' ? def.offset : null, 'Offset');
    if (offsetParam) params.push(offsetParam);
    else meta.offset = def.offset;
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
  openCreateApiModal();
}

/* -----------------------------------------------------------------------
   Create API — visual query builder
   ----------------------------------------------------------------------- */

const CAB_AGG = ['NONE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
const CAB_JOIN_TYPES = [
  { value: 'inner', label: 'INNER JOIN' },
  { value: 'left', label: 'LEFT JOIN' },
  { value: 'right', label: 'RIGHT JOIN' },
  { value: 'full', label: 'FULL OUTER JOIN' },
];
const CAB_COMPARE_OPS = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN'];
const CAB_HAVING_OPS = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE'];
const CAB_JOIN_OPS = ['=', '!=', '<', '>', '<=', '>='];
const CAB_CONNECTORS = [
  { value: 'and', label: 'AND' },
  { value: 'or', label: 'OR' },
];
const CAB_ALIAS_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const CAB_API_NAME_RE = /^[a-z][a-z0-9_]{0,29}$/;

function cabOptions(arr, selected) {
  return arr.map(v => {
    const value = typeof v === 'object' ? v.value : v;
    const label = typeof v === 'object' ? v.label : v;
    return `<option value="${escHtml(value)}"${value === selected ? ' selected' : ''}>${escHtml(label)}</option>`;
  }).join('');
}

function cabTableOptionsHtml() {
  return cabState.tables.map(t =>
    `<option value="${t.id}">${escHtml(t.table_name)} (#${t.id})</option>`
  ).join('');
}

function cabTableColOptionsHtml(tableId) {
  const table = cabState.tables.find(t => String(t.id) === String(tableId));
  const tName = table ? table.table_name : '';
  const tId = table ? table.id : tableId;
  const cols = cabState.colsByTableId[tableId] || cabState.colsByTableId[String(tableId)] || [];
  return '<option value="">Select column</option>' + cols.map(c =>
    `<option value="${c.id}">${escHtml(tName)}.${escHtml(c.col_name)} (table #${tId}, col #${c.id})</option>`
  ).join('');
}

function cabScopedColOptionsHtml() {
  const scoped = cabGetScopedTables().filter(t => t.alias);
  const opts = ['<option value="">Select column</option>'];
  scoped.forEach(t => {
    const cols = cabState.colsByTableId[t.tableId] || cabState.colsByTableId[String(t.tableId)] || [];
    cols.forEach(c => {
      opts.push(
        `<option value="${escHtml(t.alias)}|${c.id}">${escHtml(t.alias)}.${escHtml(c.col_name)} — ${escHtml(t.tableName)}.${escHtml(c.col_name)} (table #${t.tableId}, col #${c.id})</option>`
      );
    });
  });
  return opts.join('');
}

function cabParseColRef(value) {
  if (!value || !value.includes('|')) return null;
  const idx = value.lastIndexOf('|');
  const table_alias = value.slice(0, idx);
  const col_id = Number(value.slice(idx + 1));
  if (!table_alias || !Number.isInteger(col_id)) return null;
  return { table_alias, col_id };
}

function cabGetScopedTables() {
  const tableEl = document.getElementById('cab-from-table');
  const aliasEl = document.getElementById('cab-from-alias');
  const tableId = tableEl ? tableEl.value : '';
  const alias = aliasEl ? aliasEl.value.trim() : '';
  const table = cabState.tables.find(t => String(t.id) === String(tableId));
  const out = [];
  if (table) {
    out.push({ tableId: Number(table.id), alias, tableName: table.table_name });
  }
  document.querySelectorAll('#cab-joins-list .cab-join-row').forEach(row => {
    const jTableId = row.querySelector('[data-field="table"]')?.value;
    const jAlias = (row.querySelector('[data-field="alias"]')?.value || '').trim();
    const jTable = cabState.tables.find(t => String(t.id) === String(jTableId));
    if (jTable) {
      out.push({ tableId: Number(jTable.id), alias: jAlias, tableName: jTable.table_name });
    }
  });
  return out;
}

function cabRestoreSelect(sel, prev) {
  if (!sel) return;
  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
    return;
  }
  if (prev && prev.includes('|')) {
    const colId = prev.slice(prev.lastIndexOf('|') + 1);
    const match = [...sel.options].find(o => o.value.endsWith('|' + colId));
    if (match) sel.value = match.value;
  }
}

function cabRefreshScopedColSelects() {
  const html = cabScopedColOptionsHtml();
  document.querySelectorAll('#vp-modal-body [data-cab-col="scoped"]').forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = html;
    cabRestoreSelect(sel, prev);
  });
  cabRenderSelectAll();
}

function cabRefreshTargetColSelects() {
  const tableId = document.getElementById('cab-from-table')?.value;
  const html = cabTableColOptionsHtml(tableId);
  document.querySelectorAll('#vp-modal-body [data-cab-col="target"]').forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = html;
    cabRestoreSelect(sel, prev);
  });
}

function cabRefreshAllColSelects() {
  cabRefreshScopedColSelects();
  cabRefreshTargetColSelects();
}

async function cabLoadCatalog() {
  const res = await apiFetch(`/view/allTables/${vpState.projectId}`);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
  if (!res.ok) throw new Error('tables');
  const data = await res.json();
  cabState.tables = Array.isArray(data.tables) ? data.tables : [];
  cabState.colsByTableId = {};
  await Promise.all(cabState.tables.map(async t => {
    const r = await apiFetch(`/view/viewTableStructure/${t.id}`);
    if (!r.ok) { cabState.colsByTableId[t.id] = []; return; }
    const d = await r.json();
    cabState.colsByTableId[t.id] = Array.isArray(d.coloumns) ? d.coloumns : [];
  }));
}

function cabDynHtml(prefix, placeholder, inputType) {
  const typeAttr = inputType ? ` type="${inputType}"` : ' type="text"';
  return `
    <div class="cab-dyn" data-dyn="${prefix}">
      <div class="cab-dyn__row">
        <input class="modal-input"${typeAttr} data-field="${prefix}" placeholder="${escHtml(placeholder)}" autocomplete="off" />
        <button type="button" class="cab-dyn-toggle" data-action="toggle-dyn">dynamic</button>
      </div>
      <div class="cab-dyn-config cab-hidden" data-dyn-config>
        <select class="modal-select" data-field="${prefix}_src">
          <option value="query_param">query param ?x=</option>
          <option value="route_param">route param :x</option>
          <option value="body">body field</option>
        </select>
        <input class="modal-input" type="text" data-field="${prefix}_name" placeholder="param/field name" autocomplete="off" />
        <input class="modal-input"${typeAttr} data-field="${prefix}_default" placeholder="fallback default" autocomplete="off" />
        <label class="cab-check">
          <input type="checkbox" data-field="${prefix}_required" /> required
        </label>
      </div>
    </div>`;
}

function cabWireDyn(root, prefix) {
  const wrap = root.querySelector(`[data-dyn="${prefix}"]`);
  if (!wrap) return;
  const toggle = wrap.querySelector('[data-action="toggle-dyn"]');
  const config = wrap.querySelector('[data-dyn-config]');
  const staticInput = wrap.querySelector(`[data-field="${prefix}"]`);
  toggle.addEventListener('click', () => {
    const on = toggle.classList.toggle('is-on');
    config.classList.toggle('cab-hidden', !on);
    staticInput.classList.toggle('cab-hidden', on);
  });
}

function cabCoerceLiteral(raw) {
  if (raw === '' || raw == null) return '';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

function cabReadDyn(root, prefix) {
  const wrap = root.querySelector(`[data-dyn="${prefix}"]`);
  if (!wrap) return null;
  const isDyn = wrap.querySelector('[data-action="toggle-dyn"]').classList.contains('is-on');
  if (!isDyn) {
    const raw = wrap.querySelector(`[data-field="${prefix}"]`).value.trim();
    return {
      is_dynamic: false,
      fallback_value: raw === '' ? undefined : cabCoerceLiteral(raw),
      dynamic_value_getting_type: null,
      dynamic_field_name: null,
      is_dynamic_required: false,
    };
  }
  const src = wrap.querySelector(`[data-field="${prefix}_src"]`).value;
  const name = wrap.querySelector(`[data-field="${prefix}_name"]`).value.trim();
  const defRaw = wrap.querySelector(`[data-field="${prefix}_default"]`).value.trim();
  const required = wrap.querySelector(`[data-field="${prefix}_required"]`).checked;
  return {
    is_dynamic: true,
    fallback_value: defRaw === '' ? null : cabCoerceLiteral(defRaw),
    dynamic_value_getting_type: src,
    dynamic_field_name: name || null,
    is_dynamic_required: required,
  };
}

function cabValidateDyn(val, label, opts) {
  const allowEmptyStatic = opts && opts.allowEmptyStatic;
  if (!val) return `${label} is missing`;
  if (!val.is_dynamic) {
    if (val.fallback_value === undefined || val.fallback_value === '') {
      if (allowEmptyStatic) return null;
      return `${label}: enter a static value, or mark it dynamic`;
    }
    return null;
  }
  if (!val.dynamic_field_name) return `${label}: param/field name is required when dynamic`;
  if (!val.is_dynamic_required && (val.fallback_value === undefined || val.fallback_value === null || val.fallback_value === '')) {
    return `${label}: fallback default is required when the dynamic field is optional`;
  }
  return null;
}

function cabShowErrors(messages) {
  const box = document.getElementById('cab-errors');
  const list = document.getElementById('cab-errors-list');
  if (!box || !list) return;
  if (!messages || messages.length === 0) {
    box.classList.add('is-hidden');
    list.innerHTML = '';
    return;
  }
  list.innerHTML = messages.map(m => `<li>${escHtml(m)}</li>`).join('');
  box.classList.remove('is-hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cabSetCount(id, n, word) {
  const el = document.getElementById(id);
  if (el) el.textContent = `${n} ${word}${n === 1 ? '' : 's'}`;
}

function cabRenderSelectAll() {
  const host = document.getElementById('cab-select-all-list');
  if (!host) return;
  const prev = new Set(
    [...host.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.getAttribute('data-alias'))
  );
  const scoped = cabGetScopedTables();
  if (scoped.length === 0) {
    host.innerHTML = '<span class="cab-note">Add a FROM table (with alias) to enable select all.</span>';
    return;
  }
  host.innerHTML = scoped.map((t, i) => {
    const alias = t.alias;
    const disabled = !alias;
    const checked = alias && prev.has(alias);
    const label = alias
      ? `${alias}.* — ${t.tableName} (#${t.tableId})`
      : `${t.tableName} (#${t.tableId}) — set alias first`;
    return `<label class="cab-check${disabled ? ' ct-disabled' : ''}">
      <input type="checkbox" data-select-all data-alias="${escHtml(alias)}" data-table-id="${t.tableId}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
      ${escHtml(label)}
    </label>`;
  }).join('');
}

function cabApplyMethodVisibility() {
  const method = document.getElementById('cab-method')?.value || 'GET';
  const isGet = method === 'GET';
  const isPost = method === 'POST';
  const isPut = method === 'PUT';
  const isDelete = method === 'DELETE';
  const isWrite = isPost || isPut;

  document.getElementById('cab-get-sections')?.classList.toggle('cab-hidden', !isGet);
  document.getElementById('cab-get-extras')?.classList.toggle('cab-hidden', !isGet);
  document.getElementById('cab-alias-wrap')?.classList.toggle('cab-hidden', isPost);
  document.getElementById('cab-write-section')?.classList.toggle('cab-hidden', !isWrite);
  document.getElementById('cab-where-section')?.classList.toggle('cab-hidden', !(isGet || isPut || isDelete));
  document.getElementById('cab-where-required')?.classList.toggle('cab-hidden', isGet);
  document.getElementById('cab-returning-section')?.classList.toggle('cab-hidden', !(isWrite || isDelete));

  const tableLabel = document.getElementById('cab-table-label');
  if (tableLabel) {
    tableLabel.textContent = isPost ? 'Insert into table' : (isGet ? 'From table' : 'Target table');
  }
  const writeLabel = document.getElementById('cab-write-label');
  if (writeLabel) writeLabel.textContent = isPost ? 'Columns to insert' : 'Columns to update (SET)';

  const aliasLabel = document.getElementById('cab-alias-label');
  if (aliasLabel) aliasLabel.innerHTML = 'Table alias <span class="cab-star">*</span>';
}

function cabCreateSelectColRow() {
  const list = document.getElementById('cab-select-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'cab-card cab-select-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-select-grid">
      <select class="modal-select" data-field="fn">${cabOptions(CAB_AGG, 'NONE')}</select>
      <select class="modal-select" data-field="col" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <input class="modal-input" type="text" data-field="alias" placeholder="alias (optional)" autocomplete="off" />
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function cabCreateJoinRow() {
  const list = document.getElementById('cab-joins-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'cab-card cab-join-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-join-grid">
      <select class="modal-select" data-field="jointype">${cabOptions(CAB_JOIN_TYPES, 'inner')}</select>
      <select class="modal-select" data-field="table">${cabTableOptionsHtml()}</select>
      <input class="modal-input" type="text" data-field="alias" placeholder="alias *" autocomplete="off" />
      <select class="modal-select" data-field="left" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <select class="modal-select" data-field="op">${cabOptions(CAB_JOIN_OPS, '=')}</select>
      <select class="modal-select" data-field="right" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove join">✕</button>
    </div>`;
  const onChange = () => cabRefreshAllColSelects();
  row.querySelector('[data-field="table"]').addEventListener('change', onChange);
  row.querySelector('[data-field="alias"]').addEventListener('input', onChange);
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabSetCount('cab-join-count', document.getElementById('cab-joins-list').children.length, 'join');
    cabRefreshAllColSelects();
  });
  list.appendChild(row);
  cabSetCount('cab-join-count', list.children.length, 'join');
  cabRefreshAllColSelects();
}

function cabRefreshConnectors(container) {
  if (!container) return;
  const items = [...container.children].filter(c => c.classList.contains('cab-where-item'));
  items.forEach((item, idx) => {
    const conn = item.querySelector(':scope > .cab-conn');
    if (conn) conn.classList.toggle('is-first', idx === 0);
  });
}

function cabUpdateConditionValueUI(item) {
  const op = item.querySelector('[data-field="op"]').value;
  const val1 = item.querySelector('[data-dyn="val1"]');
  const val2 = item.querySelector('[data-dyn="val2"]');
  const andLabel = item.querySelector('.cab-between');
  const hideVal = op === 'IS NULL' || op === 'IS NOT NULL';
  const isBetween = op === 'BETWEEN';
  if (val1) val1.classList.toggle('cab-hidden', hideVal);
  if (val2) val2.classList.toggle('cab-hidden', !isBetween);
  if (andLabel) andLabel.classList.toggle('cab-hidden', !isBetween);
  const v1Input = item.querySelector('[data-field="val1"]');
  if (v1Input) {
    v1Input.placeholder = (op === 'IN' || op === 'NOT IN') ? 'val1, val2, val3' : 'value';
  }
}

function cabCreateConditionItem(container) {
  const item = document.createElement('div');
  item.className = 'cab-where-item';
  item.dataset.kind = 'condition';
  item.innerHTML = `
    <div class="cab-conn">
      <select class="modal-select" data-field="conn">${cabOptions(CAB_CONNECTORS, 'and')}</select>
    </div>
    <div class="cab-card cab-cond">
      <select class="modal-select" data-field="col" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <select class="modal-select" data-field="op">${cabOptions(CAB_COMPARE_OPS, '=')}</select>
      ${cabDynHtml('val1', 'value')}
      <span class="cab-between cab-hidden">AND</span>
      ${cabDynHtml('val2', 'to')}
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove condition">✕</button>
    </div>`;
  cabWireDyn(item, 'val1');
  cabWireDyn(item, 'val2');
  item.querySelector('[data-field="op"]').addEventListener('change', () => cabUpdateConditionValueUI(item));
  item.querySelector('[data-action="remove"]').addEventListener('click', () => {
    const parent = item.parentElement;
    item.remove();
    cabRefreshConnectors(parent);
  });
  container.appendChild(item);
  cabUpdateConditionValueUI(item);
  cabRefreshConnectors(container);
}

function cabCreateGroupItem(container) {
  const item = document.createElement('div');
  item.className = 'cab-where-item';
  item.dataset.kind = 'group';
  item.innerHTML = `
    <div class="cab-conn">
      <select class="modal-select" data-field="conn">${cabOptions(CAB_CONNECTORS, 'and')}</select>
    </div>
    <div class="cab-group">
      <div class="cab-group__head">
        <span class="cab-group__label">Group ( … )</span>
        <button type="button" class="cab-icon-btn" data-action="remove-group" title="Remove group">✕</button>
      </div>
      <div class="cab-list cab-where-children"></div>
      <div class="cab-add-row">
        <button type="button" class="cab-mini" data-action="add-cond">+ condition</button>
        <button type="button" class="cab-mini" data-action="add-group">+ nested group</button>
      </div>
    </div>`;
  const children = item.querySelector('.cab-where-children');
  item.querySelector('[data-action="add-cond"]').addEventListener('click', () => cabCreateConditionItem(children));
  item.querySelector('[data-action="add-group"]').addEventListener('click', () => cabCreateGroupItem(children));
  item.querySelector('[data-action="remove-group"]').addEventListener('click', () => {
    const parent = item.parentElement;
    item.remove();
    cabRefreshConnectors(parent);
  });
  container.appendChild(item);
  cabRefreshConnectors(container);
  cabCreateConditionItem(children);
}

function cabCreateGroupByRow() {
  const list = document.getElementById('cab-groupby-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'cab-card cab-groupby-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-group-grid">
      <select class="modal-select" data-field="col" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabSetCount('cab-groupby-count', list.children.length, 'column');
  });
  list.appendChild(row);
  cabSetCount('cab-groupby-count', list.children.length, 'column');
}

function cabCreateHavingRow() {
  const list = document.getElementById('cab-having-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'cab-where-item cab-having-row';
  row.innerHTML = `
    <div class="cab-conn">
      <select class="modal-select" data-field="conn">${cabOptions(CAB_CONNECTORS, 'and')}</select>
    </div>
    <div class="cab-card cab-cond">
      <select class="modal-select" data-field="fn">${cabOptions(CAB_AGG.filter(f => f !== 'NONE'), 'COUNT')}</select>
      <select class="modal-select" data-field="col" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <select class="modal-select" data-field="op">${cabOptions(CAB_HAVING_OPS, '>')}</select>
      ${cabDynHtml('val', 'value')}
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  cabWireDyn(row, 'val');
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabRefreshConnectors(list);
  });
  list.appendChild(row);
  cabRefreshConnectors(list);
}

function cabCreateOrderByRow() {
  const list = document.getElementById('cab-orderby-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'cab-card cab-orderby-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-order-grid">
      <select class="modal-select" data-field="col" data-cab-col="scoped">${cabScopedColOptionsHtml()}</select>
      <select class="modal-select" data-field="dir">
        <option value="asc">ASC</option>
        <option value="desc">DESC</option>
      </select>
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabSetCount('cab-orderby-count', list.children.length, 'column');
  });
  list.appendChild(row);
  cabSetCount('cab-orderby-count', list.children.length, 'column');
}

function cabCreateWriteColRow() {
  const list = document.getElementById('cab-write-list');
  if (!list) return;
  const tableId = document.getElementById('cab-from-table')?.value;
  const row = document.createElement('div');
  row.className = 'cab-card cab-write-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-write-grid">
      <select class="modal-select" data-field="col" data-cab-col="target">${cabTableColOptionsHtml(tableId)}</select>
      <select class="modal-select" data-field="src">
        <option value="body_field">body field</option>
        <option value="query_param">query param</option>
        <option value="route_param">route param</option>
        <option value="static_value">static value</option>
      </select>
      <input class="modal-input" type="text" data-field="name" placeholder="field name" autocomplete="off" />
      <input class="modal-input" type="text" data-field="default" placeholder="default (optional)" autocomplete="off" />
      <label class="cab-check cab-req-wrap" title="Required">
        <input type="checkbox" data-field="required" checked />
      </label>
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  const srcSelect = row.querySelector('[data-field="src"]');
  const nameInput = row.querySelector('[data-field="name"]');
  const defaultInput = row.querySelector('[data-field="default"]');
  const requiredCb = row.querySelector('[data-field="required"]');
  function syncMode() {
    const isStatic = srcSelect.value === 'static_value';
    nameInput.placeholder = isStatic ? 'literal value' : 'field/param name';
    defaultInput.classList.toggle('cab-hidden', isStatic);
    requiredCb.parentElement.classList.toggle('cab-hidden', isStatic);
    if (isStatic) requiredCb.checked = false;
  }
  srcSelect.addEventListener('change', syncMode);
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabSetCount('cab-write-count', list.children.length, 'column');
  });
  list.appendChild(row);
  syncMode();
  cabSetCount('cab-write-count', list.children.length, 'column');
}

function cabCreateReturningRow() {
  const list = document.getElementById('cab-returning-list');
  if (!list) return;
  const tableId = document.getElementById('cab-from-table')?.value;
  const row = document.createElement('div');
  row.className = 'cab-card cab-returning-row';
  row.innerHTML = `
    <div class="cab-card-grid cab-return-grid">
      <select class="modal-select" data-field="col" data-cab-col="target">${cabTableColOptionsHtml(tableId)}</select>
      <button type="button" class="cab-icon-btn" data-action="remove" title="Remove">✕</button>
    </div>`;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    cabSetCount('cab-returning-count', list.children.length, 'column');
  });
  list.appendChild(row);
  cabSetCount('cab-returning-count', list.children.length, 'column');
}

function cabReadWhere(container, errors, path) {
  const items = [...container.children].filter(c => c.classList.contains('cab-where-item'));
  return items.map((item, i) => {
    const logical_operator = item.querySelector(':scope > .cab-conn [data-field="conn"]')?.value || 'and';
    if (item.dataset.kind === 'group') {
      const childrenEl = item.querySelector('.cab-where-children');
      const children = cabReadWhere(childrenEl, errors, `${path}[${i}].children`);
      if (!children.length) errors.push(`${path}[${i}]: group must have at least one condition`);
      return { node_type: 'group', logical_operator, children };
    }
    const ref = cabParseColRef(item.querySelector('[data-field="col"]').value);
    if (!ref) errors.push(`${path}[${i}]: select a column`);
    const operator = item.querySelector('[data-field="op"]').value;
    const node = {
      node_type: 'condition',
      logical_operator,
      table_alias: ref ? ref.table_alias : null,
      col_id: ref ? ref.col_id : null,
      operator,
    };
    if (operator !== 'IS NULL' && operator !== 'IS NOT NULL') {
      node.val1 = cabReadDyn(item, 'val1');
      const err = cabValidateDyn(node.val1, `${path}[${i}].val1`);
      if (err) errors.push(err);
    }
    if (operator === 'BETWEEN') {
      node.val2 = cabReadDyn(item, 'val2');
      const err = cabValidateDyn(node.val2, `${path}[${i}].val2`);
      if (err) errors.push(err);
    }
    return node;
  });
}

function cabReadPaging(prefix, label, errors) {
  const wrap = document.querySelector(`#cab-form [data-dyn="${prefix}"]`);
  if (!wrap) return null;
  const isDyn = wrap.querySelector('[data-action="toggle-dyn"]').classList.contains('is-on');
  if (!isDyn) {
    const raw = wrap.querySelector(`[data-field="${prefix}"]`).value.trim();
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${label} must be a non-negative integer`);
      return null;
    }
    if (prefix === 'limit' && n > 1000) {
      errors.push('limit must be no greater than 1000');
      return null;
    }
    return n;
  }
  const val = cabReadDyn(wrap, prefix);
  const err = cabValidateDyn(val, label);
  if (err) errors.push(err);
  if (val && val.fallback_value !== null && val.fallback_value !== undefined && val.fallback_value !== '') {
    const n = Number(val.fallback_value);
    if (!Number.isInteger(n) || n < 0) errors.push(`${label} fallback default must be a non-negative integer`);
    if (prefix === 'limit' && Number.isInteger(n) && n > 1000) errors.push('limit fallback default must be no greater than 1000');
  }
  return val;
}

function cabCollectAliases(errors) {
  const method = document.getElementById('cab-method').value;
  const tableId = Number(document.getElementById('cab-from-table').value);
  const alias = (document.getElementById('cab-from-alias')?.value || '').trim();
  if (method !== 'POST') {
    if (!alias) errors.push('Table alias is required');
    else if (!CAB_ALIAS_RE.test(alias)) errors.push('Table alias must start with a letter or underscore and use only letters, digits, or underscores');
  }
  const seen = new Map();
  if (alias) seen.set(alias, tableId);
  if (method === 'GET') {
    document.querySelectorAll('#cab-joins-list .cab-join-row').forEach((row, i) => {
      const jAlias = (row.querySelector('[data-field="alias"]').value || '').trim();
      const jTableId = Number(row.querySelector('[data-field="table"]').value);
      if (!jAlias) errors.push(`Join ${i + 1}: table alias is required`);
      else if (!CAB_ALIAS_RE.test(jAlias)) errors.push(`Join ${i + 1}: invalid table alias`);
      else if (seen.has(jAlias) && seen.get(jAlias) !== jTableId) errors.push(`Duplicate table alias "${jAlias}" used for different tables`);
      else seen.set(jAlias, jTableId);
    });
  }
  return { tableId, alias };
}

function cabBuildPayload(errors) {
  const method = document.getElementById('cab-method').value;
  const { tableId, alias } = cabCollectAliases(errors);
  if (!tableId) errors.push('Select a table');

  if (method === 'GET') {
    const cols_obj_array = [];
    document.querySelectorAll('#cab-select-all-list input[data-select-all]:checked').forEach(cb => {
      const a = cb.getAttribute('data-alias');
      if (a) cols_obj_array.push({ is_select_all: true, table_alias: a, alias: null, function: null, col_id: null });
    });
    document.querySelectorAll('#cab-select-list .cab-select-row').forEach((row, i) => {
      const ref = cabParseColRef(row.querySelector('[data-field="col"]').value);
      if (!ref) { errors.push(`Select column ${i + 1}: choose a column`); return; }
      const fn = row.querySelector('[data-field="fn"]').value;
      const colAlias = (row.querySelector('[data-field="alias"]').value || '').trim();
      if (colAlias && !CAB_ALIAS_RE.test(colAlias)) errors.push(`Select column ${i + 1}: invalid output alias`);
      cols_obj_array.push({
        is_select_all: false,
        table_alias: ref.table_alias,
        alias: colAlias || null,
        function: fn === 'NONE' ? null : fn,
        col_id: ref.col_id,
      });
    });
    if (!cols_obj_array.length) errors.push('Select at least one column, or enable select all for a table');

    const join_obj_array = [...document.querySelectorAll('#cab-joins-list .cab-join-row')].map((row, i) => {
      const type = row.querySelector('[data-field="jointype"]').value;
      const jTableId = Number(row.querySelector('[data-field="table"]').value);
      const jAlias = (row.querySelector('[data-field="alias"]').value || '').trim();
      const left = cabParseColRef(row.querySelector('[data-field="left"]').value);
      const right = cabParseColRef(row.querySelector('[data-field="right"]').value);
      const join_operator = row.querySelector('[data-field="op"]').value;
      if (!left || !right) errors.push(`Join ${i + 1}: select both join columns`);
      return {
        type,
        table_id: jTableId,
        alias: jAlias,
        join_operator,
        left: left || { table_alias: null, col_id: null },
        right: right || { table_alias: null, col_id: null },
      };
    });

    const whereRoot = document.getElementById('cab-where-root');
    const where = cabReadWhere(whereRoot, errors, 'where');

    const group_by_cols_array = [...document.querySelectorAll('#cab-groupby-list .cab-groupby-row')].map((row, i) => {
      const ref = cabParseColRef(row.querySelector('[data-field="col"]').value);
      if (!ref) errors.push(`Group by ${i + 1}: select a column`);
      return ref || { table_alias: null, col_id: null };
    });

    const having = [...document.querySelectorAll('#cab-having-list .cab-having-row')].map((row, i) => {
      const ref = cabParseColRef(row.querySelector('[data-field="col"]').value);
      if (!ref) errors.push(`Having ${i + 1}: select a column`);
      const dyn = cabReadDyn(row, 'val');
      const err = cabValidateDyn(dyn, `Having ${i + 1}`);
      if (err) errors.push(err);
      return {
        logical_operator: row.querySelector('[data-field="conn"]').value,
        function_name: row.querySelector('[data-field="fn"]').value,
        table_alias: ref ? ref.table_alias : null,
        col_id: ref ? ref.col_id : null,
        having_operator: row.querySelector('[data-field="op"]').value,
        is_dynamic: dyn ? dyn.is_dynamic : false,
        fallback_value: dyn ? dyn.fallback_value : undefined,
        dynamic_value_getting_type: dyn ? dyn.dynamic_value_getting_type : null,
        dynamic_field_name: dyn ? dyn.dynamic_field_name : null,
        is_dynamic_required: dyn ? dyn.is_dynamic_required : false,
      };
    });

    const order_by_array = [...document.querySelectorAll('#cab-orderby-list .cab-orderby-row')].map((row, i) => {
      const ref = cabParseColRef(row.querySelector('[data-field="col"]').value);
      if (!ref) errors.push(`Order by ${i + 1}: select a column`);
      return {
        table_alias: ref ? ref.table_alias : null,
        col_id: ref ? ref.col_id : null,
        order: row.querySelector('[data-field="dir"]').value,
      };
    });

    const payload = {
      select_obj: { table_id: tableId, table_alias: alias, cols_obj_array },
      join_obj_array,
      where,
      group_by_cols_array,
      having,
      order_by_array,
    };
    const limit = cabReadPaging('limit', 'limit', errors);
    const offset = cabReadPaging('offset', 'offset', errors);
    if (limit != null) payload.limit = limit;
    if (offset != null) payload.offset = offset;
    return payload;
  }

  if (method === 'POST') {
    const rows = [...document.querySelectorAll('#cab-write-list .cab-write-row')];
    if (!rows.length) errors.push('Add at least one column to insert');
    const column_id_array = [];
    const value_obj_array = [];
    rows.forEach((row, i) => {
      const colId = Number(row.querySelector('[data-field="col"]').value);
      if (!colId) { errors.push(`Insert column ${i + 1}: select a column`); return; }
      const source = row.querySelector('[data-field="src"]').value;
      const name = row.querySelector('[data-field="name"]').value.trim();
      const defRaw = row.querySelector('[data-field="default"]').value.trim();
      const isStatic = source === 'static_value';
      if (isStatic && !name) errors.push(`Insert column ${i + 1}: enter a static value`);
      if (!isStatic && !name) errors.push(`Insert column ${i + 1}: field/param name is required`);
      column_id_array.push(colId);
      value_obj_array.push({
        col_id: colId,
        is_dynamic: !isStatic,
        source,
        dynamic_field_name: isStatic ? null : name,
        default_value: isStatic ? cabCoerceLiteral(name) : (defRaw === '' ? null : cabCoerceLiteral(defRaw)),
      });
    });
    const returning_cols_id = [...document.querySelectorAll('#cab-returning-list .cab-returning-row')]
      .map((row, i) => {
        const colId = Number(row.querySelector('[data-field="col"]').value);
        if (!colId) errors.push(`Returning column ${i + 1}: select a column`);
        return colId;
      })
      .filter(Boolean);
    return { table_id: tableId, column_id_array, value_obj_array, returning_cols_id };
  }

  const value_obj_array = method === 'PUT'
    ? [...document.querySelectorAll('#cab-write-list .cab-write-row')].map((row, i) => {
        const colId = Number(row.querySelector('[data-field="col"]').value);
        if (!colId) { errors.push(`Update column ${i + 1}: select a column`); return null; }
        const source = row.querySelector('[data-field="src"]').value;
        const name = row.querySelector('[data-field="name"]').value.trim();
        const defRaw = row.querySelector('[data-field="default"]').value.trim();
        const isStatic = source === 'static_value';
        if (isStatic && !name) errors.push(`Update column ${i + 1}: enter a static value`);
        if (!isStatic && !name) errors.push(`Update column ${i + 1}: field/param name is required`);
        return {
          col_id: colId,
          is_dynamic: !isStatic,
          source,
          dynamic_field_name: isStatic ? null : name,
          default_value: isStatic ? cabCoerceLiteral(name) : (defRaw === '' ? null : cabCoerceLiteral(defRaw)),
        };
      }).filter(Boolean)
    : undefined;
  if (method === 'PUT' && (!value_obj_array || !value_obj_array.length)) {
    errors.push('Add at least one column to update');
  }

  const whereRoot = document.getElementById('cab-where-root');
  const where = cabReadWhere(whereRoot, errors, 'where');
  if (!where.length) errors.push(`${method} requires at least one WHERE condition`);

  const returning_cols_id = [...document.querySelectorAll('#cab-returning-list .cab-returning-row')]
    .map((row, i) => {
      const colId = Number(row.querySelector('[data-field="col"]').value);
      if (!colId) errors.push(`Returning column ${i + 1}: select a column`);
      return colId;
    })
    .filter(Boolean);

  const payload = { table_id: tableId, table_alias: alias, where, returning_cols_id };
  if (method === 'PUT') payload.value_obj_array = value_obj_array;
  return payload;
}

async function openCreateApiModal() {
  const overlay = document.getElementById('vp-modal-overlay');
  if (overlay) overlay.classList.add('vp-modal--xl');
  showModal('Create API', '<p class="vp-empty__text">Loading tables…</p>', '');

  try {
    await cabLoadCatalog();
  } catch (_) {
    setModalBody('<p class="vp-empty__text">Could not load tables. Is the backend reachable?</p>');
    setModalFoot('<button class="btn btn--ghost btn--sm" id="cab-cancel" type="button">Close</button>');
    document.getElementById('cab-cancel')?.addEventListener('click', closeModal);
    return;
  }

  if (!cabState.tables.length) {
    setModalBody('<p class="vp-empty__text">Create at least one table before adding an API.</p>');
    setModalFoot('<button class="btn btn--ghost btn--sm" id="cab-cancel" type="button">Close</button>');
    document.getElementById('cab-cancel')?.addEventListener('click', closeModal);
    return;
  }

  const tableOptions = cabTableOptionsHtml();
  const bodyHtml = `
    <form class="cab-form" id="cab-form" autocomplete="off">
      <div class="cab-errors is-hidden" id="cab-errors">
        <div class="cab-errors__title">Could not create API</div>
        <ul id="cab-errors-list"></ul>
      </div>

      <section class="cab-section cab-meta">
        <div class="cab-row cab-row--3">
          <div class="field">
            <label class="field__label" for="cab-api-name">API name <span class="cab-star">*</span></label>
            <input class="modal-input" type="text" id="cab-api-name" maxlength="30" placeholder="e.g. get_users" />
            <span class="field__hint">Lowercase a–z, digits, underscore. Must start with a letter. Max 30.</span>
          </div>
          <div class="field">
            <label class="field__label" for="cab-method">Method</label>
            <select class="modal-select" id="cab-method">
              <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
            </select>
          </div>
          <div class="field" id="cab-table-wrap">
            <label class="field__label" for="cab-from-table" id="cab-table-label">From table</label>
            <select class="modal-select" id="cab-from-table">${tableOptions}</select>
          </div>
        </div>
        <div class="cab-row cab-row--2" style="margin-top:12px;">
          <div class="field" id="cab-alias-wrap">
            <label class="field__label" for="cab-from-alias" id="cab-alias-label">Table alias <span class="cab-star">*</span></label>
            <input class="modal-input" type="text" id="cab-from-alias" maxlength="63" placeholder="e.g. u1" />
            <span class="field__hint">Required. Letters, digits, underscore. Must start with a letter or underscore.</span>
          </div>
        </div>
      </section>

      <div id="cab-get-sections">
        <section class="cab-section">
          <div class="cab-section-head">
            <span class="cab-label">Select columns</span>
          </div>
          <p class="cab-hint">Select all (*) is per table — every FROM / JOIN table with an alias can be included.</p>
          <div class="cab-select-all-list" id="cab-select-all-list"></div>
          <div class="cab-col-head cab-select-grid">
            <div>Function</div><div>Column</div><div>Alias (AS)</div><div></div>
          </div>
          <div class="cab-list" id="cab-select-list"></div>
          <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-select">+ Add column</button>
        </section>

        <section class="cab-section">
          <div class="cab-section-head">
            <span class="cab-label">Joins</span>
            <span class="cab-count" id="cab-join-count">0 joins</span>
          </div>
          <div class="cab-list" id="cab-joins-list"></div>
          <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-join">+ Add join</button>
        </section>
      </div>

      <section class="cab-section cab-hidden" id="cab-write-section">
        <div class="cab-section-head">
          <span class="cab-label" id="cab-write-label">Columns to insert</span>
          <span class="cab-count" id="cab-write-count">0 columns</span>
        </div>
        <div class="cab-col-head cab-write-grid">
          <div>Column</div><div>Source</div><div>Field / value</div><div>Default</div><div>Req</div><div></div>
        </div>
        <div class="cab-list" id="cab-write-list"></div>
        <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-write">+ Add column</button>
      </section>

      <section class="cab-section" id="cab-where-section">
        <div class="cab-section-head">
          <span class="cab-label">Where (filters)</span>
          <span class="cab-note cab-note--warn cab-hidden" id="cab-where-required">Required for this method — prevents accidental full-table writes</span>
        </div>
        <div class="cab-list" id="cab-where-root"></div>
        <div class="cab-add-row">
          <button type="button" class="btn btn--ghost btn--sm" id="cab-add-where-cond">+ Add condition</button>
          <button type="button" class="btn btn--ghost btn--sm" id="cab-add-where-group">+ Add group ( … )</button>
        </div>
      </section>

      <div id="cab-get-extras">
        <section class="cab-section">
          <div class="cab-section-head">
            <span class="cab-label">Group by</span>
            <span class="cab-count" id="cab-groupby-count">0 columns</span>
          </div>
          <div class="cab-list" id="cab-groupby-list"></div>
          <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-groupby">+ Add group by column</button>
        </section>

        <section class="cab-section">
          <div class="cab-section-head">
            <span class="cab-label">Having (post-aggregate filters)</span>
            <span class="cab-note">Applies after GROUP BY</span>
          </div>
          <div class="cab-list" id="cab-having-list"></div>
          <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-having">+ Add having condition</button>
        </section>

        <section class="cab-section">
          <div class="cab-section-head">
            <span class="cab-label">Order by</span>
            <span class="cab-count" id="cab-orderby-count">0 columns</span>
          </div>
          <div class="cab-list" id="cab-orderby-list"></div>
          <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-orderby">+ Add order by column</button>
        </section>

        <section class="cab-section cab-meta">
          <div class="cab-row cab-row--paging">
            <div class="field">
              <label class="field__label">Limit</label>
              ${cabDynHtml('limit', 'e.g. 50', 'number')}
            </div>
            <div class="field">
              <label class="field__label">Offset</label>
              ${cabDynHtml('offset', 'e.g. 0', 'number')}
            </div>
          </div>
          <p class="cab-hint">Leave empty to omit. Mark dynamic to let consumers override via query / route / body — same pattern as WHERE.</p>
        </section>
      </div>

      <section class="cab-section cab-hidden" id="cab-returning-section">
        <div class="cab-section-head">
          <span class="cab-label">Returning (optional)</span>
          <span class="cab-count" id="cab-returning-count">0 columns</span>
        </div>
        <p class="cab-hint">Columns to send back after the write. Leave empty to return nothing.</p>
        <div class="cab-list" id="cab-returning-list"></div>
        <button type="button" class="btn btn--ghost btn--sm cab-add" id="cab-add-returning">+ Add returning column</button>
      </section>
    </form>
  `;

  const footHtml = `
    <button class="btn btn--ghost btn--sm" id="cab-cancel" type="button">Cancel</button>
    <button class="btn btn--primary btn--sm" id="cab-submit" type="button">Create API</button>
  `;

  setModalBody(bodyHtml);
  setModalFoot(footHtml);

  document.getElementById('cab-method').addEventListener('change', cabApplyMethodVisibility);
  document.getElementById('cab-from-table').addEventListener('change', cabRefreshAllColSelects);
  document.getElementById('cab-from-alias').addEventListener('input', cabRefreshAllColSelects);
  document.getElementById('cab-add-select').addEventListener('click', cabCreateSelectColRow);
  document.getElementById('cab-add-join').addEventListener('click', cabCreateJoinRow);
  document.getElementById('cab-add-write').addEventListener('click', cabCreateWriteColRow);
  document.getElementById('cab-add-where-cond').addEventListener('click', () => cabCreateConditionItem(document.getElementById('cab-where-root')));
  document.getElementById('cab-add-where-group').addEventListener('click', () => cabCreateGroupItem(document.getElementById('cab-where-root')));
  document.getElementById('cab-add-groupby').addEventListener('click', cabCreateGroupByRow);
  document.getElementById('cab-add-having').addEventListener('click', cabCreateHavingRow);
  document.getElementById('cab-add-orderby').addEventListener('click', cabCreateOrderByRow);
  document.getElementById('cab-add-returning').addEventListener('click', cabCreateReturningRow);
  document.getElementById('cab-cancel').addEventListener('click', closeModal);
  document.getElementById('cab-submit').addEventListener('click', submitCreateApi);

  cabWireDyn(document.getElementById('cab-form'), 'limit');
  cabWireDyn(document.getElementById('cab-form'), 'offset');

  cabApplyMethodVisibility();
  cabRefreshAllColSelects();
  document.getElementById('cab-api-name')?.focus();
}

async function submitCreateApi() {
  const submitBtn = document.getElementById('cab-submit');
  const apiName = (document.getElementById('cab-api-name')?.value || '').trim();
  const method = document.getElementById('cab-method')?.value;
  const errors = [];

  if (!apiName) errors.push('API name is required');
  else if (!CAB_API_NAME_RE.test(apiName)) errors.push('API name must start with a–z and use only lowercase letters, digits, or underscores (max 30)');

  const payload = cabBuildPayload(errors);
  if (errors.length) {
    cabShowErrors(errors);
    return;
  }

  setLoading(submitBtn, true);
  cabShowErrors([]);
  try {
    const qs = new URLSearchParams({
      projectId: String(vpState.projectId),
      api_name: apiName,
      method,
    });
    const res = await apiFetch(`/new/api/create?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid !== false) {
      closeModal();
      showToast(data.msg || 'API definition added successfully', 'success');
      vpState.loaded.apis = false;
      loadApis();
      return;
    }
    const backendErrors = Array.isArray(data.errors) && data.errors.length
      ? data.errors
      : [data.msg || data.error || 'Failed to create API'];
    cabShowErrors(backendErrors);
    setLoading(submitBtn, false);
  } catch (_) {
    cabShowErrors(['Network error. Is the backend reachable?']);
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
  wrap.innerHTML = vpState.settingsTags.map((t) => `
    <span class="tag">${escHtml(t)}${vpState.isAuthor ? ` <button type="button" class="tag__remove" data-tag-name="${escHtml(t)}" aria-label="Remove tag">&times;</button>` : ''}</span>
  `).join('');
  wrap.querySelectorAll('.tag__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-tag-name');
      const idx = vpState.settingsTags.indexOf(name);
      if (idx !== -1) {
        vpState.settingsTags.splice(idx, 1);
        renderSettingsTags();
      }
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
    overlay.classList.remove('vp-modal--xl');
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
