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

  // Racket à l'aveugle : le vainqueur ne voit pas le cash ni la drogue du perdant
  assert.strictEqual(win.pillageInfo.availableCash, undefined);
  assert.strictEqual(win.pillageInfo.availableDrugs, undefined);
  // La roulette tombe entre 30 et 60 % (par 5) ; les deux joueurs voient la même part et le même montant
  a.emit('execute_pillage_choice', { category: 'cash' });
  const lost = await waitFor(b, 'you_were_pillaged'), got = await waitFor(a, 'pillage_gain_applied');
  assert.ok([30, 35, 40, 45, 50, 55, 60].includes(lost.pct), `part ${lost.pct}`);
  assert.strictEqual(lost.amount, 5000 * lost.pct / 100);
  assert.deepStrictEqual([got.amount, got.pct], [lost.amount, lost.pct]);
});

test('combat et patrouille en direct : le 3e joueur suit le duel et la patrouille, sans les montants du racket', async () => {
  const { players } = await startGame([['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_3', 'Nelson Sativa']]);
  const turn = await waitFor(players[0], 'turn_state_updated');
  const a = players.find(s => s.token === turn.activePlayerToken), [b, c] = players.filter(s => s !== a);
  a.emit('start_combat_engagement', { targetPlayerToken: b.token });
  const start = await waitFor(c, 'combat_live', d => d.stage === 'start');
  assert.strictEqual(start.defender, (await waitFor(b, 'combat_duel_opened')) && start.defender);
  // Carte jouée pendant le duel : le spectateur la voit (nom de la carte, pas la stat)
  a.emit('combat_play_items', { itemNames: ['Pot de Protéine'], newTotalStat: 4 });
  const items = await waitFor(c, 'combat_live', d => d.stage === 'items');
  assert.deepStrictEqual([items.itemNames, items.newTotalStat], [['Pot de Protéine'], undefined]);
  a.emit('combat_set_ready', { currentStat: 4 });
  assert.strictEqual((await waitFor(c, 'combat_live', d => d.stage === 'ready')).ready.length, 1);
  b.emit('combat_set_ready', { currentStat: 1 });
  const hit = await waitFor(c, 'combat_live', d => d.stage === 'hit');
  // Le spectateur ne voit aucune stat
  assert.deepStrictEqual([hit.atk, hit.def, hit.dmgNet], [undefined, undefined, undefined]);
  const res = await waitFor(c, 'combat_live', d => d.stage === 'result');
  assert.strictEqual(res.winners.length, 1);
  assert.deepStrictEqual([res.dmgNet, res.hearts], [undefined, undefined]);
  a.emit('execute_pillage_choice', { category: 'drugs' });
  const racket = await waitFor(c, 'combat_live', d => d.stage === 'racket');
  assert.strictEqual(racket.category, 'drugs');
  assert.ok(racket.pct >= 30 && racket.pct <= 60);
  assert.strictEqual(racket.amount, undefined);
  // Les combattants ne reçoivent pas le direct
  await never(a, 'combat_live', 50);
  await never(b, 'combat_live', 50);
  // Patrouille lancée par le joueur actif : les deux autres la voient, pas lui
  a.emit('patrol_rolled', { roll: 4, dir: 'straight', uturn: false, rigged: true });
  for (const s of [b, c]) assert.deepStrictEqual(await waitFor(s, 'patrol_show'), { roll: 4, dir: 'straight', left: false, uturn: false, rigged: true, caid: res.winners[0] });
  // Ancien téléphone (sans « dir ») : gauche ou droite comme avant
  a.emit('patrol_rolled', { roll: 2, left: true, uturn: true });
  assert.strictEqual((await waitFor(b, 'patrol_show')).dir, 'left');
  // Talkie : la direction « tout droit » est gardée pour le prochain lancer
  a.emit('rig_patrol', { roll: 6, dir: 'straight', uturn: false });
  await new Promise(r => setTimeout(r, 50));
  assert.deepStrictEqual(await new Promise(r => a.emit('take_patrol_rig', r)), { roll: 6, dir: 'straight', left: false, uturn: false });
  await never(a, 'patrol_show', 50);
});

