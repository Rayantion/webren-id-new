/* === Config === */
const SUPABASE_URL = 'https://gfcncubcurtnzupycwnf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Okvi7ubVn0xCZ89cS2Qedg_Xzf8AZwF';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const COMMISSION = 0.15;
const MIDTRANS_CLIENT_KEY = 'SB-Mid-client-6vBqP7mKfnRn2nLp';
const SNAP_TOKEN_URL = 'https://n8n.rayantion.me/webhook/create-snap-token';

let currentUser = null;
let userRole = 'client'; // 'client' | 'agent' | 'admin'
let userLang = 'id';
let logoutTimeout = null;

function startLogoutTimeout() {
  clearTimeout(logoutTimeout);
  logoutTimeout = setTimeout(() => { hideLoading(); showScreen('auth'); }, 5000);
}
function showLoading(text) {
  const o = document.getElementById('loading-overlay');
  const t = document.getElementById('loading-text');
  if (o) { if (text) t.textContent = text; o.classList.remove('hidden'); }
}
function hideLoading() {
  clearTimeout(logoutTimeout);
  const o = document.getElementById('loading-overlay');
  if (o) o.classList.add('hidden');
}

/* === i18n === */
const I18N = {
  strings: {},
  async init(lang) {
    userLang = lang || localStorage.getItem('portal_id_lang') || 'id';
    try {
      const res = await fetch('./locales/' + userLang + '.json');
      if (res.ok) this.strings = await res.json(); else throw new Error();
    } catch {
      try {
        const res = await fetch('./locales/id.json');
        if (res.ok) this.strings = await res.json();
      } catch {}
    }
    localStorage.setItem('portal_id_lang', userLang);
    this.apply();
  },
  t(key) {
    const keys = key.split('.');
    let val = this.strings;
    for (const k of keys) { if (val && typeof val === 'object') val = val[k]; }
    return (val != null) ? val : key;
  },
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const txt = this.t(key);
      if (txt !== key) el.textContent = txt;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const txt = this.t(key);
      if (txt !== key) el.placeholder = txt;
    });
  }
};

function fmtRp(amount) { return 'Rp ' + Number(amount).toLocaleString('id-ID'); }
function escHtml(s) { return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* === Password === */
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const btn = document.querySelector(`.toggle-password[data-target="${inputId}"]`);
  if (!input || !btn) return;
  const isPw = input.type === 'password';
  input.type = isPw ? 'text' : 'password';
  btn.querySelector('.eye-icon').textContent = isPw ? '🙈' : '👁';
}

function updatePasswordStrength(password) {
  const segs = document.querySelectorAll('#strength-register .strength-seg');
  const label = document.getElementById('strength-label-reg');
  segs.forEach(s => s.className = 'strength-seg');
  if (!password) { if (label) label.textContent = I18N.t('auth.password_strength') || 'Kekuatan'; return; }
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const level = score <= 2 ? 'weak' : score === 3 ? 'medium' : 'strong';
  const labels = { weak: I18N.t('auth.password_weak') || 'Lemah', medium: I18N.t('auth.password_medium') || 'Sedang', strong: I18N.t('auth.password_strong') || 'Kuat' };
  segs.forEach((s, i) => { if (i < Math.min(score, 4)) setTimeout(() => s.classList.add(level), i * 80); });
  if (label) label.textContent = labels[level] || '';
}

