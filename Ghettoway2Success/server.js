const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// L'ancien hébergement Render renvoie vers le jeu hébergé sur le PC (Render définit RENDER automatiquement)
const REDIRECT_TO = process.env.RENDER ? 'https://thomscode.tail3e6d13.ts.net:10000' : null;
if (REDIRECT_TO) app.use((req, res) => res.redirect(302, REDIRECT_TO + req.originalUrl));

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// Sauvegarde des parties sur disque toutes les 3 s (si elles ont changé), rechargées au démarrage :
// une partie survit ainsi à un redémarrage du serveur. Les parties inactives depuis 3 jours sont retirées,
// et celles qui étaient terminées sont gardées dans l'historique.
const DATA_DIR = process.env.GAME_DATA_DIR || path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'parties.json');
const HISTORY_FILE = path.join(DATA_DIR, 'historique.json');
const ROOM_MAX_IDLE_MS = 3 * 24 * 3600 * 1000;
const roomSnapshots = {};
let lastSavedJson = '';

function writeJsonAtomic(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file + '.tmp', data);
  fs.renameSync(file + '.tmp', file);
}

function loadSavedRooms() {
  try {
    const saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    Object.assign(rooms, saved);
    console.log(`${Object.keys(saved).length} partie(s) rechargée(s) depuis la sauvegarde`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Sauvegarde illisible :', e.message);
  }
}

function archiveFinishedRoom(roomId, room) {
  if (!room.gameOver) return;
  let history = [];
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) {}
  history.push({ roomId, gameName: room.gameName, endedAt: room.lastActivity, ...room.gameOver });
  writeJsonAtomic(HISTORY_FILE, JSON.stringify(history, null, 1));
}

function saveRooms() {
  const now = Date.now();
  for (const [roomId, room] of Object.entries(rooms)) {
    const snap = JSON.stringify(room);
    if (snap !== roomSnapshots[roomId]) {
      room.lastActivity = now;
      roomSnapshots[roomId] = JSON.stringify(room);
    }
    if (roomId !== TEST_ROOM_ID && now - room.lastActivity > ROOM_MAX_IDLE_MS) {
      archiveFinishedRoom(roomId, room);
      delete rooms[roomId];
      delete roomSnapshots[roomId];
    }
  }
  const json = JSON.stringify(rooms);
  if (json === lastSavedJson) return;
  try {
    writeJsonAtomic(SAVE_FILE, json);
    lastSavedJson = json;
  } catch (e) {
    console.error('Échec de la sauvegarde :', e.message);
  }
}

if (!REDIRECT_TO) {
  loadSavedRooms();
  setInterval(saveRooms, 3000);
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { saveRooms(); process.exit(0); });
}
// Fin de partie : le premier Caïd qui réunit cette somme (poche + coffre) gagne
const WIN_CASH = 100000;

function buildStandings(room) {
  return room.players
    .map(p => ({
      playerToken: p.playerToken,
      caidId: p.caidId,
      caidName: p.caidName || 'Caïd',
      fortune: (p.pocketCash || 0) + (p.safeCash || 0),
      drugs: (p.drugs || 0) + (p.safeDrugs || 0),
      combatWins: p.combatWins || 0,
      combatLosses: p.combatLosses || 0,
      arrests: p.arrests || 0
    }))
    .sort((a, b) => b.fortune - a.fortune);
}

function checkVictory(room, roomId) {
  if (!room.gameStarted || room.gameOver) return;
  const winner = room.players.find(p => (p.pocketCash || 0) + (p.safeCash || 0) >= WIN_CASH);
  if (!winner) return;
  room.gameOver = { winnerToken: winner.playerToken, round: room.round, standings: buildStandings(room) };
  io.to(roomId).emit('game_over', room.gameOver);
}

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

