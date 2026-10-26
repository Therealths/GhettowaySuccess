// Stats du joueur, capacités, police, inventaire, HUD, transferts coffre

// Lascars donnent Attaque ET Défense
function getTotalAtk() {
  let atk = localPlayer.baseAtk - (localPlayer.tempAtkMalus || 0);
  if (localPlayer.equipped.weapon && !myWeaponNullified) atk += (localPlayer.equipped.weapon.bonusVal * (combatModifiers.doubleWeapon ? 2 : 1));
  const multM = combatModifiers.doubleMuscles ? 2 : 1;
  const radioLascarBonus = isRadioEffectActive('LASCAR_ATK_BONUS') ? getRadioEffectValue('LASCAR_ATK_BONUS', 1) : 0;
  localPlayer.musclesOnPerson.forEach(m => {
    atk += (((m.bonusVal || 1) + radioLascarBonus) * multM);
  });
  if (localPlayer.strayDogActive) atk += 2;
  atk += combatModifiers.flatAtkBonus;
  return Math.max(0, atk);
}

function getTotalDef() {
  let def = localPlayer.baseDef - (localPlayer.tempDefMalus || 0);
  if (localPlayer.equipped.armor) def += localPlayer.equipped.armor.bonusVal;
  const multM = combatModifiers.doubleMuscles ? 2 : 1;
  localPlayer.musclesOnPerson.forEach(m => {
    def += ((m.bonusVal || 1) * multM);
  });
  if (localPlayer.strayDogActive) def += 2;
  return Math.max(0, def);
}

// Une action (attaque, Yencli, braquage, achat, objet ramassé) coûte 2 PM : simple décompte affiché, rien n'est bloqué
function spendActionPm() {
  pmSpentThisTurn += 2;
  refreshHud();
}

function getTotalPm() {
  // Malus Burger Queen : démarrage poussif, 0 PM pendant la manche 1
  if (localPlayer.caidId === 'caid_1' && currentSession.round === 1) return 0;
  const eqVeh = localPlayer.equipped.vehicle;
  let pm = 8 + (eqVeh ? eqVeh.bonusVal : 0);
  if (eqVeh) {
    const isMotor = eqVeh.isMotorized !== undefined ? eqVeh.isMotorized : (eqVeh.bonusVal >= 6);
    if (isMotor && isRadioEffectActive('MOTOR_PM_MOD')) {
      pm += getRadioEffectValue('MOTOR_PM_MOD', -2);
    }
  } else if (isRadioEffectActive('FOOT_PM_MOD')) {
    pm += getRadioEffectValue('FOOT_PM_MOD', -2);
  }
  return Math.max(1, pm);
}

