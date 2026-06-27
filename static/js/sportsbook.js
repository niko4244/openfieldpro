/**
 * Sportsbook Module — full-page view of SportsClaw's paper-trading picks,
 * ROI, balance growth, and pick reasoning, read from
 * Brainz/data/portfolio.json via /api/sportsbook/summary.
 */
import * as Modals from './modalManager.js';

const API_BASE = window.location.origin;

let _modal = null;
let _open = false;
let _lastData = null;

function _getModal() {
  if (_modal) return _modal;
  _modal = document.createElement('div');
  _modal.id = 'sportsbook-modal';
  _modal.className = 'modal';
  _modal.style.display = 'none';
  _modal.innerHTML = `
    <div class="modal-content sportsbook-modal-content">
      <div class="modal-header">
        <h4><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Sportsbook</h4>
        <button class="close-btn" id="sportsbook-close">✖</button>
      </div>
      <div class="modal-body" id="sportsbook-body"></div>
    </div>`;
  document.body.appendChild(_modal);
  _modal.querySelector('#sportsbook-close').addEventListener('click', closeSportsbook);
  _modal.addEventListener('click', (e) => { if (e.target === _modal) closeSportsbook(); });
  return _modal;
}

function _fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

// American odds → payout on the stake (not counting the stake back).
function _toWin(amount, odds) {
  const n = parseFloat(String(odds).replace('+', ''));
  if (!amount || isNaN(n) || n === 0) return null;
  const toWin = n > 0 ? amount * (n / 100) : amount * (100 / Math.abs(n));
  return Math.round(toWin * 100) / 100;
}

function _fmtOdds(odds) {
  if (odds == null || odds === '') return '—';
  const str = String(odds);
  if (str === 'ML') return 'ML';
  const n = parseFloat(str);
  if (isNaN(n)) return str;
  return n > 0 ? `+${n}` : `${n}`;
}

// The ledger's free-text `description` doesn't reliably say which side was
// picked — it's written as "Away @ Home" or "PickedTeam vs Opponent", with
// the actual picked side only recoverable by combining text order with the
// `direction` field. Total bets ("over/under") aren't a team pick at all.
// ponytail: regex heuristic over free text, not a real parser — covers the
// "@" and "vs" conventions seen in the existing ledger; anything else falls
// back to showing the raw description unsplit.
function _parsePick(pick) {
  const desc = (pick.description || '').trim();
  const type = pick.pick_type;

  if (type === 'total') {
    const m = desc.match(/\b(over|under)\s*([\d.]+)/i);
    const line = m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : (pick.direction || '—').toUpperCase();
    const game = m ? desc.replace(m[0], '').replace(/[\s,-]+$/, '').trim() : desc;
    return { pickLabel: line, context: game, betLabel: line };
  }

  let pickSide = null, oppSide = null;
  if (desc.includes('@')) {
    const [away, home] = desc.split('@').map(s => s.trim());
    if (pick.direction === 'home') { pickSide = home; oppSide = away; }
    else { pickSide = away; oppSide = home; }
  } else {
    const parts = desc.split(/\s+vs\.?\s+/i);
    if (parts.length >= 2) { pickSide = parts[0].trim(); oppSide = parts.slice(1).join(' vs ').trim(); }
  }

  if (!pickSide) {
    const fallback = desc || pick.sport || 'Pick';
    return { pickLabel: fallback, context: '', betLabel: fallback };
  }

  // Strip a trailing "ML" / spread number already baked into the team name
  // so it doesn't duplicate the odds badge shown alongside it.
  const cleanPick = pickSide.replace(/\s*(ML|[-+]\d+(\.\d+)?)\s*$/i, '').trim() || pickSide;
  const cleanOpp = oppSide ? oppSide.replace(/\s*(ML|[-+]\d+(\.\d+)?)\s*$/i, '').trim() : '';
  // Source data occasionally lists the same team on both sides (upstream
  // bug in the pick-recording bot) — don't show a "Team vs Team" matchup.
  const context = cleanOpp && cleanOpp.toLowerCase() !== cleanPick.toLowerCase() ? `vs ${cleanOpp}` : '';

  // Make the bet type explicit on the pick itself: "Dodgers Moneyline",
  // "Lakers -3.5 Spread" — not just a bare team name with odds floating
  // unlabeled next to it.
  let betLabel = cleanPick;
  if (type === 'moneyline') betLabel = `${cleanPick} Moneyline`;
  else if (type === 'spread') betLabel = `${cleanPick} Spread`;

  return { pickLabel: cleanPick, context, betLabel };
}

