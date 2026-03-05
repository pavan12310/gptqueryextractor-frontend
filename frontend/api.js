// frontend/api.js — connects frontend to backend on Render
const API_URL = 'https://gptqueryextractor-backend.onrender.com/api';

const Auth = {
  getToken:   () => localStorage.getItem('gqe_token'),
  getUser:    () => JSON.parse(localStorage.getItem('gqe_user') || 'null'),
  setSession: (token, user) => {
    localStorage.setItem('gqe_token', token);
    localStorage.setItem('gqe_user', JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem('gqe_token');
    localStorage.removeItem('gqe_user');
  },
  isLoggedIn: () => !!localStorage.getItem('gqe_token'),
  redirectIfNotLoggedIn: () => {
    if (!localStorage.getItem('gqe_token')) {
      window.location.href = 'login.html';
    }
  }
};

const api = async (endpoint, options = {}) => {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (res.status === 401) { Auth.clear(); window.location.href = 'login.html'; return; }
    return { ok: res.ok, status: res.status, ...data };
  } catch (err) {
    console.error('API Error:', err);
    return { ok: false, message: 'Network error. Please check your connection.' };
  }
};

const AuthAPI = {
  signup: async (name, email, password) => {
    const res = await api('/auth/signup', { method: 'POST', body: { name, email, password } });
    if (res && res.ok) Auth.setSession(res.token, res.user);
    return res;
  },
  login: async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (res && res.ok) Auth.setSession(res.token, res.user);
    return res;
  },
  logout: () => { Auth.clear(); window.location.href = 'index.html'; },
  getMe:  () => api('/auth/me'),
  updateSettings: (s) => api('/auth/settings', { method: 'PUT', body: s }),
  forgotPassword: (email) => api('/auth/forgot-password', { method: 'POST', body: { email } })
};

const DashboardAPI = {
  getStats:  () => api('/dashboard/stats'),
  getRecent: () => api('/dashboard/recent')
};

const SessionsAPI = {
  getAll:       (p=1, l=20) => api(`/sessions?page=${p}&limit=${l}`),
  getOne:       (id) => api(`/sessions/${id}`),
  create:       (name, prompts, delay) => api('/sessions', { method: 'POST', body: { name, prompts, delaySeconds: delay } }),
  saveResult:   (id, idx, queries) => api(`/sessions/${id}/result`, { method: 'PUT', body: { promptIndex: idx, queries } }),
  updateStatus: (id, status) => api(`/sessions/${id}/status`, { method: 'PUT', body: { status } }),
  exportSession:(id, format) => api(`/sessions/${id}/export`, { method: 'POST', body: { format } }),
  delete:       (id) => api(`/sessions/${id}`, { method: 'DELETE' })
};

const ContactAPI = {
  submit: (firstName, lastName, email, subject, message) =>
    api('/contact', { method: 'POST', body: { firstName, lastName, email, subject, message } })
};

const UI = {
  showToast: (message, type = 'success') => {
    const old = document.getElementById('api-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'api-toast';
    t.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(60px);
      background:${type==='success'?'#00c27a':'#f85149'};
      color:${type==='success'?'#000':'#fff'};
      font-family:'Space Mono',monospace;font-size:12px;font-weight:700;
      padding:10px 24px;border-radius:20px;z-index:99999;
      transition:transform 0.25s;pointer-events:none;
      box-shadow:0 4px 20px rgba(0,0,0,0.3);
    `;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.style.transform = 'translateX(-50%) translateY(0)', 10);
    setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(60px)'; setTimeout(()=>t.remove(),300); }, 3500);
  }
};
