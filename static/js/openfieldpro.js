/* ============================================================================
   OpenFieldPro — modal module inside Odysseus.
   Mirror of the HouseCall Pro main IA: side-nav of 7 tabs, top bar with
   search + "+New" menu, item tables with status pills, slide-in detail
   panels, modal forms. Works from inline SAMPLE_DATA when the Fastify API
   at :4000 isn't reachable so the modal feels real without backend work.

   Module contract (matches existing app.js call site):
     import openfieldproModule from './js/openfieldpro.js';
     openfieldproModule.init();
     openfieldproModule.open();   // toggle
     openfieldproModule.refresh(); // re-render current view

   Modal lifecycle is owned by modalManager.js (sidebar click, minimize
   to dock chip, close → state wipe). This file only swaps innerHTML of
   #openfieldpro-content and binds one delegated click handler.
   ============================================================================ */

import * as Modals from './modalManager.js';
import {
  round2, lineSubtotal, cartTotal, snapShotLine, normalizeCartLine,
  applyInvoiceLineItemPatch,
  applyEstimateLineItemPatch,
} from './cart-math.js';

// ---------------------------------------------------------------------------
// 1. CONFIG
// ---------------------------------------------------------------------------

const ICON_HOME = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
const el = id => document.getElementById(id);
const escape = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const money  = n => (n == null ? '—' : '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtTime = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const initials = name => (name || '?').split(' ').slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const TOAST_TTL_MS = 2200;
const STORAGE_KEY = 'odysseus-ofp-session-v1';
const API = '/api/ofp';
const MAX_MODAL_WIDTH = 1200;

// ---------------------------------------------------------------------------
// 2. SAMPLE DATA (offline-ready, realistic volumes)
// ---------------------------------------------------------------------------

const SAMPLE = {
  organization: {
    name: 'Hometown HVAC & Plumbing',
    owner: 'Marcus Rivera',
    email: 'owner@openfieldpro.local',
    phone: '(555) 248-9100',
    address: '418 Birchwood Lane, Springfield, OR 97477',
    timezone: 'America/Los_Angeles',
    tax_rate: 0.0875,
  },
  customers: [
    { id: 'c1', name: 'Priya Chandrasekar', email: 'priya.ch@example.com', phone: '(555) 232-1100', address: '12 Maple Court', city: 'Eugene', state: 'OR', zip: '97401', created_at: '2026-02-03' },
    { id: 'c2', name: 'Tomasz Wojcik',       email: 't.wojcik@example.com', phone: '(555) 232-1200', address: '88 Riverbend Rd', city: 'Eugene', state: 'OR', zip: '97402', created_at: '2026-03-11' },
    { id: 'c3', name: 'Anika Robinson',      email: 'anika.r@example.com',  phone: '(555) 232-1300', address: '105 Cedar Ave',  city: 'Eugene', state: 'OR', zip: '97403', created_at: '2026-01-29' },
    { id: 'c4', name: 'Diego Salazar',       email: 'd.salazar@example.com', phone: '(555) 232-1400', address: '7 Glenview Way',  city: 'Eugene', state: 'OR', zip: '97405', created_at: '2026-04-02' },
    { id: 'c5', name: 'Yuki Tanaka',         email: 'y.tanaka@example.com',  phone: '(555) 232-1500', address: '213 Walnut St',   city: 'Eugene', state: 'OR', zip: '97401', created_at: '2026-03-22' },
    { id: 'c6', name: 'Renée Lavalle',       email: 'r.lavalle@example.com', phone: '(555) 232-1600', address: '940 Oak Ridge Dr',city: 'Eugene', state: 'OR', zip: '97408', created_at: '2026-05-15' },
    { id: 'c7', name: 'Hassan Almasi',       email: 'h.almasi@example.com',  phone: '(555) 232-1700', address: '31 Birch St',     city: 'Springfield', state: 'OR', zip: '97477', created_at: '2026-02-19' },
  ],
  services: [
    { id: 's1', name: 'Standard HVAC Tune-Up',  duration_min: 60, price: 129.00 },
    { id: 's2', name: 'Emergency Plumbing Call', duration_min: 90, price: 219.00 },
    { id: 's3', name: 'Drain Cleaning',          duration_min: 45, price:  99.00 },
    { id: 's4', name: 'AC Install (per ton)',    duration_min: 240, price: 1450.00 },
    { id: 's5', name: 'Water Heater Replace',    duration_min: 180, price: 1280.00 },
  ],
  // Inventory catalog — physical SKUs the techs carry (filters,
  // capacitors, refrigerant, labor). Persisted by /api/ofp/inventory so
  // saved items survive page reloads. Each invoice line item SNAPHOTS
  // {name, default_price, taxable} at add-time so renaming an item later
  // doesn't rewrite history.
  inventory_items: [
    { id: 'inv-filt1625', name: 'HVAC Filter 16x25x1',     category: 'filter',     default_price: 24.99, unit: 'each', taxable: true,  sku: 'FILT-1625', description: 'Pleated air filter, MERV 8',     created_at: '2026-05-01' },
    { id: 'inv-filt2025', name: 'HVAC Filter 20x25x1',     category: 'filter',     default_price: 29.99, unit: 'each', taxable: true,  sku: 'FILT-2025', description: 'Pleated air filter, MERV 11',    created_at: '2026-05-01' },
    { id: 'inv-cap455',   name: 'Dual Capacitor 45/5 µF',  category: 'part',       default_price: 34.99, unit: 'each', taxable: true,  sku: 'CAP-455',   description: 'Dual run capacitor for AC condenser', created_at: '2026-04-15' },
    { id: 'inv-refr410',  name: 'Refrigerant R-410A',      category: 'refrigerant', default_price: 18.50, unit: 'lb',  taxable: true,  sku: 'REFR-410',  description: 'R-410A refrigerant, per pound',  created_at: '2026-04-20' },
    { id: 'inv-refr134',  name: 'Refrigerant R-134a',      category: 'refrigerant', default_price: 14.00, unit: 'lb',  taxable: true,  sku: 'REFR-134',  description: 'R-134a refrigerant, per pound',  created_at: '2026-04-20' },
    { id: 'inv-labdiag',  name: 'Diagnostic Labor',        category: 'labor',      default_price:  89.00, unit: 'hour',taxable: false, sku: 'LAB-DIAG',  description: 'Standard diagnostic labor rate', created_at: '2026-05-10' },
  ],
  jobs: [
    { id: 'j01', title: 'AC Tune-Up', customer_id: 'c1', service_id: 's1', status: 'scheduled',  scheduled_at: `${today()}T09:00:00`, assignee: 'Jordan K.', address: '12 Maple Court, Eugene', notes: 'Customer prefers 9am window.', price: 129 },
    { id: 'j02', title: 'Drain Cleaning', customer_id: 'c2', service_id: 's3', status: 'inprogress', scheduled_at: `${today()}T10:30:00`, assignee: 'Marisol P.', address: '88 Riverbend Rd, Eugene', notes: '', price: 99 },
    { id: 'j03', title: 'Water Heater Replace', customer_id: 'c3', service_id: 's5', status: 'dispatched', scheduled_at: `${today()}T13:00:00`, assignee: 'Devin W.', address: '105 Cedar Ave, Eugene', notes: 'Old unit 12gal — verify gas line.', price: 1280 },
    { id: 'j04', title: 'Emergency Leak', customer_id: 'c4', service_id: 's2', status: 'new',       scheduled_at: null, assignee: null, address: '7 Glenview Way, Eugene', notes: 'Customer reported water under sink.', price: 219 },
    { id: 'j05', title: 'Furnace Inspection', customer_id: 'c5', service_id: 's1', status: 'scheduled',  scheduled_at: `${addDays(1)}T08:00:00`, assignee: 'Jordan K.', address: '213 Walnut St, Eugene', notes: '', price: 129 },
    { id: 'j06', title: 'AC Install', customer_id: 'c6', service_id: 's4', status: 'completed',  scheduled_at: `${addDays(-2)}T09:00:00`, assignee: 'Devin W.', address: '940 Oak Ridge Dr, Eugene', notes: '3-ton unit. Paid in full.', price: 4350 },
    { id: 'j07', title: 'Water Heater Flush', customer_id: 'c7', service_id: 's1', status: 'completed',  scheduled_at: `${addDays(-1)}T14:00:00`, assignee: 'Marisol P.', address: '31 Birch St, Springfield', notes: '', price: 129 },
    { id: 'j08', title: 'Drain Cleaning', customer_id: 'c1', service_id: 's3', status: 'scheduled',  scheduled_at: `${addDays(2)}T11:00:00`, assignee: 'Marisol P.', address: '12 Maple Court, Eugene', notes: 'Recurring maintenance.', price: 99 },
    { id: 'j09', title: 'AC Tune-Up', customer_id: 'c5', service_id: 's1', status: 'onhold',     scheduled_at: null, assignee: null, address: '213 Walnut St, Eugene', notes: 'Waiting on parts.', price: 129 },
    { id: 'j10', title: 'Emergency Plumbing', customer_id: 'c2', service_id: 's2', status: 'completed', scheduled_at: `${addDays(-3)}T07:30:00`, assignee: 'Devin W.', address: '88 Riverbend Rd, Eugene', notes: 'Burst pipe under kitchen.', price: 219 },
    { id: 'j11', title: 'AC Install', customer_id: 'c3', service_id: 's4', status: 'cancelled',  scheduled_at: `${addDays(-5)}T10:00:00`, assignee: null, address: '105 Cedar Ave, Eugene', notes: 'Customer postponed — solar install scheduled first.', price: 4500 },
    { id: 'j12', title: 'Standard HVAC', customer_id: 'c4', service_id: 's1', status: 'scheduled',  scheduled_at: `${addDays(3)}T14:00:00`, assignee: 'Jordan K.', address: '7 Glenview Way, Eugene', notes: '', price: 129 },
  ],
  estimates: [
    { id: 'e1', customer_id: 'c1', title: 'New AC System (3-ton)',    amount: 4850, status: 'sent',     created_at: '2026-06-18', expires_at: '2026-07-02' },
    { id: 'e2', customer_id: 'c4', title: 'Repipe Bathroom',           amount: 1820, status: 'approved', created_at: '2026-06-12', expires_at: '2026-06-26' },
    { id: 'e3', customer_id: 'c5', title: 'Smart Thermostat Install',  amount:  420, status: 'draft',    created_at: '2026-06-22', expires_at: '2026-07-06' },
    { id: 'e4', customer_id: 'c6', title: 'Tankless Water Heater',     amount: 3650, status: 'sent',     created_at: '2026-06-09', expires_at: '2026-06-23' },
    { id: 'e5', customer_id: 'c7', title: 'Annual Maintenance Plan',   amount: 1290, status: 'declined', created_at: '2026-05-30', expires_at: '2026-06-13' },
  ],
  invoices: [
    { id: 'i1', customer_id: 'c6', job_id: 'j06', total: 4450, balance:  0,  status: 'paid',     issued_at: '2026-06-23', due_at: '2026-07-07' },
    { id: 'i2', customer_id: 'c7', job_id: 'j07', total:  129, balance:  0,  status: 'paid',     issued_at: '2026-06-25', due_at: '2026-07-09' },
    { id: 'i3', customer_id: 'c2', job_id: 'j10', total:  219, balance:  0,  status: 'paid',     issued_at: '2026-06-22', due_at: '2026-07-06' },
    { id: 'i4', customer_id: 'c1', title: 'Maintenance Q2', total:  258, balance: 258, status: 'sent',     issued_at: '2026-06-24', due_at: '2026-07-08' },
    { id: 'i5', customer_id: 'c3', title: 'Service Call',   total:  180, balance: 180, status: 'overdue',  issued_at: '2026-06-15', due_at: '2026-06-29' },
    { id: 'i6', customer_id: 'c5', title: 'Service Call',   total:  129, balance:   0, status: 'paid',     issued_at: '2026-06-25', due_at: '2026-07-09' },
    { id: 'i7', customer_id: 'c4', title: 'Estimate Balance', total: 1820, balance: 910, status: 'sent',    issued_at: '2026-06-18', due_at: '2026-07-02' },
    { id: 'i8', customer_id: 'c1', title: 'Repair',          total:   95, balance:  95, status: 'draft',    issued_at: '2026-06-26', due_at: '2026-07-10' },
  ],
  team: [
    { id: 't1', name: 'Jordan Kowalski',   role: 'Technician',  email: 'jordan.k@hometown.local', active: true },
    { id: 't2', name: 'Marisol Pereira',    role: 'Technician',  email: 'marisol.p@hometown.local', active: true },
    { id: 't3', name: 'Devin Whittaker',    role: 'Lead Tech',   email: 'devin.w@hometown.local',   active: true },
    { id: 't4', name: 'Marcus Rivera',      role: 'Owner',       email: 'marcus@hometown.local',    active: true },
    { id: 't5', name: 'Tasha Ortiz',        role: 'Dispatcher',  email: 'tasha.o@hometown.local',   active: true },
  ],
};

// ---------------------------------------------------------------------------
// 3. STATE STORE
// ---------------------------------------------------------------------------

const state = {
  route: 'dashboard',
  query: '',
  jobFilter: 'all',
  jobs: structuredClone(SAMPLE.jobs),
  customers: structuredClone(SAMPLE.customers),
  estimates: structuredClone(SAMPLE.estimates),
  invoices: structuredClone(SAMPLE.invoices),
  inventory_items: structuredClone(SAMPLE.inventory_items),
  // Edit buffer for the invoice draft panel. Populated when the user opens
  // an existing invoice or starts a new one; re-rendered on every line-item
  // add/remove/qty/price edit so totals stay live without serialize/reparse
  // gymnastics. Cleared on close / cancel / save-by-id.
  invoiceDraft: null,
  // Edit buffer for the estimate draft panel — same shape as invoiceDraft
  // but writes `amount` (estimates keep the legacy flat-amount field) and
  // uses the status enum [draft, sent, approved, declined]. Set on
  // open-estimate / new-estimate; cleared on close / cancel / save-by-id.
  // Only one draft is active at a time (mutually exclusive — opening the
  // new-invoice panel implies the previous estimate draft is done).
  estimateDraft: null,
  // Picker overlay search query — kept separate from `query` (main-view
  // search) so typing through the picker doesn't leak filter text into
  // the inventory / jobs / customers main-view search box. Reset every
  // time the picker opens; carries through within one picker session.
  pickQuery: '',
  api: { up: false, lastSync: 0, mode: 'offline' },
  currentView: null,
};

function persist() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    jobs: state.jobs,
    customers: state.customers,
    inventory_items: state.inventory_items,
    invoices: state.invoices,
    estimates: state.estimates,
  })); } catch (_) {}
}
function hydrate() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.jobs))            state.jobs            = s.jobs;
    if (Array.isArray(s.customers))       state.customers       = s.customers;
    if (Array.isArray(s.inventory_items)) state.inventory_items = s.inventory_items;
    if (Array.isArray(s.invoices)) {
      // Backfill empty line_items so legacy sessionStorage payloads from
      // before this feature shipped don't surface null-refs in the cart UI.
      state.invoices = s.invoices.map(i => ({ ...i, line_items: i.line_items || [] }));
    }
    if (Array.isArray(s.estimates)) {
      // Same backfill as invoices — legacy sessionStorage payloads from
      // before estimates-CRUD shipped don't have line_items, so map-replace
      // with [] before the cart-math surface sees them.
      state.estimates = s.estimates.map(e => ({ ...e, line_items: e.line_items || [] }));
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 4. API CLIENT (offline-tolerant — every call is wrapped in a try)
// ---------------------------------------------------------------------------

async function api(path, init = {}) {
  const token = localStorage.getItem('ofp_token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) };
  return fetch(`${API}${path}`, { ...init, headers });
}
async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('login failed');
  const data = await res.json();
  if (data.token) localStorage.setItem('ofp_token', data.token);
  return data;
}
async function apiOrFallback(path, fallbackValue, attemptNx = false) {
  // Skipped from hot render path; only used by refresh() — keeps real
  // backend data when reachable without crashing the UI when it isn't.
  if (!state.api.up) return fallbackValue;
  try {
    const res = await api(path);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    if (attemptNx) state.api.up = false;
    return fallbackValue;
  }
}
/** Round-trip a write to the Fastify API. Fire-and-forget: returns a
 *  Promise but CRUD helpers don't `await` it, so the local optimistic
 *  update + `persist()` stays synchronous and the user sees instant
 *  feedback. If `state.api.up` is false (pingApi failed at modal open)
 *  this is a no-op return — modal stays offline-first. On HTTP failure
 *  a `console.warn` fires but no toast (toast spam from network blips
 *  would interrupt the user). The next manual refresh() will reconcile
 *  whatever the server has. ponytail: silent on offline. Ceiling:
 *  failed writes don't roll back — sessionStorage keeps the local row
 *  and the user sees the change until the next refresh-on-reconnect
 *  overwrites. Upgrade: queue failed writes for retry on next pingOk. */
async function apiWrite(method, path, body) {
  if (!state.api.up) {
    return { ok: true, offline: true };
  }
  try {
    const init = { method };
    if (body !== undefined && body !== null) init.body = JSON.stringify(body);
    const res = await api(path, init);
    if (!res.ok) throw new Error(`API ${method} ${path} returned status ${res.status}`);
    return { ok: true, data: await res.json().catch(() => null) };
  } catch (e) {
    console.warn(`apiWrite failed: ${method} ${path}`, e.message);
    return { ok: false, error: e.message };
  }
}
async function pingApi() {
  try {
    const res = await fetch(`${API}/health`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error();
    state.api.up = true;
    state.api.mode = 'online';
  } catch (_) {
    state.api.up = false;
    state.api.mode = 'offline';
  }
}

// ---------------------------------------------------------------------------
// 5. HELPERS (CRUD on local store)
// ---------------------------------------------------------------------------

function lookupCustomer(id) { return state.customers.find(c => c.id === id); }
function lookupService(id)  { return SAMPLE.services.find(s => s.id === id); }
function lookupInventoryItem(id) { return state.inventory_items.find(i => i.id === id); }

function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8); }