/* === DOM Ready === */
document.addEventListener('DOMContentLoaded', async () => {
  await I18N.init('id');

  // Language pills (auth)
  document.querySelectorAll('#auth-lang-pills .lang-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('#auth-lang-pills .lang-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      await I18N.init(pill.dataset.lang);
    });
  });

  // Language selector (dashboard header)
  const langSelector = document.getElementById('lang-selector');
  const langCurrent = document.getElementById('lang-current');
  if (langCurrent) {
    langCurrent.addEventListener('click', () => langSelector.classList.toggle('open'));
    document.addEventListener('click', e => { if (!langSelector.contains(e.target)) langSelector.classList.remove('open'); });
    langSelector.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', async () => {
        await I18N.init(opt.dataset.lang);
        langSelector.classList.remove('open');
        document.getElementById('lang-current-label').textContent = opt.dataset.lang === 'id' ? 'ID' : 'EN';
        if (currentUser) reloadDashboard();
      });
    });
  }

  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab)));

  // Password toggles
  document.querySelectorAll('.toggle-password').forEach(btn => btn.addEventListener('click', () => togglePassword(btn.dataset.target)));

  // Password strength
  const regPassword = document.getElementById('reg-password');
  if (regPassword) regPassword.addEventListener('input', () => updatePasswordStrength(regPassword.value));

  // Role selector (client vs agent)
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('reg-role').value = btn.dataset.role;
    });
  });

  // Form submissions
  document.getElementById('form-login').addEventListener('submit', handleLogin);
  document.getElementById('form-register').addEventListener('submit', handleRegister);
  document.getElementById('form-forgot').addEventListener('submit', handleForgotPassword);
  document.getElementById('btn-forgot').addEventListener('click', () => showAuthForm('forgot'));
  document.getElementById('btn-back-login-forgot').addEventListener('click', () => showAuthForm('login'));
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Admin email management
  document.getElementById('form-add-allowed-email')?.addEventListener('submit', handleAddAllowedEmail);
  document.getElementById('btn-copy-referral')?.addEventListener('click', handleCopyReferral);

  // Client dashboard: add website modal
  document.getElementById('btn-add-website')?.addEventListener('click', openAddWebsiteModal);
  document.getElementById('btn-close-website-modal')?.addEventListener('click', closeAddWebsiteModal);
  document.getElementById('add-website-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeAddWebsiteModal(); });
  document.getElementById('form-add-website')?.addEventListener('submit', handleAddWebsite);
  document.getElementById('btn-warning-pay')?.addEventListener('click', () => {
    document.querySelector('#payments-tbody')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Auth state
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { currentUser = null; userRole = 'client'; showScreen('auth'); hideLoading(); return; }
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
    if (session && session.user) {
      currentUser = session.user;
      await resolveRole();
      await I18N.init(userLang);
      showScreen('dashboard');
      loadDashboard();
      hideLoading();
    } else {
      currentUser = null; userRole = 'client';
      showScreen('auth'); hideLoading();
    }
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    await resolveRole();
    await I18N.init(userLang);
    showScreen('dashboard');
    loadDashboard();
  } else {
    showScreen('auth');
  }
  hideLoading();
});

/* === Role Detection === */
async function resolveRole() {
  try {
    // Check if user is in agents table
    const { data: agentData } = await sb.from('agents').select('is_admin, full_name, country, lang, commission_balance, referral_code').eq('id', currentUser.id).single();
    if (agentData) {
      userRole = agentData.is_admin ? 'admin' : 'agent';
      if (agentData.lang) userLang = agentData.lang;
      document.getElementById('header-user-name').textContent = agentData.full_name || currentUser.email;

      // Set referral link for agents
      const refLink = document.getElementById('referral-link');
      if (refLink) {
        const code = agentData.referral_code;
        refLink.textContent = code ? location.origin + '?ref=' + code : (I18N.t('agent.no_referral') || 'Belum ada kode referral');
      }
    } else {
      // Must be a client
      userRole = 'client';
      userLang = 'id';
      const { data: clientData } = await sb.from('clients').select('client_name').eq('id', currentUser.id).single();
      document.getElementById('header-user-name').textContent = (clientData && clientData.client_name) || currentUser.email;
    }
  } catch {
    userRole = 'client';
    document.getElementById('header-user-name').textContent = currentUser.email;
  }

  // Set role badge
  const badge = document.getElementById('header-role-badge');
  badge.textContent = userRole.toUpperCase();
  badge.className = 'role-badge ' + userRole;
  document.getElementById('header-user').classList.remove('hidden');
}

