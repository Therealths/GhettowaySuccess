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
  const isFull = room.players.length === room.maxPlayers;
  const allPicked = room.players.every(p => p.caidId !== null);
  return isFull && allPicked;
}

function broadcastTurnState(roomId) {
  const room = rooms[roomId];
  if (!room || !room.players.length) return;

  const activePlayer = room.players[room.currentTurnIndex];
  io.to(roomId).emit('turn_state_updated', {
    activePlayerToken: activePlayer ? activePlayer.playerToken : null,
    activePlayerName: activePlayer ? activePlayer.name : '',
    activeCaidName: activePlayer ? activePlayer.caidName : '',
    activeSocketId: activePlayer ? activePlayer.socketId : null,
    alliedTokens: room.currentTurnAlliedTokens || []
  });
}

io.on('connection', (socket) => {
  socket.emit('rooms_list', getAvailableRooms());

  // Reconnexion persistante
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

  // Création de salon
  socket.on('create_room', ({ gameName, playerName, maxPlayers, playerToken }) => {
    const roomId = 'GW_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      name: gameName || 'Ghetto War',
      maxPlayers: Math.min(4, Math.max(2, parseInt(maxPlayers) || 4)),
      hostSocketId: socket.id,
      round: 1,
      currentTurnIndex: 0,
      currentTurnAlliedTokens: [],
      gameStarted: false,
      currentRadio: RADIO_EVENTS[0],
      players: []
    };

    const hostPlayer = {
      socketId: socket.id,
      playerToken: playerToken,
      name: playerName || 'Grand Caïd',
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

  // Rejoindre un salon
  socket.on('join_room', ({ roomId, playerName, playerToken }) => {
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
      playerToken: playerToken,
      name: playerName || 'Rival',
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

  // Attribution du Caïd (unique par partie)
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

  // Démarrage de partie (Strictement conditionné au statut Prêt de tous)
  socket.on('start_game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      return socket.emit('error_msg', "Seul l'Hôte peut démarrer la partie.");
    }
    if (!checkRoomReady(room)) {
      return socket.emit('error_msg', "Impossible de lancer : tous les Caïds doivent être connectés et prêts !");
    }

    room.gameStarted = true;
    room.round = 1;
    room.currentTurnIndex = 0;
    room.currentTurnAlliedTokens = [];
    room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];

    io.to(socket.roomId).emit('game_started', {
      round: room.round,
      radio: room.currentRadio,
      players: room.players
    });

    broadcastTurnState(socket.roomId);
  });

  // Passer au tour suivant
  socket.on('next_player_turn', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameStarted) return;

    const activePlayer = room.players[room.currentTurnIndex];
    if (!activePlayer || activePlayer.socketId !== socket.id) {
      return; // Seul le joueur actif peut clore son tour
    }

    // Réinitialisation des alliances pour le nouveau tour
    room.currentTurnAlliedTokens = [];

    // Passage au joueur suivant
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;

    // Si la boucle est complète, on avance d'une manche avec nouveau Flash Radio
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

  // Proposition d'Alliance
  socket.on('propose_alliance', ({ targetSocketId, senderName, musclesCount }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender) return;

    io.to(targetSocketId).emit('alliance_request_received', {
      senderSocketId: socket.id,
      senderToken: sender.playerToken,
      senderName: sender.name,
      senderCaid: sender.caidName,
      musclesCount: musclesCount || 0
    });
  });

  // Réponse à la demande d'Alliance
  socket.on('respond_alliance', ({ accepted, senderSocketId, senderToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const responder = room.players.find(p => p.socketId === socket.id);
    if (!responder) return;

    if (accepted) {
      // Les deux joueurs deviennent autorisés à agir simultanément pendant ce tour
      if (!room.currentTurnAlliedTokens.includes(responder.playerToken)) {
        room.currentTurnAlliedTokens.push(responder.playerToken);
      }
      if (!room.currentTurnAlliedTokens.includes(senderToken)) {
        room.currentTurnAlliedTokens.push(senderToken);
      }

      io.to(senderSocketId).emit('alliance_confirmed', {
        allyName: responder.name,
        allyCaid: responder.caidName,
        musclesCount: responder.musclesCount || 0
      });

      socket.emit('alliance_confirmed', {
        allyName: room.players.find(p => p.socketId === senderSocketId)?.name || 'Allié',
        allyCaid: room.players.find(p => p.socketId === senderSocketId)?.caidName || 'Caïd',
        musclesCount: room.players.find(p => p.socketId === senderSocketId)?.musclesCount || 0
      });

      broadcastTurnState(socket.roomId);
    } else {
      io.to(senderSocketId).emit('alliance_declined', {
        declinerName: responder.name
      });
    }
  });

  // Synchronisation de fiche joueur
  socket.on('sync_player', (updatedData) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const p = room.players.find(x => x.socketId === socket.id);
    if (p) {
      Object.assign(p, updatedData);
      socket.to(socket.roomId).emit('player_updated', p);
    }
  });

  // Combat direct
  socket.on('execute_combat', ({ targetSocketId, dmg, totalAtk }) => {
    io.to(targetSocketId).emit('received_attack', {
      attackerSocketId: socket.id,
      dmg,
      totalAtk
    });
  });

  // Quitter la partie
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
server.listen(PORT, () => console.log(`Serveur Ghettoway opérationnel sur le port ${PORT}`));
