document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  const identity = form.identifier.value.trim();
  const password = form.password.value;

  errorBox.textContent = '';
  errorBox.classList.remove('is-visible');

  // if (!identity || !password) {
  //   showError('Please fill in all fields');
  //   return;
  // }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';

  const backendUrl = window.BACKEND_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // required so the httpOnly session cookie is stored/sent cross-origin
      body: JSON.stringify({ identity, password })
    });

    const data = await res.json();

    if (!res.ok) {
      // covers 400 (bad creds) and 409 (already logged in, from requireGuest)
      showError(data.msg || 'Something went wrong, please try again');
      return;
    }

    window.location.href = '/dashboard';
  } catch (err) {
    showError('Could not reach the server. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
  }
});