// Partie de test permanente : 3 joueurs déjà lancés, pilotables depuis un seul téléphone
const TEST_ROOM_ID = 'TEST';
const TEST_PLAYERS = [
  { playerToken: 'tok_test_1', caidId: 'caid_1', caidName: 'Burger Queen', inventory: [{ id: 'kebab_1', type: 'CONSUMABLE', name: 'Kebab', desc: 'Restaure 1 Cœur de Vie' }] },
  { playerToken: 'tok_test_2', caidId: 'caid_7', caidName: 'Jamel Pépouze', inventory: [{ id: 'armor_jamel', type: 'ARMOR', name: 'Gilet pare-balles usagé', price: 2000, bonusVal: 1, bonusLabel: '+1 Défense', desc: 'Confère +1 en Défense' }] },
  { playerToken: 'tok_test_3', caidId: 'caid_5', caidName: 'J-Lo Gramme', inventory: [] }
];

function createTestRoom() {
  const room = {
    id: TEST_ROOM_ID,
    name: 'test',
    maxPlayers: 3,
    selectionMode: 'manual',
    hostSocketId: null,
    round: 1,
    currentTurnIndex: 0,
    currentTurnAlliedTokens: [],
    nonAggressionPacts: [],
    strayDogHolderToken: null,
    activeCombat: null,
    activeLootSplit: null,
    activeGroupSplit: null,
    pendingAlliance: null,
    pendingPillage: null,
    gameStarted: true,
    currentRadio: RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)],
    isTestRoom: true,
    players: TEST_PLAYERS.map((t, i) => ({
      socketId: null,
      playerToken: t.playerToken,
      caidId: t.caidId,
      caidName: t.caidName,
      isHost: i === 0,
      hearts: 3,
      pocketCash: 5000,
      safeCash: 0,
      safeDrugs: 0,
      drugs: 5,
      arrests: 0,
      atk: 1,
      def: 0,
      musclesCount: 0,
      hasProstituteInTransit: false,
      prostituteObj: null,
      hasStrayDog: false,
      inventory: JSON.parse(JSON.stringify(t.inventory)),
      equipped: { weapon: null, armor: null, vehicle: null }
    }))
  };
  room.roundOrder = buildRoundOrder(room);
  room.turnPos = 0;
  room.playedThisRoundTokens = [];
  room.alliedWithThisRound = {};
  rooms[TEST_ROOM_ID] = room;
}
// Après loadSavedRooms() (et RADIO_EVENTS chargé) : on crée TEST s'il n'existe pas déjà
if (!REDIRECT_TO && !rooms[TEST_ROOM_ID]) createTestRoom();

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
    .map(p => ({ token: p.playerToken, caidName: p.caidName, played: played.includes(p.playerToken), hasStrayDog: p.playerToken === room.strayDogHolderToken }));

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

