// Création de partie, sélection des caïds, manches et fin de tour

// Hôpital : à 0 Cœur le Caïd est évacué (écran K.O.) et reste intouchable jusqu'au début de son prochain tour,
// où il est soigné (écran Remis sur pied) avant de jouer. inHospital garde la manche et le tour en cours au moment du K.O.
async function checkHospitalStatus(cause) {
  if (localPlayer.hearts > 0 || localPlayer.inHospital) return;
  localPlayer.inHospital = { round: currentSession.round || 1, turnToken: activeTurnPlayerToken || null };
  refreshHud();
  // K.O. pendant son tour (ou pendant sa participation au tour d'un allié) : le tour s'arrête là
  const endsTurn = isMyTurnToPlay;
  await showHospitalScreen('ko', cause, 0, endsTurn);
  if (endsTurn) endCurrentPlayerTurn(true);
}
async function checkHospitalRelease(round) {
  const h = localPlayer.inHospital;
  if (!h || checkHospitalRelease.busy) return;
  // Toujours le tour où il a été mis K.O. (page rechargée, mise à jour du tour) : ce n'est pas encore son « prochain » tour
  if (h.turnToken === myPlayerToken && h.round === (round || currentSession.round)) return;
  checkHospitalRelease.busy = true;
  // Début de manche : on laisse d'abord passer le Flash Radio
  while (document.getElementById('page-5').classList.contains('active')) await new Promise(r => setTimeout(r, 400));
  const before = localPlayer.hearts;
  localPlayer.hearts = Math.max(1, before);
  localPlayer.inHospital = null;
  refreshHud();
  await showHospitalScreen('soin', null, before);
  checkHospitalRelease.busy = false;
}
// Écran plein page de l'hôpital : 'ko' (évacuation) ou 'soin' (sortie, au début du tour suivant)
function showHospitalScreen(mode, cause, heartsBefore = 0, endsTurn = false) {
  const scr = document.getElementById('hospitalScreen');
  const caid = getMyCaid();
  const cta = document.getElementById('hospCta');
  const ko = mode === 'ko';
  const row = (icon, label, before, after, note) => `<div class="police-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>${before !== '' ? `<span class="bef">${before}</span><i class="ph-bold ph-arrow-right text-slate-500 text-xs"></i>` : ''}<span class="aft">${after}</span></div>`;
  const box = document.getElementById('hospRows');

  document.getElementById('hospRound').innerText = currentSession.round || 1;
  document.getElementById('hospCaidImg').src = caid.imageFile;
  document.getElementById('hospCaidName').innerText = caid.name;
  document.getElementById('hospCaidSub').innerText = ko ? 'évacué d’urgence' : 'sort de l’hôpital';
  document.getElementById('hospBadge').innerText = ko ? 'K.O.' : 'SOIGNÉ';
  document.getElementById('hospHeadline').innerHTML = ko ? 'T’ES<br>K.O.' : 'REMIS<br>SUR PIED.';
  document.querySelectorAll('#hospHearts i').forEach((h, i) => h.classList.toggle('on', i < localPlayer.hearts));
  box.innerHTML = ko
    ? (cause ? row('ph-warning', 'Cause', '', '', cause) : '') +
      row('ph-heart-break', 'Cœurs de vie', '', '0 / 3') +
      row('ph-shield-check', 'Intouchable', '', 'jusqu’à ton tour', 'Ni attaque ni pouvoir jusqu’à ton prochain tour ; pas d’alliance cette manche') +
      (endsTurn ? row('ph-hourglass-simple', 'Ton tour', 'en cours', 'terminé') : '')
    : row('ph-heart', 'Cœurs de vie', `${heartsBefore}`, `${localPlayer.hearts} / 3`) +
      row('ph-person-simple-walk', 'Ton tour', '', 'à toi de jouer');
  [...box.children].forEach((el, i) => el.style.animationDelay = `${0.15 + i * 0.1}s`);
  cta.innerText = ko ? 'Direction l’hôpital' : 'Retour dans la rue';
  scr.dataset.state = ko ? 'ko' : 'soin';
  scr.classList.remove('hidden', 'result', 'show');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  if (!ko) scr.classList.add('result');

  return new Promise(resolve => {
    cta.onclick = () => {
      scr.classList.add('hidden');
      scr.classList.remove('show', 'result');
      resolve();
    };
  });
}
function emitCreateGame() {
  const gName = document.getElementById('createGameName').value || 'Ghetto War';
  roomSelectionMode = selectedCaidMode;
  localPlayer.caidId = null;
  caidLocked = false;
  localStorage.removeItem('g2s_saved_caid_id');
  if (socket) {
    socket.emit('create_room', {
      gameName: gName,
      maxPlayers: selectedPlayerCount,
      selectionMode: selectedCaidMode,
      playerToken: myPlayerToken
    });
  } else {
    navTo('page-4');
  }
}
function emitStartGame() { if (socket) socket.emit('start_game'); }
function respondToAllianceRequest(accepted) {
  if (!pendingAllianceRequest) return closeAllianceScreen();
  if (accepted) {
    // On reste sur la scène : le pacte scellé arrive par-dessus en fondu
    document.querySelectorAll('#allyBottom button').forEach(btn => { btn.disabled = true; });
    const cta = document.querySelector('#allyBottom .ally-cta');
    if (cta) cta.innerText = 'Topé…';
    setTimeout(() => { if (allyState() === 'recu') closeAllianceScreen(); }, 6000);
  } else closeAllianceScreen();
  if (socket) socket.emit('respond_alliance', { requestId: pendingAllianceRequest.requestId, accepted, senderToken: pendingAllianceRequest.senderToken });
  pendingAllianceRequest = null;
}

