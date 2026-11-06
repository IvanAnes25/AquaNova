import { apiPath } from './paths.js';

let csrfToken = '';

async function readResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server could not complete the request. Please try again.');
  }

  if (data.csrfToken) csrfToken = data.csrfToken;
  if (!response.ok) {
    throw new Error(data.message || 'The server could not complete the request.');
  }
  return data;
}

export async function authGet(path) {
  const response = await fetch(apiPath(path), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return readResponse(response);
}

export async function authPost(path, values = {}) {
  if (!csrfToken) {
    const csrf = await authGet('/api/auth/csrf.php');
    csrfToken = csrf.csrfToken;
  }

  const response = await fetch(apiPath(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(values),
  });
  return readResponse(response);
}