function cyclePlayerHearts() {
  if (!isMyTurnToPlay) return;
  localPlayer.hearts = localPlayer.hearts <= 1 ? 3 : localPlayer.hearts - 1;
  refreshHud();
}
async function clickMuscleSlot(idx) {
  if (!isMyTurnToPlay || !localPlayer.musclesOnPerson[idx]) return;
  const item = localPlayer.musclesOnPerson[idx];
  if (await showAppConfirm(`Congédier définitivement ${item.name} ?`, "Congédier Lascar")) {
    localPlayer.musclesOnPerson.splice(idx, 1);
    refreshHud();
  }
}
async function clickProstituteTransitSlot() {
  if (!isMyTurnToPlay) return;
  if (localPlayer.prostituteInTransit) {
    if (await showAppConfirm(`Congédier définitivement ${localPlayer.prostituteInTransit.name} ?`, "Congédier Escort")) {
      localPlayer.prostituteInTransit = null;
      refreshHud();
    }
  } else await showAppAlert("Aucune prostituée en transit. Flashez le Nightclub pour en recruter !", "Slot Vide");
}
async function depositProstituteToSafe() {
  if (!isMyTurnToPlay || !localPlayer.prostituteInTransit) return;
  localPlayer.prostitutesAtSafeList.push(localPlayer.prostituteInTransit);
  localPlayer.prostituteInTransit = null;
  await showAppAlert("Prostituée installée au QG ! Sa rente sera versée au coffre à chaque manche.", "🎉 Sécurisation QG");
  refreshHud();
}
async function openSpecialAbilityPrompt() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour de jouer !", "Tour Inactif");
  if (localPlayer.specialUsedThisTurn) return showAppAlert("Capacité spéciale déjà utilisée durant ce tour !", "Capacité Épuisée");
  const caid = getMyCaid();
  const targetedSkills = ['caid_2', 'caid_4', 'caid_6', 'caid_7', 'caid_8'];
  if (targetedSkills.includes(caid.id)) {
    syncMultiplayerTargets();
    const sel = document.getElementById('specialTargetSelect');
    if (!sel || !sel.value) return showAppAlert("Aucune cible attaquable (ou Pacte d'Alliance actif) !", "Cible Introuvable");
    document.getElementById('specialTargetDesc').innerText = `${caid.skillName} : ${caid.skillDesc}`;
    document.getElementById('modalTargetSpecial').classList.remove('hidden');
  } else if (caid.id === 'caid_5') {
    // La Prière ne s'active pas à l'avance : elle est proposée automatiquement au moment du contrôle ou de l'agression
    return showAppAlert("Prière Miraculeuse : elle vous sera proposée automatiquement lors d'un contrôle de police ou si un rival vous attaque (50% de chance d'annuler).\n\nUtilisable 1x par manche.", "🙏 J-Lo Gramme");
  } else {
    if (!await showAppConfirm(`${caid.skillName} : ${caid.skillDesc}\n\nUtilisable 1x par tour. Activer ?`, "⚡ Capacité Spéciale")) return;
    if (caid.id === 'caid_3') {
      localPlayer.hearts = Math.min(3, localPlayer.hearts + 1);
      await showAppAlert("+1 Cœur de Vie restauré !", "⚡ La Grosse Sieste");
    } else {
      await showAppAlert(`${caid.skillName} activée !`, "⚡ Capacité Active");
    }
    localPlayer.specialUsedThisTurn = true;
    refreshHud();
  }
}
async function executeTargetedSpecialPower() {
  const sel = document.getElementById('specialTargetSelect');
  const target = connectedRivals.find(r => r.playerToken === sel.value || r.socketId === sel.value);
  if (!target) return showAppAlert("Sélectionnez une cible.", "Cible Requise");
  if (isRivalProtectedByPact(target.playerToken)) {
    return showAppAlert("Pacte d'Alliance actif : vous ne pouvez pas cibler votre allié !", "Pacte Actif");
  }
  const caid = getMyCaid();
  closeModal('modalTargetSpecial');
  let effect = '';
  if (caid.id === 'caid_8') effect = 'siphon';
  else if (caid.id === 'caid_6') effect = 'shuriken';
  else if (caid.id === 'caid_4') effect = 'danse';
  else if (caid.id === 'caid_7') effect = 'steal_item';
  else if (caid.id === 'caid_2') effect = 'swap_pos';
  if (socket) {
    socket.emit('apply_special_to_target', {
      targetSocketId: target.socketId,
      targetPlayerToken: target.playerToken,
      effectType: effect,
      senderCaid: caid.name
    });
  }
  if (effect === 'siphon') {
    localPlayer.hearts = Math.min(3, localPlayer.hearts + 1);
    await showAppAlert(`Siphon Vital réussi sur ${target.caidName || 'le rival'} : +1 Cœur !`, "🩸 Siphon Vital");
  } else {
    await showAppAlert(`${caid.skillName} lancée sur ${target.caidName || 'la cible'} !`, "⚡ Attaque Spéciale");
  }
  localPlayer.specialUsedThisTurn = true;
  refreshHud();
}