function syncMultiplayerTargets() {
  const specialSel = document.getElementById('specialTargetSelect');

  // Caïd à l'hôpital : toujours listé, mais grisé et non sélectionnable
  const rivalName = r => r.caidName || r.name || 'Caïd Adverse';
  const rivalOpt = r => `<option value="${r.playerToken}">${rivalName(r)} (Lascars: ${r.musclesCount || 0} | Escort: ${r.hasProstituteInTransit ? 'Oui' : 'Non'} | Chien: ${r.hasStrayDog ? 'Oui' : 'Non'})</option>`;
  // Caïd absent (a quitté la partie) : grisé de la même façon
  const hospitalOpt = r => r.away
    ? `<option value="" disabled style="color:#64748b">💤 ${rivalName(r)} : absent</option>`
    : `<option value="" disabled style="color:#64748b">🏥 ${rivalName(r)} : à l’hôpital</option>`;
  const buildOpts = (rivals, inHospital, emptyLabel) => {
    const ok = rivals.filter(r => !inHospital(r)), out = rivals.filter(inHospital);
    return (ok.length ? ok.map(rivalOpt).join('') : `<option value="" selected>${emptyLabel}</option>`) + out.map(hospitalOpt).join('');
  };

  const combatOpts = buildOpts((connectedRivals || []).filter(r => !isRivalProtectedByPact(r.playerToken)), r => !!r.inHospital || !!r.away, 'Aucune cible attaquable (ou Pacte actif)');

  if (specialSel) specialSel.innerHTML = combatOpts;
  // Écrans d'alliance ou de combat ouverts sur le choix : la liste des Caïds suit
  if (typeof refreshAllianceChoice === 'function') refreshAllianceChoice();
  if (typeof refreshFightChoice === 'function') refreshFightChoice();
  if (typeof refreshPowerChoice === 'function') refreshPowerChoice();
}

// Écran de combat : ma stat en direct (attaque, cumulée avec mes alliés, ou défense) ; celle de l'adversaire reste secrète
function updateArenaLiveStats() {
  const stat = document.getElementById('fightMyStat');
  const lbl = document.getElementById('arenaAtkLabel');
  if (!stat || !currentDuelInfo) return;
  const myAtk = getTotalAtk();
  const allyExtra = currentDuelInfo.isAlliedAttack ? (currentDuelInfo.allyAtk || 0) : 0;
  if (currentDuelInfo.role === 'attacker') {
    const nbAllies = (currentDuelInfo.allies || []).length;
    if (lbl) lbl.innerText = allyExtra > 0 ? `Votre assaut (à ${nbAllies + 1})` : 'Ton attaque';
    stat.innerText = myAtk + allyExtra;
  } else {
    if (lbl) lbl.innerText = 'Ta défense';
    stat.innerText = getTotalDef();
  }
}
async function confirmLeaveGame() {
  // Partie test : on rend simplement la vraie identité du joueur
  if (typeof isTestPlayer !== 'undefined' && isTestPlayer) return leaveTestGame();
  const msg = activeTurnPlayerToken // partie lancée (le tour actif est connu)
    ? "Quitter la partie ?\n\nTon Caïd est gardé avec tout ce qu'il possède, mais ses tours seront passés tant que tu es absent.\nTu pourras reprendre la partie plus tard depuis « Rejoindre »."
    : "Quitter ce salon ?";
  if (await showAppConfirm(msg, "⚠️ Quitter la partie", "Quitter", "Rester")) leaveGameNow();
}
// Départ effectif (bouton Quitter, ou « Quitter aussi » après le départ d'un autre joueur)
function leaveGameNow() {
  if (typeof isTestPlayer !== 'undefined' && isTestPlayer) return leaveTestGame();
  localStorage.removeItem('g2s_room_id');
  localStorage.removeItem('g2s_saved_caid_id');
  if (!socket || !socket.connected) return window.location.reload();
  // On attend que le serveur ait bien enregistré le départ avant de recharger
  const reload = () => window.location.reload();
  socket.emit('leave_room', reload);
  setTimeout(reload, 1500);
}
function selectPlayerCount(count) {
  selectedPlayerCount = count;
  [2, 3, 4].forEach(c => {
    const btn = document.getElementById(`btnCount-${c}`);
    if (btn) btn.className = c === count ? "py-3 rounded-xl font-black font-mono text-xs border border-ghetto-gold bg-ghetto-gold/15 text-ghetto-gold" : "py-3 rounded-xl font-bold font-mono text-xs border border-white/10 glass-panel text-slate-400";
  });
}
function selectCaidMode(mode) {
  selectedCaidMode = mode;
  const bRand = document.getElementById('btnMode-random');
  const bMan = document.getElementById('btnMode-manual');
  const activeCls = "py-3 rounded-xl font-black font-mono text-xs border border-ghetto-gold bg-ghetto-gold/15 text-ghetto-gold flex items-center justify-center gap-1.5";
  const inactiveCls = "py-3 rounded-xl font-bold font-mono text-xs border border-white/10 glass-panel text-slate-400 flex items-center justify-center gap-1.5";
  if (bRand) bRand.className = mode === 'random' ? activeCls : inactiveCls;
  if (bMan) bMan.className = mode === 'manual' ? activeCls : inactiveCls;
}