// Couvercle de poubelle : l'arme d'un combattant compte pour 0 si un de ses adversaires a l'effet actif
function isWeaponNullifiedFor(room, combat, token) {
  const opponents = combat.attackerTokens.includes(token) ? [combat.defenderToken] : combat.attackerTokens;
  return opponents.some(t => room.players.find(p => p.playerToken === t)?.nullEnemyWeapon);
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

// Partage de groupe (3 membres ou plus) : parts en %, le premier membre (celui qui a mené l'action) reçoit les restes
function openGroupSplit(room, sessionData) {
  const members = [];
  (sessionData.tokens || []).forEach(tok => {
    const p = room.players.find(x => x.playerToken === tok);
    if (p && !members.some(m => m.token === tok)) members.push({ token: tok, caidName: p.caidName || 'Caïd', caidId: p.caidId || null });
  });
  if (!members.length) return;

  const base = Math.floor(100 / members.length);
  const cashPcts = {}, drugPcts = {}, accepted = {};
  members.forEach((m, i) => {
    const pct = i === 0 ? 100 - base * (members.length - 1) : base;
    cashPcts[m.token] = pct;
    drugPcts[m.token] = pct;
    accepted[m.token] = false;
  });

  room.activeGroupSplit = {
    id: 'gs_' + Math.random().toString(36).substring(2, 9),
    title: sessionData.title || 'Partage du Butin',
    sourceType: sessionData.sourceType, // 'heist' | 'combat'
    totalCash: sessionData.totalCash || 0,
    totalDrugs: sessionData.totalDrugs || 0,
    members,
    cashPcts,
    drugPcts,
    accepted
  };
  emitGroupSplit(room, 'group_split_opened');
}

// Envoi à chaque membre, retrouvé par son playerToken (le socketId change à la reconnexion)
function emitGroupSplit(room, eventName) {
  const split = room.activeGroupSplit;
  if (!split) return;
  split.members.forEach(m => {
    const p = room.players.find(x => x.playerToken === m.token);
    if (p && p.socketId) io.to(p.socketId).emit(eventName, split);
  });
}

io.on('connection', (socket) => {
  socket.emit('app_version', APP_VERSION);
  socket.emit('rooms_list', getAvailableRooms());

  socket.on('reconnect_player', ({ roomId, playerToken }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('reconnect_failed');

    const existingPlayer = room.players.find(p => p.playerToken === playerToken);
    if (!existingPlayer) return socket.emit('reconnect_failed');

    if (room.isTestRoom) room.players.forEach(p => { if (p.socketId === socket.id) p.socketId = null; });
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
    if (room.gameOver) socket.emit('game_over', room.gameOver);

    io.to(roomId).emit('update_room_players', {
      players: room.players,
      isReady: checkRoomReady(room),
      maxPlayers: room.maxPlayers,
      selectionMode: room.selectionMode || 'random'
    });

    if (room.gameStarted) {
      broadcastTurnState(roomId);
      resendPendingState(room, existingPlayer, socket);
    }
  });

  // Joueur reconnecté (page rechargée, changement de Caïd dans la partie test) :
  // on lui renvoie ce qu'il a pu manquer pendant qu'il n'était pas connecté
  function resendPendingState(room, player, sock) {
    const tok = player.playerToken;
    const pa = room.pendingAlliance;
    if (pa && pa.round === room.round) {
      if (pa.invitees[tok] === 'wait' && pa.request) sock.emit('alliance_request_received', pa.request);
      if (pa.senderToken === tok) {
        emitAllianceStatus(room, true);
        const statuses = Object.values(pa.invitees);
        if (!pa.declinedSent && !statuses.includes('wait') && !statuses.includes('ok')) {
          pa.declinedSent = true;
          sock.emit('alliance_declined', { refused: allianceNamesByStatus(room, 'no') });
        }
      }
    }
    const pact = room.lastAlliancePayload;
    if (pact && (room.currentTurnAlliedTokens || []).includes(tok) && pact.members.some(m => m.token === tok)) {
      sock.emit('alliance_confirmed', pact);
    }
    const gs = room.activeGroupSplit;
    if (gs && gs.members.some(m => m.token === tok)) sock.emit('group_split_opened', gs);
    const ls = room.activeLootSplit;
    if (ls && (ls.leftToken === tok || ls.rightToken === tok)) sock.emit('loot_split_opened', ls);
  }

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
      activeGroupSplit: null,
      pendingAlliance: null,
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
    room.activeGroupSplit = null;
    room.pendingAlliance = null;
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
    room.pendingAlliance = null; // une demande d'alliance non répondue expire avec le tour
    // Le Chien Errant reste avec le dernier joueur qui l'a sifflé, jusqu'au prochain coup de sifflet

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

  // Un allié (qui joue pendant le tour d'un autre) termine sa participation : il ne peut plus agir ce tour
  socket.on('end_allied_turn', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameStarted) return;
    const ally = room.players.find(p => p.socketId === socket.id);
    const activePlayer = getActivePlayer(room);
    if (!ally || !activePlayer || ally.playerToken === activePlayer.playerToken) return;
    if (!(room.currentTurnAlliedTokens || []).includes(ally.playerToken)) return;

    room.playedThisRoundTokens = [...new Set([...(room.playedThisRoundTokens || []), ally.playerToken])];
    room.currentTurnAlliedTokens = room.currentTurnAlliedTokens.filter(t => t !== ally.playerToken);
    // S'il ne reste que le joueur actif, l'alliance du tour est terminée
    if (room.currentTurnAlliedTokens.every(t => t === activePlayer.playerToken)) room.currentTurnAlliedTokens = [];

    io.to(activePlayer.socketId).emit('ally_ended_turn', { allyCaid: ally.caidName });
    broadcastTurnState(socket.roomId);
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
    broadcastTurnState(socket.roomId); // tout le monde voit le nouveau maître du chien dans la barre d'ordre

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
    // Caïd à l'hôpital : intouchable jusqu'au début de son prochain tour
    if (targetPlayer.inHospital) {
      return socket.emit('error_msg', `${targetPlayer.caidName || 'Ce Caïd'} est à l'hôpital : intouchable jusqu'à son prochain tour !`);
    }

    const canCoordinate = useAlliance === true && room.currentTurnAlliedTokens && room.currentTurnAlliedTokens.includes(attackerPlayer.playerToken);
    // Tous les autres membres de l'alliance du tour (sauf la cible) attaquent avec lui
    const allyPlayers = canCoordinate
      ? room.currentTurnAlliedTokens
          .filter(t => t !== attackerPlayer.playerToken && t !== targetPlayer.playerToken)
          .map(t => room.players.find(p => p.playerToken === t))
          .filter(Boolean)
      : [];
    const isAllied = allyPlayers.length > 0;
    const attackers = [attackerPlayer, ...allyPlayers];

    const attackerTokens = attackers.map(p => p.playerToken);

    const attackerDisplayNames = isAllied
      ? attackers.map(p => p.caidName).join(' & ')
      : (attackerCaid || attackerPlayer.caidName || "Attaquant");

    const statsByToken = {};
    attackers.forEach(p => { statsByToken[p.playerToken] = p.atk || 1; });

    const combinedMuscles = attackers.reduce((sum, p) => sum + (p.musclesCount || 0), 0);

    room.activeCombat = {
      phase: 1,
      isAlliedAttack: isAllied,
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

    attackers.forEach(p => {
      const tok = p.playerToken;
      // Pour chaque attaquant : les autres attaquants sont ses alliés
      const others = attackers.filter(x => x.playerToken !== tok);
      if (p) {
        io.to(p.socketId).emit('combat_duel_opened', {
          phase: 1,
          role: 'attacker',
          isAlliedAttack: isAllied,
          allyCaid: isAllied ? others.map(x => x.caidName).join(' & ') : null,
          allyAtk: isAllied ? others.reduce((sum, x) => sum + (x.atk || 1), 0) : 0,
          allies: others.map(x => ({ token: x.playerToken, caidName: x.caidName, atk: x.atk || 1 })),
          opponentCaid: room.activeCombat.targetCaid,
          opponentSocketId: targetPlayer.socketId,
          targetMusclesCount: targetPlayer.musclesCount || 0,
          targetHasProstitute: !!targetPlayer.hasProstituteInTransit,
          targetHasStrayDog: !!targetPlayer.hasStrayDog,
          weaponNullified: isWeaponNullifiedFor(room, room.activeCombat, tok)
        });
      }
    });

    io.to(targetPlayer.socketId).emit('combat_duel_opened', {
      phase: 1,
      role: 'defender',
      isAlliedAttack: isAllied,
      allyCaid: null,
      allyAtk: 0,
      opponentCaid: room.activeCombat.attackerCaid,
      opponentSocketId: attackerPlayer.socketId,
      targetMusclesCount: combinedMuscles,
      targetHasProstitute: attackers.some(p => !!p.hasProstituteInTransit),
      targetHasStrayDog: attackers.some(p => !!p.hasStrayDog),
      weaponNullified: isWeaponNullifiedFor(room, room.activeCombat, targetPlayer.playerToken)
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
        if (actor.nullEnemyWeapon && isWeaponNullifiedFor(room, combat, p.playerToken)) {
          io.to(p.socketId).emit('combat_weapon_nullified', { byCaid: actor.caidName || 'Votre adversaire' });
        }
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

    if (!combat.attackerTokens.includes(chosenTargetToken)) return;

    const chosenP = room.players.find(p => p.playerToken === chosenTargetToken);
    combat.attackerTokens.filter(t => t !== chosenTargetToken).forEach(unchosenToken => {
      const unchosenP = room.players.find(p => p.playerToken === unchosenToken);
      if (unchosenP) {
        io.to(unchosenP.socketId).emit('combat_not_targeted_by_riposte', {
          defenderCaid: defenderP.caidName,
          chosenCaid: chosenP ? chosenP.caidName : 'votre allié'
        });
      }
    });

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
      myStat: newAttacker.atk || 1,
      weaponNullified: isWeaponNullifiedFor(room, room.activeCombat, newAttackerToken)
    });

    io.to(newDefender.socketId).emit('combat_phase2_started', {
      role: 'defender',
      opponentCaid: newAttacker.caidName,
      myStat: newDefender.def || 0,
      weaponNullified: isWeaponNullifiedFor(room, room.activeCombat, newDefenderToken)
    });
  }

  function concludeCombatWithWinner(room, roomId, winnerTokens, loserToken, dmgNet, isAlliedVictory) {
    const loserP = room.players.find(p => p.playerToken === loserToken);
    if (!loserP) {
      room.activeCombat = null;
      return;
    }

    loserP.hearts = Math.max(0, (loserP.hearts || 1) - 1);
    loserP.combatLosses = (loserP.combatLosses || 0) + 1;
    winnerTokens.forEach(tok => {
      const wP = room.players.find(p => p.playerToken === tok);
      if (wP) wP.combatWins = (wP.combatWins || 0) + 1;
    });

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
      } else if (pillage.isAlliedVictory && pillage.winnerTokens.length > 2 && stolenCash > 0) {
        openGroupSplit(room, {
          sourceType: 'combat',
          title: `Pillage sur ${loserP.caidName} (Cash)`,
          totalCash: stolenCash,
          totalDrugs: 0,
          tokens: pillage.winnerTokens
        });
      } else {
        primaryWinner.pocketCash = (primaryWinner.pocketCash || 0) + stolenCash;
        checkVictory(room, socket.roomId);
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
      } else if (pillage.isAlliedVictory && pillage.winnerTokens.length > 2 && stolenDrugs > 0) {
        openGroupSplit(room, {
          sourceType: 'combat',
          title: `Pillage sur ${loserP.caidName} (Drogue)`,
          totalCash: 0,
          totalDrugs: stolenDrugs,
          tokens: pillage.winnerTokens
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

  // J-Lo Gramme (défenseur) a réussi sa Prière Miraculeuse : l'agression est annulée
  socket.on('combat_prayer_cancel', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;
    const defender = room.players.find(p => p.socketId === socket.id);
    if (!defender || defender.playerToken !== room.activeCombat.defenderToken || defender.caidId !== 'caid_5') return;

    const involved = [...room.activeCombat.attackerTokens, room.activeCombat.defenderToken];
    involved.forEach(tok => {
      const p = room.players.find(x => x.playerToken === tok);
      if (p) io.to(p.socketId).emit('combat_cancelled_by_prayer', { caidName: defender.caidName });
    });
    room.activeCombat = null;
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
  socket.on('initiate_allied_heist_split', ({ heistName, totalCash, totalDrugs, allyToken, allyTokens }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const initiator = room.players.find(p => p.socketId === socket.id);
    if (!initiator) return;
    // Compat : ancien client avec un seul allyToken
    const tokens = Array.isArray(allyTokens) ? allyTokens : (allyToken ? [allyToken] : []);
    const allies = [...new Set(tokens)]
      .filter(t => t !== initiator.playerToken)
      .map(t => room.players.find(p => p.playerToken === t))
      .filter(Boolean);
    if (!allies.length) return;

    if (allies.length > 1) {
      return openGroupSplit(room, {
        sourceType: 'heist',
        title: `Braquage : ${heistName || 'Butin'}`,
        totalCash: totalCash || 0,
        totalDrugs: totalDrugs || 0,
        tokens: [initiator.playerToken, ...allies.map(p => p.playerToken)]
      });
    }

    const ally = allies[0];
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

  // Partage de groupe : n'importe quel membre ajuste n'importe quelle part par pas de 5 %
  socket.on('group_split_adjust', ({ kind, token, delta }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeGroupSplit) return;
    const split = room.activeGroupSplit;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor || !split.members.some(m => m.token === actor.playerToken)) return;
    if (!split.members.some(m => m.token === token)) return;

    const pcts = kind === 'drugs' ? split.drugPcts : split.cashPcts;
    const step = Math.min(100, Math.abs(parseInt(delta) || 0));
    if (!step) return;
    const others = split.members.map(m => m.token).filter(t => t !== token);
    if (!others.length) return;

    let moved = 0;
    if (delta > 0) {
      // On prend sur le membre qui a la plus grosse part
      const donor = others.reduce((best, t) => (pcts[t] > pcts[best] ? t : best), others[0]);
      moved = Math.min(step, pcts[donor] || 0, 100 - (pcts[token] || 0));
      if (moved > 0) { pcts[donor] -= moved; pcts[token] += moved; }
    } else {
      // On donne au membre qui a la plus petite part
      const receiver = others.reduce((best, t) => (pcts[t] < pcts[best] ? t : best), others[0]);
      moved = Math.min(step, pcts[token] || 0, 100 - (pcts[receiver] || 0));
      if (moved > 0) { pcts[token] -= moved; pcts[receiver] += moved; }
    }
    if (!moved) return;

    split.members.forEach(m => { split.accepted[m.token] = false; });
    emitGroupSplit(room, 'group_split_updated');
  });

  socket.on('group_split_accept', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeGroupSplit) return;
    const split = room.activeGroupSplit;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor || !split.members.some(m => m.token === actor.playerToken)) return;

    split.accepted[actor.playerToken] = true;
    if (!split.members.every(m => split.accepted[m.token])) {
      return emitGroupSplit(room, 'group_split_updated');
    }

    // Tout le monde a validé : montants arrondis à l'inférieur, le reste au premier membre
    const cashBy = {}, drugsBy = {};
    split.members.forEach(m => {
      cashBy[m.token] = Math.floor((split.totalCash * (split.cashPcts[m.token] || 0)) / 100);
      drugsBy[m.token] = Math.floor((split.totalDrugs * (split.drugPcts[m.token] || 0)) / 100);
    });
    const first = split.members[0].token;
    cashBy[first] += split.totalCash - Object.values(cashBy).reduce((a, b) => a + b, 0);
    drugsBy[first] += split.totalDrugs - Object.values(drugsBy).reduce((a, b) => a + b, 0);

    split.members.forEach(m => {
      const p = room.players.find(x => x.playerToken === m.token);
      if (!p) return;
      p.pocketCash = (p.pocketCash || 0) + cashBy[m.token];
      p.drugs = (p.drugs || 0) + drugsBy[m.token];
      if (p.socketId) {
        io.to(p.socketId).emit('group_split_completed', {
          title: split.title,
          cashGained: cashBy[m.token],
          drugsGained: drugsBy[m.token]
        });
      }
    });

    room.activeGroupSplit = null;
    checkVictory(room, socket.roomId);
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
    // Caïd à l'hôpital : intouchable jusqu'au début de son prochain tour
    if (targetP.inHospital) {
      return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} est à l'hôpital : intouchable jusqu'à son prochain tour !`);
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

  // Le joueur actif invite 1 à 3 Caïds ; chacun répond de son côté
  socket.on('propose_alliance', ({ targetPlayerTokens, targetPlayerToken, senderName }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameStarted) return;
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender) return;
    const activePlayer = getActivePlayer(room);
    if (!activePlayer || activePlayer.playerToken !== sender.playerToken) {
      return socket.emit('error_msg', "Seul le Caïd dont c'est le tour peut proposer une alliance.");
    }

    // Compat : ancien client avec une seule cible
    const requested = Array.isArray(targetPlayerTokens) ? targetPlayerTokens : (targetPlayerToken ? [targetPlayerToken] : []);
    const targets = [];
    let refusedSome = false;
    [...new Set(requested)].forEach(tok => {
      if (tok === sender.playerToken) return;
      const targetP = room.players.find(p => p.playerToken === tok);
      if (!targetP) return; // joueur absent
      if ((room.currentTurnAlliedTokens || []).includes(tok)) return; // déjà allié ce tour
      // Caïd envoyé à l'hôpital pendant cette manche : pas d'alliance avant la manche suivante
      if (targetP.inHospital && targetP.inHospital.round === room.round) {
        refusedSome = true;
        return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} est à l'hôpital : pas d'alliance possible avant la manche suivante !`);
      }
      targets.push(targetP);
    });
    if (!targets.length) {
      if (!refusedSome) socket.emit('error_msg', "Aucun Caïd valide à inviter dans l'alliance.");
      return;
    }

    // Une seule demande à la fois : la nouvelle remplace l'ancienne
    room.pendingAlliance = {
      id: 'al_' + Math.random().toString(36).substring(2, 9),
      senderToken: sender.playerToken,
      round: room.round,
      invitees: {}
    };
    targets.forEach(t => { room.pendingAlliance.invitees[t.playerToken] = 'wait'; });

    const inviteesList = targets.map(t => ({ token: t.playerToken, caidName: t.caidName, caidId: t.caidId }));
    // Gardée pour la renvoyer à un invité qui se reconnecte (page rechargée, partie test)
    room.pendingAlliance.request = {
      requestId: room.pendingAlliance.id,
      senderToken: sender.playerToken,
      senderCaid: sender.caidName || senderName,
      senderCaidId: sender.caidId,
      invitees: inviteesList
    };
    targets.forEach(t => io.to(t.socketId).emit('alliance_request_received', room.pendingAlliance.request));
    emitAllianceStatus(room);
  });

  // Statut des réponses, envoyé au proposant
  function emitAllianceStatus(room, resent) {
    const pending = room.pendingAlliance;
    if (!pending) return;
    const sender = room.players.find(p => p.playerToken === pending.senderToken);
    if (!sender) return;
    const invitees = Object.keys(pending.invitees).map(tok => {
      const p = room.players.find(x => x.playerToken === tok);
      return { token: tok, caidName: p ? p.caidName : 'Caïd', caidId: p ? p.caidId : null, status: pending.invitees[tok] };
    });
    io.to(sender.socketId).emit('alliance_request_status', {
      requestId: pending.id,
      invitees,
      done: !invitees.some(i => i.status === 'wait'),
      resent: !!resent
    });
  }

  function allianceNamesByStatus(room, status) {
    const pending = room.pendingAlliance;
    return Object.keys(pending.invitees)
      .filter(tok => pending.invitees[tok] === status)
      .map(tok => room.players.find(p => p.playerToken === tok)?.caidName || 'Caïd');
  }

  socket.on('respond_alliance', ({ requestId, accepted, senderToken }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const responder = room.players.find(p => p.socketId === socket.id);
    if (!responder) return;

    const pending = room.pendingAlliance;
    const matches = pending && (requestId ? pending.id === requestId : (!senderToken || pending.senderToken === senderToken));
    if (!matches || pending.invitees[responder.playerToken] === undefined) {
      return socket.emit('error_msg', "Cette demande d'alliance a expiré.");
    }
    if (pending.invitees[responder.playerToken] !== 'wait') return; // déjà répondu
    const sender = room.players.find(p => p.playerToken === pending.senderToken);
    if (!sender) return;

    pending.invitees[responder.playerToken] = accepted ? 'ok' : 'no';
    emitAllianceStatus(room);

    if (accepted) {
      room.currentTurnAlliedTokens = room.currentTurnAlliedTokens || [];
      if (!room.currentTurnAlliedTokens.includes(sender.playerToken)) {
        room.currentTurnAlliedTokens.push(sender.playerToken);
      }
      if (!room.currentTurnAlliedTokens.includes(responder.playerToken)) {
        room.currentTurnAlliedTokens.push(responder.playerToken);
      }
      const memberTokens = room.currentTurnAlliedTokens.slice();

      // Un seul pacte de groupe par demande, complété à chaque nouvel accepté
      room.nonAggressionPacts = (room.nonAggressionPacts || []).filter(p => p.allianceId !== pending.id);
      room.nonAggressionPacts.push({
        allianceId: pending.id,
        tokens: memberTokens,
        untilRound: room.round + 1 // manche en cours + manche suivante
      });

      // Pour expliquer à l'allié pourquoi son propre tour sera sauté
      room.alliedWithThisRound = room.alliedWithThisRound || {};
      room.alliedWithThisRound[responder.playerToken] = sender.caidName;
      room.alliedWithThisRound[sender.playerToken] = memberTokens
        .filter(t => t !== sender.playerToken)
        .map(t => room.players.find(p => p.playerToken === t)?.caidName || 'Caïd')
        .join(' & ');

      const members = memberTokens
        .map(t => room.players.find(p => p.playerToken === t))
        .filter(Boolean)
        .map(p => ({
          token: p.playerToken,
          caidName: p.caidName || 'Caïd',
          caidId: p.caidId,
          musclesCount: p.musclesCount || 0,
          atk: p.atk || 1,
          hasProstituteInTransit: !!p.hasProstituteInTransit
        }));
      const payload = {
        allianceId: pending.id,
        senderToken: sender.playerToken,
        members,
        refused: allianceNamesByStatus(room, 'no'),
        pending: allianceNamesByStatus(room, 'wait')
      };
      room.lastAlliancePayload = payload;
      memberTokens.forEach(t => {
        const p = room.players.find(x => x.playerToken === t);
        if (p) io.to(p.socketId).emit('alliance_confirmed', payload);
      });

      broadcastTurnState(socket.roomId);
    } else {
      // Tout le monde a répondu et personne n'a accepté
      const statuses = Object.values(pending.invitees);
      if (!statuses.includes('wait') && !statuses.includes('ok')) {
        pending.declinedSent = !!sender.socketId;
        io.to(sender.socketId).emit('alliance_declined', { refused: allianceNamesByStatus(room, 'no') });
      }
    }
  });

  socket.on('sync_player', (updatedData) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const p = room.players.find(x => x.socketId === socket.id);
    if (p) {
      Object.assign(p, updatedData);
      socket.to(socket.roomId).emit('player_updated', p);
      checkVictory(room, socket.roomId);
    }
  });

  socket.on('reset_test_room', ({ roomId } = {}) => {
    if (socket.roomId !== TEST_ROOM_ID && roomId !== TEST_ROOM_ID) return;
    createTestRoom();
    io.to(TEST_ROOM_ID).emit('test_room_reset');
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
  if (room && room.isTestRoom) {
    room.players.forEach(p => { if (p.socketId === socket.id) p.socketId = null; });
    socket.leave(socket.roomId);
    socket.roomId = null;
    return;
  }
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
  const list = Object.values(rooms)
    .filter(r => !r.gameStarted && r.players.length < r.maxPlayers)
    .map(r => ({
      id: r.id,
      name: r.name,
      maxPlayers: r.maxPlayers,
      connectedCount: r.players.length,
      selectionMode: r.selectionMode || 'random'
    }));
  if (rooms[TEST_ROOM_ID]) list.push({ id: TEST_ROOM_ID, name: 'test', maxPlayers: 3, connectedCount: 3, selectionMode: 'manual', isTest: true });
  return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, process.env.HOST, () => {
  console.log(`Serveur Ghettoway 2 Success actif sur le port ${PORT}`);
});
