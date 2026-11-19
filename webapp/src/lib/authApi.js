let csrfToken = '';

export class ApiRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

function endpoint(path) {
  const projectBase = window.location.pathname.replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  return `${projectBase}${path}`;
}

async function request(path, options) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(endpoint(path), { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The authentication server did not respond. Please try again.');
    }
    throw new Error('Could not reach the authentication server. Check your connection and try again.');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiRequestError('The authentication server returned an invalid response.', response.status);
  }
  if (result.csrfToken) csrfToken = result.csrfToken;
  if (!response.ok) throw new ApiRequestError(result.message || 'The request could not be completed.', response.status);
  return result;
}

export async function authGet(path) {
  const response = await request(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return readResponse(response);
}

export async function authPost(path, values = {}) {
  return authRequest(path, 'POST', values);
}

export async function authRequest(path, method, values = {}, extraHeaders = {}) {
  if (!csrfToken) {
    const csrf = await authGet('/api/auth/csrf.php');
    csrfToken = csrf.csrfToken;
  }
  const isForm = values instanceof FormData;
  const response = await request(path, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-CSRF-Token': csrfToken,
      ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: isForm ? values : JSON.stringify(values),
  });
  return readResponse(response);
}