function getAvailableCaids() {
  return CAID_ROSTER.filter(c => !takenCaidsInGame.includes(c.id));
}

function displayCaidPreviewDetails(caid, badgeLabel = "Aperçu") {
  if (!caid) return;
  document.getElementById('revealedName').innerText = caid.name;
  document.getElementById('revealedIdBadge').innerText = badgeLabel;
  document.getElementById('revealedBonusText').innerText = caid.bonus;
  document.getElementById('revealedMalusText').innerText = caid.malus;
  document.getElementById('revealedSkill').innerText = `${caid.skillName} : ${caid.skillDesc}`;
  document.getElementById('revealedCash').innerText = `Cash: ${caid.startCash.toLocaleString()} €`;
  document.getElementById('revealedDrug').innerText = `Drogue: ${caid.startDrug} kg`;
}

function initCarouselDOM() {
  if (caidLocked || isDrawingCarousel) return;
  const track = document.getElementById('carouselTrack');
  const btnSpin = document.getElementById('btnSpinWheel');
  const btnManual = document.getElementById('btnConfirmManualCaid');
  const btnProceed = document.getElementById('btnProceedLobby');
  const arrows = document.getElementById('manualCarouselArrows');
  const headerTitle = document.getElementById('caidSelectionHeaderTitle');

  if (btnProceed) btnProceed.classList.add('hidden');

  const available = getAvailableCaids();
  if (!available.length) return;

  if (roomSelectionMode === 'manual') {
    headerTitle.innerText = "Choisis ton Caïd";
    btnSpin.classList.add('hidden');
    btnManual.classList.remove('hidden');
    btnManual.disabled = false;
    arrows.classList.remove('hidden');

    carouselItems = available.slice();
    manualFocusIndex = Math.min(manualFocusIndex, carouselItems.length - 1);

    track.innerHTML = carouselItems.map((c, idx) => `
      <div onclick="focusManualCaid(${idx})" class="carousel-card flex flex-col justify-between p-3 select-none">
        <div class="relative w-full h-36 my-auto rounded-xl overflow-hidden bg-black/60 flex items-center justify-center border border-white/10">
          <img src="${c.imageFile}" alt="${c.name}" class="w-full h-full object-cover" onerror="this.style.display='none';">
        </div>
        <div class="text-center pb-1"><h4 class="text-xs font-black text-white uppercase truncate">${c.name}</h4><span class="text-[9px] text-slate-400 font-mono block truncate">${c.skillName}</span></div>
      </div>`).join('');

    bindManualCarouselSwipe();
    focusManualCaid(manualFocusIndex);
  } else {
    headerTitle.innerText = "Tirage au Sort du Caïd";
    btnSpin.classList.remove('hidden');
    btnSpin.disabled = false;
    btnManual.classList.add('hidden');
    arrows.classList.add('hidden');

    carouselItems = [];
    const repeat = Math.max(4, Math.ceil(16 / available.length));
    for (let i = 0; i < repeat; i++) carouselItems = carouselItems.concat(available);

    track.innerHTML = carouselItems.map(c => `
      <div class="carousel-card flex flex-col justify-between p-3 select-none">
        <div class="relative w-full h-36 my-auto rounded-xl overflow-hidden bg-black/60 flex items-center justify-center border border-white/10">
          <img src="${c.imageFile}" alt="${c.name}" class="w-full h-full object-cover" onerror="this.style.display='none';">
        </div>
        <div class="text-center pb-1"><h4 class="text-xs font-black text-white uppercase truncate">${c.name}</h4><span class="text-[9px] text-slate-400 font-mono block truncate">${c.skillName}</span></div>
      </div>`).join('');

    centerCarouselIndex(1, false, false, 0.35);
  }
}