async function triggerPoliceInspection() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  if (!await showAppConfirm("Lancer le contrôle de police ?", "🚨 Contrôle de Police")) return;

  const caid = getMyCaid();
  if (caid.id === 'caid_5' && !localPlayer.specialUsedThisTurn) {
    if (await showAppConfirm("Tenter votre 'Prière Miraculeuse' (50% d'annuler ce contrôle) ?", "🙏 J-Lo Gramme")) {
      localPlayer.specialUsedThisTurn = true;
      refreshHud();
      if (Math.random() >= 0.5) return showAppAlert("FACE ! Contrôle annulé ce tour !", "🙏 Miracle");
      await showAppAlert("PILE ! La prière échoue.", "🙏 Échec");
    }
  }

  const r = Math.random();
  let pick = 'CLEAN';
  if (r < 0.30) pick = 'CLEAN';
  else if (r < 0.65) pick = 'DRUGS_FOUND';
  else pick = 'WEAPONS_FOUND';

  const hasAnyWeapon = !!localPlayer.equipped.weapon || localPlayer.inventory.some(it => it && it.type === 'WEAPON');

  if (pick === 'CLEAN') {
    await showAppAlert("R.A.S. ! La patrouille ne trouve rien et vous laisse repartir.", "👮 Contrôle");
  } else if (pick === 'DRUGS_FOUND') {
    if (localPlayer.drugs > 0) {
      const s = localPlayer.drugs;
      localPlayer.drugs = 0;
      refreshHud();
      await showAppAlert(
        `${s} kg de drogue saisis !\nVous êtes conduit au poste de police et placé en garde à vue : votre tour prend fin immédiatement !`,
        "🚔 Garde à Vue"
      );
      endCurrentPlayerTurn();
    } else {
      await showAppAlert("La police cherchait de la drogue mais vous n'en avez pas sur vous : R.A.S., vous repartez libre !", "👮 Contrôle");
    }
  } else if (pick === 'WEAPONS_FOUND') {
    if (hasAnyWeapon) {
      localPlayer.equipped.weapon = null;
      localPlayer.inventory = localPlayer.inventory.filter(it => !it || it.type !== 'WEAPON');
      refreshHud();
      await showAppAlert(
        "Armes saisies !\nVous êtes conduit au poste de police et placé en garde à vue : votre tour prend fin immédiatement !",
        "🚔 Garde à Vue"
      );
      endCurrentPlayerTurn();
    } else {
      await showAppAlert("La police cherchait des armes mais vous n'en possédez aucune : R.A.S., vous repartez libre !", "👮 Contrôle");
    }
  }
}

async function sellItem(idx) {
  if (!isMyTurnToPlay) return;
  const item = localPlayer.inventory[idx];
  if (!item) return;
  const val = Math.floor((item.price || item.p || 3000) * 0.5);
  if (await showAppConfirm(`Revendre "${item.name}" pour ${val.toLocaleString()} € ?`, "💰 Revente")) {
    localPlayer.inventory.splice(idx, 1);
    localPlayer.pocketCash += val;
    refreshHud();
  }
}

async function discardItem(idx) {
  if (!isMyTurnToPlay) return;
  const item = localPlayer.inventory[idx];
  if (!item) return;
  if (await showAppConfirm(`Jeter définitivement "${item.name}" ?`, "Jeter")) {
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
  }
}

