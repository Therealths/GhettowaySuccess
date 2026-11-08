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
      row('ph-shield-check', 'Intouchable', '', 'jusqu’à ton tour', 'Ni attaque, ni pouvoir, ni alliance cette manche') +
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
  document.getElementById('modalAllianceRequestReceived').classList.add('hidden');
  if (!pendingAllianceRequest) return;
  if (socket) socket.emit('respond_alliance', { accepted, senderSocketId: pendingAllianceRequest.senderSocketId, senderToken: pendingAllianceRequest.senderToken });
  pendingAllianceRequest = null;
}

function syncMultiplayerTargets() {
  const combatSel = document.getElementById('combatTargetSelect');
  const allySel = document.getElementById('allianceTargetSelect');
  const specialSel = document.getElementById('specialTargetSelect');

  const attackableRivals = (connectedRivals || []).filter(r => !isRivalProtectedByPact(r.playerToken) && !r.inHospital);

  const combatOpts = !attackableRivals.length
    ? '<option value="">Aucune cible attaquable (Pacte actif ou à l’hôpital)</option>'
    : attackableRivals.map(r => `<option value="${r.playerToken}">${r.caidName || r.name || 'Caïd Adverse'} (Lascars: ${r.musclesCount || 0} | Escort: ${r.hasProstituteInTransit ? 'Oui' : 'Non'} | Chien: ${r.hasStrayDog ? 'Oui' : 'Non'})</option>`).join('');

  const allyRivals = (connectedRivals || []).filter(r => !(r.inHospital && r.inHospital.round === (currentSession.round || 1)));
  const allOpts = !allyRivals.length
    ? '<option value="">Aucun allié possible (ou Caïd à l’hôpital)</option>'
    : allyRivals.map(r => `<option value="${r.playerToken}">${r.caidName || r.name || 'Caïd Adverse'} (Lascars: ${r.musclesCount || 0} | Escort: ${r.hasProstituteInTransit ? 'Oui' : 'Non'} | Chien: ${r.hasStrayDog ? 'Oui' : 'Non'})</option>`).join('');

  if (combatSel) combatSel.innerHTML = combatOpts;
  if (specialSel) specialSel.innerHTML = combatOpts;
  if (allySel) allySel.innerHTML = allOpts;
  updateSelectedRivalDetailsCard();
}

function updateSelectedRivalDetailsCard() {
  const sel = document.getElementById('combatTargetSelect');
  if (!sel) return;
  const target = connectedRivals.find(r => r.playerToken === sel.value || r.socketId === sel.value);
  document.getElementById('targetPreviewLascars').innerText = target ? (target.musclesCount || 0) : '0';
  document.getElementById('targetPreviewEscort').innerText = (target && target.hasProstituteInTransit) ? 'Oui' : 'Non';
  document.getElementById('targetPreviewDog').innerText = (target && target.hasStrayDog) ? 'Oui' : 'Non';
}

