// Alliance et partage du butin

function renderLootSplitModalUI(split) {
  if (!split) return;
  const drugLeftPct = split.drugLeftPct ?? split.leftPct;
  const leftCash = Math.round((split.totalCash * split.leftPct) / 100);
  const rightCash = split.totalCash - leftCash;
  const leftDrugs = Math.round((split.totalDrugs * drugLeftPct) / 100);
  const rightDrugs = split.totalDrugs - leftDrugs;

  document.getElementById('lootSplitModalTitle').innerText = split.title || 'Partage du Butin';
  document.getElementById('lootSplitTotalSubtitle').innerText = `Total à partager : ${split.totalCash.toLocaleString()} €` + (split.totalDrugs > 0 ? ` + ${split.totalDrugs} kg` : '');

  document.getElementById('lootSplitLeftName').innerText = split.leftName;
  document.getElementById('lootSplitRightName').innerText = split.rightName;

  document.getElementById('lootSplitLeftAmounts').innerText = `${leftCash.toLocaleString()} €` + (split.totalDrugs > 0 ? ` • ${leftDrugs} kg` : '');
  document.getElementById('lootSplitRightAmounts').innerText = `${rightCash.toLocaleString()} €` + (split.totalDrugs > 0 ? ` • ${rightDrugs} kg` : '');

  document.getElementById('lootSplitLeftStatus').innerHTML = split.leftAccepted
    ? '<span class="text-emerald-400 font-bold">✅ Accord validé</span>'
    : '⏳ En attente...';
  document.getElementById('lootSplitRightStatus').innerHTML = split.rightAccepted
    ? '<span class="text-emerald-400 font-bold">✅ Accord validé</span>'
    : '⏳ En attente...';

  // Valeur du curseur = part du joueur de droite : glisser vers un joueur augmente sa part
  document.getElementById('lootSplitCashBlock').classList.toggle('hidden', split.totalCash <= 0 && split.totalDrugs > 0);
  document.getElementById('lootSplitSlider').value = 100 - split.leftPct;
  document.getElementById('lootSplitCashLeftLabel').innerText = `${split.leftPct}%`;
  document.getElementById('lootSplitCashRightLabel').innerText = `${100 - split.leftPct}%`;

  document.getElementById('lootSplitDrugBlock').classList.toggle('hidden', split.totalDrugs <= 0);
  document.getElementById('lootSplitDrugSlider').value = 100 - drugLeftPct;
  document.getElementById('lootSplitDrugLeftLabel').innerText = `${drugLeftPct}%`;
  document.getElementById('lootSplitDrugRightLabel').innerText = `${100 - drugLeftPct}%`;

  const myAccepted = (myPlayerToken === split.leftToken && split.leftAccepted) || (myPlayerToken === split.rightToken && split.rightAccepted);
  const btn = document.getElementById('btnAcceptLootSplit');
  if (myAccepted) {
    btn.innerText = "En attente de votre allié...";
    btn.className = "w-full py-3.5 bg-emerald-700 text-white font-black uppercase rounded-2xl text-xs opacity-75";
  } else {
    btn.innerText = "Accepter ce Partage";
    btn.className = "w-full py-3.5 bg-gradient-to-r from-emerald-400 to-green-500 text-black font-black uppercase rounded-2xl text-xs shadow-lg";
  }
}

function onLootSplitSliderInput(val, kind = 'cash') {
  const leftPct = 100 - (parseInt(val) || 0);
  if (socket) socket.emit('update_loot_split_slider', { leftPct, kind });
}

function emitAcceptLootSplit() {
  if (socket) socket.emit('accept_loot_split');
}

