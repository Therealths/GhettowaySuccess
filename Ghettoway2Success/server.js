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
// Partie en pause (tous les joueurs ont quitté) : gardée 60 jours pour être reprise plus tard
const PAUSED_ROOM_MAX_IDLE_MS = 60 * 24 * 3600 * 1000;
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
    // Partie lancée (en pause ou simplement quittée en fermant l'appli) : gardée 60 jours pour la reprendre un autre jour
    const maxIdle = (room.paused || room.gameStarted) ? PAUSED_ROOM_MAX_IDLE_MS : ROOM_MAX_IDLE_MS;
    if (roomId !== TEST_ROOM_ID && now - room.lastActivity > maxIdle) {
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
  { playerToken: 'tok_test_1', caidId: 'caid_1', caidName: 'Burger Queen', inventory: [{ id: 'kebab_1', type: 'ITEM_CARD', name: 'Kebab', eff: 'heal', val: 1, desc: 'Restaure 1 Cœur de Vie' }] },
  { playerToken: 'tok_test_2', caidId: 'caid_7', caidName: 'Jamel Pépouze', inventory: [{ id: 'obj_jamel', type: 'ITEM_CARD', name: 'Vieille canette', eff: 'def_malus_round', val: 1, dur: 'instant', desc: '−1 Défense à un rival jusqu’à la fin de la manche' }] },
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
      roundSeen: 1, // dernière manche vue par son téléphone (nouvelle manche rejouée à la reconnexion)
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

// Passe la main au joueur suivant de la manche (fin de tour, ou joueur actif qui quitte la partie)
function advanceTurn(room, roomId, activePlayer) {
  if (room.gameOver) return; // partie terminée : plus de tour ni de manche
  // Le joueur actif et ses alliés du tour ont joué leur tour de la manche
  room.playedThisRoundTokens = [...new Set([
    ...(room.playedThisRoundTokens || []),
    activePlayer.playerToken,
    ...(room.currentTurnAlliedTokens || [])
  ])];

  room.currentTurnAlliedTokens = [];
  room.pendingAlliance = null; // une demande d'alliance non répondue expire avec le tour
  // Combat resté ouvert (téléphone éteint en plein duel) : annulé, sinon plus personne ne pourrait attaquer
  const combat = room.activeCombat;
  if (combat) {
    [...combat.attackerTokens, combat.defenderToken].forEach(tok => {
      const p = room.players.find(x => x.playerToken === tok);
      if (p) sendToPlayer(p, 'combat_aborted');
    });
    room.activeCombat = null;
  }
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
      io.to(roomId).emit('new_round_started', {
        round: room.round,
        radio: room.currentRadio,
        players: room.players
      });
    }

    const next = getActivePlayer(room);
    if (!next) continue; // joueur parti
    if (next.away) continue; // joueur absent (a quitté la partie) : son tour est passé
    if (room.playedThisRoundTokens.includes(next.playerToken)) {
      io.to(next.socketId).emit('turn_skipped', {
        allyCaid: (room.alliedWithThisRound || {})[next.playerToken] || null
      });
      continue;
    }
    room.currentTurnIndex = room.players.indexOf(next);
    break;
  }

  broadcastTurnState(roomId);
  io.to(roomId).emit('update_room_players', {
    players: room.players,
    isReady: true,
    maxPlayers: room.maxPlayers,
    selectionMode: room.selectionMode || 'random'
  });
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
    .map(p => ({ token: p.playerToken, caidName: p.caidName, played: played.includes(p.playerToken), hasStrayDog: p.playerToken === room.strayDogHolderToken, away: !!p.away }));

  io.to(roomId).emit('turn_state_updated', {
    activePlayerToken: activePlayer ? activePlayer.playerToken : null,
    activeCaidName: activePlayer ? activePlayer.caidName : '',
    activeSocketId: activePlayer ? activePlayer.socketId : null,
    alliedTokens: room.currentTurnAlliedTokens || [],
    nonAggressionPacts: room.nonAggressionPacts || [],
    round: room.round,
    turnId: `${room.round}:${room.turnPos || 0}`,
    turnOrder
  });
}

// Couvercle de poubelle : l'arme d'un combattant compte pour 0 si un de ses adversaires a l'effet actif
function isWeaponNullifiedFor(room, combat, token) {
  const opponents = combat.attackerTokens.includes(token) ? [combat.defenderToken] : combat.attackerTokens;
  return opponents.some(t => room.players.find(p => p.playerToken === t)?.nullEnemyWeapon);
}

