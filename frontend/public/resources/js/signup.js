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

    window.location.href = '/login';
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
