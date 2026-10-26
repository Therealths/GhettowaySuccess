// Création de partie, sélection des caïds, manches et fin de tour

async function checkHospitalStatus() {
  if (localPlayer.hearts <= 0) {
    await showAppAlert("Vous n'avez plus aucun Cœur de Vie !\nVotre Caïd est évacué d'urgence à l'Hôpital.", "🚑 Transfert Hôpital");
    localPlayer.hearts = 1;
  }
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

  const attackableRivals = (connectedRivals || []).filter(r => !isRivalProtectedByPact(r.playerToken));

  const combatOpts = !attackableRivals.length
    ? '<option value="">Aucune cible attaquable (ou Pacte actif)</option>'
    : attackableRivals.map(r => `<option value="${r.playerToken}">${r.caidName || r.name || 'Caïd Adverse'} (Lascars: ${r.musclesCount || 0} | Escort: ${r.hasProstituteInTransit ? 'Oui' : 'Non'} | Chien: ${r.hasStrayDog ? 'Oui' : 'Non'})</option>`).join('');

  const allOpts = (!connectedRivals || !connectedRivals.length)
    ? '<option value="">Aucun rival connecté</option>'
    : connectedRivals.map(r => `<option value="${r.playerToken}">${r.caidName || r.name || 'Caïd Adverse'} (Lascars: ${r.musclesCount || 0})</option>`).join('');

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

async function startRoundPhase1() {
  const ev = currentSession.currentRadioEvent || { title: "Descente massive", impact: "Police +2 cases", desc: "La police avance de +2 cases." };
  document.getElementById('radioRoundNumber').innerText = currentSession.round;
  document.getElementById('radioCardTitle').innerText = ev.title;
  document.getElementById('radioCardEffect').innerText = ev.desc;
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
  navTo('page-5');
}
function acknowledgeRadioCard() { navTo('page-6'); }

function endCurrentPlayerTurn() {
  if (!isMyTurnToPlay) return;
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
