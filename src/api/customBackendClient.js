/**
 * HTTP client pour le backend Green Market custom.
 * Remplace progressivement base44Client pour les appels API.
 *
 * Sécurité C3 :
 *   - Access token stocké EN MÉMOIRE uniquement (pas de localStorage)
 *   - Refresh token dans un cookie httpOnly géré par le serveur
 *
 * Sécurité M4 :
 *   - Mutex sur le refresh : si plusieurs requêtes reçoivent 401 simultanément,
 *     une seule tentative de refresh est faite, les autres attendent le résultat.
 */

import { mockProducts } from '@/data/mockProducts';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

// C3 — access token en mémoire (inaccessible depuis le DOM, résistant au XSS)
let _accessToken = null;

export const tokenStore = {
  getAccess: () => _accessToken,
  setAccess: (token) => { _accessToken = token; },
  clear: () => { _accessToken = null; },
};

// M4 — mutex de refresh : évite les appels concurrents au endpoint /auth/refresh
let _refreshPromise = null;

async function refreshAccessToken() {
  // Si un refresh est déjà en cours, réutiliser la même promesse
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // le cookie httpOnly refresh_token est envoyé automatiquement
      });
      if (!res.ok) return false;
      const { data } = await res.json();
      tokenStore.setAccess(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null; // libère le verrou dans tous les cas
    }
  })();

  return _refreshPromise;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function request(path, options = {}, retry = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = tokenStore.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // toujours envoyer les cookies httpOnly
  });

  // Auto-refresh sur 401 (token expiré) — une seule tentative grâce au mutex
  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request(path, options, false);
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    return null;
  }

  const json = await res.json().catch(() => ({ success: false, message: 'Invalid response' }));

  if (!res.ok) {
    const err = new Error(json.message ?? 'Request failed');
    err.status = res.status;
    err.errors = json.errors;
    throw err;
  }

  return json;
}

// ── Auth API ──────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: async (email, password) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // C3 — seul l'access token est dans le body, le refresh est dans le cookie httpOnly
    tokenStore.setAccess(res.data.accessToken);
    return res.data.user;
  },

  logout: async () => {
    await request('/auth/logout', { method: 'POST' }).catch(() => {});
    tokenStore.clear();
    // Le cookie httpOnly est effacé par le serveur via res.clearCookie()
  },

  me: () => request('/auth/me'),

  // Tentative de restauration de session au démarrage de l'app
  // (le cookie refresh_token persiste entre les sessions)
  restoreSession: async () => {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    return request('/auth/me');
  },
};

// ── Products API ──────────────────────────────────────────────────────────────
export const productsApi = {
  list: async (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
    ).toString();
    try {
      const res = await request(`/products${qs ? `?${qs}` : ''}`);
      if (res?.data?.length) return res;
    } catch {
      // backend unavailable — use mock data
    }
    const limit = params.limit ?? 100;
    return { data: mockProducts.filter(p => p.isActive).slice(0, limit) };
  },
  get: async (id) => {
    try {
      const res = await request(`/products/${id}`);
      if (res?.data) return res;
    } catch {
      // backend unavailable — use mock data
    }
    const product = mockProducts.find(p => p.id === id);
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    return { data: product };
  },
  create: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  updateStock: (id, data) =>
    request(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Orders API ────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/orders${qs ? `?${qs}` : ''}`);
  },
  get: (id) => request(`/orders/${id}`),
  create: (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  pay: (id) => request(`/orders/${id}/pay`, { method: 'POST' }),
  updateStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// ── Subscriptions API ─────────────────────────────────────────────────────────
export const subscriptionsApi = {
  getMy: () => request('/subscriptions/my'),
  checkout: (plan) =>
    request('/subscriptions/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
};

// ── Admin API ─────────────────────────────────────────────────────────────────
export const adminApi = {
  stats: () => request('/admin/stats'),
  users: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/users${qs ? `?${qs}` : ''}`);
  },
};