function refreshHud() {
  const caid = getMyCaid();
  const bannerImg = document.getElementById('caidBannerImg');
  if (bannerImg && caid.bannerFile) bannerImg.src = caid.bannerFile;
  let heartsStr = '';
  for (let i = 0; i < localPlayer.hearts; i++) heartsStr += '❤️';
  for (let i = localPlayer.hearts; i < 3; i++) heartsStr += '🖤';
  document.getElementById('hudHearts').innerText = heartsStr;
  document.getElementById('hudAtk').innerText = getTotalAtk();
  document.getElementById('hudDef').innerText = getTotalDef();
  // Aide-mémoire : PM restants après les actions du tour (2 PM par action, à décompter aussi sur le plateau)
  document.getElementById('hudCurrentPm').innerText = Math.max(0, getTotalPm() - pmSpentThisTurn);
  const pmNote = document.getElementById('hudPmNote');
  pmNote.innerText = pmSpentThisTurn > 0 ? `(−${pmSpentThisTurn})` : '';
  pmNote.classList.toggle('hidden', pmSpentThisTurn <= 0);
  if (currentSession.currentRadioEvent) {
    document.getElementById('hudRadioRoundTag').innerText = currentSession.round;
    document.getElementById('hudRadioReminderTitle').innerText = currentSession.currentRadioEvent.title;
    document.getElementById('hudRadioReminderDesc').innerText = currentSession.currentRadioEvent.impact || currentSession.currentRadioEvent.desc;
  }
  for (let i = 0; i < 3; i++) {
    const slotEl = document.getElementById(`muscleSlot_${i}`);
    if (localPlayer.musclesOnPerson[i]) {
      const mb = localPlayer.musclesOnPerson[i];
      const img = (mb.level === 2) ? 'gblvl2.jpg' : 'gblvl1.jpg';
      slotEl.innerHTML = `<img src="${img}" class="w-full h-full object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-[10px] font-black text-sky-300 font-mono\\'>L${mb.level||1}</span>';">`;
      slotEl.className = "w-8 h-8 rounded-xl bg-sky-950/80 border border-sky-400 overflow-hidden flex items-center justify-center cursor-pointer";
    } else {
      slotEl.innerHTML = `<span class="text-xs text-slate-500 font-mono font-bold">✕</span>`;
      slotEl.className = "w-8 h-8 rounded-xl bg-black/60 border border-sky-400/40 flex items-center justify-center cursor-pointer";
    }
  }
  const pSlot = document.getElementById('prostituteTransitSlot');
  if (localPlayer.prostituteInTransit) {
    const pr = localPlayer.prostituteInTransit;
    const imgPr = (pr.level === 2) ? 'plvl2.jpg' : 'plvl1.jpg';
    pSlot.innerHTML = `<img src="${imgPr}" class="w-full h-full object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-[10px] font-black text-rose-300 font-mono\\'>L${pr.level||1}</span>';">`;
    pSlot.className = "w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-400 overflow-hidden flex items-center justify-center cursor-pointer";
  } else {
    pSlot.innerHTML = `<span class="text-xs text-slate-500 font-mono font-bold">✕</span>`;
    pSlot.className = "w-8 h-8 rounded-xl bg-black/60 border border-rose-400/40 flex items-center justify-center cursor-pointer";
  }
  document.getElementById('hudPocketCash').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('hudSafeCash').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  document.getElementById('hudDrugs').innerText = `🌿 ${localPlayer.drugs} kg`;
  document.getElementById('hudSafeDrugs').innerText = `📦 ${localPlayer.safeDrugs} kg`;
  document.getElementById('hudSpecialPowerName').innerText = caid.skillName;
  document.getElementById('hudSpecialPowerDesc').innerText = caid.skillDesc;
  const btnSpec = document.getElementById('btnSpecialPower');
  const actionLabel = document.getElementById('hudSpecialActionBtnLabel');
  if (localPlayer.specialUsedThisTurn) {
    btnSpec.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
    actionLabel.innerText = "Épuisée";
    actionLabel.className = "text-[9px] font-black uppercase px-2 py-1 bg-slate-800 text-slate-500 rounded-lg inline-block";
  } else {
    btnSpec.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
    actionLabel.innerText = "Activer";
    actionLabel.className = "text-[9px] font-black uppercase px-2.5 py-1 bg-purple-500 text-black rounded-lg inline-block";
  }
  let eqCount = (localPlayer.equipped.weapon ? 1 : 0) + (localPlayer.equipped.armor ? 1 : 0) + (localPlayer.equipped.vehicle ? 1 : 0);
  document.getElementById('hudEquipCount').innerText = `${eqCount}/3`;
  document.getElementById('hudItemCount').innerText = localPlayer.inventory.length;
  renderInventoryList();
  renderEquipmentSlotsView();
  updateArenaLiveStats();
  if (socket) {
    socket.emit('sync_player', {
      caidId: localPlayer.caidId,
      caidName: caid.name,
      pocketCash: localPlayer.pocketCash,
      safeCash: localPlayer.safeCash,
      drugs: localPlayer.drugs,
      hearts: localPlayer.hearts,
      atk: getTotalAtk(),
      def: getTotalDef(),
      musclesCount: localPlayer.musclesOnPerson.length,
      hasProstituteInTransit: !!localPlayer.prostituteInTransit,
      prostituteObj: localPlayer.prostituteInTransit,
      hasStrayDog: !!localPlayer.strayDogActive,
      nullEnemyWeapon: !!combatModifiers.nullEnemyWeapon
    });
  }
}