// --- Écran d'alliance plein page : choix, attente, demande reçue, pacte scellé, refus ---
let allySelected = [];           // tokens cochés sur l'écran de choix
let allyOutgoing = null;         // ma demande en cours { requestId, invitees: [{ token, caidName, caidId, status }], done }
let allyHeldPact = null;         // pacte reçu par le proposant avant que tous les invités aient répondu
let allyLastPact = null;         // dernier alliance_confirmed reçu
// allianceId dont l'écran « scellé » a déjà été montré, gardés par Caïd (page rechargée, partie test)
const allySeenKey = 'g2s_seen_pacts_' + myPlayerToken;
const allySeenPacts = new Set((() => { try { return JSON.parse(localStorage.getItem(allySeenKey)) || []; } catch (e) { return []; } })());
let allyResolve = null;

function allyCaidImg(caidId, name) {
  const c = CAID_ROSTER.find(x => x.id === caidId) || CAID_ROSTER.find(x => x.name === name);
  return c ? c.imageFile : 'noir.jpg';
}
function allyShort(name) { return String(name || 'Caïd').split(' ')[0]; }
function allyRivalName(r) { return r.caidName || r.name || 'Caïd Adverse'; }
function allyInHospital(r) { return !!(r.inHospital && r.inHospital.round === (currentSession.round || 1)); }
// Caïd qui a déjà joué son tour de la manche (ordre de passage envoyé par le serveur)
function allyPlayed(r) { return (lastTurnOrder || []).some(p => p.token === r.playerToken && p.played); }
// Caïd absent (a quitté la partie), à l'hôpital ou qui a déjà joué cette manche : pas d'alliance possible
function allyUnavailable(r) { return !!r.away || allyInHospital(r) || allyPlayed(r); }
// « A », « A et B », « A, B et C »
function allyListNames(names) {
  names = (names || []).filter(Boolean);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

const allyAt = (side, top, html, right) => `<div class="ally-at ${side}" style="${side === 'l' ? 'left' : 'right'}:${right || '18px'};top:${top}">${html}</div>`;
const allyStatus = st => st ? `<span class="ally-st ${st}">${{ ok: '✓', no: '✕', wait: '…' }[st] || '…'}</span>` : '';
const allyTag = (img, label, st) => `<div class="ally-tag ${st === 'no' ? 'dim' : ''}"><img src="${img}" alt="">${allyStatus(st)}<b>${escapeHtml(label)}</b></div>`;
const allyMini = (img, label, st) => `<div class="ally-mini ${st === 'no' ? 'dim' : ''}"><img src="${img}" alt="">${allyStatus(st)}<b>${escapeHtml(label)}</b></div>`;
const allyBubble = (text, side, top) => `<div class="ally-bubble ${side}" style="${side === 'l' ? 'left' : 'right'}:14px;top:${top}">${text}</div>`;
// Les 4 avantages de l'alliance (n = nombre de Caïds dans l'alliance)
function allyPerks(n) {
  return `<div class="grid grid-cols-2 gap-2">
    <div class="ally-ic"><i class="ph-bold ph-users-three"></i>Tour joué ${n > 2 ? `à ${n}` : 'ensemble'}</div>
    <div class="ally-ic"><i class="ph-bold ph-sword"></i>Attaque, Lascars &amp; équipements cumulés</div>
    <div class="ally-ic"><i class="ph-bold ph-shield-check"></i>Pas d’attaque, 2 manches</div>
    <div class="ally-ic"><i class="ph-bold ph-coins"></i>Butin partagé</div></div>`;
}

function allyState() {
  const scr = document.getElementById('allianceScreen');
  return scr && !scr.classList.contains('hidden') ? scr.dataset.state : null;
}

// Affiche un état ; si l'écran montre déjà cet état, simple mise à jour sans rejouer les animations
function allyRender(state, stage, bottom) {
  const scr = document.getElementById('allianceScreen');
  const same = allyState() === state;
  scr.dataset.state = state;
  document.getElementById('allyRound').innerText = currentSession.round || 1;
  const img = state === 'scelle' ? 'alliance-pacte.webp' : 'alliance-deal.webp';
  const imgEl = document.getElementById('allyImg');
  if (!imgEl.src.endsWith(img)) {
    // Passage de la demande au pacte : l'ancienne scène s'efface en fondu par-dessus la nouvelle
    const wasShown = !document.getElementById('allianceScreen').classList.contains('hidden');
    if (wasShown) {
      // Calque déjà chargé avec la page : pas d'écran noir le temps de décoder l'image
      const prevImg = document.getElementById('allyPrev');
      if (!prevImg.src.endsWith(imgEl.src.split('/').pop())) prevImg.src = imgEl.src;
      prevImg.classList.remove('on');
      void prevImg.offsetWidth;
      prevImg.classList.add('on');
      clearTimeout(allyRender.prevTimer);
      allyRender.prevTimer = setTimeout(() => prevImg.classList.remove('on'), 1000);
    }
    imgEl.src = img;
  }
  document.getElementById('allyStage').innerHTML = stage;
  document.getElementById('allyBottom').innerHTML = bottom;
  if (same) { scr.classList.add('static'); return; }
  scr.classList.remove('hidden', 'show', 'static');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  const prev = allyResolve;
  return new Promise(resolve => { allyResolve = () => { if (prev) prev(); resolve(); }; });
}

function closeAllianceScreen() {
  const scr = document.getElementById('allianceScreen');
  if (scr) { scr.classList.add('hidden'); scr.classList.remove('show', 'static'); }
  const r = allyResolve;
  allyResolve = null;
  if (r) r();
}

// CHOIX : le joueur actif coche 1 à 3 Caïds
async function openAllianceModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  if (activeTurnPlayerToken && activeTurnPlayerToken !== myPlayerToken) return showAppAlert("Seul le Caïd dont c'est le tour peut proposer une alliance.", "Alliance");
  allySelected = [];
  return renderAllianceChoice();
}

