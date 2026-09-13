(function () {
  var U = window.ApiForgeUtils || {};
  var esc = U.escapeHtml || function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var avatar = U.createAvatar || function (opts) {
    var n = (opts && (opts.name || opts.username) || '?').charAt(0).toUpperCase();
    return '<span class="liked-card__avatar" aria-hidden="true">' + esc(n) + '</span>';
  };

  var NETWORK_ERROR = 'A network error occurred. Please try again.';

  var state = {
    templateId: null,
    data: null,
    user: null,
    settingsTags: [],
    settingsBound: false
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    state.templateId = extractTemplateId();
    if (!state.templateId) {
      window.location.href = '/templates';
      return;
    }
    initTabs();
    initModal();
    bindSettings();
    await loadCurrentUser();
    await loadTemplate();
  }

  function extractTemplateId() {
    var match = window.location.pathname.match(/\/my-template\/([^/]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  }

  async function loadCurrentUser() {
    try {
      var res = await apiFetch('/auth/me');
      if (!res.ok) return;
      var data = await res.json();
      state.user = data && data.user ? data.user : null;
    } catch (_) { /* non-fatal */ }
  }

  async function loadTemplate() {
    try {
      var res = await apiFetch('/view/templateDetails/' + encodeURIComponent(state.templateId));
      if (res.status === 401) { window.location.href = '/login'; return; }
      var payload = await readJson(res);
      if (res.status === 404) {
        renderLoadError(routeMsg(payload, 'Template not found'));
        return;
      }
      if (!res.ok) {
        renderLoadError(routeMsg(payload, 'Failed to load template'));
        return;
      }
      var data = normalizeTemplate(payload && payload.data);
      if (!data) {
        renderLoadError('Template not found');
        return;
      }
      if (state.user && String(data.author_id) !== String(state.user.id)) {
        window.location.href = '/template/' + encodeURIComponent(data.id);
        return;
      }
      state.data = data;
      state.templateId = data.id != null ? data.id : state.templateId;
      renderPage(data);
    } catch (_) {
      renderLoadError('Network error. Is the backend reachable?');
    }
  }

  function normalizeTemplate(raw) {
    if (!raw) return null;
    var data = Object.assign({}, raw);
    data.template_tags = asArray(data.template_tags);
    data.template_reviews = asArray(data.template_reviews);
    data.tables = asArray(data.tables);
    data.apis = asArray(data.apis);
    data.total_likes = Number(data.total_likes) || 0;
    data.total_cloned = Number(data.total_cloned) || 0;
    data.total_tables = Number(data.total_tables) || 0;
    data.total_apis = Number(data.total_apis) || 0;
    data.avg_ratings = Number(data.avg_ratings) || 0;
    return data;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        var parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) { return []; }
    }
    return [];
  }

  function renderPage(data) {
    renderHero(data);
    renderStats(data);
    renderTables(data.tables || []);
    renderApis(data.apis || []);
    renderReviews(data.template_reviews || []);
    fillSettingsForm(data);
  }

  function renderLoadError(msg) {
    var title = document.getElementById('vot-template-name');
    var desc = document.getElementById('vot-template-desc');
    var author = document.getElementById('vot-author');
    var tags = document.getElementById('vot-tags');
    var stats = document.getElementById('vot-stats');
    if (title) title.textContent = msg;
    if (desc) desc.textContent = '';
    if (author) author.innerHTML = '';
    if (tags) tags.innerHTML = '';
    if (stats) stats.innerHTML = '';
    var tables = document.getElementById('vot-tables-body');
    if (tables) tables.innerHTML = emptyState(msg);
  }

  function renderHero(data) {
    var title = document.getElementById('vot-template-name');
    var desc = document.getElementById('vot-template-desc');
    var author = document.getElementById('vot-author');
    var tags = document.getElementById('vot-tags');
    var crumb = document.getElementById('vot-crumb-name');

    if (title) title.textContent = data.template_name || 'Untitled template';
    if (desc) desc.textContent = data.description || '';
    if (crumb) crumb.textContent = data.template_name || 'My template';
    document.title = (data.template_name || 'My Template') + ' — ApiForge';

    if (author) {
      author.innerHTML =
        avatar({ name: data.author_name, username: data.username, size: 40, className: 'vt-hero__avatar' }) +
        '<div class="vt-hero__author-meta">' +
          '<span class="vt-hero__author-name">' + esc(data.author_name || 'Unknown') + '</span>' +
          '<span class="vt-hero__author-handle">@' + esc(data.username || '') + '</span>' +
        '</div>' +
        '<span class="vt-hero__created">Created ' + esc(formatDate(data.created_at)) + '</span>';
    }

    if (tags) {
      var list = Array.isArray(data.template_tags) ? data.template_tags : [];
      tags.innerHTML = list.map(function (t) {
        return '<span class="tag liked-tag">' + esc(t.name) + '</span>';
      }).join('');
    }
  }

  function renderStats(data) {
    var el = document.getElementById('vot-stats');
    if (!el) return;
    var items = [
      { label: 'Likes', value: formatCount(data.total_likes) },
      { label: 'Clones', value: formatCount(data.total_cloned) },
      { label: 'Avg rating', value: formatRating(data.avg_ratings) },
      { label: 'Tables', value: formatCount(data.total_tables) },
      { label: 'APIs', value: formatCount(data.total_apis) }
    ];
    el.innerHTML = items.map(function (item) {
      return '<div class="vt-stat">' +
        '<span class="vt-stat__value">' + esc(item.value) + '</span>' +
        '<span class="vt-stat__label">' + esc(item.label) + '</span>' +
      '</div>';
    }).join('');
  }

  function renderTables(tables) {
    var body = document.getElementById('vot-tables-body');
    if (!body) return;
    if (!tables.length) {
      body.innerHTML = emptyState('No tables in this template.');
      return;
    }
    body.innerHTML = tables.map(function (table, i) {
      var cols = Array.isArray(table.columns) ? table.columns : [];
      var open = i === 0 ? ' is-open' : '';
      var expanded = i === 0 ? 'true' : 'false';
      return '<article class="vt-table-card' + open + '" data-table-id="' + esc(String(table.id)) + '">' +
        '<button class="vt-table-card__head" type="button" aria-expanded="' + expanded + '">' +
          '<span class="vt-table-card__name">' + esc(table.table_name) + '</span>' +
          '<span class="vt-table-card__count">' + cols.length + ' column' + (cols.length === 1 ? '' : 's') + '</span>' +
          '<span class="vt-table-card__chevron" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="vt-table-card__body">' +
          renderColumnGrid(cols) +
        '</div>' +
      '</article>';
    }).join('');

    body.querySelectorAll('.vt-table-card__head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.vt-table-card');
        var openNow = card.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(openNow));
      });
    });
  }

  function renderColumnGrid(cols) {
    if (!cols.length) return '<p class="vt-empty-inline">No columns.</p>';
    var rows = cols.map(function (c) {
      var nullable = c.is_nullable
        ? '<span class="vt-null vt-null--yes" title="Nullable">✓</span>'
        : '<span class="vt-null vt-null--no" title="Not nullable">✗</span>';
      var def = c.default_value == null || c.default_value === ''
        ? '<span class="vt-col-default vt-col-default--none">—</span>'
        : '<code class="vt-col-default">' + esc(String(c.default_value)) + '</code>';
      var fk = '';
      if (c.parent_table_name && c.parent_col_name) {
        fk = '<div class="vt-fk">' +
          '<span class="vt-fk__arrow">→ references</span> ' +
          '<code>' + esc(c.parent_table_name) + '.' + esc(c.parent_col_name) + '</code>' +
          (c.fk_name ? '<span class="vt-fk__name">' + esc(c.fk_name) + '</span>' : '') +
        '</div>';
      }
      return '<tr>' +
        '<td class="vt-col-name">' + esc(c.name) + fk + '</td>' +
        '<td class="vt-col-type">' + esc(colTypeLabel(c)) + '</td>' +
        '<td>' + colConstraintChips(c) + '</td>' +
        '<td class="vt-col-null">' + nullable + '</td>' +
        '<td>' + def + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="vt-grid-wrap">' +
      '<table class="vt-grid">' +
        '<thead><tr><th>Name</th><th>Type</th><th>Key</th><th>Null</th><th>Default</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function colTypeLabel(c) {
    var label = String(c.type || '').toUpperCase();
    var sized = label === 'VARCHAR' || label === 'NUMERIC';
    if (sized && c.column_length != null && c.column_length !== '') {
      label += '(' + c.column_length + ')';
    }
    return label;
  }

  function colConstraintChips(c) {
    var chips = [];
    if (c.is_primary_key) chips.push('<span class="vt-key vt-key--pk" title="Primary key">PK</span>');
    if (c.is_unique) chips.push('<span class="vt-key vt-key--uq" title="Unique">UQ</span>');
    if (c.is_auto_increment) chips.push('<span class="vt-key vt-key--ai" title="Auto increment">AI</span>');
    if (!chips.length) return '<span class="vt-col-default vt-col-default--none">—</span>';
    return '<div class="vt-keys">' + chips.join('') + '</div>';
  }

  function renderApis(apis) {
    var body = document.getElementById('vot-apis-body');
    if (!body) return;
    if (!apis.length) {
      body.innerHTML = emptyState('No APIs in this template.');
      return;
    }
    body.innerHTML = apis.map(function (api, i) {
      var method = inferMethod(api);
      var rate = api.rate_limit_per_day != null ? api.rate_limit_per_day + '/day' : '—';
      var code = formatQueryDef(api.query_definition);
      var open = i === 0 ? ' is-open' : '';
      var expanded = i === 0 ? 'true' : 'false';
      return '<article class="vt-api-card' + open + '">' +
        '<button class="vt-api-card__head" type="button" aria-expanded="' + expanded + '">' +
          '<span class="vp-api-method vp-api-method--' + method.toLowerCase() + '">' + esc(method) + '</span>' +
          '<span class="vt-api-card__name">' + esc(api.name) + '</span>' +
          '<span class="vt-rate-tag">' + esc(rate) + '</span>' +
          '<span class="vt-table-card__chevron" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="vt-api-card__body">' +
          '<pre class="vt-code"><code>' + highlightJson(code) + '</code></pre>' +
        '</div>' +
      '</article>';
    }).join('');

    body.querySelectorAll('.vt-api-card__head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.vt-api-card');
        var openNow = card.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(openNow));
      });
    });
  }

  function renderReviews(reviews) {
    var body = document.getElementById('vot-reviews-body');
    if (!body) return;
    if (!reviews.length) {
      body.innerHTML = emptyState('No reviews yet.');
      return;
    }
    body.innerHTML = reviews.map(function (r) {
      return '<article class="vt-review">' +
        avatar({ name: r.name, username: r.username, size: 42, className: 'vt-review__avatar' }) +
        '<div class="vt-review__body">' +
          '<div class="vt-review__head">' +
            '<span class="vt-review__name">' + esc(r.name || r.username || 'User') + '</span>' +
            (r.username ? '<span class="vt-review__handle">@' + esc(r.username) + '</span>' : '') +
            '<span class="vt-review__stars" aria-label="' + esc(String(r.rating)) + ' out of 5">' + starsHtml(r.rating) + '</span>' +
            '<span class="vt-review__time">' + esc(formatDateTime(r.updated_at || r.created_at)) + '</span>' +
          '</div>' +
          '<p class="vt-review__text">' + esc(r.review || r.review_text || '') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  async function loadFeedback() {
    var body = document.getElementById('vot-feedback-body');
    if (!body) return;
    body.innerHTML = emptyState('Loading feedback…');
    try {
      var res = await apiFetch('/view/viewFeedback/' + encodeURIComponent(state.templateId));
      if (res.status === 401) { window.location.href = '/login'; return; }
      var payload = await readJson(res);
      if (res.status === 403) {
        body.innerHTML = emptyState(routeMsg(payload, "You don't have access to this template's feedback"));
        return;
      }
      if (res.status === 404) {
        body.innerHTML = emptyState(routeMsg(payload, 'No feedback yet'));
        return;
      }
      if (!res.ok) {
        body.innerHTML = emptyState(routeMsg(payload, 'Failed to load feedback'));
        return;
      }
      var items = asArray(payload && payload.data);
      renderFeedback(items);
    } catch (_) {
      body.innerHTML = emptyState(NETWORK_ERROR);
    }
  }

  function renderFeedback(items) {
    var body = document.getElementById('vot-feedback-body');
    if (!body) return;
    if (!items.length) {
      body.innerHTML = emptyState('No feedback yet.');
      return;
    }
    body.innerHTML = items.map(function (f) {
      return '<article class="vt-review">' +
        avatar({ name: f.name, username: f.username, size: 42, className: 'vt-review__avatar' }) +
        '<div class="vt-review__body">' +
          '<div class="vt-review__head">' +
            '<span class="vt-review__name">' + esc(f.name || f.username || 'User') + '</span>' +
            (f.username ? '<span class="vt-review__handle">@' + esc(f.username) + '</span>' : '') +
            '<span class="vt-review__time">' + esc(formatDateTime(f.created_at)) + '</span>' +
          '</div>' +
          '<p class="vt-review__text">' + esc(f.message || '') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.vt-tabs .vp-tab');
    var panels = {
      'tab-tables': 'panel-tables',
      'tab-apis': 'panel-apis',
      'tab-reviews': 'panel-reviews',
      'tab-feedback': 'panel-feedback',
      'tab-settings': 'panel-settings'
    };
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        Object.keys(panels).forEach(function (id) {
          var panel = document.getElementById(panels[id]);
          if (!panel) return;
          var on = id === tab.id;
          panel.classList.toggle('is-active', on);
          panel.hidden = !on;
        });
        if (tab.id === 'tab-feedback') loadFeedback();
      });
    });
  }

  function fillSettingsForm(data) {
    var nameEl = document.getElementById('vot-settings-name');
    var descEl = document.getElementById('vot-settings-desc');
    var authEl = document.getElementById('vot-settings-auth');
    if (nameEl) nameEl.value = data.template_name || '';
    if (descEl) descEl.value = data.description || '';
    if (authEl) authEl.checked = !!data.auth_enabled;
    var tags = Array.isArray(data.template_tags) ? data.template_tags.map(function (t) { return t.name; }) : [];
    state.settingsTags = tags.slice();
    renderSettingsTags();
  }

  function bindSettings() {
    if (state.settingsBound) return;
    state.settingsBound = true;

    var form = document.getElementById('vot-settings-form');
    var addTagBtn = document.getElementById('vot-btn-add-tag');
    var deleteBtn = document.getElementById('vot-btn-delete-template');

    if (form) form.addEventListener('submit', submitSettings);
    if (addTagBtn) addTagBtn.addEventListener('click', addSettingsTag);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteTemplate);
    initSettingsTagSearch();
  }

  function initSettingsTagSearch() {
    var input = document.getElementById('vot-settings-tag-input');
    var group = input ? input.closest('.tag-input-group') : null;
    var form = document.getElementById('vot-settings-form');
    if (!input || !group || !form) return;

    var dropdown = document.getElementById('vot-settings-tag-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'vot-settings-tag-dropdown';
      dropdown.className = 'tag-dropdown-menu';
      dropdown.hidden = true;
      group.appendChild(dropdown);
    }

    var reqId = 0;

    function renderDbTags(names) {
      dropdown.innerHTML = '';
      var selectedLower = state.settingsTags.map(function (t) { return t.toLowerCase(); });
      var newTags = names.filter(function (n) { return selectedLower.indexOf(n.toLowerCase()) === -1; });
      if (newTags.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'tag-dropdown-empty';
        empty.textContent = 'No matching tags found in the database.';
        dropdown.appendChild(empty);
        dropdown.hidden = false;
        return;
      }
      newTags.forEach(function (name) {
        var item = document.createElement('div');
        item.className = 'tag-dropdown-item';
        item.innerHTML = '<span>' + esc(name) + '</span> <span style="font-size: 0.72rem; color: var(--text-faint);">From database</span>';
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          addSettingsTagFromValue(name);
          input.value = '';
          dropdown.hidden = true;
        });
        dropdown.appendChild(item);
      });
      dropdown.hidden = false;
    }

    async function runSearch() {
      var q = input.value.trim().toLowerCase();
      if (!q) { dropdown.hidden = true; return; }
      var myReq = ++reqId;
      try {
        var res = await apiFetch('/view/searchTags?q=' + encodeURIComponent(q));
        if (!res.ok) return;
        var data = await res.json();
        if (myReq !== reqId) return;
        var names = Array.isArray(data.tags) ? data.tags.map(function (t) { return t.name; }) : [];
        renderDbTags(names);
      } catch (_) { /* non-fatal */ }
    }

    input.addEventListener('focus', function () {
      if (input.value.trim()) runSearch();
    });
    input.addEventListener('input', runSearch);

    document.addEventListener('click', function (e) {
      if (form && !form.contains(e.target)) dropdown.hidden = true;
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var items = dropdown.querySelectorAll('.tag-dropdown-item');
        if (!dropdown.hidden && items.length > 0) {
          items[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        } else {
          addSettingsTag();
        }
      } else if (e.key === 'Escape') {
        dropdown.hidden = true;
      }
    });
  }

  function renderSettingsTags() {
    var wrap = document.getElementById('vot-settings-tags');
    if (!wrap) return;
    wrap.innerHTML = state.settingsTags.map(function (t) {
      return '<span class="tag">' + esc(t) +
        ' <button type="button" class="tag__remove" data-tag-name="' + esc(t) + '" aria-label="Remove tag">&times;</button></span>';
    }).join('');
    wrap.querySelectorAll('.tag__remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-tag-name');
        var idx = state.settingsTags.indexOf(name);
        if (idx !== -1) {
          state.settingsTags.splice(idx, 1);
          renderSettingsTags();
        }
      });
    });
  }

  function addSettingsTag() {
    var input = document.getElementById('vot-settings-tag-input');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    addSettingsTagFromValue(val);
    input.value = '';
  }

  function addSettingsTagFromValue(raw) {
    var val = String(raw).trim().toLowerCase();
    if (!val) return;
    if (!(val[0] >= 'a' && val[0] <= 'z')) { showToast('Tag must start with a–z', 'error'); return; }
    if (val.length < 2 || val.length > 20) { showToast('Tag must be 2–20 characters', 'error'); return; }
    if (state.settingsTags.length >= 10) { showToast('Max 10 tags allowed', 'error'); return; }
    if (state.settingsTags.indexOf(val) !== -1) { showToast('Tag already added', 'error'); return; }
    state.settingsTags.push(val);
    renderSettingsTags();
  }

  async function submitSettings(e) {
    e.preventDefault();
    var nameEl = document.getElementById('vot-settings-name');
    var descEl = document.getElementById('vot-settings-desc');
    var authEl = document.getElementById('vot-settings-auth');
    var saveBtn = document.getElementById('vot-btn-save-settings');
    var err = document.getElementById('vot-settings-error');
    hideFormError(err);

    var payload = {
      proj_name: nameEl ? nameEl.value.trim() : '',
      description: descEl ? descEl.value : '',
      enable_auth: !!(authEl && authEl.checked),
      tags: state.settingsTags
    };

    setBusy(saveBtn, true, 'Saving…');
    try {
      var res = await apiFetch('/project/updateProject/' + encodeURIComponent(state.templateId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      var data = await readJson(res);
      var msg = routeMsg(data, res.ok ? 'Project updated successfully' : 'Failed to update project');
      if (!res.ok) {
        showFormError(err, msg);
        showToast(msg, 'error');
        return;
      }
      showToast(msg, 'success');
      await loadTemplate();
    } catch (_) {
      showFormError(err, NETWORK_ERROR);
      showToast(NETWORK_ERROR, 'error');
    } finally {
      setBusy(saveBtn, false);
    }
  }

  function deleteTemplate() {
    confirmModal({
      title: 'Delete Template',
      message: 'Delete this template permanently? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async function () {
        try {
          var res = await apiFetch('/project/deleteProject/' + encodeURIComponent(state.templateId), { method: 'DELETE' });
          if (res.status === 401) { window.location.href = '/login'; return; }
          var data = await readJson(res);
          var msg = routeMsg(data, res.ok ? 'Project was deleted successfully' : 'Failed to delete project');
          if (res.ok) {
            showToast(msg, 'success');
            window.location.href = '/templates';
          } else {
            showToast(msg, 'error');
          }
        } catch (_) {
          showToast(NETWORK_ERROR, 'error');
        }
      }
    });
  }

  function initModal() {
    var overlay = document.getElementById('vot-modal-overlay');
    var closeBtn = document.getElementById('vot-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  function showModal(title, bodyHtml, footHtml) {
    var overlay = document.getElementById('vot-modal-overlay');
    var titleEl = document.getElementById('vot-modal-title');
    var bodyEl = document.getElementById('vot-modal-body');
    var footEl = document.getElementById('vot-modal-foot');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    if (footEl) footEl.innerHTML = footHtml;
    if (overlay) overlay.hidden = false;
  }

  function closeModal() {
    var overlay = document.getElementById('vot-modal-overlay');
    var bodyEl = document.getElementById('vot-modal-body');
    var footEl = document.getElementById('vot-modal-foot');
    if (overlay) overlay.hidden = true;
    if (bodyEl) bodyEl.innerHTML = '';
    if (footEl) footEl.innerHTML = '';
  }

  function confirmModal(opts) {
    opts = opts || {};
    var bodyHtml = '<p class="vp-confirm-msg">' + esc(opts.message || '') + '</p>';
    var okClass = opts.danger ? 'btn btn--ghost btn--sm' : 'btn btn--primary btn--sm';
    var okStyle = opts.danger ? ' style="color:var(--error);border-color:var(--error);"' : '';
    var footHtml =
      '<button class="btn btn--ghost btn--sm" id="vot-confirm-cancel" type="button">Cancel</button>' +
      '<button class="' + okClass + '" id="vot-confirm-ok" type="button"' + okStyle + '>' + esc(opts.confirmLabel || 'Confirm') + '</button>';
    showModal(opts.title || 'Confirm', bodyHtml, footHtml);
    document.getElementById('vot-confirm-cancel').addEventListener('click', closeModal);
    document.getElementById('vot-confirm-ok').addEventListener('click', function () {
      closeModal();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    });
  }

  function inferMethod(api) {
    var def = api && api.query_definition;
    if (def && typeof def === 'object' && def.method) return String(def.method).toUpperCase();
    var name = String(api && api.name || '').toLowerCase();
    if (name.indexOf('create') === 0 || name.indexOf('add') === 0) return 'POST';
    if (name.indexOf('update') === 0) return 'PUT';
    if (name.indexOf('delete') === 0) return 'DELETE';
    return 'GET';
  }

  function formatQueryDef(def) {
    if (def == null) return '';
    if (typeof def === 'string') {
      try { return JSON.stringify(JSON.parse(def), null, 2); } catch (_) { return def; }
    }
    try { return JSON.stringify(def, null, 2); } catch (_) { return String(def); }
  }

  function highlightJson(src) {
    var out = esc(src);
    out = out.replace(/&quot;([^&]*)&quot;(?=\s*:)/g, '<span class="vt-syn-key">&quot;$1&quot;</span>');
    out = out.replace(/&quot;([^&]*)&quot;/g, '<span class="vt-syn-str">&quot;$1&quot;</span>');
    out = out.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="vt-syn-num">$1</span>');
    out = out.replace(/\b(true|false|null)\b/g, '<span class="vt-syn-kw">$1</span>');
    return out;
  }

  function starsHtml(rating) {
    var n = Math.round(Number(rating) || 0);
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span class="' + (i <= n ? 'notif-star--filled' : 'notif-star--empty') + '" aria-hidden="true">★</span>';
    }
    return html;
  }

  function emptyState(text) {
    return '<div class="vp-empty"><p class="vp-empty__title">' + esc(text) + '</p></div>';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatCount(n) {
    var v = Number(n) || 0;
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  function formatRating(n) {
    var v = Number(n);
    if (isNaN(v)) return '0.0';
    return v.toFixed(1);
  }

  function routeMsg(payload, fallback) {
    if (payload && payload.msg) return payload.msg;
    return fallback;
  }

  function showFormError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
  }

  function hideFormError(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('is-visible');
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent;
      btn.disabled = true;
      btn.classList.add('btn--loading');
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      btn.classList.remove('btn--loading');
      btn.textContent = btn.dataset.idleLabel || btn.textContent;
    }
  }

  function showToast(msg, type) {
    var host = document.getElementById('vp-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'vp-toast-host';
      host.className = 'vp-toast-host';
      document.body.appendChild(host);
    }
    var toast = document.createElement('div');
    toast.className = 'vp-toast vp-toast--' + (type === 'error' ? 'error' : 'success');
    toast.textContent = msg;
    host.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3200);
  }

  async function readJson(res) {
    try { return await res.json(); } catch (_) { return null; }
  }

  async function apiFetch(url, opts) {
    opts = opts || {};
    var backendUrl = window.BACKEND_URL || 'http://localhost:3000';
    opts.credentials = 'include';
    return fetch(backendUrl + url, opts);
  }
})();
