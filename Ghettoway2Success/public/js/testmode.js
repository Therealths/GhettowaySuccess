// Partie « test » : 3 Caïds pilotés depuis un seul téléphone.
// Changer de joueur = prendre son identité (jeton) puis recharger : le serveur nous reconnecte à sa place.
const TEST_ROOM_ID = 'TEST';
const TEST_PLAYERS = [
  { token: 'tok_test_1', label: 'J1', caidId: 'caid_1' },
  { token: 'tok_test_2', label: 'J2', caidId: 'caid_7' },
  { token: 'tok_test_3', label: 'J3', caidId: 'caid_5' }
];
const isTestPlayer = myPlayerToken.startsWith('tok_test_');

function enterTestGame(n) {
  const p = TEST_PLAYERS[n - 1];
  if (!isTestPlayer) localStorage.setItem('g2s_real_token', myPlayerToken);
  localStorage.setItem('g2s_player_token', p.token);
  localStorage.setItem('g2s_room_id', TEST_ROOM_ID);
  localStorage.setItem('g2s_saved_caid_id', p.caidId);
  location.reload();
}

function leaveTestGame() {
  localStorage.removeItem('g2s_room_id'); // state.js rend la vraie identité au rechargement
  localStorage.removeItem('g2s_saved_caid_id');
  location.reload();
}

async function resetTestGame() {
  if (!await showAppConfirm("Remettre la partie test à zéro ?\nLes 3 Caïds repartent du début de la manche 1.", "🧪 Partie test")) return;
  socket.emit('reset_test_room');
}

if (isTestPlayer && socket) {
  const bar = document.createElement('div');
  bar.id = 'testPlayerBar';
  bar.className = 'absolute top-1 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1 p-1 rounded-full bg-black/85 border border-amber-400/50 shadow-lg';
  bar.innerHTML = `<span class="text-[9px] font-black uppercase text-amber-300 px-1.5">Test</span>` +
    TEST_PLAYERS.map((p, i) => {
      const caid = CAID_ROSTER.find(c => c.id === p.caidId);
      const me = p.token === myPlayerToken;
      return `<button data-token="${p.token}" onclick="${me ? '' : `enterTestGame(${i + 1})`}" title="${caid.name}" class="relative flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-[10px] font-black ${me ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'}"><img src="${caid.imageFile}" class="w-5 h-5 rounded-full object-cover">${p.label}<i class="test-turn-dot hidden absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black"></i></button>`;
    }).join('') +
    `<button onclick="resetTestGame()" title="Remettre à zéro" class="w-6 h-6 rounded-full bg-white/10 text-white text-xs"><i class="ph-bold ph-arrow-counter-clockwise"></i></button>` +
    `<button onclick="leaveTestGame()" title="Quitter la partie test" class="w-6 h-6 rounded-full bg-white/10 text-white text-xs"><i class="ph-bold ph-x"></i></button>`;
  document.getElementById('app-container').appendChild(bar);

  // Pastille verte sur le Caïd dont c'est le tour, pour savoir vers qui basculer
  socket.on('turn_state_updated', ({ activePlayerToken }) => {
    bar.querySelectorAll('button[data-token]').forEach(b => b.querySelector('.test-turn-dot').classList.toggle('hidden', b.dataset.token !== activePlayerToken));
  });
  socket.on('test_room_reset', () => location.reload());
}
