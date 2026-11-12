// Tests du serveur : vraies connexions socket.io sur un serveur lancé à part (port et dossier de données temporaires).
// Lancer avec : npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 3200 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'g2s-test-'));
let server;
const clients = [];

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, GAME_DATA_DIR: DATA_DIR },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', d => { if (String(d).includes('actif sur le port')) resolve(); });
    server.on('exit', code => reject(new Error(`serveur arrêté (code ${code})`)));
  });
});

after(() => {
  clients.forEach(c => c.disconnect());
  server.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

// Client de test : garde tous les événements reçus, waitFor attend le prochain qui correspond
async function connect() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.events = [];
  s.waiters = [];
  s.onAny((event, data) => {
    s.events.push({ event, data });
    s.waiters = s.waiters.filter(w => !(w.event === event && w.pred(data) && (w.resolve(data), true)));
  });
  await new Promise(r => s.on('connect', r));
  clients.push(s);
  return s;
}
function waitFor(s, event, pred = () => true, ms = 2000) {
  const seen = s.events.find(e => e.event === event && pred(e.data) && !e.used);
  if (seen) { seen.used = true; return Promise.resolve(seen.data); }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`« ${event} » jamais reçu`)), ms);
    s.waiters.push({ event, pred, resolve: d => { clearTimeout(timer); const e = s.events.findLast(x => x.data === d); if (e) e.used = true; resolve(d); } });
  });
}
const never = async (s, event, ms = 300) => {
  await new Promise(r => setTimeout(r, ms));
  assert.ok(!s.events.some(e => e.event === event && !e.used), `« ${event} » reçu alors qu'il ne devait pas l'être`);
};

// Partie normale à 2 joueurs, lancée, avec leurs Caïds
async function startGame(caids = [['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze']]) {
  const players = [];
  let roomId;
  for (const [i, [caidId, caidName]] of caids.entries()) {
    const s = await connect();
    s.token = `tok_${caidId}_${Math.random().toString(36).slice(2, 7)}`;
    if (i === 0) {
      s.emit('create_room', { gameName: 'Test', maxPlayers: caids.length, selectionMode: 'manual', playerToken: s.token });
      roomId = (await waitFor(s, 'room_created')).roomId;
    } else {
      s.emit('join_room', { roomId, playerToken: s.token });
      await waitFor(s, 'room_joined');
    }
    s.emit('assign_caid', { caidId, caidName, startCash: 5000, startDrug: 5, startHearts: 3, unarmedAtk: 1, playerToken: s.token });
    await waitFor(s, 'caid_assigned_ok');
    players.push(s);
  }
  players[0].emit('start_game');
  await Promise.all(players.map(s => waitFor(s, 'game_started')));
  return { roomId, players };
}

// Partie test : 3 Caïds pilotés depuis un seul téléphone (on bascule en se reconnectant à leur place)
async function testRoomAs(token) {
  const s = await connect();
  s.emit('reconnect_player', { roomId: 'TEST', playerToken: token });
  s.me = (await waitFor(s, 'reconnect_success')).player;
  return s;
}

test('création de partie, Caïds choisis, partie lancée et tour annoncé', async () => {
  const { players: [a, b] } = await startGame();
  const turn = await waitFor(b, 'turn_state_updated');
  assert.ok([a.token, b.token].includes(turn.activePlayerToken));
  assert.strictEqual(turn.turnOrder.length, 2);
});

test('combat gagné : les deux joueurs voient le duel, le perdant perd un cœur, le vainqueur choisit son butin', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  assert.strictEqual((await waitFor(a, 'combat_duel_opened')).role, 'attacker');
  assert.strictEqual((await waitFor(b, 'combat_duel_opened')).role, 'defender');

  a.emit('combat_set_ready', { currentStat: 3 });
  assert.strictEqual((await waitFor(b, 'combat_opponent_is_ready')).caidName, 'Burger Queen');
  b.emit('combat_set_ready', { currentStat: 1 });
  const win = await waitFor(a, 'combat_finished_result');
  const lose = await waitFor(b, 'combat_finished_result');
  assert.deepStrictEqual([win.outcome, win.dmgNet, win.isPrimaryPicker], ['winner', 2, true]);
  assert.strictEqual(lose.outcome, 'loser');

  a.emit('execute_pillage_choice', { category: 'cash' });
  assert.strictEqual((await waitFor(b, 'you_were_pillaged')).amount, 5000);
  assert.strictEqual((await waitFor(a, 'pillage_gain_applied')).amount, 5000);
});

