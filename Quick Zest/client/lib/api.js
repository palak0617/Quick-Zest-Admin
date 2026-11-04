'use client';

/** Small fetch wrapper: JSON in/out, cookies included, errors thrown with the server's message. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Free hosting (Render) puts the API to sleep when idle; the first request can take ~1 minute.
 * Read-only requests are retried while the server wakes up.
 */
export async function api(path, opts = {}) {
  const method = opts.method || 'GET';
  const tries = method === 'GET' ? 12 : 1;
  for (let i = 1; ; i++) {
    try {
      return await request(path, opts);
    } catch (e) {
      const waking = !e.status || [502, 503, 504].includes(e.status);
      if (!waking || i >= tries) throw e;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('qx-waking'));
      await sleep(5000);
    }
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = '/login';
    }
    throw err;
  }
  return data;
}