// Pied de biche : au plus 5 parts, 1 000 € ou 1 kg chacune
function crowbarLootOf(l) {
  const kg = Math.max(0, Math.min(5, Math.floor(Number(l && l.kg) || 0)));
  const cash = Math.max(0, Math.min((5 - kg) * 1000, Math.floor(Number(l && l.cash) || 0)));
  return { cash, kg };
}

// Caïd à 0 Cœur (K.O.) : intouchable comme à l'hôpital, même avant que son téléphone ait affiché l'écran Hôpital
function isKnockedOut(p) { return typeof p.hearts === 'number' && p.hearts <= 0; }

// Un seul partage à la fois : un nouveau partage attend que le précédent soit validé (sinon le butin du premier serait perdu)
function splitBusy(room) { return !!(room.activeLootSplit || room.activeGroupSplit); }
function queueSplit(room, kind, data) {
  room.pendingSplits = room.pendingSplits || [];
  room.pendingSplits.push({ kind, data });
  const tokens = kind === 'loot' ? [data.leftToken, data.rightToken] : (data.tokens || []);
  tokens.forEach(t => {
    const p = room.players.find(x => x.playerToken === t);
    if (p && p.socketId) io.to(p.socketId).emit('error_msg', `${data.title || 'Partage du butin'} : il s'ouvrira dès que le partage en cours sera validé.`);
  });
}
function openNextSplit(room, roomId) {
  const next = (room.pendingSplits || []).shift();
  if (!next) return;
  if (next.kind === 'loot') openLootShareSession(room, roomId, next.data);
  else openGroupSplit(room, next.data);
}

