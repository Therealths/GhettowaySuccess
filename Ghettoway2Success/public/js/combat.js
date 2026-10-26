// Combats de rue, riposte et pillage

// --- UI PILLAGE & BARRE DE PARTAGE ---
function selectRiposteTarget(chosenTargetToken) {
  closeModal('modalChooseRiposteTarget');
  if (socket) socket.emit('combat_select_riposte_target', { chosenTargetToken });
}

function openPillageModalUI(pillageInfo) {
  document.getElementById('pillageLoserName').innerText = pillageInfo.loserCaid || 'le perdant';
  const container = document.getElementById('pillageOptionsContainer');
  const btns = [];

  btns.push(`
    <button onclick="choosePillageReward('cash')" class="w-full p-3 glass-panel rounded-2xl border border-amber-500/40 flex items-center justify-between text-left ${pillageInfo.availableCash <= 0 ? 'opacity-40 pointer-events-none' : ''}">
      <div>
        <span class="text-xs font-black text-amber-300 uppercase block">💰 100% du Cash en Poche</span>
        <span class="text-[10px] font-mono text-white">${(pillageInfo.availableCash || 0).toLocaleString()} € disponibles</span>
      </div>
      <i class="ph-bold ph-arrow-right text-amber-400"></i>
    </button>
  `);

  btns.push(`
    <button onclick="choosePillageReward('drugs')" class="w-full p-3 glass-panel rounded-2xl border border-emerald-500/40 flex items-center justify-between text-left ${pillageInfo.availableDrugs <= 0 ? 'opacity-40 pointer-events-none' : ''}">
      <div>
        <span class="text-xs font-black text-emerald-300 uppercase block">🌿 100% de la Drogue en Poche</span>
        <span class="text-[10px] font-mono text-white">${pillageInfo.availableDrugs || 0} kg disponibles</span>
      </div>
      <i class="ph-bold ph-arrow-right text-emerald-400"></i>
    </button>
  `);

  if (pillageInfo.hasProstitute) {
    if (pillageInfo.isAlliedVictory && localPlayer.activeAlly) {
      if (!localPlayer.prostituteInTransit) {
        btns.push(`
          <button onclick="choosePillageReward('prostitute', '${myPlayerToken}')" class="w-full p-3 glass-panel rounded-2xl border border-pink-500/40 flex items-center justify-between text-left">
            <div>
              <span class="text-xs font-black text-pink-300 uppercase block">👠 Prendre sa Prostituée (Pour Moi)</span>
              <span class="text-[10px] font-mono text-white">Place l'escort dans votre slot transit</span>
            </div>
            <i class="ph-bold ph-arrow-right text-pink-400"></i>
          </button>
        `);
      }
      if (!localPlayer.activeAlly.hasProstituteInTransit) {
        btns.push(`
          <button onclick="choosePillageReward('prostitute', '${localPlayer.activeAlly.allyToken}')" class="w-full p-3 glass-panel rounded-2xl border border-purple-500/40 flex items-center justify-between text-left">
            <div>
              <span class="text-xs font-black text-purple-300 uppercase block">👠 Donner sa Prostituée à ${localPlayer.activeAlly.caid}</span>
              <span class="text-[10px] font-mono text-white">Place l'escort chez votre allié</span>
            </div>
            <i class="ph-bold ph-arrow-right text-purple-400"></i>
          </button>
        `);
      }
    } else {
      const canTakePros = !localPlayer.prostituteInTransit;
      btns.push(`
        <button onclick="choosePillageReward('prostitute', '${myPlayerToken}')" class="w-full p-3 glass-panel rounded-2xl border border-pink-500/40 flex items-center justify-between text-left ${!canTakePros ? 'opacity-40 pointer-events-none' : ''}">
          <div>
            <span class="text-xs font-black text-pink-300 uppercase block">👠 Capturer sa Prostituée</span>
            <span class="text-[10px] font-mono text-white">${canTakePros ? 'Disponible en transit' : 'Votre slot transit est déjà occupé'}</span>
          </div>
          <i class="ph-bold ph-arrow-right text-pink-400"></i>
        </button>
      `);
    }
  }

  btns.push(`
    <button onclick="choosePillageReward('none')" class="w-full py-2.5 glass-panel text-slate-400 font-bold rounded-xl text-xs uppercase">Ne rien prendre / Fermer</button>
  `);

  container.innerHTML = btns.join('');
  document.getElementById('modalCombatPillage').classList.remove('hidden');
}

