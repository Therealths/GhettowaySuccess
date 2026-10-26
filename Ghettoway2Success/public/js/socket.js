// Connexion au serveur et réception des événements (chargé en dernier)

const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
  // Nouveau déploiement détecté : on recharge pour récupérer la dernière version de l'app
  let loadedAppVersion = null;
  socket.on('app_version', (v) => {
    if (loadedAppVersion && loadedAppVersion !== v) location.reload();
    else loadedAppVersion = v;
  });
  socket.on('connect', () => {
    const savedRoomId = localStorage.getItem('g2s_room_id');
    if (savedRoomId) socket.emit('reconnect_player', { roomId: savedRoomId, playerToken: myPlayerToken });
  });
  socket.on('reconnect_success', ({ roomId, player, gameStarted, round, radio, players, selectionMode }) => {
    localStorage.setItem('g2s_room_id', roomId);
    if (selectionMode) roomSelectionMode = selectionMode;
    if (player && player.caidId) {
      caidLocked = true;
      localPlayer.caidId = player.caidId;
      localPlayer.caidName = player.caidName;
      localStorage.setItem('g2s_saved_caid_id', player.caidId);
      const refCaid = CAID_ROSTER.find(c => c.id === player.caidId);
      if (refCaid && (!localPlayer.inventory || localPlayer.inventory.length === 0) && !gameStarted) {
        localPlayer.inventory = JSON.parse(JSON.stringify(refCaid.startItems));
      }
    }
    localPlayer = Object.assign(localPlayer, player);
    if (players) updateRivalsList(players);
    if (gameStarted) {
      currentSession.round = round || 1;
      currentSession.currentRadioEvent = radio;
      navTo('page-6');
      refreshHud();
    } else if (localPlayer.caidId) navTo('page-lobby');
    else navTo('page-4');
  });
  socket.on('reconnect_failed', () => { localStorage.removeItem('g2s_room_id'); });
  socket.on('rooms_list', (list) => {
    const container = document.getElementById('gamesListContainer');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<p class="text-xs text-slate-500 italic p-3 text-center">Aucun salon actif détecté.</p>';
    list.forEach(r => {
      const modeBadge = r.selectionMode === 'manual' ? '👆 Au Choix' : '🎲 Aléatoire';
      const div = document.createElement('div');
      div.className = "p-3.5 glass-panel rounded-2xl flex items-center justify-between cursor-pointer hover:border-cyan-400/40";
      div.onclick = () => {
        caidLocked = false;
        localPlayer.caidId = null;
        localStorage.removeItem('g2s_saved_caid_id');
        localStorage.setItem('g2s_room_id', r.id);
        socket.emit('join_room', { roomId: r.id, playerToken: myPlayerToken });
      };
      div.innerHTML = `<div><h4 class="font-black text-xs text-white uppercase">${r.name}</h4><span class="text-[10px] text-slate-400 font-mono">${r.connectedCount} / ${r.maxPlayers} Caïds • ${modeBadge}</span></div><span class="text-[10px] font-bold text-ghetto-cyan bg-cyan-950/60 px-3 py-1 rounded-lg border border-cyan-500/30">Rejoindre</span>`;
      container.appendChild(div);
    });
  });
  socket.on('room_created', ({ roomId, selectionMode }) => {
    localStorage.setItem('g2s_room_id', roomId);
    localStorage.removeItem('g2s_saved_caid_id');
    localPlayer.caidId = null;
    caidLocked = false;
    localPlayer.isHost = true;
    roomSelectionMode = selectionMode || selectedCaidMode;
    navTo('page-4');
  });
  socket.on('room_joined', ({ roomId, selectionMode }) => {
    localStorage.setItem('g2s_room_id', roomId);
    localStorage.removeItem('g2s_saved_caid_id');
    localPlayer.caidId = null;
    caidLocked = false;
    localPlayer.isHost = false;
    roomSelectionMode = selectionMode || 'random';
    navTo('page-4');
  });
  socket.on('caid_already_taken', async ({ message }) => {
    caidLocked = false;
    localPlayer.caidId = null;
    localStorage.removeItem('g2s_saved_caid_id');
    await showAppAlert(message || "Ce Caïd vient d'être pris !", "Caïd Indisponible");
    initCarouselDOM();
  });
  socket.on('update_room_players', ({ players, isReady, maxPlayers, selectionMode }) => {
    if (selectionMode) roomSelectionMode = selectionMode;
    updateRivalsList(players);
    const countEl = document.getElementById('lobbyPlayerCount');
    if (countEl) countEl.innerText = `${players.length} / ${maxPlayers} Joueurs connectés`;
    const container = document.getElementById('lobbyPlayersContainer');
    if (container) {
      container.innerHTML = players.map((p, idx) => `
        <div class="p-3 glass-panel rounded-2xl flex items-center justify-between">
          <div><span class="font-black text-white text-xs block">${p.caidName || ('Joueur ' + (idx + 1))}</span><span class="text-[10px] font-mono text-slate-400">${p.caidId ? 'Caïd validé' : 'Sélection en cours...'}</span></div>
          <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${p.caidId ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">${p.caidId ? 'Prêt' : 'En attente'}</span>
        </div>`).join('');
    }
    const btnStart = document.getElementById('btnStartGame');
    const btnText = document.getElementById('btnStartGameText');
    const waitMsg = document.getElementById('waitingMessage');
    if (isReady) {
      waitMsg.innerText = "Tous les Caïds sont prêts !";
      if (localPlayer.isHost) {
        btnStart.disabled = false;
        btnStart.classList.remove('opacity-30', 'cursor-not-allowed');
        btnText.innerText = "Commencer La Partie";
      } else btnText.innerText = "En attente de l'Hôte...";
    } else {
      btnStart.disabled = true;
      btnStart.classList.add('opacity-30', 'cursor-not-allowed');
      btnText.innerText = `En attente (${players.filter(p=>p.caidId).length}/${maxPlayers} prêts)`;
    }
    if (document.getElementById('page-4').classList.contains('active') && !localPlayer.caidId && !isDrawingCarousel && !caidLocked) {
      initCarouselDOM();
    }
  });
  socket.on('ally_ended_turn', async ({ allyCaid }) => {
    await showAppAlert(`${allyCaid || 'Votre allié'} a terminé sa participation à votre tour.\nVous continuez seul jusqu'à la fin de votre tour.`, "🤝 Fin de l'Alliance");
  });
  socket.on('turn_skipped', async ({ allyCaid }) => {
    const withWho = allyCaid ? ` avec ${allyCaid}` : ' en alliance';
    await showAppAlert(`Votre tour est passé : vous avez déjà joué cette manche${withWho}.\n\nVous rejouerez à la manche suivante.`, "⏭️ Tour déjà joué");
  });
  socket.on('game_started', ({ round, radio, players }) => {
    updateRivalsList(players);
    currentSession.round = round;
    currentSession.currentRadioEvent = radio;
    startRoundPhase1();
  });
  socket.on('new_round_started', ({ round, radio, players }) => {
    if (players) updateRivalsList(players);
    currentSession.round = round;
    currentSession.currentRadioEvent = radio;
    localPlayer.specialUsedThisTurn = false;
    localPlayer.tempAtkMalus = 0;
    localPlayer.tempDefMalus = 0;
    localPlayer.strayDogActive = false;
    localPlayer.allianceActive = false;
    localPlayer.activeAlly = null;
    startRoundPhase1();
  });
  let lastActivePlayerToken = null;
  socket.on('turn_state_updated', ({ activePlayerToken, activeCaidName, alliedTokens, nonAggressionPacts: serverPacts, round, turnOrder }) => {
    if (serverPacts) nonAggressionPacts = serverPacts;
    renderTurnOrder(turnOrder, activePlayerToken, alliedTokens || []);
    if (activePlayerToken === myPlayerToken && lastActivePlayerToken !== myPlayerToken) notifyMyTurn(round);
    // Pot de Protéine, Balle perforante... : effets valables jusqu'à la fin du tour en cours
    if (activePlayerToken !== lastActivePlayerToken) { resetCombatModifiers(); myWeaponNullified = false; refreshHud(); }
    lastActivePlayerToken = activePlayerToken;
    activeTurnPlayerToken = activePlayerToken;
    const isAlliedNow = !!(alliedTokens && alliedTokens.includes(myPlayerToken));
    if (!isAlliedNow) {
      localPlayer.allianceActive = false;
      localPlayer.activeAlly = null;
    }
    const wasMyTurn = isMyTurnToPlay;
    isMyTurnToPlay = (activePlayerToken === myPlayerToken) || isAlliedNow;
    if (isMyTurnToPlay && !wasMyTurn) { pmSpentThisTurn = 0; refreshHud(); }
    const blocker = document.getElementById('turnBlockerOverlay');
    if (isMyTurnToPlay) blocker.classList.add('hidden');
    else {
      blocker.classList.remove('hidden');
      document.getElementById('blockerCaidName').innerText = activeCaidName || "Caïd Adverse";
    }
    syncMultiplayerTargets();
  });

  // --- ÉVÉNEMENTS DE COMBAT EN 2 PHASES & PILLAGE ---
  socket.on('combat_duel_opened', async ({ phase, role, isAlliedAttack, allyCaid, allyAtk, opponentCaid, opponentSocketId, targetMusclesCount, targetHasProstitute, targetHasStrayDog, weaponNullified }) => {
    myWeaponNullified = !!weaponNullified;
    currentDuelInfo = { phase: phase || 1, role, isAlliedAttack, allyCaid, allyAtk: allyAtk || 0, opponentCaid, opponentSocketId };
    isCombatReady = false;
    document.getElementById('combatModalHeaderTitle').innerHTML = `<i class="ph-bold ph-sword"></i> Phase 1 : Assaut Initial`;
    document.getElementById('combatTargetSelectionBox').classList.add('hidden');
    document.getElementById('btnInitiateFightAction').classList.add('hidden');
    const advTag = document.getElementById('combatAdversaryTag');
    advTag.classList.remove('hidden');
    document.getElementById('combatOpponentNameDisplay').innerText = opponentCaid;
    document.getElementById('combatOpponentForcesBar').innerText = `Lascars : ${targetMusclesCount || 0} | Escort : ${targetHasProstitute ? 'Oui' : 'Non'} | Chien : ${targetHasStrayDog ? 'Oui' : 'Non'}`;
    const allyNote = (isAlliedAttack && allyCaid) ? ` (Coordonné avec ${allyCaid})` : '';
    document.getElementById('combatLiveLog').innerHTML = `<p class="text-amber-300 font-bold">⚡ Phase 1 : Duel engagé contre ${opponentCaid}${allyNote} ! Jouez vos objets ou cliquez sur Prêt.</p>`
      + (myWeaponNullified ? `<p class="text-rose-300 font-bold">🗑️ Couvercle de poubelle adverse : votre arme compte pour 0 dans ce combat !</p>` : '');
    document.getElementById('btnToggleCombatReady').classList.remove('hidden');
    updateCombatReadyButtonUI();
    updateArenaLiveStats();
    document.getElementById('modalCombat').classList.remove('hidden');

    // J-Lo Gramme agressée : Prière Miraculeuse (50% d'annuler l'agression), 1x par manche
    if (role === 'defender' && (phase || 1) === 1 && localPlayer.caidId === 'caid_5' && !localPlayer.specialUsedThisTurn) {
      if (await showAppConfirm(`${opponentCaid} vous agresse !\n\nTenter votre 'Prière Miraculeuse' (50% d'annuler cette agression) ?`, "🙏 J-Lo Gramme")) {
        localPlayer.specialUsedThisTurn = true;
        refreshHud();
        if (Math.random() >= 0.5) {
          socket.emit('combat_prayer_cancel');
        } else {
          const log = document.getElementById('combatLiveLog');
          log.innerHTML += `<p class="text-rose-300 font-bold">🙏 PILE ! La prière échoue, le combat continue.</p>`;
          await showAppAlert("PILE ! La prière échoue : le combat continue.", "🙏 Échec");
        }
      }
    }
  });
  socket.on('combat_weapon_nullified', async ({ byCaid }) => {
    myWeaponNullified = true;
    updateArenaLiveStats();
    const log = document.getElementById('combatLiveLog');
    log.innerHTML += `<p class="text-rose-300 font-bold">🗑️ ${byCaid} a sorti un Couvercle de poubelle : votre arme compte pour 0 !</p>`;
    log.scrollTop = log.scrollHeight;
    await showAppAlert(`${byCaid} se protège avec un Couvercle de poubelle : votre arme compte pour 0 dans ce combat !`, "🗑️ Arme Neutralisée");
  });
  socket.on('combat_cancelled_by_prayer', async ({ caidName }) => {
    endSingleCombatEffects();
    closeModal('modalCombat');
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    await showAppAlert(`FACE ! ${caidName} a annulé l'agression grâce à sa Prière Miraculeuse.`, "🙏 Miracle");
  });

  socket.on('combat_waiting_defender_riposte_choice', ({ defenderCaid }) => {
    const log = document.getElementById('combatLiveLog');
    log.innerHTML += `<p class="text-sky-300 font-bold">🛡️ Votre assaut a été bloqué ! ${defenderCaid} choisit sa cible pour contre-attaquer...</p>`;
    log.scrollTop = log.scrollHeight;
  });

  socket.on('combat_choose_riposte_target', ({ targets }) => {
    const listEl = document.getElementById('riposteTargetsList');
    listEl.innerHTML = targets.map(t => `
      <button onclick="selectRiposteTarget('${t.playerToken}')" class="w-full p-3 glass-panel rounded-2xl border border-sky-500/40 flex items-center justify-between text-left hover:bg-sky-500/20">
        <div>
          <span class="text-xs font-black text-white uppercase block">${t.caidName}</span>
          <span class="text-[10px] font-mono text-sky-300">Défense actuelle : ${t.def}</span>
        </div>
        <span class="px-3 py-1 bg-rose-500 text-white font-black rounded-xl text-[10px] uppercase">Riposter</span>
      </button>
    `).join('');
    document.getElementById('modalChooseRiposteTarget').classList.remove('hidden');
  });

  socket.on('combat_not_targeted_by_riposte', async ({ defenderCaid, chosenCaid }) => {
    endSingleCombatEffects();
    closeModal('modalCombat');
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    await showAppAlert(`${defenderCaid} a repoussé votre assaut et a choisi de cibler ${chosenCaid} pour sa contre-attaque !`, "🛡️ Riposte Adverse");
  });

  socket.on('combat_phase2_started', async ({ role, opponentCaid, weaponNullified }) => {
    myWeaponNullified = !!weaponNullified;
    closeModal('modalChooseRiposteTarget');
    currentDuelInfo = { phase: 2, role, isAlliedAttack: false, allyCaid: null, allyAtk: 0, opponentCaid };
    isCombatReady = false;
    document.getElementById('combatModalHeaderTitle').innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i> Phase 2 : Contre-Attaque`;
    document.getElementById('combatOpponentNameDisplay').innerText = opponentCaid;
    updateCombatReadyButtonUI();
    updateArenaLiveStats();
    const log = document.getElementById('combatLiveLog');
    if (role === 'attacker') {
      log.innerHTML += `<p class="text-emerald-300 font-bold">🔄 Phase 2 : Vous passez à l'Attaque pour riposter contre ${opponentCaid} ! Cliquez sur Prêt.</p>`;
      if (myWeaponNullified) log.innerHTML += `<p class="text-rose-300 font-bold">🗑️ Couvercle de poubelle adverse : votre arme compte pour 0 dans ce combat !</p>`;
    } else {
      log.innerHTML += `<p class="text-rose-300 font-bold">🔄 Phase 2 : Votre assaut a échoué ! ${opponentCaid} passe à la Contre-Attaque contre votre Défense !</p>`;
    }
    log.scrollTop = log.scrollHeight;
  });

  socket.on('combat_opponent_played_items', async ({ senderCaid, itemNames }) => {
    const log = document.getElementById('combatLiveLog');
    log.innerHTML += `<p class="text-rose-300">⚠️ <strong>${senderCaid}</strong> a joué : ${itemNames.join(', ')} !</p>`;
    log.scrollTop = log.scrollHeight;
    await showAppAlert(`${senderCaid} vient d'activer : ${itemNames.join(', ')} !\nVous pouvez aussi jouer des objets.`, "⚠️ Action Adverse");
  });

  socket.on('combat_opponent_is_ready', ({ caidName }) => {
    const log = document.getElementById('combatLiveLog');
    log.innerHTML += `<p class="text-emerald-400 font-bold">✅ ${caidName || "Un combattant"} est prêt au combat !</p>`;
    log.scrollTop = log.scrollHeight;
  });

  socket.on('combat_ready_state_reset', () => { isCombatReady = false; updateCombatReadyButtonUI(); });

  socket.on('combat_finished_draw', async ({ message }) => {
    endSingleCombatEffects();
    closeModal('modalCombat');
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    refreshHud();
    await showAppAlert(message || "Match Nul !", "🤝 Match Nul");
  });

  socket.on('combat_finished_result', async ({ outcome, dmgNet, opponentCaid, isPrimaryPicker, pillageInfo }) => {
    endSingleCombatEffects();
    closeModal('modalCombat');
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;

    if (outcome === 'loser') {
      localPlayer.hearts = Math.max(0, localPlayer.hearts - 1);
      await checkHospitalStatus();
      refreshHud();
      await showAppAlert(`Vous avez perdu le combat contre ${opponentCaid} (Écart : ${dmgNet}). Vous perdez 1 Cœur et le vainqueur choisit son butin !`, "💥 Défaite");
    } else {
      refreshHud();
      if (isPrimaryPicker && pillageInfo) {
        openPillageModalUI(pillageInfo);
      } else {
        await showAppAlert(`Victoire contre ${opponentCaid} ! Votre allié sélectionne la récompense à piller.`, "🏆 Victoire");
      }
    }
  });

  socket.on('you_were_pillaged', async ({ category, amount, thiefCaid }) => {
    if (category === 'cash') {
      localPlayer.pocketCash = 0;
      refreshHud();
      await showAppAlert(`${thiefCaid} vous a dépouillé de 100% de votre Cash en poche (${amount.toLocaleString()} €) !`, "💸 Pillage Subi");
    } else if (category === 'drugs') {
      localPlayer.drugs = 0;
      refreshHud();
      await showAppAlert(`${thiefCaid} vous a dépouillé de 100% de votre Drogue en poche (${amount} kg) !`, "🌿 Pillage Subi");
    } else if (category === 'prostitute') {
      localPlayer.prostituteInTransit = null;
      refreshHud();
      await showAppAlert(`${thiefCaid} a capturé votre Prostituée en transit !`, "👠 Pillage Subi");
    }
  });

  socket.on('pillage_gain_applied', async ({ category, amount, prostituteObj, loserCaid }) => {
    if (category === 'cash') {
      localPlayer.pocketCash += (amount || 0);
      refreshHud();
      await showAppAlert(`Vous avez pris +${(amount || 0).toLocaleString()} € en cash sur ${loserCaid} !`, "💰 Butin Récupéré");
    } else if (category === 'drugs') {
      localPlayer.drugs += (amount || 0);
      refreshHud();
      await showAppAlert(`Vous avez pris +${amount || 0} kg de drogue sur ${loserCaid} !`, "🌿 Butin Récupéré");
    } else if (category === 'prostitute') {
      localPlayer.prostituteInTransit = prostituteObj || { id: 'pr_' + Date.now(), type: 'PROSTITUTE', level: 1, name: 'Prostituée L1', revenue: 1000 };
      refreshHud();
      await showAppAlert(`Vous avez récupéré la Prostituée de ${loserCaid} en transit !`, "👠 Escort Capturée");
    }
  });

  socket.on('combat_aborted', async () => {
    endSingleCombatEffects();
    closeModal('modalCombat');
    closeModal('modalCombatItemSelector');
    closeModal('modalChooseRiposteTarget');
    currentDuelInfo = null;
    await showAppAlert("Le combat a été annulé.", "Combat Interrompu");
  });

  // --- ÉVÉNEMENTS DE PARTAGE DU BUTIN EN ALLIANCE ---
  socket.on('loot_split_opened', (splitState) => {
    renderLootSplitModalUI(splitState);
    document.getElementById('modalAlliedLootSplit').classList.remove('hidden');
  });

  socket.on('loot_split_updated', (splitState) => {
    renderLootSplitModalUI(splitState);
  });

  socket.on('loot_split_completed', async ({ title, cashGained, drugsGained }) => {
    closeModal('modalAlliedLootSplit');
    localPlayer.pocketCash += (cashGained || 0);
    localPlayer.drugs += (drugsGained || 0);
    refreshHud();
    await showAppAlert(
      `Accord validé par les 2 alliés (${title}) !\nVotre part reçue : +${(cashGained || 0).toLocaleString()} € et +${drugsGained || 0} kg.`,
      "🤝 Butin Partagé"
    );
  });

  socket.on('lost_stray_dog', async ({ thiefCaid }) => {
    localPlayer.strayDogActive = false;
    await showAppAlert(`${thiefCaid} a utilisé un sifflet et vous a volé le Chien Errant !`, "🐕 Chien Errant Volé");
    refreshHud();
  });
  socket.on('stray_dog_granted', async () => {
    localPlayer.strayDogActive = true;
    await showAppAlert("Le Chien Errant vous rejoint (+2 Atk / +2 Def pour ce tour) !", "🐕 Chien Rallié");
    refreshHud();
  });
  socket.on('received_special_effect', async ({ effectType, senderCaid, senderSocketId }) => {
    if (effectType === 'siphon') {
      localPlayer.hearts = Math.max(0, localPlayer.hearts - 1);
      await checkHospitalStatus();
      await showAppAlert(`${senderCaid} vous vole 1 Cœur de Vie !`, "🩸 Siphon Vital");
    } else if (effectType === 'shuriken') {
      localPlayer.tempDefMalus = 3;
      await showAppAlert(`${senderCaid} réduit votre Défense de 3 points ce tour !`, "⭐ Shuriken");
    } else if (effectType === 'danse') {
      localPlayer.tempAtkMalus = 3;
      await showAppAlert(`${senderCaid} réduit votre Attaque de 3 points ce tour !`, "💃 Danse Lascive");
    } else if (effectType === 'steal_item') {
      if (localPlayer.inventory.length > 0) {
        const stolen = localPlayer.inventory.pop();
        await showAppAlert(`${senderCaid} vous a dérobé : ${stolen.name} !`, "🦹 Vol à la Tire");
        socket.emit('stolen_item_transferred', { targetSocketId: senderSocketId, item: stolen });
      } else await showAppAlert(`${senderCaid} a tenté de vous voler, mais votre sac est vide !`, "🦹 Vol Déjoué");
    } else if (effectType === 'swap_pos') {
      await showAppAlert(`${senderCaid} a échangé sa position avec la vôtre sur le plateau !`, "🔄 Tour de Passe-Passe");
    }
    refreshHud();
  });
  socket.on('gain_stolen_item', async ({ item }) => {
    localPlayer.inventory.push(item);
    await showAppAlert(`${item.name} a été ajouté à votre Sac !`, "🎁 Butin Dérobé");
    refreshHud();
  });
  socket.on('alliance_request_received', (data) => {
    pendingAllianceRequest = data;
    document.getElementById('allianceReqSenderName').innerText = data.senderCaid || 'Un rival';
    document.getElementById('modalAllianceRequestReceived').classList.remove('hidden');
  });
  socket.on('alliance_confirmed', async ({ allyToken, allyCaid, musclesCount, allyAtk, hasProstituteInTransit }) => {
    localPlayer.allianceActive = true;
    localPlayer.activeAlly = {
      allyToken,
      caid: allyCaid,
      grosBrasCount: musclesCount || 0,
      allyAtk: allyAtk || 1,
      hasProstituteInTransit: !!hasProstituteInTransit
    };
    syncMultiplayerTargets();
    await showAppAlert(`Alliance scellée avec ${allyCaid} !\n• Vous pouvez choisir de coordonner vos braquages & combats\n• Pacte de non-agression actif pour ce tour et le tour suivant.`, "🤝 Pacte Scellé");
  });
  socket.on('alliance_declined', async () => { await showAppAlert("Le Caïd adverse a refusé votre alliance.", "Alliance Refusée"); });
  socket.on('player_updated', (updatedPlayer) => {
    const idx = connectedRivals.findIndex(p => p.playerToken === updatedPlayer.playerToken || p.socketId === updatedPlayer.socketId);
    if (idx >= 0) connectedRivals[idx] = updatedPlayer;
    else connectedRivals.push(updatedPlayer);
    if (localPlayer.allianceActive && localPlayer.activeAlly && updatedPlayer.playerToken === localPlayer.activeAlly.allyToken) {
      localPlayer.activeAlly.grosBrasCount = updatedPlayer.musclesCount || 0;
      localPlayer.activeAlly.allyAtk = updatedPlayer.atk || 1;
      localPlayer.activeAlly.hasProstituteInTransit = !!updatedPlayer.hasProstituteInTransit;
    }
    syncMultiplayerTargets();
  });
  socket.on('error_msg', async (msg) => { await showAppAlert(msg, "Attention"); });
}