function updateArenaLiveStats() {
  const a = document.getElementById('arenaPlayerLiveAtk');
  const d = document.getElementById('arenaPlayerLiveDef');
  const atkLbl = document.getElementById('arenaAtkLabel');
  const myAtk = getTotalAtk();
  const allyExtra = (currentDuelInfo && currentDuelInfo.isAlliedAttack) ? (currentDuelInfo.allyAtk || 0) : 0;
  if (atkLbl) {
    atkLbl.innerText = allyExtra > 0 ? `Assaut Cumulé (Vous + Allié)` : `Votre Assaut`;
  }
  if (a) a.innerText = myAtk + allyExtra;
  if (d) d.innerText = getTotalDef();
}
async function confirmLeaveGame() {
  if (await showAppConfirm("Voulez-vous quitter définitivement cette partie ?", "Quitter")) {
    localStorage.removeItem('g2s_room_id');
    localStorage.removeItem('g2s_saved_caid_id');
    if (socket) socket.emit('leave_room');
    window.location.reload();
  }
}
function switchMainCaidTab(tabKey) {
  const pInter = document.getElementById('panelInteractions');
  const pEquip = document.getElementById('panelEquipment');
  const pInven = document.getElementById('panelInventory');
  const bInter = document.getElementById('mainTabInteractions');
  const bEquip = document.getElementById('mainTabEquipment');
  const bInven = document.getElementById('mainTabInventory');
  const tabsContainer = document.getElementById('mainTabsContentContainer');
  pInter.classList.add('hidden'); pEquip.classList.add('hidden'); pInven.classList.add('hidden');
  const inact = "flex-1 py-2 px-2 rounded-t-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5 text-slate-400 bg-white/5 border border-white/10";
  bInter.className = inact; bEquip.className = inact; bInven.className = inact;
  if (tabKey === 'interactions') {
    pInter.classList.remove('hidden');
    bInter.className = "flex-1 py-2.5 px-2 rounded-t-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 text-amber-300 bg-[#141622] border-t-2 border-amber-400";
    tabsContainer.style.borderTopColor = "rgba(250, 204, 21, 0.7)";
  } else if (tabKey === 'equipment') {
    pEquip.classList.remove('hidden');
    bEquip.className = "flex-1 py-2.5 px-2 rounded-t-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 text-rose-300 bg-[#141622] border-t-2 border-rose-500";
    tabsContainer.style.borderTopColor = "rgba(244, 63, 94, 0.7)";
    renderEquipmentSlotsView();
  } else {
    pInven.classList.remove('hidden');
    bInven.className = "flex-1 py-2.5 px-2 rounded-t-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 text-emerald-300 bg-[#141622] border-t-2 border-emerald-500";
    tabsContainer.style.borderTopColor = "rgba(16, 185, 129, 0.7)";
    renderInventoryList();
  }
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
    headerTitle.innerText = "Choisissez votre Caïd";
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
    const income = baseIncome * revMult;
    localPlayer.safeCash += income;
    const vipNote = revMult > 1 ? ` (Soirée VIP x${revMult} !)` : '';
    await showAppAlert(`+${income.toLocaleString()} € versés au coffre par vos prostituées${vipNote}.`, "💰 Rente QG perçue");
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
    isAllyHelping ? "Terminer votre participation à ce tour ?\nVous ne pourrez plus agir avant la manche suivante." : "Terminer votre tour ?\nLa main passera au joueur suivant.",
    "⏭️ Fin de tour"
  )) return;
  // Allié qui joue pendant le tour d'un autre : il termine sa participation, le joueur actif garde la main (et lance le dé de patrouille)
  if (isAllyHelping) {
    if (socket) socket.emit('end_allied_turn');
    showAppAlert("Votre participation à ce tour est terminée.\nVous rejouerez à la manche suivante.", "🤝 Fin de votre tour");
    return;
  }
  document.getElementById('modalPatrolDice').classList.remove('hidden');
  document.getElementById('patrolDiceVisual').innerText = '?';
  document.getElementById('patrolDiceMoveLabel').innerText = 'Le dé roule...';
  document.getElementById('patrolDiceDirectionLabel').innerText = '';

  setTimeout(() => {
    if (isRadioEffectActive('PATROL_FREEZE')) {
      document.getElementById('patrolDiceVisual').innerText = '0';
      document.getElementById('patrolDiceMoveLabel').innerText = 'Grève au Commissariat : 0 case !';
      document.getElementById('patrolDiceDirectionLabel').innerText = '🚔 Patrouille immobile ce tour';
      return;
    }

    const baseRoll = Math.floor(Math.random() * 6) + 1;
    const radioExtra = isRadioEffectActive('PATROL_DICE_BONUS') ? getRadioEffectValue('PATROL_DICE_BONUS', 2) : 0;
    const finalMove = baseRoll + radioExtra;
    const dir = Math.random() < 0.5 ? '⬅️ GAUCHE' : 'DROITE ➡️';

    document.getElementById('patrolDiceVisual').innerText = finalMove;
    document.getElementById('patrolDiceMoveLabel').innerText = radioExtra > 0
      ? `Déplacement : ${finalMove} cases (Dé ${baseRoll} + ${radioExtra} Radio)`
      : `Déplacement : ${finalMove} case(s)`;
    document.getElementById('patrolDiceDirectionLabel').innerText = `Direction : ${dir}`;
  }, 600);
}

