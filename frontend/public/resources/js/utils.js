(function (global) {
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(name, username) {
    var src = String(name || username || '?').trim();
    if (!src) return '?';
    var parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    var handle = String(username || src).replace(/^@/, '');
    if (handle.length >= 2 && !name) return handle.slice(0, 2).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function createAvatar(opts) {
    opts = opts || {};
    var name = opts.name || '';
    var username = opts.username || '';
    var size = opts.size || 36;
    var extra = opts.className || '';
    var initials = getInitials(name, username);
    var classes = ('liked-card__avatar' + (extra ? ' ' + extra : '')).trim();
    var label = name || username || 'User';
    var style = size !== 36
      ? ' style="width:' + size + 'px;height:' + size + 'px;"'
      : '';
    return '<span class="' + escapeHtml(classes) + '"'
      + style
      + ' title="' + escapeHtml(label) + '"'
      + ' aria-hidden="true">' + escapeHtml(initials) + '</span>';
  }

  global.ApiForgeUtils = {
    escapeHtml: escapeHtml,
    getInitials: getInitials,
    createAvatar: createAvatar
  };
})(window);