test('une seule attaque par cible et par tour ; un assaut annulé avant le duel ne compte pas', async () => {
  const { players: [a, b] } = await startGame();
  const turn = await waitFor(a, 'turn_state_updated');
  const [att, def] = turn.activePlayerToken === a.token ? [a, b] : [b, a];
  att.emit('start_combat_engagement', { targetPlayerToken: def.token });
  await waitFor(att, 'combat_duel_opened');
  att.emit('combat_cancel');
  await waitFor(att, 'combat_aborted');
  att.emit('start_combat_engagement', { targetPlayerToken: def.token });
  await waitFor(att, 'combat_duel_opened');
  att.emit('combat_set_ready', { currentStat: 1 });
  def.emit('combat_set_ready', { currentStat: 5 });
  await waitFor(def, 'combat_phase2_started');
  att.emit('combat_set_ready', { currentStat: 0 });
  def.emit('combat_set_ready', { currentStat: 9 });
  await waitFor(att, 'combat_finished_result');
  att.emit('start_combat_engagement', { targetPlayerToken: def.token });
  assert.match(await waitFor(att, 'error_msg'), /déjà attaqué/);
});

test('ordre des tours : le même à chaque manche (1, 2, 3, puis 1, 2, 3)', async () => {
  const { players } = await startGame([['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_3', 'Nelson Sativa']]);
  const tokens = players.map(s => s.token);
  const order = async () => (await waitFor(players[0], 'turn_state_updated')).turnOrder.map(t => t.token);
  assert.deepStrictEqual(await order(), tokens);
  for (const i of [0, 1, 2]) {
    const s = players.find(x => x.token === tokens[i]);
    s.emit('next_player_turn');
    await new Promise(r => setTimeout(r, 80));
  }
  const next = players[0].events.filter(e => e.event === 'new_round_started' || e.event === 'turn_state_updated').pop();
  const turn = players[0].events.filter(e => e.event === 'turn_state_updated').pop().data;
  assert.strictEqual(turn.round, 2);
  assert.deepStrictEqual(turn.turnOrder.map(t => t.token), tokens);
  assert.strictEqual(turn.activePlayerToken, tokens[0]);
  assert.ok(next);
});

test('attaque de QG : 3 Lascars requis, Attaque contre Défense du QG, butin à la roulette, une fois par manche', async () => {
  const { players } = await startGame([['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_3', 'Nelson Sativa']]);
  const turn = await waitFor(players[0], 'turn_state_updated');
  const a = players.find(s => s.token === turn.activePlayerToken), [b, c] = players.filter(s => s !== a);
  b.emit('sync_player', { safeCash: 10000, safeDrugs: 4, qgDef: 3 });
  a.emit('sync_player', { musclesCount: 2, atk: 9 });
  await new Promise(r => setTimeout(r, 80));
  a.emit('qg_raid', { targetPlayerToken: b.token });
  assert.match(await waitFor(a, 'error_msg'), /3 Lascars/);
  // Défense trop forte : rien de pris, les Lascars risquent 50 %
  a.emit('sync_player', { musclesCount: 3, atk: 3 });
  await new Promise(r => setTimeout(r, 80));
  a.emit('qg_raid', { targetPlayerToken: b.token });
  const fail = await waitFor(a, 'qg_raid_result');
  assert.deepStrictEqual([fail.success, fail.atk, fail.def], [false, 3, 3]);
  assert.ok(fail.lost >= 0 && fail.lost <= 3);
  assert.strictEqual((await waitFor(b, 'qg_raid_attempt')).success, false);
  // Une seule attaque de QG par manche
  a.emit('qg_raid', { targetPlayerToken: c.token });
  assert.match(await waitFor(a, 'error_msg'), /une seule attaque de QG/);
  // Manche suivante : Attaque 9 contre Défense 3, cash du coffre à la roulette
  for (const s of [a, b, c]) {
    const t = players.find(x => x.events.filter(e => e.event === 'turn_state_updated').pop().data.activePlayerToken === x.token);
    (t || s).emit('next_player_turn');
    await new Promise(r => setTimeout(r, 80));
  }
  await new Promise(r => setTimeout(r, 150));
  const now = a.events.filter(e => e.event === 'turn_state_updated').pop().data;
  const atk = players.find(s => s.token === now.activePlayerToken), vic = players.find(s => s !== atk && s.token === b.token) || players.find(s => s !== atk);
  vic.emit('sync_player', { safeCash: 10000, safeDrugs: 4, qgDef: 3 });
  atk.emit('sync_player', { musclesCount: 4, atk: 9 });
  await new Promise(r => setTimeout(r, 80));
  atk.events.length = 0; vic.events.length = 0;
  atk.emit('qg_raid', { targetPlayerToken: vic.token });
  const win = await waitFor(atk, 'qg_raid_result');
  assert.deepStrictEqual([win.success, win.atk, win.def, win.picker], [true, 9, 3, true]);
  atk.emit('qg_raid_take', { category: 'cash' });
  const lost = await waitFor(vic, 'qg_looted'), got = await waitFor(atk, 'pillage_gain_applied');
  assert.ok([30, 35, 40, 45, 50, 55, 60].includes(lost.pct));
  assert.strictEqual(lost.amount, 10000 * lost.pct / 100);
  assert.deepStrictEqual([got.amount, got.qg], [lost.amount, true]);
});

