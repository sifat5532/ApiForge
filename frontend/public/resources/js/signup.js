document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const errorBox = document.getElementById('reg-error');
  const submitBtn = document.getElementById('reg-submit');

  const name = form.name.value.trim();
  const username = form.username.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirm_password = form.confirmPassword.value;

  errorBox.textContent = '';
  errorBox.classList.remove('is-visible');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';

  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${backendUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, username, email, password, confirm_password })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.msg || 'Something went wrong, please try again');
      return;
    }

    showSuccessModal({
      title: 'Account created!',
      message: `Your account <strong>${escapeHtml(username)}</strong> has been created successfully. You can now log in.`,
      confirmText: 'Go to login'
    });
  } catch (err) {
    showError('Could not reach the server. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
  }
});

/**
 * Shows a success modal. Resolves when the user dismisses it (true = confirmed).
 */
function showSuccessModal({ title, message, confirmText = 'OK' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'success-modal-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.65)', 'padding:1rem'
    ].join(';');

    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="sm-title" style="
        background:var(--surface, #1a1a2e);
        border:1px solid var(--border, #2e2e4a);
        border-radius:12px;
        padding:2rem;
        max-width:440px;
        width:100%;
        box-shadow:0 24px 64px rgba(0,0,0,0.5);
      ">
        <div style="display:flex;align-items:center;gap:0.75rem;margin:0 0 0.75rem;">
          <span style="
            display:inline-flex;align-items:center;justify-content:center;
            width:36px;height:36px;border-radius:50%;
            background:rgba(34,197,94,0.15);color:#22c55e;font-size:1.1rem;
          ">✓</span>
          <h2 id="sm-title" style="margin:0;font-size:1.1rem;color:var(--text-primary,#e8e8f0);">${escapeHtml(title)}</h2>
        </div>
        <p style="margin:0 0 1.5rem;font-size:0.875rem;color:var(--text-secondary,#a0a0b8);line-height:1.5;">${message}</p>
        <div style="display:flex;gap:0.75rem;">
          <button id="sm-confirm-btn" class="btn btn--primary" style="flex:1;">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.remove();
      window.location.href = '/login';
      resolve(result);
    }

    document.getElementById('sm-confirm-btn').addEventListener('click', () => cleanup(true));
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
