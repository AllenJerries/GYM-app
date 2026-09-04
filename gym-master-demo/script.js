// ======================== DATA LAYER ========================
const STORAGE_KEY = 'gymmaster_data';
let DB = { members: [], plans: [], offers: [], payments: [], settings: {} };

function saveDB() { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
function loadDB() {
  const d = localStorage.getItem(STORAGE_KEY);
  if (d) { DB = JSON.parse(d); return true; }
  return false;
}
function resetDB() { localStorage.removeItem(STORAGE_KEY); DB = { members: [], plans: [], offers: [], payments: [], settings: {} }; }

// ======================== UTILITIES ========================
function genId(prefix) {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return prefix + '-' + n;
}
function normalizePhone(p) {
  if (!p) return '';
  return p.replace(/[\s\-\(\)\+]/g, '').replace(/^91/, '');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
}
function fmtMoney(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}
function today() { return new Date().toISOString().split('T')[0]; }
function daysBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return Math.ceil((db - da) / (1000 * 60 * 60 * 24));
}
function addDuration(dateStr, amount, unit) {
  const d = new Date(dateStr);
  if (unit === 'Days') d.setDate(d.getDate() + amount);
  else if (unit === 'Months') d.setMonth(d.getMonth() + amount);
  else if (unit === 'Years') d.setFullYear(d.getFullYear() + amount);
  return d.toISOString().split('T')[0];
}
function getExpiryStatus(expiryDate) {
  const t = new Date(); t.setHours(0,0,0,0);
  const e = new Date(expiryDate); e.setHours(0,0,0,0);
  const diff = Math.ceil((e - t) / (1000*60*60*24));
  if (diff < 0) return 'expired';
  if (diff === 0) return 'expiring-today';
  if (diff <= 3) return 'expiring-3';
  if (diff <= 7) return 'expiring-7';
  return 'active';
}
function isMembershipFrozen(mem) {
  if (!mem || !mem.freezeHistory) return false;
  const now = new Date(); now.setHours(0,0,0,0);
  return mem.freezeHistory.some(f => {
    const s = new Date(f.start); s.setHours(0,0,0,0);
    const e = new Date(f.end); e.setHours(0,0,0,0);
    return now >= s && now <= e;
  });
}
function getTotalPaid(member) {
  return DB.payments.filter(p => p.memberId === member.id && (p.status === 'paid' || p.status === 'partial')).reduce((s, p) => s + (p.amount || 0), 0);
}
function recomputePaymentStatus(membership) {
  const total = getTotalPaid({ id: membership.memberId });
  const mem = DB.members.find(m => m.id === membership.memberId);
  const paid = DB.payments.filter(p => p.memberId === membership.memberId && p.membershipId === membership.id).reduce((s, p) => s + (p.amount || 0), 0);
  const final = membership.finalPrice;
  if (paid >= final) membership.paymentStatus = 'paid';
  else if (paid > 0) membership.paymentStatus = 'partial';
  else membership.paymentStatus = 'pending';
}
function getPaymentStatus(membership) {
  return membership ? membership.paymentStatus : 'pending';
}
function getMemberStatus(member) {
  if (member.status === 'discontinued') return 'discontinued';
  const mem = getActiveMembership(member);
  if (!mem) return 'pending';
  const base = getExpiryStatus(mem.expiryDate);
  if (mem.status === 'discontinued' || mem.status === 'stopped') return 'discontinued';
  if (isMembershipFrozen(mem)) return 'frozen';
  if (base === 'expired') return 'expired';
  const ps = mem.paymentStatus;
  if (ps === 'pending' || ps === 'partial') return ps;
  return base;
}
function getStatusLabel(s) {
  const map = {
    'active':'🟢 Active', 'expiring-today':'🟠 Expiring Today', 'expiring-3':'🟠 Expiring Soon',
    'expiring-7':'🟠 Expiring Soon', 'expired':'🔴 Expired', 'discontinued':'⚫ Discontinued',
    'frozen':'⏸️ Frozen', 'pending':'🟡 Pending Payment', 'partial':'🟡 Partially Paid'
  };
  return map[s] || s;
}
function getStatusClass(s) {
  if (s === 'active' || s === 'expiring-7') return 'status-active';
  if (s === 'expiring-today' || s === 'expiring-3') return 'status-expiring';
  if (s === 'expired') return 'status-expired';
  if (s === 'pending') return 'status-pending';
  if (s === 'partial') return 'status-partial';
  if (s === 'frozen') return 'status-frozen';
  if (s === 'discontinued') return 'status-discontinued';
  return 'status-active';
}
function paymentLabel(s) {
  if (s === 'paid') return 'Paid';
  if (s === 'partial') return 'Partially Paid';
  if (s === 'pending') return 'Pending';
  return s || '—';
}
function avatarHtml(member, size) {
  const s = size || '40px';
  if (member.photo) return `<div class="member-photo" style="width:${s};height:${s};background-image:url('${member.photo}')"></div>`;
  return `<div class="member-avatar" style="width:${s};height:${s};font-size:${parseInt(s)/2.6}px">${memberInitials(member.name)}</div>`;
}
function memberInitials(name) {
  return name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ======================== TOAST / CONFIRM ========================
function showToast(msg, type) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
let confirmCb = null;
function showConfirm(title, msg, btnText, icon, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = msg;
  document.getElementById('confirm-btn').textContent = btnText || 'Confirm';
  document.getElementById('confirm-icon').textContent = icon || '⚠️';
  confirmCb = cb;
  document.getElementById('confirm-btn').onclick = function() { closeConfirm(); if (confirmCb) confirmCb(); };
  document.getElementById('confirm-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}
function closeConfirm() { document.getElementById('confirm-modal').style.display = 'none'; confirmCb = null; releaseBodyScroll(); }

// ======================== MODALS ========================
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  releaseBodyScroll();
}
function openMoreSheet() {
  document.getElementById('more-sheet').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}
function closeSheet(id) {
  document.getElementById(id).style.display = 'none';
  releaseBodyScroll();
}
function releaseBodyScroll() {
  const anyOpen = document.querySelector('.modal-overlay[style*="flex"], .sheet-overlay[style*="flex"]');
  if (!anyOpen) {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }
}

// ======================== LOGIN ========================
function getSettings() { if (!DB.settings) DB.settings = {}; return DB.settings; }
function requiresPin() { return !!(getSettings().pin); }
function handleLogin(e) {
  e.preventDefault();
  if (requiresPin()) {
    const pin = document.getElementById('login-pin').value;
    if (pin !== getSettings().pin) { showToast('Incorrect PIN', 'error'); return false; }
  }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  renderDashboard();
  return false;
}
function showLogin() {
  const pinReq = requiresPin();
  document.getElementById('login-pin-group').style.display = pinReq ? 'block' : 'none';
  document.getElementById('login-email-group').style.display = pinReq ? 'none' : 'block';
  document.getElementById('login-pin').value = '';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ======================== NAVIGATION ========================
let currentPage = 'dashboard';
function navigateTo(page, data) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));

  const pg = document.getElementById('page-' + page);
  if (pg) { pg.style.display = 'block'; pg.scrollTop = 0; }

  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  if (page === 'dashboard') renderDashboard();
  else if (page === 'members') renderMembers(data);
  else if (page === 'member-profile') renderMemberProfile(data);
  else if (page === 'plans') renderPlans();
  else if (page === 'offers') renderOffers();
  else if (page === 'payments') renderPayments();
  else if (page === 'reports') renderReports();
  else if (page === 'settings') renderSettings();

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ======================== DASHBOARD ========================
function renderDashboard() {
  const members = DB.members;
  const todayStr = today();

  let expired = 0, expToday = 0, exp3 = 0, exp7 = 0;
  let activeCount = 0, frozenCount = 0, discontinuedCount = 0;
  const followups = [];

  members.forEach(m => {
    const st = getMemberStatus(m);
    if (st === 'discontinued') { discontinuedCount++; return; }
    const mem = getActiveMembership(m);
    if (!mem) return;
    if (st === 'frozen') { frozenCount++; return; }
    const est = getExpiryStatus(mem.expiryDate);
    if (st === 'partial' || st === 'pending') {
      followups.push({ member: m, membership: mem, type: 'payment' });
    }
    if (est === 'expired') { expired++; followups.push({ member: m, membership: mem, type: 'expired' }); }
    else if (est === 'expiring-today') { expToday++; followups.push({ member: m, membership: mem, type: 'today' }); }
    else if (est === 'expiring-3') { exp3++; followups.push({ member: m, membership: mem, type: '3days' }); }
    else if (est === 'expiring-7') { exp7++; }
    else if (st !== 'partial' && st !== 'pending') activeCount++;
  });

  const thisMonth = DB.payments.filter(p => {
    const pd = new Date(p.date);
    const now = new Date();
    return pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
  });
  const todayPayments = DB.payments.filter(p => p.date === todayStr);
  const todayCollection = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const monthlyRevenue = thisMonth.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = totalPendingAcrossMemberships();

  const newThisMonth = members.filter(m => {
    const rd = new Date(m.registrationDate);
    const now = new Date();
    return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
  }).length;

  const renewalsThisMonth = thisMonth.filter(p => p.type === 'renewal').length;

  let html = `
    <div class="dash-head">
      <h1>${getGreeting()}, Master 👋</h1>
      <p>Here's what needs your attention today.</p>
    </div>

    <div class="section-head">⚠️ Membership Status</div>
    <div class="expiry-list">
      <div class="expiry-card red" onclick="navigateTo('members','expired')">
        <div class="ec-main"><span class="ec-icon">🔴</span><div><div class="ec-label">Expired</div><div class="ec-count">${expired} <span style="font-size:12px;font-weight:600;color:var(--gray-400)">members</span></div></div></div>
        <span class="ec-arrow">›</span>
      </div>
      <div class="expiry-card red" onclick="navigateTo('members','expiring-today')">
        <div class="ec-main"><span class="ec-icon">🔴</span><div><div class="ec-label">Expiring Today</div><div class="ec-count">${expToday} <span style="font-size:12px;font-weight:600;color:var(--gray-400)">members</span></div></div></div>
        <span class="ec-arrow">›</span>
      </div>
      <div class="expiry-card orange" onclick="navigateTo('members','expiring-3')">
        <div class="ec-main"><span class="ec-icon">🟠</span><div><div class="ec-label">Expiring in 3 Days</div><div class="ec-count">${exp3} <span style="font-size:12px;font-weight:600;color:var(--gray-400)">members</span></div></div></div>
        <span class="ec-arrow">›</span>
      </div>
      <div class="expiry-card yellow" onclick="navigateTo('members','expiring-7')">
        <div class="ec-main"><span class="ec-icon">🟡</span><div><div class="ec-label">Expiring in 7 Days</div><div class="ec-count">${exp7} <span style="font-size:12px;font-weight:600;color:var(--gray-400)">members</span></div></div></div>
        <span class="ec-arrow">›</span>
      </div>
    </div>

    <div class="section-head">📊 Overview</div>
    <div class="stats-list">
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">👥</span>Total Members</div><div class="sr-value">${members.length}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">🟢</span>Active Members</div><div class="sr-value">${activeCount}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">⏸️</span>Frozen</div><div class="sr-value">${frozenCount}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">⚫</span>Discontinued</div><div class="sr-value">${discontinuedCount}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">✨</span>New This Month</div><div class="sr-value">${newThisMonth}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">🔄</span>Renewals This Month</div><div class="sr-value">${renewalsThisMonth}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">💰</span>Today's Collection</div><div class="sr-value">${fmtMoney(todayCollection)}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">📈</span>Monthly Revenue</div><div class="sr-value">${fmtMoney(monthlyRevenue)}</div></div>
      <div class="stat-row red"><div class="sr-label"><span class="sr-icon">🟡</span>Outstanding</div><div class="sr-value">${fmtMoney(pendingAmount)}</div></div>
    </div>

    <div class="section-head">⚡ Quick Actions</div>
    <div class="quick-actions">
      <button class="qa-btn primary" onclick="openAddMember()"><span>➕</span> Add Member</button>
      <button class="qa-btn" onclick="quickRenew()"><span>🔄</span> Renew Membership</button>
      <button class="qa-btn" onclick="quickPayment()"><span>💰</span> Record Payment</button>
      <button class="qa-btn" onclick="navigateTo('offers')"><span>🎁</span> Manage Offers</button>
      <button class="qa-btn" onclick="navigateTo('reports')"><span>📊</span> Reports</button>
    </div>
  `;

  if (followups.length > 0) {
    html += `<div class="section-title">📞 Today's Follow-Up</div><div class="followup-list">`;
    followups.slice(0, 6).forEach(f => {
      const due = Math.max(0, f.membership.finalPrice - getTotalPaid(f.member));
      const det = f.type === 'today' ? 'Expires Today' :
                  f.type === 'expired' ? `Expired ${Math.abs(daysBetween(f.membership.expiryDate, today()))} days ago` :
                  f.type === 'payment' ? `Payment Due − ${fmtMoney(due)}` :
                  `Expires in ${daysBetween(today(), f.membership.expiryDate)} days`;
      const plan = DB.plans.find(p => p.id === f.membership.planId);
      const phone = normalizePhone(f.member.whatsapp || f.member.phone);
      const msg = encodeURIComponent(f.type === 'payment' ? `Hi ${f.member.name}, this is a reminder from GYM MASTER. A payment of ${fmtMoney(due)} is due on your membership. Please visit the gym to settle it. Thank you!` : `Hi ${f.member.name}, this is a reminder from GYM MASTER. Your gym membership ${f.type === 'expired' ? 'has expired' : 'is expiring soon'}. Please visit the gym to renew. Thank you!`);
      html += `
        <div class="followup-card">
          <div class="fu-avatar">${memberInitials(f.member.name)}</div>
          <div class="fu-info">
            <div class="fu-name">${f.member.name}</div>
            <div class="fu-detail">${det} — ${plan ? plan.name : 'N/A'}</div>
          </div>
          <div class="fu-actions">
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('member-profile','${f.member.id}')">View</button>
            <a class="btn btn-sm btn-success" href="https://wa.me/91${phone}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>
            ${f.type === 'payment' ? `<button class="btn btn-sm btn-primary" onclick="openPayment('${f.member.id}')">Payment</button>` : `<button class="btn btn-sm btn-primary" onclick="openRenew('${f.member.id}')">Renew</button>`}
          </div>
        </div>`;
    });
    html += '</div>';
  }

  document.getElementById('page-dashboard').innerHTML = html;
}

// ======================== MEMBER HELPERS ========================
function getActiveMembership(member) {
  if (!member.memberships || member.memberships.length === 0) return null;
  const sorted = [...member.memberships].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  return sorted[0];
}

// ======================== CENTRALIZED BUSINESS RULES ========================
// Kept separate from UI so the future Flutter layer can reuse the same rules.
function calcExpiry(startDate, duration, unit) { return addDuration(startDate, duration, unit); }
function offerApplies(offer, planId, targetDate) {
  const now = targetDate ? new Date(targetDate) : new Date();
  if (!now) return false;
  const s = new Date(offer.startDate + 'T00:00:00');
  const e = new Date(offer.endDate + 'T00:00:00');
  if (now < s || now > e) return false;
  if (offer.planIds && offer.planIds.length > 0 && planId && !offer.planIds.includes(planId)) return false;
  if (offer.usageLimit) {
    const used = DB.members.filter(m => m.memberships && m.memberships.some(mem => mem.offerId === offer.id)).length;
    if (used >= offer.usageLimit) return false;
  }
  return true;
}
function calcOfferDiscount(offer, price) {
  if (offer.type === 'percentage') return Math.round(price * (offer.value || 0) / 100);
  if (offer.type === 'fixed') return offer.value || 0;
  if (offer.type === '1plus1') return Math.round(price * 0.33);
  if (offer.type === 'family') return offer.value || 0;
  return 0;
}
function calcFinalPrice(plan, offer) {
  const price = plan.price;
  const discount = offer ? calcOfferDiscount(offer, price) : 0;
  return { price, discount, final: Math.max(0, price - discount) };
}
function freezeDays(start, end) {
  return Math.max(0, daysBetween(start, end));
}

// ======================== MEMBERS PAGE ========================
let membersFilter = 'all';
function renderMembers(filter) {
  if (filter) membersFilter = filter;
  const searchVal = document.getElementById('global-search')?.value || '';
  let members = [...DB.members];

  // Filter
  if (membersFilter !== 'all') {
    if (membersFilter.startsWith('expiring')) {
      members = members.filter(m => getMemberStatus(m).startsWith('expiring'));
    } else {
      members = members.filter(m => getMemberStatus(m) === membersFilter);
    }
  }

  // Search
  if (searchVal) {
    const q = searchVal.toLowerCase();
    members = members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      normalizePhone(m.phone).includes(normalizePhone(q)) ||
      (m.id && m.id.toLowerCase().includes(q))
    );
  }

  const counts = { all: DB.members.length, active: 0, 'expiring-3': 0, expired: 0, frozen: 0, discontinued: 0, pending: 0, partial: 0 };
  DB.members.forEach(m => {
    const s = getMemberStatus(m);
    if (s.startsWith('expiring')) counts['expiring-3']++;
    else if (s === 'active') counts.active++;
    else if (counts[s] !== undefined) counts[s]++;
  });

  let html = `
    <div class="members-header">
      <h2>Members (${members.length})</h2>
      <div class="filter-tabs">
        <button class="filter-tab ${membersFilter==='all'?'active':''}" onclick="renderMembers('all')">All (${counts.all})</button>
        <button class="filter-tab ${membersFilter==='active'?'active':''}" onclick="renderMembers('active')">Active (${counts.active})</button>
        <button class="filter-tab ${membersFilter==='expiring-3'?'active':''}" onclick="renderMembers('expiring-3')">Expiring (${counts['expiring-3']})</button>
        <button class="filter-tab ${membersFilter==='expired'?'active':''}" onclick="renderMembers('expired')">Expired (${counts.expired})</button>
        <button class="filter-tab ${membersFilter==='frozen'?'active':''}" onclick="renderMembers('frozen')">Frozen (${counts.frozen})</button>
        <button class="filter-tab ${membersFilter==='discontinued'?'active':''}" onclick="renderMembers('discontinued')">Discontinued (${counts.discontinued})</button>
        <button class="filter-tab ${membersFilter==='pending'?'active':''}" onclick="renderMembers('pending')">Pending (${counts.pending})</button>
        <button class="filter-tab ${membersFilter==='partial'?'active':''}" onclick="renderMembers('partial')">Partial (${counts.partial})</button>
      </div>
    </div>
  `;

  if (members.length === 0) {
    html += '<div class="empty-state"><div class="es-icon">👥</div><div class="es-text">No members found</div><div class="es-sub">Try adjusting your filters or add a new member.</div></div>';
    document.getElementById('page-members').innerHTML = html;
    return;
  }

  // Desktop table
  html += '<div class="table-wrapper"><table class="member-table"><thead><tr><th>Member</th><th>Phone</th><th>Goal</th><th>Plan</th><th>Expiry</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  members.forEach(m => {
    const mem = getActiveMembership(m);
    const st = getMemberStatus(m);
    const plan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
    const pst = mem ? paymentLabel(mem.paymentStatus) : '—';
    const pcls = mem ? (mem.paymentStatus === 'paid' ? 'status-active' : mem.paymentStatus === 'partial' ? 'status-partial' : 'status-pending') : '';
    html += `<tr>
      <td><div class="member-cell"><div class="member-avatar">${memberInitials(m.name)}</div><div><div class="member-name">${m.name}</div><div class="member-id">${m.id}</div></div></div></td>
      <td>${m.phone}</td>
      <td>${(m.goals||[])[0] || '—'}</td>
      <td>${plan ? plan.name : '—'}</td>
      <td>${mem ? fmtDate(mem.expiryDate) : '—'}</td>
      <td>${mem ? `<span class="status-badge ${pcls}">${pst}</span>` : '—'}</td>
      <td><span class="status-badge ${getStatusClass(st)}">${getStatusLabel(st)}</span></td>
      <td><div class="table-actions"><button class="btn btn-sm btn-secondary" onclick="navigateTo('member-profile','${m.id}')">View</button><button class="btn btn-sm btn-secondary" onclick="openPayment('${m.id}')">Payment</button><button class="btn btn-sm btn-primary" onclick="openRenew('${m.id}')">Renew</button></div></td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  // Mobile cards
  html += '<div class="member-cards">';
  members.forEach(m => {
    const mem = getActiveMembership(m);
    const st = getMemberStatus(m);
    const plan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
    const due = mem ? Math.max(0, mem.finalPrice - getTotalPaid(m)) : 0;
    html += `
      <div class="member-card">
        <div class="mc-header">
          <div class="fu-avatar">${memberInitials(m.name)}</div>
          <div class="mc-info">
            <div class="mc-name">${m.name}</div>
            <div class="mc-id">${m.id}</div>
          </div>
          <span class="status-badge ${getStatusClass(st)}">${getStatusLabel(st)}</span>
        </div>
        <div class="mc-details">
          <div>📱 ${m.phone}</div>
          <div>🏋️ ${(m.goals||[])[0] || '—'}</div>
          <div>💳 ${plan ? plan.name : '—'}</div>
          <div>📅 ${mem ? fmtDate(mem.expiryDate) : '—'}</div>
        </div>
        ${due > 0 ? `<div class="mc-due">${fmtMoney(due)} Due</div>` : mem ? `<div class="mc-due paid">${paymentLabel(mem.paymentStatus)}</div>` : ''}
        <div class="mc-actions">
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('member-profile','${m.id}')">VIEW</button>
          <button class="btn btn-sm btn-secondary" onclick="openPayment('${m.id}')">PAYMENT</button>
          <button class="btn btn-sm btn-primary" onclick="openRenew('${m.id}')">RENEW</button>
        </div>
      </div>`;
  });
  html += '</div>';

  document.getElementById('page-members').innerHTML = html;
}

// ======================== MEMBER PROFILE ========================
function renderMemberProfile(memberId) {
  const m = DB.members.find(x => x.id === memberId);
  if (!m) { navigateTo('members'); return; }
  const mem = getActiveMembership(m);
  const st = getMemberStatus(m);
  const plan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
  const offer = mem && mem.offerId ? DB.offers.find(o => o.id === mem.offerId) : null;
  const daysLeft = mem ? daysBetween(today(), mem.expiryDate) : null;

  let html = `
    <button class="btn btn-secondary" onclick="navigateTo('members')" style="margin-bottom:16px">← Back to Members</button>
    <div class="profile-header">
      ${avatarHtml(m, '64px')}
      <div class="profile-info">
        <h2>${m.name}</h2>
        <div class="pid">${m.id}</div>
        <div class="profile-meta">
          <div class="profile-meta-item">📱 <strong>${m.phone}</strong></div>
          ${m.whatsapp ? `<div class="profile-meta-item">💬 <strong>${m.whatsapp}</strong></div>` : ''}
          <div class="profile-meta-item">📅 Joined <strong>${fmtDate(m.registrationDate)}</strong></div>
          <div class="profile-meta-item">🏋️ <strong>${(m.goals||[]).join(', ') || 'Not set'}</strong></div>
        </div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline" onclick="openWhatsApp('${m.id}')">💬 WhatsApp</button>
        <button class="btn btn-outline" onclick="openEditMember('${m.id}')">✏️ Edit</button>
        <button class="btn btn-primary" onclick="openPayment('${m.id}')">💰 Payment</button>
        <button class="btn btn-primary" onclick="openRenew('${m.id}')">🔄 Renew</button>
        <button class="btn btn-outline" onclick="openFreeze('${m.id}')">⏸ Freeze</button>
        <button class="btn btn-danger" onclick="openDiscontinue('${m.id}')">⏹ Discontinue</button>
        ${m.familyGroupId ? `<button class="btn btn-secondary" onclick="openFamily('${m.familyGroupId}')">👨‍👩‍👧 View Family</button>` : ''}
      </div>
    </div>

    <div class="profile-grid">
      <div class="profile-card">
        <h3>📋 Current Membership</h3>
        ${mem ? `
          <div class="pc-row"><span>Plan</span><span>${plan ? plan.name : '—'}</span></div>
          <div class="pc-row"><span>Start Date</span><span>${fmtDate(mem.startDate)}</span></div>
          <div class="pc-row"><span>Expiry Date</span><span>${fmtDate(mem.expiryDate)}</span></div>
          <div class="pc-row"><span>${mem.status === 'discontinued' ? 'Stopped On' : 'Days ' + (daysLeft >= 0 ? 'Remaining' : 'Expired')}</span><span style="color:${mem.status === 'discontinued' ? 'var(--red)' : daysLeft >= 0 ? 'var(--green)' : 'var(--red)'}">${mem.status === 'discontinued' ? fmtDate(mem.discontinuedDate || mem.endDate) : Math.abs(daysLeft) + ' days'}</span></div>
          <div class="pc-row"><span>Price</span><span>${fmtMoney(mem.finalPrice)}</span></div>
          ${mem.originalPrice !== mem.finalPrice ? `<div class="pc-row"><span>Original Price</span><span style="text-decoration:line-through;color:var(--gray-400)">${fmtMoney(mem.originalPrice)}</span></div>
          <div class="pc-row"><span>Discount</span><span style="color:var(--green)">-${fmtMoney(mem.originalPrice - mem.finalPrice)}</span></div>` : ''}
          <div class="pc-row"><span>Paid</span><span style="color:var(--green)">${fmtMoney(getTotalPaid(m))}</span></div>
          <div class="pc-row"><span>Balance</span><span style="color:${Math.max(0, mem.finalPrice - getTotalPaid(m)) > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(Math.max(0, mem.finalPrice - getTotalPaid(m)))}</span></div>
          <div class="pc-row"><span>Payment Status</span><span class="status-badge ${mem.paymentStatus === 'paid' ? 'status-active' : mem.paymentStatus === 'partial' ? 'status-partial' : 'status-pending'}">${paymentLabel(mem.paymentStatus)}</span></div>
          ${mem.paymentStatus !== 'paid' ? `<button class="btn btn-primary btn-block" onclick="openPayment('${m.id}')">💰 Record Payment</button>` : ''}
          ${offer ? `<div class="pc-row"><span>Offer Applied</span><span>${offer.name}</span></div>` : ''}
        ` : '<div class="empty-state"><div class="es-text">No active membership</div></div>'}
      </div>

      <div class="profile-card">
        <h3>👤 Personal Details</h3>
        <div class="pc-row"><span>Gender</span><span>${m.gender || '—'}</span></div>
        <div class="pc-row"><span>Date of Birth</span><span>${m.dob ? fmtDate(m.dob) : '—'}</span></div>
        <div class="pc-row"><span>Emergency Contact</span><span>${m.emergency || '—'}</span></div>
        <div class="pc-row"><span>Notes</span><span>${m.notes || '—'}</span></div>
        ${m.familyGroupId ? `<button class="btn btn-secondary btn-block" onclick="openFamily('${m.familyGroupId}')">👨‍👩‍👧 View Family (${DB.members.filter(x => x.familyGroupId === m.familyGroupId).length})</button>` : ''}
      </div>
    </div>

    ${m.discontinuations && m.discontinuations.length > 0 ? `
      <div class="profile-card">
        <h3>⏹ Discontinuation History</h3>
        ${m.discontinuations.slice().reverse().map(d => `
          <div class="history-row">
            <div class="hr-top"><div class="hr-plan">${d.reasonLabel || d.reason || '—'}</div><span class="status-badge status-discontinued">Discontinued</span></div>
            <div class="hr-period">📅 ${fmtDate(d.date)}</div>
            <div class="hr-bottom"><div class="hr-notes">${d.notes || 'No notes'}</div></div>
          </div>`).join('')}
      </div>` : ''}

    <div class="profile-card">
      <h3>📜 Membership History</h3>
      ${m.memberships && m.memberships.length > 0 ? `
        <div class="history-list">
          ${[...m.memberships].sort((a,b) => new Date(b.startDate) - new Date(a.startDate)).map(mem2 => {
            const plan2 = DB.plans.find(p => p.id === mem2.planId);
            const st2 = mem2.status === 'discontinued' || mem2.status === 'stopped' ? 'discontinued' : getExpiryStatus(mem2.expiryDate);
            return `<div class="history-row">
              <div class="hr-top">
                <div class="hr-plan">${plan2 ? plan2.name : '—'}</div>
                <span class="status-badge ${getStatusClass(st2)}">${getStatusLabel(st2)}</span>
              </div>
              <div class="hr-period">📅 ${fmtDate(mem2.startDate)} → ${fmtDate(mem2.expiryDate)}</div>
              <div class="hr-bottom">
                <div><span class="hr-price">${fmtMoney(mem2.finalPrice)}</span> <span class="status-badge ${mem2.paymentStatus === 'paid' ? 'status-active' : mem2.paymentStatus === 'partial' ? 'status-partial' : 'status-pending'}">${paymentLabel(mem2.paymentStatus)}</span></div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <table class="history-table">
          <thead><tr><th>Plan</th><th>Price</th><th>Period</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            ${[...m.memberships].sort((a,b) => new Date(b.startDate) - new Date(a.startDate)).map(mem2 => {
              const plan2 = DB.plans.find(p => p.id === mem2.planId);
              const st2 = mem2.status === 'discontinued' || mem2.status === 'stopped' ? 'discontinued' : getExpiryStatus(mem2.expiryDate);
              return `<tr>
                <td><strong>${plan2 ? plan2.name : '—'}</strong></td>
                <td>${fmtMoney(mem2.finalPrice)}</td>
                <td>${fmtDate(mem2.startDate)} → ${fmtDate(mem2.expiryDate)}</td>
                <td><span class="status-badge ${mem2.paymentStatus === 'paid' ? 'status-active' : mem2.paymentStatus === 'partial' ? 'status-partial' : 'status-pending'}">${paymentLabel(mem2.paymentStatus)}</span></td>
                <td><span class="status-badge ${getStatusClass(st2)}">${getStatusLabel(st2)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state"><div class="es-icon">📜</div><div class="es-text">No membership history</div></div>'}
    </div>
  `;

  document.getElementById('page-member-profile').innerHTML = html;
  document.getElementById('page-member-profile').style.display = 'block';
}

// ======================== PLANS PAGE ========================
let editingPlanId = null;
function renderPlans() {
  let html = `
    <div class="members-header">
      <h2>Membership Plans</h2>
      <button class="btn btn-primary" onclick="openPlanModal()">➕ Add Plan</button>
    </div>
    <div class="plans-grid-display">
  `;
  DB.plans.forEach(p => {
    html += `
      <div class="plan-card-display">
        <div class="plan-name">${p.name}</div>
        <div class="plan-price">${fmtMoney(p.price)}</div>
        <div class="plan-duration">${p.duration} ${p.unit}</div>
        <div class="plan-desc">${p.description || ''}</div>
        <div class="plan-actions">
          <button class="btn btn-sm btn-secondary" onclick="openPlanModal('${p.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deletePlan('${p.id}')">Delete</button>
        </div>
      </div>`;
  });
  html += '</div>';
  document.getElementById('page-plans').innerHTML = html;
}
function openPlanModal(id) {
  editingPlanId = id || null;
  document.getElementById('plan-modal-title').textContent = id ? 'Edit Plan' : 'Add Plan';
  if (id) {
    const p = DB.plans.find(x => x.id === id);
    document.getElementById('pl-name').value = p.name;
    document.getElementById('pl-duration').value = p.duration;
    document.getElementById('pl-unit').value = p.unit;
    document.getElementById('pl-price').value = p.price;
    document.getElementById('pl-desc').value = p.description || '';
  } else {
    document.getElementById('plan-form').reset();
  }
  openModal('modal-plan');
}
function handleSavePlan(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('pl-name').value.trim(),
    duration: parseInt(document.getElementById('pl-duration').value),
    unit: document.getElementById('pl-unit').value,
    price: parseInt(document.getElementById('pl-price').value),
    description: document.getElementById('pl-desc').value.trim()
  };
  if (editingPlanId) {
    const idx = DB.plans.findIndex(p => p.id === editingPlanId);
    if (idx >= 0) Object.assign(DB.plans[idx], data);
    showToast('Plan updated successfully', 'success');
  } else {
    data.id = genId('PL');
    data.active = true;
    DB.plans.push(data);
    showToast('Plan created successfully', 'success');
  }
  saveDB();
  closeModal('modal-plan');
  renderPlans();
  return false;
}
function deletePlan(id) {
  showConfirm('Delete Plan?', 'This plan will be removed. Members using this plan won\'t be affected.', 'Delete', '🗑️', () => {
    DB.plans = DB.plans.filter(p => p.id !== id);
    saveDB();
    renderPlans();
    showToast('Plan deleted');
  });
}

// ======================== OFFERS PAGE ========================
let editingOfferId = null;
function renderOffers() {
  let html = `
    <div class="members-header">
      <h2>Offers</h2>
      <button class="btn btn-primary" onclick="openOfferModal()">➕ Create Offer</button>
    </div>
    <div class="offers-grid-display">
  `;
  if (DB.offers.length === 0) {
    html += '<div class="empty-state"><div class="es-icon">🎁</div><div class="es-text">No offers yet</div><div class="es-sub">Create your first offer to attract more members.</div></div>';
  }
  DB.offers.forEach(o => {
    const now = new Date();
    const start = new Date(o.startDate + 'T00:00:00');
    const end = new Date(o.endDate + 'T00:00:00');
    const isActive = now >= start && now <= end;
    const typeLabels = { percentage: 'Percentage Discount', fixed: 'Fixed Discount', '1plus1': '1+1', family: 'Family Discount' };
    const valText = o.type === 'percentage' ? o.value + '% OFF' : o.type === 'fixed' ? fmtMoney(o.value) + ' OFF' : o.type === '1plus1' ? 'Buy 1 Get 1' : fmtMoney(o.value) + ' Family';
    const used = DB.members.filter(m => m.memberships && m.memberships.some(mem => mem.offerId === o.id)).length;
    const limitText = o.usageLimit ? `👤 ${used}/${o.usageLimit} used` : `👤 ${used} used`;

    html += `
      <div class="offer-card-display">
        <span class="offer-type-badge">${typeLabels[o.type] || o.type}</span>
        <div class="offer-name">${o.name}</div>
        <div class="offer-desc">${o.description || ''}</div>
        <div class="offer-meta">
          <div>💰 ${valText}</div>
          <div>📅 ${fmtDate(o.startDate)} → ${fmtDate(o.endDate)}</div>
          <div>📋 Plans: ${(o.planIds||[]).map(pid => { const pp = DB.plans.find(p => p.id === pid); return pp ? pp.name : ''; }).join(', ') || 'All'}</div>
          <div>👤 ${limitText}${o.usageLimit && used >= o.usageLimit ? ' ⛔ Full' : ''}</div>
          <div>Status: <span class="status-badge ${isActive ? 'status-active' : 'status-expired'}">${isActive ? '🟢 Active' : '🔴 Inactive'}</span></div>
        </div>
        <div class="offer-actions">
          <button class="btn btn-sm btn-secondary" onclick="openOfferModal('${o.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOffer('${o.id}')">Delete</button>
        </div>
      </div>`;
  });
  html += '</div>';
  document.getElementById('page-offers').innerHTML = html;
}
function openOfferModal(id) {
  editingOfferId = id || null;
  document.getElementById('offer-modal-title').textContent = id ? 'Edit Offer' : 'Create Offer';
  const planChips = document.getElementById('of-plans');
  planChips.innerHTML = DB.plans.map(p => `<label class="chip"><input type="checkbox" value="${p.id}"> ${p.name}</label>`).join('');

  if (id) {
    const o = DB.offers.find(x => x.id === id);
    document.getElementById('of-name').value = o.name;
    document.getElementById('of-type').value = o.type;
    document.getElementById('of-value').value = o.value || '';
    document.getElementById('of-start').value = o.startDate;
    document.getElementById('of-end').value = o.endDate;
    document.getElementById('of-desc').value = o.description || '';
    document.getElementById('of-usage').value = o.usageLimit || '';
    toggleOfferFields();
    setTimeout(() => {
      (o.planIds||[]).forEach(pid => {
        const cb = planChips.querySelector(`input[value="${pid}"]`);
        if (cb) cb.checked = true;
      });
    }, 50);
  } else {
    document.getElementById('offer-form').reset();
    toggleOfferFields();
  }
  openModal('modal-offer');
}
function toggleOfferFields() {
  const t = document.getElementById('of-type').value;
  const grp = document.getElementById('of-value-group');
  const lbl = document.getElementById('of-value-label');
  if (t === '1plus1') { grp.style.display = 'none'; }
  else { grp.style.display = 'block'; }
  if (t === 'percentage') { lbl.textContent = 'Discount %'; }
  else if (t === 'fixed' || t === 'family') { lbl.textContent = 'Discount Amount (₹)'; }
  else { lbl.textContent = 'Value'; }
}
function handleSaveOffer(e) {
  e.preventDefault();
  const planIds = [...document.querySelectorAll('#of-plans input:checked')].map(c => c.value);
  const usageLimitVal = parseInt(document.getElementById('of-usage').value) || null;
  const data = {
    name: document.getElementById('of-name').value.trim(),
    type: document.getElementById('of-type').value,
    value: parseInt(document.getElementById('of-value').value) || 0,
    planIds: planIds,
    startDate: document.getElementById('of-start').value,
    endDate: document.getElementById('of-end').value,
    description: document.getElementById('of-desc').value.trim(),
    usageLimit: usageLimitVal
  };
  if (editingOfferId) {
    const idx = DB.offers.findIndex(o => o.id === editingOfferId);
    if (idx >= 0) Object.assign(DB.offers[idx], data);
    showToast('Offer updated', 'success');
  } else {
    data.id = genId('OF');
    DB.offers.push(data);
    showToast('Offer created', 'success');
  }
  saveDB();
  closeModal('modal-offer');
  renderOffers();
  return false;
}
function deleteOffer(id) {
  showConfirm('Delete Offer?', 'This offer will be removed permanently.', 'Delete', '🗑️', () => {
    DB.offers = DB.offers.filter(o => o.id !== id);
    saveDB();
    renderOffers();
    showToast('Offer deleted');
  });
}

// ======================== PAYMENTS PAGE ========================
let payStatusFilter = 'all';
let payMethodFilter = 'all';
function totalPendingAcrossMemberships() {
  let sum = 0;
  DB.members.forEach(m => {
    const mem = getActiveMembership(m);
    if (mem && mem.status !== 'discontinued') sum += Math.max(0, mem.finalPrice - getTotalPaid(m));
  });
  return sum;
}
function renderPayments() {
  const all = [...DB.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
  const todayStr = today();
  const todayP = all.filter(p => p.date === todayStr);
  const thisWeek = all.filter(p => daysBetween(p.date, todayStr) >= -7);
  const thisMonth = all.filter(p => {
    const pd = new Date(p.date);
    const now = new Date();
    return pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
  });

  const todaySum = todayP.reduce((s, p) => s + (p.amount || 0), 0);
  const weekSum = thisWeek.reduce((s, p) => s + (p.amount || 0), 0);
  const monthSum = thisMonth.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingSum = totalPendingAcrossMemberships();

  let html = `
    <div class="members-header"><h2>Payments</h2><button class="btn btn-primary" onclick="openPayment()">💰 Record Payment</button></div>
    <div class="payments-summary">
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">💰</span>Today's Collection</div><div class="sr-value">${fmtMoney(todaySum)}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">📅</span>This Week</div><div class="sr-value">${fmtMoney(weekSum)}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">📈</span>This Month</div><div class="sr-value">${fmtMoney(monthSum)}</div></div>
      <div class="stat-row red"><div class="sr-label"><span class="sr-icon">🟡</span>Outstanding</div><div class="sr-value">${fmtMoney(pendingSum)}</div></div>
    </div>
    <div class="pay-filters">
      <select id="pay-status-filter" onchange="payStatusFilter=this.value;renderPayments()" class="pay-filter-select">
        <option value="all" ${payStatusFilter==='all'?'selected':''}>All Status</option>
        <option value="paid" ${payStatusFilter==='paid'?'selected':''}>Paid</option>
        <option value="partial" ${payStatusFilter==='partial'?'selected':''}>Partial</option>
        <option value="pending" ${payStatusFilter==='pending'?'selected':''}>Pending</option>
      </select>
      <select id="pay-method-filter" onchange="payMethodFilter=this.value;renderPayments()" class="pay-filter-select">
        <option value="all" ${payMethodFilter==='all'?'selected':''}>All Methods</option>
        <option value="Cash" ${payMethodFilter==='Cash'?'selected':''}>Cash</option>
        <option value="UPI" ${payMethodFilter==='UPI'?'selected':''}>UPI</option>
        <option value="Card" ${payMethodFilter==='Card'?'selected':''}>Card</option>
        <option value="Bank Transfer" ${payMethodFilter==='Bank Transfer'?'selected':''}>Bank Transfer</option>
      </select>
      <input id="pay-search" type="text" placeholder="Search member…" oninput="this.dataset.q=this.value;renderPayments()" class="pay-filter-select">
    </div>
  `;

  let shown = [...all];
  if (payStatusFilter !== 'all') shown = shown.filter(p => p.status === payStatusFilter);
  if (payMethodFilter !== 'all') shown = shown.filter(p => p.method === payMethodFilter);
  const q = (document.getElementById('pay-search')?.dataset.q || '').toLowerCase();
  if (q) shown = shown.filter(p => {
    const m = DB.members.find(x => x.id === p.memberId);
    return (m && m.name.toLowerCase().includes(q)) || (m && m.phone && normalizePhone(m.phone).includes(q));
  });

  if (shown.length === 0) {
    html += '<div class="empty-state"><div class="es-icon">💰</div><div class="es-text">No payments match</div></div>';
  } else {
    html += '<div class="payment-cards">';
    shown.forEach(p => {
      const m = DB.members.find(x => x.id === p.memberId);
      const pcls = p.status === 'paid' ? 'status-active' : p.status === 'partial' ? 'status-partial' : 'status-pending';
      html += `<div class="payment-card">
        <div class="pc-top">
          <div class="pc-member">${m ? m.name : 'Unknown'}</div>
          <div class="pc-amount">${fmtMoney(p.amount)}</div>
        </div>
        <div class="pc-bottom">
          <span class="pc-method">${p.method} • ${p.type || '—'}</span>
          <span class="status-badge ${pcls}">${paymentLabel(p.status)}</span>
        </div>
        <div class="pc-date" style="margin-top:6px">📅 ${fmtDate(p.date)}</div>
      </div>`;
    });
    html += '</div>';

    html += '<div class="payments-table-wrapper"><table class="payments-table"><thead><tr><th>Date</th><th>Member</th><th>Type</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>';
    shown.forEach(p => {
      const m = DB.members.find(x => x.id === p.memberId);
      const pcls = p.status === 'paid' ? 'status-active' : p.status === 'partial' ? 'status-partial' : 'status-pending';
      html += `<tr>
        <td>${fmtDate(p.date)}</td>
        <td><strong>${m ? m.name : 'Unknown'}</strong></td>
        <td>${p.type || '—'}</td>
        <td><strong>${fmtMoney(p.amount)}</strong></td>
        <td>${p.method}</td>
        <td><span class="status-badge ${pcls}">${paymentLabel(p.status)}</span></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }
  document.getElementById('page-payments').innerHTML = html;
}

// ======================== REPORTS PAGE ========================
function renderReports() {
  const now = new Date();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({ value: d.toISOString().substring(0, 7), label: monthNames[d.getMonth()] + ' ' + d.getFullYear() });
  }

  let html = `
    <div class="reports-header">
      <h2>Reports</h2>
      <select id="report-month" onchange="updateReportMonth()" style="padding:8px 12px;border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px">
        ${monthOptions.map(o => `<option value="${o.value}" ${o.value === now.toISOString().substring(0,7) ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="downloadPDF()">📄 Download PDF</button>
    </div>
    <div id="report-stats"></div>
    <div class="report-grid" id="report-charts"></div>
  `;
  document.getElementById('page-reports').innerHTML = html;
  updateReportMonth();
}
function updateReportMonth() {
  const val = document.getElementById('report-month').value;
  const [y, m] = val.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);

  const monthMembers = DB.members.filter(mb => {
    const rd = new Date(mb.registrationDate);
    return rd >= monthStart && rd <= monthEnd;
  });
  const monthPayments = DB.payments.filter(p => {
    const pd = new Date(p.date);
    return pd >= monthStart && pd <= monthEnd;
  });
  const activeMembers = DB.members.filter(mb => getMemberStatus(mb) === 'active');
  const expiredMembers = DB.members.filter(mb => getMemberStatus(mb) === 'expired');
  const discontinuedMembers = DB.members.filter(mb => getMemberStatus(mb) === 'discontinued');
  const frozenMembers = DB.members.filter(mb => getMemberStatus(mb) === 'frozen');
  const totalRevenue = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = totalPendingAcrossMemberships();

  const planCounts = {};
  DB.members.forEach(mb => {
    const mem = getActiveMembership(mb);
    if (mem) {
      const plan = DB.plans.find(p => p.id === mem.planId);
      const name = plan ? plan.name : 'Unknown';
      planCounts[name] = (planCounts[name] || 0) + 1;
    }
  });
  const topPlan = Object.entries(planCounts).sort((a,b) => b[1] - a[1])[0];

  const goalCounts = {};
  DB.members.forEach(mb => {
    (mb.goals || []).forEach(g => { goalCounts[g] = (goalCounts[g] || 0) + 1; });
  });
  const topGoal = Object.entries(goalCounts).sort((a,b) => b[1] - a[1])[0];

  let statsHtml = `
    <div class="stats-list" style="margin-bottom:18px">
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">👥</span>Total Members</div><div class="sr-value">${DB.members.length}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">🟢</span>Active</div><div class="sr-value">${activeMembers.length}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">✨</span>New Members</div><div class="sr-value">${monthMembers.length}</div></div>
      <div class="stat-row red"><div class="sr-label"><span class="sr-icon">🔴</span>Expired</div><div class="sr-value">${expiredMembers.length}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">⏸️</span>Frozen</div><div class="sr-value">${frozenMembers.length}</div></div>
      <div class="stat-row red"><div class="sr-label"><span class="sr-icon">⚫</span>Discontinued</div><div class="sr-value">${discontinuedMembers.length}</div></div>
      <div class="stat-row green"><div class="sr-label"><span class="sr-icon">💰</span>Revenue</div><div class="sr-value">${fmtMoney(totalRevenue)}</div></div>
      <div class="stat-row red"><div class="sr-label"><span class="sr-icon">🟡</span>Outstanding</div><div class="sr-value">${fmtMoney(pendingAmount)}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">🏆</span>Most Popular Plan</div><div class="sr-value" style="font-size:16px">${topPlan ? topPlan[0] : '—'}</div></div>
      <div class="stat-row"><div class="sr-label"><span class="sr-icon">🎯</span>Top Goal</div><div class="sr-value" style="font-size:16px">${topGoal ? topGoal[0] : '—'}</div></div>
    </div>
  `;
  document.getElementById('report-stats').innerHTML = statsHtml;

  let chartsHtml = `
    <div class="report-card">
      <h3>📊 Plan Distribution</h3>
      <div class="chart-container"><canvas id="chart-plans"></canvas></div>
    </div>
    <div class="report-card">
      <h3>🏋️ Fitness Goals</h3>
      <div class="chart-container"><canvas id="chart-goals"></canvas></div>
    </div>
    <div class="report-card">
      <h3>📈 Membership Status</h3>
      <div class="chart-container"><canvas id="chart-status"></canvas></div>
    </div>
    <div class="report-card">
      <h3>💰 Payment Methods</h3>
      <div class="chart-container"><canvas id="chart-payments"></canvas></div>
    </div>
  `;
  document.getElementById('report-charts').innerHTML = chartsHtml;

  // Render charts
  setTimeout(() => {
    (window.__chartInstances || []).forEach(c => { try { c.destroy(); } catch (e) {} });
    window.__chartInstances = [];
    const colors = ['#DC2626','#EA580C','#CA8A04','#16A34A','#2563EB','#7C3AED','#EC4899','#14B8A6'];
    const planLabels = Object.keys(planCounts);
    const planData = Object.values(planCounts);
    if (planLabels.length > 0) {
      const planChart = new Chart(document.getElementById('chart-plans'), {
        type: 'doughnut',
        data: { labels: planLabels, datasets: [{ data: planData, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } } }
      });
      window.__chartInstances.push(planChart);
    }

    const goalLabels = Object.keys(goalCounts);
    const goalData = Object.values(goalCounts);
    if (goalLabels.length > 0) {
      const goalChart = new Chart(document.getElementById('chart-goals'), {
        type: 'bar',
        data: { labels: goalLabels, datasets: [{ data: goalData, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
      });
      window.__chartInstances.push(goalChart);
    }

    const statusLabels = ['Active', 'Expired', 'Frozen', 'Discontinued', 'Partially Paid', 'Pending'];
    const statusData = [activeMembers.length, expiredMembers.length, frozenMembers.length, discontinuedMembers.length,
      DB.members.filter(mb => getMemberStatus(mb) === 'partial').length,
      DB.members.filter(mb => getMemberStatus(mb) === 'pending').length];
    const statusChart = new Chart(document.getElementById('chart-status'), {
      type: 'pie',
      data: { labels: statusLabels, datasets: [{ data: statusData, backgroundColor: ['#16A34A', '#DC2626', '#0EA5E9', '#6B7280', '#CA8A04', '#F59E0B'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } } }
    });
    window.__chartInstances.push(statusChart);

    const methodCounts = {};
    DB.payments.forEach(p => { methodCounts[p.method] = (methodCounts[p.method] || 0) + 1; });
    const methodLabels = Object.keys(methodCounts);
    const methodData = Object.values(methodCounts);
    if (methodLabels.length > 0) {
      const payChart = new Chart(document.getElementById('chart-payments'), {
        type: 'doughnut',
        data: { labels: methodLabels, datasets: [{ data: methodData, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } } }
      });
      window.__chartInstances.push(payChart);
    }
  }, 100);
}

// ======================== PDF GENERATION ========================
function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const val = document.getElementById('report-month')?.value || today().substring(0,7);
  const [y, m] = val.split('-').map(Number);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = monthNames[m-1] + ' ' + y;

  const activeMembers = DB.members.filter(mb => getMemberStatus(mb) === 'active');
  const expiredMembers = DB.members.filter(mb => getMemberStatus(mb) === 'expired');
  const monthPayments = DB.payments.filter(p => {
    const pd = new Date(p.date);
    return pd.getMonth() === m-1 && pd.getFullYear() === y;
  });
  const totalRevenue = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = totalPendingAcrossMemberships();

  // Title
  doc.setFontSize(22);
  doc.setTextColor(220, 38, 38);
  doc.text('GYM MASTER', 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text('Monthly Business Report', 105, 28, { align: 'center' });
  doc.setFontSize(12);
  doc.text(monthName, 105, 35, { align: 'center' });

  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.5);
  doc.line(20, 40, 190, 40);

  // Summary
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('Summary', 20, 50);

  doc.setFontSize(11);
  const summary = [
    ['Total Members', DB.members.length.toString()],
    ['Active Members', activeMembers.length.toString()],
    ['Expired Members', expiredMembers.length.toString()],
    ['Total Revenue', fmtMoney(totalRevenue)],
    ['Pending Payments', fmtMoney(pendingAmount)],
    ['New Members This Month', DB.members.filter(mb => { const rd = new Date(mb.registrationDate); return rd.getMonth() === m-1 && rd.getFullYear() === y; }).length.toString()],
    ['Payments This Month', monthPayments.length.toString()]
  ];
  let sy = 58;
  summary.forEach(([label, val]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 25, sy);
    doc.setTextColor(30, 30, 30);
    doc.text(val, 130, sy);
    sy += 8;
  });

  // Members table
  sy += 6;
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('Member List', 20, sy);
  sy += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Name', 20, sy);
  doc.text('Phone', 60, sy);
  doc.text('Status', 100, sy);
  doc.text('Plan', 130, sy);
  doc.text('Expiry', 165, sy);
  sy += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(20, sy, 190, sy);
  sy += 5;

  doc.setTextColor(50, 50, 50);
  DB.members.slice(0, 25).forEach(mb => {
    if (sy > 270) { doc.addPage(); sy = 20; }
    const mem = getActiveMembership(mb);
    const plan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
    const st = getMemberStatus(mb);
    doc.text(mb.name.substring(0, 20), 20, sy);
    doc.text(mb.phone, 60, sy);
    doc.text(st, 100, sy);
    doc.text(plan ? plan.name.substring(0, 12) : '—', 130, sy);
    doc.text(mem ? fmtDate(mem.expiryDate) : '—', 165, sy);
    sy += 6;
  });

  doc.save('GymMaster_Report_' + val + '.pdf');
  showToast('PDF downloaded successfully', 'success');
}

// ======================== SETTINGS ========================
function renderSettings() {
  const hasPin = requiresPin();
  let html = `
    <div class="members-header"><h2>Settings</h2></div>

    <div class="settings-section">
      <h3>🔒 Admin Security</h3>
      <p>Set a PIN to protect this demo. When enabled, the login screen asks for a PIN instead of the demo credentials.</p>
      <div class="settings-actions">
        ${hasPin ? '<button class="btn btn-secondary" onclick="disablePin()">🔓 Disable PIN</button>' : '<button class="btn btn-primary" onclick="openPinModal()">🔒 Set PIN</button>'}
      </div>
      ${hasPin ? '<p style="margin-top:8px;color:var(--gray-500)">PIN is currently <strong>enabled</strong>. It is stored locally on this device.</p>' : '<p style="margin-top:8px;color:var(--gray-500)">PIN is currently <strong>disabled</strong>.</p>'}
    </div>

    <div class="settings-section">
      <h3>💾 Data Backup</h3>
      <p>Export your gym data to a file. You can import it later to restore your data.</p>
      <div class="settings-actions">
        <button class="btn btn-primary" onclick="exportBackup()">📥 Export Backup</button>
        <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">📤 Import Backup</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="importBackup(event)">
      </div>
    </div>

    <div class="settings-section">
      <h3>🔄 Reset Demo Data</h3>
      <p>Reset all data and reload the demo with sample data. This cannot be undone.</p>
      <div class="settings-actions">
        <button class="btn btn-danger" onclick="confirmReset()">🗑️ Reset All Data</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>ℹ️ About</h3>
      <p>GYM MASTER v1.0 — Demo Version</p>
      <p>A simple, powerful gym membership management system.</p>
      <p style="margin-top:8px;color:var(--gray-400)">Built with ❤️ for gym owners</p>
    </div>
  `;
  document.getElementById('page-settings').innerHTML = html;
}
function openPinModal() {
  const body = `
    <div class="pricing-summary" style="margin-bottom:16px">
      <div class="pricing-row"><span>Status</span><span>${requiresPin() ? 'PIN enabled' : 'No PIN set'}</span></div>
    </div>
    <div class="form-group"><label>New PIN (4-6 digits)</label><input type="password" id="pin-new" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="e.g. 1234"></div>
    <div class="form-group"><label>Confirm PIN</label><input type="password" id="pin-confirm" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Re-enter PIN"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal('modal-pin')">Cancel</button>
      <button class="btn btn-primary" onclick="savePin()">Save PIN</button>
    </div>`;
  const div = document.createElement('div');
  div.id = 'modal-pin';
  div.className = 'modal-overlay';
  div.style.display = 'flex';
  div.innerHTML = `<div class="modal-card"><div class="modal-header"><h2>🔒 Set Admin PIN</h2><button class="modal-close" onclick="closeModal('modal-pin')">✕</button></div><div class="modal-body">${body}</div></div>`;
  document.body.appendChild(div);
  openModal('modal-pin');
}
function savePin() {
  const p1 = document.getElementById('pin-new').value;
  const p2 = document.getElementById('pin-confirm').value;
  if (!p1 || !/^\d{4,6}$/.test(p1)) { showToast('PIN must be 4-6 digits', 'error'); return; }
  if (p1 !== p2) { showToast('PINs do not match', 'error'); return; }
  getSettings().pin = p1;
  saveDB();
  closeModal('modal-pin');
  document.getElementById('modal-pin').remove();
  showToast('PIN enabled. You will need it to log in.', 'success');
  renderSettings();
}
function disablePin() {
  showConfirm('Disable PIN?', 'Login will revert to the demo credentials.', 'Disable', '🔓', () => {
    delete getSettings().pin;
    saveDB();
    showToast('PIN disabled', 'success');
    renderSettings();
  });
}
function exportBackup() {
  const data = JSON.stringify(DB, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gymmaster_backup_' + today() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported successfully', 'success');
}
function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.members && data.plans) {
        DB = data;
        saveDB();
        showToast('Backup imported successfully', 'success');
        navigateTo(currentPage);
      } else {
        showToast('Invalid backup file', 'error');
      }
    } catch(err) {
      showToast('Error reading backup file', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
function confirmReset() {
  showConfirm('Reset All Data?', 'This will delete all members, plans, offers, and payments. Demo data will be reloaded.', 'Reset', '🗑️', () => {
    resetDB();
    generateDemoData();
    saveDB();
    showToast('Demo data has been reset', 'success');
    navigateTo('dashboard');
  });
}

// ======================== ADD / EDIT MEMBER ========================
let selectedPlanId = null;
let selectedOfferId = null;
let isDuplicate = false;
let editingMemberId = null;
let memberPhotoData = null;

function handlePhotoUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    memberPhotoData = ev.target.result;
    document.getElementById('am-photo-preview').innerHTML = '';
    document.getElementById('am-photo-preview').classList.add('has-photo');
    document.getElementById('am-photo-preview').style.backgroundImage = `url('${memberPhotoData}')`;
  };
  reader.readAsDataURL(file);
}

function openAddMember() {
  editingMemberId = null;
  memberPhotoData = null;
  isDuplicate = false;
  selectedPlanId = null;
  selectedOfferId = null;
  document.getElementById('add-member-form').reset();
  document.getElementById('add-member-title').textContent = 'Add New Member';
  document.getElementById('am-submit-btn').textContent = 'Create Member';
  document.getElementById('am-regdate').value = today();
  document.getElementById('duplicate-alert').style.display = 'none';
  document.getElementById('am-pricing').style.display = 'none';
  document.getElementById('am-photo-preview').innerHTML = '📷';
  document.getElementById('am-photo-preview').classList.remove('has-photo');
  document.getElementById('am-photo-preview').style.backgroundImage = '';
  document.getElementById('am-goal-custom').style.display = 'none';
  document.getElementById('am-goal-custom-chip').querySelector('input').checked = false;
  document.getElementById('am-paystatus').value = 'auto';
  document.getElementById('am-expected-wrap').style.display = 'none';
  document.getElementById('am-expected').value = '';

  renderMemberPlansAndOffers();

  openModal('modal-add-member');
}

function renderMemberPlansAndOffers() {
  // Render plans
  const plansEl = document.getElementById('am-plans');
  plansEl.innerHTML = DB.plans.filter(p => p.active !== false).map(p => `
    <div class="plan-select-card" onclick="selectPlan('${p.id}', this)">
      <input type="radio" name="am-plan" value="${p.id}">
      <div class="psc-name">${p.name}</div>
      <div class="psc-price">${fmtMoney(p.price)}</div>
      <div class="psc-duration">${p.duration} ${p.unit}</div>
    </div>
  `).join('');

  // Render active offers (respect usage limit)
  const offersEl = document.getElementById('am-offers');
  const activeOffers = DB.offers.filter(o => offerApplies(o, selectedPlanId));
  if (activeOffers.length === 0) {
    document.getElementById('am-offers-title').style.display = 'none';
    offersEl.innerHTML = '';
  } else {
    document.getElementById('am-offers-title').style.display = '';
    offersEl.innerHTML = activeOffers.map(o => {
      const used = DB.members.filter(m => m.memberships && m.memberships.some(mem => mem.offerId === o.id)).length;
      const full = o.usageLimit && used >= o.usageLimit;
      const valText = o.type === 'percentage' ? o.value + '% OFF' : o.type === 'fixed' ? fmtMoney(o.value) + ' OFF' : o.type === '1plus1' ? 'Buy 1 Get 1 Free' : fmtMoney(o.value) + ' Family';
      return `
        <div class="offer-select-card ${full ? 'disabled' : ''}" ${full ? '' : `onclick="selectOffer('${o.id}', this)"`}>
          <input type="radio" name="am-offer" value="${o.id}" ${full ? 'disabled' : ''}>
          <div class="osc-info">
            <div class="osc-name">${o.name}${full ? ' ⛔ Full' : ''}</div>
            <div class="osc-desc">${valText}</div>
          </div>
          <div class="osc-discount">${o.type === '1plus1' ? '1+1' : '-' + (o.type === 'percentage' ? o.value + '%' : fmtMoney(o.value))}</div>
        </div>`;
    }).join('');
  }
}

function openEditMember(memberId) {
  const m = DB.members.find(x => x.id === memberId);
  if (!m) return;
  editingMemberId = memberId;
  isDuplicate = false;
  selectedPlanId = null;
  selectedOfferId = null;
  memberPhotoData = m.photo || null;
  document.getElementById('add-member-form').reset();
  document.getElementById('add-member-title').textContent = 'Edit Member';
  document.getElementById('am-submit-btn').textContent = 'Save Changes';
  document.getElementById('duplicate-alert').style.display = 'none';
  document.getElementById('am-pricing').style.display = 'none';

  document.getElementById('am-name').value = m.name || '';
  document.getElementById('am-phone').value = m.phone || '';
  document.getElementById('am-whatsapp').value = m.whatsapp || '';
  document.getElementById('am-email').value = m.email || '';
  document.getElementById('am-dob').value = m.dob || '';
  document.getElementById('am-gender').value = m.gender || '';
  document.getElementById('am-regdate').value = m.registrationDate || today();
  document.getElementById('am-emergency').value = m.emergency || '';
  document.getElementById('am-notes').value = m.notes || '';
  document.getElementById('am-family').value = m.familyGroupId || '';

  // Goals
  (m.goals || []).forEach(g => {
    const cb = document.querySelector(`#am-goals input[value="${g}"]`);
    if (cb) cb.checked = true;
  });
  const customGoals = (m.goals || []).filter(g => !['Competition Training','Weight Loss','Weight Gain','Strength Training','Muscle Building','Fat Loss','General Fitness'].includes(g));
  if (customGoals.length > 0) {
    document.getElementById('am-goal-custom').value = customGoals.join(', ');
    document.getElementById('am-goal-custom').style.display = 'block';
    document.getElementById('am-goal-custom-chip').querySelector('input').checked = true;
  } else {
    document.getElementById('am-goal-custom').style.display = 'none';
    document.getElementById('am-goal-custom-chip').querySelector('input').checked = false;
  }

  // Photo
  const preview = document.getElementById('am-photo-preview');
  if (memberPhotoData) {
    preview.innerHTML = '';
    preview.classList.add('has-photo');
    preview.style.backgroundImage = `url('${memberPhotoData}')`;
  } else {
    preview.innerHTML = '📷';
    preview.classList.remove('has-photo');
    preview.style.backgroundImage = '';
  }

  document.getElementById('am-paystatus').value = 'auto';
  document.getElementById('am-expected-wrap').style.display = 'none';
  document.getElementById('am-metadata').style.display = 'none';
  document.getElementById('am-pass').style.display = 'none';

  renderMemberPlansAndOffers();
  openModal('modal-add-member');
}

function selectPlan(planId, el) {
  selectedPlanId = planId;
  document.querySelectorAll('#am-plans .plan-select-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  // Re-render offers to respect plan-specific filters
  renderMemberPlansAndOffers();
  // reselect offer if still valid
  if (selectedOfferId) {
    const offer = DB.offers.find(o => o.id === selectedOfferId);
    if (offer && offer.planIds && offer.planIds.length > 0 && !offer.planIds.includes(planId)) {
      selectedOfferId = null;
    }
  }
  updatePricing();
}
function selectOffer(offerId, el) {
  if (selectedOfferId === offerId) {
    selectedOfferId = null;
    el.classList.remove('selected');
  } else {
    selectedOfferId = offerId;
    document.querySelectorAll('#am-offers .offer-select-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  }
  updatePricing();
}
function updatePricing() {
  const plan = DB.plans.find(p => p.id === selectedPlanId);
  if (!plan) { document.getElementById('am-pricing').style.display = 'none'; return; }
  const { price, discount, final } = calcFinalPrice(plan, selectedOfferId ? DB.offers.find(o => o.id === selectedOfferId) : null);
  document.getElementById('am-price').textContent = fmtMoney(price);
  document.getElementById('am-discount').textContent = '-' + fmtMoney(discount);
  document.getElementById('am-final').textContent = fmtMoney(final);
  document.getElementById('am-discount-row').style.display = discount > 0 ? 'flex' : 'none';
  document.getElementById('am-pricing').style.display = 'block';
  const payStatus = document.getElementById('am-paystatus').value;
  if (payStatus === 'auto') {
    document.getElementById('am-paid').value = final;
    document.getElementById('am-paid').max = final;
  }
}
function calculateOfferDiscount(offer, price) { return calcOfferDiscount(offer, price); }

function onPaymentInputChange() {
  const ps = document.getElementById('am-paystatus');
  const paid = parseInt(document.getElementById('am-paid').value) || 0;
  const final = parseInt(document.getElementById('am-final').textContent.replace(/[^0-9]/g, '')) || 0;
  if (ps.value === 'auto') {
    if (paid >= final && final > 0) document.getElementById('am-expected-wrap').style.display = 'none';
  }
}
function onPaymentStatusChange() {
  const ps = document.getElementById('am-paystatus').value;
  const wrap = document.getElementById('am-expected-wrap');
  const expected = document.getElementById('am-expected');
  if (ps === 'pending') {
    wrap.style.display = 'block';
    if (!expected.value) expected.value = today();
  } else {
    wrap.style.display = 'none';
  }
  // auto-set amount so final sum reflects status
  const final = parseInt((document.getElementById('am-final').textContent || '0').replace(/[^0-9]/g, '')) || 0;
  const paidInput = document.getElementById('am-paid');
  if (ps === 'paid') paidInput.value = final;
  else if (ps === 'pending') paidInput.value = 0;
  else if (ps === 'partial') paidInput.value = Math.round(final / 2) || 0;
}

function checkDuplicate(field, value) {
  if (editingMemberId) return; // skip duplicate checks while editing self
  if (!value || value.length < 5) { document.getElementById('duplicate-alert').style.display = 'none'; isDuplicate = false; return; }
  const norm = normalizePhone(value);
  const low = value.toLowerCase().trim();
  const existing = DB.members.find(m => {
    if (m.id === editingMemberId) return false;
    if (field === 'phone') return m.phone && normalizePhone(m.phone) === norm;
    if (field === 'whatsapp') return (m.whatsapp && normalizePhone(m.whatsapp) === norm);
    if (field === 'email') return m.email && m.email.toLowerCase().trim() === low;
    if (field === 'name') return m.name && m.name.toLowerCase().trim() === low;
    return false;
  });
  if (existing) {
    isDuplicate = true;
    const mem = getActiveMembership(existing);
    const st = getMemberStatus(existing);
    const plan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
    document.getElementById('duplicate-alert').innerHTML = `
      <h4>⚠️ MEMBER ALREADY EXISTS</h4>
      <p>An existing member matches this ${field === 'name' ? 'name' : field + ' number'}.</p>
      <div class="da-member">${existing.name} (${existing.id})</div>
      <p>Status: <span class="status-badge ${getStatusClass(st)}">${getStatusLabel(st)}</span></p>
      <p>Plan: ${plan ? plan.name : 'None'} | Expires: ${mem ? fmtDate(mem.expiryDate) : '—'}</p>
      <div class="da-actions">
        <button class="btn btn-sm btn-secondary" onclick="closeModal('modal-add-member');navigateTo('member-profile','${existing.id}')">View Existing Member</button>
        <button class="btn btn-sm btn-outline" onclick="document.getElementById('duplicate-alert').style.display='none';isDuplicate=false">Cancel</button>
      </div>`;
    document.getElementById('duplicate-alert').style.display = 'block';
  } else {
    isDuplicate = false;
    document.getElementById('duplicate-alert').style.display = 'none';
  }
}

function handleAddMember(e) {
  e.preventDefault();
  if (isDuplicate) { showToast('Please resolve duplicate first', 'error'); return false; }
  if (!selectedPlanId) { showToast('Please select a membership plan', 'error'); return false; }

  const goals = [...document.querySelectorAll('#am-goals input:checked')].map(c => c.value);
  const plan = DB.plans.find(p => p.id === selectedPlanId);
  const offer = selectedOfferId ? DB.offers.find(o => o.id === selectedOfferId) : null;
  const originalPrice = plan.price;
  const discount = offer ? calculateOfferDiscount(offer, originalPrice) : 0;
  const finalPrice = Math.max(0, originalPrice - discount);
  const paid = parseInt(document.getElementById('am-paid').value) || 0;
  const regDate = document.getElementById('am-regdate').value || today();

  const memberId = genId('GM');
  const expiryDate = addDuration(regDate, plan.duration, plan.unit);

  // Check for family group based on 1+1 offer
  let familyGroupId = null;
  if (offer && offer.type === '1plus1') {
    familyGroupId = 'FAM-' + Date.now().toString().slice(-6);
  }

  const member = {
    id: memberId,
    name: document.getElementById('am-name').value.trim(),
    phone: document.getElementById('am-phone').value.trim(),
    whatsapp: document.getElementById('am-whatsapp').value.trim() || document.getElementById('am-phone').value.trim(),
    email: document.getElementById('am-email').value.trim(),
    dob: document.getElementById('am-dob').value,
    gender: document.getElementById('am-gender').value,
    registrationDate: regDate,
    goals: goals,
    emergency: document.getElementById('am-emergency').value.trim(),
    notes: document.getElementById('am-notes').value.trim(),
    familyGroupId: familyGroupId,
    status: 'active',
    memberships: [{
      id: genId('MEM'),
      planId: plan.id,
      offerId: offer ? offer.id : null,
      startDate: regDate,
      expiryDate: expiryDate,
      originalPrice: originalPrice,
      discount: discount,
      finalPrice: finalPrice,
      paymentStatus: paid >= finalPrice ? 'paid' : paid > 0 ? 'partial' : 'pending',
      status: 'active',
      freezeHistory: [],
      createdAt: new Date().toISOString()
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  DB.members.push(member);

  // Record payment
  if (paid > 0) {
    DB.payments.push({
      id: genId('PAY'),
      memberId: memberId,
      membershipId: member.memberships[0].id,
      amount: paid,
      method: document.getElementById('am-method').value,
      date: regDate,
      status: paid >= finalPrice ? 'paid' : 'partial',
      pendingAmount: Math.max(0, finalPrice - paid),
      type: 'registration',
      createdAt: new Date().toISOString()
    });
  }

  saveDB();
  closeModal('modal-add-member');
  showToast('Member added successfully!', 'success');
  if (currentPage === 'members') renderMembers();
  else if (currentPage === 'dashboard') renderDashboard();
  return false;
}

// ======================== RENEW MEMBERSHIP ========================
function openRenew(memberId) {
  const m = DB.members.find(x => x.id === memberId);
  if (!m) return;
  const mem = getActiveMembership(m);
  const currentPlan = mem ? DB.plans.find(p => p.id === mem.planId) : null;
  const expiryStatus = mem ? getExpiryStatus(mem.expiryDate) : 'expired';
  const isExpired = expiryStatus === 'expired';

  let body = `
    <div style="margin-bottom:16px">
      <h3 style="margin-bottom:4px">${m.name}</h3>
      <p style="color:var(--gray-500);font-size:13px">${m.id}</p>
    </div>
    <div class="pricing-summary" style="margin-bottom:16px">
      <div class="pricing-row"><span>Current Plan</span><span>${currentPlan ? currentPlan.name : 'None'}</span></div>
      <div class="pricing-row"><span>Current Expiry</span><span>${mem ? fmtDate(mem.expiryDate) : '—'}</span></div>
      <div class="pricing-row"><span>Status</span><span class="status-badge ${getStatusClass(expiryStatus)}">${getStatusLabel(expiryStatus)}</span></div>
    </div>
    <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px">
      ${isExpired ? 'Since membership has expired, the new membership starts from today.' : 'New membership will start from current expiry date so remaining period is not lost.'}
    </p>
    <h3 class="section-title">Select Plan</h3>
    <div class="plans-grid" style="margin-bottom:16px">
  `;
  DB.plans.filter(p => p.active !== false).forEach(p => {
    body += `
      <div class="plan-select-card" onclick="selectRenewPlan('${p.id}', this)">
        <input type="radio" name="renew-plan" value="${p.id}">
        <div class="psc-name">${p.name}</div>
        <div class="psc-price">${fmtMoney(p.price)}</div>
        <div class="psc-duration">${p.duration} ${p.unit}</div>
      </div>`;
  });
  body += `</div>
    <div class="pricing-summary" id="renew-pricing" style="display:none">
      <div class="pricing-row"><span>Plan Price</span><span id="renew-price">₹0</span></div>
      <div class="pricing-row total"><span>Total Amount</span><span id="renew-total">₹0</span></div>
    </div>
    <div class="form-row" style="margin-top:16px">
      <div class="form-group"><label>Amount Paid</label><input type="number" id="renew-paid" min="0" value="0"></div>
      <div class="form-group"><label>Payment Method</label>
        <select id="renew-method"><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option><option value="Bank Transfer">Bank Transfer</option><option value="Other">Other</option></select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal('modal-renew')">Cancel</button>
      <button class="btn btn-primary" onclick="processRenewal('${m.id}', ${isExpired})">Renew Membership</button>
    </div>`;

  document.getElementById('renew-body').innerHTML = body;
  window._renewSelectedPlan = null;
  openModal('modal-renew');
}

function selectRenewPlan(planId, el) {
  window._renewSelectedPlan = planId;
  document.querySelectorAll('#renew-body .plan-select-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const plan = DB.plans.find(p => p.id === planId);
  if (plan) {
    document.getElementById('renew-price').textContent = fmtMoney(plan.price);
    document.getElementById('renew-total').textContent = fmtMoney(plan.price);
    document.getElementById('renew-paid').value = plan.price;
    document.getElementById('renew-pricing').style.display = 'block';
  }
}

function processRenewal(memberId, isExpired) {
  const planId = window._renewSelectedPlan;
  if (!planId) { showToast('Please select a plan', 'error'); return; }
  const plan = DB.plans.find(p => p.id === planId);
  const m = DB.members.find(x => x.id === memberId);
  const mem = getActiveMembership(m);
  const paid = parseInt(document.getElementById('renew-paid').value) || 0;

  // Business rule: start from expiry if not expired, else from today
  let startDate = isExpired ? today() : (mem ? mem.expiryDate : today());
  let expiryDate = addDuration(startDate, plan.duration, plan.unit);

  const newMembership = {
    id: genId('MEM'),
    planId: plan.id,
    offerId: null,
    startDate: startDate,
    expiryDate: expiryDate,
    originalPrice: plan.price,
    discount: 0,
    finalPrice: plan.price,
    paymentStatus: paid >= plan.price ? 'paid' : paid > 0 ? 'partial' : 'pending',
    status: 'active',
    freezeHistory: [],
    createdAt: new Date().toISOString()
  };

  m.memberships.push(newMembership);
  m.status = 'active';
  m.updatedAt = new Date().toISOString();

  DB.payments.push({
    id: genId('PAY'),
    memberId: memberId,
    membershipId: newMembership.id,
    amount: paid,
    method: document.getElementById('renew-method').value,
    date: today(),
    status: paid >= plan.price ? 'paid' : 'partial',
    pendingAmount: Math.max(0, plan.price - paid),
    type: 'renewal',
    createdAt: new Date().toISOString()
  });

  saveDB();
  closeModal('modal-renew');
  showToast('Membership renewed successfully!', 'success');
  if (currentPage === 'member-profile') renderMemberProfile(memberId);
  else if (currentPage === 'dashboard') renderDashboard();
  else if (currentPage === 'members') renderMembers();
}

function quickRenew() {
  // Show a quick member selector
  const members = DB.members.filter(m => {
    const st = getMemberStatus(m);
    return st === 'expired' || st.includes('expiring');
  });
  if (members.length === 0) {
    showToast('No members need renewal right now');
    return;
  }
  navigateTo('members');
  showToast('Select a member to renew', 'warning');
}

function quickPayment() {
  const pending = DB.payments.filter(p => p.status === 'pending' || p.status === 'partial');
  if (pending.length === 0) {
    showToast('No pending payments!');
    return;
  }
  navigateTo('payments');
}

// ======================== FREEZE ========================
function openFreeze(memberId) {
  const m = DB.members.find(x => x.id === memberId);
  if (!m) return;
  const mem = getActiveMembership(m);
  if (!mem) { showToast('No active membership to freeze', 'error'); return; }

  let body = `
    <div style="margin-bottom:16px">
      <h3>Freeze for: ${m.name}</h3>
      <p style="font-size:13px;color:var(--gray-500)">Current Expiry: ${fmtDate(mem.expiryDate)}</p>
    </div>
    <div class="form-group"><label>Freeze Start Date</label><input type="date" id="freeze-start" value="${today()}"></div>
    <div class="form-group"><label>Freeze End Date</label><input type="date" id="freeze-end"></div>
    <div class="form-group"><label>Reason</label>
      <select id="freeze-reason"><option value="Personal">Personal</option><option value="Travel">Travel</option><option value="Medical">Medical</option><option value="Other">Other</option></select>
    </div>
    <div class="pricing-summary" id="freeze-preview" style="display:none">
      <div class="pricing-row"><span>Current Expiry</span><span>${fmtDate(mem.expiryDate)}</span></div>
      <div class="pricing-row"><span>Freeze Days</span><span id="freeze-days">0</span></div>
      <div class="pricing-row total"><span>Adjusted Expiry</span><span id="freeze-new-expiry">—</span></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal('modal-freeze')">Cancel</button>
      <button class="btn btn-primary" onclick="processFreeze('${memberId}')">Freeze Membership</button>
    </div>`;

  document.getElementById('freeze-body').innerHTML = body;

  // Live update
  const startEl = document.getElementById('freeze-start');
  const endEl = document.getElementById('freeze-end');
  function updateFreeze() {
    if (startEl.value && endEl.value) {
      const days = daysBetween(startEl.value, endEl.value);
      if (days > 0) {
        const newExpiry = addDuration(mem.expiryDate, days, 'Days');
        document.getElementById('freeze-days').textContent = days;
        document.getElementById('freeze-new-expiry').textContent = fmtDate(newExpiry);
        document.getElementById('freeze-preview').style.display = 'block';
      }
    }
  }
  startEl.onchange = updateFreeze;
  endEl.onchange = updateFreeze;

  openModal('modal-freeze');
}

function processFreeze(memberId) {
  const m = DB.members.find(x => x.id === memberId);
  const mem = getActiveMembership(m);
  const start = document.getElementById('freeze-start').value;
  const end = document.getElementById('freeze-end').value;
  if (!start || !end) { showToast('Please select freeze dates', 'error'); return; }
  const days = daysBetween(start, end);
  if (days <= 0) { showToast('Freeze end date must be after start', 'error'); return; }

  // Extend expiry
  mem.expiryDate = addDuration(mem.expiryDate, days, 'Days');
  mem.freezeHistory.push({ start, end, days, reason: document.getElementById('freeze-reason').value });
  m.updatedAt = new Date().toISOString();

  saveDB();
  closeModal('modal-freeze');
  showToast(`Membership frozen for ${days} days. Expiry extended to ${fmtDate(mem.expiryDate)}`, 'success');
  renderMemberProfile(memberId);
}

// ======================== STOP MEMBERSHIP ========================
function stopMember(memberId) {
  showConfirm('Stop Membership?', 'The member\'s membership will be stopped. This will be recorded in history.', 'Stop', '⏸', () => {
    const m = DB.members.find(x => x.id === memberId);
    if (!m) return;
    m.status = 'stopped';
    const mem = getActiveMembership(m);
    if (mem) mem.status = 'stopped';
    m.updatedAt = new Date().toISOString();
    saveDB();
    showToast('Membership stopped');
    renderMemberProfile(memberId);
  });
}

// ======================== SEARCH ========================
function handleGlobalSearch(val) {
  if (currentPage !== 'members') navigateTo('members');
  else renderMembers();
}

// ======================== DEMO DATA ========================
function generateDemoData() {
  // Plans
  DB.plans = [
    { id: 'PL-100001', name: 'Monthly', duration: 1, unit: 'Months', price: 1200, description: 'Basic monthly plan', active: true },
    { id: 'PL-100002', name: '3 Months', duration: 3, unit: 'Months', price: 3000, description: 'Popular 3-month plan', active: true },
    { id: 'PL-100003', name: '6 Months', duration: 6, unit: 'Months', price: 5000, description: 'Best value 6-month plan', active: true },
    { id: 'PL-100004', name: 'Yearly', duration: 1, unit: 'Years', price: 8000, description: 'Premium yearly plan', active: true },
  ];

  const goals = ['Weight Loss', 'Muscle Building', 'Strength Training', 'General Fitness', 'Fat Loss', 'Competition Training', 'Weight Gain'];
  const firstNames = ['Arun','Priya','Rahul','Sneha','Vikram','Ananya','Deepak','Meera','Karthik','Pooja','Suresh','Kavita','Ravi','Divya','Amit','Nisha','Sanjay','Rekha','Manoj','Geeta','Vikas','Sunita','Rajesh','Lata','Nitin'];
  const lastNames = ['Kumar','Sharma','Singh','Patel','Reddy','Gupta','Nair','Iyer','Das','Rao','Joshi','Mishra','Tiwari','Verma','Choudhary','Mehta','Shah','Pandey','Chauhan','Bhatt'];

  DB.members = [];
  DB.payments = [];

  const todayDate = new Date();

  firstNames.forEach((fn, i) => {
    const name = fn + ' ' + lastNames[i % lastNames.length];
    const phone = '9' + (876543210 + i * 1111111).toString().substring(0, 10);
    const regDaysAgo = Math.floor(Math.random() * 180) + 30;
    const regDate = new Date(todayDate);
    regDate.setDate(regDate.getDate() - regDaysAgo);

    const planIdx = Math.floor(Math.random() * DB.plans.length);
    const plan = DB.plans[planIdx];
    const memberGoals = [goals[Math.floor(Math.random() * goals.length)]];
    if (Math.random() > 0.6) memberGoals.push(goals[Math.floor(Math.random() * goals.length)]);

    // Vary expiry dates for demo
    let expiryOffset;
    if (i < 3) expiryOffset = -Math.floor(Math.random() * 10) - 1; // Expired
    else if (i < 6) expiryOffset = 0; // Expiring today
    else if (i < 10) expiryOffset = Math.floor(Math.random() * 3) + 1; // 1-3 days
    else if (i < 14) expiryOffset = Math.floor(Math.random() * 4) + 4; // 4-7 days
    else expiryOffset = Math.floor(Math.random() * 90) + 8; // Active

    const startDate = regDate.toISOString().split('T')[0];
    let expiryDate = new Date(regDate);
    if (plan.unit === 'Days') expiryDate.setDate(expiryDate.getDate() + plan.duration);
    else if (plan.unit === 'Months') expiryDate.setMonth(expiryDate.getMonth() + plan.duration);
    else expiryDate.setFullYear(expiryDate.getFullYear() + plan.duration);
    // Override to create variety
    expiryDate = new Date(todayDate);
    expiryDate.setDate(expiryDate.getDate() + expiryOffset);
    const expiryStr = expiryDate.toISOString().split('T')[0];

    const paid = Math.random() > 0.15;
    const partialPaid = !paid && Math.random() > 0.5;
    const paymentStatus = paid ? 'paid' : partialPaid ? 'partial' : 'pending';

    let status = 'active';
    if (i >= 0 && i < 3) status = 'active'; // expired but status active (handled by expiry check)
    if (i === 22) status = 'stopped';

    const memId = 'GM-' + String(100001 + i);
    const membershipId = 'MEM-' + String(200001 + i);

    const member = {
      id: memId,
      name: name,
      phone: phone,
      whatsapp: phone,
      email: Math.random() > 0.6 ? name.toLowerCase().replace(' ', '.') + '@email.com' : '',
      dob: `${1985 + Math.floor(Math.random() * 20)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      gender: Math.random() > 0.4 ? 'Male' : 'Female',
      registrationDate: regDate.toISOString().split('T')[0],
      goals: memberGoals,
      emergency: Math.random() > 0.5 ? '9' + (9876543210 - i * 1111111).toString().substring(0, 10) : '',
      notes: '',
      familyGroupId: i < 2 ? 'FAM-001' : null,
      status: status,
      memberships: [{
        id: membershipId,
        planId: plan.id,
        offerId: i < 2 ? 'OF-300001' : null,
        startDate: startDate,
        expiryDate: expiryStr,
        originalPrice: plan.price,
        discount: i < 2 ? Math.round(plan.price * 0.33) : 0,
        finalPrice: i < 2 ? Math.round(plan.price * 0.67) : plan.price,
        paymentStatus: paymentStatus,
        status: i === 22 ? 'stopped' : 'active',
        freezeHistory: [],
        createdAt: regDate.toISOString()
      }],
      createdAt: regDate.toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Membership history for some
    if (i > 10) {
      const oldPlan = DB.plans[Math.floor(Math.random() * DB.plans.length)];
      const oldStart = new Date(regDate);
      oldStart.setMonth(oldStart.getMonth() - 6);
      member.memberships.push({
        id: 'MEM-H' + i,
        planId: oldPlan.id,
        offerId: null,
        startDate: oldStart.toISOString().split('T')[0],
        expiryDate: regDate.toISOString().split('T')[0],
        originalPrice: oldPlan.price,
        discount: 0,
        finalPrice: oldPlan.price,
        paymentStatus: 'paid',
        status: 'expired',
        freezeHistory: [],
        createdAt: oldStart.toISOString()
      });
    }

    DB.members.push(member);

    // Payment record
    DB.payments.push({
      id: 'PAY-' + String(300001 + i),
      memberId: memId,
      membershipId: membershipId,
      amount: member.memberships[0].finalPrice * (paid ? 1 : partialPaid ? 0.5 : 0),
      method: ['Cash', 'UPI', 'Card', 'Bank Transfer'][Math.floor(Math.random() * 4)],
      date: regDate.toISOString().split('T')[0],
      status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending',
      pendingAmount: member.memberships[0].finalPrice * (paid ? 0 : partialPaid ? 0.5 : 1),
      type: i > 10 ? 'renewal' : 'registration',
      createdAt: regDate.toISOString()
    });
  });

  // Add a few more members with family groups
  for (let i = 0; i < 3; i++) {
    const idx = 25 + i;
    const name = ['Rohit Mehra', 'Sonia Bajaj', 'Tariq Khan'][i];
    const phone = '9' + (801234567 + i * 1000000).toString().substring(0, 10);
    const plan = DB.plans[1];
    const regDate = new Date(todayDate);
    regDate.setDate(regDate.getDate() - Math.floor(Math.random() * 90) - 10);
    const expiryDate = new Date(todayDate);
    expiryDate.setDate(expiryDate.getDate() + Math.floor(Math.random() * 60) - 20);

    const memId = 'GM-' + String(100026 + i);
    DB.members.push({
      id: memId, name, phone, whatsapp: phone, email: '',
      dob: '', gender: i % 2 === 0 ? 'Male' : 'Female',
      registrationDate: regDate.toISOString().split('T')[0],
      goals: [goals[i % goals.length]], emergency: '',
      notes: '', familyGroupId: 'FAM-001', status: 'active',
      memberships: [{
        id: 'MEM-' + String(200026 + i), planId: plan.id, offerId: 'OF-300001',
        startDate: regDate.toISOString().split('T')[0],
        expiryDate: expiryDate.toISOString().split('T')[0],
        originalPrice: plan.price, discount: Math.round(plan.price * 0.33),
        finalPrice: Math.round(plan.price * 0.67),
        paymentStatus: 'paid', status: 'active', freezeHistory: [],
        createdAt: regDate.toISOString()
      }],
      createdAt: regDate.toISOString(), updatedAt: new Date().toISOString()
    });
    DB.payments.push({
      id: 'PAY-' + String(300026 + i), memberId: memId,
      membershipId: 'MEM-' + String(200026 + i),
      amount: Math.round(plan.price * 0.67),
      method: 'Cash', date: regDate.toISOString().split('T')[0],
      status: 'paid', pendingAmount: 0, type: 'registration',
      createdAt: regDate.toISOString()
    });
  }

  // Offers
  DB.offers = [
    {
      id: 'OF-300001', name: '1+1 Family Offer', type: '1plus1', value: 0,
      planIds: ['PL-100002', 'PL-100003'],
      startDate: '2026-01-01', endDate: '2026-12-31',
      description: 'Buy one membership and add one family member free.'
    },
    {
      id: 'OF-300002', name: 'Festival Offer', type: 'percentage', value: 20,
      planIds: ['PL-100004'],
      startDate: '2026-08-15', endDate: '2026-09-30',
      description: '20% off on yearly plan during festival season.'
    },
    {
      id: 'OF-300003', name: 'Family Discount', type: 'family', value: 500,
      planIds: ['PL-100002', 'PL-100003', 'PL-100004'],
      startDate: '2026-01-01', endDate: '2026-12-31',
      description: '₹500 off for family members.'
    }
  ];
}

// ======================== INIT ========================
function init() {
  if (!loadDB()) {
    generateDemoData();
    saveDB();
  }
  // Check if plans exist (in case of data corruption)
  if (!DB.plans || DB.plans.length === 0) {
    generateDemoData();
    saveDB();
  }
  // Close modals/sheets when tapping the backdrop
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
      releaseBodyScroll();
    } else if (e.target.classList.contains('sheet-overlay')) {
      e.target.style.display = 'none';
      releaseBodyScroll();
    }
  });
}

// Run
init();
