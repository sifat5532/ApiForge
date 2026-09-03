/* ===================================================================
   ApiForge — auth-guard.js
   Protects private pages (dashboard). Redirects to login if user
   is not authenticated, or to index if the backend is down.
   =================================================================== */

(async function() {
  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
  try {
    const res = await fetch(backendUrl + '/auth/me', { credentials: 'include' });
    
    if (!res.ok) {
      window.location.replace('/login');
      return;
    }
    
    const data = await res.json();
    if (!data || !data.user) {
      window.location.replace('/login');
    }
  } catch (err) {
    console.error('Connection error with backend:', err);
    window.location.replace('/');
  }
})();