function renderInventoryList() {
  const c = document.getElementById('inventoryItemsList');
  if (!c) return;
  const filtered = localPlayer.inventory.filter(item => item && item.name !== 'À pied' && item.type !== 'FOOT' && item.type !== 'MUSCLE' && item.type !== 'PROSTITUTE');
  if (!filtered.length) {
    c.innerHTML = '<p class="text-xs text-slate-400 italic p-4 text-center glass-panel rounded-xl">Aucun objet dans le sac.</p>';
    return;
  }
  c.innerHTML = filtered.map(item => {
    const realIdx = localPlayer.inventory.indexOf(item);
    let primaryBtn = '';
    if (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'VEHICLE') {
      primaryBtn = `<button onclick="equipItemFromInventory(${realIdx})" class="px-2.5 py-1 bg-gradient-to-r from-emerald-400 to-green-500 text-black font-black rounded-lg font-mono text-[9px] uppercase">Équiper</button>`;
    } else if (item.eff === 'stray_dog') {
      primaryBtn = `<button onclick="useItem(${realIdx})" class="px-2.5 py-1 bg-purple-500 text-black font-black rounded-lg font-mono text-[9px] uppercase">Siffler</button>`;
    } else if (item.dur === 'combat') {
      primaryBtn = `<button onclick="useItem(${realIdx})" class="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg font-mono text-[9px] uppercase font-bold">Activer</button>`;
    } else {
      primaryBtn = `<button onclick="useItem(${realIdx})" class="px-2.5 py-1 bg-yellow-400 text-black font-black rounded-lg font-mono text-[9px] uppercase">Utiliser</button>`;
    }
    const isSellable = (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'VEHICLE');
    const resellVal = Math.floor((item.price || item.p || 3000) * 0.5);
    const sellBtn = isSellable ? `<button onclick="sellItem(${realIdx})" class="px-2 py-1 glass-panel text-amber-300 border border-amber-500/30 rounded-lg font-mono text-[9px] font-bold">Vendre (${resellVal}€)</button>` : '';
    return `
      <div class="p-2.5 bg-black/60 rounded-xl border border-white/10 flex items-center justify-between text-xs gap-2">
        <div class="min-w-0 flex-1"><span class="font-bold text-white block truncate">${item.name}</span><span class="text-[10px] text-ghetto-gold font-mono block">${item.bonusLabel || item.desc || 'Objet spécial'}</span></div>
        <div class="flex items-center gap-1.5 flex-shrink-0">${primaryBtn}${sellBtn}<button onclick="discardItem(${realIdx})" class="px-2 py-1 glass-panel text-rose-400 border border-rose-500/30 rounded-lg font-mono text-[9px]">Jeter</button></div>
      </div>`;
  }).join('');
}

async function equipItemFromInventory(idx) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  const item = localPlayer.inventory[idx];
  if (!item) return;
  const slotKey = item.type === 'WEAPON' ? 'weapon' : (item.type === 'ARMOR' ? 'armor' : 'vehicle');
  if (localPlayer.equipped[slotKey]) localPlayer.inventory.push(localPlayer.equipped[slotKey]);
  localPlayer.equipped[slotKey] = item;
  localPlayer.inventory.splice(idx, 1);
  refreshHud();
}

async function unequipSlot(slotKey) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  const item = localPlayer.equipped[slotKey];
  if (!item) return;
  localPlayer.inventory.push(item);
  localPlayer.equipped[slotKey] = null;
  refreshHud();
}

