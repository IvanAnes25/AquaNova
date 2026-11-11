import { authGet, authRequest } from './authApi.js';

const api = '/api/v1';

export function commercePath(path) {
  const projectBase = window.location.pathname.replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  return `${projectBase}${path}`;
}

export function commerceGet(path) {
  return authGet(`${api}${path}`);
}

export function commerceRequest(path, method, body = {}) {
  return authRequest(`${api}${path}`, method, body);
}

function reportQuery(period, date) {
  const params = new URLSearchParams({ period });
  if (date) params.set('date', date);
  return params.toString();
}

export function getReport(period, date) {
  return commerceGet(`/owner/reports?${reportQuery(period, date)}`);
}

export async function downloadReport(period = 'month', date) {
  const response = await fetch(commercePath(`${api}/owner/reports.csv?${reportQuery(period, date)}`), {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = 'Could not download the report.';
    try {
      message = (await response.json()).message || message;
    } catch {
      throw new Error(message);
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'aquatica-report.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