function bindManualCarouselSwipe() {
  const wrapper = document.getElementById('carouselWrapper');
  if (!wrapper || wrapper.dataset.manualSwipe === '1') return;
  wrapper.dataset.manualSwipe = '1';
  let startX = 0;
  wrapper.addEventListener('touchstart', e => {
    if (roomSelectionMode !== 'manual' || caidLocked) return;
    if (e.touches && e.touches[0]) startX = e.touches[0].clientX;
  }, { passive: true });
  wrapper.addEventListener('touchend', e => {
    if (roomSelectionMode !== 'manual' || caidLocked) return;
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -30) stepManualCaid(1);
    else if (dx > 30) stepManualCaid(-1);
  }, { passive: true });
}

function stepManualCaid(delta) {
  if (roomSelectionMode !== 'manual' || caidLocked || !carouselItems.length) return;
  manualFocusIndex = (manualFocusIndex + delta + carouselItems.length) % carouselItems.length;
  focusManualCaid(manualFocusIndex);
}

function focusManualCaid(idx) {
  if (roomSelectionMode !== 'manual' || caidLocked || !carouselItems[idx]) return;
  manualFocusIndex = idx;
  centerCarouselIndex(idx, true, true, 0.45);
  displayCaidPreviewDetails(carouselItems[idx], "Disponible");
}

function confirmManualCaidChoice() {
  if (caidLocked || !carouselItems[manualFocusIndex]) return;
  const chosenCaid = carouselItems[manualFocusIndex];
  finalizeCaidSelection(chosenCaid);
}

function centerCarouselIndex(index, animate = true, applyActive = false, durationSec = 3.2) {
  const track = document.getElementById('carouselTrack');
  const wrapper = document.getElementById('carouselWrapper');
  if (!track || !wrapper) return;
  const targetOffset = (index * 206) - ((wrapper.offsetWidth || 380) / 2) + 95;
  track.style.transition = animate ? `transform ${durationSec}s cubic-bezier(0.12, 0.88, 0.18, 1)` : 'none';
  track.style.transform = `translateX(-${targetOffset}px)`;
  track.querySelectorAll('.carousel-card').forEach((c, idx) => {
    if (applyActive && idx === index) c.classList.add('is-active');
    else c.classList.remove('is-active');
  });
}

function startCarouselDraw() {
  if (isDrawingCarousel || caidLocked) return;
  if (!carouselItems.length) return;
  isDrawingCarousel = true;
  const btnSpin = document.getElementById('btnSpinWheel');
  if (btnSpin) btnSpin.disabled = true;
  document.querySelectorAll('.carousel-card').forEach(c => c.classList.remove('is-active'));

  const minIdx = Math.floor(carouselItems.length / 2);
  const maxIdx = carouselItems.length - 2;
  const finalIndex = Math.floor(Math.random() * (maxIdx - minIdx + 1)) + minIdx;
  const chosenCaid = carouselItems[finalIndex];

  centerCarouselIndex(finalIndex, true, false, 3.2);
  setTimeout(() => {
    isDrawingCarousel = false;
    const cardsAfter = document.querySelectorAll('.carousel-card');
    if (cardsAfter[finalIndex]) cardsAfter[finalIndex].classList.add('is-active');
    finalizeCaidSelection(chosenCaid);
  }, 3300);
}

function finalizeCaidSelection(chosenCaid) {
  if (!chosenCaid) return;
  applyCaidToLocalPlayer(chosenCaid);
  displayCaidPreviewDetails(chosenCaid, "Sélectionné");

  document.getElementById('btnSpinWheel').classList.add('hidden');
  document.getElementById('btnConfirmManualCaid').classList.add('hidden');
  document.getElementById('manualCarouselArrows').classList.add('hidden');
  document.getElementById('btnProceedLobby').classList.remove('hidden');

  if (socket) {
    socket.emit('assign_caid', {
      caidId: chosenCaid.id,
      caidName: chosenCaid.name,
      startCash: chosenCaid.startCash,
      startDrug: chosenCaid.startDrug,
      startHearts: chosenCaid.startHearts,
      unarmedAtk: chosenCaid.unarmedAtk,
      playerToken: myPlayerToken
    });
  }
}