function createJob(payload) {
  const job = {
    id: uid('j'),
    title: payload.title || 'New job',
    customer_id: payload.customer_id,
    service_id: payload.service_id || 's1',
    status: 'scheduled',
    scheduled_at: payload.scheduled_at || null,
    assignee: payload.assignee || null,
    address: payload.address || (lookupCustomer(payload.customer_id)?.address + ', ' + (lookupCustomer(payload.customer_id)?.city || '')),
    notes: payload.notes || '',
    price: Number(payload.price || lookupService(payload.service_id)?.price || 0),
  };
  state.jobs.unshift(job);
  persist();
  apiWrite('POST', '/jobs', job);
  return job;
}
function updateJob(id, patch) {
  const j = state.jobs.find(x => x.id === id);
  if (!j) return null;
  Object.assign(j, patch);
  persist();
  apiWrite('PUT', '/jobs/' + id, patch);
  return j;
}
function deleteJob(id) {
  state.jobs = state.jobs.filter(x => x.id !== id);
  persist();
  apiWrite('DELETE', '/jobs/' + id);
}
function createCustomer(payload) {
  const c = {
    id: uid('c'),
    name: payload.name,
    email: payload.email || '',
    phone: payload.phone || '',
    address: payload.address || '',
    city: payload.city || '',
    state: payload.state || '',
    zip: payload.zip || '',
    created_at: today(),
  };
  state.customers.unshift(c);
  persist();
  apiWrite('POST', '/customers', c);
  return c;
}
function updateCustomer(id, patch) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return null;
  Object.assign(c, patch);
  persist();
  apiWrite('PUT', '/customers/' + id, patch);
  return c;
}

// Inventory CRUD (local-state). The server /api/ofp/inventory endpoint
// backs the persistence; refresh() syncs in the other direction so the
// modal works offline.
function createInventoryItem(payload) {
  const it = {
    id: uid('inv'),
    name: payload.name || 'New item',
    category: payload.category || 'part',
    default_price: Number(payload.default_price || 0),
    unit: payload.unit || 'each',
    taxable: payload.taxable !== false,   // default true; explicit false respected
    sku: payload.sku || '',
    description: payload.description || '',
    created_at: today(),
  };
  state.inventory_items.unshift(it);
  persist();
  apiWrite('POST', '/inventory', it);
  return it;
}
function updateInventoryItem(id, patch) {
  const it = state.inventory_items.find(x => x.id === id);
  if (!it) return null;
  Object.assign(it, patch);
  persist();
  apiWrite('PUT', '/inventory/' + id, patch);
  return it;
}
function deleteInventoryItem(id) {
  state.inventory_items = state.inventory_items.filter(x => x.id !== id);
  persist();
  apiWrite('DELETE', '/inventory/' + id);
}

// Invoice CRUD (local-state). `line_items` recompute flows happen in the
// detail panel (see renderInvoiceDetail) so the running total stays live;
// on save-invoice the mirrored server PUT regenerates `total` defensively.
function createInvoice(payload) {
  // payload.line_items is already cart-shaped (it was assembled by the
  // pick-inventory-item handler calling snapShotLine on inventory rows);
  // use normalizeCartLine for safe type coercion. Calling snapShotLine
  // here is the bug that quietly zeroed every price on save — cart rows
  // use `price`, but snapShotLine reads inventory's `default_price`.
  const items = Array.isArray(payload.line_items) ? payload.line_items.map(normalizeCartLine) : [];
  const inv = {
    id: uid('i'),
    customer_id: payload.customer_id || '',
    title: payload.title || 'New invoice',
    total: cartTotal(items),
    balance: Number(payload.balance || 0),
    status: payload.status || 'draft',
    issued_at: payload.issued_at || today(),
    due_at: payload.due_at || addDays(14),
    job_id: payload.job_id || null,
    line_items: items,
  };
  state.invoices.unshift(inv);
  persist();
  apiWrite('POST', '/invoices', inv);
  return inv;
}
function updateInvoice(id, patch) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return null;
  // line_items-aware patch via the pure helper in cart-math.js — same
  // rules as the server's PUT: cart sum wins, body's total is ignored.
  const updated = applyInvoiceLineItemPatch(inv, patch);
  Object.assign(inv, updated);
  persist();
  apiWrite('PUT', '/invoices/' + id, patch);
  return inv;
}
function deleteInvoice(id) {
  state.invoices = state.invoices.filter(x => x.id !== id);
  persist();
  apiWrite('DELETE', '/invoices/' + id);
}

// Estimate CRUD (local-state). Mirrors the invoice pattern: cart-aware
// patch via applyEstimateLineItemPatch so the running `amount` stays
// live, server PUT regenerates `amount` defensively. Status enum is
// [draft, sent, approved, declined] — no `balance` field (estimates
// are quotes, not invoices, so the consumer pays the actual invoice
// after approving).
function createEstimate(payload) {
  // Same cart-shaped-vs-inventory-shaped trap as createInvoice — payload
  // line_items are cart-shaped (from snapShotLine), so use
  // normalizeCartLine (NOT snapShotLine) so prices survive the round-trip.
  const items = Array.isArray(payload.line_items) ? payload.line_items.map(normalizeCartLine) : [];
  const est = {
    id: uid('e'),
    customer_id: payload.customer_id || '',
    title: payload.title || 'New estimate',
    amount: cartTotal(items),
    status: payload.status || 'draft',
    created_at: payload.created_at || today(),
    expires_at: payload.expires_at || addDays(14),
    line_items: items,
  };
  state.estimates.unshift(est);
  persist();
  apiWrite('POST', '/estimates', est);
  return est;
}
function updateEstimate(id, patch) {
  const est = state.estimates.find(x => x.id === id);
  if (!est) return null;
  const updated = applyEstimateLineItemPatch(est, patch);
  Object.assign(est, updated);
  persist();
  apiWrite('PUT', '/estimates/' + id, patch);
  return est;
}
function deleteEstimate(id) {
  state.estimates = state.estimates.filter(x => x.id !== id);
  persist();
  apiWrite('DELETE', '/estimates/' + id);
}

// Live-total updater: rebuilds the cart-total + per-row subtotal cells in
// place WITHOUT re-rendering the whole detail panel — preserves the user's
// input focus while typing. Called by line-price / line-qty change events.
// Draft-aware: works for either invoiceDraft or estimateDraft (whichever
// is currently overlay-open). Estimates use the same line_items shape as
// invoices, so cartTotal() gives the right number either way; the
// grand-total label "Total"/"Amount" is rendered in the detail panel
// itself, not here.
function updateCartTotalsDisplay() {
  const draft = state.invoiceDraft || state.estimateDraft;
  if (!draft) return;
  draft.line_items.forEach((li, idx) => {
    const cell = document.querySelector(`[data-line-subtotal="${idx}"]`);
    if (cell) cell.textContent = money(lineSubtotal(li));
  });
  const grand = document.querySelector('[data-ofp-cart-total]');
  if (grand) grand.textContent = money(cartTotal(draft.line_items));
}

