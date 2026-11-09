// Partage du butin de groupe (alliance à 3 joueurs ou plus) : onglets Argent / Drogue, −/+ par membre, tout le monde valide.
// Le partage à 2 reste dans modalAlliedLootSplit (loot_split_*).
let groupSplitState = null;
let groupSplitTab = 'cash';

// Conteneur de l'écran, inséré dans l'appli au chargement (même niveau que les modales)
const groupSplitEl = (() => {
  const style = document.createElement('style');
  style.textContent = `
#modalGroupLootSplit { background: #07080e; }
#modalGroupLootSplit .gs-scene { position: absolute; left: 0; right: 0; top: 36px; height: 240px; display: flex; align-items: center; justify-content: center; pointer-events: none; background: radial-gradient(closest-side, rgba(250,204,21,.16), transparent); }
#modalGroupLootSplit .gs-scene img { width: 86%; max-width: 330px; height: 100%; object-fit: contain; filter: drop-shadow(0 14px 22px rgba(0,0,0,.7)); }
@media (max-height: 700px) { #modalGroupLootSplit .gs-scene { top: 30px; height: 140px; } }

#modalGroupLootSplit .gs-bar { display: flex; height: 16px; border-radius: 99px; overflow: hidden; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05); }
#modalGroupLootSplit .gs-bar > div { transition: width .25s ease; }
#modalGroupLootSplit .gs-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
#modalGroupLootSplit .gs-row img { width: 38px; height: 38px; border-radius: 99px; object-fit: cover; border: 2px solid var(--c); flex-shrink: 0; }
#modalGroupLootSplit .gs-step { width: 32px; height: 32px; border-radius: 10px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font-size: 15px; color: #fff; flex-shrink: 0; }
#modalGroupLootSplit .gs-step:active { background: rgba(255,255,255,.18); }
#modalGroupLootSplit .gs-step:disabled { opacity: .3; }
#modalGroupLootSplit .gs-pct { width: 48px; text-align: center; font-size: 20px; color: var(--c); flex-shrink: 0; }
#modalGroupLootSplit .gs-cta { background: linear-gradient(90deg, #6ee7b7, #10b981); color: #04120c; border: 1px solid transparent; }
#modalGroupLootSplit .gs-cta.gs-wait { background: rgba(255,255,255,.08); color: #94a3b8; border: 1px solid rgba(255,255,255,.12); }
`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'modalGroupLootSplit';
  el.className = 'hidden absolute inset-0 z-50 flex flex-col overflow-hidden text-white';
  document.getElementById('app-container').appendChild(el);
  // Délégation : onglets, −/+ et validation
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.tab) { groupSplitTab = btn.dataset.tab; renderGroupSplitUI(); }
    else if (btn.dataset.delta) groupSplitAdjust(btn.dataset.token, Number(btn.dataset.delta));
    else if (btn.dataset.accept) groupSplitAccept();
  });
  return el;
})();

// Montants comme le serveur : floor(total × pct / 100), le reste au premier membre
function computeGroupShares(total, members, pcts) {
  const amounts = members.map(m => Math.floor((total || 0) * (pcts[m.token] || 0) / 100));
  if (members.length) amounts[0] += (total || 0) - amounts.reduce((t, a) => t + a, 0);
  return amounts;
}

