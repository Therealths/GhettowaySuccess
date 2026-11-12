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
  socket.on('reconnect_success', ({ roomId, player, gameStarted, round, radio, policeCars, players, selectionMode }) => {
    currentSession.policeCars = policeCars || 1;
    resumeRequested = false;
    localStorage.setItem('g2s_room_id', roomId);
    if (selectionMode) roomSelectionMode = selectionMode;
    if (player && player.caidId) {
      caidLocked = true;
      localPlayer.caidId = player.caidId;
      localPlayer.caidName = player.caidName;
      localStorage.setItem('g2s_saved_caid_id', player.caidId);
      const refCaid = CAID_ROSTER.find(c => c.id === player.caidId);
      if (refCaid && (!localPlayer.inventory || localPlayer.inventory.length === 0) && !gameStarted) {
        localPlayer.inventory = caidStartItems(refCaid);
      }
    }
    localPlayer = Object.assign(localPlayer, player);
    if (player && player.hasStrayDog !== undefined) localPlayer.strayDogActive = !!player.hasStrayDog;
    if (players) updateRivalsList(players);
    if (gameStarted) {
      currentSession.round = round || 1;
      currentSession.currentRadioEvent = radio;
      navTo('page-6');
      refreshHud();
      if (player && player.roundSeen && round > player.roundSeen) enterNewRound(round, radio);
      else informantMaybeVote();
    } else if (localPlayer.caidId) navTo('page-lobby');
    else navTo('page-4');
  });
  // Reprise demandée depuis la liste « Rejoindre » : en cas de refus, on explique pourquoi
  let resumeRequested = false;
  socket.on('reconnect_failed', ({ reason } = {}) => {
    localStorage.removeItem('g2s_room_id');
    if (!resumeRequested) return;
    resumeRequested = false;
    showAppAlert(reason === 'not_member' ? "Tu ne fais pas partie de cette partie." : "Cette partie n'existe plus.", "Reprendre la partie");
  });
  socket.on('rooms_list', (list) => {
    const container = document.getElementById('gamesListContainer');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<p class="text-xs text-slate-500 italic p-3 text-center">Aucun salon actif détecté.</p>';
    const delBtn = `<button type="button" class="w-8 h-8 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 flex items-center justify-center flex-shrink-0" aria-label="Supprimer la partie"><i class="ph-bold ph-trash text-sm"></i></button>`;
    list.forEach(r => {
      const modeBadge = r.selectionMode === 'manual' ? '👆 Au Choix' : '🎲 Aléatoire';
      const div = document.createElement('div');
      div.className = "p-3.5 glass-panel rounded-2xl flex items-center justify-between gap-2 cursor-pointer hover:border-cyan-400/40";
      if (r.isTest) {
        div.onclick = () => enterTestGame(1);
        div.innerHTML = `<div><h4 class="font-black text-xs text-white uppercase">${escapeHtml(r.name)}</h4><span class="text-[10px] text-slate-400 font-mono">Partie de test • 3 Caïds sur ce téléphone</span></div><span class="text-[10px] font-bold text-amber-300 bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-500/30">Tester</span>`;
        return container.appendChild(div);
      }
      if (r.started) {
        // Partie lancée : un appui = reprise (le serveur vérifie que notre jeton en fait partie)
        div.onclick = () => {
          resumeRequested = true;
          caidLocked = false;
          localStorage.setItem('g2s_room_id', r.id);
          socket.emit('reconnect_player', { roomId: r.id, playerToken: myPlayerToken });
        };
        const caids = (r.caids || []).map(c => escapeHtml(c.name) + (c.away ? ' 💤' : '')).join(', ');
        const badge = r.paused
          ? '<span class="text-[10px] font-bold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-500/30 whitespace-nowrap">En pause</span>'
          : '<span class="text-[10px] font-bold text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30 whitespace-nowrap">En cours</span>';
        div.innerHTML = `<div class="min-w-0"><h4 class="font-black text-xs text-white uppercase truncate">${escapeHtml(r.name)}</h4><span class="block text-[10px] text-slate-400 font-mono">Manche ${r.round || 1} • Reprendre</span><span class="block text-[10px] text-slate-300 leading-snug">${caids}</span></div><div class="flex items-center gap-2 flex-shrink-0">${badge}${delBtn}</div>`;
      } else {
        div.onclick = () => {
          caidLocked = false;
          localPlayer.caidId = null;
          localStorage.removeItem('g2s_saved_caid_id');
          localStorage.setItem('g2s_room_id', r.id);
          socket.emit('join_room', { roomId: r.id, playerToken: myPlayerToken });
        };
        div.innerHTML = `<div class="min-w-0"><h4 class="font-black text-xs text-white uppercase truncate">${escapeHtml(r.name)}</h4><span class="text-[10px] text-slate-400 font-mono">${r.connectedCount} / ${r.maxPlayers} Caïds • ${modeBadge}</span></div><div class="flex items-center gap-2 flex-shrink-0"><span class="text-[10px] font-bold text-ghetto-cyan bg-cyan-950/60 px-3 py-1 rounded-lg border border-cyan-500/30">Rejoindre</span>${delBtn}</div>`;
      }
      div.querySelector('[aria-label="Supprimer la partie"]').onclick = (e) => { e.stopPropagation(); confirmDeleteRoom(r); };
      container.appendChild(div);
    });
  });
  // Suppression définitive d'une partie (le serveur refuse si on n'en est pas joueur)
  async function confirmDeleteRoom(r) {
    if (!await showAppConfirm(`Supprimer définitivement la partie ${r.name} ?\n\nTous les Caïds et leur progression seront perdus. Cette action est irréversible.`, "🗑️ Supprimer la partie", "Supprimer", "Annuler")) return;
    socket.emit('delete_room', { roomId: r.id, playerToken: myPlayerToken });
  }
  socket.on('room_deleted', async ({ name } = {}) => {
    localStorage.removeItem('g2s_room_id');
    localStorage.removeItem('g2s_saved_caid_id');
    await showAppAlert(`La partie ${name || ''} a été supprimée par un joueur.`, "🗑️ Partie supprimée");
    window.location.reload();
  });
  // Un autre joueur a quitté la partie : on propose de quitter aussi (la partie est gardée)
  socket.on('player_left_game', async ({ caidName } = {}) => {
    if (await showAppConfirm(`${caidName || 'Un Caïd'} a quitté la partie.\n\nVeux-tu quitter aussi ? La partie est gardée : tu pourras la reprendre plus tard.`, "🚪 Départ d'un joueur", "Quitter aussi", "Continuer")) leaveGameNow();
  });
  socket.on('player_returned', ({ caidName } = {}) => {
    showAppAlert(`${caidName || 'Un Caïd'} est de retour dans la partie !`, "👋 Retour");
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
    // L'hôte a quitté le salon : le serveur a passé la main à un autre joueur
    const meInRoom = (players || []).find(p => p.playerToken === myPlayerToken);
    if (meInRoom && meInRoom.isHost !== undefined) localPlayer.isHost = !!meInRoom.isHost;
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
    await showAppAlert(`${allyCaid || 'Ton allié'} a terminé sa participation à ton tour.\nTu continues seul jusqu'à la fin de ton tour.`, "🤝 Fin de l'Alliance");
  });
  socket.on('turn_skipped', async ({ allyCaid }) => {
    // allyCaid : un nom, une liste de noms (texte) ou un tableau
    const names = Array.isArray(allyCaid) ? allyCaid : [];
    const withWho = names.length ? ` avec ${allyListNames(names)}` : (allyCaid && !Array.isArray(allyCaid) ? ` avec ${allyCaid}` : ' en alliance');
    await showAppAlert(`Ton tour est passé : tu as déjà joué cette manche${withWho}.\n\nTu rejoueras à la manche suivante.`, "⏭️ Tour déjà joué");
  });
  socket.on('game_started', ({ round, radio, policeCars, players }) => {
    currentSession.policeCars = policeCars || 1;
    updateRivalsList(players);
    currentSession.round = round;
    currentSession.currentRadioEvent = radio;
    localPlayer.roundSeen = round;
    startRoundPhase1();
  });
  socket.on('new_round_started', ({ round, radio, policeCars, players }) => {
    if (document.getElementById('page-end').classList.contains('active')) return; // partie terminée
    currentSession.policeCars = policeCars || 1;
    if (players) updateRivalsList(players);
    enterNewRound(round, radio);
  });
  // Nouvelle manche : pouvoir rechargé, malus effacés, rente et Flash Radio.
  // Aussi rejouée à la reconnexion si le téléphone était en veille au changement de manche.
  function enterNewRound(round, radio) {
    currentSession.round = round;
    currentSession.currentRadioEvent = radio;
    localPlayer.roundSeen = round;
    localPlayer.specialUsedThisTurn = false;
    localPlayer.tempAtkMalus = 0;
    localPlayer.tempDefMalus = 0;
    localPlayer.canetteDefMalus = 0;
    localPlayer.allianceActive = false;
    localPlayer.activeAllies = [];
    startRoundPhase1();
  }
  let lastActivePlayerToken = null, lastTurnId = null;
  // Une balance dans le quartier : avancement du vote, puis résultat pour tous ; le Caïd désigné est contrôlé tout de suite
  socket.on('informant_vote_progress', informantProgress);
  socket.on('informant_result', async r => {
    informantVote = { phase: 'done' };
    if (document.getElementById('page-5').classList.contains('active') && isRadioEffectActive('INFORMANT')) renderInformantVote();
    await informantResultScreen(r);
    if (r.targetToken !== myPlayerToken) return;
    if (document.getElementById('page-5').classList.contains('active')) navTo('page-6');
    await triggerPoliceInspection(true);
  });
  socket.on('turn_state_updated', ({ activePlayerToken, activeCaidName, alliedTokens, nonAggressionPacts: serverPacts, round, turnOrder, turnId }) => {
    if (serverPacts) nonAggressionPacts = serverPacts;
    renderTurnOrder(turnOrder, activePlayerToken, alliedTokens || []);
    // Nouveau tour, même si c'est encore le même joueur (à 2 : A B puis B A, B joue deux tours d'affilée)
    const newTurn = turnId ? turnId !== lastTurnId : activePlayerToken !== lastActivePlayerToken;
    lastTurnId = turnId;
    if (activePlayerToken === myPlayerToken && newTurn) notifyMyTurn(round);
    // Balle perforante, Couvercle... : effets valables jusqu'à la fin du tour en cours (le Pot de Protéine dure la manche)
    if (newTurn && !currentDuelInfo) { resetCombatModifiers(); myWeaponNullified = false; refreshHud(); }
    if (newTurn && activePlayerToken === myPlayerToken && lastActivePlayerToken === myPlayerToken) { pmSpentThisTurn = 0; pmBonusThisTurn = 0; refreshHud(); }
    lastActivePlayerToken = activePlayerToken;
    activeTurnPlayerToken = activePlayerToken;
    const isAlliedNow = !!(alliedTokens && alliedTokens.includes(myPlayerToken));
    if (!isAlliedNow) {
      localPlayer.allianceActive = false;
      localPlayer.activeAllies = [];
    } else {
      // Un allié qui a terminé sa participation ne compte plus dans les actions coordonnées
      localPlayer.activeAllies = (localPlayer.activeAllies || []).filter(a => alliedTokens.includes(a.allyToken));
    }
    const wasMyTurn = isMyTurnToPlay;
    isMyTurnToPlay = (activePlayerToken === myPlayerToken) || isAlliedNow;
    if (isMyTurnToPlay && !wasMyTurn) { pmSpentThisTurn = 0; pmBonusThisTurn = 0; refreshHud(); }
    // Fin du tour (ou de sa participation d'allié) : boutiques, coffre et paiement se ferment
    if (wasMyTurn && !isMyTurnToPlay) {
      pmBonusThisTurn = 0;
      ['modalArmoryShop', 'modalDealerShop', 'modalNightclubShop', 'modalSportclubShop', 'modalPaymentChoice', 'modalTransfer', 'grossisteScreen'].forEach(id => document.getElementById(id).classList.add('hidden'));
    }
    // Sortie d'hôpital au début de son tour, ou quand il rejoint le tour d'un allié
    if (activePlayerToken === myPlayerToken || (isMyTurnToPlay && !wasMyTurn)) checkHospitalRelease(round);
    const blocker = document.getElementById('turnBlockerOverlay');
    if (isMyTurnToPlay) blocker.classList.add('hidden');
    else {
      blocker.classList.remove('hidden');
      document.getElementById('blockerCaidName').innerText = activeCaidName || "Caïd Adverse";
    }
    syncMultiplayerTargets();
  });

  // --- ÉVÉNEMENTS DE COMBAT EN 2 PHASES & PILLAGE ---
  socket.on('combat_duel_opened', async ({ phase, role, isAlliedAttack, allyCaid, allyAtk, allies, opponentCaid, opponentSocketId, targetMusclesCount, targetHasProstitute, targetHasStrayDog, weaponNullified }) => {
    myWeaponNullified = !!weaponNullified;
    // allyCaid : noms des autres attaquants joints par « & », allies : [{ token, caidName, atk }]
    currentDuelInfo = { phase: phase || 1, role, isAlliedAttack, allyCaid, allyAtk: allyAtk || 0, allies: allies || [], opponentCaid, opponentSocketId };
    isCombatReady = false;
    fightReadyNames = new Set();
    fightWaiting = null;
    fightForces = { muscles: targetMusclesCount || 0, prostitute: !!targetHasProstitute, dog: !!targetHasStrayDog };
    const allyNote = (isAlliedAttack && allyCaid) ? ` (coordonné avec ${escapeHtml(allyCaid)})` : '';
    fightLog(`⚡ Duel engagé contre <b>${escapeHtml(opponentCaid)}</b>${allyNote} ! Joue tes objets ou clique sur Prêt.`, true);
    if (myWeaponNullified) fightLog(`🗑️ Couvercle de poubelle adverse : ton arme compte pour 0 dans ce combat !`);
    closeModal('modalCombatItemSelector');
    renderFightDuel(true);

    // J-Lo Gramme agressée : Prière Miraculeuse (50% d'annuler l'agression), 1x par manche
    if (role === 'defender' && (phase || 1) === 1 && localPlayer.caidId === 'caid_5' && !localPlayer.specialUsedThisTurn) {
      if (await showAppConfirm(`${opponentCaid} t'agresse !\n\nTenter ta 'Prière Miraculeuse' (50 % d'annuler cette agression) ?`, "🙏 J-Lo Gramme")) {
        localPlayer.specialUsedThisTurn = true;
        refreshHud();
        if (Math.random() >= 0.5) {
          socket.emit('combat_prayer_cancel');
        } else {
          fightLog(`🙏 PILE ! La prière échoue, le combat continue.`);
          await showAppAlert("PILE ! La prière échoue : le combat continue.", "🙏 Échec");
        }
      }
    }
  });
  socket.on('combat_weapon_nullified', async ({ byCaid }) => {
    myWeaponNullified = true;
    updateArenaLiveStats();
    fightLog(`🗑️ <b>${escapeHtml(byCaid)}</b> a sorti un Couvercle de poubelle : ton arme compte pour 0 !`);
    await showAppAlert(`${byCaid} se protège avec un Couvercle de poubelle : ton arme compte pour 0 dans ce combat !`, "🗑️ Arme Neutralisée");
  });
  socket.on('combat_cancelled_by_prayer', async ({ caidName }) => {
    endSingleCombatEffects();
    closeFightScreen();
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    await showAppAlert(`FACE ! ${caidName} a annulé l'agression grâce à sa Prière Miraculeuse.`, "🙏 Miracle");
  });

  // Attaque coordonnée bloquée : les attaquants attendent que le défenseur choisisse sa cible
  socket.on('combat_waiting_defender_riposte_choice', ({ defenderCaid }) => {
    closeModal('modalCombatItemSelector');
    fightWaiting = `${defenderCaid || 'Le défenseur'} choisit qui reçoit sa contre-attaque…`;
    fightLog(`🛡️ L'assaut a été bloqué ! <b>${escapeHtml(defenderCaid)}</b> choisit sa cible pour contre-attaquer…`);
    renderFightDuel(true);
  });

  socket.on('combat_choose_riposte_target', ({ targets }) => {
    closeModal('modalCombatItemSelector');
    fightRiposteTargets = targets || [];
    fightRipostePick = null;
    renderFightRiposte();
  });

  socket.on('combat_not_targeted_by_riposte', async ({ defenderCaid, chosenCaid }) => {
    endSingleCombatEffects();
    closeFightScreen();
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    fightWaiting = null;
    await showAppAlert(`${defenderCaid} a repoussé votre assaut et a choisi de cibler ${chosenCaid} pour sa contre-attaque !`, "🛡️ Riposte Adverse");
  });

  socket.on('combat_phase2_started', async ({ role, opponentCaid, weaponNullified }) => {
    myWeaponNullified = !!weaponNullified;
    currentDuelInfo = { phase: 2, role, isAlliedAttack: false, allyCaid: null, allyAtk: 0, allies: [], opponentCaid };
    isCombatReady = false;
    fightReadyNames = new Set();
    fightWaiting = null;
    const opp = (connectedRivals || []).find(r => allyRivalName(r) === opponentCaid);
    fightForces = opp ? { muscles: opp.musclesCount || 0, prostitute: !!opp.hasProstituteInTransit, dog: !!opp.hasStrayDog } : null;
    closeModal('modalCombatItemSelector');
    await msgIdle();
    if (role === 'attacker') {
      fightLog(`🔄 Phase 2 : tu passes à l'attaque pour riposter contre <b>${escapeHtml(opponentCaid)}</b> ! Clique sur Prêt.`);
      if (myWeaponNullified) fightLog(`🗑️ Couvercle de poubelle adverse : ton arme compte pour 0 dans ce combat !`);
    } else {
      fightLog(`🔄 Phase 2 : ton assaut a échoué ! <b>${escapeHtml(opponentCaid)}</b> contre-attaque contre ta défense !`);
    }
    renderFightDuel(true);
  });

  socket.on('combat_opponent_played_items', async ({ senderCaid, itemNames }) => {
    fightLog(`⚠️ <b>${escapeHtml(senderCaid)}</b> a joué : ${escapeHtml(itemNames.join(', '))} !`);
    await showAppAlert(`${senderCaid} vient d'activer : ${itemNames.join(', ')} !\nTu peux aussi jouer des objets.`, "⚠️ Action Adverse");
  });

  socket.on('combat_opponent_is_ready', ({ caidName }) => {
    if (caidName) fightReadyNames.add(caidName);
    fightLog(`✅ <b>${escapeHtml(caidName || 'Un combattant')}</b> est prêt au combat !`);
    updateCombatReadyButtonUI();
  });

  socket.on('combat_opponent_not_ready', ({ caidName }) => {
    fightReadyNames.delete(caidName);
    fightLog(`↩️ <b>${escapeHtml(caidName || 'Un combattant')}</b> n'est plus prêt.`);
    updateCombatReadyButtonUI();
  });
  socket.on('combat_ready_state_reset', () => { isCombatReady = false; fightReadyNames = new Set(); updateCombatReadyButtonUI(); });

  socket.on('combat_finished_draw', async ({ message }) => {
    const last = fightLast;
    endSingleCombatEffects();
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    refreshHud();
    await msgIdle(); // l'écran de résultat attend que les messages en cours soient lus
    await showFightDraw(message || "Match Nul !", last);
  });

  // late : message gardé par le serveur pendant qu'on était hors ligne (le Cœur perdu, le butin… sont déjà dans nos stats)
  socket.on('combat_finished_result', async ({ outcome, dmgNet, opponentCaid, isPrimaryPicker, pillageInfo, winBonus, late }) => {
    const last = fightLast;
    endSingleCombatEffects();
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    await msgIdle(); // l'écran de résultat attend que les messages en cours soient lus

    if (outcome === 'loser') {
      const heartsBefore = late ? localPlayer.hearts + 1 : localPlayer.hearts;
      if (!late) localPlayer.hearts = Math.max(0, localPlayer.hearts - 1);
      refreshHud();
      // Écran de défaite d'abord, puis l'écran Hôpital si plus aucun cœur
      await showFightDefeat({ dmgNet, opponentCaid, heartsBefore }, last);
      await checkHospitalStatus(`Combat perdu contre ${opponentCaid}`);
      refreshHud();
    } else {
      if (winBonus && !late) localPlayer.pocketCash += winBonus; // Règlement de comptes (Flash Radio)
      refreshHud();
      await showFightVictory({ dmgNet, opponentCaid, isPrimaryPicker, pillageInfo, winBonus }, last);
    }
  });

  socket.on('you_were_pillaged', async ({ category, amount, thiefCaid }) => {
    if (category === 'cash') {
      localPlayer.pocketCash = 0;
      refreshHud();
      await showAppAlert(`${thiefCaid} t'a dépouillé de 100 % de ton Cash en poche (${amount.toLocaleString()} €) !`, "💸 Pillage Subi");
    } else if (category === 'drugs') {
      localPlayer.drugs = 0;
      refreshHud();
      await showAppAlert(`${thiefCaid} t'a dépouillé de 100 % de ta Drogue en poche (${amount} kg) !`, "🌿 Pillage Subi");
    } else if (category === 'prostitute') {
      localPlayer.prostituteInTransit = null;
      refreshHud();
      await showAppAlert(`${thiefCaid} a capturé ta Prostituée en transit !`, "👠 Pillage Subi");
    }
  });

  socket.on('pillage_gain_applied', async ({ category, amount, prostituteObj, loserCaid, late }) => {
    if (category === 'cash') {
      if (!late) localPlayer.pocketCash += (amount || 0);
      refreshHud();
      await showAppAlert(`Tu as pris +${(amount || 0).toLocaleString()} € en cash sur ${loserCaid} !`, "💰 Butin Récupéré");
    } else if (category === 'drugs') {
      if (!late) localPlayer.drugs += (amount || 0);
      refreshHud();
      await showAppAlert(`Tu as pris +${amount || 0} kg de drogue sur ${loserCaid} !`, "🌿 Butin Récupéré");
    } else if (category === 'prostitute') {
      localPlayer.prostituteInTransit = prostituteObj || { id: 'pr_' + Date.now(), type: 'PROSTITUTE', level: 1, name: 'Prostituée Niv. 1', revenue: 1000 };
      refreshHud();
      await showAppAlert(`Tu as récupéré la Prostituée de ${loserCaid} en transit !`, "👠 Escort Capturée");
    }
  });

  socket.on('combat_aborted', async () => {
    endSingleCombatEffects();
    closeFightScreen();
    closeModal('modalCombatItemSelector');
    currentDuelInfo = null;
    fightWaiting = null;
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

  socket.on('loot_split_completed', async ({ title, cashGained, drugsGained, late }) => {
    closeModal('modalAlliedLootSplit');
    if (!late) { // late : part déjà créditée par le serveur pendant l'absence
      localPlayer.pocketCash += (cashGained || 0);
      localPlayer.drugs += (drugsGained || 0);
    }
    refreshHud();
    await showAppAlert(
      `Accord validé par les 2 alliés (${title}) !\nVotre part reçue : +${(cashGained || 0).toLocaleString()} € et +${drugsGained || 0} kg.`,
      "🤝 Butin Partagé"
    );
  });

  socket.on('lost_stray_dog', async ({ thiefCaid }) => {
    localPlayer.strayDogActive = false;
    refreshHud();
    await showAppAlert(`${thiefCaid} a utilisé un sifflet et t'a volé le Chien Errant !`, "🐕 Chien Errant Volé");
  });
  socket.on('stray_dog_granted', async () => {
    localPlayer.strayDogActive = true;
    refreshHud();
    if (dogFromCard) { dogFromCard = false; return; } // déjà montré par la carte jouée
    await showAppAlert("Le Chien Errant te rejoint (+2 Atk / +2 Def) !\nIl reste avec toi jusqu'à ce qu'un autre joueur le siffle.", "🐕 Chien Rallié");
  });
  socket.on('received_special_effect', async ({ effectType, senderCaid, senderSocketId, senderToken, late, round, turnToken, loot }) => {
    // Malus reçu hors ligne pendant une manche déjà terminée : il ne compte plus
    if (late && round && round < (currentSession.round || 1) && ['shuriken', 'danse', 'canette'].includes(effectType)) return;
    // K.O. subi hors ligne : rattaché au tour où il a eu lieu (soigné au début de son prochain tour, pas de fin de tour)
    // (le cœur a déjà été retiré par le serveur : l'état rendu à la reconnexion en tient compte)
    if (late && effectType === 'siphon' && localPlayer.hearts <= 0 && !localPlayer.inHospital) {
      localPlayer.hearts = 0;
      localPlayer.inHospital = { round: round || currentSession.round || 1, turnToken: turnToken || null };
      refreshHud();
      await msgIdle();
      await showPowerHit(effectType, senderCaid, null);
      if (isMyTurnToPlay) checkHospitalRelease(currentSession.round); // déjà son tour : il est soigné maintenant
      return;
    }
    let stolen = null;
    if (effectType === 'siphon' && !late) localPlayer.hearts = Math.max(0, localPlayer.hearts - 1);
    else if (effectType === 'shuriken') localPlayer.tempDefMalus = 3;
    else if (effectType === 'danse') localPlayer.tempAtkMalus = 3;
    else if (effectType === 'canette') {
      localPlayer.canetteDefMalus = (localPlayer.canetteDefMalus || 0) + 1;
      if (currentDuelInfo) { fightLog(`🥫 <b>${escapeHtml(senderCaid)}</b> t'a lancé une vieille canette : −1 Défense jusqu'à la fin de la manche !`); updateArenaLiveStats(); }
    }
    else if (effectType === 'crowbar') {
      // Pied de biche : le serveur a déjà pris le butin dans mon coffre
      // (hors ligne, l'état rendu à la reconnexion en tient déjà compte : on ne retire rien une 2e fois)
      stolen = { cash: (loot && loot.cash) || 0, kg: (loot && loot.kg) || 0 };
      if (!late) {
        localPlayer.safeCash = Math.max(0, localPlayer.safeCash - stolen.cash);
        localPlayer.safeDrugs = Math.max(0, localPlayer.safeDrugs - stolen.kg);
      }
    }
    else if (effectType === 'steal_item') {
      // Le serveur a déjà pris l'objet dans mon Sac (hors ligne, l'état rendu à la reconnexion en tient compte)
      stolen = (loot && loot.item) || null;
      const i = stolen && !late ? localPlayer.inventory.findIndex(it => it && it.id === stolen.id) : -1;
      if (i >= 0) localPlayer.inventory.splice(i, 1);
    }
    refreshHud();
    await msgIdle(); // « Touché ! » après les messages déjà ouverts
    await showPowerHit(effectType, senderCaid, stolen);
    if (effectType === 'siphon') await checkHospitalStatus(`Siphon Vital de ${senderCaid}`);
    refreshHud();
  });
  socket.on('crowbar_opened', safe => {
    if (!showCrowbarSafe(safe)) socket.emit('crowbar_take', { kg: 0 }); // écran fermé entre-temps : on prend l'argent
  });
  socket.on('gain_crowbar_loot', async ({ cash, kg, targetCaid }) => {
    localPlayer.pocketCash += cash || 0;
    localPlayer.drugs += kg || 0;
    refreshHud();
    buzz(cash || kg ? [50, 40, 120] : 40); // vol réussi (ou coffre vide)
    // Résultat affiché sur l'écran du Pied de biche s'il est ouvert, sinon en message
    if (showCrowbarResult({ cash, kg })) return;
    await showAppAlert(cash || kg ? `${crowbarLabel({ cash, kg })} pris dans le coffre de ${targetCaid}, direct sur toi !` : `Le coffre de ${targetCaid} était vide… Rien à prendre.`, "🛠️ Pied de biche");
  });
  // Faire les poches : « raté » sur l'écran du pouvoir si son Sac était vide, sinon la carte dérobée en grand
  socket.on('steal_result', async ({ item, targetCaid }) => {
    if (!item) {
      if (showStealMissed(targetCaid)) return;
      return showAppAlert(`Le Sac de ${targetCaid} était vide… Rien à prendre.`, "🫳 Raté");
    }
    localPlayer.inventory.push(item);
    refreshHud();
    await new Promise(r => setTimeout(r, 900)); // le temps de voir la main filer vers lui
    closePowerScreen();
    await showCardPlayed(item, [['ph-backpack', 'Rangée dans ton Sac', `volée à ${escapeHtml(targetCaid)}`]], item.name, { kicker: 'Carte dérobée', stamp: 'ph-hand-grabbing' });
  });
  // Alliance : écrans plein page (js/alliance.js)
  socket.on('alliance_request_received', (data) => { if (data) showAllianceRequest(data); });
  socket.on('alliance_request_status', (data) => { onAllianceRequestStatus(data); });
  socket.on('alliance_confirmed', (data) => {
    if (!data) return;
    // Mes alliés du tour (moi exclu)
    localPlayer.allianceActive = true;
    localPlayer.activeAllies = (data.members || []).filter(m => m.token !== myPlayerToken).map(m => ({
      allyToken: m.token,
      caid: m.caidName,
      caidId: m.caidId,
      grosBrasCount: m.musclesCount || 0,
      allyAtk: m.atk || 1,
      hasProstituteInTransit: !!m.hasProstituteInTransit
    }));
    showAllianceSealed(data);
    if (typeof syncMultiplayerTargets === 'function') syncMultiplayerTargets();
    if (typeof refreshHud === 'function') refreshHud();
  });
  socket.on('alliance_declined', (data) => { showAllianceRefused(data || {}); });
  socket.on('game_over', showGameOver);
  socket.on('player_updated', (updatedPlayer) => {
    const idx = connectedRivals.findIndex(p => p.playerToken === updatedPlayer.playerToken || p.socketId === updatedPlayer.socketId);
    if (idx >= 0) connectedRivals[idx] = updatedPlayer;
    else connectedRivals.push(updatedPlayer);
    const ally = localPlayer.allianceActive && (localPlayer.activeAllies || []).find(a => a.allyToken === updatedPlayer.playerToken);
    if (ally) {
      ally.grosBrasCount = updatedPlayer.musclesCount || 0;
      ally.allyAtk = updatedPlayer.atk || 1;
      ally.hasProstituteInTransit = !!updatedPlayer.hasProstituteInTransit;
    }
    syncMultiplayerTargets();
  });
  socket.on('error_msg', async (msg) => { await showAppAlert(msg, "Attention"); });
}