function _pickCard(p, idx) {
  const pick = p.pick || {};
  const outcome = p.outcome || 'pending';
  const dot = { win: '🟢', loss: '🔴', push: '⚪', cancelled: '⚫' }[outcome] || '🟡';
  const amount = pick.amount ?? p.amount ?? 0;
  const pnl = typeof p.pnl === 'number' ? p.pnl : 0;
  const pnlStr = outcome === 'win' ? `+${_fmtMoney(pnl)}`
    : outcome === 'loss' ? `-${_fmtMoney(Math.abs(amount))}`
    : (outcome === 'pending' ? '' : _fmtMoney(pnl));

  const { betLabel, context } = _parsePick(pick);
  const oddsStr = _fmtOdds(pick.odds);
  const toWin = _toWin(amount, pick.odds);
  const stakeLine = outcome === 'pending'
    ? `$${amount} to win ${toWin != null ? `$${toWin}` : '?'}`
    : `$${amount} @ ${oddsStr}`;

  const rowId = `sb-row-${idx}`;
  const hasReasoning = !!(pick.rationale || p.notes);
  return `
    <div class="sb-pick-row${hasReasoning ? ' sb-expandable' : ''}" data-row="${rowId}">
      <span class="sb-pick-dot">${dot}</span>
      <div class="sb-pick-main">
        <div class="sb-pick-desc">
          <span class="sb-pick-side">${betLabel}</span>
          <span class="sb-pick-odds">${oddsStr}</span>
        </div>
        <div class="sb-pick-meta">${[pick.sport, context].filter(Boolean).join(' · ')}</div>
        <div class="sb-pick-meta">${stakeLine}${pick.confidence != null ? ` · conf ${pick.confidence}` : ''}${p.resolved_at ? ` · ${new Date(p.resolved_at).toLocaleDateString()}` : ''}</div>
        ${hasReasoning ? `
          <div class="sb-pick-reasoning hidden" id="${rowId}-reasoning">
            ${pick.rationale ? `<div class="sb-reasoning-label">Why this pick</div><div class="sb-reasoning-text">${pick.rationale}</div>` : ''}
            ${p.notes ? `<div class="sb-reasoning-label">Result notes</div><div class="sb-reasoning-text">${p.notes}</div>` : ''}
          </div>
        ` : ''}
      </div>
      <div class="sb-pick-pnl ${outcome}">${pnlStr}</div>
    </div>`;
}

// Simple inline SVG sparkline — no chart library needed for one line.
function _growthChart(history) {
  if (!history || history.length < 2) return '';
  const w = 600, h = 120, pad = 6;
  const values = history.map(p => p.balance);
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = (w - pad * 2) / (history.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = values[values.length - 1];
  const first = values[0];
  const lineColor = last >= first ? 'var(--green, #3fb950)' : 'var(--red, #f85149)';
  return `
    <svg viewBox="0 0 ${w} ${h}" class="sb-growth-svg" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function _render(data) {
  _lastData = data;
  const body = document.getElementById('sportsbook-body');
  if (!body) return;
  const r = data.record || {};
  const roiClass = data.roi_pct >= 0 ? 'positive' : 'negative';

  body.innerHTML = `
    <div class="sb-summary">
      <div class="sb-stat"><div class="sb-stat-label">Balance</div><div class="sb-stat-value">${_fmtMoney(data.current_balance)}</div></div>
      <div class="sb-stat"><div class="sb-stat-label">ROI</div><div class="sb-stat-value ${roiClass}">${data.roi_pct >= 0 ? '+' : ''}${data.roi_pct}%</div></div>
      <div class="sb-stat"><div class="sb-stat-label">Record</div><div class="sb-stat-value">${r.wins || 0}-${r.losses || 0}-${r.pushes || 0}</div></div>
    </div>
    <div class="sb-growth-wrap">${_growthChart(data.balance_history)}</div>
    ${data.pending && data.pending.length ? `
      <div class="sb-section-title">Recommended Picks</div>
      <div class="sb-pick-list">${data.pending.map((p, i) => _pickCard(p, `p${i}`)).join('')}</div>
    ` : '<div class="sb-empty">No pending picks right now.</div>'}
    <div class="sb-section-title">Pick History</div>
    <div class="sb-pick-list">${(data.recent || []).map((p, i) => _pickCard(p, `r${i}`)).join('') || '<div class="sb-empty">No resolved picks yet.</div>'}</div>
  `;

  body.querySelectorAll('.sb-expandable').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.row;
      document.getElementById(`${id}-reasoning`)?.classList.toggle('hidden');
    });
  });
}

async function _fetchAndRender() {
  const body = document.getElementById('sportsbook-body');
  if (body) body.innerHTML = '<div class="sb-loading">Loading…</div>';
  try {
    const res = await fetch(`${API_BASE}/api/sportsbook/summary`);
    const data = await res.json();
    _render(data);
  } catch (e) {
    if (body) body.innerHTML = '<div class="sb-empty">Could not load Sportsbook data.</div>';
  }
}

function openSportsbook() {
  if (_open) return;
  if (Modals.isMinimized('sportsbook-modal')) {
    Modals.restore('sportsbook-modal');
    _open = true;
    return;
  }
  _open = true;
  const modal = _getModal();
  modal.classList.remove('hidden', 'modal-minimized');
  modal.style.display = 'flex';
  Modals.register('sportsbook-modal', {
    sidebarBtnId: 'tool-sportsbook-btn',
    closeFn: () => _doClose(),
    restoreFn: () => {},
  });
  _fetchAndRender();
}

function _doClose() {
  _open = false;
  if (_modal) {
    _modal.style.display = 'none';
    _modal.classList.add('hidden');
  }
}

function closeSportsbook() {
  if (!_open && !Modals.isMinimized('sportsbook-modal')) return;
  if (Modals.isRegistered('sportsbook-modal')) Modals.close('sportsbook-modal');
  else _doClose();
}

function isSportsbookOpen() {
  if (Modals.isMinimized('sportsbook-modal')) return false;
  return _open;
}

const sportsbookModule = { openSportsbook, closeSportsbook, isSportsbookOpen };
export { openSportsbook, closeSportsbook, isSportsbookOpen };
export default sportsbookModule;