test('racket : le vainqueur prend jusqu’à 3 objets de Fouille au hasard, jamais l’équipement', async () => {
  const { players: [a, b] } = await startGame();
  const objets = ['Kebab', 'Sifflet', 'Botox', 'Canette'].map((name, i) => ({ id: `o${i}`, type: 'ITEM_CARD', name }));
  b.emit('sync_player', { inventory: [...objets, { id: 'w1', type: 'WEAPON', name: 'Couteau' }] });
  await new Promise(r => setTimeout(r, 100));
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 3 });
  b.emit('combat_set_ready', { currentStat: 1 });
  assert.strictEqual((await waitFor(a, 'combat_finished_result')).pillageInfo.availableItems, 4);
  a.emit('execute_pillage_choice', { category: 'items' });
  const lost = await waitFor(b, 'you_were_pillaged');
  const got = await waitFor(a, 'pillage_gain_applied');
  assert.strictEqual(got.items.length, 3);
  assert.deepStrictEqual(lost.items.map(i => i.id), got.items.map(i => i.id));
  assert.ok(got.items.every(i => i.type === 'ITEM_CARD'));
});

test('racket : si le vainqueur ne prend rien, le perdant est quand même prévenu (son écran Défaite attend)', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('start_combat_engagement', { targetPlayerToken: b.token, attackerCaid: 'Burger Queen' });
  await waitFor(b, 'combat_duel_opened');
  a.emit('combat_set_ready', { currentStat: 3 });
  b.emit('combat_set_ready', { currentStat: 1 });
  await waitFor(a, 'combat_finished_result');
  a.emit('execute_pillage_choice', { category: 'none' });
  const got = await waitFor(b, 'you_were_pillaged');
  assert.deepStrictEqual([got.category, got.thiefCaid], ['none', 'Burger Queen']);
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
  await waitFor(a, 'combat_opponent_is_ready'); // le « Prêt » de b est arrivé avant la carte de a
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

test('victoire à 100 000 € au coffre : fin de partie annoncée à tous avec le classement', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('sync_player', { pocketCash: 60000, safeCash: 40000 });
  await never(b, 'game_over'); // l'argent en poche ne compte pas
  b.emit('sync_player', { pocketCash: 0, safeCash: 20000 });
  a.emit('sync_player', { pocketCash: 0, safeCash: 100000 });
  const over = await waitFor(b, 'game_over');
  assert.strictEqual(over.winnerToken, a.token);
  assert.deepStrictEqual(over.standings.map(p => p.fortune), [100000, 20000]);
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

test('à 2 joueurs, A B puis A B : le premier rejoue en début de manche, avec un nouveau tour', async () => {
  const { players: [a, b] } = await startGame();
  const t1 = await waitFor(a, 'turn_state_updated');
  assert.strictEqual(t1.activePlayerToken, a.token);
  a.emit('next_player_turn');
  await waitFor(b, 'turn_state_updated', t => t.activePlayerToken === b.token);
  b.emit('next_player_turn');
  await waitFor(b, 'new_round_started');
  const t3 = await waitFor(b, 'turn_state_updated', t => t.round === 2);
  assert.strictEqual(t3.activePlayerToken, a.token);
  assert.notStrictEqual(t3.turnId, t1.turnId);
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
  a.emit('sync_player', { safeCash: 100000 });
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
  // Manche 2 (même ordre A B C) : A passe, puis B s'allie avec C et attaque A « en alliance »
  await waitFor(a, 'turn_state_updated', t => t.round === 2 && t.activePlayerToken === a.token);
  a.emit('next_player_turn');
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

test('patrouille : le joueur actif indique un Caïd croisé, qui reçoit le contrôle ; un autre joueur ne peut pas', async () => {
  const { players: [a, b] } = await startGame();
  const turn = await waitFor(a, 'turn_state_updated');
  const [active, other] = turn.activePlayerToken === a.token ? [a, b] : [b, a];
  other.emit('patrol_control', { targetTokens: [active.token] });
  await never(active, 'patrol_control');
  active.emit('patrol_control', { targetTokens: [other.token, active.token] });
  const got = await waitFor(other, 'patrol_control');
  assert.ok(got.byCaid);
  await never(active, 'patrol_control');
});

test('Talkie-walkie : dé, direction et option demi-tour commandés, remis une seule fois au lancer suivant', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('rig_patrol', { roll: 4, left: true, uturn: true });
  const rig = await new Promise(r => b.emit('take_patrol_rig', r));
  assert.deepStrictEqual(rig, { roll: 4, dir: 'left', left: true, uturn: true });
  assert.strictEqual(await new Promise(r => b.emit('take_patrol_rig', r)), null);
  a.emit('rig_patrol', { roll: 2, left: false }); // sans l'option
  assert.deepStrictEqual(await new Promise(r => a.emit('take_patrol_rig', r)), { roll: 2, dir: 'right', left: false, uturn: false });
});

test('braquage en alliance avec une prostituée au butin : chaque allié en reçoit une', async () => {
  const { players: [a, b] } = await startGame();
  a.emit('propose_alliance', { targetPlayerTokens: [b.token], senderName: 'Burger Queen' });
  const req = await waitFor(b, 'alliance_request_received');
  b.emit('respond_alliance', { requestId: req.requestId, accepted: true });
  await waitFor(a, 'alliance_confirmed');
  a.emit('initiate_allied_heist_split', { heistName: 'Nightclub', totalCash: 27000, totalDrugs: 0, prostituteLvl: 2, allyTokens: [b.token] });
  assert.strictEqual((await waitFor(b, 'heist_prostitute')).lvl, 2);
  await never(a, 'heist_prostitute');
});

test('salon : un téléphone qui se déconnecte garde sa place, et l’hôte revenu peut lancer la partie', async () => {
  const host = await connect();
  host.token = `tok_host_${Math.random().toString(36).slice(2, 7)}`;
  host.emit('create_room', { gameName: 'Salon', maxPlayers: 2, selectionMode: 'manual', playerToken: host.token });
  const { roomId } = await waitFor(host, 'room_created');
  host.emit('assign_caid', { caidId: 'caid_1', caidName: 'Burger Queen', startCash: 5000, startDrug: 5, startHearts: 3, unarmedAtk: 1, playerToken: host.token });
  await waitFor(host, 'caid_assigned_ok');
  const b = await connect();
  b.token = `tok_b_${Math.random().toString(36).slice(2, 7)}`;
  b.emit('join_room', { roomId, playerToken: b.token });
  await waitFor(b, 'room_joined');
  b.emit('assign_caid', { caidId: 'caid_7', caidName: 'Jamel Pépouze', startCash: 5000, startDrug: 5, startHearts: 3, unarmedAtk: 1, playerToken: b.token });
  await waitFor(b, 'caid_assigned_ok');

  // L'hôte verrouille son téléphone, puis revient sur un nouveau socket
  host.disconnect();
  await new Promise(r => setTimeout(r, 200));
  const host2 = await connect();
  host2.emit('reconnect_player', { roomId, playerToken: host.token });
  const back = await waitFor(host2, 'reconnect_success');
  assert.strictEqual(back.player.caidId, 'caid_1');
  assert.strictEqual(back.players.length, 2);
  host2.emit('start_game');
  await Promise.all([waitFor(host2, 'game_started'), waitFor(b, 'game_started')]);
});

test('réglages avancés : gardés avec la partie (nombres seulement) et renvoyés à ceux qui rejoignent', async () => {
  const host = await connect();
  host.token = `tok_set_${Math.random().toString(36).slice(2, 7)}`;
  host.emit('create_room', { gameName: 'Réglée', maxPlayers: 2, selectionMode: 'manual', playerToken: host.token,
    settings: { prices: { wp_gun: 6000, 'x y': 5, lab_2: -3 }, rent: { 1: '1500', 9: 100 }, startCash: { caid_2: 9000 }, sellPct: 250, grossiste: 'abc', yencliPct: 150 } });
  const { roomId, room } = await waitFor(host, 'room_created');
  assert.deepStrictEqual(room.settings, { prices: { wp_gun: 6000 }, rent: { 1: 1500 }, labKg: {}, startCash: { caid_2: 9000 }, startDrug: {}, yencliPct: 150, sellPct: 100 });
  const b = await connect();
  b.emit('join_room', { roomId, playerToken: `tok_set_b_${Math.random().toString(36).slice(2, 7)}` });
  assert.strictEqual((await waitFor(b, 'room_joined')).room.settings.prices.wp_gun, 6000);
  // Sans réglages : rien
  const c = await connect();
  c.emit('create_room', { gameName: 'Normale', maxPlayers: 2, selectionMode: 'manual', playerToken: `tok_set_c_${Math.random().toString(36).slice(2, 7)}`, settings: {} });
  assert.strictEqual((await waitFor(c, 'room_created')).room.settings, null);
});

test('« Tour déjà joué » : prévenu en milieu de manche, mais pas juste avant la manche suivante', async () => {
  const trio = [['caid_1', 'Burger Queen'], ['caid_7', 'Jamel Pépouze'], ['caid_5', 'J-Lo Gramme']];
  const ally = async (from, to) => {
    from.emit('propose_alliance', { targetPlayerTokens: [to.token], senderName: 'X' });
    const req = await waitFor(to, 'alliance_request_received');
    to.emit('respond_alliance', { requestId: req.requestId, accepted: true });
    await waitFor(from, 'alliance_confirmed');
  };
  // Allié du joueur suivant : son tour saute, il est prévenu
  const g1 = (await startGame(trio)).players;
  await ally(g1[0], g1[1]);
  g1[0].emit('next_player_turn');
  await waitFor(g1[1], 'turn_skipped');
  await waitFor(g1[2], 'turn_state_updated', t => t.activePlayerToken === g1[2].token);
  // Allié du dernier de la manche : la manche suivante commence, pas de message par-dessus la radio
  const [a, b, c] = (await startGame(trio)).players;
  await ally(a, c);
  a.emit('next_player_turn');
  await waitFor(b, 'turn_state_updated', t => t.activePlayerToken === b.token);
  b.emit('next_player_turn');
  await waitFor(c, 'new_round_started');
  await never(c, 'turn_skipped');
});