async function useItem(idx) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  const it = localPlayer.inventory[idx];
  if (!it) return;
  if (it.eff === 'heal' || it.type === 'CONSUMABLE' || (it.name && it.name.includes('Kebab'))) {
    if (localPlayer.hearts >= 3) return showAppAlert("Vos Cœurs sont déjà au maximum !", "Santé Pleine");
    localPlayer.hearts = Math.min(3, localPlayer.hearts + (it.val || 1));
    localPlayer.inventory.splice(idx, 1);
    await showAppAlert("+1 Cœur de Vie restauré !", "🥙 Kebab");
    refreshHud();
    return;
  }
  if (it.eff === 'stray_dog') {
    const caid = getMyCaid();
    localPlayer.inventory.splice(idx, 1);
    if (socket) socket.emit('claim_stray_dog', { senderCaid: caid.name, playerToken: myPlayerToken });
    else { localPlayer.strayDogActive = true; refreshHud(); }
    return;
  }
  if (it.dur === 'combat') {
    if (it.eff === 'double_weapon_atk') {
      if (!isFirearm(localPlayer.equipped.weapon)) {
        return showAppAlert("Requiert une arme à feu équipée !", "Arme Incompatible");
      }
      combatModifiers.doubleWeapon = true;
    } else if (it.eff === 'double_muscles_atk') combatModifiers.doubleMuscles = true;
    else if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'null_enemy_weapon') combatModifiers.nullEnemyWeapon = true;
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
    const lasts = (it.eff === 'double_weapon_atk' || it.eff === 'null_enemy_weapon') ? 'pour votre prochain combat de ce tour' : "jusqu'à la fin du tour en cours";
    await showAppAlert(`${it.name} activé ${lasts} ! Vos statistiques de combat ont été mises à jour.`, "⚔️ Bonus de Combat Actif");
    return;
  }
  localPlayer.inventory.splice(idx, 1);
  await showAppAlert(`${it.name} utilisé !`, "Objet");
  refreshHud();
}

function renderEquipmentSlotsView() {
  const w = localPlayer.equipped.weapon;
  document.getElementById('slotWeaponTitle').innerText = w ? w.name : "Mains nues";
  document.getElementById('slotWeaponStats').innerText = w ? `Attaque +${w.bonusVal}` : "Attaque +0";
  document.getElementById('slotWeaponStatusContainer').innerHTML = w
    ? `<div class="flex items-center gap-1.5"><span class="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 font-mono text-[9px] font-bold uppercase">Occupé</span><button onclick="unequipSlot('weapon')" class="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-slate-400"><i class="ph-bold ph-arrow-u-down-left text-xs"></i></button></div>`
    : `<span class="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold uppercase">Libre</span>`;
  const a = localPlayer.equipped.armor;
  document.getElementById('slotArmorTitle').innerText = a ? a.name : "Aucune protection";
  document.getElementById('slotArmorStats').innerText = a ? `Défense +${a.bonusVal}` : "Défense +0";
  document.getElementById('slotArmorStatusContainer').innerHTML = a
    ? `<div class="flex items-center gap-1.5"><span class="px-2.5 py-1 rounded-xl bg-sky-500/20 text-sky-300 font-mono text-[9px] font-bold uppercase">Occupé</span><button onclick="unequipSlot('armor')" class="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-slate-400"><i class="ph-bold ph-arrow-u-down-left text-xs"></i></button></div>`
    : `<span class="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold uppercase">Libre</span>`;
  const v = localPlayer.equipped.vehicle;
  document.getElementById('slotVehicleTitle').innerText = v ? v.name : "À pied";
  document.getElementById('slotVehicleStats').innerText = v ? `Déplacement +${v.bonusVal} PM (${getTotalPm()} PM)` : `Déplacement ${getTotalPm()} PM`;
  document.getElementById('slotVehicleStatusContainer').innerHTML = v
    ? `<div class="flex items-center gap-1.5"><span class="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-mono text-[9px] font-bold uppercase">Occupé</span><button onclick="unequipSlot('vehicle')" class="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-slate-400"><i class="ph-bold ph-arrow-u-down-left text-xs"></i></button></div>`
    : `<span class="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold uppercase">Libre</span>`;
}

