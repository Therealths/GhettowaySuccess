const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const RADIO_EVENTS = [
  {
    title: "Descente de Police massive",
    impact: "Police +2 cases en phase 3",
    desc: "La police avance de +2 cases lors de la phase 3 pour l'ensemble des Caïds."
  },
  {
    title: "Pénurie dans la cité",
    impact: "Yencli +1 500 € ce tour",
    desc: "Le cours du deal explose : tous les contrats Yencli rapportent +1 500 € ce tour."
  },
  {
    title: "Canicule Urbaine",
    impact: "Véhicules motorisés -2 PM",
    desc: "Chaleur étouffante : les véhicules motorisés perdent -2 PM pour toute cette manche."
  },
  {
    title: "Guerre des Gangs",
    impact: "-30% sur toutes les armes",
    desc: "L'Armurerie liquide ses stocks : -30% sur tous les équipements offensifs ce tour."
  },
  {
    title: "Brouillard sur Le Lac",
    impact: "Le Lac infranchissable ce tour",
    desc: "Le terrain marécageux est totalement infranchissable pour l'ensemble des Caïds ce tour-ci."
  }
];

function checkRoomReady(room) {
  if (!room) return false;
  return room.players.length === room.maxPlayers && room.players.every(p => p.caidId !== null);
}

function broadcastTurnState(roomId) {
  const room = rooms[roomId];
  if (!room || !room.players.length) return;

  const activePlayer = room.players[room.currentTurnIndex];
  io.to(roomId).emit('turn_state_updated', {
    activePlayerToken: activePlayer ? activePlayer.playerToken : null,
    activeCaidName: activePlayer ? activePlayer.caidName : '',
    activeSocketId: activePlayer ? activePlayer.socketId : null,
    alliedTokens: room.currentTurnAlliedTokens || []
  });
}