test('assaut bloqué : riposte du défenseur en phase 2, puis match nul', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 1 });
  b.emit('combat_set_ready', { currentStat: 2 });
  assert.strictEqual((await waitFor(b, 'combat_phase2_started')).role, 'attacker');
  assert.strictEqual((await waitFor(a, 'combat_phase2_started')).role, 'defender');
  b.emit('combat_set_ready', { currentStat: 1 });
  a.emit('combat_set_ready', { currentStat: 4 });
  await waitFor(a, 'combat_finished_draw');
  await waitFor(b, 'combat_finished_draw');
});

test('objets joués en combat : l’adversaire est prévenu et doit revalider « Prêt »', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  b.emit('combat_set_ready', { currentStat: 0 });
  a.emit('combat_play_items', { itemNames: ['Vieille canette'], newTotalStat: 2 });
  assert.deepStrictEqual((await waitFor(b, 'combat_opponent_played_items')).itemNames, ['Vieille canette']);
  await waitFor(b, 'combat_ready_state_reset');
  a.emit('combat_set_ready', { currentStat: 2 });
  await never(a, 'combat_finished_result'); // b n'a pas revalidé
  a.emit('combat_set_ready', { currentStat: 2, ready: false });
  a.emit('combat_cancel');
  await waitFor(b, 'combat_aborted');
});

test('pouvoir ciblé : la cible reçoit l’effet avec le nom de l’expéditeur', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('apply_special_to_target', { targetPlayerToken: b.token, effectType: 'canette', senderCaid: 'Burger Queen' });
  const fx = await waitFor(b, 'received_special_effect');
  assert.deepStrictEqual([fx.effectType, fx.senderCaid, fx.senderToken], ['canette', 'Burger Queen', a.token]);
});

test('victoire à 100 000 € : fin de partie annoncée à tous avec le classement', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('sync_player', { pocketCash: 60000, safeCash: 40000 });
  const over = await waitFor(b, 'game_over');
  assert.strictEqual(over.winnerToken, a.token);
  assert.deepStrictEqual(over.standings.map(p => p.fortune), [100000, 5000]);
});

test('partie test : le défenseur reçoit le combat quand on bascule sur lui, puis le résultat manqué à son retour', async () => {
  let j1 = await testRoomAs('tok_test_1');
  j1.emit('reset_test_room');
  await waitFor(j1, 'test_room_reset');
  j1.disconnect();
  j1 = await testRoomAs('tok_test_1');
  const heartsJ2 = (await testRoomAs('tok_test_2').then(s => (s.disconnect(), s.me))).hearts;

  j1.emit('start_combat_engagement', { targetPlayerToken: 'tok_test_2', attackerCaid: 'Burger Queen' });
  await waitFor(j1, 'combat_duel_opened');
  j1.disconnect();

  let j2 = await testRoomAs('tok_test_2');
  assert.strictEqual((await waitFor(j2, 'combat_duel_opened')).role, 'defender');
  j2.emit('combat_set_ready', { currentStat: 0 });
  await new Promise(r => setTimeout(r, 100));
  j2.disconnect();

  j1 = await testRoomAs('tok_test_1');
  assert.strictEqual((await waitFor(j1, 'combat_duel_opened')).role, 'attacker');
  assert.strictEqual((await waitFor(j1, 'combat_opponent_is_ready')).caidName, 'Jamel Pépouze');
  j1.emit('combat_set_ready', { currentStat: 1 });
  assert.strictEqual((await waitFor(j1, 'combat_finished_result')).outcome, 'winner');
  j1.disconnect();

  j2 = await testRoomAs('tok_test_2');
  assert.strictEqual(j2.me.hearts, heartsJ2 - 1); // le cœur est déjà retiré côté serveur
  const late = await waitFor(j2, 'combat_finished_result');
  assert.deepStrictEqual([late.outcome, late.late], ['loser', true]);
  j2.disconnect();
  // Le message n'est remis qu'une fois
  j2 = await testRoomAs('tok_test_2');
  await never(j2, 'combat_finished_result');
  j2.disconnect();
});

