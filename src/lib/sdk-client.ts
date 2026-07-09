/**
 * SDK client configuration for the Artifact Keeper web frontend.
 *
 * Configures the generated SDK's fetch-based client with:
 * - Cookie-based auth (httpOnly cookies sent via credentials: 'include')
 * - Automatic 401 token refresh with mutex to prevent race conditions
 * - Dynamic baseUrl for remote instance proxy
 * - 403 SETUP_REQUIRED redirect to login
 * - Post-freeze cookie debounce: delays requests after Chrome unfreezes a tab
 *   to allow the cookie store to rehydrate before sending fetch() calls.
 *
 * Import this module (side-effect) before using any SDK functions:
 *   import '@/lib/sdk-client';
 */

import { client } from '@artifact-keeper/sdk/client';

// ---------------------------------------------------------------------------
// Remote instance helpers
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getActiveInstanceBaseUrl(): string {
  if (typeof window === 'undefined') return API_BASE_URL;
  try {
    const activeId = localStorage.getItem('ak_active_instance') || 'local';
    if (activeId === 'local') return API_BASE_URL;
    return `${API_BASE_URL}/api/v1/instances/${encodeURIComponent(activeId)}/proxy`;
  } catch {
    return API_BASE_URL;
  }
}

function isRemoteInstance(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const activeId = localStorage.getItem('ak_active_instance') || 'local';
    return activeId !== 'local';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Post-freeze cookie debounce
// ---------------------------------------------------------------------------
// Chrome freezes background tabs after ~5 min. On unfreeze, the cookie store
// may not be rehydrated yet, so the first fetch() can go out without cookies.
// We detect long hidden periods and delay the next request to give the browser
// time to restore its cookie store.

const COOKIE_REHYDRATE_MS = 500;
const FREEZE_THRESHOLD_MS = 5 * 60 * 1000;

let lastHiddenAt = 0;
let cookieReady: Promise<void> = Promise.resolve();

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
    } else if (document.visibilityState === 'visible' && lastHiddenAt > 0) {
      const idleDuration = Date.now() - lastHiddenAt;
      if (idleDuration > FREEZE_THRESHOLD_MS) {
        cookieReady = new Promise((resolve) => setTimeout(resolve, COOKIE_REHYDRATE_MS));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Configure the global SDK client
// ---------------------------------------------------------------------------

client.setConfig({
  baseUrl: getActiveInstanceBaseUrl(),
  credentials: 'include',
});

// ---------------------------------------------------------------------------
// Request interceptor: cookie debounce + dynamic baseUrl for remote instances
// ---------------------------------------------------------------------------

client.interceptors.request.use(async (request) => {
  if (typeof window !== 'undefined') {
    await cookieReady;
  }

  if (typeof window === 'undefined') return request;
  if (!isRemoteInstance()) return request;

  const base = getActiveInstanceBaseUrl();
  if (!base) return request;

  // For remote instances, prepend the proxy path prefix to the existing URL.
  // Only modify the pathname; never rewrite protocol or host to prevent
  // open redirect attacks via localStorage instance poisoning.
  const url = new URL(request.url);
  const target = new URL(base, window.location.origin);
  url.pathname = target.pathname + url.pathname;

  return new Request(url.toString(), request);
});

// ---------------------------------------------------------------------------
// Token refresh mutex
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

function onTokenRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: () => void) {
  refreshSubscribers.push(cb);
}

// ---------------------------------------------------------------------------
// Response interceptor: 401 refresh + 403 SETUP_REQUIRED
// ---------------------------------------------------------------------------

client.interceptors.response.use(async (response, request) => {
  // --- 403 SETUP_REQUIRED redirect ---
  if (
    response.status === 403 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login') &&
    !window.location.pathname.startsWith('/change-password')
  ) {
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      if (body?.error === 'SETUP_REQUIRED') {
        window.location.href = '/login';
        return response;
      }
    } catch {
      // Not JSON, ignore
    }
  }

  // --- 401 token refresh ---
  if (response.status !== 401 || typeof window === 'undefined') return response;
  if (isRemoteInstance()) return response;

  const url = request.url;
  const isAuthEndpoint =
    url.includes('/auth/me') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/login');
  if (isAuthEndpoint) return response;

  if (isRefreshing) {
    // Another request is already refreshing -- wait for it, then retry
    return new Promise<Response>((resolve) => {
      addRefreshSubscriber(async () => {
        const retried = await fetch(new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.bodyUsed ? undefined : request.body,
          credentials: 'include',
        }));
        resolve(retried);
      });
    });
  }

  isRefreshing = true;

  try {
    const refreshResponse = await fetch(
      `${getActiveInstanceBaseUrl()}/api/v1/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'include',
      }
    );

    if (!refreshResponse.ok) {
      throw new Error('Refresh failed');
    }

    isRefreshing = false;
    onTokenRefreshed();

    // Retry the original request -- cookies are updated by the refresh response
    return fetch(new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.bodyUsed ? undefined : request.body,
      credentials: 'include',
    }));
  } catch {
    isRefreshing = false;
    refreshSubscribers = [];
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return response;
  }
});

export { client };
export { getActiveInstanceBaseUrl };