function renderGroupSplitUI() {
  const s = groupSplitState;
  if (!s) return;
  const members = s.members || [];
  const totalCash = s.totalCash || 0;
  const totalDrugs = s.totalDrugs || 0;
  // Un onglet disparaît si son total est nul
  const tabs = [
    { key: 'cash', icon: 'ph-money', label: 'Argent', total: `${totalCash.toLocaleString('fr-FR')} €`, show: totalCash > 0 },
    { key: 'drugs', icon: 'ph-leaf', label: 'Drogue', total: `${totalDrugs} kg`, show: totalDrugs > 0 }
  ].filter(t => t.show);
  if (!tabs.some(t => t.key === groupSplitTab)) groupSplitTab = tabs.length ? tabs[0].key : 'cash';
  const pcts = (groupSplitTab === 'cash' ? s.cashPcts : s.drugPcts) || {};
  const cashShares = computeGroupShares(totalCash, members, s.cashPcts || {});
  const drugShares = computeGroupShares(totalDrugs, members, s.drugPcts || {});
  const accepted = s.accepted || {};
  const iAccepted = !!accepted[myPlayerToken];
  const colorOf = (m) => (CAID_ROSTER.find(c => c.id === m.caidId) || {}).hex || '#94a3b8';
  const imgOf = (m) => (CAID_ROSTER.find(c => c.id === m.caidId) || CAID_ROSTER[0]).imageFile;

  const tabsHtml = tabs.length ? `
    <div class="grid ${tabs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1 p-1 rounded-2xl mb-3" style="background:rgba(255,255,255,.06)">
      ${tabs.map(t => `<button data-tab="${t.key}" class="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase" style="${t.key === groupSplitTab ? 'background:#10b981;color:#04120c' : 'color:#94a3b8'}">
        <i class="ph-bold ${t.icon}"></i>${t.label} <span style="opacity:.75;font-weight:700">${t.total}</span></button>`).join('')}
    </div>` : '';

  const barHtml = `<div class="gs-bar mb-3">${members.map(m => `<div style="width:${pcts[m.token] || 0}%;background:${colorOf(m)}"></div>`).join('')}</div>`;

  const rowsHtml = members.map((m, i) => {
    const pct = pcts[m.token] || 0;
    const name = m.token === myPlayerToken ? 'Toi' : (m.caidName || 'Allié');
    const cashTxt = `${cashShares[i].toLocaleString('fr-FR')} €`;
    const drugTxt = `${drugShares[i]} kg`;
    const amounts = groupSplitTab === 'cash'
      ? `<b class="text-white">${cashTxt}</b> • ${drugTxt}`
      : `${cashTxt} • <b class="text-white">${drugTxt}</b>`;
    const ok = !!accepted[m.token];
    return `<div class="gs-row" style="--c:${colorOf(m)}">
      <img src="${imgOf(m)}" alt="">
      <div class="flex-1 min-w-0">
        <span class="block text-xs font-black truncate">${escapeHtml(name)}</span>
        <span class="block text-[11px] font-bold text-slate-300">${amounts}</span>
        <span class="block text-[9px] font-black uppercase ${ok ? 'text-emerald-400' : 'text-slate-500'}">${ok ? '✓ d’accord' : 'en attente…'}</span>
      </div>
      <button data-token="${escapeHtml(m.token)}" data-delta="-5" class="gs-step" ${pct <= 0 ? 'disabled' : ''} aria-label="Baisser la part"><i class="ph-bold ph-minus"></i></button>
      <span class="gs-pct font-anton">${pct}%</span>
      <button data-token="${escapeHtml(m.token)}" data-delta="5" class="gs-step" ${pct >= 100 ? 'disabled' : ''} aria-label="Augmenter la part"><i class="ph-bold ph-plus"></i></button>
    </div>`;
  }).join('');

  groupSplitEl.innerHTML = `
    <div class="gs-scene"><img src="sac-butin.webp" alt="Sac de butin"></div>
    <div class="relative z-[1] flex flex-col h-full">
      <div class="flex items-center justify-between px-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-slate-200">
        <span>Manche ${currentSession.round || 1}</span>
        <span class="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white" style="background:#059669"><i class="ph-fill ph-handshake"></i> Alliance</span>
      </div>
      <div class="flex-1 min-h-[24px]"></div>
      <div class="loot-panel overflow-y-auto">
        <span class="block text-center text-[10px] font-mono uppercase font-bold text-emerald-300">${escapeHtml(s.title || 'Butin')}</span>
        <h2 class="font-anton text-center text-white leading-none mt-1" style="font-size:36px;text-shadow:0 4px 18px rgba(0,0,0,.8)">PARTAGE DU BUTIN</h2>
        <p class="text-center text-sm font-bold text-slate-200 mt-1 mb-3">Chacun ajuste, tout le monde valide</p>
        ${tabsHtml}
        ${barHtml}
        <div class="flex flex-col gap-2">${rowsHtml}</div>
        <p class="text-center text-[10px] text-slate-500 mt-2">Si quelqu'un change une part, les accords repartent à zéro.</p>
        <button data-accept="1" class="gs-cta ${iAccepted ? 'gs-wait' : ''} w-full mt-3 py-3.5 rounded-2xl font-black uppercase text-sm" ${iAccepted ? 'disabled' : ''}>
          ${iAccepted ? '<i class="ph-bold ph-hourglass-medium"></i> En attente des autres…' : '<i class="ph-bold ph-check-circle"></i> Valider ce partage'}
        </button>
      </div>
    </div>`;
}

function groupSplitAdjust(token, delta) {
  if (socket) socket.emit('group_split_adjust', { kind: groupSplitTab, token, delta });
}

function groupSplitAccept() {
  if (socket) socket.emit('group_split_accept');
}

if (socket) {
  socket.on('group_split_opened', (splitState) => {
    groupSplitState = splitState;
    groupSplitTab = (splitState.totalCash || 0) > 0 ? 'cash' : 'drugs';
    renderGroupSplitUI();
    groupSplitEl.classList.remove('hidden');
  });

  socket.on('group_split_updated', (splitState) => {
    groupSplitState = splitState;
    renderGroupSplitUI();
    groupSplitEl.classList.remove('hidden');
  });

  socket.on('group_split_completed', async ({ title, cashGained, drugsGained }) => {
    const nb = groupSplitState ? (groupSplitState.members || []).length : 0;
    groupSplitState = null;
    groupSplitEl.classList.add('hidden');
    localPlayer.pocketCash += (cashGained || 0);
    localPlayer.drugs += (drugsGained || 0);
    refreshHud();
    await showAppAlert(
      `Accord validé par ${nb ? `les ${nb} alliés` : 'tous les alliés'} (${title}) !\nVotre part reçue : +${(cashGained || 0).toLocaleString()} € et +${drugsGained || 0} kg.`,
      "🤝 Butin Partagé"
    );
  });
}