test('partie test : J-Lo Gramme attaquée reçoit le duel en défense (Prière proposée côté téléphone)', async () => {
  const j1 = await testRoomAs('tok_test_1');
  j1.emit('start_combat_engagement', { targetPlayerToken: 'tok_test_3', attackerCaid: 'Burger Queen' });
  await waitFor(j1, 'combat_duel_opened');
  j1.disconnect();
  const j3 = await testRoomAs('tok_test_3');
  assert.strictEqual(j3.me.caidId, 'caid_5');
  const duel = await waitFor(j3, 'combat_duel_opened');
  assert.deepStrictEqual([duel.role, duel.phase], ['defender', 1]);
  j3.emit('combat_prayer_cancel');
  await waitFor(j3, 'combat_cancelled_by_prayer');
  j3.disconnect();
  const back = await testRoomAs('tok_test_1');
  assert.strictEqual((await waitFor(back, 'combat_cancelled_by_prayer')).late, true);
  back.disconnect();
});

test('partie test : un pouvoir lancé sur un Caïd hors ligne lui est remis à son retour', async () => {
  const j1 = await testRoomAs('tok_test_1');
  j1.emit('apply_special_to_target', { targetPlayerToken: 'tok_test_3', effectType: 'shuriken', senderCaid: 'Burger Queen' });
  await new Promise(r => setTimeout(r, 100));
  j1.disconnect();
  const j3 = await testRoomAs('tok_test_3');
  const fx = await waitFor(j3, 'received_special_effect');
  assert.deepStrictEqual([fx.effectType, fx.late], ['shuriken', true]);
  j3.disconnect();
});

test('« Prêt (annuler) » : le joueur n’est plus prêt côté serveur et l’adversaire en est prévenu', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 3, ready: true });
  await waitFor(b, 'combat_opponent_is_ready');
  a.emit('combat_set_ready', { currentStat: 3, ready: false });
  assert.strictEqual((await waitFor(b, 'combat_opponent_not_ready')).caidName, 'Burger Queen');
  b.emit('combat_set_ready', { currentStat: 0, ready: true });
  await never(b, 'combat_finished_result'); // a a annulé : le combat attend
  a.emit('combat_set_ready', { currentStat: 3, ready: true });
  assert.strictEqual((await waitFor(b, 'combat_finished_result')).outcome, 'loser');
});

test('un seul combat à la fois, et seul le vainqueur choisit le butin', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  assert.match(await waitFor(a, 'error_msg'), /déjà en cours/);
  b.emit('start_combat_engagement', { targetPlayerToken: a.token, attackerCaid: 'Jamel Pépouze' });
  assert.match(await waitFor(b, 'error_msg'), /pas ton tour/); // hors de son tour
  a.emit('combat_set_ready', { currentStat: 3 });
  b.emit('combat_set_ready', { currentStat: 0 });
  await waitFor(a, 'combat_finished_result');
  b.emit('execute_pillage_choice', { category: 'cash' }); // le perdant ne peut pas choisir
  await never(b, 'you_were_pillaged');
  a.emit('execute_pillage_choice', { category: 'cash' });
  await waitFor(b, 'you_were_pillaged');
});

test('à 2 joueurs, le dernier de la manche rejoue en premier : son tour est bien un nouveau tour', async () => {
  const { players: [a, b] } = await startGame();
  const t1 = await waitFor(a, 'turn_state_updated');
  assert.strictEqual(t1.activePlayerToken, a.token);
  a.emit('next_player_turn');
  const t2 = await waitFor(b, 'turn_state_updated', t => t.activePlayerToken === b.token);
  b.emit('next_player_turn');
  await waitFor(b, 'new_round_started');
  const t3 = await waitFor(b, 'turn_state_updated', t => t.round === 2);
  assert.strictEqual(t3.activePlayerToken, b.token);
  assert.notStrictEqual(t3.turnId, t2.turnId);
});

test('alliance : impossible avec un Caïd qui a déjà joué sa manche', async () => {
  const { players: [a, b, c] } = await startGame([['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_5', 'J-Lo Gramme']]);
  a.emit('next_player_turn');
  await waitFor(b, 'turn_state_updated', t => t.activePlayerToken === b.token);
  b.emit('propose_alliance', { targetPlayerTokens: [a.token], senderName: 'Jamel Pépouze' });
  assert.match(await waitFor(b, 'error_msg'), /déjà joué/);
  b.emit('propose_alliance', { targetPlayerTokens: [c.token], senderName: 'Jamel Pépouze' });
  await waitFor(c, 'alliance_request_received');
});