// ---------------------------------------------------------------------------
// 6. COMPONENT PRIMITIVES (return HTML strings)
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
  { id: 'jobs',       label: 'Jobs',       icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13l2 2 4-4"/></svg>' },
  { id: 'customers',  label: 'Customers',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  { id: 'schedule',   label: 'Schedule',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { id: 'estimates',  label: 'Estimates',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
  { id: 'invoices',   label: 'Invoices',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>' },
  { id: 'inventory',  label: 'Inventory',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
  { id: 'settings',   label: 'Settings',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
];

function renderSideNav() {
  return `
    <nav class="ofp-sidenav">
      ${TABS.map(t => `
        <a data-ofp-action="navigate" data-ofp-route="${t.id}" class="${state.route === t.id ? 'is-active' : ''}" href="#${t.id}">
          <span class="ofp-sidenav-icon">${t.icon}</span>
          <span>${escape(t.label)}</span>
          ${t.badge ? `<span class="ofp-sidenav-badge is-phase">${escape(t.badge)}</span>` : ''}
        </a>
      `).join('')}
    </nav>
  `;
}

function StatusPill(status) {
  const map = {
    new: 'status-new',         scheduled: 'status-scheduled', dispatched: 'status-dispatched',
    inprogress: 'status-inprogress', completed: 'status-completed', cancelled: 'status-cancelled',
    onhold: 'status-onhold', draft: 'status-draft', sent: 'status-sent',
    paid: 'status-paid', overdue: 'status-overdue', approved: 'status-approved', declined: 'status-declined',
  };
  const label = ({
    inprogress: 'In Progress', onhold: 'On Hold',
  })[status] || status;
  return `<span class="ofp-status-pill ${map[status] || 'status-draft'}">${escape(label)}</span>`;
}

function renderApiBanner() {
  return `
    <div class="ofp-api-banner ${state.api.up ? 'is-online' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>
        ${state.api.up
          ? `Backend connected (Fastify API on :4000). Live data refresh would hit the API.`
          : `Running on local sample data. Podman stack offline — bring it up via <code>podman compose -f docker-compose.local.yml up -d</code> in <code>~/Downloads/openfieldpro_phase1/openfieldpro</code> to switch to live data.`}
      </span>
    </div>
  `;
}

function renderTopBar({ title, primaryAction, searchPlaceholder, searchVisible = true }) {
  return `
    <div class="ofp-topbar">
      <h2>${escape(title)}</h2>
      <div class="ofp-topbar-spacer"></div>
      ${searchVisible ? `
        <input class="ofp-search" type="search" placeholder="${escape(searchPlaceholder || 'Search…')}"
               data-ofp-action="search-input" value="${escape(state.query)}" />`: ''}
      ${primaryAction || ''}
    </div>
  `;
}

function renderNewDropdown() {
  return `
    <div class="ofp-dropdown">
      <button class="ofp-btn is-primary" data-ofp-action="toggle-new-menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        + New
      </button>
      <div class="ofp-dropdown-menu" data-ofp-action="new-menu" style="display:none;">
        <button data-ofp-action="new-job">+ New Job</button>
        <button data-ofp-action="new-customer">+ New Customer</button>
        <button data-ofp-action="new-inventory">+ New Inventory Item</button>
        <button data-ofp-action="new-invoice">+ New Invoice</button>
        <button data-ofp-action="new-estimate">+ New Estimate</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 7. VIEW: DASHBOARD
// ---------------------------------------------------------------------------

function renderDashboard() {
  const todayStr = today();
  const todayJobs    = state.jobs.filter(j => j.scheduled_at && j.scheduled_at.startsWith(todayStr));
  const openJobs     = state.jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
  const weekRevenue  = state.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const monthRevenue = weekRevenue + 9450; // sample-only: pretend a fuller month
  const unpaid       = state.invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const pendingEstimates = state.estimates.filter(e => e.status === 'sent').length;
  const conversion = state.estimates.length === 0 ? 0
    : Math.round(100 * state.estimates.filter(e => ['approved', 'declined'].includes(e.status)).length / state.estimates.length);

  const kpis = `
    <div class="ofp-kpi-row">
      <div class="ofp-kpi">
        <div class="ofp-kpi-label">Open Jobs</div>
        <div class="ofp-kpi-value">${openJobs.length}</div>
        <div class="ofp-kpi-delta is-up">+3 this week</div>
      </div>
      <div class="ofp-kpi">
        <div class="ofp-kpi-label">Revenue this month</div>
        <div class="ofp-kpi-value">${money(monthRevenue)}</div>
        <div class="ofp-kpi-delta is-up">+12% vs last</div>
      </div>
      <div class="ofp-kpi">
        <div class="ofp-kpi-label">Unpaid invoices</div>
        <div class="ofp-kpi-value">${money(unpaid)}</div>
        <div class="ofp-kpi-delta is-down">${state.invoices.filter(i => i.status === 'overdue').length} overdue</div>
      </div>
      <div class="ofp-kpi">
        <div class="ofp-kpi-label">Estimate conversion</div>
        <div class="ofp-kpi-value">${conversion}%</div>
        <div class="ofp-kpi-delta">${pendingEstimates} pending</div>
      </div>
    </div>
  `;

  const todaySchedule = todayJobs.length === 0
    ? `<div class="ofp-empty"><p>No jobs scheduled for today.</p></div>`
    : todayJobs.map(j => {
        const cust = lookupCustomer(j.customer_id);
        return `
          <div data-ofp-action="open-job" data-ofp-id="${j.id}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--ofp-border);cursor:pointer;">
            <div style="font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;color:var(--ofp-brand);min-width:60px;">${escape(fmtTime(j.scheduled_at))}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;">${escape(j.title)}</div>
              <div style="font-size:11px;color:var(--ofp-text-muted);">${escape(cust?.name || '—')} · ${escape(j.assignee || 'Unassigned')}</div>
            </div>
            ${StatusPill(j.status)}
          </div>
        `;
      }).join('');

  const recentInvoices = state.invoices.slice(0, 5).map(i => {
    const cust = lookupCustomer(i.customer_id);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--ofp-border);font-size:12px;">
        <div><span class="ofp-avatar" style="width:22px;height:22px;font-size:9px;margin-right:8px;">${escape(initials(cust?.name))}</span>${escape(cust?.name || '—')}</div>
        <div style="color:var(--ofp-text-muted);">${escape(fmtDate(i.issued_at))}</div>
        <div style="font-weight:600;font-variant-numeric:tabular-nums;">${money(i.total)}</div>
        ${StatusPill(i.status)}
      </div>
    `;
  }).join('');

  return `
    ${renderTopBar({ title: 'Dashboard', primaryAction: renderNewDropdown(), searchVisible: false })}
    ${renderApiBanner()}
    ${kpis}
    <div class="ofp-rows-row">
      <section class="ofp-section">
        <div class="ofp-section-head"><h3>Today's schedule</h3>
          <button class="ofp-btn is-ghost" data-ofp-action="navigate" data-ofp-route="schedule">Open schedule →</button>
        </div>
        <div class="ofp-section-body">${todaySchedule}</div>
      </section>
      <section class="ofp-section">
        <div class="ofp-section-head"><h3>Recent invoices</h3>
          <button class="ofp-btn is-ghost" data-ofp-action="navigate" data-ofp-route="invoices">All invoices →</button>
        </div>
        <div class="ofp-section-body">${recentInvoices}</div>
      </section>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 8. VIEW: JOBS
// ---------------------------------------------------------------------------

const JOB_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'new',        label: 'New' },
  { id: 'scheduled',  label: 'Scheduled' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'completed',  label: 'Completed' },
  { id: 'cancelled',  label: 'Cancelled' },
  { id: 'onhold',     label: 'On Hold' },
];

function jobFilterCounts() {
  const out = {};
  for (const j of state.jobs) out[j.status] = (out[j.status] || 0) + 1;
  out.all = state.jobs.length;
  return out;
}

function renderJobs() {
  const counts = jobFilterCounts();
  const filtered = state.jobs
    .filter(j => state.jobFilter === 'all' || j.status === state.jobFilter)
    .filter(j => !state.query || (j.title + ' ' + (lookupCustomer(j.customer_id)?.name || '') + ' ' + (j.address || '')).toLowerCase().includes(state.query.toLowerCase()))
    .sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''));

  const filterPills = JOB_FILTERS.map(f => `
    <button class="ofp-filter-pill ${state.jobFilter === f.id ? 'is-active' : ''}" data-ofp-action="filter-jobs" data-ofp-id="${f.id}">
      ${escape(f.label)}<span class="ofp-filter-count">${counts[f.id] || 0}</span>
    </button>
  `).join('');

  const rows = filtered.length === 0
    ? `<tr><td colspan="6" class="ofp-table-empty">No jobs match this filter.</td></tr>`
    : filtered.map(j => {
        const cust = lookupCustomer(j.customer_id);
        return `
          <tr data-ofp-action="open-job" data-ofp-id="${j.id}">
            <td class="ofp-cell-strong">#${escape(j.id.slice(1))}</td>
            <td>
              <div class="ofp-cell-strong">${escape(j.title)}</div>
              <div class="ofp-cell-muted" style="font-size:11px;">${escape(lookupService(j.service_id)?.name || '')}</div>
            </td>
            <td><span class="ofp-avatar" style="margin-right:6px;">${escape(initials(cust?.name))}</span>${escape(cust?.name || '—')}</td>
            <td class="ofp-cell-muted">${escape(j.scheduled_at ? fmtDate(j.scheduled_at) + ' · ' + fmtTime(j.scheduled_at) : '—')}</td>
            <td class="ofp-cell-muted">${escape(j.assignee || 'Unassigned')}</td>
            <td>${StatusPill(j.status)}</td>
          </tr>
        `;
      }).join('');

  return `
    ${renderTopBar({ title: 'Jobs', primaryAction: renderNewDropdown() })}
    ${renderApiBanner()}
    <div class="ofp-filters">${filterPills}</div>
    <section class="ofp-section">
      <table class="ofp-table">
        <thead>
          <tr><th>ID</th><th>Job</th><th>Customer</th><th>Scheduled</th><th>Assignee</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 9. VIEW: CUSTOMERS
// ---------------------------------------------------------------------------

function renderCustomers() {
  const list = state.customers.filter(c =>
    !state.query || (c.name + ' ' + c.email + ' ' + c.phone + ' ' + c.address).toLowerCase().includes(state.query.toLowerCase())
  );

  const rows = list.length === 0
    ? `<tr><td colspan="4" class="ofp-table-empty">No customers yet. Click <strong>+New Customer</strong> to add one.</td></tr>`
    : list.map(c => {
        const customerJobs      = state.jobs.filter(j => j.customer_id === c.id);
        const customerEstimates = state.estimates.filter(e => e.customer_id === c.id);
        const customerInvoices  = state.invoices.filter(i => i.customer_id === c.id);
        const lastJob = customerJobs.sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''))[0];
        return `
          <tr data-ofp-action="open-customer" data-ofp-id="${c.id}">
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="ofp-avatar">${escape(initials(c.name))}</span>
                <div>
                  <div class="ofp-cell-strong">${escape(c.name)}</div>
                  <div class="ofp-cell-muted" style="font-size:11px;">${escape(c.email || c.phone || '—')}</div>
                </div>
              </div>
            </td>
            <td class="ofp-cell-muted">${escape(c.city || '—')}, ${escape(c.state || '')}</td>
            <td class="ofp-cell-muted">${customerJobs.length} job${customerJobs.length === 1 ? '' : 's'} · ${customerEstimates.length} est · ${customerInvoices.length} inv</td>
            <td class="ofp-cell-muted">${lastJob ? fmtDate(lastJob.scheduled_at) : '—'}</td>
          </tr>
        `;
      }).join('');

  return `
    ${renderTopBar({
      title: 'Customers',
      primaryAction: `<button class="ofp-btn is-primary" data-ofp-action="new-customer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        + New Customer
      </button>`,
    })}
    ${renderApiBanner()}
    <section class="ofp-section">
      <table class="ofp-table">
        <thead><tr><th>Name</th><th>Location</th><th>Activity</th><th>Last job</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 10. VIEW: SCHEDULE (week grid; today highlighted, jobs placed at hour)
// ---------------------------------------------------------------------------

function renderSchedule() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(i - 1));
  const lanes = ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'];

  // Cell rendering: pick the lane from the job's scheduled time (HH:00).
  const jobsByCell = {};
  for (const j of state.jobs) {
    if (!j.scheduled_at) continue;
    const d = j.scheduled_at.slice(0, 10);
    if (!days.includes(d)) continue;
    const hr = parseInt(j.scheduled_at.slice(11, 13), 10);
    const laneIdx = Math.min(lanes.length - 1, Math.max(0, Math.floor((hr - 8) / 2)));
    const key = `${d}|${laneIdx}`;
    (jobsByCell[key] = jobsByCell[key] || []).push(j);
  }

  const cells = days.map((d, dayIdx) => {
    const isToday = d === today();
    const dayName = new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
    const dayNum = new Date(d).getDate();
    let headers = `<div class="${isToday ? 'ofp-schedule-day is-today' : ''}" style="${dayIdx === 0 ? 'border-left:none;' : ''}">
        <div>${escape(dayName)}</div>
        <div style="font-size:13px;color:var(--ofp-text);">${dayNum}</div>
      </div>`;
    let body = lanes.map((lane, laneIdx) => {
      const list = jobsByCell[`${d}|${laneIdx}`] || [];
      const events = list.map(j => {
        const cls = j.status === 'completed' ? 'is-completed'
                  : j.status === 'inprogress' ? 'is-inprogress'
                  : j.status === 'cancelled' ? 'is-cancelled' : '';
        return `<div class="ofp-schedule-event ${cls}" data-ofp-action="open-job" data-ofp-id="${j.id}" title="${escape(j.title)} · ${escape(lookupCustomer(j.customer_id)?.name || '')}">
          <strong>${escape(fmtTime(j.scheduled_at))}</strong> ${escape(j.title)}
        </div>`;
      }).join('');
      return `<div class="ofp-schedule-cell">${events}</div>`;
    }).join('');
    return headers + body;
  }).join('');

  return `
    ${renderTopBar({ title: 'Schedule', primaryAction: renderNewDropdown(), searchVisible: false })}
    ${renderApiBanner()}
    <div class="ofp-filters">
      <button class="ofp-filter-pill is-active">Week</button>
      <button class="ofp-filter-pill" disabled>Day</button>
      <button class="ofp-filter-pill" disabled>Month</button>
      <span class="ofp-cell-muted" style="margin-left:auto;font-size:12px;">Drag-and-drop reschedule: <strong>Phase 2</strong></span>
    </div>
    <div class="ofp-schedule">
      <div class="ofp-schedule-header" style="display:contents;">
        <div class="ofp-schedule-lane-label"></div>
        ${cells}
      </div>
      ${lanes.map((lane, i) => `
        <div class="ofp-schedule-lane-label">${escape(lane)}</div>
        ${days.map(() => `<div class="ofp-schedule-cell"></div>`).join('')}
      `).join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 11. VIEW: ESTIMATES (live CRUD; replaces the previous Phase-2 stub)
// ---------------------------------------------------------------------------

function renderEstimates() {
  const totalAmount  = state.estimates.reduce((s, e) => s + (e.amount || 0), 0);
  const pending      = state.estimates.filter(e => e.status === 'sent').length;
  const draftCount   = state.estimates.filter(e => e.status === 'draft').length;
  const itemCount    = state.estimates.reduce((s, e) => s + (e.line_items || []).length, 0);
  const rows = state.estimates.map(e => {
    const cust = lookupCustomer(e.customer_id);
    const ec   = (e.line_items || []).length;
    return `
      <tr data-ofp-action="open-estimate" data-ofp-id="${e.id}">
        <td class="ofp-cell-strong">#${escape(e.id.slice(1))}</td>
        <td>
          <div class="ofp-cell-strong">${escape(e.title)}</div>
          <div class="ofp-cell-muted" style="font-size:11px;">${escape(cust?.name || '—')}${ec > 0 ? ` · ${ec} item${ec === 1 ? '' : 's'}` : ''}</div>
        </td>
        <td class="ofp-cell-muted">${escape(fmtDate(e.created_at))}</td>
        <td class="ofp-cell-muted">${escape(fmtDate(e.expires_at))}</td>
        <td class="ofp-cell-money">${money(e.amount)}</td>
        <td>${StatusPill(e.status)}</td>
      </tr>
    `;
  }).join('');
  return `
    ${renderTopBar({
      title: 'Estimates',
      primaryAction: `<button class="ofp-btn is-primary" data-ofp-action="new-estimate">+ New Estimate</button>`,
    })}
    ${renderApiBanner()}
    <div class="ofp-kpi-row">
      <div class="ofp-kpi"><div class="ofp-kpi-label">Total quoted</div><div class="ofp-kpi-value">${money(totalAmount)}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Awaiting response</div><div class="ofp-kpi-value">${pending}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Drafts</div><div class="ofp-kpi-value">${draftCount}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Line items cataloged</div><div class="ofp-kpi-value">${itemCount}</div></div>
    </div>
    <section class="ofp-section">
      <table class="ofp-table">
        <thead><tr><th>ID</th><th>Title</th><th>Created</th><th>Expires</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${rows.length === 0 ? `<tr><td colspan="6" class="ofp-table-empty">No estimates yet. Click <strong>+ New Estimate</strong> to create one.</td></tr>` : rows}</tbody>
      </table>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 12. VIEW: INVOICES (stub — Phase 2)
// ---------------------------------------------------------------------------

function renderInvoices() {
  const totals = state.invoices.reduce((s, i) => s + (i.total || 0), 0);
  const balances = state.invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const rows = state.invoices.map(i => {
    const cust = lookupCustomer(i.customer_id);
    const itemCount = (i.line_items || []).length;
    return `
      <tr data-ofp-action="open-invoice" data-ofp-id="${i.id}">
        <td class="ofp-cell-strong">#${escape(i.id.slice(1))}</td>
        <td>
          <div class="ofp-cell-strong">${escape(i.title || 'Invoice')}</div>
          <div class="ofp-cell-muted" style="font-size:11px;">
            ${escape(cust?.name || '—')}${itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
          </div>
        </td>
        <td class="ofp-cell-muted">${escape(fmtDate(i.issued_at))}</td>
        <td class="ofp-cell-muted">${escape(fmtDate(i.due_at))}</td>
        <td class="ofp-cell-money">${money(i.total)}</td>
        <td class="ofp-cell-money">${money(i.balance)}</td>
        <td>${StatusPill(i.status)}</td>
      </tr>
    `;
  }).join('');
  return `
    ${renderTopBar({
      title: 'Invoices',
      primaryAction: `<button class="ofp-btn is-primary" data-ofp-action="new-invoice">+ New Invoice</button>`,
    })}
    ${renderApiBanner()}
    <div class="ofp-kpi-row">
      <div class="ofp-kpi"><div class="ofp-kpi-label">Invoiced</div><div class="ofp-kpi-value">${money(totals)}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Outstanding</div><div class="ofp-kpi-value">${money(balances)}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Overdue</div><div class="ofp-kpi-value">${state.invoices.filter(i => i.status === 'overdue').length}</div></div>
      <div class="ofp-kpi"><div class="ofp-kpi-label">Paid</div><div class="ofp-kpi-value">${state.invoices.filter(i => i.status === 'paid').length}</div></div>
    </div>
    <section class="ofp-section">
      <table class="ofp-table">
        <thead><tr><th>ID</th><th>Title</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>${rows.length === 0 ? `<tr><td colspan="7" class="ofp-table-empty">No invoices yet. Click <strong>+ New Invoice</strong> to create one.</td></tr>` : rows}</tbody>
      </table>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 12.5  VIEW: INVENTORY (saved-items catalog the user can bill against)
// ---------------------------------------------------------------------------

function renderInventory() {
  const q = (state.query || '').toLowerCase();
  const list = state.inventory_items.filter(it =>
    !q || (it.name + ' ' + (it.sku || '') + ' ' + it.category + ' ' + (it.description || ''))
        .toLowerCase().includes(q)
  );
  const rows = list.map(it => `
    <tr data-ofp-action="open-inventory" data-ofp-id="${it.id}">
      <td class="ofp-cell-strong">${escape(it.sku || '—')}</td>
      <td>
        <div class="ofp-cell-strong">${escape(it.name)}</div>
        <div class="ofp-cell-muted" style="font-size:11px;">${escape(it.description || '')}</div>
      </td>
      <td><span class="ofp-status-pill status-draft">${escape(it.category)}</span></td>
      <td class="ofp-cell-money">${money(it.default_price)} <span class="ofp-cell-muted" style="font-size:11px;">/ ${escape(it.unit)}</span></td>
      <td>${it.taxable ? '<span class="ofp-status-pill status-completed">Taxable</span>' : '<span class="ofp-status-pill status-cancelled">Non-tax</span>'}</td>
    </tr>
  `).join('');

  return `
    ${renderTopBar({
      title: 'Inventory',
      primaryAction: `<button class="ofp-btn is-primary" data-ofp-action="new-inventory">+ New Inventory Item</button>`,
    })}
    ${renderApiBanner()}
    <section class="ofp-section">
      <table class="ofp-table">
        <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Price</th><th>Tax</th></tr></thead>
        <tbody>${list.length === 0 ? `<tr><td colspan="5" class="ofp-table-empty">No items yet. Click <strong>+ New Inventory Item</strong> to add one.</td></tr>` : rows}</tbody>
      </table>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 13. VIEW: SETTINGS
// ---------------------------------------------------------------------------

function renderSettings() {
  const o = SAMPLE.organization;
  return `
    ${renderTopBar({ title: 'Settings', primaryAction: '', searchVisible: false })}
    ${renderApiBanner()}
    <div class="ofp-settings">
      <section>
        <h3>Business profile</h3>
        <div class="ofp-settings-grid">
          <div class="ofp-field"><label>Business name</label><input value="${escape(o.name)}" readonly /></div>
          <div class="ofp-field"><label>Owner</label><input value="${escape(o.owner)}" readonly /></div>
          <div class="ofp-field"><label>Email</label><input value="${escape(o.email)}" readonly /></div>
          <div class="ofp-field"><label>Phone</label><input value="${escape(o.phone)}" readonly /></div>
          <div class="ofp-field full"><label>Address</label><input value="${escape(o.address)}" readonly /></div>
          <div class="ofp-field"><label>Time zone</label><input value="${escape(o.timezone)}" readonly /></div>
          <div class="ofp-field"><label>Default tax rate</label><input value="${(o.tax_rate * 100).toFixed(2)}%" readonly /></div>
        </div>
        <div class="ofp-api-banner" style="margin-top:8px;font-size:11px;">Profile editor ships after estimates/invoices (Phase 2 + 3).</div>
      </section>

      <section>
        <h3>Team members</h3>
        <table class="ofp-table">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            ${SAMPLE.team.map(t => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="ofp-avatar">${escape(initials(t.name))}</span>
                    <span class="ofp-cell-strong">${escape(t.name)}</span>
                  </div>
                </td>
                <td>${escape(t.role)}</td>
                <td class="ofp-cell-muted">${escape(t.email)}</td>
                <td>${t.active ? '<span class="ofp-status-pill status-completed">Active</span>' : '<span class="ofp-status-pill status-cancelled">Inactive</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Services catalog</h3>
        <table class="ofp-table">
          <thead><tr><th>Service</th><th>Duration</th><th>Price</th></tr></thead>
          <tbody>
            ${SAMPLE.services.map(s => `
              <tr>
                <td class="ofp-cell-strong">${escape(s.name)}</td>
                <td class="ofp-cell-muted">${escape(String(s.duration_min))} min</td>
                <td class="ofp-cell-money">${money(s.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Stack status</h3>
        <div class="ofp-settings-grid">
          <div class="ofp-field"><label>Backend API</label><input value="${state.api.up ? 'Connected' : 'Offline'}" readonly /></div>
          <div class="ofp-field"><label>Frontend web</label><input value="${state.api.up ? 'Available' : 'Not running'}" readonly /></div>
          <div class="ofp-field"><label>Database</label><input value="${state.api.up ? 'PostgreSQL @ :5433' : 'Offline'}" readonly /></div>
          <div class="ofp-field"><label>Storage</label><input value="MinIO @ :9000 (Phase 2)" readonly /></div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--ofp-text-muted);">
          Bring the backend up: <code>cd ~/Downloads/openfieldpro_phase1/openfieldpro && podman compose -f docker-compose.local.yml up -d --force-recreate</code>
        </div>
      </section>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 14. VIEW DISPATCH (called after route change)
// ---------------------------------------------------------------------------

const VIEWS = {
  dashboard: renderDashboard,
  jobs:       renderJobs,
  customers:  renderCustomers,
  schedule:   renderSchedule,
  estimates:  renderEstimates,
  invoices:   renderInvoices,
  inventory:  renderInventory,
  settings:   renderSettings,
};

function renderShell() {
  const root = el('openfieldpro-content');
  if (!root) return;
  root.classList.add('ofp-theme-light');
  root.innerHTML = `
    <div class="ofp-shell">
      ${renderSideNav()}
      <div class="ofp-main">           <div id="ofp-view-host"></div>
      </div>
    </div>
  `;
  renderView();
}

function renderView() {
  // Mount contract: inner #ofp-view-host is the IA hydration root; the outer
  // [data-ofp-view-host] is the JS-mount fallback selector on the cockpit-content
  // delegation wrapper. Prefer the id; fall back to the data attribute only if
  // a future refactor removes the inner id.
  const host = el('ofp-view-host') || document.querySelector('[data-ofp-view-host]');
  if (!host) return;
  const fn = VIEWS[state.route] || renderDashboard;
  state.currentView = state.route;
  host.innerHTML = fn();
}

// ---------------------------------------------------------------------------
// 15. DETAIL PANELS + FORMS
// ---------------------------------------------------------------------------

function renderJobDetail(id) {
  const j = state.jobs.find(x => x.id === id);
  if (!j) return null;
  const cust = lookupCustomer(j.customer_id);
  const svc  = lookupService(j.service_id);
  return `
    <div class="ofp-detail-overlay" data-ofp-action="detail-overlay">
      <div class="ofp-detail" data-ofp-action="detail-panel">
        <div class="ofp-detail-head">
          <h3>${escape(j.title)}</h3>
          <button class="ofp-btn is-ghost" data-ofp-action="close-detail">✕</button>
        </div>
        <div class="ofp-detail-section">
          <h4>Status</h4>
          <div style="display:flex;align-items:center;gap:8px;">
            ${StatusPill(j.status)}
            <div style="margin-left:auto;">
              ${['scheduled', 'inprogress', 'completed', 'onhold', 'cancelled'].map(s => `
                <button class="ofp-btn ${j.status === s ? 'is-primary' : ''}" data-ofp-action="set-job-status" data-ofp-id="${j.id}" data-ofp-status="${s}" style="margin-left:4px;">${s}</button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="ofp-detail-section">
          <h4>Details</h4>
          <div class="ofp-detail-row"><span class="label">Customer</span><span>${escape(cust?.name || '—')}</span></div>
          <div class="ofp-detail-row"><span class="label">Service</span><span>${escape(svc?.name || '—')}</span></div>
          <div class="ofp-detail-row"><span class="label">Scheduled</span><span>${escape(j.scheduled_at ? fmtDate(j.scheduled_at) + ' · ' + fmtTime(j.scheduled_at) : '—')}</span></div>
          <div class="ofp-detail-row"><span class="label">Assignee</span><span>${escape(j.assignee || 'Unassigned')}</span></div>
          <div class="ofp-detail-row"><span class="label">Address</span><span>${escape(j.address || '—')}</span></div>
          <div class="ofp-detail-row"><span class="label">Price</span><span>${money(j.price)}</span></div>
        </div>
        <div class="ofp-detail-section">
          <h4>Notes</h4>
          <div class="ofp-field">
            <textarea rows="3" data-ofp-action="edit-job-notes" data-ofp-id="${j.id}">${escape(j.notes || '')}</textarea>
          </div>
        </div>
        <div class="ofp-detail-actions">
          <button class="ofp-btn is-danger" data-ofp-action="delete-job" data-ofp-id="${j.id}">Delete</button>
          <div style="flex:1;"></div>
          <button class="ofp-btn"           data-ofp-action="duplicate-job" data-ofp-id="${j.id}">Duplicate</button>
          <button class="ofp-btn is-primary" data-ofp-action="close-detail">Done</button>
        </div>
      </div>
    </div>
  `;
}

function renderCustomerDetail(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return null;
  const jobs      = state.jobs.filter(j => j.customer_id === id);
  const estimates = state.estimates.filter(e => e.customer_id === id);
  const invoices  = state.invoices.filter(i => i.customer_id === id);
  return `
    <div class="ofp-detail-overlay" data-ofp-action="detail-overlay">
      <div class="ofp-detail" data-ofp-action="detail-panel">
        <div class="ofp-detail-head">
          <h3>${escape(c.name)}</h3>
          <button class="ofp-btn is-ghost" data-ofp-action="close-detail">✕</button>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <span class="ofp-avatar" style="width:44px;height:44px;font-size:15px;">${escape(initials(c.name))}</span>
          <div>
            <div>${escape(c.email || '—')}</div>
            <div class="ofp-cell-muted">${escape(c.phone || '—')}</div>
          </div>
        </div>
        <div class="ofp-detail-section">
          <h4>Address</h4>
          <div class="ofp-detail-row"><span class="label">Street</span><span>${escape(c.address || '—')}</span></div>
          <div class="ofp-detail-row"><span class="label">City</span><span>${escape(c.city || '—')}, ${escape(c.state || '')} ${escape(c.zip || '')}</span></div>
        </div>
        <div class="ofp-profile-tabs">
          <button class="ofp-profile-tab is-active" data-ofp-action="customer-tab" data-ofp-tab="jobs">Jobs (${jobs.length})</button>
          <button class="ofp-profile-tab" data-ofp-action="customer-tab" data-ofp-tab="estimates">Estimates (${estimates.length})</button>
          <button class="ofp-profile-tab" data-ofp-action="customer-tab" data-ofp-tab="invoices">Invoices (${invoices.length})</button>
        </div>
        <div data-ofp-customer-tab="jobs" class="ofp-customer-tab-panel">
          ${jobs.length === 0 ? '<div class="ofp-empty"><p>No jobs for this customer yet.</p></div>' :
            jobs.map(j => `
              <div data-ofp-action="open-job" data-ofp-id="${j.id}" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--ofp-border);cursor:pointer;">
                <div style="flex:1;">
                  <div class="ofp-cell-strong">${escape(j.title)}</div>
                  <div class="ofp-cell-muted" style="font-size:11px;">${escape(j.scheduled_at ? fmtDate(j.scheduled_at) : 'Unscheduled')}</div>
                </div>
                ${StatusPill(j.status)}
              </div>
            `).join('')}
        </div>
        <div data-ofp-customer-tab="estimates" class="ofp-customer-tab-panel" style="display:none;">
          ${estimates.length === 0 ? '<div class="ofp-empty"><p>No estimates.</p></div>' :
            estimates.map(e => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--ofp-border);">
                <div style="flex:1;">
                  <div class="ofp-cell-strong">${escape(e.title)}</div>
                  <div class="ofp-cell-muted" style="font-size:11px;">${escape(fmtDate(e.created_at))} · ${escape(fmtDate(e.expires_at))}</div>
                </div>
                <div class="ofp-cell-money">${money(e.amount)}</div>
                ${StatusPill(e.status)}
              </div>
            `).join('')}
        </div>
        <div data-ofp-customer-tab="invoices" class="ofp-customer-tab-panel" style="display:none;">
          ${invoices.length === 0 ? '<div class="ofp-empty"><p>No invoices.</p></div>' :
            invoices.map(i => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--ofp-border);">
                <div style="flex:1;">
                  <div class="ofp-cell-strong">${escape(i.title || 'Invoice')}</div>
                  <div class="ofp-cell-muted" style="font-size:11px;">Due ${escape(fmtDate(i.due_at))}</div>
                </div>
                <div class="ofp-cell-money">${money(i.total)}</div>
                ${StatusPill(i.status)}
              </div>
            `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderJobForm(existing = null) {
  const isEdit = !!existing;
  const j = existing || { title: '', customer_id: state.customers[0]?.id || '', service_id: 's1', assignee: SAMPLE.team[0]?.name || '', scheduled_at: '', notes: '', address: '' };
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form" data-ofp-action="detail-panel">
        <h3>${isEdit ? 'Edit Job' : 'New Job'}</h3>
        <div class="ofp-form-grid">
          <div class="ofp-field full"><label>Title</label><input data-ofp-field="title" value="${escape(j.title)}" placeholder="e.g. AC Tune-Up" /></div>
          <div class="ofp-field"><label>Customer</label>
            <select data-ofp-field="customer_id">
              ${state.customers.map(c => `<option value="${c.id}" ${c.id === j.customer_id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Service</label>
            <select data-ofp-field="service_id">
              ${SAMPLE.services.map(s => `<option value="${s.id}" ${s.id === j.service_id ? 'selected' : ''}>${escape(s.name)} — ${money(s.price)}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Assignee</label>
            <select data-ofp-field="assignee">
              ${['', ...SAMPLE.team.filter(t => t.role.includes('Tech') || t.role === 'Lead Tech' || t.role === 'Dispatcher').map(t => t.name)].map(name => `<option value="${escape(name)}" ${name === j.assignee ? 'selected' : ''}>${escape(name || 'Unassigned')}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Scheduled</label><input data-ofp-field="scheduled_at" type="datetime-local" value="${escape(j.scheduled_at ? j.scheduled_at.slice(0, 16) : '')}" /></div>
          <div class="ofp-field full"><label>Address</label><input data-ofp-field="address" value="${escape(j.address)}" /></div>
          <div class="ofp-field full"><label>Notes</label><textarea data-ofp-field="notes" rows="3" placeholder="Job notes…">${escape(j.notes || '')}</textarea></div>
        </div>
        <div class="ofp-form-actions">
          <button class="ofp-btn" data-ofp-action="close-detail">Cancel</button>
          <button class="ofp-btn is-primary" data-ofp-action="${isEdit ? 'save-job' : 'create-job'}" data-ofp-id="${escape(j.id || '')}">${isEdit ? 'Save' : 'Create Job'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderCustomerForm(existing = null) {
  const isEdit = !!existing;
  const c = existing || { name: '', email: '', phone: '', address: '', city: '', state: '', zip: '' };
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form" data-ofp-action="detail-panel">
        <h3>${isEdit ? 'Edit Customer' : 'New Customer'}</h3>
        <div class="ofp-form-grid">
          <div class="ofp-field full"><label>Name</label><input data-ofp-field="name" value="${escape(c.name)}" placeholder="Full name" /></div>
          <div class="ofp-field"><label>Email</label><input data-ofp-field="email" type="email" value="${escape(c.email)}" /></div>
          <div class="ofp-field"><label>Phone</label><input data-ofp-field="phone" value="${escape(c.phone)}" /></div>
          <div class="ofp-field full"><label>Street address</label><input data-ofp-field="address" value="${escape(c.address)}" /></div>
          <div class="ofp-field"><label>City</label><input data-ofp-field="city" value="${escape(c.city)}" /></div>
          <div class="ofp-field"><label>State</label><input data-ofp-field="state" value="${escape(c.state)}" maxlength="2" /></div>
          <div class="ofp-field"><label>Zip</label><input data-ofp-field="zip" value="${escape(c.zip)}" /></div>
        </div>
        <div class="ofp-form-actions">
          <button class="ofp-btn" data-ofp-action="close-detail">Cancel</button>
          <button class="ofp-btn is-primary" data-ofp-action="${isEdit ? 'save-customer' : 'create-customer'}" data-ofp-id="${escape(c.id || '')}">${isEdit ? 'Save' : 'Create Customer'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderInventoryForm(existing = null) {
  const isEdit = !!existing;
  const it = existing || { name: '', sku: '', category: 'part',
                           default_price: 0, unit: 'each', taxable: true,
                           description: '' };
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form" data-ofp-action="detail-panel">
        <h3>${isEdit ? 'Edit Inventory Item' : 'New Inventory Item'}</h3>
        <div class="ofp-form-grid">
          <div class="ofp-field full"><label>Name</label><input data-ofp-field="name" value="${escape(it.name)}" placeholder="e.g. HVAC Filter 16x25x1" /></div>
          <div class="ofp-field"><label>SKU</label><input data-ofp-field="sku" value="${escape(it.sku)}" placeholder="FILT-1625" /></div>
          <div class="ofp-field"><label>Category</label>
            <select data-ofp-field="category">
              ${['filter','part','refrigerant','labor','misc'].map(c => `<option value="${c}" ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Default price</label><input data-ofp-field="default_price" type="number" step="0.01" min="0" value="${it.default_price}" /></div>
          <div class="ofp-field"><label>Unit</label>
            <select data-ofp-field="unit">
              ${['each','lb','hour','foot','sqft','gallon'].map(u => `<option value="${u}" ${u === it.unit ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Taxable</label>
            <select data-ofp-field="taxable">
              <option value="true"  ${it.taxable  ? 'selected' : ''}>Yes</option>
              <option value="false" ${!it.taxable ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="ofp-field full"><label>Description</label><textarea data-ofp-field="description" rows="2">${escape(it.description || '')}</textarea></div>
        </div>
        <div class="ofp-form-actions">
          ${isEdit
            ? `<button class="ofp-btn is-danger" data-ofp-action="delete-inventory" data-ofp-id="${escape(it.id)}">Delete</button>`
            : ''}
          <div style="flex:1;"></div>
          <button class="ofp-btn" data-ofp-action="close-detail">Cancel</button>
          <button class="ofp-btn is-primary" data-ofp-action="${isEdit ? 'save-inventory' : 'create-inventory'}">${isEdit ? 'Save' : 'Create Item'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderInvoiceDetail(existing = null) {
  // Single render path for both "open existing invoice" and "+ New Invoice"
  // — title flips based on whether an id is present. The whole panel is
  // re-rendered on cart adds/removes; cart-totals are live-updated in place
  // by updateCartTotalsDisplay() while the user types in price/qty inputs.
  const isNew = !existing || !existing.id;
  const draft = existing && existing.id ? existing : {
    id: '',
    customer_id: state.customers[0]?.id || '',
    title: 'New invoice',
    total: 0,
    balance: 0,
    status: 'draft',
    issued_at: today(),
    due_at: addDays(14),
    job_id: null,
    line_items: [],
  };
  const items = draft.line_items || [];
  const subtotal = cartTotal(items);
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form ofp-form-wide" data-ofp-action="detail-panel">
        <h3>${isNew ? 'New Invoice' : 'Invoice #' + escape(draft.id.slice(1))}</h3>
        <div class="ofp-form-grid">
          <div class="ofp-field full"><label>Title</label><input data-ofp-field="title" value="${escape(draft.title)}" placeholder="e.g. Maintenance Q2" /></div>
          <div class="ofp-field"><label>Customer</label>
            <select data-ofp-field="customer_id">
              <option value="">— none —</option>
              ${state.customers.map(c => `<option value="${c.id}" ${c.id === draft.customer_id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Status</label>
            <select data-ofp-field="status">
              ${['draft','sent','paid','overdue','cancelled'].map(s => `<option value="${s}" ${s === draft.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Issued</label><input data-ofp-field="issued_at" type="date" value="${escape(draft.issued_at || today())}" /></div>
          <div class="ofp-field"><label>Due</label><input data-ofp-field="due_at" type="date" value="${escape(draft.due_at || addDays(14))}" /></div>
          <div class="ofp-field"><label>Balance</label><input data-ofp-field="balance" type="number" step="0.01" min="0" value="${draft.balance}" /></div>
        </div>

        <div class="ofp-detail-section" data-ofp-cart>
          <h4>Line items${items.length > 0 ? ` <span class="ofp-cell-muted" style="font-weight:400;font-size:11px;">(${items.length})</span>` : ''}</h4>
          ${items.length === 0
            ? '<div class="ofp-empty"><p>No line items yet — click <strong>+ Add line item from inventory</strong> below to start a cart.</p></div>'
            : `<table class="ofp-table">
                 <thead><tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Tax</th><th>Subtotal</th><th></th></tr></thead>
                 <tbody>${items.map((li, idx) => `
                   <tr>
                     <td>
                       <div class="ofp-cell-strong">${escape(li.name)}</div>
                       <div class="ofp-cell-muted" style="font-size:11px;">${escape(li.inventory_id || '')}</div>
                     </td>
                     <td><input data-ofp-action="edit-line-price" data-ofp-idx="${idx}" type="number" step="0.01" min="0" value="${Number(li.price).toFixed(2)}" style="width:90px;font-variant-numeric:tabular-nums;" /></td>
                     <td><input data-ofp-action="edit-line-qty"   data-ofp-idx="${idx}" type="number" step="1"    min="1" value="${li.quantity}" style="width:60px;" /></td>
                     <td>${li.taxable ? '<span class="ofp-status-pill status-completed">tax</span>' : '<span class="ofp-status-pill status-cancelled">—</span>'}</td>
                     <td class="ofp-cell-money" data-line-subtotal="${idx}">${money(lineSubtotal(li))}</td>
                     <td><button class="ofp-btn is-ghost" data-ofp-action="remove-line-item" data-ofp-idx="${idx}" title="Remove line">\u2715</button></td>
                   </tr>
                 `).join('')}</tbody>
               </table>`}
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px;">
            <button class="ofp-btn" data-ofp-action="open-pick-inventory">+ Add line item from inventory</button>
            <div style="margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;font-size:14px;">
              Total: <span data-ofp-cart-total>${money(subtotal)}</span>
            </div>
          </div>
          ${draft.id && Math.abs((draft.total || 0) - subtotal) > 0.005
            ? `<div class="ofp-cell-muted" style="font-size:11px;margin-top:4px;">Saved total is ${money(draft.total)} \u2014 server recomputes from line items on Save.</div>`
            : ''}
        </div>

        <div class="ofp-form-actions">
          ${isNew
            ? `<button class="ofp-btn is-danger" data-ofp-action="cancel-invoice-new">Cancel</button>`
            : `<button class="ofp-btn is-danger" data-ofp-action="delete-invoice" data-ofp-id="${escape(draft.id)}">Delete</button>`}
          <div style="flex:1;"></div>
          <button class="ofp-btn" data-ofp-action="close-detail">Close</button>
          ${state.inventory_items.length === 0
            ? `<span class="ofp-cell-muted" style="font-size:11px;">Add an inventory item before saving line items.</span>`
            : ''}
          <button class="ofp-btn is-primary" data-ofp-action="${isNew ? 'create-invoice' : 'save-invoice'}" data-ofp-id="${escape(draft.id)}" ${state.inventory_items.length === 0 ? 'disabled title="Add inventory items first"' : ''}>${isNew ? 'Create Invoice' : 'Save Invoice'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderEstimateDetail(existing = null) {
  // Slide-in detail panel for both "open existing estimate" and "+ New Estimate".
  // Mirrors renderInvoiceDetail but writes `amount` (not `total`), shows the
  // estimates status enum [draft, sent, approved, declined], and has no
  // balance / issued_at / due_at fields (estimates are quotes, not invoices).
  // created_at is server-set on POST and read-only here. Same mutual-exclusion
  // contract with invoiceDraft — only one overlay open at a time.
  const isNew = !existing || !existing.id;
  const draft = existing && existing.id ? existing : {
    id: '',
    customer_id: state.customers[0]?.id || '',
    title: 'New estimate',
    amount: 0,
    status: 'draft',
    created_at: today(),
    expires_at: addDays(14),
    line_items: [],
  };
  const items = draft.line_items || [];
  const subtotal = cartTotal(items);
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form ofp-form-wide" data-ofp-action="detail-panel">
        <h3>${isNew ? 'New Estimate' : 'Estimate #' + escape(draft.id.slice(1))}</h3>
        <div class="ofp-form-grid">
          <div class="ofp-field full"><label>Title</label><input data-ofp-field="title" value="${escape(draft.title)}" placeholder="e.g. Kitchen Repipe" /></div>
          <div class="ofp-field"><label>Customer</label>
            <select data-ofp-field="customer_id">
              <option value="">— none —</option>
              ${state.customers.map(c => `<option value="${c.id}" ${c.id === draft.customer_id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Status</label>
            <select data-ofp-field="status">
              ${['draft','sent','approved','declined'].map(s => `<option value="${s}" ${s === draft.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="ofp-field"><label>Created</label><input data-ofp-field="created_at" type="date" value="${escape(draft.created_at || today())}" readonly /></div>
          <div class="ofp-field"><label>Expires</label><input data-ofp-field="expires_at" type="date" value="${escape(draft.expires_at || addDays(14))}" /></div>
        </div>

        <div class="ofp-detail-section" data-ofp-cart>
          <h4>Line items${items.length > 0 ? ` <span class="ofp-cell-muted" style="font-weight:400;font-size:11px;">(${items.length})</span>` : ''}</h4>
          ${items.length === 0
            ? '<div class="ofp-empty"><p>No line items yet — click <strong>+ Add line item from inventory</strong> below to start a cart.</p></div>'
            : `<table class="ofp-table">
                 <thead><tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Tax</th><th>Subtotal</th><th></th></tr></thead>
                 <tbody>${items.map((li, idx) => `
                   <tr>
                     <td>
                       <div class="ofp-cell-strong">${escape(li.name)}</div>
                       <div class="ofp-cell-muted" style="font-size:11px;">${escape(li.inventory_id || '')}</div>
                     </td>
                     <td><input data-ofp-action="edit-line-price" data-ofp-idx="${idx}" type="number" step="0.01" min="0" value="${Number(li.price).toFixed(2)}" style="width:90px;font-variant-numeric:tabular-nums;" /></td>
                     <td><input data-ofp-action="edit-line-qty"   data-ofp-idx="${idx}" type="number" step="1"    min="1" value="${li.quantity}" style="width:60px;" /></td>
                     <td>${li.taxable ? '<span class="ofp-status-pill status-completed">tax</span>' : '<span class="ofp-status-pill status-cancelled">—</span>'}</td>
                     <td class="ofp-cell-money" data-line-subtotal="${idx}">${money(lineSubtotal(li))}</td>
                     <td><button class="ofp-btn is-ghost" data-ofp-action="remove-line-item" data-ofp-idx="${idx}" title="Remove line">\u2715</button></td>
                   </tr>
                 `).join('')}</tbody>
               </table>`}
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px;">
            <button class="ofp-btn" data-ofp-action="open-pick-inventory">+ Add line item from inventory</button>
            <div style="margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;font-size:14px;">
              Amount: <span data-ofp-cart-total>${money(subtotal)}</span>
            </div>
          </div>
          ${draft.id && Math.abs((draft.amount || 0) - subtotal) > 0.005
            ? `<div class="ofp-cell-muted" style="font-size:11px;margin-top:4px;">Saved amount is ${money(draft.amount)} \u2014 server recomputes from line items on Save.</div>`
            : ''}
        </div>

        <div class="ofp-form-actions">
          ${isNew
            ? `<button class="ofp-btn is-danger" data-ofp-action="cancel-estimate-new">Cancel</button>`
            : `<button class="ofp-btn is-danger" data-ofp-action="delete-estimate" data-ofp-id="${escape(draft.id)}">Delete</button>`}
          <div style="flex:1;"></div>
          <button class="ofp-btn" data-ofp-action="close-detail">Close</button>
          <button class="ofp-btn is-primary" data-ofp-action="${isNew ? 'create-estimate' : 'save-estimate'}" data-ofp-id="${escape(draft.id)}">${isNew ? 'Create Estimate' : 'Save Estimate'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderPickInventory() {
  // Slide-in picker that overlays the active detail panel (invoice or
  // estimate). Re-rendered as the search query updates; clicking a row
  // snaps the inventory item into the active draft's line_items and
  // re-opens that draft's detail panel. Uses state.pickQuery (NOT
  // state.query) so typing in the picker doesn't leak into the main
  // view's search box.
  const pq = (state.pickQuery || '').toLowerCase();
  const list = state.inventory_items.filter(it =>
    !pq || (it.name + ' ' + (it.sku || '') + ' ' + it.category + ' ' + (it.description || ''))
        .toLowerCase().includes(pq)
  );
  return `
    <div class="ofp-form-modal" data-ofp-action="detail-overlay">
      <div class="ofp-form" data-ofp-action="detail-panel">
        <h3>Add line item from inventory</h3>
        <input class="ofp-search" type="search" data-ofp-action="search-pick-inventory"
               placeholder="Search SKU, name, or category\u2026" value="${escape(state.pickQuery)}" />
        <section class="ofp-section" style="max-height:60vh;overflow:auto;margin-top:10px;">
          <table class="ofp-table">
            <tbody>
              ${list.length === 0 ? `<tr><td colspan="3" class="ofp-table-empty">No matches. Add items in the Inventory tab first.</td></tr>`
                : list.map(it => `
                  <tr data-ofp-action="pick-inventory-item" data-ofp-id="${it.id}" style="cursor:pointer;">
                    <td><div class="ofp-cell-strong">${escape(it.name)}</div><div class="ofp-cell-muted" style="font-size:11px;">${escape(it.sku || 'no-sku')} \u00b7 ${escape(it.category)}</div></td>
                    <td class="ofp-cell-money">${money(it.default_price)} <span class="ofp-cell-muted" style="font-size:11px;">/ ${escape(it.unit)}</span></td>
                    <td><span class="ofp-status-pill ${it.taxable ? 'status-completed' : 'status-cancelled'}">${it.taxable ? 'tax' : 'no-tax'}</span></td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </section>
        <div class="ofp-form-actions">
          <button class="ofp-btn" data-ofp-action="close-detail">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 16. EVENT DELEGATION (single handler on #openfieldpro-content)
// ---------------------------------------------------------------------------

function readField(name) {
  const el_ = document.querySelector(`[data-ofp-field="${name}"]`);
  return el_ ? el_.value : null;
}

function handleModalClick(e) {
  const target = e.target.closest('[data-ofp-action]');
  if (!target) return;

  const action = target.dataset.ofpAction;

  switch (action) {

    case 'navigate':
      e.preventDefault();
      setRoute(target.dataset.ofpRoute);
      break;

    case 'filter-jobs':
      state.jobFilter = target.dataset.ofpId;
      renderView();
      break;

    case 'toggle-new-menu':
      e.stopPropagation();
      const menu = document.querySelector('[data-ofp-action="new-menu"]');
      if (menu) menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
      break;

    case 'new-job':
      closeAllMenus();
      showOverlay(renderJobForm());
      break;
    case 'new-customer':
      closeAllMenus();
      showOverlay(renderCustomerForm());
      break;
    case 'new-inventory':
      closeAllMenus();
      showOverlay(renderInventoryForm());
      break;
    case 'new-invoice': {
      closeAllMenus();
      state.invoiceDraft = {
        id: '',
        customer_id: state.customers[0]?.id || '',
        title: 'New invoice',
        total: 0, balance: 0,
        status: 'draft',
        issued_at: today(), due_at: addDays(14),
        job_id: null,
        line_items: [],
      };
      showOverlay(renderInvoiceDetail(state.invoiceDraft));
      break;
    }

    case 'open-job':
      showOverlay(renderJobDetail(target.dataset.ofpId));
      break;

    case 'open-customer':
      showOverlay(renderCustomerDetail(target.dataset.ofpId));
      break;

    case 'open-inventory':
      showOverlay(renderInventoryForm(state.inventory_items.find(x => x.id === target.dataset.ofpId)));
      break;

    case 'open-invoice': {
      const existing = state.invoices.find(x => x.id === target.dataset.ofpId);
      if (!existing) break;
      state.invoiceDraft = structuredClone(existing);
      showOverlay(renderInvoiceDetail(state.invoiceDraft));
      break;
    }

    case 'open-estimate':
      toast('Estimates are read-only in this preview.', 'info');
      break;

    case 'close-detail':
      // Drop the in-memory invoice draft on explicit close (✕ button on the
      // detail panel). Picker search resets too so the next open starts
      // fresh. Without this, stale drafts from a dismissed edit would be
      // picked up by the next `open-invoice` / `new-invoice` if the IDs
      // happened to match — the reviewer-flagged draft leak.
      // Also drop the estimate draft — mutual-exclusion between
      // invoiceDraft and estimateDraft means opening one implies the
      // previous one is closed.
      state.invoiceDraft = null;
      state.estimateDraft = null;
      state.pickQuery = '';
      closeOverlay();
      break;

    case 'set-job-status':
      updateJob(target.dataset.ofpId, { status: target.dataset.ofpStatus });
      showOverlay(renderJobDetail(target.dataset.ofpId));
      renderView();
      toast(`Status → ${target.dataset.ofpStatus}`, 'success');
      break;

    case 'edit-job-notes':
      target.addEventListener('change', () => {
        updateJob(target.dataset.ofpId, { notes: target.value });
      }, { once: true });
      break;

    case 'delete-job':
      deleteJob(target.dataset.ofpId);
      closeOverlay();
      renderView();
      toast('Job deleted.', 'success');
      break;

    case 'duplicate-job':
      const orig = state.jobs.find(x => x.id === target.dataset.ofpId);
      if (orig) {
        const dup = createJob({ ...orig, id: undefined, title: orig.title + ' (copy)', status: 'new' });
        toast(`Duplicated as ${dup.id}.`, 'success');
        renderView();
      }
      break;

    case 'create-job':
      const newJobPayload = {
        title:       readField('title')           || 'New job',
        customer_id: readField('customer_id'),
        service_id:  readField('service_id'),
        assignee:    readField('assignee'),
        scheduled_at:readField('scheduled_at')    ? readField('scheduled_at') + ':00Z' : null,
        address:     readField('address'),
        notes:       readField('notes'),
        price:       lookupService(readField('service_id'))?.price,
      };
      createJob(newJobPayload);
      closeOverlay();
      renderView();
      toast('Job created.', 'success');
      break;

    case 'save-job':
      updateJob(target.dataset.ofpId, {
        title:       readField('title'),
        customer_id: readField('customer_id'),
        service_id:  readField('service_id'),
        assignee:    readField('assignee'),
        scheduled_at:readField('scheduled_at')    ? readField('scheduled_at') + ':00Z' : null,
        address:     readField('address'),
        notes:       readField('notes'),
        price:       lookupService(readField('service_id'))?.price,
      });
      closeOverlay();
      renderView();
      toast('Job saved.', 'success');
      break;

    case 'create-customer':
      createCustomer({
        name:    readField('name'),
        email:   readField('email'),
        phone:   readField('phone'),
        address: readField('address'),
        city:    readField('city'),
        state:   readField('state'),
        zip:     readField('zip'),
      });
      closeOverlay();
      renderView();
      toast('Customer created.', 'success');
      break;

    case 'save-customer':
      updateCustomer(target.dataset.ofpId, {
        name:    readField('name'),
        email:   readField('email'),
        phone:   readField('phone'),
        address: readField('address'),
        city:    readField('city'),
        state:   readField('state'),
        zip:     readField('zip'),
      });
      closeOverlay();
      renderView();
      toast('Customer saved.', 'success');
      break;

    case 'customer-tab':
      document.querySelectorAll('[data-ofp-action="customer-tab"]').forEach(b => b.classList.toggle('is-active', b === target));
      document.querySelectorAll('.ofp-customer-tab-panel').forEach(p => p.style.display = 'none');
      const panel = document.querySelector(`[data-ofp-customer-tab="${target.dataset.ofpTab}"]`);
      if (panel) panel.style.display = '';
      break;

    case 'create-inventory': {
      const item = createInventoryItem({
        name:         readField('name'),
        sku:          readField('sku'),
        category:     readField('category'),
        default_price:Number(readField('default_price') || 0),
        unit:         readField('unit'),
        taxable:      readField('taxable') === 'true',
        description:  readField('description'),
      });
      closeOverlay();
      renderView();
      toast(`Saved ${item.name} (${item.id}).`, 'success');
      break;
    }
    case 'save-inventory': {
      const id = target.dataset.ofpId || state.inventory_items.find(x => x.name === readField('name'))?.id;
      if (!id) break;
      updateInventoryItem(id, {
        name:         readField('name'),
        sku:          readField('sku'),
        category:     readField('category'),
        default_price:Number(readField('default_price') || 0),
        unit:         readField('unit'),
        taxable:      readField('taxable') === 'true',
        description:  readField('description'),
      });
      closeOverlay();
      renderView();
      toast(`Inventory item updated.`, 'success');
      break;
    }

    case 'open-pick-inventory':
      // Save the current detail-panel form fields into the draft so the
      // picker can be canceled without losing edits. Re-render the detail
      // after every cart change keeps them in sync. Reset pickQuery so the
      // picker opens on a fresh filter (not whatever the user typed on the
      // previous open). Works on either invoice or estimate draft.
      if (state.invoiceDraft || state.estimateDraft) syncDraftFromForm();
      state.pickQuery = '';
      showOverlay(renderPickInventory());
      break;
    case 'pick-inventory-item': {
      const draft = state.invoiceDraft || state.estimateDraft;
      if (!draft) { closeOverlay(); break; }
      const item = lookupInventoryItem(target.dataset.ofpId);
      if (!item) { closeOverlay(); break; }
      draft.line_items.push(snapShotLine(item));
      // Re-open the matching detail panel based on which kind of draft
      // is active — preserves the user's typing context.
      if (draft === state.invoiceDraft) showOverlay(renderInvoiceDetail(draft));
      else showOverlay(renderEstimateDetail(draft));
      toast(`Added ${item.name}.`, 'success');
      break;
    }
    case 'remove-line-item': {
      const draft = state.invoiceDraft || state.estimateDraft;
      if (!draft) break;
      const idx = parseInt(target.dataset.ofpIdx, 10);
      if (Number.isNaN(idx)) break;
      draft.line_items.splice(idx, 1);
      if (draft === state.invoiceDraft) showOverlay(renderInvoiceDetail(draft));
      else showOverlay(renderEstimateDetail(draft));
      break;
    }

    case 'create-invoice': {
      if (!state.invoiceDraft) break;
      syncDraftFromForm();
      const created = createInvoice(state.invoiceDraft);
      // Re-mount the detail with the freshly-minted id so further edits
      // route through save-invoice (PUT) instead of looping POSTs.
      state.invoiceDraft = structuredClone(created);
      state.pickQuery = '';
      showOverlay(renderInvoiceDetail(state.invoiceDraft));
      renderView();
      toast(`Invoice ${created.id} created.`, 'success');
      break;
    }
    case 'save-invoice': {
      if (!state.invoiceDraft || !state.invoiceDraft.id) break;
      syncDraftFromForm();
      // Mirror the server's recompute rule client-side: total = cart sum.
      state.invoiceDraft.line_items.forEach(li => {
        li.price = Number(li.price || 0);
        li.quantity = Math.max(1, Number(li.quantity || 1));
      });
      state.invoiceDraft.total = cartTotal(state.invoiceDraft.line_items);
      const updated = updateInvoice(state.invoiceDraft.id, state.invoiceDraft);
      state.invoiceDraft = structuredClone(updated);
      state.pickQuery = '';
      showOverlay(renderInvoiceDetail(state.invoiceDraft));
      renderView();
      toast(`Invoice saved \u2014 total ${money(updated.total)}.`, 'success');
      break;
    }
    case 'delete-invoice': {
      const id = target.dataset.ofpId;
      deleteInvoice(id);
      state.invoiceDraft = null;
      state.pickQuery = '';
      closeOverlay();
      renderView();
      toast('Invoice deleted.', 'success');
      break;
    }
    case 'cancel-invoice-new':
      state.invoiceDraft = null;
      state.pickQuery = '';
      closeOverlay();
      break;

    case 'new-estimate': {
      closeAllMenus();
      state.estimateDraft = {
        id: '',
        customer_id: state.customers[0]?.id || '',
        title: 'New estimate',
        amount: 0,
        status: 'draft',
        created_at: today(),
        expires_at: addDays(14),
        line_items: [],
      };
      showOverlay(renderEstimateDetail(state.estimateDraft));
      break;
    }
    case 'open-estimate': {
      const existing = state.estimates.find(x => x.id === target.dataset.ofpId);
      if (!existing) break;
      state.estimateDraft = structuredClone(existing);
      // Backfill on the clone so a legacy estimate without line_items
      // can still open the panel without a null-ref on the cart table.
      state.estimateDraft.line_items = state.estimateDraft.line_items || [];
      showOverlay(renderEstimateDetail(state.estimateDraft));
      break;
    }
    case 'create-estimate': {
      if (!state.estimateDraft) break;
      syncDraftFromForm();
      const created = createEstimate(state.estimateDraft);
      // Re-mount the detail with the freshly-minted id so further edits
      // route through save-estimate (PUT) instead of looping POSTs.
      state.estimateDraft = structuredClone(created);
      state.pickQuery = '';
      showOverlay(renderEstimateDetail(state.estimateDraft));
      renderView();
      toast(`Estimate ${created.id} created.`, 'success');
      break;
    }
    case 'save-estimate': {
      if (!state.estimateDraft || !state.estimateDraft.id) break;
      syncDraftFromForm();
      const draft = state.estimateDraft;
      // Mirror the server's recompute rule client-side: amount = cart sum.
      draft.line_items.forEach(li => {
        li.price = Number(li.price || 0);
        li.quantity = Math.max(1, Number(li.quantity || 1));
      });
      draft.amount = cartTotal(draft.line_items);
      const updated = updateEstimate(draft.id, draft);
      state.estimateDraft = structuredClone(updated);
      state.pickQuery = '';
      showOverlay(renderEstimateDetail(state.estimateDraft));
      renderView();
      toast(`Estimate saved \u2014 amount ${money(updated.amount)}.`, 'success');
      break;
    }
    case 'delete-estimate': {
      const id = target.dataset.ofpId;
      deleteEstimate(id);
      state.estimateDraft = null;
      state.pickQuery = '';
      closeOverlay();
      renderView();
      toast('Estimate deleted.', 'success');
      break;
    }
    case 'cancel-estimate-new':
      state.estimateDraft = null;
      state.pickQuery = '';
      closeOverlay();
      break;

    case 'delete-inventory': {
      // Only fires on Edit-inventory-form (the Delete button is gated by
      // isEdit above). Confirms intent via the browser native confirm so a
      // stray click doesn't blow away a saved catalog row.
      const id = target.dataset.ofpId;
      if (!id) break;
      const item = state.inventory_items.find(x => x.id === id);
      if (!item) break;
      if (!window.confirm(`Delete inventory item "${item.name}"? This can't be undone.`)) break;
      deleteInventoryItem(id);
      state.invoiceDraft = null;   // any picker open for this item would orphan
      state.pickQuery = '';
      closeOverlay();
      renderView();
      toast(`Inventory item "${item.name}" deleted.`, 'success');
      break;
    }

    case 'detail-overlay':
      // Click on backdrop (outside the panel) closes it
      if (target.classList.contains('ofp-detail-overlay')) closeOverlay();
      break;
  }
}

function showOverlay(html) {
  const root = el('openfieldpro-content');
  if (!root) return;
  document.querySelectorAll('.ofp-detail-overlay, .ofp-form-modal').forEach(n => n.remove());
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  root.appendChild(wrap.firstElementChild);
}
function closeOverlay() {
  document.querySelectorAll('.ofp-detail-overlay, .ofp-form-modal').forEach(n => n.remove());
}
function closeAllMenus() {
  document.querySelectorAll('[data-ofp-action="new-menu"]').forEach(m => m.style.display = 'none');
}

// Push the current detail-panel form-field values into the active draft
// (invoices OR estimates) so the cart-add / picker-close paths see the
// latest typed-in edits. Dispatches on which kind of draft is open — the
// two forms have different fields (estimates have expires_at, no balance /
// due_at / issued_at).
function syncDraftFromForm() {
  if (state.invoiceDraft) {
    state.invoiceDraft.title        = readField('title');
    state.invoiceDraft.customer_id  = readField('customer_id');
    state.invoiceDraft.status       = readField('status');
    state.invoiceDraft.issued_at    = readField('issued_at');
    state.invoiceDraft.due_at       = readField('due_at');
    state.invoiceDraft.balance      = Number(readField('balance') || 0);
  } else if (state.estimateDraft) {
    state.estimateDraft.title       = readField('title');
    state.estimateDraft.customer_id = readField('customer_id');
    state.estimateDraft.status      = readField('status');
    state.estimateDraft.expires_at  = readField('expires_at');
    // created_at is server-set on POST and read-only in the detail panel.
  }
}

// Live line-item edits (price / qty typed in the cart row) — run on
// `change`/input delegation so the cart total stays live without a full
// re-render that would steal input focus. Works for both invoice and
// estimate drafts — the line_items shape is identical so the price/qty
// edits route through the same path.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.dataset) return;
  const draft = state.invoiceDraft || state.estimateDraft;
  if (!draft) return;
  if (t.dataset.ofpAction === 'edit-line-price') {
    const idx = parseInt(t.dataset.ofpIdx, 10);
    if (Number.isNaN(idx)) return;
    draft.line_items[idx].price = Number(t.value || 0);
    updateCartTotalsDisplay();
  } else if (t.dataset.ofpAction === 'edit-line-qty') {
    const idx = parseInt(t.dataset.ofpIdx, 10);
    if (Number.isNaN(idx)) return;
    draft.line_items[idx].quantity = Math.max(1, parseInt(t.value, 10) || 1);
    updateCartTotalsDisplay();
  } else if (t.dataset.ofpAction === 'search-pick-inventory') {
    // Picker-local search state — stays out of state.query so the main view
    // (Inventory tab) doesn't see the picker's filter text spill over.
    state.pickQuery = t.value;
    const overlay = document.querySelector('.ofp-form-modal .ofp-form');
    if (overlay) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderPickInventory();
      const newBody = tmp.querySelector('.ofp-form');
      if (newBody) overlay.parentNode.replaceChild(newBody, overlay);
    }
  }
});

function handleHashChange() {
  const hash = (location.hash || '').replace('#', '');
  const candidate = TABS.find(t => t.id === hash);
  if (candidate && candidate.id !== state.route) {
    state.route = candidate.id;
    renderView();
    // Re-paint side-nav active class
    const nav = document.querySelector('.ofp-sidenav');
    if (nav) {
      nav.querySelectorAll('a').forEach(a => {
        a.classList.toggle('is-active', a.dataset.ofpRoute === candidate.id);
      });
    }
  }
}

function setRoute(route) {
  if (!TABS.find(t => t.id === route)) return;
  state.route = route;
  state.query = '';
  if (location.hash !== `#${route}`) {
    // Don't exponential-history: replace state so back button doesn't
    // accumulate one entry per tab click inside the modal.
    history.replaceState(null, '', `#${route}`);
  }
  renderView();
  // Update side-nav active class
  document.querySelectorAll('.ofp-sidenav a').forEach(a => {
    a.classList.toggle('is-active', a.dataset.ofpRoute === route);
  });
}

// ---------------------------------------------------------------------------
// 17. TOAST
// ---------------------------------------------------------------------------

function toast(message, kind = 'info') {
  let area = document.querySelector('.ofp-toast-area');
  if (!area) {
    area = document.createElement('div');
    area.className = 'ofp-toast-area';
    const container = el('openfieldpro-content');
    if (container) container.appendChild(area);
    else document.body.appendChild(area);
  }
  const t = document.createElement('div');
  t.className = 'ofp-toast is-' + kind;
  t.textContent = message;
  area.appendChild(t);
  setTimeout(() => { t.remove(); if (!area.children.length) area.remove(); }, TOAST_TTL_MS);
}

// ---------------------------------------------------------------------------
// 18. MODAL LIFECYCLE (init / open / refresh)
// ---------------------------------------------------------------------------

function init() {
  const modal = el('openfieldpro-modal');
  if (!modal) return;

  // Register with modalManager so the sidebar button toggles its state
  // (minimize → dock chip, ✕ closes, sidebar click restores).
  if (!Modals.isRegistered('openfieldpro-modal')) {
    Modals.register('openfieldpro-modal', {
      railBtnId: null,
      sidebarBtnId: 'tool-openfieldpro-btn',
      label: 'OpenFieldPro',
      icon: ICON_HOME,
      restoreFn: () => {
        // Single show-hydration hook: covers sidebar-button-on-closed AND
        // dock-chip-restore OR sidebar-button-on-minimized, in one path.
        // renderShell rebuilds the IA inside the host so stale state from
        // a previous session doesn't leak through. (The legacy version
        // called only renderView(), which clobbered the shell with bare
        // view markup whenever the IA hadn't been built yet — see the bug
        // where data-ofp-view-host resolved to the outer wrapper and the
        // side-nav vanished into the view content.)
        hydrate();         // restore any user-created jobs/customers from sessionStorage
        if (!state.firstShown) {
          state.firstShown = true;
              // First-show: taste /health, then pull fresh jobs/customers
              // from the same-origin API when it's reachable. Without this
              // the modal would render purely from sessionStorage even
              // when the server has fresher data — items POSTed while the
              // modal was closed (or via curl) would stay invisible after
              // page-refresh because hydrate() only reads sessionStorage.
              // fire-and-forget: renderShell() below paints with the
              // sessionStorage snapshot for the first frame (no flash),
              // then renderView() repaints once the API response lands so
              // the file-persistence ↔ JS round-trip shows live server
              // state.
              pingApi().then(() => {
                if (!state.api.up) return;
                Promise.all([
                  apiOrFallback('/jobs', null),
                  apiOrFallback('/customers', null),
                  apiOrFallback('/inventory', null),
                  apiOrFallback('/invoices', null),
                ]).then(([jobs, custs, invs, invs_]) => {
                  if (Array.isArray(jobs))     state.jobs            = jobs;
                  if (Array.isArray(custs))    state.customers       = custs;
                  if (Array.isArray(invs))     state.inventory_items = invs;
                  if (Array.isArray(invs_))    state.invoices        = invs_;
                  persist();
                  renderView();
                });
          }).catch(() => { /* pingApi already sets state.api.up=false on its own */ });
        }  // minimize→restore skips the whole block above so pingApi only fires once per session
        renderShell();     // build IA shell + initial view (renderShell→renderView at tail)
        handleHashChange();// pick up #dashboard etc. when re-opening to a deep link
      },
      closeFn: () => {
        // Also drop any +New menu or detail overlay that might have leaked
        closeAllMenus();
        closeOverlay();
      },
    });
    Modals.injectMinimizeButton(modal, 'openfieldpro-modal');
  }

  // Wire sidebar button to modalManager's unified restore path; the
  // restoreFn registered above then does the hydration + renderShell work,
  // so lifecycle logic stays in one place (no race with the modalManager
  // capture-phase listener that auto-restores minimize→open).
  el('tool-openfieldpro-btn')?.addEventListener('click', () => {
    Modals.restore('openfieldpro-modal');
  });

  // One delegated click handler on the root covers every action in the
  // modal — the modal can be re-rendered freely without re-binding.
  const root = el('openfieldpro-content');
  if (root && !root.dataset.ofpWired) {
    root.dataset.ofpWired = '1';
    root.addEventListener('click', handleModalClick);
    root.addEventListener('search-input', () => {});
    root.addEventListener('input', (e) => {
      if (e.target?.dataset?.ofpAction === 'search-input') {
        state.query = e.target.value;
        // Update only the table, not the whole view (keeps focus in the search box)
        const tableHost = root.querySelector('section.ofp-section');
        if (tableHost) {
          const fn = VIEWS[state.route];
          if (fn) {
            // naive re-render of just the table section
            const tmp = document.createElement('div');
            tmp.innerHTML = fn();
            const newTable = tmp.querySelector('section.ofp-section');
            if (newTable) tableHost.innerHTML = newTable.innerHTML;
          }
        }
      }
    });
  }

  // Hash-based tab navigation (back/forward buttons work)
  window.addEventListener('hashchange', handleHashChange);

  // Wire the header refresh button so the existing toolbar works
  const refreshBtn = el('openfieldpro-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => { refresh(); });

  // Modal sizing: bump to 1200px so the side-nav layout fits.
  const content = modal.querySelector('.modal-content');
  if (content) {
    content.classList.add('is-xl');
    content.style.maxWidth = MAX_MODAL_WIDTH + 'px';
    content.style.width = '96vw';
    content.style.padding = '0';
  }
}

async function open() {
  // Single open path. Route through modalManager so the same restoreFn
  // registered at init() time fires for both close→open AND minimize→restore,
  // and so we never race with modalManager's own capture-phase listener.
  // The restoreFn does hydrate/pingApi/renderShell/handleHashChange, so we
  // just trigger the visibility transition here and let it run.
  //
  // (The previous version of this function manually toggled .hidden +
  // renderShell, which double-toggled the modal into the minimized state
  // because modalManager's own register/sidebarBtn wiring would also fire
  // on the same click. Funnelling through restore() eliminates that race:
  // whichever path brought us here, the resulting visibility transition
  // is exactly one unhide, then exactly one renderShell from the hook.)
  if (!Modals.isRegistered('openfieldpro-modal')) {
    // Defensive fallback when called before init() mounted us — unhide
    // manually so external callers never see a blank modal.
    const modal = el('openfieldpro-modal');
    if (modal) modal.classList.remove('hidden');
    hydrate();
    pingApi();
    renderShell();
    handleHashChange();
    return;
  }
  Modals.restore('openfieldpro-modal');
}

async function refresh() {
  // Skip when modal is hidden or minimized. Refresh button sits in the static
  // modal-header so it stays clickable while the modal is closed; modalManager
  // toggles `.hidden` and `Modals.minimize()` for forced minimize — the IA
  // host stays in DOM either way, so this guards wasted API fetches + a
  // spurious re-render (writes would succeed either way).
  const ofpModal = el('openfieldpro-modal');
  if (!ofpModal) return;
  if (ofpModal.classList.contains('hidden') ||
      Modals?.isMinimized?.('openfieldpro-modal')) return;
  // Cheap refresh — re-pull API data if reachable, then re-render.
  await pingApi();
  if (state.api.up) {
    const jobs     = await apiOrFallback('/jobs',      null);
    const custs    = await apiOrFallback('/customers', null);
    const invs     = await apiOrFallback('/inventory', null);
    const invoices = await apiOrFallback('/invoices',  null);
    if (Array.isArray(jobs))     state.jobs            = jobs;
    if (Array.isArray(custs))    state.customers       = custs;
    if (Array.isArray(invs))     state.inventory_items = invs;
    if (Array.isArray(invoices)) state.invoices        = invoices;
  }
  renderShell();
}

export default { init, open, refresh };