function openLootShareSession(room, roomId, sessionData) {
  if (splitBusy(room)) return queueSplit(room, 'loot', sessionData);
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
  if (splitBusy(room)) return queueSplit(room, 'group', sessionData);
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

  socket.on('reconnect_player', ({ roomId, playerToken } = {}) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('reconnect_failed', { reason: 'no_room' });

    const existingPlayer = room.players.find(p => p.playerToken === playerToken);
    if (!existingPlayer) return socket.emit('reconnect_failed', { reason: 'not_member' });

    if (room.isTestRoom) room.players.forEach(p => { if (p.socketId === socket.id) p.socketId = null; });
    existingPlayer.socketId = socket.id;
    socket.join(roomId);
    socket.roomId = roomId;
    const wasAway = clearPlayerAway(room, existingPlayer);

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
      if (wasAway) resumeAfterReturn(room, roomId, existingPlayer, socket);
      broadcastTurnState(roomId);
      resendPendingState(room, existingPlayer, socket);
    }
  });

  // Joueur qui a quitté la partie (bouton Quitter) et revient : il n'est plus absent, la partie n'est plus en pause
  function clearPlayerAway(room, player) {
    if (!player.away) return false;
    delete player.away;
    delete room.paused;
    return true;
  }
  // Après le retour : on prévient les autres ; si le joueur actif est absent (partie en pause), la main passe au prochain joueur présent
  function resumeAfterReturn(room, roomId, player, sock) {
    sock.to(roomId).emit('player_returned', { caidName: player.caidName || 'Un Caïd' });
    const active = getActivePlayer(room);
    if (active && active.away) advanceTurn(room, roomId, active);
    io.emit('rooms_list', getAvailableRooms());
  }

  // Bouton « Quitter » dans une partie lancée : le Caïd est gardé (argent, objets…) mais marqué absent,
  // ses tours sont passés jusqu'à son retour. Tous absents = partie en pause, reprise possible plus tard.
  function setPlayerAway(sock, room) {
    const roomId = sock.roomId;
    const leaving = room.players.find(x => x.socketId === sock.id);
    sock.leave(roomId);
    sock.roomId = null;
    if (!leaving) return;
    const active = getActivePlayer(room);
    leaving.away = true;
    leaving.socketId = null;
    if ((room.currentTurnAlliedTokens || []).includes(leaving.playerToken)) {
      // Allié du tour qui s'en va : il a joué son tour de la manche (pas de second tour à son retour)
      room.playedThisRoundTokens = [...new Set([...(room.playedThisRoundTokens || []), leaving.playerToken])];
      room.currentTurnAlliedTokens = room.currentTurnAlliedTokens.filter(t => t !== leaving.playerToken);
    }
    // Combat en cours avec lui : annulé
    const combat = room.activeCombat;
    if (combat && [...combat.attackerTokens, combat.defenderToken].includes(leaving.playerToken)) {
      [...combat.attackerTokens, combat.defenderToken].forEach(tok => {
        const p = room.players.find(x => x.playerToken === tok);
        if (p) sendToPlayer(p, 'combat_aborted');
      });
      room.activeCombat = null;
    }
    // Partage du butin en cours avec lui : il l'accepte d'office, sa part l'attend à son retour
    const ls = room.activeLootSplit;
    if (ls && (ls.leftToken === leaving.playerToken || ls.rightToken === leaving.playerToken)) acceptLootSplit(room, leaving.playerToken);
    if (room.activeGroupSplit) acceptGroupSplit(room, roomId, leaving.playerToken);
    // Invitation d'alliance en attente : vaut un refus
    const pa = room.pendingAlliance;
    if (pa && pa.invitees && pa.invitees[leaving.playerToken] === 'wait') {
      pa.invitees[leaving.playerToken] = 'no';
      emitAllianceStatus(room);
      const statuses = Object.values(pa.invitees);
      const sender = room.players.find(p => p.playerToken === pa.senderToken);
      if (sender && sender.socketId && !statuses.includes('wait') && !statuses.includes('ok')) {
        pa.declinedSent = true;
        io.to(sender.socketId).emit('alliance_declined', declinedPayload(room));
      }
    }

    if (room.players.every(p => p.away)) {
      room.paused = true; // personne : la partie attend, le tour actif reste tel quel
    } else {
      if (!room.gameOver) io.to(roomId).emit('player_left_game', { caidName: leaving.caidName || 'Un Caïd' });
      if (active && active.playerToken === leaving.playerToken) advanceTurn(room, roomId, leaving);
      else {
        broadcastTurnState(roomId);
        io.to(roomId).emit('update_room_players', {
          players: room.players,
          isReady: true,
          maxPlayers: room.maxPlayers,
          selectionMode: room.selectionMode || 'random'
        });
      }
    }
    saveRooms();
    io.emit('rooms_list', getAvailableRooms());
  }

  // Joueur reconnecté (page rechargée, changement de Caïd dans la partie test) :
  // on lui renvoie ce qu'il a pu manquer pendant qu'il n'était pas connecté
  // Refus : avec les alliés déjà gagnés par une demande précédente (l'alliance continue avec eux)
  function declinedPayload(room) {
    const pa = room.pendingAlliance;
    const allies = (room.currentTurnAlliedTokens || []).filter(t => !pa || t !== pa.senderToken).map(t => room.players.find(p => p.playerToken === t)?.caidName || 'Caïd');
    return { refused: allianceNamesByStatus(room, 'no'), allies };
  }

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
          sock.emit('alliance_declined', declinedPayload(room));
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
    resendActiveCombat(room, player, sock);
    const pp = room.pendingPillage;
    if (pp && pp.winnerTokens[0] === tok && !(player.mailbox || []).some(m => m.event === 'combat_finished_result')) {
      sock.emit('combat_finished_result', { outcome: 'winner', opponentCaid: pp.loserCaid, isPrimaryPicker: true, pillageInfo: pp, late: true });
    }
    // Messages arrivés pendant son absence (résultat de combat, pillage, pouvoir subi…)
    const box = player.mailbox || [];
    delete player.mailbox;
    box.forEach(m => sock.emit(m.event, Object.assign({}, m.data, { late: true })));
  }

  // Combat en cours au moment de la reconnexion (partie test : on bascule d'un Caïd à l'autre)
  function resendActiveCombat(room, player, sock) {
    const combat = room.activeCombat;
    const tok = player.playerToken;
    if (!combat || ![...combat.attackerTokens, combat.defenderToken].includes(tok)) return;
    delete combat.readyByToken[tok]; // l'écran repart de zéro : il revalide « Prêt »
    if (combat.riposteTargets) {
      if (tok === combat.defenderToken) sock.emit('combat_choose_riposte_target', { targets: combat.riposteTargets });
      else sock.emit('combat_waiting_defender_riposte_choice', { defenderCaid: combat.targetCaid });
      return;
    }
    if (combat.phase === 2) {
      const opp = room.players.find(p => p.playerToken === (tok === combat.defenderToken ? combat.attackerTokens[0] : combat.defenderToken));
      sock.emit('combat_phase2_started', {
        role: tok === combat.defenderToken ? 'defender' : 'attacker',
        opponentCaid: opp ? opp.caidName : '',
        myStat: tok === combat.defenderToken ? (player.def || 0) : (player.atk || 1),
        weaponNullified: isWeaponNullifiedFor(room, combat, tok)
      });
    } else {
      sock.emit('combat_duel_opened', duelOpenedPayload(room, combat, tok));
    }
    Object.keys(combat.readyByToken).forEach(t => {
      const p = room.players.find(x => x.playerToken === t);
      if (p) sock.emit('combat_opponent_is_ready', { caidName: p.caidName });
    });
  }

  // Contenu de l'écran de duel (phase 1) pour un attaquant ou le défenseur
  function duelOpenedPayload(room, combat, tok) {
    const attackers = combat.attackerTokens.map(t => room.players.find(p => p.playerToken === t)).filter(Boolean);
    const target = room.players.find(p => p.playerToken === combat.defenderToken);
    if (tok === combat.defenderToken) {
      return {
        phase: 1,
        role: 'defender',
        isAlliedAttack: combat.isAlliedAttack,
        allyCaid: null,
        allyAtk: 0,
        opponentCaid: combat.attackerCaid,
        opponentSocketId: attackers[0] ? attackers[0].socketId : null,
        targetMusclesCount: attackers.reduce((sum, p) => sum + (p.musclesCount || 0), 0),
        targetHasProstitute: attackers.some(p => !!p.hasProstituteInTransit),
        targetHasStrayDog: attackers.some(p => !!p.hasStrayDog),
        weaponNullified: isWeaponNullifiedFor(room, combat, tok)
      };
    }
    // Pour chaque attaquant : les autres attaquants sont ses alliés
    const others = attackers.filter(x => x.playerToken !== tok);
    return {
      phase: 1,
      role: 'attacker',
      isAlliedAttack: combat.isAlliedAttack,
      allyCaid: combat.isAlliedAttack ? others.map(x => x.caidName).join(' & ') : null,
      allyAtk: combat.isAlliedAttack ? others.reduce((sum, x) => sum + (x.atk || 1), 0) : 0,
      allies: others.map(x => ({ token: x.playerToken, caidName: x.caidName, atk: x.atk || 1 })),
      opponentCaid: combat.targetCaid,
      opponentSocketId: target ? target.socketId : null,
      targetMusclesCount: target ? (target.musclesCount || 0) : 0,
      targetHasProstitute: !!(target && target.hasProstituteInTransit),
      targetHasStrayDog: !!(target && target.hasStrayDog),
      weaponNullified: isWeaponNullifiedFor(room, combat, tok)
    };
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
      const wasAway = clearPlayerAway(room, existing);
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
      if (room.gameStarted) {
        if (wasAway) resumeAfterReturn(room, roomId, existing, socket);
        broadcastTurnState(roomId);
        resendPendingState(room, existing, socket);
      }
      return io.to(roomId).emit('update_room_players', {
        players: room.players,
        isReady: checkRoomReady(room),
        maxPlayers: room.maxPlayers,
        selectionMode: room.selectionMode || 'random'
      });
    }

    if (room.gameStarted) {
      return socket.emit('error_msg', 'Cette partie a déjà commencé : impossible de la rejoindre.');
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
    if (room.gameStarted) return; // double appui : la partie est déjà lancée
    if (!checkRoomReady(room)) {
      return socket.emit('error_msg', "Tous les joueurs doivent avoir choisi leur Caïd (2 minimum) pour démarrer !");
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
    room.pendingSplits = [];
    room.pendingAlliance = null;
    room.pendingPillage = null;
    room.currentRadio = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];

    io.emit('rooms_list', getAvailableRooms());
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
    advanceTurn(room, socket.roomId, activePlayer);
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
        sendToPlayer(prevPlayer, 'lost_stray_dog', {
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

    if (!targetPlayer || !attackerPlayer || targetPlayer === attackerPlayer || room.gameOver) return;
    // Seuls le joueur actif et ses alliés du tour peuvent attaquer
    const activeNow = getActivePlayer(room);
    if (!room.isTestRoom && activeNow && activeNow.playerToken !== attackerPlayer.playerToken && !(room.currentTurnAlliedTokens || []).includes(attackerPlayer.playerToken)) {
      return socket.emit('error_msg', "Ce n'est pas ton tour.");
    }
    // Un seul combat à la fois (le joueur actif et son allié pourraient attaquer en même temps)
    if (room.activeCombat) {
      return socket.emit('error_msg', "Un combat est déjà en cours : attends qu'il soit terminé.");
    }

    if (arePlayersInNonAggressionPact(room, attackerPlayer.playerToken, targetPlayer.playerToken)) {
      return socket.emit('error_msg', "Pacte de non-agression avec ce Caïd : impossible de l'attaquer jusqu'à la fin du pacte.");
    }
    // Caïd absent (a quitté la partie) : intouchable jusqu'à son retour
    if (targetPlayer.away) {
      return socket.emit('error_msg', `${targetPlayer.caidName || 'Ce Caïd'} a quitté la partie : impossible de l'attaquer tant qu'il est absent.`);
    }
    // Caïd à l'hôpital : intouchable jusqu'au début de son prochain tour
    if (targetPlayer.inHospital || isKnockedOut(targetPlayer)) {
      return socket.emit('error_msg', `${targetPlayer.caidName || 'Ce Caïd'} est à l'hôpital : intouchable jusqu'à son prochain tour !`);
    }

    const canCoordinate = useAlliance === true && room.currentTurnAlliedTokens && room.currentTurnAlliedTokens.includes(attackerPlayer.playerToken);
    // Tous les autres membres de l'alliance du tour (sauf la cible) attaquent avec lui
    const allyPlayers = canCoordinate
      ? room.currentTurnAlliedTokens
          .filter(t => t !== attackerPlayer.playerToken && t !== targetPlayer.playerToken)
          // Un allié lié à la cible par un pacte de non-agression ne participe pas
          .filter(t => !arePlayersInNonAggressionPact(room, t, targetPlayer.playerToken))
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

    attackers.forEach(p => io.to(p.socketId).emit('combat_duel_opened', duelOpenedPayload(room, room.activeCombat, p.playerToken)));
    io.to(targetPlayer.socketId).emit('combat_duel_opened', duelOpenedPayload(room, room.activeCombat, targetPlayer.playerToken));
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
          io.to(p.socketId).emit('combat_weapon_nullified', { byCaid: actor.caidName || 'Ton adversaire' });
        }
      }
      io.to(p.socketId).emit('combat_ready_state_reset');
    });
  });

  socket.on('combat_set_ready', ({ currentStat, ready }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.activeCombat) return;

    const combat = room.activeCombat;
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;

    // « Prêt (annuler) » : il n'est plus prêt, les autres en sont prévenus
    if (ready === false) {
      delete combat.readyByToken[actor.playerToken];
      [...combat.attackerTokens, combat.defenderToken].forEach(tok => {
        const p = tok !== actor.playerToken && room.players.find(x => x.playerToken === tok);
        if (p) io.to(p.socketId).emit('combat_opponent_not_ready', { caidName: actor.caidName });
      });
      return;
    }

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

    const totalAtk = combat.attackerTokens.reduce((sum, tok) => sum + (Number.isFinite(combat.statsByToken[tok]) ? combat.statsByToken[tok] : 1), 0);
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
            return { playerToken: tok, caidName: p ? p.caidName : 'Allié' };
          });
          combat.attackerTokens.forEach(tok => {
            const p = room.players.find(x => x.playerToken === tok);
            if (p) {
              io.to(p.socketId).emit('combat_waiting_defender_riposte_choice', {
                defenderCaid: defenderP ? defenderP.caidName : 'Le défenseur'
              });
            }
          });
          combat.riposteTargets = targetsList;
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
            sendToPlayer(p, 'combat_finished_draw', {
              message: "La contre-attaque a également été bloquée ! Match nul : personne ne perd de Cœur ni de butin."
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
        sendToPlayer(unchosenP, 'combat_not_targeted_by_riposte', {
          defenderCaid: defenderP.caidName,
          chosenCaid: chosenP ? chosenP.caidName : 'ton allié'
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
      prostituteObj: loserP.prostituteObj || { level: 1, name: 'Prostituée Niv. 1', revenue: 1000 }
    };

    const winnerNames = winnerTokens
      .map(t => room.players.find(p => p.playerToken === t)?.caidName || 'Vainqueur')
      .join(' & ');

    sendToPlayer(loserP, 'combat_finished_result', {
      outcome: 'loser',
      dmgNet,
      opponentCaid: winnerNames
    });

    const primaryWinnerToken = winnerTokens[0];
    winnerTokens.forEach(tok => {
      const wP = room.players.find(p => p.playerToken === tok);
      if (!wP) return;
      sendToPlayer(wP, 'combat_finished_result', {
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
    const picker = room.players.find(p => p.socketId === socket.id);
    if (!picker || picker.playerToken !== pillage.winnerTokens[0]) return;
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
      sendToPlayer(loserP, 'you_were_pillaged', {
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
        sendToPlayer(primaryWinner, 'pillage_gain_applied', {
          category: 'cash',
          amount: stolenCash,
          loserCaid: loserP.caidName
        });
      }
    } else if (category === 'drugs') {
      const stolenDrugs = loserP.drugs || 0;
      loserP.drugs = 0;
      sendToPlayer(loserP, 'you_were_pillaged', {
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
        sendToPlayer(primaryWinner, 'pillage_gain_applied', {
          category: 'drugs',
          amount: stolenDrugs,
          loserCaid: loserP.caidName
        });
      }
    } else if (category === 'prostitute') {
      if (!pillage.hasProstitute) return socket.emit('error_msg', "Le perdant n'a pas de prostituée.");
      const targetWinnerToken = pillage.winnerTokens.includes(recipientToken) ? recipientToken : primaryWinner.playerToken;
      let destWinner = room.players.find(p => p.playerToken === targetWinnerToken) || primaryWinner;
      // 1 prostituée en transit maximum : si l'allié en a déjà une, elle revient au vainqueur principal
      if (destWinner.hasProstituteInTransit) destWinner = primaryWinner;
      if (destWinner.hasProstituteInTransit) {
        return socket.emit('error_msg', "Tu as déjà une prostituée en transit : choisis un autre butin.");
      }
      const stolenPros = loserP.prostituteObj || { level: 1, name: 'Prostituée Niv. 1', revenue: 1000 };

      loserP.hasProstituteInTransit = false;
      loserP.prostituteObj = null;
      destWinner.hasProstituteInTransit = true;
      destWinner.prostituteObj = stolenPros;

      sendToPlayer(loserP, 'you_were_pillaged', {
        category: 'prostitute',
        amount: 1,
        thiefCaid: destWinner.caidName
      });

      sendToPlayer(destWinner, 'pillage_gain_applied', {
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
      sendToPlayer(p, 'combat_cancelled_by_prayer', { caidName: defender.caidName });
    });
    room.activeCombat = null;
  });

  socket.on('combat_cancel', () => {
    const room = rooms[socket.roomId];
    const actor = room && room.players.find(p => p.socketId === socket.id);
    const c = room && room.activeCombat;
    // Seul l'attaquant qui a lancé l'assaut peut annuler, en phase 1, tant que personne n'est prêt
    if (!c || !actor || c.phase !== 1 || c.attackerTokens[0] !== actor.playerToken || c.riposteTargets || Object.keys(c.readyByToken).length) return;
    if (room && room.activeCombat) {
      const involved = [...room.activeCombat.attackerTokens, room.activeCombat.defenderToken];
      involved.forEach(tok => {
        const p = room.players.find(x => x.playerToken === tok);
        sendToPlayer(p, 'combat_aborted', {});
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
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor || (actor.playerToken !== split.leftToken && actor.playerToken !== split.rightToken)) return;

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
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;
    acceptLootSplit(room, actor.playerToken);
  });

  // Validation du partage à 2 (aussi appelée pour un membre qui quitte la partie)
  function acceptLootSplit(room, token) {
    const split = room.activeLootSplit;
    if (!split) return;
    if (token === split.leftToken) split.leftAccepted = true;
    if (token === split.rightToken) split.rightAccepted = true;

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
        sendToPlayer(leftP, 'loot_split_completed', {
          title: split.title,
          cashGained: leftCash,
          drugsGained: leftDrugs
        });
      }
      if (rightP) {
        rightP.pocketCash = (rightP.pocketCash || 0) + rightCash;
        rightP.drugs = (rightP.drugs || 0) + rightDrugs;
        sendToPlayer(rightP, 'loot_split_completed', {
          title: split.title,
          cashGained: rightCash,
          drugsGained: rightDrugs
        });
      }

      room.activeLootSplit = null;
      openNextSplit(room);
    } else {
      if (leftP) io.to(leftP.socketId).emit('loot_split_updated', split);
      if (rightP) io.to(rightP.socketId).emit('loot_split_updated', split);
    }
  }

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
    const actor = room.players.find(p => p.socketId === socket.id);
    if (!actor) return;
    acceptGroupSplit(room, socket.roomId, actor.playerToken);
  });

  // Validation du partage de groupe (aussi appelée pour un membre qui quitte la partie)
  function acceptGroupSplit(room, roomId, token) {
    const split = room.activeGroupSplit;
    if (!split || !split.members.some(m => m.token === token)) return;

    split.accepted[token] = true;
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
      sendToPlayer(p, 'group_split_completed', {
        title: split.title,
        cashGained: cashBy[m.token],
        drugsGained: drugsBy[m.token]
      });
    });

    room.activeGroupSplit = null;
    openNextSplit(room, roomId);
    checkVictory(room, roomId);
  }

  // =========================================================================
  // CAPACITÉS SPÉCIALES & ALLIANCES (AVEC IMMUNITÉ 2 TOURS)
  // =========================================================================
  socket.on('apply_special_to_target', ({ targetPlayerToken, targetSocketId, effectType, senderCaid }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const sender = room.players.find(p => p.socketId === socket.id);
    let targetP = room.players.find(p => p.playerToken === targetPlayerToken);
    if (!targetP) targetP = room.players.find(p => p.socketId === targetSocketId);
    if (!sender || !targetP || sender === targetP || room.gameOver) return;

    if (arePlayersInNonAggressionPact(room, sender.playerToken, targetP.playerToken)) {
      return socket.emit('error_msg', "Pacte de non-agression avec ce Caïd : impossible de le cibler jusqu'à la fin du pacte.");
    }
    if (targetP.away) {
      return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} a quitté la partie : impossible de le cibler tant qu'il est absent.`);
    }
    // Caïd à l'hôpital : intouchable jusqu'au début de son prochain tour
    if (targetP.inHospital || isKnockedOut(targetP)) {
      return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} est à l'hôpital : intouchable jusqu'à son prochain tour !`);
    }
    // Siphon : le cœur est retiré ici, aussi quand la cible est hors ligne (son téléphone le retrouve à la reconnexion)
    if (effectType === 'siphon') targetP.hearts = Math.max(0, (typeof targetP.hearts === 'number' ? targetP.hearts : 1) - 1);
    // Pied de biche : le coffre est forcé, le voleur voit ce qu'il contient (coffre connu du serveur, même victime hors ligne)
    // et choisit ensuite ce qu'il prend (crowbar_take) ; la victime n'est prévenue qu'à ce moment-là
    if (effectType === 'crowbar') {
      room.pendingCrowbar = { thiefToken: sender.playerToken, targetToken: targetP.playerToken, senderCaid };
      return socket.emit('crowbar_opened', { targetCaid: targetP.caidName || 'Ce Caïd', cash: Math.max(0, targetP.safeCash || 0), kg: Math.max(0, targetP.safeDrugs || 0) });
    }

    sendToPlayer(targetP, 'received_special_effect', specialPayload(room, effectType, senderCaid, socket, sender));
  });

  function specialPayload(room, effectType, senderCaid, socket, sender, loot) {
    const activeNow = getActivePlayer(room);
    return {
      effectType,
      round: room.round,
      turnToken: activeNow ? activeNow.playerToken : null,
      senderCaid,
      senderSocketId: socket.id,
      senderToken: sender.playerToken,
      loot
    };
  }

  // Pied de biche : le voleur a choisi sa part (kg de drogue, le reste en argent, 5 parts au plus)
  socket.on('crowbar_take', ({ kg } = {}) => {
    const room = rooms[socket.roomId];
    const pc = room && room.pendingCrowbar;
    const sender = room && room.players.find(p => p.socketId === socket.id);
    if (!pc || !sender || sender.playerToken !== pc.thiefToken) return;
    room.pendingCrowbar = null;
    const targetP = room.players.find(p => p.playerToken === pc.targetToken);
    if (!targetP) return;
    const want = crowbarLootOf({ kg, cash: 5000 });
    const taken = { kg: Math.min(want.kg, Math.max(0, targetP.safeDrugs || 0)) };
    taken.cash = Math.min((5 - taken.kg) * 1000, Math.max(0, targetP.safeCash || 0));
    targetP.safeCash = (targetP.safeCash || 0) - taken.cash;
    targetP.safeDrugs = (targetP.safeDrugs || 0) - taken.kg;
    socket.emit('gain_crowbar_loot', Object.assign({ targetCaid: targetP.caidName || 'Ce Caïd' }, taken));
    sendToPlayer(targetP, 'received_special_effect', specialPayload(room, 'crowbar', pc.senderCaid, socket, sender, taken));
    saveRooms();
  });

  // Talkie-walkie de flic : dé et direction choisis à l'avance, pris par le prochain lancer de patrouille
  socket.on('rig_patrol', ({ roll, left } = {}) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    room.patrolRig = { roll: Math.max(1, Math.min(6, Math.round(Number(roll) || 1))), left: !!left };
  });
  socket.on('take_patrol_rig', (ack) => {
    const room = rooms[socket.roomId];
    const rig = room && room.patrolRig || null;
    if (room) room.patrolRig = null;
    if (typeof ack === 'function') ack(rig);
  });

  socket.on('stolen_item_transferred', ({ targetSocketId, targetToken, item }) => {
    const room = rooms[socket.roomId];
    const thief = room && targetToken ? room.players.find(p => p.playerToken === targetToken) : null;
    if (thief) sendToPlayer(thief, 'gain_stolen_item', { item });
    else io.to(targetSocketId).emit('gain_stolen_item', { item });
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
      if (targetP.away) {
        refusedSome = true;
        return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} a quitté la partie : pas d'alliance possible tant qu'il est absent.`);
      }
      // Caïd qui a déjà joué sa manche : plus d'alliance avant la manche suivante
      if ((room.playedThisRoundTokens || []).includes(tok)) {
        refusedSome = true;
        return socket.emit('error_msg', `${targetP.caidName || 'Ce Caïd'} a déjà joué cette manche : pas d'alliance possible avant la manche suivante.`);
      }
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
    // Mis K.O. (ou a joué) pendant que la demande attendait : l'acceptation compte comme un refus
    if (accepted && ((responder.inHospital && responder.inHospital.round === room.round) || isKnockedOut(responder) || (room.playedThisRoundTokens || []).includes(responder.playerToken))) {
      accepted = false;
      socket.emit('error_msg', "Tu ne peux plus rejoindre cette alliance (hôpital ou tour déjà joué).");
    }

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
        io.to(sender.socketId).emit('alliance_declined', declinedPayload(room));
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

  socket.on('leave_room', (ack) => {
    const room = rooms[socket.roomId];
    // Partie lancée (hors partie test) : le Caïd est gardé, le joueur est marqué absent
    if (room && room.gameStarted && !room.isTestRoom) setPlayerAway(socket, room);
    else handlePlayerDisconnect(socket);
    if (typeof ack === 'function') ack();
  });

  // Suppression définitive d'une partie, par un de ses joueurs (jamais la partie test)
  socket.on('delete_room', ({ roomId, playerToken } = {}) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('rooms_list', getAvailableRooms());
    if (room.isTestRoom || roomId === TEST_ROOM_ID) return socket.emit('error_msg', 'La partie test ne peut pas être supprimée.');
    if (!playerToken || !room.players.some(p => p.playerToken === playerToken)) {
      return socket.emit('error_msg', 'Tu ne fais pas partie de cette partie : seuls ses joueurs peuvent la supprimer.');
    }
    io.to(roomId).emit('room_deleted', { name: room.name });
    io.sockets.sockets.forEach(s => { if (s.roomId === roomId) { s.leave(roomId); s.roomId = null; } });
    archiveFinishedRoom(roomId, room);
    delete rooms[roomId];
    delete roomSnapshots[roomId];
    saveRooms();
    io.emit('rooms_list', getAvailableRooms());
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room && !room.gameStarted) {
      handlePlayerDisconnect(socket);
    }
  });
});