test('partage du butin : un allié qui quitte la partie l’accepte d’office, l’autre peut valider', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('propose_alliance', { targetPlayerTokens: [b.token], senderName: 'Burger Queen' });
  const req = await waitFor(b, 'alliance_request_received');
  b.emit('respond_alliance', { requestId: req.requestId, accepted: true });
  await waitFor(a, 'alliance_confirmed');
  a.emit('initiate_allied_heist_split', { heistName: 'Bijouterie', totalCash: 10000, totalDrugs: 2, allyTokens: [b.token] });
  await waitFor(b, 'loot_split_opened');
  b.emit('leave_room');
  const upd = await waitFor(a, 'loot_split_updated');
  assert.strictEqual(upd.rightAccepted, true);
  a.emit('accept_loot_split');
  assert.deepStrictEqual(await waitFor(a, 'loot_split_completed'), { title: 'Braquage : Bijouterie', cashGained: 5000, drugsGained: 1 });
});

test('annulation du combat : seulement par l’attaquant, avant que quelqu’un soit prêt', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  b.emit('combat_cancel'); // le défenseur ne peut pas fuir
  await never(a, 'combat_aborted');
  a.emit('combat_set_ready', { currentStat: 1 });
  await waitFor(b, 'combat_opponent_is_ready');
  a.emit('combat_cancel'); // trop tard : il est prêt
  await never(b, 'combat_aborted');
  a.emit('combat_set_ready', { currentStat: 1, ready: false });
  await waitFor(b, 'combat_opponent_not_ready');
  a.emit('combat_cancel');
  await waitFor(b, 'combat_aborted');
});

test('une attaque à 0 (Danse lascive) compte 0 : contre 0 de défense, l’assaut est repoussé', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 0 });
  b.emit('combat_set_ready', { currentStat: 0 });
  assert.strictEqual((await waitFor(b, 'combat_phase2_started')).role, 'attacker');
});

test('après la fin de partie, plus de tour ni de nouvelle manche', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('sync_player', { pocketCash: 100000 });
  await waitFor(b, 'game_over');
  b.events.length = 0;
  a.emit('next_player_turn');
  await never(b, 'new_round_started');
  await never(b, 'turn_state_updated', 500);
});

test('un Caïd K.O. (0 cœur) est intouchable, même avant que son téléphone affiche l’hôpital', async () => {
  const { players: [a, b] } = await startGame();
  b.emit('sync_player', { hearts: 1 });
  await waitFor(a, 'player_updated');
  a.emit('apply_special_to_target', { targetPlayerToken: b.token, effectType: 'siphon', senderCaid: 'Burger Queen' });
  await waitFor(b, 'received_special_effect');
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  assert.match(await waitFor(a, 'error_msg'), /hôpital/);
  a.emit('apply_special_to_target', { targetPlayerToken: b.token, effectType: 'shuriken', senderCaid: 'Burger Queen' });
  assert.match(await waitFor(a, 'error_msg'), /hôpital/);
});

test('deux partages à la suite : le second attend le premier, aucun butin perdu', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('propose_alliance', { targetPlayerTokens: [b.token], senderName: 'Burger Queen' });
  const req = await waitFor(b, 'alliance_request_received');
  b.emit('respond_alliance', { requestId: req.requestId, accepted: true });
  await waitFor(a, 'alliance_confirmed');
  a.emit('initiate_allied_heist_split', { heistName: 'Bijouterie', totalCash: 10000, totalDrugs: 0, allyTokens: [b.token] });
  await waitFor(b, 'loot_split_opened');
  a.emit('initiate_allied_heist_split', { heistName: 'Banque', totalCash: 2000, totalDrugs: 0, allyTokens: [b.token] });
  assert.match(await waitFor(a, 'error_msg'), /Banque.*partage en cours/);
  a.emit('accept_loot_split'); b.emit('accept_loot_split');
  assert.strictEqual((await waitFor(a, 'loot_split_completed')).cashGained, 5000);
  assert.strictEqual((await waitFor(b, 'loot_split_opened', d => d.title === 'Braquage : Banque')).totalCash, 2000);
  a.emit('accept_loot_split'); b.emit('accept_loot_split');
  assert.strictEqual((await waitFor(b, 'loot_split_completed', d => d.title === 'Braquage : Banque')).cashGained, 1000);
});

test('partie lancée : impossible de la rejoindre, et un second « Lancer » ne la remet pas à zéro', async () => {
  const { roomId, players: [a] } = await startGame();
  const c = await connect();
  c.emit('join_room', { roomId, playerToken: 'tok_intrus' });
  assert.match(await waitFor(c, 'error_msg'), /déjà commencé/);
  a.emit('next_player_turn');
  a.events.length = 0;
  a.emit('start_game');
  await never(a, 'game_started');
});

test('combat resté ouvert (téléphone éteint en plein duel) : annulé au changement de tour', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 3 });
  a.emit('next_player_turn');
  await waitFor(b, 'combat_aborted');
  b.emit('start_combat_engagement', { targetPlayerToken: a.token, attackerCaid: 'Jamel Pépouze' });
  await waitFor(a, 'combat_duel_opened');
});

