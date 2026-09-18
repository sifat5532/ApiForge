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
    liked: false,
    cloned: false,
    myRating: null,
    likeBusy: false,
    isOwner: false,
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
    bindLike();
    bindRateForm();
    bindFeedbackForm();
    bindCloneModal();
    initModal();
    bindSettings();
    await loadCurrentUser();
    await loadTemplate();
  }

  function extractTemplateId() {
    var match = window.location.pathname.match(/\/(?:my-)?template\/([^/]+)/);
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

      state.isOwner = !!(state.user && data.author_id != null && String(data.author_id) === String(state.user.id));

      if (state.isOwner) {
        applyOwnerMode();
      } else {
        applyPublicMode();
      }

      state.data = data;
      state.templateId = data.id != null ? data.id : state.templateId;
      state.myRating = findMyReview(data.template_reviews || []);
      if (state.myRating) state.cloned = true;
      renderPage(data);
      if (state.isOwner) fillSettingsForm(data);
    } catch (_) {
      renderLoadError('Network error. Is the backend reachable?');
    }
  }

  function applyOwnerMode() {
    var feedbackTab = document.getElementById('tab-feedback');
    var settingsTab = document.getElementById('tab-settings');
    var actions = document.getElementById('vt-hero-actions');
    var composeGrid = document.querySelector('#panel-reviews .vt-compose-grid');
    if (feedbackTab) feedbackTab.hidden = false;
    if (settingsTab) settingsTab.hidden = false;
    if (actions) actions.hidden = false;
    if (composeGrid) composeGrid.hidden = true;
  }

  function applyPublicMode() {
    var feedbackTab = document.getElementById('tab-feedback');
    var settingsTab = document.getElementById('tab-settings');
    var actions = document.getElementById('vt-hero-actions');
    if (feedbackTab) feedbackTab.hidden = true;
    if (settingsTab) settingsTab.hidden = true;
    if (actions) actions.hidden = false;
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

  function findMyReview(reviews) {
    if (!state.user) return null;
    for (var i = 0; i < reviews.length; i++) {
      if (String(reviews[i].user_id) === String(state.user.id)) return reviews[i];
    }
    return null;
  }

  function renderPage(data) {
    renderHero(data);
    renderStats(data);
    renderTables(data.tables || []);
    renderApis(data.apis || []);
    renderReviews(data.template_reviews || []);
    syncLikeBtn();
    fillRateForm(state.myRating);
  }

  function renderLoadError(msg) {
    var title = document.getElementById('vt-template-name');
    var desc = document.getElementById('vt-template-desc');
    var author = document.getElementById('vt-author');
    var tags = document.getElementById('vt-tags');
    var stats = document.getElementById('vt-stats');
    if (title) title.textContent = msg;
    if (desc) desc.textContent = '';
    if (author) author.innerHTML = '';
    if (tags) tags.innerHTML = '';
    if (stats) stats.innerHTML = '';
    var tables = document.getElementById('vt-tables-body');
    if (tables) tables.innerHTML = emptyState(msg);
  }

  function renderHero(data) {
    var title = document.getElementById('vt-template-name');
    var desc = document.getElementById('vt-template-desc');
    var author = document.getElementById('vt-author');
    var tags = document.getElementById('vt-tags');
    var crumb = document.getElementById('vt-crumb-name');

    if (title) title.textContent = data.template_name || 'Untitled template';
    if (desc) desc.textContent = data.description || '';
    if (crumb) crumb.textContent = data.template_name || 'Template';
    document.title = (data.template_name || 'Template') + ' — ApiForge';

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
    var el = document.getElementById('vt-stats');
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
    var body = document.getElementById('vt-tables-body');
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
    var body = document.getElementById('vt-apis-body');
    if (!body) return;
    if (!apis.length) {
      body.innerHTML = emptyState('No APIs in this template.');
      return;
    }
    body.innerHTML = apis.map(function (api, i) {
      var method = inferMethod(api);
      var rate = api.rate_limit_per_day != null ? api.rate_limit_per_day + '/day' : '—';
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
          renderQueryDefinitionVisual(api.query_definition, method) +
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

    /* Collapsible qv-section and qv-group-box toggles */
    body.querySelectorAll('.qv-section__header').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.closest('.qv-section').classList.toggle('is-open');
      });
    });
    body.querySelectorAll('.qv-group-box__toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.closest('.qv-group-box').classList.toggle('is-collapsed');
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  Query Definition Visual Renderer
   * ------------------------------------------------------------------ */

  function renderQueryDefinitionVisual(def, method) {
    var d = def;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { d = null; }
    }
    if (!d || typeof d !== 'object') {
      return '<p class="qv-empty-inline" style="padding:12px 0;">No query definition available.</p>';
    }

    var m = String(method || 'GET').toUpperCase();
    var html = '<div class="qv-root">';

    if (m === 'GET') {
      var selectObj       = d.select_obj || null;
      var joinArr         = Array.isArray(d.join_obj_array) ? d.join_obj_array : [];
      var whereArr        = Array.isArray(d.where) ? d.where : [];
      var groupByArr      = Array.isArray(d.group_by_cols_array) ? d.group_by_cols_array : [];
      var havingArr       = Array.isArray(d.having) ? d.having : [];
      var orderByArr      = Array.isArray(d.order_by_array) ? d.order_by_array : [];

      /* ── SELECT / FROM ── */
      html += qvSection('SELECT', renderSelectSection(selectObj), true);

      /* ── JOINs ── */
      if (joinArr.length > 0) {
        html += qvSection('JOINs', renderJoinsSection(joinArr), true, joinArr.length);
      }

      /* ── WHERE ── */
      if (whereArr.length > 0) {
        html += qvSection('WHERE filters', renderFilterGroup(whereArr, 0), true, whereArr.length);
      }

      /* ── GROUP BY ── */
      if (groupByArr.length > 0) {
        html += qvSection('GROUP BY', renderGroupBySection(groupByArr), true, groupByArr.length);
      }

      /* ── HAVING ── */
      if (havingArr.length > 0) {
        html += qvSection('HAVING filters', renderHavingSection(havingArr), true, havingArr.length);
      }

      /* ── ORDER BY ── */
      if (orderByArr.length > 0) {
        html += qvSection('ORDER BY', renderOrderBySection(orderByArr), true, orderByArr.length);
      }

      /* ── LIMIT / OFFSET / PAGING ── */
      if( d.limit !=null || d.offset !=null  )
      html += qvSection('Paging', renderPagingSection(d), true);

    } else if (m === 'POST') {
      html += qvSection('Target table', renderInsertTargetSection(d), true);

      var valueArr = Array.isArray(d.value_obj_array) ? d.value_obj_array : [];
      if (valueArr.length > 0) {
        html += qvSection('Values', renderValueObjSection(valueArr), true, valueArr.length);
      }

      var retCols = Array.isArray(d.returning_cols_id) ? d.returning_cols_id : [];
      if (retCols.length > 0) {
        html += qvSection('Returning columns', renderReturningColsSection(retCols), true, retCols.length);
      }

    } else if (m === 'PUT') {
      html += qvSection('Target table', renderUpdateTargetSection(d), true);

      var putValueArr = Array.isArray(d.value_obj_array) ? d.value_obj_array : [];
      if (putValueArr.length > 0) {
        html += qvSection('Set values', renderValueObjSection(putValueArr), true, putValueArr.length);
      }

      var putWhereArr = Array.isArray(d.where) ? d.where : [];
      if (putWhereArr.length > 0) {
        html += qvSection('WHERE filters', renderFilterGroup(putWhereArr, 0), true, putWhereArr.length);
      }

      var putRetCols = Array.isArray(d.returning_cols_id) ? d.returning_cols_id : [];
      if (putRetCols.length > 0) {
        html += qvSection('Returning columns', renderReturningColsSection(putRetCols), true, putRetCols.length);
      }

    } else if (m === 'DELETE') {
      html += qvSection('Target table', renderDeleteTargetSection(d), true);

      var delWhereArr = Array.isArray(d.where) ? d.where : [];
      if (delWhereArr.length > 0) {
        html += qvSection('WHERE filters', renderFilterGroup(delWhereArr, 0), true, delWhereArr.length);
      }

      var delRetCols = Array.isArray(d.returning_cols_id) ? d.returning_cols_id : [];
      if (delRetCols.length > 0) {
        html += qvSection('Returning columns', renderReturningColsSection(delRetCols), true, delRetCols.length);
      }
    }

    html += '</div>';
    return html;
  }

  /* ── POST: target table info ── */
  function renderInsertTargetSection(d) {
    var tableName = resolveTableLabel(d);
    /* column_id_array is annotated by the backend into [{col_id, col_name}, ...] */
    var colObjs = Array.isArray(d.column_id_array) ? d.column_id_array : [];
    var html = '<div class="qv-from" style="margin-bottom:10px;">' +
      '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;letter-spacing:0.07em;">INSERT INTO</span>' +
      '<span class="qv-col-chip"><span class="qv-col-chip__col">' + esc(tableName) + '</span></span>' +
    '</div>';
    if (colObjs.length > 0) {
      html += '<div style="font-size:0.72rem;color:var(--text-faint);margin-bottom:4px;">Columns: ' +
        colObjs.map(function(c) {
          /* each entry is {col_id, col_name} after annotation */
          var name = resolveColLabel(c);
          return '<span class="qv-col-chip" style="font-size:0.74rem;"><span class="qv-col-chip__col">' + esc(name) + '</span></span>';
        }).join('') +
      '</div>';
    }
    return html;
  }

  /* ── PUT: target table info ── */
  function renderUpdateTargetSection(d) {
    var tableName = resolveTableLabel(d);
    var alias   = d.table_alias ? ' as ' + d.table_alias : '';
    return '<div class="qv-from">' +
      '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;letter-spacing:0.07em;">UPDATE</span>' +
      '<span class="qv-col-chip"><span class="qv-col-chip__col">' + esc(tableName) + '</span>' +
        (alias ? '<span class="qv-col-chip__alias"> as ' + esc(d.table_alias) + '</span>' : '') +
      '</span>' +
    '</div>';
  }

  /* ── DELETE: target table info ── */
  function renderDeleteTargetSection(d) {
    var tableName = resolveTableLabel(d);
    var alias   = d.table_alias ? ' as ' + d.table_alias : '';
    return '<div class="qv-from">' +
      '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;letter-spacing:0.07em;">DELETE FROM</span>' +
      '<span class="qv-col-chip"><span class="qv-col-chip__col">' + esc(tableName) + '</span>' +
        (alias ? '<span class="qv-col-chip__alias"> as ' + esc(d.table_alias) + '</span>' : '') +
      '</span>' +
    '</div>';
  }

  /* ── value_obj_array renderer (POST / PUT) ── */
  function renderValueObjSection(valueArr) {
    return '<div class="qv-filter-group">' + valueArr.map(function(v) {
      /* col_name is annotated by the backend alongside col_id */
      var colLabel  = resolveColLabel(v);
      var sourceLabel = esc(v.source || '—');
      var dynamicLabel = v.is_dynamic
        ? '<span class="qv-cond__val" style="color:var(--accent-light);">:' + esc(v.dynamic_field_name || '?') + '</span>'
        : '<span class="qv-cond__val">' + esc(String(v.default_value != null ? v.default_value : '—')) + '</span>';
      return '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">' +
        '<div class="qv-cond">' +
          '<span class="qv-cond__col">' + esc(colLabel) + '</span>' +
          '<span class="qv-cond__op">&larr;</span>' +
          '<span class="qv-logic-badge" style="font-size:0.65rem;">' + sourceLabel + '</span>' +
          dynamicLabel +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ── returning_cols_id renderer ──
     After annotate_query_ids the array contains {col_id, col_name} objects. */
  function renderReturningColsSection(colObjs) {
    return '<div class="qv-groupby-chips">' + colObjs.map(function(c) {
      var name = resolveColLabel(c);
      return '<span class="qv-groupby-chip"><span class="qv-badge-col">' + esc(name) + '</span></span>';
    }).join('') + '</div>';
  }

  /* ── ORDER BY renderer ── */
  function renderOrderBySection(cols) {
    return '<div class="qv-groupby-chips">' + cols.map(function(o) {
      var tbl = resolveTableLabel(o);
      var col = resolveColLabel(o);
      var dir = String(o.order || 'asc').toUpperCase();
      return '<span class="qv-groupby-chip">' +
        '<span class="qv-badge-table">' + esc(tbl) + '</span>' +
        '<span style="color:var(--text-faint);">.</span>' +
        '<span class="qv-badge-col">' + esc(col) + '</span>' +
        '<span class="qv-logic-badge" style="margin-left:4px;font-size:0.65rem;">' + esc(dir) + '</span>' +
      '</span>';
    }).join('') + '</div>';
  }

  /* ── HAVING renderer ── */
  function renderHavingSection(havingArr) {
    return '<div class="qv-filter-group">' + havingArr.map(function(h, idx) {
      var tbl = resolveTableLabel(h);
      var col = resolveColLabel(h);
      var fn  = h.function_name ? String(h.function_name).toUpperCase() : '';
      var op  = h.having_operator || '=';
      var logic = (idx > 0 && h.logical_operator) ? h.logical_operator.toUpperCase() : null;
      var logicBadge = logic
        ? '<span class="qv-logic-badge qv-logic-badge--' + logic.toLowerCase() + '">' + esc(logic) + '</span>'
        : '';
      var valLabel = h.is_dynamic
        ? '<span class="qv-cond__val" style="color:var(--accent-light);">:' + esc(h.dynamic_field_name || '?') + '</span>'
        : '<span class="qv-cond__val">' + esc(String(h.fallback_value != null ? h.fallback_value : '—')) + '</span>';
      return '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">' +
        logicBadge +
        '<div class="qv-cond">' +
          (fn ? '<span class="qv-col-chip__agg">' + esc(fn) + '(</span>' : '') +
          '<span class="qv-col-chip__table" style="font-family:var(--font-mono);font-size:0.76rem;">' + esc(tbl) + '</span>' +
          '<span style="color:var(--text-faint);font-family:var(--font-mono);">.</span>' +
          '<span class="qv-cond__col">' + esc(col) + '</span>' +
          (fn ? '<span class="qv-col-chip__agg">)</span>' : '') +
          '<span class="qv-cond__op">' + esc(op) + '</span>' +
          valLabel +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ── PAGING (limit/offset/allow_client_paging) renderer ── */
  function renderPagingSection(d) {
    function valLabel(v) {
      if (v == null) return '—';
      if (typeof v === 'object') {
        return v.is_dynamic
          ? '<span class="qv-cond__val" style="color:var(--accent-light);">:' + esc(v.dynamic_field_name || '?') + '</span>'
          : '<span class="qv-cond__val">' + esc(String(v.fallback_value != null ? v.fallback_value : '—')) + '</span>';
      }
      return '<span class="qv-cond__val">' + esc(String(v)) + '</span>';
    }
    return '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;">LIMIT</span>' +
        valLabel(d.limit) +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;">OFFSET</span>' +
        valLabel(d.offset) +
      '</div>' +
      (d.allow_client_paging != null
        ? '<div style="display:flex;align-items:center;gap:4px;">' +
            '<span style="font-size:0.72rem;color:var(--text-faint);">Client paging:</span>' +
            '<span class="qv-cond__val">' + esc(String(d.allow_client_paging)) + '</span>' +
          '</div>'
        : '') +
    '</div>';
  }

  function qvSection(label, bodyHtml, openByDefault, count) {
    var openClass = openByDefault ? ' is-open' : '';
    var countBadge = count != null
      ? '<span class="qv-section__count">' + esc(String(count)) + '</span>'
      : '';
    return '<div class="qv-section' + openClass + '">' +
      '<button class="qv-section__header" type="button">' +
        '<span class="qv-section__label">' + esc(label) + '</span>' +
        countBadge +
        '<span class="qv-section__chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="qv-section__body">' + bodyHtml + '</div>' +
    '</div>';
  }

  /* ── Name lookups (so the UI never shows ids) ──
     The backend annotates query_definition with table_name / col_name, but as a
     final safeguard we can resolve any remaining id from the template's own tables. */
  function getTableNameById(tableId) {
    var tables = (state.data && state.data.tables) || [];
    for (var i = 0; i < tables.length; i++) {
      if (String(tables[i].id) === String(tableId)) return tables[i].table_name;
    }
    return null;
  }

  function getColNameById(tableId, colId) {
    var tables = (state.data && state.data.tables) || [];
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      if (tableId != null && String(t.id) !== String(tableId)) continue;
      var cols = Array.isArray(t.columns) ? t.columns : [];
      for (var j = 0; j < cols.length; j++) {
        if (String(cols[j].id) === String(colId)) return cols[j].name;
      }
    }
    return null;
  }

  /* Resolve a table label from whatever is available: annotated name, alias, or id lookup. */
  function resolveTableLabel(obj) {
    if (obj.table_name && obj.table_name !== 'null') return obj.table_name;
    if (obj.table_alias) return obj.table_alias;
    if (obj.table_id != null) return getTableNameById(obj.table_id) || ('table #' + obj.table_id);
    return '?';
  }

  /* Resolve a column label from whatever is available: annotated name, or id lookup. */
  function resolveColLabel(obj) {
    if (obj.col_name && obj.col_name !== 'null') return obj.col_name;
    if (obj.col_id != null) return getColNameById(obj.table_id, obj.col_id) || ('col #' + obj.col_id);
    return '?';
  }

  function renderSelectSection(selectObj) {
    if (!selectObj) return '<p class="qv-empty-inline">No SELECT defined.</p>';

    var tableName = resolveTableLabel(selectObj);
    var alias     = selectObj.table_alias ? ' <span class="qv-col-chip__alias">as ' + esc(selectObj.table_alias) + '</span>' : '';

    var fromHtml = '<div class="qv-from" style="margin-bottom:10px;">' +
      '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-faint);font-weight:700;letter-spacing:0.07em;">FROM</span>' +
      '<span class="qv-col-chip"><span class="qv-col-chip__col">' + esc(tableName) + '</span>' + alias + '</span>' +
    '</div>';

    var cols = Array.isArray(selectObj.cols_obj_array) ? selectObj.cols_obj_array : [];
    var colsHtml = '<div class="qv-cols">' + cols.map(renderColChip).join('') + '</div>';

    return fromHtml + colsHtml;
  }

  function renderColChip(c) {
    // c.is_select_all → render as  tablealias.*
    if (c.is_select_all) {
      /* prefer table_name (annotated), fall back to table_alias */
      var tbl = c.table_name || c.table_alias || '?';
      return '<span class="qv-col-chip">' +
        '<span class="qv-col-chip__table">' + esc(tbl) + '</span>' +
        '<span class="qv-col-chip__dot">.</span>' +
        '<span class="qv-col-chip__star">*</span>' +
      '</span>';
    }

    /* col_name and table_name are annotated by the backend */
    var colName   = resolveColLabel(c);
    var tableName = resolveTableLabel(c);
    /* The schema field is "function" (e.g. "COUNT"), not "agg_func" */
    var aggFn     = c.function   ? String(c.function).toUpperCase()   : null;
    /* The schema field is "alias" (the column's own output alias) */
    var colAlias  = c.alias      || null;

    var inner = '';
    if (aggFn) {
      inner += '<span class="qv-col-chip__agg">' + esc(aggFn) + '(</span>';
    }
    inner += '<span class="qv-col-chip__table">' + esc(tableName) + '</span>' +
             '<span class="qv-col-chip__dot">.</span>' +
             '<span class="qv-col-chip__col">' + esc(colName) + '</span>';
    if (aggFn) {
      inner += '<span class="qv-col-chip__agg">)</span>';
    }
    if (colAlias) {
      inner += '<span class="qv-col-chip__alias"> as ' + esc(colAlias) + '</span>';
    }

    return '<span class="qv-col-chip">' + inner + '</span>';
  }

  function renderJoinsSection(joins) {
    return '<div class="qv-joins">' + joins.map(function (j) {
      var joinType  = String(j.join_type || j.type || 'inner').toLowerCase();
      var joinTable = resolveTableLabel(j);
      var alias     = j.alias ? ' as ' + j.alias : '';

      var leftCol   = (j.left && resolveColLabel(j.left))  || '?';
      var leftTbl   = (j.left && resolveTableLabel(j.left)) || '';
      var rightCol  = (j.right && resolveColLabel(j.right)) || '?';
      var rightTbl  = (j.right && resolveTableLabel(j.right)) || '';

      var leftDesc  = leftTbl  ? leftTbl  + '.' + leftCol  : leftCol;
      var rightDesc = rightTbl ? rightTbl + '.' + rightCol : rightCol;

      var opLabel   = j.join_operator || '=';

      return '<div class="qv-join-row">' +
        '<span class="qv-join-type qv-join-type--' + esc(joinType) + '">' + esc(joinType.toUpperCase()) + ' JOIN</span>' +
        '<span class="qv-col-chip" style="font-size:0.76rem;">' +
          '<span class="qv-col-chip__col">' + esc(joinTable) + '</span>' +
          (alias ? '<span class="qv-col-chip__alias"> as ' + esc(j.alias) + '</span>' : '') +
        '</span>' +
        '<span class="qv-join-sep">ON</span>' +
        '<code style="font-size:0.76rem;font-family:var(--font-mono);color:var(--text-muted);">' + esc(leftDesc) + '</code>' +
        '<span class="qv-cond__op">' + esc(opLabel) + '</span>' +
        '<code style="font-size:0.76rem;font-family:var(--font-mono);color:var(--text-muted);">' + esc(rightDesc) + '</code>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderGroupBySection(cols) {
    return '<div class="qv-groupby-chips">' + cols.map(function (g) {
      var tbl = resolveTableLabel(g);
      var col = resolveColLabel(g);
      return '<span class="qv-groupby-chip">' +
        '<span class="qv-badge-table">' + esc(tbl) + '</span>' +
        '<span style="color:var(--text-faint);">.</span>' +
        '<span class="qv-badge-col">'  + esc(col)  + '</span>' +
      '</span>';
    }).join('') + '</div>';
  }

  /* Renders a val1/val2 dynamic value object from the API schema */
  function renderDynamicVal(val) {
    if (val == null) return '<span class="qv-cond__null">—</span>';
    if (typeof val !== 'object') return '<span class="qv-cond__val">' + esc(String(val)) + '</span>';
    if (val.is_dynamic) {
      var srcLabel = val.dynamic_value_getting_type ? ' (' + esc(val.dynamic_value_getting_type) + ')' : '';
      var fallback = val.fallback_value != null
        ? '<span style="color:var(--text-faint);font-size:0.68rem;"> default: ' + esc(String(val.fallback_value)) + '</span>'
        : '';
      return '<span class="qv-cond__val" style="color:var(--accent-light);">:' + esc(val.dynamic_field_name || '?') + '</span>' +
             '<span style="font-size:0.68rem;color:var(--text-faint);">' + srcLabel + '</span>' +
             fallback;
    }
    return '<span class="qv-cond__val">' + esc(String(val.fallback_value != null ? val.fallback_value : '—')) + '</span>';
  }

  /* Recursively renders a WHERE / HAVING node array */
  function renderFilterGroup(nodes, depth) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return '<p class="qv-empty-inline">No conditions.</p>';
    }

    var html = '<div class="qv-filter-group">';
    nodes.forEach(function (node, idx) {
      /* Group node — has children */
      if (Array.isArray(node.children) && node.children.length > 0) {
        var logic = (idx > 0 && node.logical_operator)
          ? node.logical_operator.toUpperCase()
          : null;
        var logicBadge = logic
          ? '<span class="qv-logic-badge qv-logic-badge--' + logic.toLowerCase() + '">' + esc(logic) + '</span>'
          : '';
        var childHtml = renderFilterGroup(node.children, depth + 1);

        html += '<div class="qv-group-box">' +
          '<button class="qv-group-box__toggle" type="button">' +
            logicBadge +
            '<span class="qv-group-label">Group (' + node.children.length + ' condition' + (node.children.length === 1 ? '' : 's') + ')</span>' +
            '<span class="qv-group-box__chevron" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="qv-group-box__inner">' + childHtml + '</div>' +
        '</div>';
        return;
      }

      /* Leaf condition node */
      var tbl = resolveTableLabel(node);
      var col = resolveColLabel(node);
      var op  = String(node.operator || '=');

      var logic2 = (idx > 0 && node.logical_operator)
        ? node.logical_operator.toUpperCase()
        : null;
      var logicBadge2 = logic2
        ? '<span class="qv-logic-badge qv-logic-badge--' + logic2.toLowerCase() + '">' + esc(logic2) + '</span>'
        : '';

      var valHtml = '';
      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        valHtml = '<span class="qv-cond__null">—</span>';
      } else if (op === 'BETWEEN' && node.val1 != null && node.val2 != null) {
        valHtml = renderDynamicVal(node.val1) +
                  '<span style="color:var(--text-faint);font-size:0.7rem;"> &amp; </span>' +
                  renderDynamicVal(node.val2);
      } else if (node.val1 != null) {
        valHtml = renderDynamicVal(node.val1);
      } else if (node.value_from != null && node.value_to != null) {
        /* legacy field names fallback */
        valHtml = '<span class="qv-cond__val">' + esc(String(node.value_from)) + '</span>' +
                  '<span style="color:var(--text-faint);font-size:0.7rem;"> &amp; </span>' +
                  '<span class="qv-cond__val">' + esc(String(node.value_to)) + '</span>';
      } else if (node.value != null) {
        valHtml = '<span class="qv-cond__val">' + esc(String(node.value)) + '</span>';
      } else if (node.param_name) {
        valHtml = '<span class="qv-cond__val" style="color:var(--accent-light);">:' + esc(node.param_name) + '</span>';
      }

      html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        logicBadge2 +
        '<div class="qv-cond">' +
          '<span class="qv-col-chip__table" style="font-family:var(--font-mono);font-size:0.76rem;">' + esc(tbl) + '</span>' +
          '<span style="color:var(--text-faint);font-family:var(--font-mono);">.</span>' +
          '<span class="qv-cond__col">' + esc(col) + '</span>' +
          '<span class="qv-cond__op">' + esc(op) + '</span>' +
          valHtml +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderReviews(reviews) {
    var body = document.getElementById('vt-reviews-body');
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
    var body = document.getElementById('vt-feedback-body');
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
    var body = document.getElementById('vt-feedback-body');
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

  function bindLike() {
    var btn = document.getElementById('vt-like-btn');
    if (!btn) return;
    syncLikeBtn();
    btn.addEventListener('click', async function () {
      var templateId = state.data && state.data.id;
      if (!templateId) {
        showToast('You should input a template_id', 'error');
        return;
      }
      if (state.likeBusy) return;
      state.likeBusy = true;
      btn.disabled = true;
      try {
        var res = await apiFetch('/template/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: templateId })
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        var payload = await readJson(res);
        var msg = routeMsg(payload, res.ok ? 'Successfully liked the template' : 'Failed to like template');
        if (!res.ok) {
          showToast(msg, 'error');
          return;
        }
        var likedNow = /liked the template/i.test(msg) && !/removed like/i.test(msg);
        state.liked = likedNow;
        var likes = Number(state.data.total_likes) || 0;
        if (likedNow) state.data.total_likes = likes + 1;
        else state.data.total_likes = Math.max(0, likes - 1);
        state.data.is_liked = likedNow;
        syncLikeBtn();
        renderStats(state.data);
        showToast(msg, 'success');
      } catch (_) {
        showToast(NETWORK_ERROR, 'error');
      } finally {
        state.likeBusy = false;
        btn.disabled = false;
      }
    });
  }

  function syncLikeBtn() {
    var btn = document.getElementById('vt-like-btn');
    var label = document.getElementById('vt-like-label');
    if (!btn) return;
    btn.classList.toggle('is-liked', state.liked);
    btn.setAttribute('aria-pressed', String(state.liked));
    if (label) label.textContent = state.liked ? 'Liked' : 'Like';
  }

  function bindRateForm() {
    var form = document.getElementById('vt-rate-form');
    var picker = document.getElementById('vt-star-picker');
    var hidden = document.getElementById('vt-rating-value');
    var textarea = document.getElementById('vt-review-text');
    var count = document.getElementById('vt-review-count');
    var err = document.getElementById('vt-rate-error');
    if (!form || !picker) return;

    picker.innerHTML = [1, 2, 3, 4, 5].map(function (n) {
      return '<button class="vt-star-btn" type="button" data-rating="' + n + '" aria-label="' + n + ' star' + (n === 1 ? '' : 's') + '">★</button>';
    }).join('');

    picker.addEventListener('click', function (e) {
      var btn = e.target.closest('.vt-star-btn');
      if (!btn) return;
      setStarValue(Number(btn.getAttribute('data-rating')));
    });

    if (textarea && count) {
      textarea.addEventListener('input', function () {
        count.textContent = String(textarea.value.length);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideFormError(err);
      var templateId = state.data && state.data.id;
      var rating = Number(hidden && hidden.value);
      var review = textarea ? textarea.value : '';
      var submitBtn = form.querySelector('button[type="submit"]');

      if (!templateId || !rating || !review) {
        return fail(err, 'You should input template_id, rating and review');
      }
      if (!(rating >= 1 && rating <= 5) || rating % 1 !== 0) {
        return fail(err, 'Rating should be integer between 1 to 5');
      }
      if (review.length > 500) {
        return fail(err, 'Please give review within 500 characters');
      }

      setBusy(submitBtn, true, 'Submitting…');
      try {
        var res = await apiFetch('/template/rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: templateId, rating: rating, review: review })
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        var payload = await readJson(res);
        var msg = routeMsg(payload, res.ok ? 'Successfully rated the template' : 'Failed to rate template');
        if (!res.ok) return fail(err, msg);
        showToast(msg, 'success');
        await loadTemplate();
      } catch (_) {
        fail(err, NETWORK_ERROR);
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function fillRateForm(review) {
    var textarea = document.getElementById('vt-review-text');
    var count = document.getElementById('vt-review-count');
    var submitBtn = document.querySelector('#vt-rate-form button[type="submit"]');
    if (!review) return;
    var rating = Number(review.rating);
    if (rating) setStarValue(rating);
    if (textarea) {
      textarea.value = review.review || review.review_text || '';
      if (count) count.textContent = String(textarea.value.length);
    }
    if (submitBtn) submitBtn.textContent = 'Update review';
  }

  function setStarValue(value) {
    var hidden = document.getElementById('vt-rating-value');
    var picker = document.getElementById('vt-star-picker');
    if (hidden) hidden.value = String(value);
    if (!picker) return;
    picker.querySelectorAll('.vt-star-btn').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.getAttribute('data-rating')) <= value);
    });
  }

  function bindFeedbackForm() {
    var form = document.getElementById('vt-feedback-form');
    var textarea = document.getElementById('vt-feedback-text');
    var count = document.getElementById('vt-feedback-count');
    var err = document.getElementById('vt-feedback-error');
    if (!form) return;

    if (textarea && count) {
      textarea.addEventListener('input', function () {
        count.textContent = String(textarea.value.length);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideFormError(err);
      var templateId = state.data && state.data.id;
      var message = textarea ? textarea.value : '';
      var submitBtn = form.querySelector('button[type="submit"]');

      if (!templateId || !message) {
        return fail(err, 'You should input template_id and message');
      }
      if (message.trim().length === 0) {
        return fail(err, 'You can not send empty feedback');
      }
      if (message.length > 500) {
        return fail(err, 'Please give feedback within 500 characters');
      }

      setBusy(submitBtn, true, 'Sending…');
      try {
        var res = await apiFetch('/template/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: templateId, message: message })
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        var payload = await readJson(res);
        var msg = routeMsg(payload, res.ok ? 'Successfully sent feedback to the template' : 'Failed to send feedback');
        if (!res.ok) return fail(err, msg);
        textarea.value = '';
        if (count) count.textContent = '0';
        showToast(msg, 'success');
      } catch (_) {
        fail(err, NETWORK_ERROR);
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function bindCloneModal() {
    var openBtn = document.getElementById('vt-clone-btn');
    var overlay = document.getElementById('vt-clone-overlay');
    var closeBtn = document.getElementById('vt-clone-close');
    var cancelBtn = document.getElementById('vt-clone-cancel');
    var form = document.getElementById('vt-clone-form');
    var nameInput = document.getElementById('vt-clone-name');
    var authInput = document.getElementById('vt-clone-auth');
    var err = document.getElementById('vt-clone-error');
    if (!openBtn || !overlay || !form) return;

    function open() {
      hideFormError(err);
      overlay.hidden = false;
      if (nameInput) {
        nameInput.value = slugify(state.data && state.data.template_name || 'clone');
        nameInput.focus();
        nameInput.select();
      }
      if (authInput) authInput.checked = !!(state.data && state.data.auth_enabled);
    }

    function close() {
      overlay.hidden = true;
    }

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideFormError(err);
      var cloneName = nameInput ? nameInput.value.trim() : '';
      var clonedFromId = state.data && state.data.id;
      var submitBtn = form.querySelector('button[type="submit"]');

      if (!cloneName) {
        return fail(err, 'Please fill in clone name');
      }
      if (!/^[A-Za-z][a-zA-Z0-9_]{0,29}$/.test(cloneName)) {
        return fail(err, 'Please give clone name within 30 characters using a-z, 0-9 or _ only and first letter within a-z');
      }
      if (!clonedFromId) {
        return fail(err, 'Template not found');
      }

      setBusy(submitBtn, true, 'Cloning…');
      try {
        var res = await apiFetch('/project/cloneTemplate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clone_name: cloneName,
            auth_enabled: !!(authInput && authInput.checked),
            cloned_from_id: clonedFromId
          })
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        var payload = await readJson(res);
        var msg = routeMsg(payload, res.ok ? 'Template cloned successfully' : 'Failed to clone template');
        if (!res.ok) return fail(err, msg);
        state.cloned = true;
        close();
        await loadTemplate();
        if (payload && payload.api_key) {
          showApiKeyModal(payload.api_key);
        } else {
          showToast(msg, 'success');
        }
      } catch (_) {
        fail(err, NETWORK_ERROR);
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function showApiKeyModal(apiKey) {
    var existing = document.getElementById('api-key-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'api-key-modal-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.65)', 'padding:1rem'
    ].join(';');

    overlay.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="akm-title" style="' +
        'background:var(--surface, #1a1a2e);' +
        'border:1px solid var(--border, #2e2e4a);' +
        'border-radius:12px;' +
        'padding:2rem;' +
        'max-width:520px;' +
        'width:100%;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.5);' +
      '">' +
        '<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>' +
          '<h2 id="akm-title" style="margin:0;font-size:1.1rem;color:var(--text-primary,#e8e8f0);">Your API Key</h2>' +
        '</div>' +
        '<p style="margin:0 0 1.25rem;font-size:0.875rem;color:var(--text-secondary,#a0a0b8);line-height:1.5;">' +
          'Template cloned successfully. Copy your API key now — ' +
          '<strong style="color:var(--text-primary,#e8e8f0);">it will not be shown again.</strong>' +
        '</p>' +
        '<div style="' +
          'display:flex;align-items:center;gap:0.5rem;' +
          'background:var(--surface-raised,#12122a);' +
          'border:1px solid var(--border,#2e2e4a);' +
          'border-radius:8px;padding:0.6rem 0.75rem;' +
          'margin-bottom:1.5rem;' +
        '">' +
          '<code id="akm-key-display" style="' +
            'flex:1;font-family:monospace;font-size:0.8rem;' +
            'color:var(--accent,#7c6af7);word-break:break-all;' +
            'background:none;border:none;outline:none;' +
            'cursor:default;user-select:all;' +
          '">' + esc(apiKey) + '</code>' +
          '<button id="akm-copy-btn" title="Copy API key" style="' +
            'flex-shrink:0;background:none;border:none;cursor:pointer;' +
            'color:var(--text-secondary,#a0a0b8);padding:0.25rem;' +
            'border-radius:4px;transition:color 0.15s;' +
          '" aria-label="Copy API key">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:0.75rem 1rem;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.25);border-radius:8px;margin-bottom:1.5rem;font-size:0.8rem;color:var(--text-secondary,#a0a0b8);line-height:1.5;">' +
          'Store this key in a secure place (e.g. environment variables). You can regenerate it later from your project settings, but the old key will stop working immediately.' +
        '</div>' +
        '<button id="akm-continue-btn" class="btn btn--primary btn--block" style="width:100%;" type="button">' +
          "I've saved my key — Go to projects" +
        '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('akm-copy-btn').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(apiKey);
        var btn = document.getElementById('akm-copy-btn');
        btn.style.color = '#4caf7d';
        setTimeout(function () { btn.style.color = ''; }, 1500);
      } catch (_) {
        var codeEl = document.getElementById('akm-key-display');
        var range = document.createRange();
        range.selectNodeContents(codeEl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
    });

    document.getElementById('akm-continue-btn').addEventListener('click', function () {
      window.location.href = '/projects';
    });
  }

  /* ----------------------------- Owner features ----------------------------- */

  function fillSettingsForm(data) {
    var nameEl = document.getElementById('vt-settings-name');
    var descEl = document.getElementById('vt-settings-desc');
    var authEl = document.getElementById('vt-settings-auth');
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

    var form = document.getElementById('vt-settings-form');
    var addTagBtn = document.getElementById('vt-btn-add-tag');
    var deleteBtn = document.getElementById('vt-btn-delete-template');

    if (form) form.addEventListener('submit', submitSettings);
    if (addTagBtn) addTagBtn.addEventListener('click', addSettingsTag);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteTemplate);
    initSettingsTagSearch();
  }

  function initSettingsTagSearch() {
    var input = document.getElementById('vt-settings-tag-input');
    var group = input ? input.closest('.tag-input-group') : null;
    var form = document.getElementById('vt-settings-form');
    if (!input || !group || !form) return;

    var dropdown = document.getElementById('vt-settings-tag-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'vt-settings-tag-dropdown';
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
    var wrap = document.getElementById('vt-settings-tags');
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
    var input = document.getElementById('vt-settings-tag-input');
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
    var nameEl = document.getElementById('vt-settings-name');
    var descEl = document.getElementById('vt-settings-desc');
    var authEl = document.getElementById('vt-settings-auth');
    var saveBtn = document.getElementById('vt-btn-save-settings');
    var err = document.getElementById('vt-settings-error');
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
    var overlay = document.getElementById('vt-modal-overlay');
    var closeBtn = document.getElementById('vt-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  function showModal(title, bodyHtml, footHtml) {
    var overlay = document.getElementById('vt-modal-overlay');
    var titleEl = document.getElementById('vt-modal-title');
    var bodyEl = document.getElementById('vt-modal-body');
    var footEl = document.getElementById('vt-modal-foot');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    if (footEl) footEl.innerHTML = footHtml;
    if (overlay) overlay.hidden = false;
  }

  function closeModal() {
    var overlay = document.getElementById('vt-modal-overlay');
    var bodyEl = document.getElementById('vt-modal-body');
    var footEl = document.getElementById('vt-modal-foot');
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
      '<button class="btn btn--ghost btn--sm" id="vt-confirm-cancel" type="button">Cancel</button>' +
      '<button class="' + okClass + '" id="vt-confirm-ok" type="button"' + okStyle + '>' + esc(opts.confirmLabel || 'Confirm') + '</button>';
    showModal(opts.title || 'Confirm', bodyHtml, footHtml);
    document.getElementById('vt-confirm-cancel').addEventListener('click', closeModal);
    document.getElementById('vt-confirm-ok').addEventListener('click', function () {
      closeModal();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    });
  }

  function slugify(name) {
    var s = String(name || 'clone').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s || !/^[a-z]/.test(s)) s = 'clone_' + s;
    return s.slice(0, 30);
  }

  function fail(el, msg) {
    showFormError(el, msg);
    showToast(msg, 'error');
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

  function inferMethod(api) {
    // api.method is stored directly on the API object by the backend (separate DB column)
    if (api && api.method) return String(api.method).toUpperCase();
    // Fallback: check inside query_definition (not standard, but kept for safety)
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