function skipPatrolWait() {
  closeModal('modalPatrolDice');
  if (socket) socket.emit('next_player_turn');
}

// --- ORDRE DE PASSAGE & ALERTE DE TOUR ---
function renderTurnOrder(turnOrder, activeToken, alliedTokens = []) {
  const html = (turnOrder || []).map(p => {
    const isMe = p.token === myPlayerToken;
    const isActive = p.token === activeToken;
    const isAllied = !isActive && alliedTokens.includes(p.token);
    let cls = 'bg-white/5 border-white/10 text-slate-300';
    let icon = '';
    if (isActive) { cls = 'bg-amber-400/20 border-amber-400 text-amber-300'; icon = '▶ '; }
    else if (isAllied) { cls = 'bg-purple-500/20 border-purple-400 text-purple-300'; icon = '🤝 '; }
    else if (p.played) { cls = 'bg-white/5 border-white/5 text-slate-500 line-through'; icon = '✓ '; }
    const name = p.caidName || 'Caïd';
    const dog = p.hasStrayDog ? ' 🐕' : '';
    return `<span class="px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold whitespace-nowrap ${cls}">${icon}${name}${isMe ? ' (vous)' : ''}${dog}</span>`;
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
// Fin de partie (annoncée par le serveur quand un Caïd atteint 100 000 €) : podium et titres
function showGameOver({ winnerToken, round, standings }) {
  document.querySelectorAll('[id^="modal"]').forEach(m => m.classList.add('hidden'));
  const imgOf = id => (CAID_ROSTER.find(c => c.id === id) || {}).imageFile || '';
  const euros = n => `${n.toLocaleString('fr-FR')} €`;
  const winner = standings.find(p => p.playerToken === winnerToken) || standings[0];
  document.getElementById('endRound').innerText = `Manche ${round || 1}`;
  document.getElementById('endWinnerName').innerText = winner.caidName;
  document.getElementById('endWinnerCash').innerText = euros(winner.fortune);
  document.getElementById('endWinnerImg').src = imgOf(winner.caidId);
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('endStandings').innerHTML = standings.map((p, i) => `
    <div class="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3 ${p.playerToken === myPlayerToken ? 'border-amber-400/60' : ''}">
      <span class="text-lg w-6 text-center">${medals[i] || i + 1}</span>
      <img src="${imgOf(p.caidId)}" alt="" class="w-9 h-9 rounded-xl object-cover">
      <span class="flex-1 text-sm font-bold text-white truncate">${escapeHtml(p.caidName)}</span>
      <span class="text-xs font-mono font-black text-ghetto-gold">${euros(p.fortune)}</span>
    </div>`).join('');
  const titles = [
    ['👊', 'Le plus bagarreur', 'combatWins', n => `${n} combat${n > 1 ? 's' : ''} gagné${n > 1 ? 's' : ''}`],
    ['🤕', 'Le plus amoché', 'combatLosses', n => `${n} défaite${n > 1 ? 's' : ''}`],
    ['🚔', 'Le plus arrêté', 'arrests', n => `${n} garde${n > 1 ? 's' : ''} à vue`],
    ['🌿', 'Le baron de la drogue', 'drugs', n => `${n} kg en stock`]
  ].map(([icon, label, key, fmt]) => {
    const best = standings.reduce((a, b) => (b[key] > a[key] ? b : a));
    if (!best[key]) return '';
    return `<div class="glass-panel rounded-2xl p-2.5">
      <span class="text-[10px] font-black uppercase text-amber-300 block">${icon} ${label}</span>
      <span class="text-xs font-bold text-white block truncate">${escapeHtml(best.caidName)}</span>
      <span class="text-[10px] font-mono text-slate-400">${fmt(best[key])}</span>
    </div>`;
  }).join('');
  document.getElementById('endTitles').innerHTML = titles;
  navTo('page-end');
  if (winnerToken === myPlayerToken && navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 300]);
}
function leaveFinishedGame() {
  localStorage.removeItem('g2s_room_id');
  localStorage.removeItem('g2s_saved_caid_id');
  if (socket) socket.emit('leave_room');
  window.location.reload();
}