function choosePillageReward(category, recipientToken = null) {
  closeModal('modalCombatPillage');
  if (socket) socket.emit('execute_pillage_choice', { category, recipientToken });
}

function resetCombatModifiers() {
  combatModifiers = { flatAtkBonus: 0, doubleMuscles: false, doubleWeapon: false, nullEnemyWeapon: false };
}
function isFirearm(weaponObj) {
  if (!weaponObj) return false;
  if (typeof weaponObj === 'object' && weaponObj.isFirearm !== undefined) {
    return weaponObj.isFirearm === true;
  }
  const wName = typeof weaponObj === 'string' ? weaponObj : (weaponObj.name || '');
  const l = wName.toLowerCase();
  if (l.includes('batte') || l.includes('poing') || l.includes('couteau') || l.includes('cran') || l.includes('hache') || l.includes('mains')) return false;
  return l.includes('revolver') || l.includes('pistolet') || l.includes('fusil') || l.includes('pompe') || l.includes('mitraillette') || l.includes('canon') || l.includes('gun');
}

async function openCombatModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour d'attaquer !", "Tour Inactif");
  syncMultiplayerTargets();
  document.getElementById('combatModalHeaderTitle').innerHTML = `<i class="ph-bold ph-sword"></i> Combat de Rue`;
  document.getElementById('combatTargetSelectionBox').classList.remove('hidden');
  document.getElementById('btnInitiateFightAction').classList.remove('hidden');
  document.getElementById('combatAdversaryTag').classList.add('hidden');
  document.getElementById('btnToggleCombatReady').classList.add('hidden');
  document.getElementById('combatLiveLog').innerHTML = `<p class="text-slate-400 italic">Sélectionnez votre cible et cliquez sur Engager le Combat...</p>`;
  isCombatReady = false;
  updateArenaLiveStats();
  document.getElementById('modalCombat').classList.remove('hidden');
}

// Choix entre Attaque Coordonnée (Alliance) ou Attaque Solo
async function initiateCombatEngagement() {
  const sel = document.getElementById('combatTargetSelect');
  const target = connectedRivals.find(r => r.playerToken === sel.value || r.socketId === sel.value);
  if (!target) return showAppAlert("Aucune cible attaquable sélectionnée.", "Cible Requise");

  if (isRivalProtectedByPact(target.playerToken)) {
    return showAppAlert("Pacte d'Alliance actif : vous ne pouvez pas attaquer votre allié (ni durant ce tour, ni au tour suivant) !", "🤝 Pacte Actif");
  }

  let useAlliance = false;
  if (localPlayer.allianceActive && localPlayer.activeAlly) {
    useAlliance = await showAppConfirm(
      `Vous êtes en Alliance avec ${localPlayer.activeAlly.caid}.\n\nComment voulez-vous attaquer ?\n\n• SOLO : vous attaquez seul.\n• EN ALLIANCE : attaque coordonnée à 2 (si vous êtes tous deux sur la bonne case).`,
      "⚔️ Solo ou en Alliance ?",
      "🤝 En Alliance",
      "Solo"
    );
  }

  const caid = getMyCaid();
  if (socket) {
    socket.emit('start_combat_engagement', {
      targetSocketId: target.socketId,
      targetPlayerToken: target.playerToken,
      attackerCaid: caid.name,
      useAlliance: useAlliance
    });
  }
}

function abortCombat() {
  if (socket && currentDuelInfo) socket.emit('combat_cancel');
  else closeModal('modalCombat');
}