// Page Flash Radio : message de l'animateur puis règle qui change (champs message/rule de radio_events.json)
const RADIO_TONES = {
  bonus: { color: '#34d399', chip: 'bg-emerald-400/15 text-emerald-400', label: 'Bonus' },
  malus: { color: '#fb7185', chip: 'bg-rose-500/15 text-rose-400', label: 'Malus' },
  plateau: { color: '#fbbf24', chip: 'bg-amber-400/15 text-amber-400', label: 'Plateau' }
};
function renderRadioCard(ev) {
  const rule = ev.rule || { big: '', tone: 'plateau', label: ev.impact || ev.title, sub: ev.desc, rows: [] };
  const tone = RADIO_TONES[rule.tone] || RADIO_TONES.plateau;
  document.getElementById('radioRoundNumber').innerText = currentSession.round;
  document.getElementById('radioCardTitle').innerText = ev.title;
  // Le message sort du poste mot par mot, puis la règle arrive juste après le dernier mot
  const words = `« ${ev.message || ev.desc} »`.split(' ');
  document.getElementById('radioCardMessage').innerHTML = words
    .map((w, i) => `<span class="radio-word" style="animation-delay:${(0.95 + i * 0.055).toFixed(3)}s">${escapeHtml(w)} </span>`).join('');
  document.getElementById('page-5').style.setProperty('--radio-rule-delay', `${(0.95 + words.length * 0.055 + 0.15).toFixed(2)}s`);
  const big = document.getElementById('radioRuleBig');
  big.innerText = rule.big;
  big.style.color = tone.color;
  big.style.fontSize = rule.big.length <= 4 ? '50px' : (rule.big.length <= 8 ? '42px' : '34px');
  big.classList.toggle('hidden', !rule.big);
  document.getElementById('radioRuleLabel').innerText = rule.label;
  document.getElementById('radioRuleSub').innerText = rule.sub || '';
  document.getElementById('radioRuleRows').innerHTML = (rule.rows || []).map(([icon, label, before, after]) => `
    <div class="radio-row">
      <span class="flex items-center gap-1.5 min-w-0"><i class="ph-bold ${icon} text-base flex-shrink-0"></i><span>${escapeHtml(label)}</span></span>
      <span class="flex items-center gap-1.5 flex-shrink-0">${before ? `<span class="text-slate-500 line-through">${escapeHtml(before)}</span><i class="ph-bold ph-arrow-right text-slate-500"></i>` : ''}<b style="color:${tone.color}">${escapeHtml(after)}</b></span>
    </div>`).join('');
  const chip = document.getElementById('radioRuleTone');
  chip.className = `radio-chip ${tone.chip}`;
  chip.innerText = tone.label;
}

async function startRoundPhase1() {
  const ev = currentSession.currentRadioEvent || { title: "Descente massive", impact: "Police +2 cases", desc: "La police avance de +2 cases." };
  renderRadioCard(ev);
  document.getElementById('hudRadioRoundTag').innerText = currentSession.round;
  document.getElementById('hudRadioReminderTitle').innerText = ev.title;
  document.getElementById('hudRadioReminderDesc').innerText = ev.impact || ev.desc;

  if (localPlayer.prostitutesAtSafeList.length > 0) {
    const revMult = isRadioEffectActive('PROSTITUTE_REV_MULT') ? getRadioEffectValue('PROSTITUTE_REV_MULT', 2) : 1;
    const baseIncome = localPlayer.prostitutesAtSafeList.reduce((acc, p) => acc + (p.revenue || (p.level === 2 ? 2500 : 1000)), 0);
    // Seringue de botox : prise toute seule dans le Sac, double cette rente une fois
    const botoxIdx = localPlayer.inventory.findIndex(it => it && it.eff === 'botox');
    if (botoxIdx >= 0) localPlayer.inventory.splice(botoxIdx, 1);
    const income = baseIncome * revMult * (botoxIdx >= 0 ? 2 : 1);
    localPlayer.safeCash += income;
    const vipNote = revMult > 1 ? ` (Soirée VIP x${revMult} !)` : '';
    const botoxNote = botoxIdx >= 0 ? `\n\n💉 Seringue de botox : rente doublée !` : '';
    await showAppAlert(`+${income.toLocaleString()} € versés au coffre par tes prostituées${vipNote}.${botoxNote}`, "💰 Rente QG perçue");
  }
  refreshHud(); // les PM dépendent de la manche (radio, malus Burger Queen)
  navTo('page-5');
}
function acknowledgeRadioCard() { navTo('page-6'); }

