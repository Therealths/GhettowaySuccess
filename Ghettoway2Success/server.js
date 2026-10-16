const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Distribution des fichiers statiques (index.html, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Stockage en mémoire vive des salons de jeu
const rooms = {};

// Événements Flash Radio de la Phase 1 [1]
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

io.on('connection', (socket) => {
  // Envoi de la liste des salons disponibles au nouveau client
  socket.emit('rooms_list', getAvailableRooms());

  // 1. Création d'un salon (Hôte) [1]
  socket.on('create_room', ({ gameName, playerName, maxPlayers }) => {
    const roomId = 'GW_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      name: gameName || 'Ghetto War',
      maxPlayers: Math.min(4, Math.max(2, parseInt(maxPlayers) || 4)),
      hostSocketId: socket.id,
      round: 1,
      currentRadio: RADIO_EVENTS[0],
      players: []
    };

    const hostPlayer = {
      socketId: socket.id,
      name: playerName || 'Grand Caïd',
      caidId: null,
      caidName: 'En attente',
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

  // 2. Rejoindre un salon existant [1]
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit('error_msg', 'Salon introuvable ou fermé.');
    }
    if (room.players.length >= room.maxPlayers) {
      return socket.emit('error_msg', 'Ce salon est complet (maximum 4 joueurs).');
    }

    const joiner = {
      socketId: socket.id,
      name: playerName || 'Rival',
      caidId: null,
      caidName: 'En attente',
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
    io.to(roomId).emit('update_room_players', room.players);
    io.emit('rooms_list', getAvailableRooms());
  });

  // 3. Attribution du Caïd tiré avec verrouillage strict anti-doublon
  socket.on('assign_caid', ({ caidId, caidName, startCash, startDrug, startHearts, unarmedAtk }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    // Vérification : aucun autre joueur ne doit posséder cet identifiant de Caïd
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

      // Diffusion de la mise à jour à l'ensemble du salon
      io.to(socket.roomId).emit('update_room_players', room.players);
    }
  });

  // 4. Lancement de la partie par l'Hôte [1]
  socket.on('start_game', () => {
    const room = rooms[socket.roomId];
    if (room && room.hostSocketId === socket.id) {
      room.round = 1;
      room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];
      io.to(socket.roomId).emit('game_started', {
        round: room.round,
        radio: room.currentRadio,
        players: room.players
      });
    }
  });

  // 5. Synchronisation de l'état d'un joueur en direct (inventaire, stats, PV, cash)
  socket.on('sync_player', (updatedData) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const p = room.players.find(x => x.socketId === socket.id);
    if (p) {
      Object.assign(p, updatedData);
      socket.to(socket.roomId).emit('player_updated', p);
    }
  });

  // 6. Combat en direct contre un rival connecté [1]
  socket.on('execute_combat', ({ targetSocketId, dmg, totalAtk }) => {
    io.to(targetSocketId).emit('received_attack', {
      attackerSocketId: socket.id,
      dmg,
      totalAtk
    });
  });

  // 7. Proposition et confirmation d'alliance [1]
  socket.on('propose_alliance', ({ targetSocketId, senderName, musclesCount }) => {
    io.to(targetSocketId).emit('alliance_received', {
      senderSocketId: socket.id,
      senderName,
      musclesCount
    });
  });

  // 8. Gestion des déconnexions et réattribution du rôle d'Hôte
  socket.on('disconnect', () => {
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
        io.to(socket.roomId).emit('update_room_players', room.players);
      }
      io.emit('rooms_list', getAvailableRooms());
    }
  });
});

// Récupération des salons non complets pour affichage public
function getAvailableRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    maxPlayers: r.maxPlayers,
    connectedCount: r.players.length
  }));
}

// Démarrage du serveur sur le port attribué par Render ou 3000 en local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur Ghettoway opérationnel sur le port ${PORT}`);
});