// Joueur hors ligne (partie test pilotée depuis un seul téléphone, réseau coupé…) :
// le message est gardé et lui est remis à sa reconnexion (marqué « late »)
function sendToPlayer(p, event, data) {
  if (!p) return;
  if (p.socketId && io.sockets.sockets.get(p.socketId)) io.to(p.socketId).emit(event, data);
  else (p.mailbox = p.mailbox || []).push({ event, data });
}

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
    // Partie en cours : si c'était son tour, la main passe au suivant (sinon la partie resterait bloquée)
    const leaving = room.players.find(x => x.socketId === socket.id);
    const active = room.gameStarted ? getActivePlayer(room) : null;
    room.players = room.players.filter(x => x.socketId !== socket.id);
    if (leaving && room.currentTurnAlliedTokens) room.currentTurnAlliedTokens = room.currentTurnAlliedTokens.filter(t => t !== leaving.playerToken);
    if (room.players.length && room.gameStarted && leaving) {
      if (active && active.playerToken === leaving.playerToken) advanceTurn(room, socket.roomId, leaving);
      else broadcastTurnState(socket.roomId);
    }
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
  const real = Object.values(rooms).filter(r => !r.isTestRoom && r.id !== TEST_ROOM_ID);
  const list = real
    .filter(r => !r.gameStarted && r.players.length < r.maxPlayers)
    .map(r => ({
      id: r.id,
      name: r.name,
      maxPlayers: r.maxPlayers,
      connectedCount: r.players.length,
      selectionMode: r.selectionMode || 'random'
    }));
  // Parties lancées (en cours ou en pause) : reprise par leurs joueurs
  real
    .filter(r => r.gameStarted && !r.gameOver)
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
    .forEach(r => list.push({
      id: r.id,
      name: r.name,
      started: true,
      paused: !!r.paused,
      round: r.round || 1,
      caids: r.players.map(p => ({ name: p.caidName || 'Caïd', away: !!p.away }))
    }));
  if (rooms[TEST_ROOM_ID]) list.push({ id: TEST_ROOM_ID, name: 'test', maxPlayers: 3, connectedCount: 3, selectionMode: 'manual', isTest: true });
  return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, process.env.HOST, () => {
  console.log(`Serveur Ghettoway 2 Success actif sur le port ${PORT}`);
});