function renderAllianceChoice() {
  const rivals = connectedRivals || [];
  allySelected = allySelected.filter(t => rivals.some(r => r.playerToken === t && !allyUnavailable(r)));
  const picked = allySelected.map(t => rivals.find(r => r.playerToken === t));
  const free = rivals.filter(r => !allyUnavailable(r)).length;
  const me = getMyCaid();

  const right = picked.length
    ? picked.map(r => allyMini(allyCaidImg(r.caidId, allyRivalName(r)), allyRivalName(r))).join('')
    : `<div class="ally-tag"><div class="ally-unknown">?</div><b>Ton partenaire</b></div>`;
  const stage = allyAt('l', '52%', allyTag(me.imageFile, 'Toi')) + allyAt('r', ['50%', '46%', '40%', '33%'][picked.length], right, '14px');

  const lascars = n => `${n} Lascar${n > 1 ? 's' : ''}`;
  const pick = r => {
    if (r.away) return `<div class="ally-pick off"><img src="${allyCaidImg(r.caidId, allyRivalName(r))}" alt=""><div class="n"><b>💤 ${escapeHtml(allyRivalName(r))}</b><span>A quitté la partie : pas d’alliance</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    if (allyInHospital(r)) return `<div class="ally-pick off"><img src="${allyCaidImg(r.caidId, allyRivalName(r))}" alt=""><div class="n"><b>🏥 ${escapeHtml(allyRivalName(r))}</b><span>À l’hôpital : pas d’alliance cette manche</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    if (allyPlayed(r)) return `<div class="ally-pick off"><img src="${allyCaidImg(r.caidId, allyRivalName(r))}" alt=""><div class="n"><b>✔️ ${escapeHtml(allyRivalName(r))}</b><span>A déjà joué : pas d’alliance cette manche</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    const on = allySelected.includes(r.playerToken);
    return `<button type="button" class="ally-pick ${on ? 'on' : ''}" data-token="${escapeHtml(r.playerToken)}" onclick="toggleAllyPick(this.dataset.token)"><img src="${allyCaidImg(r.caidId, allyRivalName(r))}" alt=""><div class="n"><b>${escapeHtml(allyRivalName(r))}</b><span>${lascars(r.musclesCount || 0)} • Escort : ${r.hasProstituteInTransit ? 'oui' : 'non'} • Chien : ${r.hasStrayDog ? 'oui' : 'non'}</span></div><span class="ally-chk"><i class="ph-bold ph-check"></i></span></button>`;
  };
  const n = allySelected.length;
  const hint = free > 1 ? `Choisis ${free > 2 ? '1, 2 ou 3' : '1 ou 2'} Caïds` : 'Choisis ton partenaire';
  const bottom = `<h2 class="font-anton ally-head sm">AVEC QUI TU T’ASSOCIES ?</h2>
    <div class="text-center text-[11px] font-bold text-slate-400 mt-1">${rivals.length ? hint : 'Aucun Caïd rival dans la partie'}</div>
    <div class="flex flex-col gap-2 mt-3">${rivals.map(pick).join('')}</div>
    <div class="grid grid-cols-[1fr_1.6fr] gap-2 mt-4"><button type="button" class="ally-ghost" onclick="closeAllianceScreen()">Annuler</button><button type="button" class="ally-cta" onclick="confirmAlliance()" ${n ? '' : 'disabled'}>${n ? `Proposer à ${n} Caïd${n > 1 ? 's' : ''}` : 'Choisis un Caïd'}</button></div>`;
  return allyRender('choix', stage, bottom);
}

function toggleAllyPick(token) {
  const i = allySelected.indexOf(token);
  if (i >= 0) allySelected.splice(i, 1);
  else if (allySelected.length < 3) allySelected.push(token);
  renderAllianceChoice();
}

// Appelé par syncMultiplayerTargets : la liste des Caïds a changé
function refreshAllianceChoice() { if (allyState() === 'choix') renderAllianceChoice(); }

function confirmAlliance() {
  if (!isMyTurnToPlay || !allySelected.length) return;
  const targets = allySelected.map(t => connectedRivals.find(r => r.playerToken === t)).filter(Boolean);
  if (!targets.length) return showAppAlert("Choisissez un Caïd.", "Alliance");
  const caid = getMyCaid();
  if (socket) socket.emit('propose_alliance', { targetPlayerTokens: targets.map(r => r.playerToken), senderName: caid.name });
  allyOutgoing = { requestId: null, done: false, invitees: targets.map(r => ({ token: r.playerToken, caidName: allyRivalName(r), caidId: r.caidId, status: 'wait' })) };
  allyHeldPact = null;
  renderAllianceWaiting();
}

// ATTENTE : le proposant suit les réponses de chaque invité
function renderAllianceWaiting() {
  if (!allyOutgoing) return;
  const inv = allyOutgoing.invitees || [];
  const count = st => inv.filter(i => i.status === st).length;
  const me = getMyCaid();
  const right = inv.length === 1
    ? allyAt('r', '61%', allyTag(allyCaidImg(inv[0].caidId, inv[0].caidName), inv[0].caidName, inv[0].status))
    : allyAt('r', '30%', inv.map(i => allyMini(allyCaidImg(i.caidId, i.caidName), i.caidName, i.status)).join(''), '12px');
  const stage = allyBubble('On s’associe ?', 'l', '4%') + allyAt('l', inv.length === 1 ? '61%' : '54%', allyTag(me.imageFile, 'Toi')) + right;

  const label = { ok: ['accepte', '#34d399'], no: ['refuse', '#fb7185'], wait: ['réfléchit…', '#94a3b8'] };
  const rows = inv.map(i => {
    const [txt, col] = label[i.status] || label.wait;
    return `<div class="ally-row"><img src="${allyCaidImg(i.caidId, i.caidName)}" alt="" class="${i.status === 'no' ? 'dim' : ''}"><span class="lbl">${escapeHtml(i.caidName)}</span><span class="aft" style="color:${col}">${txt}</span></div>`;
  }).join('');
  const waiting = count('wait');
  const summary = inv.length === 1
    ? `Demande envoyée à <span class="ally-ac">${escapeHtml(inv[0].caidName)}</span>`
    : `Réponses : <span style="color:#34d399">${count('ok')} oui</span> · <span style="color:#fb7185">${count('no')} non</span> · <span class="text-slate-400">${waiting} en attente</span>`;
  const note = inv.length === 1 ? 'En attente de sa réponse… L’écran se met à jour tout seul.' : 'L’alliance se fait avec ceux qui acceptent. L’écran se met à jour tout seul.';
  const bottom = `<h2 class="font-anton ally-head">UN DEAL ?</h2>
    <div class="text-center text-sm font-bold text-slate-200 mt-1">${summary}</div>
    <div class="text-center mt-3 ally-dots" style="${waiting ? '' : 'visibility:hidden'}"><i></i><i></i><i></i></div>
    <div class="text-center text-[11px] text-slate-500 mt-2 mb-4">${note}</div>
    <div class="flex flex-col gap-1.5">${rows}</div>
    <button type="button" class="ally-close" onclick="closeAllianceScreen()">Fermer</button>`;
  return allyRender('attente', stage, bottom);
}

// alliance_request_status : mise à jour des réponses chez le proposant
function onAllianceRequestStatus(data) {
  if (!data) return;
  allyOutgoing = { requestId: data.requestId, done: !!data.done, invitees: data.invitees || [] };
  const showing = allyState() === 'attente';
  if (allyOutgoing.done && allyOutgoing.invitees.some(i => i.status === 'ok') && allyHeldPact) {
    const pact = allyHeldPact;
    allyHeldPact = null;
    return showAllianceSealed(pact);
  }
  // Reconnexion pendant l'attente des réponses : on rouvre l'écran d'attente
  if (showing || (data.resent && !allyOutgoing.done)) renderAllianceWaiting();
}

// REÇU : un Caïd me propose une alliance (éventuellement avec d'autres invités)
function showAllianceRequest(data) {
  pendingAllianceRequest = data;
  const invitees = data.invitees || [];
  const others = invitees.filter(i => i.token !== myPlayerToken);
  const n = Math.max(invitees.length, 1) + 1;
  const sender = data.senderCaid || 'Un rival';
  const senderImg = allyCaidImg(data.senderCaidId, data.senderCaid);
  const me = getMyCaid();
  const left = others.length
    ? allyAt('l', '44%', allyTag(senderImg, sender) + `<div class="flex gap-2 mt-1">${others.map(i => allyMini(allyCaidImg(i.caidId, i.caidName), allyShort(i.caidName))).join('')}</div><span class="ally-note">aussi invité${others.length > 1 ? 's' : ''}</span>`, '14px')
    : allyAt('l', '61%', allyTag(senderImg, sender), '22px');
  const stage = allyBubble('On s’associe ?', 'l', '4%') + left + allyAt('r', others.length ? '54%' : '61%', allyTag(me.imageFile, 'Toi'));
  const bottom = `<h2 class="font-anton ally-head">UN DEAL ?</h2>
    <div class="text-center text-sm font-bold text-slate-200 mt-1 mb-3"><span class="ally-ac">${escapeHtml(sender)}</span> te propose une alliance${n > 2 ? ` à ${n}` : ''}</div>
    ${allyPerks(n)}
    <div class="grid grid-cols-[1fr_1.6fr] gap-2 mt-4"><button type="button" class="ally-ghost" onclick="respondToAllianceRequest(false)">Refuser</button><button type="button" class="ally-cta" onclick="respondToAllianceRequest(true)">Accepter</button></div>`;
  return allyRender('recu', stage, bottom);
}

// SCELLÉ : montré une seule fois par alliance ; chez le proposant, quand tous les invités ont répondu
function showAllianceSealed(pact) {
  if (!pact) return;
  allyLastPact = pact;
  const iAmSender = pact.senderToken === myPlayerToken;
  if (iAmSender && allyOutgoing && !allyOutgoing.done) {
    allyHeldPact = pact;
    return;
  }
  if (allySeenPacts.has(pact.allianceId)) {
    if (allyState() === 'scelle') renderAllianceSealed(pact);
    return;
  }
  allySeenPacts.add(pact.allianceId);
  try { localStorage.setItem(allySeenKey, JSON.stringify([...allySeenPacts].slice(-20))); } catch (e) {}
  return renderAllianceSealed(pact);
}

function renderAllianceSealed(pact) {
  const members = pact.members || [];
  const allies = members.filter(m => m.token !== myPlayerToken);
  const n = Math.max(members.length, allies.length + 1);
  const me = getMyCaid();
  // Chez le proposant, les refus viennent du suivi des réponses (plus à jour)
  const iAmSender = pact.senderToken === myPlayerToken;
  const refused = iAmSender && allyOutgoing ? allyOutgoing.invitees.filter(i => i.status === 'no').map(i => i.caidName) : (pact.refused || []);
  const pending = iAmSender && allyOutgoing ? allyOutgoing.invitees.filter(i => i.status === 'wait').map(i => i.caidName) : (pact.pending || []);
  const right = allies.length === 1
    ? allyAt('r', '54%', allyTag(allyCaidImg(allies[0].caidId, allies[0].caidName), allies[0].caidName))
    : allyAt('r', '36%', allies.map(a => allyMini(allyCaidImg(a.caidId, a.caidName), a.caidName)).join(''), '12px');
  const stage = allyAt('l', allies.length === 1 ? '54%' : '50%', allyTag(me.imageFile, 'Toi')) + right
    + `<div class="ally-tape" style="top:80%">PACTE SCELLÉ${n > 2 ? ` À ${n}` : ''}</div>`;

  const pact2 = (nonAggressionPacts || []).find(p => p.allianceId && p.allianceId === pact.allianceId);
  const until = pact2 ? pact2.untilRound : (currentSession.round || 1) + 1;
  const extra = [];
  if (refused.length) extra.push(`${escapeHtml(allyListNames(refused))} ${refused.length > 1 ? 'ont' : 'a'} refusé`);
  if (pending.length) extra.push(`${escapeHtml(allyListNames(pending))} réfléchi${pending.length > 1 ? 'ssent' : 't'} encore`);
  const bottom = `${allies.length > 1 ? `<div class="text-center text-sm font-bold text-slate-200 mb-1">${escapeHtml(allyListNames(['Toi', ...allies.map(a => a.caidName)]))}</div>` : ''}
    <div class="text-center ${allies.length > 1 ? 'text-xs text-slate-400' : 'text-sm font-bold text-slate-200'} mb-3">Alliés jusqu’à la fin de la <span class="ally-ac">manche ${until}</span>${extra.map(t => ` · ${t}`).join('')}</div>
    ${allyPerks(n)}
    <button type="button" class="ally-cta mt-4" onclick="closeAllianceScreen()">On y va</button>`;
  return allyRender('scelle', stage, bottom);
}

// REFUS : personne n'a accepté
function showAllianceRefused(data) {
  const names = (data && data.refused) || [];
  const inv = allyOutgoing ? allyOutgoing.invitees.filter(i => i.status === 'no') : [];
  const who = inv.length ? inv : names.map(n => ({ caidName: n }));
  allyOutgoing = null;
  allyHeldPact = null;
  const me = getMyCaid();
  const right = who.length > 1
    ? allyAt('r', '30%', who.map(i => allyMini(allyCaidImg(i.caidId, i.caidName), i.caidName, 'no')).join(''), '12px')
    : allyAt('r', '61%', allyTag(allyCaidImg(who[0] && who[0].caidId, who[0] && who[0].caidName), (who[0] && who[0].caidName) || 'Le Caïd'));
  const stage = allyBubble('Sans moi.', 'r', '4%') + `<div class="ally-stamp" style="top:33%">REFUSÉ</div>` + allyAt('l', '61%', allyTag(me.imageFile, 'Toi')) + right;
  const bottom = `<h2 class="font-anton ally-head">PAS DE DEAL.</h2>
    <div class="text-center text-sm font-bold text-slate-200 mt-1 mb-4">Ton tour continue, seul.</div>
    <button type="button" class="ally-cta" onclick="closeAllianceScreen()">Tant pis</button>`;
  return allyRender('refus', stage, bottom);
}