async function openCombatItemSelectorModal() {
  const items = localPlayer.inventory.filter(i => i && i.dur === 'combat');
  if (!items.length) return showAppAlert("Aucun objet de combat dans votre Sac !", "Sac Vide");
  const container = document.getElementById('combatItemsChecklist');
  container.innerHTML = items.map(item => {
    const isBP = (item.eff === 'double_weapon_atk');
    const hasFA = isFirearm(localPlayer.equipped.weapon);
    const dis = isBP && !hasFA;
    return `
      <label class="p-2.5 glass-panel rounded-xl flex items-center justify-between border-white/10 ${dis ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">
        <div class="flex-1 pr-2"><span class="text-xs font-black text-white block">${item.name}</span><span class="text-[10px] text-ghetto-gold font-mono block">${item.desc}</span>${dis ? '<span class="text-[9px] text-rose-400 block font-mono">Arme à feu requise !</span>' : ''}</div>
        <input type="checkbox" value="${item.id}" ${dis ? 'disabled' : ''} class="combat-item-checkbox w-4 h-4 rounded">
      </label>`;
  }).join('');
  document.getElementById('btnConfirmCombatItems').onclick = () => {
    const checked = Array.from(document.querySelectorAll('.combat-item-checkbox:checked')).map(cb => cb.value);
    if (!checked.length) return closeModal('modalCombatItemSelector');
    const playedNames = [];
    checked.forEach(id => {
      const idx = localPlayer.inventory.findIndex(it => it.id === id);
      if (idx >= 0) {
        const it = localPlayer.inventory[idx];
        playedNames.push(it.name);
        if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
        else if (it.eff === 'double_muscles_atk') combatModifiers.doubleMuscles = true;
        else if (it.eff === 'double_weapon_atk') combatModifiers.doubleWeapon = true;
        else if (it.eff === 'null_enemy_weapon') combatModifiers.nullEnemyWeapon = true;
        localPlayer.inventory.splice(idx, 1);
      }
    });
    closeModal('modalCombatItemSelector');
    refreshHud();
    if (socket && currentDuelInfo) {
      const stat = (currentDuelInfo.role === 'attacker') ? getTotalAtk() : getTotalDef();
      socket.emit('combat_play_items', { itemNames: playedNames, newTotalStat: stat });
    }
    const log = document.getElementById('combatLiveLog');
    log.innerHTML += `<p class="text-emerald-300">✔️ Activé : ${playedNames.join(', ')} (Assaut: ${getTotalAtk()} / Def: ${getTotalDef()})</p>`;
    log.scrollTop = log.scrollHeight;
  };
  document.getElementById('modalCombatItemSelector').classList.remove('hidden');
}

async function toggleCombatReadyState() {
  if (!currentDuelInfo) return;
  isCombatReady = !isCombatReady;
  updateCombatReadyButtonUI();
  if (socket) {
    const stat = (currentDuelInfo.role === 'attacker') ? getTotalAtk() : getTotalDef();
    socket.emit('combat_set_ready', { currentStat: stat });
  }
  const log = document.getElementById('combatLiveLog');
  log.innerHTML += isCombatReady ? `<p class="text-emerald-400 font-bold">⏳ Vous êtes prêt ! En attente...</p>` : `<p class="text-amber-300">Non prêt.</p>`;
  log.scrollTop = log.scrollHeight;
}

function updateCombatReadyButtonUI() {
  const btn = document.getElementById('btnToggleCombatReady');
  const lbl = document.getElementById('btnCombatReadyLabel');
  const phasePrefix = (currentDuelInfo && currentDuelInfo.phase === 2) ? 'Prêt (Riposte)' : 'Prêt au combat';
  if (isCombatReady) {
    btn.className = "py-3 bg-emerald-600 text-white font-black uppercase rounded-xl text-xs flex items-center justify-center gap-1.5";
    lbl.innerText = "Prêt (Validé)";
  } else {
    btn.className = "py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-black font-black uppercase rounded-xl text-xs flex items-center justify-center gap-1.5";
    lbl.innerText = phasePrefix;
  }
}