async function openTransferModal(mode) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  currentTransferMode = mode;
  document.getElementById('modalTransfer').classList.remove('hidden');
  updateTransferUI();
}
function switchTransferResource(res) { currentTransferResource = res; updateTransferUI(); }
function getTransferMaxLimit() {
  return currentTransferResource === 'cash'
    ? (currentTransferMode === 'deposit' ? localPlayer.pocketCash : localPlayer.safeCash)
    : (currentTransferMode === 'deposit' ? localPlayer.drugs : (localPlayer.safeDrugs || 0));
}
function updateTransferUI() {
  const maxLimit = getTransferMaxLimit();
  const unit = currentTransferResource === 'cash' ? '€' : 'kg';
  document.getElementById('transferTabCash').className = currentTransferResource === 'cash' ? "py-2 rounded-xl font-bold bg-yellow-400 text-black" : "py-2 rounded-xl font-bold text-slate-400";
  document.getElementById('transferTabDrugs').className = currentTransferResource === 'drugs' ? "py-2 rounded-xl font-bold bg-emerald-400 text-black" : "py-2 rounded-xl font-bold text-slate-400";
  document.getElementById('transferPocketDisplay').innerText = currentTransferResource === 'cash' ? `${localPlayer.pocketCash.toLocaleString()} €` : `${localPlayer.drugs} kg`;
  document.getElementById('transferSafeDisplay').innerText = currentTransferResource === 'cash' ? `${localPlayer.safeCash.toLocaleString()} €` : `${localPlayer.safeDrugs || 0} kg`;
  document.getElementById('transferUnitSuffix').innerText = unit;
  document.getElementById('transferMaxAvailableLabel').innerText = `Max : ${maxLimit.toLocaleString()} ${unit}`;
  setTransferPercentage(0);
}
function setTransferPercentage(pct) {
  const maxLimit = getTransferMaxLimit();
  document.getElementById('transferAmountInput').value = Math.floor((maxLimit * pct) / 100);
  document.getElementById('transferRangeSlider').value = pct;
}
function syncTransferSliderToInput() {
  const pct = parseInt(document.getElementById('transferRangeSlider').value) || 0;
  document.getElementById('transferAmountInput').value = Math.floor((getTransferMaxLimit() * pct) / 100);
}
function syncTransferInputToSlider() {
  const maxLimit = getTransferMaxLimit();
  let val = Math.min(maxLimit, parseInt(document.getElementById('transferAmountInput').value) || 0);
  document.getElementById('transferAmountInput').value = val;
  document.getElementById('transferRangeSlider').value = maxLimit > 0 ? Math.round((val / maxLimit) * 100) : 0;
}
async function confirmTransferAction() {
  if (!isMyTurnToPlay) return;
  const amt = parseInt(document.getElementById('transferAmountInput').value) || 0;
  if (amt <= 0) return showAppAlert("Sélectionnez un montant supérieur à 0.", "Montant Invalide");
  if (currentTransferResource === 'cash') {
    if (currentTransferMode === 'deposit' && amt <= localPlayer.pocketCash) { localPlayer.pocketCash -= amt; localPlayer.safeCash += amt; }
    else if (currentTransferMode === 'withdraw' && amt <= localPlayer.safeCash) { localPlayer.safeCash -= amt; localPlayer.pocketCash += amt; }
  } else {
    if (currentTransferMode === 'deposit' && amt <= localPlayer.drugs) { localPlayer.drugs -= amt; localPlayer.safeDrugs += amt; }
    else if (currentTransferMode === 'withdraw' && amt <= localPlayer.safeDrugs) { localPlayer.safeDrugs -= amt; localPlayer.drugs += amt; }
  }
  closeModal('modalTransfer');
  refreshHud();
}
