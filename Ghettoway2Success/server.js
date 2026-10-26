const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// Change à chaque redémarrage (donc à chaque déploiement) : les clients avec une ancienne page se rechargent
const APP_VERSION = Date.now().toString(36);

let RADIO_EVENTS = [
  {
    id: "rad_police_raid",
    title: "Descente de Police massive",
    impact: "Police +2 cases en phase 3",
    desc: "La police avance de +2 cases lors de la phase 3 pour l'ensemble des Caïds.",
    effectType: "PATROL_DICE_BONUS",
    effectVal: 2
  },
  {
    id: "rad_drug_shortage",
    title: "Pénurie dans la cité",
    impact: "Yencli +1 500 € ce tour",
    desc: "Le cours du deal explose : tous les contrats Yencli rapportent +1 500 € ce tour.",
    effectType: "YENCLI_CASH_BONUS",
    effectVal: 1500
  },
  {
    id: "rad_heatwave",
    title: "Canicule Urbaine",
    impact: "Véhicules motorisés -2 PM",
    desc: "Chaleur étouffante : les véhicules motorisés perdent -2 PM pour toute cette manche.",
    effectType: "MOTOR_PM_MOD",
    effectVal: -2
  },
  {
    id: "rad_gang_war",
    title: "Guerre des Gangs",
    impact: "-30% sur toutes les armes",
    desc: "L'Armurerie liquide ses stocks : -30% sur tous les équipements offensifs ce tour.",
    effectType: "WEAPON_PRICE_MULT",
    effectVal: 0.7
  },
  {
    id: "rad_lake_fog",
    title: "Brouillard sur Le Lac",
    impact: "Le Lac infranchissable ce tour",
    desc: "Le terrain marécageux est totalement infranchissable pour l'ensemble des Caïds ce tour-ci.",
    effectType: "BOARD_RULE_ONLY",
    effectVal: 0
  }
];

try {
  const radioFilePath = path.join(__dirname, 'public', 'radio_events.json');
  if (fs.existsSync(radioFilePath)) {
    const rawRadio = fs.readFileSync(radioFilePath, 'utf8');
    const parsedRadio = JSON.parse(rawRadio);
    if (parsedRadio && Array.isArray(parsedRadio.radio_events) && parsedRadio.radio_events.length > 0) {
      RADIO_EVENTS = parsedRadio.radio_events;
    }
  }
} catch (err) {
  console.warn("Utilisation des événements radio par défaut.");
}

function checkRoomReady(room) {
  if (!room || room.players.length < 2) return false;
  return room.players.every(p => p.caidId !== null);
}

function arePlayersInNonAggressionPact(room, tokenA, tokenB) {
  if (!room || !room.nonAggressionPacts || !tokenA || !tokenB) return false;
  return room.nonAggressionPacts.some(
    pact => pact.untilRound >= room.round && pact.tokens.includes(tokenA) && pact.tokens.includes(tokenB)
  );
}

// Ordre de passage de la manche : le premier joueur se décale d'un cran à chaque manche (A B C, B C A, C A B...)
function buildRoundOrder(room) {
  const n = room.players.length;
  const start = (room.round - 1) % n;
  return room.players.map((_, i) => room.players[(start + i) % n].playerToken);
}

function getActivePlayer(room) {
  if (!room.roundOrder) return room.players[room.currentTurnIndex] || null;
  const token = room.roundOrder[room.turnPos];
  return room.players.find(p => p.playerToken === token) || null;
}

function broadcastTurnState(roomId) {
  const room = rooms[roomId];
  if (!room || !room.players.length) return;

  const activePlayer = getActivePlayer(room);
  const played = room.playedThisRoundTokens || [];
  const turnOrder = (room.roundOrder || [])
    .map(token => room.players.find(p => p.playerToken === token))
    .filter(Boolean)
    .map(p => ({ token: p.playerToken, caidName: p.caidName, played: played.includes(p.playerToken) }));

  io.to(roomId).emit('turn_state_updated', {
    activePlayerToken: activePlayer ? activePlayer.playerToken : null,
    activeCaidName: activePlayer ? activePlayer.caidName : '',
    activeSocketId: activePlayer ? activePlayer.socketId : null,
    alliedTokens: room.currentTurnAlliedTokens || [],
    nonAggressionPacts: room.nonAggressionPacts || [],
    round: room.round,
    turnOrder
  });
}