async function endCurrentPlayerTurn(forced = false) {
  if (!isMyTurnToPlay) return;
  const isAllyHelping = activeTurnPlayerToken && activeTurnPlayerToken !== myPlayerToken;
  // Bouton "Tour terminé" : on demande confirmation (la garde à vue, elle, met fin au tour d'office)
  if (!forced && !await showAppConfirm(
    isAllyHelping ? "Terminer ta participation à ce tour ?\nTu ne pourras plus agir avant la manche suivante." : "Terminer ton tour ?\nLa main passera au joueur suivant.",
    "⏭️ Fin de tour"
  )) return;
  // Allié qui joue pendant le tour d'un autre : il termine sa participation, le joueur actif garde la main (et lance le dé de patrouille)
  if (isAllyHelping) {
    if (socket) socket.emit('end_allied_turn');
    showAppAlert("Ta participation à ce tour est terminée.\nTu rejoueras à la manche suivante.", "🤝 Fin de ton tour");
    return;
  }
  showPatrolScreen();
}

// Patrouille de fin de tour : le dé roule, puis on indique de combien de cases et dans quel sens avancer le pion
const PATROL_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function setPatrolDie(n) {
  document.querySelectorAll('#patrolDie i').forEach((pip, i) => pip.classList.toggle('on', (PATROL_PIPS[n] || []).includes(i)));
}
// Prochain joueur de la manche (celui qui n'a pas encore joué et n'est pas allié ce tour)
function nextPlayerLabel() {
  const order = lastTurnOrder || [];
  const i = order.findIndex(p => p.token === activeTurnPlayerToken);
  const next = order.slice(i + 1).find(p => !p.played && !p.away && !(lastAlliedTokens || []).includes(p.token));
  return next ? `Passer la main à ${next.token === myPlayerToken ? 'toi' : next.caidName}` : 'Passer à la manche suivante';
}
function showPatrolScreen() {
  const scr = document.getElementById('patrolScreen');
  const cta = document.getElementById('patrolCta');
  const info = document.getElementById('patrolInfo');
  const dirBox = document.getElementById('patrolDirection');
  const greve = isRadioEffectActive('PATROL_FREEZE');
  const radioExtra = isRadioEffectActive('PATROL_DICE_BONUS') ? getRadioEffectValue('PATROL_DICE_BONUS', 2) : 0;
  let baseRoll, finalMove, left, rigged = false;
  const talkieFx = document.getElementById('patrolTalkie');
  talkieFx.classList.add('hidden');
  scr.classList.remove('talkie', 'tk-bubble', 'tk-card');

  document.getElementById('patrolRound').innerText = currentSession.round || 1;
  document.getElementById('patrolHeadline').innerHTML = 'LA PATROUILLE<br>TOURNE…';
  info.innerHTML = '<div class="text-xs font-black uppercase tracking-widest text-sky-300">Le dé roule…</div><div class="patrol-big text-slate-500">?</div>';
  cta.innerText = nextPlayerLabel();
  cta.disabled = true;
  scr.dataset.state = 'roule';
  scr.classList.remove('hidden', 'show', 'result');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');

  // Bloc direction toujours présent, panneau de hauteur fixe : la voiture ne bouge pas quand le résultat arrive
  const dirHtml = (label, labelCls, note) => `<div class="mt-4 flex items-center justify-between"><span class="text-[10px] font-black uppercase tracking-widest text-sky-300">Direction</span><span class="patrol-dir ${labelCls}">${label}</span></div>
      <div class="patrol-note text-xs text-slate-300 mt-2">${note}</div>`;
  dirBox.innerHTML = dirHtml('…', 'text-slate-500', 'Le dé décide de combien de cases et dans quel sens avance la patrouille.');

  const land = () => {
    cta.disabled = false;
    scr.classList.add('result');
    if (greve) {
      scr.dataset.state = 'greve';
      setPatrolDie(0);
      document.getElementById('patrolHeadline').innerHTML = 'GRÈVE AU<br>COMMISSARIAT.';
      info.innerHTML = '<div class="text-[10px] font-black uppercase tracking-widest text-amber-300">Flash Radio</div><div class="patrol-big">0 <span>case</span></div>';
      dirBox.innerHTML = dirHtml('SUR PLACE', 'text-amber-300', 'Grève au commissariat : la patrouille ne bouge pas ce tour.');
      return;
    }
    scr.dataset.state = 'resultat';
    setPatrolDie(baseRoll);
    document.getElementById('patrolHeadline').innerHTML = 'LA PATROUILLE<br>BOUGE.';
    info.innerHTML = `<div class="text-[10px] font-black uppercase tracking-widest text-sky-300">Déplacement</div><div class="patrol-big">${finalMove} <span>case${finalMove > 1 ? 's' : ''}</span></div>`
      + (radioExtra > 0 ? `<div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 mt-1">Dé ${baseRoll} <span class="patrol-radio">+${radioExtra} Radio</span></div>` : '');
    dirBox.innerHTML = dirHtml(left ? '⬅ GAUCHE' : 'DROITE ➡', '', `Avance le pion de la patrouille de ${finalMove} case${finalMove > 1 ? 's' : ''} vers la ${left ? 'gauche' : 'droite'} sur le plateau.`);
  };

  // Le dé change de face quelques fois avant de tomber
  // (Talkie-walkie de flic : un joueur a peut-être choisi à l'avance le dé et la direction, en secret)
  const roll = rig => {
    rigged = !!rig;
    baseRoll = rig ? rig.roll : Math.floor(Math.random() * 6) + 1;
    finalMove = baseRoll + radioExtra;
    left = rig ? !!rig.left : Math.random() < 0.5;
    // Talkie-walkie : pendant que le dé roule, la bulle « message au talkie » arrive, puis la carte tamponnée (choc) ;
    // le dé ne tombe qu'après, sur le résultat commandé
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    talkieFx.classList.toggle('hidden', !rigged);
    scr.classList.toggle('talkie', rigged);
    if (rigged) {
      setTimeout(() => scr.classList.add('tk-bubble'), reduce ? 0 : 1000);
      setTimeout(() => scr.classList.add('tk-card'), reduce ? 0 : 2300);
    }
    if (reduce) return land();
    const t0 = Date.now(), hold = rigged ? 3700 : 0;
    let k = 0;
    const tick = () => {
      const t = Date.now() - t0;
      if (k >= 10 && t >= hold) return land();
      setPatrolDie(1 + Math.floor(Math.random() * 6));
      k++;
      // Le dé roule vite tant qu'on attend le talkie, puis ralentit avant de tomber
      setTimeout(tick, t < hold - 700 ? 90 : 70 + Math.min(k, 10) * 12);
    };
    setTimeout(tick, 300);
  };
  if (!socket) return roll(null);
  let asked = false;
  const go = rig => { if (!asked) { asked = true; roll(rig); } };
  socket.emit('take_patrol_rig', go);
  setTimeout(() => go(null), 1500);
}

