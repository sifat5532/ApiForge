/* ===================================================================
   ApiForge — auth-redirect.js
   Used on public pages (index, login, signup). Redirects the user
   to the dashboard if they already have an active session.
   =================================================================== */

(function() {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  fetch(backendUrl + '/auth/me', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && data.user && !document.body.dataset.skipRedirect) {
        window.location.replace('/dashboard');
      }
    })
    .catch(() => {
      /* not logged in / backend unreachable — stay on page */
    });
})();
