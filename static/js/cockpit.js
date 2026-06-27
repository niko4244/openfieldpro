import * as Modals from './modalManager.js';

const cockpitIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16v-3M12 16V8M17 16v-5"/></svg>';
const el = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function ageLabel(seconds) {
  if (!Number.isFinite(seconds)) return 'No timestamp';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}`;
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : '--';
}

function statusClass(state) {
  if (state === 'up') return 'is-good';
  if (state === 'restarting') return 'is-warn';
  return 'is-bad';
}

function renderEmpty(label) {
  return `<div class="cockpit-empty">${escapeHtml(label)}</div>`;
}

function renderCockpit(data) {
  const health = data.health || {};
  const orange = data.orange || {};
  const approvals = data.approvals || {};
  const scorecards = Array.isArray(data.scorecards) ? data.scorecards : [];
  const attention = Array.isArray(health.attention) ? health.attention : [];
  const orangeItems = Array.isArray(orange.items) ? orange.items : [];
  const handoffs = Array.isArray(approvals.handoffs) ? approvals.handoffs : [];
  const promotions = Array.isArray(approvals.promotions) ? approvals.promotions : [];
  const sourceStale = Number(health.source_age_seconds) > 180;

  el('cockpit-content').innerHTML = `
    <div class="cockpit-status-strip" aria-live="polite">
      <div class="cockpit-status ${health.healthy ? 'is-good' : 'is-warn'}">
        <span>Services</span><strong>${escapeHtml(health.up)}/${escapeHtml(health.total)}</strong>
        <small>${escapeHtml(ageLabel(health.source_age_seconds))}</small>
      </div>
      <div class="cockpit-status ${orange.count ? 'is-warn' : 'is-good'}">
        <span>Orange</span><strong>${escapeHtml(orange.count || 0)}</strong>
        <small>Needs review</small>
      </div>
      <div class="cockpit-status ${(approvals.handoff_count || 0) ? 'is-warn' : 'is-good'}">
        <span>Handoffs</span><strong>${escapeHtml(approvals.handoff_count || 0)}</strong>
        <small>Awaiting decision</small>
      </div>
      <div class="cockpit-status ${sourceStale ? 'is-warn' : 'is-good'}">
        <span>Feed</span><strong>${sourceStale ? 'Stale' : 'Live'}</strong>
        <small>${escapeHtml(health.managed_down || 0)} managed down</small>
      </div>
    </div>
    <div class="cockpit-grid">
      <section class="cockpit-section" aria-labelledby="cockpit-attention-title">
        <div class="cockpit-section-heading"><h5 id="cockpit-attention-title">Service Attention</h5><span>${escapeHtml(health.attention_count || 0)}</span></div>
        <div class="cockpit-list">
          ${attention.length ? attention.map((service) => `
            <div class="cockpit-row">
              <span class="cockpit-dot ${statusClass(service.state)}" aria-hidden="true"></span>
              <div><strong>${escapeHtml(service.id)}</strong><small>${escapeHtml(service.group || 'service')}${service.port ? ` :${escapeHtml(service.port)}` : ''}</small></div>
              <span class="cockpit-state ${statusClass(service.state)}">${escapeHtml(service.state)}</span>
            </div>`).join('') : renderEmpty('All managed services are healthy.')}
        </div>
      </section>
      <section class="cockpit-section" aria-labelledby="cockpit-orange-title">
        <div class="cockpit-section-heading"><h5 id="cockpit-orange-title">Orange Queue</h5><span>${escapeHtml(orange.count || 0)}</span></div>
        <div class="cockpit-list cockpit-detail-list">
          ${orangeItems.length ? orangeItems.map((job) => `
            <article class="cockpit-detail"><strong>${escapeHtml(job.id)}</strong><small>${escapeHtml(job.owner || 'Unassigned')}</small><p>${escapeHtml(job.reason || job.next_action || 'No detail recorded.')}</p></article>`).join('') : renderEmpty('No orange items.')}
        </div>
      </section>
      <section class="cockpit-section" aria-labelledby="cockpit-handoff-title">
        <div class="cockpit-section-heading"><h5 id="cockpit-handoff-title">Handoff Inbox</h5><span>${escapeHtml(approvals.handoff_count || 0)}</span></div>
        <div class="cockpit-list cockpit-detail-list">
          ${handoffs.length ? handoffs.map((handoff) => `
            <article class="cockpit-detail"><strong>${escapeHtml(handoff.worker_id || handoff.handoff_id)}</strong><small>${escapeHtml(handoff.lane || 'review')}</small><p>${escapeHtml(handoff.proposal?.rule || handoff.proposal?.evidence || 'Proposal awaiting review.')}</p></article>`).join('') : renderEmpty('No production handoffs waiting.')}
        </div>
      </section>
      <section class="cockpit-section" aria-labelledby="cockpit-outcomes-title">
        <div class="cockpit-section-heading"><h5 id="cockpit-outcomes-title">Outcome Scorecards</h5><span>${escapeHtml(scorecards.length)}</span></div>
        <div class="cockpit-scorecards">
          ${scorecards.length ? scorecards.map((scorecard) => `
            <div class="cockpit-scorecard">
              <strong>${escapeHtml(scorecard.bot)}</strong>
              <span class="${Number(scorecard.total_profit_loss) >= 0 ? 'is-good' : 'is-bad'}">${escapeHtml(money(scorecard.total_profit_loss))}</span>
              <small>${escapeHtml(scorecard.wins)}/${escapeHtml(scorecard.losses)} W/L · ${escapeHtml(percent(scorecard.win_rate * 100))} · ${escapeHtml(scorecard.unresolved_picks)} open</small>
            </div>`).join('') : renderEmpty('No scorecards published yet.')}
        </div>
      </section>
      <section class="cockpit-section cockpit-promotions" aria-labelledby="cockpit-promotions-title">
        <div class="cockpit-section-heading"><h5 id="cockpit-promotions-title">Recent Promotions</h5><span>${escapeHtml(approvals.promotion_count || 0)}</span></div>
        <div class="cockpit-list cockpit-detail-list">
          ${promotions.length ? promotions.map((promotion) => `
            <article class="cockpit-detail"><strong>${escapeHtml(promotion.experiment_id)}</strong><small>${escapeHtml(promotion.approved_by || 'Approved')}</small><p>${escapeHtml(promotion.change || 'Promotion recorded.')}</p></article>`).join('') : renderEmpty('No production promotions recorded.')}
        </div>
      </section>
    </div>`;
}

async function refresh() {
  const content = el('cockpit-content');
  const refreshButton = el('cockpit-refresh-btn');
  if (!content) return;
  if (refreshButton) refreshButton.disabled = true;
  content.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/cockpit/summary', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Cockpit request failed (${response.status})`);
    renderCockpit(await response.json());
  } catch (error) {
    content.innerHTML = `<div class="cockpit-error">${escapeHtml(error.message || 'Unable to load system state.')}</div>`;
  } finally {
    content.removeAttribute('aria-busy');
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function open() {
  const modal = el('cockpit-modal');
  if (!modal) return;
  if (Modals.isRegistered('cockpit-modal')) {
    if (Modals.isMinimized('cockpit-modal')) {
      Modals.restore('cockpit-modal');
      await refresh();
      return;
    }
    if (!modal.classList.contains('hidden')) {
      Modals.minimize('cockpit-modal');
      return;
    }
  }
  modal.classList.remove('hidden', 'modal-minimized');
  await refresh();
}

function init() {
  const modal = el('cockpit-modal');
  if (!modal) return;
  if (!Modals.isRegistered('cockpit-modal')) {
    Modals.register('cockpit-modal', {
      railBtnId: 'rail-cockpit',
      sidebarBtnId: 'tool-cockpit-btn',
      label: 'System',
      icon: cockpitIcon,
      restoreFn: () => modal.classList.remove('hidden', 'modal-minimized'),
      closeFn: () => modal.classList.add('hidden'),
    });
    Modals.injectMinimizeButton(modal, 'cockpit-modal');
  }
  el('tool-cockpit-btn')?.addEventListener('click', open);
  el('close-cockpit-modal')?.addEventListener('click', () => Modals.close('cockpit-modal'));
  el('cockpit-refresh-btn')?.addEventListener('click', refresh);
}

export default { init, open, refresh };