function skipPatrolWait() {
  const scr = document.getElementById('patrolScreen');
  scr.classList.add('hidden');
  scr.classList.remove('show', 'result');
  if (socket) socket.emit('next_player_turn');
}

// --- ORDRE DE PASSAGE & ALERTE DE TOUR ---
let lastTurnOrder = [], lastAlliedTokens = [];
function renderTurnOrder(turnOrder, activeToken, alliedTokens = []) {
  lastTurnOrder = turnOrder || [];
  lastAlliedTokens = alliedTokens || [];
  const html = (turnOrder || []).map(p => {
    const isMe = p.token === myPlayerToken;
    const isActive = p.token === activeToken;
    const isAllied = !isActive && alliedTokens.includes(p.token);
    let cls = 'bg-white/5 border-white/10 text-slate-300';
    let icon = '';
    if (isActive) { cls = 'bg-amber-400/20 border-amber-400 text-amber-300'; icon = '▶ '; }
    else if (isAllied) { cls = 'bg-purple-500/20 border-purple-400 text-purple-300'; icon = '🤝 '; }
    else if (p.played) { cls = 'bg-white/5 border-white/5 text-slate-500 line-through'; icon = '✓ '; }
    else if (p.away) cls = 'bg-white/5 border-white/5 text-slate-500';
    const name = escapeHtml(p.caidName || 'Caïd');
    const dog = p.hasStrayDog ? ' 🐕' : '';
    const away = p.away ? ' 💤' : ''; // a quitté la partie : ses tours sont passés
    return `<span class="px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold whitespace-nowrap ${cls}">${icon}${name}${isMe ? ' (toi)' : ''}${dog}${away}</span>`;
  }).join('');
  document.querySelectorAll('.turn-order-list').forEach(el => { el.innerHTML = html; });
}

function notifyMyTurn(round) {
  document.getElementById('yourTurnToastRound').innerText = round || currentSession.round;
  const toast = document.getElementById('yourTurnToast');
  toast.classList.remove('hidden');
  clearTimeout(notifyMyTurn.timer);
  notifyMyTurn.timer = setTimeout(() => toast.classList.add('hidden'), 3000);
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    const ctx = notifyMyTurn.ctx || (notifyMyTurn.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.16);
    });
  } catch (e) {}
}