io.on('connection', (socket) => {
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
      player: existingPlayer,
      gameStarted: room.gameStarted || false,
      round: room.round,
      radio: room.currentRadio,
      isReady: checkRoomReady(room)
    });

    io.to(roomId).emit('update_room_players', {
      players: room.players,
      isReady: checkRoomReady(room),
      maxPlayers: room.maxPlayers
    });

    if (room.gameStarted) {
      broadcastTurnState(roomId);
    }
  });

  socket.on('create_room', ({ gameName, maxPlayers, playerToken }) => {
    const roomId = 'GW_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      name: gameName || 'Ghetto War #1',
      maxPlayers: Math.min(4, Math.max(2, parseInt(maxPlayers) || 4)),
      hostSocketId: socket.id,
      round: 1,
      currentTurnIndex: 0,
      currentTurnAlliedTokens: [],
      strayDogHolderSocketId: null,
      activeCombat: null,
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
      musclesCount: 0
    };

    rooms[roomId].players.push(hostPlayer);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_created', { roomId, room: rooms[roomId], player: hostPlayer });
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
        player: existing,
        gameStarted: room.gameStarted || false,
        round: room.round,
        radio: room.currentRadio,
        isReady: checkRoomReady(room)
      });
      return io.to(roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers
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
      musclesCount: 0
    };

    room.players.push(joiner);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_joined', { roomId, room, player: joiner });
    io.to(roomId).emit('update_room_players', {
      players: room.players,
      isReady: checkRoomReady(room),
      maxPlayers: room.maxPlayers
    });
    io.emit('rooms_list', getAvailableRooms());
  });

  socket.on('assign_caid', ({ caidId, caidName, startCash, startDrug, startHearts, unarmedAtk }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const alreadyTaken = room.players.some(p => p.socketId !== socket.id && p.caidId === caidId);
    if (alreadyTaken) {
      return socket.emit('error_msg', `Le Caïd ${caidName} est déjà pris par un autre joueur.`);
    }

    const p = room.players.find(x => x.socketId === socket.id);
    if (p) {
      p.caidId = caidId;
      p.caidName = caidName;
      p.name = caidName;
      p.pocketCash = startCash;
      p.drugs = startDrug;
      p.hearts = startHearts;
      p.atk = unarmedAtk;

      io.to(socket.roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers
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
      return socket.emit('error_msg', "Impossible de lancer : tous les Caïds doivent être prêts !");
    }

    room.gameStarted = true;
    room.round = 1;
    room.currentTurnIndex = 0;
    room.currentTurnAlliedTokens = [];
    room.strayDogHolderSocketId = null;
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

    const activePlayer = room.players[room.currentTurnIndex];
    if (!activePlayer || activePlayer.socketId !== socket.id) return;

    room.currentTurnAlliedTokens = [];
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;

    if (room.currentTurnIndex === 0) {
      room.round++;
      room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];
      io.to(socket.roomId).emit('new_round_started', {
        round: room.round,
        radio: room.currentRadio
      });
    }

    broadcastTurnState(socket.roomId);
  });

  // --- LOGIQUE DU CHIEN ERRANT : LE DERNIER QUI SIFFLE LE PREND / VOLE ---
  socket.on('claim_stray_dog', ({ senderCaid }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const previousHolderSocketId = room.strayDogHolderSocketId;
    if (previousHolderSocketId && previousHolderSocketId !== socket.id) {
      // Vole le chien au propriétaire précédent et l'avertit
      io.to(previousHolderSocketId).emit('lost_stray_dog', {
        thiefCaid: senderCaid || "Un rival"
      });
    }

    room.strayDogHolderSocketId = socket.id;
    socket.emit('stray_dog_granted');
  });

  // --- LOGIQUE COMBAT TEMPS RÉEL INTERACTIF (OBJETS EN DUEL) ---
  socket.on('start_combat_engagement', ({ targetSocketId, attackerCaid }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const targetPlayer = room.players.find(p => p.socketId === targetSocketId);
    const attackerPlayer = room.players.find(p => p.socketId === socket.id);

    room.activeCombat = {
      attackerSocketId: socket.id,
      targetSocketId,
      attackerCaid: attackerCaid || (attackerPlayer ? attackerPlayer.caidName : "Attaquant"),
      targetCaid: targetPlayer ? targetPlayer.caidName : "Défenseur",
      attackerReady: false,
      targetReady: false,
      attackerAtk: 1,
      targetDef: 0,
      attackerItems: [],
      targetItems: []
    };

    // Ouvre l'interface de combat chez les deux joueurs
    socket.emit('combat_duel_opened', {
      role: 'attacker',
      opponentCaid: room.activeCombat.targetCaid,
      opponentSocketId: targetSocketId
    });

    io.to(targetSocketId).emit('combat_duel_opened', {
      role: 'defender',
      opponentCaid: room.activeCombat.attackerCaid,
      opponentSocketId: socket.id
    });
  });

  // Un joueur joue un ou plusieurs objets pendant le combat
  socket.on('combat_play_items', ({ itemNames, newTotalStat }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;

    const combat = room.activeCombat;
    const isAttacker = (socket.id === combat.attackerSocketId);
    const opponentSocketId = isAttacker ? combat.targetSocketId : combat.attackerSocketId;
    const actorCaid = isAttacker ? combat.attackerCaid : combat.targetCaid;

    if (isAttacker) {
      combat.attackerItems.push(...itemNames);
      combat.attackerAtk = newTotalStat;
      combat.attackerReady = false; // Réinitialise l'état prêt pour relancer l'échange
      combat.targetReady = false;
    } else {
      combat.targetItems.push(...itemNames);
      combat.targetDef = newTotalStat;
      combat.targetReady = false;
      combat.attackerReady = false;
    }

    // Informe l'adversaire des cartes jouées
    io.to(opponentSocketId).emit('combat_opponent_played_items', {
      senderCaid: actorCaid,
      itemNames
    });

    // Signale aux deux joueurs que les états prêts ont été réinitialisés
    io.to(combat.attackerSocketId).emit('combat_ready_state_reset');
    io.to(combat.targetSocketId).emit('combat_ready_state_reset');
  });

  // Un joueur clique sur "Prêt au combat"
  socket.on('combat_set_ready', ({ currentStat }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;

    const combat = room.activeCombat;
    const isAttacker = (socket.id === combat.attackerSocketId);

    if (isAttacker) {
      combat.attackerReady = true;
      combat.attackerAtk = currentStat;
    } else {
      combat.targetReady = true;
      combat.targetDef = currentStat;
    }

    const opponentSocketId = isAttacker ? combat.targetSocketId : combat.attackerSocketId;
    io.to(opponentSocketId).emit('combat_opponent_is_ready');

    // Les deux joueurs sont prêts : résolution immédiate du combat !
    if (combat.attackerReady && combat.targetReady) {
      const dmgNet = combat.attackerAtk - combat.targetDef;
      const success = dmgNet > 0;

      io.to(combat.attackerSocketId).emit('combat_finished_result', {
        success,
        dmgNet: Math.max(0, dmgNet),
        isAttacker: true,
        opponentCaid: combat.targetCaid
      });

      io.to(combat.targetSocketId).emit('combat_finished_result', {
        success: !success, // Si l'attaque a échoué, le défenseur a réussi son blocage
        dmgNet: Math.max(0, dmgNet),
        isAttacker: false,
        opponentCaid: combat.attackerCaid
      });

      room.activeCombat = null;
    }
  });

  socket.on('combat_cancel', () => {
    const room = rooms[socket.roomId];
    if (room && room.activeCombat) {
      io.to(room.activeCombat.attackerSocketId).emit('combat_aborted');
      io.to(room.activeCombat.targetSocketId).emit('combat_aborted');
      room.activeCombat = null;
    }
  });

  socket.on('apply_special_to_target', ({ targetSocketId, effectType, senderCaid }) => {
    io.to(targetSocketId).emit('received_special_effect', {
      effectType,
      senderCaid,
      senderSocketId: socket.id
    });
  });

  socket.on('stolen_item_transferred', ({ targetSocketId, item }) => {
    io.to(targetSocketId).emit('gain_stolen_item', { item });
  });

  socket.on('propose_alliance', ({ targetSocketId, senderName, musclesCount }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender) return;

    io.to(targetSocketId).emit('alliance_request_received', {
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
    if (!responder) return;

    if (accepted) {
      if (!room.currentTurnAlliedTokens.includes(responder.playerToken)) {
        room.currentTurnAlliedTokens.push(responder.playerToken);
      }
      if (!room.currentTurnAlliedTokens.includes(senderToken)) {
        room.currentTurnAlliedTokens.push(senderToken);
      }

      io.to(senderSocketId).emit('alliance_confirmed', {
        allyCaid: responder.caidName,
        musclesCount: responder.musclesCount || 0
      });

      socket.emit('alliance_confirmed', {
        allyCaid: room.players.find(p => p.socketId === senderSocketId)?.caidName || 'Caïd',
        musclesCount: room.players.find(p => p.socketId === senderSocketId)?.musclesCount || 0
      });

      broadcastTurnState(socket.roomId);
    } else {
      io.to(senderSocketId).emit('alliance_declined');
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
    if (room.strayDogHolderSocketId === socket.id) {
      room.strayDogHolderSocketId = null;
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
        maxPlayers: room.maxPlayers
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
      connectedCount: r.players.length
    }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur Ghettoway 2 Success actif sur le port ${PORT}`);
});
