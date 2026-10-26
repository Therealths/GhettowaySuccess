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

async function openAllianceModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  syncMultiplayerTargets();
  document.getElementById('modalAlliance').classList.remove('hidden');
}

async function confirmAlliance() {
  if (!isMyTurnToPlay) return;
  const sel = document.getElementById('allianceTargetSelect');
  const target = connectedRivals.find(r => r.playerToken === sel.value || r.socketId === sel.value);
  if (!target) return showAppAlert("Choisissez un Caïd.", "Alliance");
  const caid = getMyCaid();
  if (socket) socket.emit('propose_alliance', { targetSocketId: target.socketId, targetPlayerToken: target.playerToken, senderName: caid.name, musclesCount: localPlayer.musclesOnPerson.length });
  closeModal('modalAlliance');
  await showAppAlert(`Demande envoyée à ${target.caidName || 'votre rival'}.`, "Alliance");
}