function escapeHtml(t) { return String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }
// Fin de partie (annoncée par le serveur quand un Caïd atteint 100 000 €) : écran du gagnant ou d'un perdant,
// podium, titres de la partie
function showGameOver({ winnerToken, round, standings }) {
  document.querySelectorAll('[id^="modal"]').forEach(m => m.classList.add('hidden'));
  const caidOf = id => CAID_ROSTER.find(c => c.id === id) || {};
  const euros = n => `${n.toLocaleString('fr-FR')} €`;
  const winner = standings.find(p => p.playerToken === winnerToken) || standings[0];
  const win = winner.playerToken === myPlayerToken;
  const wc = caidOf(winner.caidId);
  const myRank = standings.findIndex(p => p.playerToken === myPlayerToken) + 1;
  const nbRounds = round || 1;

  const confetti = win ? Array.from({ length: 26 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;background:${['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#fff'][i % 5]};--d:${3 + (i % 5) * 0.6}s;--dl:${-((i * 0.73) % 4)}s"></i>`).join('') : '';
  const name = p => `${escapeHtml(p.caidName)}${p.playerToken === myPlayerToken ? ' <em>(toi)</em>' : ''}`;
  // Podium : 2e à gauche, 1er au centre, 3e à droite
  const step = (i, h) => {
    const p = standings[i];
    if (!p) return '';
    const c = caidOf(p.caidId);
    return `<div class="end-step" style="--c:${c.hex || '#64748b'}"><img src="${c.imageFile || ''}" alt=""><div class="n">${name(p)}</div><div class="f">${euros(p.fortune)}</div><div class="end-block" style="height:${h}px">${i + 1}</div></div>`;
  };
  const rest = standings.slice(3).map((p, i) =>
    `<div class="end-rest ${p.playerToken === myPlayerToken ? 'me' : ''}"><span>${i + 4}</span><img src="${caidOf(p.caidId).imageFile || ''}" alt="">${name(p)}<span class="f">${euros(p.fortune)}</span></div>`).join('');
  const titles = [
    ['👊 Bagarreur', 'combatWins', n => `${n} combat${n > 1 ? 's' : ''} gagné${n > 1 ? 's' : ''}`],
    ['🤕 Amoché', 'combatLosses', n => `${n} défaite${n > 1 ? 's' : ''}`],
    ['🚔 Abonné GAV', 'arrests', n => `${n} garde${n > 1 ? 's' : ''} à vue`],
    ['🌿 Baron', 'drugs', n => `${n} kg en stock`]
  ].map(([label, key, fmt]) => {
    const best = standings.reduce((a, b) => (b[key] > a[key] ? b : a));
    if (!best[key]) return '';
    return `<div class="end-t"><img src="${caidOf(best.caidId).imageFile || ''}" alt=""><div><b>${label}</b><span>${fmt(best[key])}</span></div></div>`;
  }).join('');

  const scr = document.getElementById('page-end');
  scr.classList.toggle('lose', !win);
  scr.innerHTML = `
    <div class="end-banner"><img src="${wc.bannerFile || ''}" alt=""></div>
    ${win ? '<div class="end-rays"></div>' : ''}<div class="end-confetti">${confetti}</div>
    <div class="end-top"><span>Manche ${nbRounds}</span><span class="end-chip">${win ? '🏆 Victoire' : 'Fin de partie'}</span></div>
    <div class="end-col">
      <div class="end-hero">
        <div class="end-av"><span class="end-crown">👑</span><img src="${wc.imageFile || ''}" alt=""></div>
        <div class="end-tag">${win ? 'La ville est à toi' : `${escapeHtml(winner.caidName)} règne sur la ville`}</div>
        <h2 class="font-anton end-title">${win ? 'ROI DE LA VILLE !' : 'C’EST PERDU.'}</h2>
        <div class="end-cash" id="endCash">${euros(winner.fortune)}</div>
        <div class="end-sub">${win ? `amassés en ${nbRounds} manche${nbRounds > 1 ? 's' : ''}` : `amassés par ${escapeHtml(winner.caidName)}`}</div>
      </div>
      <div class="end-podium">${step(1, 44)}${step(0, 66)}${step(2, 28)}</div>
      ${rest}
      <div class="end-bottom">
        ${win || !myRank ? '' : `<div class="end-rank">Tu finis <b>${myRank}e</b> sur ${standings.length}</div>`}
        ${titles ? `<div class="end-titles">${titles}</div>` : ''}
        <button type="button" class="ally-cta end-cta" onclick="leaveFinishedGame()">Retour à l'accueil</button>
      </div>
    </div>`;
  navTo('page-end');
  countUpEndCash(winner.fortune, euros);
  if (win && navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 300]);
}
// La fortune du gagnant défile jusqu'à son montant
function countUpEndCash(total, euros) {
  const el = document.getElementById('endCash');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now() + 500, dur = 1200;
  const tick = now => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    el.innerText = euros(Math.round(total * (1 - Math.pow(1 - k, 3)) / 50) * 50);
    if (k < 1) requestAnimationFrame(tick); else el.innerText = euros(total);
  };
  requestAnimationFrame(tick);
}
function leaveFinishedGame() {
  localStorage.removeItem('g2s_room_id');
  localStorage.removeItem('g2s_saved_caid_id');
  if (socket) socket.emit('leave_room');
  window.location.reload();
}
