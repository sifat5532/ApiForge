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
    likeBusy: false
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
    await loadCurrentUser();
    await loadTemplate();
  }

  function extractTemplateId() {
    var match = window.location.pathname.match(/\/template\/([^/]+)/);
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
      state.data = data;
      state.templateId = data.id != null ? data.id : state.templateId;
      state.myRating = findMyReview(data.template_reviews || []);
      if (state.myRating) state.cloned = true;
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

  function initTabs() {
    var tabs = document.querySelectorAll('.vt-tabs .vp-tab');
    var panels = {
      'tab-tables': 'panel-tables',
      'tab-apis': 'panel-apis',
      'tab-reviews': 'panel-reviews'
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
        showToast(msg, 'success');
        await loadTemplate();
      } catch (_) {
        fail(err, NETWORK_ERROR);
      } finally {
        setBusy(submitBtn, false);
      }
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