function openLootShareSession(room, roomId, sessionData) {
  room.activeLootSplit = {
    sourceType: sessionData.sourceType, // 'heist' | 'combat'
    title: sessionData.title || 'Partage du Butin',
    totalCash: sessionData.totalCash || 0,
    totalDrugs: sessionData.totalDrugs || 0,
    leftToken: sessionData.leftToken,
    rightToken: sessionData.rightToken,
    leftName: sessionData.leftName,
    rightName: sessionData.rightName,
    leftPct: 50, // part d'argent du joueur de gauche
    drugLeftPct: 50, // part de drogue du joueur de gauche
    leftAccepted: false,
    rightAccepted: false
  };

  const leftP = room.players.find(p => p.playerToken === sessionData.leftToken);
  const rightP = room.players.find(p => p.playerToken === sessionData.rightToken);
  if (leftP) io.to(leftP.socketId).emit('loot_split_opened', room.activeLootSplit);
  if (rightP) io.to(rightP.socketId).emit('loot_split_opened', room.activeLootSplit);
}

io.on('connection', (socket) => {
  socket.emit('app_version', APP_VERSION);
  socket.emit('rooms_list', getAvailableRooms());

  socket.on('reconnect_player', ({ roomId, playerToken }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('reconnect_failed');

    const existingPlayer = room.players.find(p => p.playerToken === playerToken);
    if (!existingPlayer) return socket.emit('reconnect_failed');

    existingPlayer.socketId = socket.id;
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('reconnect_success', {
      roomId,
      room,
      players: room.players,
      player: existingPlayer,
      gameStarted: room.gameStarted || false,
      round: room.round,
      radio: room.currentRadio,
      isReady: checkRoomReady(room),
      selectionMode: room.selectionMode || 'random'
    });

    io.to(roomId).emit('update_room_players', {
      players: room.players,
      isReady: checkRoomReady(room),
      maxPlayers: room.maxPlayers,
      selectionMode: room.selectionMode || 'random'
    });

    if (room.gameStarted) {
      broadcastTurnState(roomId);
    }
  });

  socket.on('create_room', ({ gameName, maxPlayers, selectionMode, playerToken }) => {
    const roomId = 'GW_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      name: gameName || 'Ghetto War #1',
      maxPlayers: Math.min(4, Math.max(2, parseInt(maxPlayers) || 4)),
      selectionMode: selectionMode === 'manual' ? 'manual' : 'random',
      hostSocketId: socket.id,
      round: 1,
      currentTurnIndex: 0,
      currentTurnAlliedTokens: [],
      nonAggressionPacts: [],
      strayDogHolderToken: null,
      activeCombat: null,
      activeLootSplit: null,
      pendingPillage: null,
      gameStarted: false,
      currentRadio: RADIO_EVENTS[0],
      players: []
    };

    const hostPlayer = {
      socketId: socket.id,
      playerToken,
      caidId: null,
      caidName: null,
      isHost: true,
      hearts: 3,
      pocketCash: 5000,
      safeCash: 0,
      drugs: 5,
      atk: 1,
      def: 0,
      musclesCount: 0,
      hasProstituteInTransit: false,
      prostituteObj: null,
      hasStrayDog: false
    };

    rooms[roomId].players.push(hostPlayer);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_created', {
      roomId,
      room: rooms[roomId],
      player: hostPlayer,
      selectionMode: rooms[roomId].selectionMode
    });
    io.emit('rooms_list', getAvailableRooms());
  });

  socket.on('join_room', ({ roomId, playerToken }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error_msg', 'Salon introuvable ou fermé.');

    const existing = room.players.find(p => p.playerToken === playerToken);
    if (existing) {
      existing.socketId = socket.id;
      socket.join(roomId);
      socket.roomId = roomId;
      socket.emit('reconnect_success', {
        roomId,
        room,
        players: room.players,
        player: existing,
        gameStarted: room.gameStarted || false,
        round: room.round,
        radio: room.currentRadio,
        isReady: checkRoomReady(room),
        selectionMode: room.selectionMode || 'random'
      });
      return io.to(roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers,
        selectionMode: room.selectionMode || 'random'
      });
    }

    if (room.players.length >= room.maxPlayers) {
      return socket.emit('error_msg', 'Ce salon est complet.');
    }

    const joiner = {
      socketId: socket.id,
      playerToken,
      caidId: null,
      caidName: null,
      isHost: false,
      hearts: 3,
      pocketCash: 5000,
      safeCash: 0,
      drugs: 5,
      atk: 1,
      def: 0,
      musclesCount: 0,
      hasProstituteInTransit: false,
      prostituteObj: null,
      hasStrayDog: false
    };

    room.players.push(joiner);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_joined', {
      roomId,
      room,
      player: joiner,
      selectionMode: room.selectionMode || 'random'
    });
    io.to(roomId).emit('update_room_players', {
      players: room.players,
      isReady: checkRoomReady(room),
      maxPlayers: room.maxPlayers,
      selectionMode: room.selectionMode || 'random'
    });
    io.emit('rooms_list', getAvailableRooms());
  });

  socket.on('assign_caid', ({ caidId, caidName, startCash, startDrug, startHearts, unarmedAtk, playerToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const alreadyTaken = room.players.some(p => p.playerToken !== playerToken && p.caidId === caidId);
    if (alreadyTaken) {
      return socket.emit('caid_already_taken', {
        message: `Le Caïd ${caidName} vient d'être sélectionné par un autre joueur !`
      });
    }

    const p = room.players.find(x => x.socketId === socket.id || x.playerToken === playerToken);
    if (p) {
      p.caidId = caidId;
      p.caidName = caidName;
      p.pocketCash = startCash;
      p.drugs = startDrug;
      p.hearts = startHearts;
      p.atk = unarmedAtk;

      socket.emit('caid_assigned_ok', { caidId, caidName });

      io.to(socket.roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers,
        selectionMode: room.selectionMode || 'random'
      });
    }
  });

  socket.on('start_game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      return socket.emit('error_msg', "Seul l'Hôte peut démarrer la partie.");
    }
    if (!checkRoomReady(room)) {
      return socket.emit('error_msg', "Au moins 2 Caïds prêts sont nécessaires pour démarrer !");
    }

    room.gameStarted = true;
    room.round = 1;
    room.currentTurnIndex = 0;
    room.roundOrder = buildRoundOrder(room);
    room.turnPos = 0;
    room.currentTurnAlliedTokens = [];
    room.playedThisRoundTokens = [];
    room.alliedWithThisRound = {};
    room.nonAggressionPacts = [];
    room.strayDogHolderToken = null;
    room.activeCombat = null;
    room.activeLootSplit = null;
    room.pendingPillage = null;
    room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];

    io.to(socket.roomId).emit('game_started', {
      round: room.round,
      radio: room.currentRadio,
      players: room.players
    });

    broadcastTurnState(socket.roomId);
  });

  socket.on('next_player_turn', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameStarted) return;

    const activePlayer = getActivePlayer(room);
    if (!activePlayer || activePlayer.socketId !== socket.id) return;

    // Le joueur actif et ses alliés du tour ont joué leur tour de la manche
    room.playedThisRoundTokens = [...new Set([
      ...(room.playedThisRoundTokens || []),
      activePlayer.playerToken,
      ...(room.currentTurnAlliedTokens || [])
    ])];

    room.currentTurnAlliedTokens = [];
    room.strayDogHolderToken = null;
    room.players.forEach(p => { p.hasStrayDog = false; });

    // Joueur suivant dans l'ordre de la manche ; on saute ceux qui ont déjà joué (en alliance pendant le tour d'un autre)
    if (!room.roundOrder) { room.roundOrder = buildRoundOrder(room); room.turnPos = room.currentTurnIndex; }
    for (let guard = 0; guard < 2 * room.players.length + 2; guard++) {
      room.turnPos++;

      if (room.turnPos >= room.roundOrder.length) {
        room.round++;
        room.playedThisRoundTokens = [];
        room.alliedWithThisRound = {};
        // Les pactes expirent à la fin de la manche qui suit celle de l'alliance
        room.nonAggressionPacts = (room.nonAggressionPacts || []).filter(p => p.untilRound >= room.round);
        room.roundOrder = buildRoundOrder(room);
        room.turnPos = 0;
        room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];
        io.to(socket.roomId).emit('new_round_started', {
          round: room.round,
          radio: room.currentRadio,
          players: room.players
        });
      }

      const next = getActivePlayer(room);
      if (!next) continue; // joueur parti
      if (room.playedThisRoundTokens.includes(next.playerToken)) {
        io.to(next.socketId).emit('turn_skipped', {
          allyCaid: (room.alliedWithThisRound || {})[next.playerToken] || null
        });
        continue;
      }
      room.currentTurnIndex = room.players.indexOf(next);
      break;
    }

    broadcastTurnState(socket.roomId);
    io.to(socket.roomId).emit('update_room_players', {
      players: room.players,
      isReady: true,
      maxPlayers: room.maxPlayers,
      selectionMode: room.selectionMode || 'random'
    });
  });

  socket.on('claim_stray_dog', ({ senderCaid, playerToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const prevToken = room.strayDogHolderToken;
    if (prevToken && prevToken !== playerToken) {
      const prevPlayer = room.players.find(p => p.playerToken === prevToken);
      if (prevPlayer) {
        prevPlayer.hasStrayDog = false;
        io.to(prevPlayer.socketId).emit('lost_stray_dog', {
          thiefCaid: senderCaid || "Un rival"
        });
      }
    }

    room.strayDogHolderToken = playerToken;
    const curPlayer = room.players.find(p => p.playerToken === playerToken);
    if (curPlayer) curPlayer.hasStrayDog = true;

    socket.emit('stray_dog_granted');

    io.to(socket.roomId).emit('update_room_players', {
      players: room.players,
      isReady: true,
      maxPlayers: room.maxPlayers,
      selectionMode: room.selectionMode || 'random'
    });
  });

  // =========================================================================
  // COMBAT DE RUE EN 2 PHASES (ASSAUT -> RIPOSTE) + CHOIX COORDONNÉ OU SOLO
  // =========================================================================
  socket.on('start_combat_engagement', ({ targetPlayerToken, targetSocketId, attackerCaid, useAlliance }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    let targetPlayer = room.players.find(p => p.playerToken === targetPlayerToken);
    if (!targetPlayer) targetPlayer = room.players.find(p => p.socketId === targetSocketId);
    const attackerPlayer = room.players.find(p => p.socketId === socket.id);

    if (!targetPlayer || !attackerPlayer) return;

    if (arePlayersInNonAggressionPact(room, attackerPlayer.playerToken, targetPlayer.playerToken)) {
      return socket.emit('error_msg', "Pacte d'Alliance actif : vous ne pouvez pas attaquer votre allié (ni durant ce tour, ni au tour suivant) !");
    }

    const canCoordinate = useAlliance === true && room.currentTurnAlliedTokens && room.currentTurnAlliedTokens.includes(attackerPlayer.playerToken);
    let allyPlayer = null;
    if (canCoordinate) {
      const allyToken = room.currentTurnAlliedTokens.find(t => t !== attackerPlayer.playerToken);
      if (allyToken && allyToken !== targetPlayer.playerToken) {
        allyPlayer = room.players.find(p => p.playerToken === allyToken);
      }
    }

    const attackerTokens = allyPlayer
      ? [attackerPlayer.playerToken, allyPlayer.playerToken]
      : [attackerPlayer.playerToken];

    const attackerDisplayNames = allyPlayer
      ? `${attackerPlayer.caidName} & ${allyPlayer.caidName}`
      : (attackerCaid || attackerPlayer.caidName || "Attaquant");

    const statsByToken = {};
    statsByToken[attackerPlayer.playerToken] = attackerPlayer.atk || 1;
    if (allyPlayer) statsByToken[allyPlayer.playerToken] = allyPlayer.atk || 1;

    const combinedMuscles = (attackerPlayer.musclesCount || 0) + (allyPlayer ? (allyPlayer.musclesCount || 0) : 0);

    room.activeCombat = {
      phase: 1,
      isAlliedAttack: !!allyPlayer,
      initialAttackerTokens: attackerTokens.slice(),
      initialDefenderToken: targetPlayer.playerToken,
      attackerTokens: attackerTokens,
      defenderToken: targetPlayer.playerToken,
      attackerCaid: attackerDisplayNames,
      targetCaid: targetPlayer.caidName || "Défenseur",
      statsByToken: statsByToken,
      readyByToken: {},
      targetDef: targetPlayer.def || 0
    };

    attackerTokens.forEach(tok => {
      const p = room.players.find(x => x.playerToken === tok);
      if (p) {
        io.to(p.socketId).emit('combat_duel_opened', {
          phase: 1,
          role: 'attacker',
          isAlliedAttack: !!allyPlayer,
          allyCaid: allyPlayer ? (tok === attackerPlayer.playerToken ? allyPlayer.caidName : attackerPlayer.caidName) : null,
          allyAtk: allyPlayer ? (tok === attackerPlayer.playerToken ? (allyPlayer.atk || 1) : (attackerPlayer.atk || 1)) : 0,
          opponentCaid: room.activeCombat.targetCaid,
          opponentSocketId: targetPlayer.socketId,
          targetMusclesCount: targetPlayer.musclesCount || 0,
          targetHasProstitute: !!targetPlayer.hasProstituteInTransit,
          targetHasStrayDog: !!targetPlayer.hasStrayDog
        });
      }
    });

    io.to(targetPlayer.socketId).emit('combat_duel_opened', {
      phase: 1,
      role: 'defender',
      isAlliedAttack: !!allyPlayer,
      allyCaid: null,
      allyAtk: 0,
      opponentCaid: room.activeCombat.attackerCaid,
      opponentSocketId: attackerPlayer.socketId,
      targetMusclesCount: combinedMuscles,
      targetHasProstitute: !!attackerPlayer.hasProstituteInTransit,
      targetHasStrayDog: !!(attackerPlayer.hasStrayDog || (allyPlayer && allyPlayer.hasStrayDog))
    });
  });

  socket.on('combat_play_items', ({ itemNames, newTotalStat }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;

    const combat = room.activeCombat;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;

    const isAttacker = combat.attackerTokens.includes(actor.playerToken);
    if (isAttacker) {
      combat.statsByToken[actor.playerToken] = newTotalStat;
    } else if (actor.playerToken === combat.defenderToken) {
      combat.targetDef = newTotalStat;
    }

    combat.readyByToken = {};

    const involvedTokens = [...combat.attackerTokens, combat.defenderToken];
    involvedTokens.forEach(tok => {
      const p = room.players.find(x => x.playerToken === tok);
      if (!p) return;
      if (p.playerToken !== actor.playerToken) {
        io.to(p.socketId).emit('combat_opponent_played_items', {
          senderCaid: actor.caidName || 'Un combattant',
          itemNames
        });
      }
      io.to(p.socketId).emit('combat_ready_state_reset');
    });
  });

  socket.on('combat_set_ready', ({ currentStat }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;

    const combat = room.activeCombat;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;

    if (combat.attackerTokens.includes(actor.playerToken)) {
      combat.statsByToken[actor.playerToken] = currentStat;
      combat.readyByToken[actor.playerToken] = true;
    } else if (actor.playerToken === combat.defenderToken) {
      combat.targetDef = currentStat;
      combat.readyByToken[actor.playerToken] = true;
    }

    const involvedTokens = [...combat.attackerTokens, combat.defenderToken];
    involvedTokens.forEach(tok => {
      if (tok !== actor.playerToken) {
        const p = room.players.find(x => x.playerToken === tok);
        if (p) io.to(p.socketId).emit('combat_opponent_is_ready', { caidName: actor.caidName });
      }
    });

    const allReady = involvedTokens.every(tok => !!combat.readyByToken[tok]);
    if (!allReady) return;

    const totalAtk = combat.attackerTokens.reduce((sum, tok) => sum + (combat.statsByToken[tok] || 1), 0);
    const totalDef = combat.targetDef || 0;
    const dmgNet = totalAtk - totalDef;

    if (combat.phase === 1) {
      if (dmgNet > 0) {
        concludeCombatWithWinner(room, socket.roomId, combat.attackerTokens, combat.defenderToken, dmgNet, combat.isAlliedAttack);
      } else {
        if (combat.attackerTokens.length > 1) {
          const defenderP = room.players.find(p => p.playerToken === combat.defenderToken);
          const targetsList = combat.attackerTokens.map(tok => {
            const p = room.players.find(x => x.playerToken === tok);
            return { playerToken: tok, caidName: p ? p.caidName : 'Allié', def: p ? (p.def || 0) : 0 };
          });
          combat.attackerTokens.forEach(tok => {
            const p = room.players.find(x => x.playerToken === tok);
            if (p) {
              io.to(p.socketId).emit('combat_waiting_defender_riposte_choice', {
                defenderCaid: defenderP ? defenderP.caidName : 'Le défenseur'
              });
            }
          });
          if (defenderP) {
            io.to(defenderP.socketId).emit('combat_choose_riposte_target', {
              targets: targetsList
            });
          }
        } else {
          startCombatPhase2Riposte(room, combat.defenderToken, combat.attackerTokens[0]);
        }
      }
    } else {
      if (dmgNet > 0) {
        concludeCombatWithWinner(room, socket.roomId, combat.attackerTokens, combat.defenderToken, dmgNet, false);
      } else {
        involvedTokens.forEach(tok => {
          const p = room.players.find(x => x.playerToken === tok);
          if (p) {
            io.to(p.socketId).emit('combat_finished_draw', {
              message: "La contre-attaque a également été bloquée ! Match nul : personne ne perd de Cœur ni d'équipement."
            });
          }
        });
        room.activeCombat = null;
      }
    }
  });

  socket.on('combat_select_riposte_target', ({ chosenTargetToken }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;
    const combat = room.activeCombat;
    const defenderP = room.players.find(p => p.socketId === socket.id);
    if (!defenderP || defenderP.playerToken !== combat.defenderToken) return;

    const unchosenToken = combat.attackerTokens.find(t => t !== chosenTargetToken);
    if (unchosenToken) {
      const unchosenP = room.players.find(p => p.playerToken === unchosenToken);
      const chosenP = room.players.find(p => p.playerToken === chosenTargetToken);
      if (unchosenP) {
        io.to(unchosenP.socketId).emit('combat_not_targeted_by_riposte', {
          defenderCaid: defenderP.caidName,
          chosenCaid: chosenP ? chosenP.caidName : 'votre allié'
        });
      }
    }

    startCombatPhase2Riposte(room, combat.defenderToken, chosenTargetToken);
  });

  function startCombatPhase2Riposte(room, newAttackerToken, newDefenderToken) {
    const newAttacker = room.players.find(p => p.playerToken === newAttackerToken);
    const newDefender = room.players.find(p => p.playerToken === newDefenderToken);
    if (!newAttacker || !newDefender) return;

    room.activeCombat = {
      phase: 2,
      isAlliedAttack: false,
      attackerTokens: [newAttackerToken],
      defenderToken: newDefenderToken,
      attackerCaid: newAttacker.caidName || 'Contre-Attaquant',
      targetCaid: newDefender.caidName || 'Cible',
      statsByToken: { [newAttackerToken]: newAttacker.atk || 1 },
      readyByToken: {},
      targetDef: newDefender.def || 0
    };

    io.to(newAttacker.socketId).emit('combat_phase2_started', {
      role: 'attacker',
      opponentCaid: newDefender.caidName,
      myStat: newAttacker.atk || 1
    });

    io.to(newDefender.socketId).emit('combat_phase2_started', {
      role: 'defender',
      opponentCaid: newAttacker.caidName,
      myStat: newDefender.def || 0
    });
  }

  function concludeCombatWithWinner(room, roomId, winnerTokens, loserToken, dmgNet, isAlliedVictory) {
    const loserP = room.players.find(p => p.playerToken === loserToken);
    if (!loserP) {
      room.activeCombat = null;
      return;
    }

    loserP.hearts = Math.max(0, (loserP.hearts || 1) - 1);

    room.pendingPillage = {
      winnerTokens: winnerTokens.slice(),
      loserToken: loserP.playerToken,
      loserCaid: loserP.caidName || 'Perdant',
      isAlliedVictory: !!isAlliedVictory,
      availableCash: loserP.pocketCash || 0,
      availableDrugs: loserP.drugs || 0,
      hasProstitute: !!loserP.hasProstituteInTransit,
      prostituteObj: loserP.prostituteObj || { level: 1, name: 'Prostituée L1', revenue: 1000 }
    };

    const winnerNames = winnerTokens
      .map(t => room.players.find(p => p.playerToken === t)?.caidName || 'Vainqueur')
      .join(' & ');

    io.to(loserP.socketId).emit('combat_finished_result', {
      outcome: 'loser',
      dmgNet,
      opponentCaid: winnerNames
    });

    const primaryWinnerToken = winnerTokens[0];
    winnerTokens.forEach(tok => {
      const wP = room.players.find(p => p.playerToken === tok);
      if (!wP) return;
      io.to(wP.socketId).emit('combat_finished_result', {
        outcome: 'winner',
        dmgNet,
        opponentCaid: loserP.caidName,
        isPrimaryPicker: (tok === primaryWinnerToken),
        pillageInfo: room.pendingPillage
      });
    });

    room.activeCombat = null;
  }

  socket.on('execute_pillage_choice', ({ category, recipientToken }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.pendingPillage) return;

    const pillage = room.pendingPillage;
    const loserP = room.players.find(p => p.playerToken === pillage.loserToken);
    const primaryWinner = room.players.find(p => p.playerToken === pillage.winnerTokens[0]);
    if (!loserP || !primaryWinner) {
      room.pendingPillage = null;
      return;
    }

    if (category === 'none') {
      room.pendingPillage = null;
      return;
    }

    if (category === 'cash') {
      const stolenCash = loserP.pocketCash || 0;
      loserP.pocketCash = 0;
      io.to(loserP.socketId).emit('you_were_pillaged', {
        category: 'cash',
        amount: stolenCash,
        thiefCaid: primaryWinner.caidName
      });

      if (pillage.isAlliedVictory && pillage.winnerTokens.length === 2 && stolenCash > 0) {
        const allyP = room.players.find(p => p.playerToken === pillage.winnerTokens[1]);
        openLootShareSession(room, socket.roomId, {
          sourceType: 'combat',
          title: `Pillage sur ${loserP.caidName} (Cash)`,
          totalCash: stolenCash,
          totalDrugs: 0,
          leftToken: primaryWinner.playerToken,
          rightToken: allyP ? allyP.playerToken : primaryWinner.playerToken,
          leftName: primaryWinner.caidName,
          rightName: allyP ? allyP.caidName : 'Allié'
        });
      } else {
        primaryWinner.pocketCash = (primaryWinner.pocketCash || 0) + stolenCash;
        io.to(primaryWinner.socketId).emit('pillage_gain_applied', {
          category: 'cash',
          amount: stolenCash,
          loserCaid: loserP.caidName
        });
      }
    } else if (category === 'drugs') {
      const stolenDrugs = loserP.drugs || 0;
      loserP.drugs = 0;
      io.to(loserP.socketId).emit('you_were_pillaged', {
        category: 'drugs',
        amount: stolenDrugs,
        thiefCaid: primaryWinner.caidName
      });

      if (pillage.isAlliedVictory && pillage.winnerTokens.length === 2 && stolenDrugs > 0) {
        const allyP = room.players.find(p => p.playerToken === pillage.winnerTokens[1]);
        openLootShareSession(room, socket.roomId, {
          sourceType: 'combat',
          title: `Pillage sur ${loserP.caidName} (Drogue)`,
          totalCash: 0,
          totalDrugs: stolenDrugs,
          leftToken: primaryWinner.playerToken,
          rightToken: allyP ? allyP.playerToken : primaryWinner.playerToken,
          leftName: primaryWinner.caidName,
          rightName: allyP ? allyP.caidName : 'Allié'
        });
      } else {
        primaryWinner.drugs = (primaryWinner.drugs || 0) + stolenDrugs;
        io.to(primaryWinner.socketId).emit('pillage_gain_applied', {
          category: 'drugs',
          amount: stolenDrugs,
          loserCaid: loserP.caidName
        });
      }
    } else if (category === 'prostitute') {
      const targetWinnerToken = recipientToken || primaryWinner.playerToken;
      const destWinner = room.players.find(p => p.playerToken === targetWinnerToken) || primaryWinner;
      const stolenPros = loserP.prostituteObj || { level: 1, name: 'Prostituée L1', revenue: 1000 };

      loserP.hasProstituteInTransit = false;
      loserP.prostituteObj = null;
      destWinner.hasProstituteInTransit = true;
      destWinner.prostituteObj = stolenPros;

      io.to(loserP.socketId).emit('you_were_pillaged', {
        category: 'prostitute',
        amount: 1,
        thiefCaid: destWinner.caidName
      });

      io.to(destWinner.socketId).emit('pillage_gain_applied', {
        category: 'prostitute',
        prostituteObj: stolenPros,
        loserCaid: loserP.caidName
      });
    }

    room.pendingPillage = null;
  });

  socket.on('combat_cancel', () => {
    const room = rooms[socket.roomId];
    if (room && room.activeCombat) {
      const involved = [...room.activeCombat.attackerTokens, room.activeCombat.defenderToken];
      involved.forEach(tok => {
        const p = room.players.find(x => x.playerToken === tok);
        if (p) io.to(p.socketId).emit('combat_aborted');
      });
      room.activeCombat = null;
    }
  });

  // =========================================================================
  // BARRE DE PARTAGE DU BUTIN EN ALLIANCE (BRAQUAGES & PILLAGES)
  // =========================================================================
  socket.on('initiate_allied_heist_split', ({ heistName, totalCash, totalDrugs, allyToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const initiator = room.players.find(p => p.socketId === socket.id);
    const ally = room.players.find(p => p.playerToken === allyToken);
    if (!initiator || !ally) return;

    openLootShareSession(room, socket.roomId, {
      sourceType: 'heist',
      title: `Braquage : ${heistName || 'Butin'}`,
      totalCash: totalCash || 0,
      totalDrugs: totalDrugs || 0,
      leftToken: initiator.playerToken,
      rightToken: ally.playerToken,
      leftName: initiator.caidName || 'Allié 1',
      rightName: ally.caidName || 'Allié 2'
    });
  });

  socket.on('update_loot_split_slider', ({ leftPct, kind }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeLootSplit) return;
    const split = room.activeLootSplit;

    const pct = Math.max(0, Math.min(100, parseInt(leftPct) || 0));
    if (kind === 'drugs') split.drugLeftPct = pct;
    else split.leftPct = pct;
    split.leftAccepted = false;
    split.rightAccepted = false;

    const leftP = room.players.find(p => p.playerToken === split.leftToken);
    const rightP = room.players.find(p => p.playerToken === split.rightToken);
    if (leftP) io.to(leftP.socketId).emit('loot_split_updated', split);
    if (rightP) io.to(rightP.socketId).emit('loot_split_updated', split);
  });

  socket.on('accept_loot_split', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeLootSplit) return;
    const split = room.activeLootSplit;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;

    if (actor.playerToken === split.leftToken) split.leftAccepted = true;
    if (actor.playerToken === split.rightToken) split.rightAccepted = true;

    const leftP = room.players.find(p => p.playerToken === split.leftToken);
    const rightP = room.players.find(p => p.playerToken === split.rightToken);

    if (split.leftAccepted && split.rightAccepted) {
      const leftCash = Math.round((split.totalCash * split.leftPct) / 100);
      const rightCash = split.totalCash - leftCash;
      const leftDrugs = Math.round((split.totalDrugs * split.drugLeftPct) / 100);
      const rightDrugs = split.totalDrugs - leftDrugs;

      if (leftP) {
        leftP.pocketCash = (leftP.pocketCash || 0) + leftCash;
        leftP.drugs = (leftP.drugs || 0) + leftDrugs;
        io.to(leftP.socketId).emit('loot_split_completed', {
          title: split.title,
          cashGained: leftCash,
          drugsGained: leftDrugs
        });
      }
      if (rightP) {
        rightP.pocketCash = (rightP.pocketCash || 0) + rightCash;
        rightP.drugs = (rightP.drugs || 0) + rightDrugs;
        io.to(rightP.socketId).emit('loot_split_completed', {
          title: split.title,
          cashGained: rightCash,
          drugsGained: rightDrugs
        });
      }

      room.activeLootSplit = null;
    } else {
      if (leftP) io.to(leftP.socketId).emit('loot_split_updated', split);
      if (rightP) io.to(rightP.socketId).emit('loot_split_updated', split);
    }
  });

  // =========================================================================
  // CAPACITÉS SPÉCIALES & ALLIANCES (AVEC IMMUNITÉ 2 TOURS)
  // =========================================================================
  socket.on('apply_special_to_target', ({ targetPlayerToken, targetSocketId, effectType, senderCaid }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const sender = room.players.find(p => p.socketId === socket.id);
    let targetP = room.players.find(p => p.playerToken === targetPlayerToken);
    if (!targetP) targetP = room.players.find(p => p.socketId === targetSocketId);
    if (!sender || !targetP) return;

    if (arePlayersInNonAggressionPact(room, sender.playerToken, targetP.playerToken)) {
      return socket.emit('error_msg', "Pacte d'Alliance actif : impossible de cibler votre allié (ni durant ce tour, ni au tour suivant) !");
    }

    io.to(targetP.socketId).emit('received_special_effect', {
      effectType,
      senderCaid,
      senderSocketId: socket.id
    });
  });

  socket.on('stolen_item_transferred', ({ targetSocketId, item }) => {
    io.to(targetSocketId).emit('gain_stolen_item', { item });
  });

  socket.on('propose_alliance', ({ targetPlayerToken, targetSocketId, senderName, musclesCount }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender) return;

    let destSocketId = targetSocketId;
    if (targetPlayerToken) {
      const targetP = room.players.find(p => p.playerToken === targetPlayerToken);
      if (targetP) destSocketId = targetP.socketId;
    }

    io.to(destSocketId).emit('alliance_request_received', {
      senderSocketId: socket.id,
      senderToken: sender.playerToken,
      senderCaid: sender.caidName || senderName,
      musclesCount: musclesCount || 0
    });
  });

  socket.on('respond_alliance', ({ accepted, senderSocketId, senderToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const responder = room.players.find(p => p.socketId === socket.id);
    const sender = room.players.find(p => p.socketId === senderSocketId || p.playerToken === senderToken);
    if (!responder || !sender) return;

    if (accepted) {
      if (!room.currentTurnAlliedTokens.includes(responder.playerToken)) {
        room.currentTurnAlliedTokens.push(responder.playerToken);
      }
      if (!room.currentTurnAlliedTokens.includes(sender.playerToken)) {
        room.currentTurnAlliedTokens.push(sender.playerToken);
      }

      room.nonAggressionPacts = room.nonAggressionPacts.filter(
        p => !(p.tokens.includes(responder.playerToken) && p.tokens.includes(sender.playerToken))
      );
      // Pour expliquer à l'allié pourquoi son propre tour sera sauté
      room.alliedWithThisRound = room.alliedWithThisRound || {};
      room.alliedWithThisRound[responder.playerToken] = sender.caidName;
      room.alliedWithThisRound[sender.playerToken] = responder.caidName;

      room.nonAggressionPacts.push({
        tokens: [sender.playerToken, responder.playerToken],
        untilRound: room.round + 1 // manche en cours + manche suivante
      });

      io.to(sender.socketId).emit('alliance_confirmed', {
        allyToken: responder.playerToken,
        allyCaid: responder.caidName,
        musclesCount: responder.musclesCount || 0,
        allyAtk: responder.atk || 1,
        hasProstituteInTransit: !!responder.hasProstituteInTransit
      });

      socket.emit('alliance_confirmed', {
        allyToken: sender.playerToken,
        allyCaid: sender.caidName || 'Caïd',
        musclesCount: sender.musclesCount || 0,
        allyAtk: sender.atk || 1,
        hasProstituteInTransit: !!sender.hasProstituteInTransit
      });

      broadcastTurnState(socket.roomId);
    } else {
      io.to(sender.socketId).emit('alliance_declined');
    }
  });

  socket.on('sync_player', (updatedData) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const p = room.players.find(x => x.socketId === socket.id);
    if (p) {
      Object.assign(p, updatedData);
      socket.to(socket.roomId).emit('player_updated', p);
    }
  });

  socket.on('leave_room', () => {
    handlePlayerDisconnect(socket);
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room && !room.gameStarted) {
      handlePlayerDisconnect(socket);
    }
  });
});

function handlePlayerDisconnect(socket) {
  const room = rooms[socket.roomId];
  if (room) {
    if (room.strayDogHolderToken) {
      const p = room.players.find(x => x.socketId === socket.id);
      if (p && p.playerToken === room.strayDogHolderToken) {
        room.strayDogHolderToken = null;
      }
    }
    room.players = room.players.filter(x => x.socketId !== socket.id);
    if (room.players.length === 0) {
      delete rooms[socket.roomId];
    } else {
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = room.players[0].socketId;
        room.players[0].isHost = true;
      }
      io.to(socket.roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers,
        selectionMode: room.selectionMode || 'random'
      });
    }
    io.emit('rooms_list', getAvailableRooms());
  }
}

function getAvailableRooms() {
  return Object.values(rooms)
    .filter(r => !r.gameStarted && r.players.length < r.maxPlayers)
    .map(r => ({
      id: r.id,
      name: r.name,
      maxPlayers: r.maxPlayers,
      connectedCount: r.players.length,
      selectionMode: r.selectionMode || 'random'
    }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur Ghettoway 2 Success actif sur le port ${PORT}`);
});