/* === Auth Handlers === */
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  btn.disabled = true; btnText.classList.add('hidden'); btnLoader.classList.remove('hidden');
  showMsg('login-error', '');

  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-password').value
  });
  if (error) showMsg('login-error', I18N.t('errors.login_failed') || 'Login gagal');

  btn.disabled = false; btnText.classList.remove('hidden'); btnLoader.classList.add('hidden');
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-register');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  const role = document.getElementById('reg-role').value;
  const email = document.getElementById('reg-email').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const pass = document.getElementById('reg-password').value;

  showMsg('reg-error', '');
  showMsg('reg-success', '');

  // Agent registration: check allowed_emails (ID portal only allows ID-country agents)
  if (role === 'agent') {
    const { data: allowed, error: allowedError } = await sb.from('allowed_emails').select('email, role, country').eq('email', email).eq('country', 'ID').single();
    if (allowedError || !allowed) {
      showMsg('reg-error', I18N.t('errors.email_not_allowed') || 'Email tidak diizinkan untuk mendaftar sebagai agen. Hubungi admin.');
      return;
    }
  }

  btn.disabled = true; btnText.classList.add('hidden'); btnLoader.classList.remove('hidden');

  const { error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { full_name: name, phone, country: 'ID', lang: 'id', role } }
  });

  if (error) {
    showMsg('reg-error', I18N.t('errors.register_failed') || 'Pendaftaran gagal');
  } else {
    showMsg('reg-success', I18N.t('auth.register_success') || 'Pendaftaran berhasil! Periksa email Anda untuk verifikasi.', true);
    document.getElementById('form-register').reset();
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.role-btn[data-role="client"]').classList.add('active');
    document.getElementById('reg-role').value = 'client';
  }

  btn.disabled = false; btnText.classList.remove('hidden'); btnLoader.classList.add('hidden');
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-forgot-submit');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  btn.disabled = true; btnText.classList.add('hidden'); btnLoader.classList.remove('hidden');
  showMsg('forgot-error', ''); showMsg('forgot-success', '');

  const email = document.getElementById('forgot-email').value.trim();
  try {
    const res = await fetch('https://gfcncubcurtnzupycwnf.supabase.co/functions/v1/reset-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, lang: userLang }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showMsg('forgot-success', I18N.t('auth.reset_sent') || 'Link reset telah dikirim ke email Anda.', true);
    } else {
      showMsg('forgot-error', data.error || I18N.t('errors.reset_failed') || 'Gagal mengirim link reset.');
    }
  } catch {
    showMsg('forgot-error', I18N.t('errors.service_unavailable') || 'Layanan tidak tersedia. Coba lagi nanti.');
  }

  btn.disabled = false; btnText.classList.remove('hidden'); btnLoader.classList.add('hidden');
}

async function handleLogout() {
  showLoading(I18N.t('auth.logging_out') || 'Keluar...');
  startLogoutTimeout();
  try { await sb.auth.signOut(); } catch {}
  hideLoading();
}

/* === Screen Management === */
function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('hidden', name !== 'auth');
  document.getElementById('dashboard-screen').classList.toggle('hidden', name !== 'dashboard');
  document.querySelector('.header')?.classList.toggle('hidden', name === 'auth');
  if (name === 'dashboard') showRoleDashboard();
}

function showRoleDashboard() {
  document.getElementById('client-dashboard').classList.toggle('hidden', userRole !== 'client');
  document.getElementById('agent-dashboard').classList.toggle('hidden', userRole !== 'agent');
  document.getElementById('admin-dashboard').classList.toggle('hidden', userRole !== 'admin');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  showAuthForm(tab);
}

function showAuthForm(name) {
  ['login', 'register', 'forgot'].forEach(f => {
    const form = document.getElementById('form-' + f);
    if (form) form.classList.toggle('hidden', f !== name);
  });
  if (name === 'forgot') document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
}

/* === Dashboard Loading === */
async function loadDashboard() {
  showRoleDashboard();
  if (userRole === 'client') await loadClientDashboard();
  else if (userRole === 'agent') await loadAgentDashboard();
  else if (userRole === 'admin') await loadAdminDashboard();
}
async function reloadDashboard() { await loadDashboard(); }

/* === Helper: create table cell safely === */
function td(text) {
  const cell = document.createElement('td');
  cell.textContent = text != null ? text : '—';
  return cell;
}

function tdBadge(text, statusClass) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'status-badge status-' + statusClass;
  badge.textContent = text;
  cell.appendChild(badge);
  return cell;
}

// --- Client Dashboard ---
async function loadClientDashboard() {
  await Promise.all([loadClientWebsites(), loadClientPayments()]);
  checkPaymentDueSoon();
}