test('attaque en alliance : l’allié lié à la cible par un pacte ne participe pas', async () => {
  const { players: [a, b, c] } = await startGame([['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_5', 'J-Lo Gramme']]);
  // Manche 1 (ordre A B C) : A s'allie avec C, pacte A-C jusqu'à la manche 2
  a.emit('propose_alliance', { targetPlayerTokens: [c.token], senderName: 'Burger Queen' });
  const r1 = await waitFor(c, 'alliance_request_received');
  c.emit('respond_alliance', { requestId: r1.requestId, accepted: true });
  await waitFor(a, 'alliance_confirmed');
  a.emit('next_player_turn');
  await waitFor(b, 'turn_state_updated', t => t.activePlayerToken === b.token);
  b.emit('next_player_turn');
  // Manche 2 (ordre B C A) : B s'allie avec C et attaque A « en alliance »
  await waitFor(b, 'turn_state_updated', t => t.round === 2 && t.activePlayerToken === b.token);
  b.emit('propose_alliance', { targetPlayerTokens: [c.token], senderName: 'Jamel Pépouze' });
  const r2 = await waitFor(c, 'alliance_request_received');
  c.emit('respond_alliance', { requestId: r2.requestId, accepted: true });
  await waitFor(b, 'alliance_confirmed', d => d !== undefined, 2000);
  c.events.length = 0;
  b.emit('start_combat_engagement', { targetPlayerToken: a.token, attackerCaid: 'Jamel Pépouze', useAlliance: true });
  const duel = await waitFor(a, 'combat_duel_opened');
  assert.strictEqual(duel.opponentCaid, 'Jamel Pépouze');
  await never(c, 'combat_duel_opened');
});

test('Flash radio : « Trop de criminalité » ne sort qu’une fois et laisse 2 voitures', async () => {
  const { players: [a, b] } = await startGame();
  let cars = 1, extra = 0, first = a;
  for (let round = 2; round <= 120; round++) {
    const second = first === a ? b : a;
    for (const s of [a, b]) s.events.length = 0;
    first.emit('next_player_turn');
    await waitFor(second, 'turn_state_updated', t => t.activePlayerToken === second.token);
    second.emit('next_player_turn');
    const nr = await waitFor(a, 'new_round_started', d => d.round === round);
    if (nr.radio.effectType === 'EXTRA_PATROL_CAR') extra++;
    if (extra) cars = 2;
    assert.strictEqual(nr.policeCars, cars);
    const ts = await waitFor(a, 'turn_state_updated', t => t.round === round);
    first = ts.activePlayerToken === a.token ? a : b;
  }
  assert.ok(extra <= 1, `« Trop de criminalité » tiré ${extra} fois`);
});

test('balance : les Caïds votent, tout le monde reçoit le résultat (même hors ligne)', async () => {
  let j1 = await testRoomAs('tok_test_1');
  j1.emit('reset_test_room');
  await waitFor(j1, 'test_room_reset');
  j1.disconnect();
  j1 = await testRoomAs('tok_test_1');
  j1.emit('test_set_radio', { id: 'rad_informant_drugs' });
  await waitFor(j1, 'test_radio_set');
  j1.emit('informant_vote', { targetToken: 'tok_test_1' }); // contre soi-même : refusé
  j1.emit('informant_vote', { targetToken: 'tok_test_3' });
  assert.deepStrictEqual(await waitFor(j1, 'informant_vote_progress'), { voted: 1, expected: 3 });
  j1.disconnect();
  const j2 = await testRoomAs('tok_test_2');
  j2.emit('informant_vote', { targetToken: 'tok_test_3' });
  await waitFor(j2, 'informant_vote_progress');
  j2.disconnect();
  let j3 = await testRoomAs('tok_test_3');
  j3.emit('informant_vote', { targetToken: 'tok_test_1' });
  const r = await waitFor(j3, 'informant_result');
  assert.strictEqual(r.targetToken, 'tok_test_3');
  assert.deepStrictEqual(r.tally.map(t => t.votes), [2, 1]);
  j3.disconnect();
  // J1, hors ligne au dépouillement, reçoit le résultat à son retour (son téléphone lance alors le contrôle s'il est désigné)
  j1 = await testRoomAs('tok_test_1');
  assert.strictEqual((await waitFor(j1, 'informant_result')).targetToken, 'tok_test_3');
  j1.disconnect();
});
