import { authGet, authRequest } from './authApi.js';

const api = '/api/v1';

export function commercePath(path) {
  const projectBase = window.location.pathname.replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  return `${projectBase}${path}`;
}

export function commerceGet(path) {
  return authGet(`${api}${path}`);
}

export async function commerceGetAll(path, collections) {
  const definitions = collections.map((collection) => typeof collection === 'string'
    ? { key: collection, pageKey: 'page', sizeKey: 'pageSize', metaKey: 'pagination' }
    : {
      key: collection.key,
      pageKey: collection.pageKey || 'page',
      sizeKey: collection.sizeKey || 'pageSize',
      metaKey: collection.metaKey || 'pagination',
    });
  const baseUrl = new URL(path, window.location.origin);
  for (const definition of definitions) {
    baseUrl.searchParams.set(definition.pageKey, '1');
    baseUrl.searchParams.set(definition.sizeKey, '100');
  }
  const initial = await commerceGet(`${baseUrl.pathname}${baseUrl.search}`);
  const result = { ...initial };
  for (const definition of definitions) {
    const records = [...(initial[definition.key] || [])];
    const pages = Number(initial[definition.metaKey]?.pages) || 1;
    for (let page = 2; page <= pages; page += 1) {
      const pageUrl = new URL(baseUrl);
      pageUrl.searchParams.set(definition.pageKey, String(page));
      const response = await commerceGet(`${pageUrl.pathname}${pageUrl.search}`);
      records.push(...(response[definition.key] || []));
    }
    result[definition.key] = records;
  }
  return result;
}

export function commerceRequest(path, method, body = {}, key = createIdempotencyKey()) {
  return authRequest(`${api}${path}`, method, body, { 'Idempotency-Key': key });
}

export function createIdempotencyKey() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('')}`;
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

export async function downloadStockArchives(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, key === 'largeOnly' ? '1' : String(value));
  }
  const response = await fetch(commercePath(`${api}/owner/inventory/archives.csv?${params}`), {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = 'Could not download the stock archive.';
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
  anchor.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
    || 'aquatica-stock-archive.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