async function loadClientWebsites() {
  const tbody = document.getElementById('websites-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 5; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const { data, error } = await sb.from('websites').select('*').eq('client_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    renderClientWebsites(data || []);
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 5; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderClientWebsites(websites) {
  const tbody = document.getElementById('websites-tbody');
  const statWebsites = document.getElementById('stat-websites');
  statWebsites.textContent = websites.length;
  tbody.textContent = '';

  if (!websites.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5; cell.className = 'empty-row';
    cell.textContent = I18N.t('client.no_websites') || 'Belum ada website';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const statusLabels = { active: I18N.t('status.active') || 'Aktif', on_hold: I18N.t('status.on_hold') || 'Ditangguhkan', cancelled: I18N.t('status.cancelled') || 'Dibatalkan', building: I18N.t('status.building') || 'Dibangun' };

  websites.forEach(w => {
    const tr = document.createElement('tr');
    tr.appendChild(td(w.name));
    tr.appendChild(td(w.product_type));
    tr.appendChild(tdBadge(statusLabels[w.status] || w.status, w.status));
    tr.appendChild(td(w.domain));
    // Find next due date for this website from payments
    const dueDate = w._nextDueDate || null;
    const dueDateText = dueDate ? new Date(dueDate).toLocaleDateString('id-ID') : '—';
    const dueCell = document.createElement('td');
    if (dueDate) {
      const daysLeft = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft >= 0) {
        dueCell.style.color = 'var(--accent-amber)';
        dueCell.style.fontWeight = '600';
      }
      dueCell.textContent = dueDateText;
    } else {
      dueCell.textContent = '—';
    }
    tr.appendChild(dueCell);
    tbody.appendChild(tr);
  });
}

async function loadClientPayments() {
  const tbody = document.getElementById('payments-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 6; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    // Fetch payments with website name
    const { data, error } = await sb.from('payments').select('*, websites(name)').eq('client_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    const payments = data || [];

    // Enrich websites with next due dates
    const paidPayments = payments.filter(p => p.status === 'paid' && p.next_due_date);
    const websiteDueMap = {};
    paidPayments.forEach(p => {
      if (p.website_id && (!websiteDueMap[p.website_id] || p.next_due_date > websiteDueMap[p.website_id])) {
        websiteDueMap[p.website_id] = p.next_due_date;
      }
    });
    // Update website rows with due dates (called after websites render)
    if (Object.keys(websiteDueMap).length) {
      const rows = document.querySelectorAll('#websites-tbody tr');
      rows.forEach(row => {
        // We'll set _nextDueDate on website data during next render cycle
      });
    }

    renderClientPayments(payments);

    // Also update website due dates if websites are loaded
    try {
      const { data: websites } = await sb.from('websites').select('*').eq('client_id', currentUser.id).order('created_at', { ascending: false });
      if (websites) {
        websites.forEach(w => { w._nextDueDate = websiteDueMap[w.id] || null; });
        renderClientWebsitesWithDueDates(websites, websiteDueMap);
      }
    } catch {}
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 6; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderClientWebsitesWithDueDates(websites, dueMap) {
  const statusLabels = { active: I18N.t('status.active') || 'Aktif', on_hold: I18N.t('status.on_hold') || 'Ditangguhkan', cancelled: I18N.t('status.cancelled') || 'Dibatalkan', building: I18N.t('status.building') || 'Dibangun' };
  const tbody = document.getElementById('websites-tbody');
  tbody.textContent = '';

  if (!websites.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5; cell.className = 'empty-row';
    cell.textContent = I18N.t('client.no_websites') || 'Belum ada website';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  websites.forEach(w => {
    const tr = document.createElement('tr');
    tr.appendChild(td(w.name));
    tr.appendChild(td(w.product_type));
    tr.appendChild(tdBadge(statusLabels[w.status] || w.status, w.status));
    tr.appendChild(td(w.domain));
    const dueDate = dueMap[w.id] || null;
    const dueCell = document.createElement('td');
    if (dueDate) {
      const daysLeft = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft >= 0) {
        dueCell.style.color = 'var(--accent-amber)';
        dueCell.style.fontWeight = '600';
      }
      dueCell.textContent = new Date(dueDate).toLocaleDateString('id-ID');
    } else {
      dueCell.textContent = '—';
    }
    tr.appendChild(dueCell);
    tbody.appendChild(tr);
  });
}

function renderClientPayments(payments) {
  const tbody = document.getElementById('payments-tbody');
  tbody.textContent = '';

  if (!payments.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6; cell.className = 'empty-row';
    cell.textContent = I18N.t('client.no_payments') || 'Belum ada pembayaran';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  let totalPaid = 0;
  let nextDue = null;
  const statusLabels = { pending: I18N.t('status.pending') || 'Tertunda', paid: I18N.t('status.paid') || 'Dibayar', failed: I18N.t('status.failed') || 'Gagal', expired: I18N.t('status.expired') || 'Kedaluwarsa', refunded: I18N.t('status.refunded') || 'Dikembalikan' };

  payments.forEach(p => {
    if (p.status === 'paid') totalPaid += Number(p.amount);
    if (p.status === 'paid' && p.next_due_date && (!nextDue || p.next_due_date < nextDue)) nextDue = p.next_due_date;
    const tr = document.createElement('tr');
    const websiteName = (p.websites && p.websites.name) || '—';
    tr.appendChild(td(websiteName));
    tr.appendChild(td(fmtRp(p.amount)));
    tr.appendChild(td(p.billing_cycle_months + ' bulan'));
    tr.appendChild(td(p.payment_method || 'manual'));
    tr.appendChild(tdBadge(statusLabels[p.status] || p.status, p.status));
    // Action cell: Pay Now for pending payments
    const tdAction = document.createElement('td');
    if (p.status === 'pending') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-pay-now';
      btn.textContent = I18N.t('client.pay_now') || 'Bayar Sekarang';
      btn.dataset.paymentId = p.id;
      btn.dataset.amount = p.amount;
      btn.dataset.websiteId = p.website_id || '';
      btn.addEventListener('click', () => handlePayNow(p.id, p.amount, p.website_id));
      tdAction.appendChild(btn);
    } else {
      tdAction.textContent = '—';
    }
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
  document.getElementById('stat-total-paid').textContent = fmtRp(totalPaid);
  document.getElementById('stat-due').textContent = nextDue ? new Date(nextDue).toLocaleDateString('id-ID') : '—';
}

// Check if any payment is due within 7 days and show banner
function checkPaymentDueSoon() {
  const banner = document.getElementById('payment-warning-banner');
  const warningText = document.getElementById('warning-text');
  if (!banner) return;

  // Query payments with upcoming due dates
  sb.from('payments').select('next_due_date, websites(name)').eq('client_id', currentUser.id).eq('status', 'paid').not('next_due_date', 'is', null).order('next_due_date')
    .then(({ data }) => {
      if (!data || !data.length) { banner.classList.add('hidden'); return; }
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const upcoming = data.filter(p => {
        const due = new Date(p.next_due_date);
        return due >= now && due <= sevenDaysFromNow;
      });
      if (upcoming.length) {
        const firstDue = new Date(upcoming[0].next_due_date);
        const daysLeft = Math.ceil((firstDue - now) / (1000 * 60 * 60 * 24));
        const webName = (upcoming[0].websites && upcoming[0].websites.name) || '';
        warningText.textContent = (I18N.t('client.payment_due_soon') || 'Pembayaran jatuh tempo dalam {n} hari!') +
          (webName ? ' (' + webName + ')' : '') +
          ' — ' + daysLeft + ' ' + (I18N.t('client.days_left') || 'hari lagi');
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    })
    .catch(() => banner.classList.add('hidden'));
}

// Pay Now handler — Midtrans Snap integration via n8n proxy
async function handlePayNow(paymentId, amount, websiteId) {
  try {
    showLoading(I18N.t('loading'));

    // Call n8n webhook proxy to create Snap token (no JWT needed)
    const res = await fetch(SNAP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: paymentId,
        website_id: websiteId || '',
        amount: amount,
        client_name: currentUser?.user_metadata?.full_name || '',
        client_email: currentUser?.email || '',
        is_subscription: true,
      }),
    });

    hideLoading();

    if (!res.ok) {
      let msg = 'Failed to create payment token';
      try { const err = await res.json(); msg = err.error || err.message || msg; } catch {}
      throw new Error(msg);
    }

    const { snap_token, order_id } = await res.json();

    if (!snap_token) throw new Error('No snap token received');

    // Store midtrans_order_id on the payment for webhook matching
    await sb.from('payments').update({ midtrans_order_id: order_id }).eq('id', paymentId);

    // Open Midtrans Snap popup
    window.snap.pay(snap_token, {
      onSuccess: function(result) {
        showToast(I18N.t('client.payment_recorded') || 'Payment recorded! Verifying...', 'success');
        setTimeout(() => loadClientDashboard(), 2000);
      },
      onPending: function(result) {
        showToast(I18N.t('client.payment_pending') || 'Payment pending. Complete your payment.', 'success');
        loadClientDashboard();
      },
      onError: function(result) {
        showToast(I18N.t('client.payment_failed') || 'Payment failed. Please try again.', 'error');
        loadClientDashboard();
      },
      onClose: function() {
        showToast(I18N.t('client.payment_closed') || 'Payment popup closed.', 'error');
      },
    });
  } catch (err) {
    hideLoading();
    showToast(I18N.t('toast.error') || 'Error: ' + err.message, 'error');
  }
}

// Add Website Modal
function openAddWebsiteModal() {
  document.getElementById('add-website-overlay').classList.remove('hidden');
  document.getElementById('website-name').focus();
}

function closeAddWebsiteModal() {
  document.getElementById('add-website-overlay').classList.add('hidden');
  document.getElementById('form-add-website').reset();
  showMsg('add-website-error', '');
}

async function handleAddWebsite(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-website');
  btn.disabled = true;
  showMsg('add-website-error', '');

  const name = document.getElementById('website-name').value.trim();
  const about = document.getElementById('website-about').value.trim();
  const productType = document.getElementById('website-product').value;
  const domain = document.getElementById('website-domain').value.trim();

  if (!name) {
    showMsg('add-website-error', I18N.t('client.name_required') || 'Nama website wajib diisi');
    btn.disabled = false;
    return;
  }

  try {
    const { error } = await sb.from('websites').insert({
      client_id: currentUser.id,
      name,
      about: about || null,
      product_type: productType,
      domain: domain || null,
      status: 'building'
    });
    if (error) throw error;
    closeAddWebsiteModal();
    showToast(I18N.t('client.website_requested') || 'Permintaan website dikirim!');
    loadClientDashboard();
  } catch (err) {
    showMsg('add-website-error', I18N.t('client.website_failed') || 'Gagal: ' + err.message);
  }
  btn.disabled = false;
}

// --- Agent Dashboard ---
async function loadAgentDashboard() {
  await Promise.all([loadAgentClients(), loadAgentCommissions(), loadAgentBalance()]);
}

async function loadAgentBalance() {
  try {
    const { data } = await sb.from('agents').select('commission_balance, referral_code').eq('id', currentUser.id).single();
    if (data) {
      document.getElementById('stat-agent-balance').textContent = fmtRp(data.commission_balance || 0);
      const refLink = document.getElementById('referral-link');
      if (refLink) refLink.textContent = data.referral_code ? location.origin + '?ref=' + data.referral_code : (I18N.t('agent.no_referral') || 'Belum ada kode referral');
    }
  } catch {}
}

async function loadAgentClients() {
  const tbody = document.getElementById('agent-clients-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 5; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const { data, error } = await sb.from('clients').select('*').eq('agent_id', currentUser.id).eq('country', 'ID').order('created_at', { ascending: false });
    if (error) throw error;
    document.getElementById('stat-agent-clients').textContent = (data || []).length;
    renderAgentClients(data || []);
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 5; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderAgentClients(clients) {
  const tbody = document.getElementById('agent-clients-tbody');
  tbody.textContent = '';

  if (!clients.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5; cell.className = 'empty-row';
    cell.textContent = I18N.t('agent.no_clients') || 'Belum ada klien';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  let totalEarned = 0;
  const statusLabels = { new: I18N.t('status.new') || 'Baru', active: I18N.t('status.active') || 'Aktif', on_hold: I18N.t('status.on_hold') || 'Ditangguhkan', cancelled: I18N.t('status.cancelled') || 'Dibatalkan' };

  clients.forEach(c => {
    const fee = Number(c.monthly_fee) || 0;
    const comm = fee * COMMISSION;
    if (c.status === 'active') totalEarned += comm;
    const tr = document.createElement('tr');
    tr.appendChild(td(c.client_name));
    tr.appendChild(td(c.plan));
    tr.appendChild(td(fmtRp(fee)));
    tr.appendChild(td(fmtRp(comm)));
    tr.appendChild(tdBadge(statusLabels[c.status] || c.status, c.status));
    tbody.appendChild(tr);
  });
  document.getElementById('stat-agent-earned').textContent = fmtRp(totalEarned);
}

async function loadAgentCommissions() {
  const tbody = document.getElementById('commissions-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 4; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const { data, error } = await sb.from('commissions').select('*').eq('agent_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    renderAgentCommissions(data || []);
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 4; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderAgentCommissions(commissions) {
  const tbody = document.getElementById('commissions-tbody');
  tbody.textContent = '';

  if (!commissions.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4; cell.className = 'empty-row';
    cell.textContent = I18N.t('agent.no_commissions') || 'Belum ada komisi';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const statusLabels = { pending: I18N.t('status.pending') || 'Tertunda', approved: I18N.t('status.approved') || 'Disetujui', paid: I18N.t('status.paid') || 'Dibayar', cancelled: I18N.t('status.cancelled') || 'Dibatalkan' };

  commissions.forEach(c => {
    const date = new Date(c.created_at).toLocaleDateString('id-ID');
    const tr = document.createElement('tr');
    tr.appendChild(td(date));
    tr.appendChild(td('—')); // client name placeholder
    tr.appendChild(td(fmtRp(c.commission_amount)));
    tr.appendChild(tdBadge(statusLabels[c.status] || c.status, c.status));
    tbody.appendChild(tr);
  });
}

function handleCopyReferral() {
  const code = document.getElementById('referral-link').textContent;
  navigator.clipboard.writeText(code).then(() => showToast(I18N.t('agent.copied') || 'Disalin!'));
}

// --- Admin Dashboard ---
async function loadAdminDashboard() {
  await Promise.all([loadAdminClients(), loadAdminEmails(), loadAdminStats()]);
}

async function loadAdminStats() {
  try {
    const { count: clientCount } = await sb.from('clients').select('*', { count: 'exact', head: true }).eq('country', 'ID');
    const { count: agentCount } = await sb.from('agents').select('*', { count: 'exact', head: true });
    const { data: paidInvoices } = await sb.from('invoices').select('amount').eq('status', 'paid').eq('country', 'ID');
    const revenue = (paidInvoices || []).reduce((s, r) => s + Number(r.amount), 0);
    document.getElementById('stat-admin-clients').textContent = clientCount || 0;
    document.getElementById('stat-admin-agents').textContent = agentCount || 0;
    document.getElementById('stat-admin-revenue').textContent = fmtRp(revenue);
  } catch {}
}

async function loadAdminClients() {
  const tbody = document.getElementById('admin-clients-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 5; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const { data, error } = await sb.from('clients').select('*, agents(full_name)').eq('country', 'ID').order('created_at', { ascending: false });
    if (error) throw error;
    renderAdminClients(data || []);
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 5; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderAdminClients(clients) {
  const tbody = document.getElementById('admin-clients-tbody');
  tbody.textContent = '';

  if (!clients.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5; cell.className = 'empty-row';
    cell.textContent = I18N.t('admin.no_clients') || 'Tidak ada klien';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const statusLabels = { new: I18N.t('status.new') || 'Baru', active: I18N.t('status.active') || 'Aktif', on_hold: I18N.t('status.on_hold') || 'Ditangguhkan', cancelled: I18N.t('status.cancelled') || 'Dibatalkan' };
  const statusOptions = ['new', 'active', 'on_hold', 'cancelled'];

  clients.forEach(c => {
    const tr = document.createElement('tr');
    const agent = (c.agents && c.agents.full_name) || null;
    tr.appendChild(td(c.client_name));
    tr.appendChild(td(c.client_email || c.email));
    tr.appendChild(td(agent));
    tr.appendChild(td(c.plan));

    // Combined status badge + dropdown in one cell
    const tdStatus = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status-select status-' + c.status;
    statusOptions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = statusLabels[s] || s;
      if (s === c.status) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function() {
      this.className = 'status-select status-' + this.value;
      updateClientStatus(c.id, this.value);
    });
    tdStatus.appendChild(select);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
  });
}

async function updateClientStatus(id, status) {
  try {
    const { error } = await sb.from('clients').update({ status }).eq('id', id);
    if (error) throw error;
    showToast(I18N.t('toast.status_updated') || 'Status diperbarui');
    loadAdminClients();
  } catch { showToast(I18N.t('toast.error') || 'Error'); }
}

async function loadAdminEmails() {
  const tbody = document.getElementById('admin-emails-tbody');
  tbody.textContent = '';
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 4; loadingCell.className = 'empty-row';
  loadingCell.textContent = I18N.t('loading');
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const { data, error } = await sb.from('allowed_emails').select('*').eq('country', 'ID').order('created_at', { ascending: false });
    if (error) throw error;
    renderAdminEmails(data || []);
  } catch (err) {
    tbody.textContent = '';
    const errRow = document.createElement('tr');
    const errCell = document.createElement('td');
    errCell.colSpan = 4; errCell.className = 'empty-row';
    errCell.textContent = 'Error: ' + err.message;
    errRow.appendChild(errCell);
    tbody.appendChild(errRow);
  }
}

function renderAdminEmails(emails) {
  const tbody = document.getElementById('admin-emails-tbody');
  tbody.textContent = '';

  if (!emails.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4; cell.className = 'empty-row';
    cell.textContent = I18N.t('admin.no_emails') || 'Tidak ada email';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  emails.forEach(e => {
    const tr = document.createElement('tr');
    const tdEmail = document.createElement('td');
    tdEmail.textContent = e.email;
    const tdRole = document.createElement('td');
    const roleBadge = document.createElement('span');
    const isAdmin = e.role === 'admin' || e.is_admin;
    roleBadge.className = 'status-badge ' + (isAdmin ? 'status-active' : 'status-new');
    roleBadge.textContent = isAdmin ? 'Admin' : I18N.t('status.agent') || 'Agen';
    tdRole.appendChild(roleBadge);
    const tdDate = document.createElement('td');
    tdDate.textContent = e.created_at ? new Date(e.created_at).toLocaleDateString('id-ID') : '—';
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-remove';
    btn.textContent = I18N.t('admin.remove') || 'Hapus';
    btn.addEventListener('click', () => removeAllowedEmail(e.email));
    tdBtn.appendChild(btn);
    tr.appendChild(tdEmail); tr.appendChild(tdRole); tr.appendChild(tdDate); tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  });
}

async function handleAddAllowedEmail(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  showMsg('admin-email-error', '');
  const email = document.getElementById('admin-email-input').value.trim();
  const isAdminEmail = document.getElementById('admin-email-is-admin').checked;
  if (!email) { showMsg('admin-email-error', 'Masukkan email'); btn.disabled = false; return; }
  try {
    const { error } = await sb.from('allowed_emails').insert({ email, country: 'ID', is_admin: isAdminEmail, is_paid: true, role: isAdminEmail ? 'admin' : 'agent' });
    if (error) throw error;
    document.getElementById('admin-email-input').value = '';
    document.getElementById('admin-email-is-admin').checked = false;
    showToast(I18N.t('admin.email_added') || 'Email ditambahkan');
    loadAdminEmails();
  } catch { showMsg('admin-email-error', I18N.t('admin.email_failed') || 'Gagal menambahkan email'); }
  btn.disabled = false;
}

async function removeAllowedEmail(email) {
  if (!confirm(I18N.t('admin.confirm_remove') || 'Hapus email ini?')) return;
  try {
    const { error } = await sb.from('allowed_emails').delete().eq('email', email);
    if (error) throw error;
    showToast(I18N.t('admin.email_removed') || 'Email dihapus');
    loadAdminEmails();
  } catch { showToast(I18N.t('admin.email_failed') || 'Gagal menghapus'); }
}

/* === Helpers === */
function showMsg(id, msg, success) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('form-success', !!success);
  el.classList.toggle('form-error', !success);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'success', 'error');
  if (type) t.classList.add(type);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 4000);
}