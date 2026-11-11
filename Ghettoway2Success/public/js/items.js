// Objets : découverte en fouillant (carte de l'objet), cartes des objets de combat, Vieille canette, Passeport diplomatique

// Image de la carte d'un objet (trouvée par son nom) ; null = carte en carton dessinée
const ITEM_ART = [
  [/kebab/i, 'obj-kebab'],
  [/passeport/i, 'obj-passeport'],
  [/couvercle/i, 'obj-couvercle'],
  // Cartes au cadre « Fouille »
  [/trognon/i, 'fouille-trognon'],
  [/canette/i, 'fouille-canette'],
  [/sifflet/i, 'fouille-sifflet'],
  [/prot[ée]ine/i, 'fouille-proteine'],
  [/liasse/i, 'fouille-cash'],
  [/sachet de beuh/i, 'fouille-drogue'],
  [/baskets/i, 'fouille-baskets'],
  [/manteau/i, 'fouille-manteau'],
  [/ar[êe]tes/i, 'fouille-aretes'],
  [/r[ée]duction armurerie/i, 'fouille-bon-armurerie'],
  [/r[ée]duction concessionnaire/i, 'fouille-bon-concessionnaire'],
  [/r[ée]duction nightclub/i, 'fouille-bon-nightclub'],
  [/r[ée]duction sportclub/i, 'fouille-bon-sportclub']
];
function itemArt(item, thumb) {
  const hit = ITEM_ART.find(([re]) => re.test(item && (item.name || item.n) || ''));
  return hit ? `${hit[1]}${thumb ? '-vignette' : ''}.webp` : null;
}
const ITEM_EMOJI = { double_weapon_atk: '💥', double_muscles_atk: '🥛', null_enemy_weapon: '🗑️', bonus_combat_atk: '🔪', def_malus_round: '🥫', cancel_police: '🛂', heal: '🥙', stray_dog: '🐕', none: '🍎', cash: '💰', drug: '🌿', pm_turn: '👟', free_prostitute: '🧥', voucher: '🎟️' };
const itemEmoji = it => /arête|poisson/i.test(it.name || '') ? '🐟' : ITEM_EMOJI[it.eff] || (/kebab/i.test(it.name || '') ? '🥙' : '🎒');
const itemRow = (icon, label, after) => `<div class="police-row find-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft">${after}</span></div>`;

// =========================================================================
// DÉCOUVERTE : on fouille la poubelle, puis la carte de l'objet apparaît
// =========================================================================
let findTimer = null;
function findRows(it) {
  const e = it.eff;
  if (e === 'cash') return itemRow('ph-coins', 'Gain', `+${(it.val || 0).toLocaleString()} €`);
  if (e === 'drug') return itemRow('ph-plant', 'Gain', `+${it.val || 0} kg`);
  if (e === 'heal' || /kebab/i.test(it.name || '')) return itemRow('ph-heart', 'Effet', '+1 Cœur de vie') + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (e === 'cancel_police') return itemRow('ph-siren', 'Effet', 'annule un contrôle') + itemRow('ph-backpack', 'Quand ?', 'proposé au prochain contrôle');
  if (e === 'none') return itemRow('ph-trash', 'Effet', 'aucun…') + itemRow('ph-backpack', 'Quand ?', 'faut pas gâcher');
  if (e === 'pm_turn') return itemRow('ph-sneaker-move', 'Effet', `+${it.val || 3} PM jusqu’à la fin du tour`) + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (e === 'free_prostitute') return itemRow('ph-high-heel', 'Effet', '1 Prostituée Niv. 1 gratuite') + itemRow('ph-backpack', 'Quand ?', 'utilisé tout seul au Nightclub');
  if (e === 'voucher') return itemRow('ph-ticket', 'Effet', `−50 % : ${escapeHtml(it.shop || '')}`) + itemRow('ph-backpack', 'Quand ?', 'prochain achat (à activer)');
  if (e === 'def_malus_round') return itemRow('ph-shield', 'Effet', '−1 Défense à un rival') + itemRow('ph-backpack', 'Quand ?', 'avant ou pendant un combat');
  if (e === 'stray_dog') return itemRow('ph-dog', 'Effet', 'rallie le Chien Errant') + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (it.dur === 'combat') return itemRow('ph-sword', 'Effet', escapeHtml(it.desc || 'objet de combat')) + itemRow('ph-backpack', 'Quand ?', 'pendant un combat');
  return itemRow('ph-sparkle', 'Effet', escapeHtml(it.desc || 'objet spécial'));
}
// Carte en carton pour un objet sans image (cash, drogue, objet inconnu)
const findFallback = it => `<div class="find-carton"><div class="find-carton-ic">${itemEmoji(it)}</div><div class="find-carton-n">${escapeHtml(it.name || 'Objet')}</div><div class="find-carton-d">${escapeHtml(it.desc || '')}</div></div>`;

// it : { name, desc, eff, val, dur } ; cta : texte du bouton ; onClaim : appelé à la validation
function openLootDiscoveryModal(it, cta, onClaim) {
  const scr = document.getElementById('modalLootDiscovery');
  const art = itemArt(it);
  document.getElementById('findRound').innerText = currentSession.round || 1;
  document.getElementById('findCard').innerHTML = art ? `<img class="find-img" src="${art}" alt="${escapeHtml(it.name || '')}">` : findFallback(it);
  document.getElementById('findBottom').innerHTML = `<h2 class="font-anton find-head">${it.eff === 'none' ? 'BOF…' : 'BIEN JOUÉ !'}</h2>
    <div class="flex flex-col gap-1.5 mt-3">${findRows(it)}</div>
    <button type="button" id="btnLootAction" class="find-cta mt-4">${escapeHtml(cta)}</button>`;
  document.getElementById('btnLootAction').onclick = () => {
    clearTimeout(findTimer);
    scr.classList.add('hidden');
    onClaim();
    refreshHud();
  };
  // La fouille dure le temps de charger la carte (et au moins 1 s)
  scr.dataset.state = 'fouille';
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
  clearTimeout(findTimer);
  const t0 = Date.now();
  const reveal = () => { findTimer = setTimeout(() => { if (!scr.classList.contains('hidden')) scr.dataset.state = 'carte'; }, Math.max(0, 1100 - (Date.now() - t0))); };
  const img = scr.querySelector('.find-img');
  if (img && !img.complete) { img.onload = reveal; img.onerror = reveal; } else reveal();
}

// Case Fouilles du plateau : un seul QR, l'objet est tiré au hasard (même poids = même chance pour chaque objet)
const FOUILLE_TABLE = [
  [1, { name: 'Trognon de pomme', eff: 'none', desc: 'Bon... Ben... Faut pas gâcher !' }],
  [1, { name: 'Vieille canette', eff: 'def_malus_round', val: 1, desc: '−1 Défense à un rival jusqu’à la fin de la manche' }],
  [1, { name: 'Kebab', eff: 'heal', val: 1, desc: 'Restaure 1 Cœur de Vie' }],
  [1, { name: 'Couvercle de poubelle', eff: 'null_enemy_weapon', dur: 'combat', desc: 'Réduit l’arme adverse à 0' }],
  [1, { name: 'Pot de Protéine', eff: 'double_muscles_atk', dur: 'combat', desc: 'Attaque/Défense Lascars doublée jusqu’à la fin de la manche' }],
  [1, { name: 'Balle perforante', eff: 'double_weapon_atk', dur: 'combat', desc: 'Bonus d’Attaque de l’arme à feu doublé (1 combat)' }],
  [1, { name: 'Passeport diplomatique', eff: 'cancel_police', desc: 'Annule un contrôle de police' }],
  [1, { name: 'Sifflet', eff: 'stray_dog', dur: 'tour', desc: 'Rallie le Chien Errant (+2 Atk / +2 Def)' }],
  [1, { name: 'Liasse de billets', eff: 'cash', val: 2000, desc: '+2 000 €' }],
  [1, { name: 'Sachet de beuh', eff: 'drug', val: 2, desc: '+2 kg' }],
  [1, { name: 'Arêtes de poisson', eff: 'none', desc: 'Y a plus grand-chose à manger là-dessus…' }],
  [1, { name: 'Vieilles baskets', eff: 'pm_turn', val: 3, desc: '+3 PM jusqu’à la fin du tour' }],
  [1, { name: 'Manteau de fourrure', eff: 'free_prostitute', desc: 'Déguisement de Mac : 1 Prostituée Niv. 1 gratuite' }],
  [1, { name: 'Bon de réduction Armurerie', eff: 'voucher', shop: 'Armurerie', desc: '−50 % sur ton prochain achat à l’Armurerie' }],
  [1, { name: 'Bon de réduction Concessionnaire', eff: 'voucher', shop: 'Concessionnaire', desc: '−50 % sur ton prochain achat au Concessionnaire' }],
  [1, { name: 'Bon de réduction Nightclub', eff: 'voucher', shop: 'Nightclub', desc: '−50 % sur ton prochain achat au Nightclub' }],
  [1, { name: 'Bon de réduction Sportclub', eff: 'voucher', shop: 'Sportclub', desc: '−50 % sur ton prochain achat au Sportclub' }]
];
// bagOnly : sans le cash ni la drogue (objet de départ de Jamel, rangé dans le sac)
function drawFouilleItem(bagOnly) {
  const table = bagOnly ? FOUILLE_TABLE.filter(([, it]) => it.eff !== 'cash' && it.eff !== 'drug') : FOUILLE_TABLE;
  const total = table.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * total;
  const pick = (table.find(([w]) => (r -= w) < 0) || table[0])[1];
  return Object.assign({ id: 'obj_' + Date.now(), type: 'ITEM_CARD', val: 0, dur: 'instant' }, pick);
}
function openFouille() {
  const it = drawFouilleItem();
  if (it.eff === 'cash') return openLootDiscoveryModal(it, "Récupérer", () => { localPlayer.pocketCash += it.val; spendActionPm(); });
  if (it.eff === 'drug') return openLootDiscoveryModal(it, "Récupérer", () => { localPlayer.drugs += it.val; spendActionPm(); });
  return openLootDiscoveryModal(it, "Ajouter au sac", () => { localPlayer.inventory.push(it); spendActionPm(); });
}

// =========================================================================
// COMBAT : pile de cartes des objets, on joue celles qu'on veut
// =========================================================================
let deckItems = [];
let deckIndex = 0;
let deckPicked = new Set();

const deckAttacking = () => !!currentDuelInfo && currentDuelInfo.role === 'attacker';
// Ce que la carte rapporte, et pourquoi elle est injouable
function deckGain(it) {
  const lascars = localPlayer.musclesOnPerson.reduce((s, m) => s + (m.bonusVal || 1), 0);
  const w = localPlayer.equipped.weapon;
  if (it.eff === 'double_muscles_atk') return musclesDoubled() ? 'Déjà actif' : `+${lascars} ${deckAttacking() ? 'ATK' : 'DÉF'}`;
  if (it.eff === 'double_weapon_atk') return `+${w && !myWeaponNullified ? w.bonusVal : 0} ATK`;
  if (it.eff === 'bonus_combat_atk') return `+${it.val || 1} ATK`;
  if (it.eff === 'null_enemy_weapon') return 'Arme 0';
  if (it.eff === 'def_malus_round') return '−1 DÉF';
  return '';
}
function deckBlocked(it) {
  if (it.eff === 'double_weapon_atk' && !isFirearm(localPlayer.equipped.weapon)) return 'Arme à feu requise';
  if (['double_weapon_atk', 'bonus_combat_atk'].includes(it.eff) && !deckAttacking()) return 'Sert quand tu attaques';
  return '';
}
const DECK_TAG = { double_muscles_atk: 'x2 Lascars', double_weapon_atk: '🔥 Arme à feu', null_enemy_weapon: 'Bouclier', bonus_combat_atk: 'Bonus', def_malus_round: 'À lancer' };
const DECK_DESC = {
  double_muscles_atk: 'Tes Lascars comptent double jusqu’à la fin de la manche.',
  double_weapon_atk: 'Le bonus d’Attaque de ton arme à feu est doublé pour ce combat.',
  null_enemy_weapon: 'L’arme de ton adversaire est réduite à 0 pour ce combat.',
  def_malus_round: 'Lance-la sur ton adversaire : −1 Défense jusqu’à la fin de la manche.'
};

// Ma stat si je joue les cartes choisies (sans rien modifier)
function deckPreview() {
  const saved = Object.assign({}, combatModifiers);
  deckItems.filter(it => deckPicked.has(it.id)).forEach(it => {
    if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'double_muscles_atk') combatModifiers.doubleMuscles = true;
    else if (it.eff === 'double_weapon_atk') combatModifiers.doubleWeapon = true;
  });
  const v = deckAttacking() ? getTotalAtk() : getTotalDef();
  combatModifiers = saved;
  return v;
}

function openCombatItemSelectorModal() {
  deckItems = localPlayer.inventory.filter(i => i && (i.dur === 'combat' || i.eff === 'def_malus_round'));
  if (!deckItems.length) return showAppAlert("Aucun objet de combat dans ton Sac !", "Sac Vide");
  deckItems.forEach((it, i) => { if (!it.id) it.id = 'obj_' + Date.now() + '_' + i; });
  deckIndex = 0;
  deckPicked = new Set();
  const scr = document.getElementById('modalCombatItemSelector');
  scr.dataset.theme = deckAttacking() ? 'atk' : 'def';
  document.getElementById('deckRound').innerText = currentSession.round || 1;
  document.getElementById('deckChip').innerHTML = deckAttacking() ? '<i class="ph-fill ph-sword"></i> Attaque' : '<i class="ph-fill ph-shield"></i> Défense';
  renderItemDeck();
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
  bindDeckSwipeAndDrag('deckCards', stepItemDeck);
}

function renderItemDeck() {
  const total = deckItems.length;
  document.getElementById('deckCards').innerHTML = deckItems.map((it, idx) => {
    const art = itemArt(it, true), why = deckBlocked(it), on = deckPicked.has(it.id);
    const btn = why
      ? `<button type="button" class="deck-buy-btn deck-btn off" disabled><i class="ph-bold ph-prohibit"></i> ${why}</button>`
      : `<button type="button" class="deck-buy-btn deck-btn ${on ? 'played' : ''}" onclick="event.stopPropagation(); toggleDeckItem(${idx})">${on ? '<i class="ph-bold ph-x"></i> Retirer' : '<i class="ph-bold ph-lightning"></i> Jouer'}</button>`;
    return `<div id="itemDeckCard_${idx}" onclick="pickDeckCard(${idx})" class="deck-card-item item-card ${on ? 'sel' : ''} ${why ? 'off' : ''}">
      <div>
        <div class="item-pic">${art ? `<img src="${art}" alt="">` : `<span>${itemEmoji(it)}</span>`}</div>
        <div class="flex items-center justify-between gap-1 mt-2"><span class="item-badge">${deckGain(it)}</span><span class="text-[9px] font-black text-slate-400">${DECK_TAG[it.eff] || ''}</span></div>
        <h4 class="text-[13px] font-black uppercase mt-1.5 truncate">${escapeHtml(it.name || 'Objet')}</h4>
        <p class="text-[10px] text-slate-300 mt-0.5 leading-tight line-clamp-2">${escapeHtml(DECK_DESC[it.eff] || it.desc || '')}</p>
      </div>${btn}</div>`;
  }).join('');
  applyDeckStackPositions('itemDeckCard', total, deckIndex);
  document.getElementById('deckDots').innerHTML = deckItems.map((it, i) => `<i class="${i === deckIndex ? 'on' : ''} ${deckPicked.has(it.id) ? 's' : ''}"></i>`).join('');
  const picked = deckItems.filter(it => deckPicked.has(it.id));
  document.getElementById('deckPicked').innerHTML = picked.length
    ? picked.map(it => { const art = itemArt(it, true); return `<span class="deck-chipsel">${art ? `<img src="${art}" alt="">` : `<b>${itemEmoji(it)}</b>`}${escapeHtml(String(it.name || '').split(' ')[0])}</span>`; }).join('')
    : '<span class="text-[11px] font-bold text-slate-500">aucune pour l’instant</span>';
  const before = deckAttacking() ? getTotalAtk() : getTotalDef();
  const after = deckPreview();
  document.getElementById('deckStat').innerHTML = `<div class="text-center"><small>${deckAttacking() ? 'Ton attaque' : 'Ta défense'}</small><b class="dim">${before}</b></div><i class="ph-bold ph-arrow-right"></i><div class="text-center"><small>Avec tes cartes</small><b class="${after !== before ? '' : 'dim'}">${after}</b></div>`;
  const cta = document.getElementById('btnConfirmCombatItems');
  cta.disabled = !picked.length;
  cta.innerText = picked.length ? `Jouer ${picked.length} carte${picked.length > 1 ? 's' : ''}` : 'Choisis une carte';
}

function stepItemDeck(dir) {
  const next = deckIndex + dir;
  if (next < 0 || next >= deckItems.length) return;
  deckIndex = next;
  renderItemDeck();
}
function pickDeckCard(idx) { if (idx !== deckIndex) { deckIndex = idx; renderItemDeck(); } }
function toggleDeckItem(idx) {
  const it = deckItems[idx];
  if (!it || deckBlocked(it)) return;
  if (deckPicked.has(it.id)) deckPicked.delete(it.id); else deckPicked.add(it.id);
  renderItemDeck();
}
function closeItemDeck() {
  const scr = document.getElementById('modalCombatItemSelector');
  scr.classList.add('hidden');
  scr.classList.remove('show');
}

// Rival visé par la canette pendant le combat : mon adversaire (en attaque comme en défense)
function deckOpponent() {
  const name = currentDuelInfo && currentDuelInfo.opponentCaid;
  return (connectedRivals || []).find(r => (currentDuelInfo.opponentSocketId && r.socketId === currentDuelInfo.opponentSocketId) || allyRivalName(r) === name);
}

function confirmCombatItems() {
  const picked = deckItems.filter(it => deckPicked.has(it.id) && !deckBlocked(it));
  if (!picked.length) return;
  const playedNames = [];
  picked.forEach(it => {
    const idx = localPlayer.inventory.indexOf(it);
    if (idx < 0) return;
    playedNames.push(it.name);
    if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'double_muscles_atk') localPlayer.proteinRound = currentSession.round || 1;
    else if (it.eff === 'double_weapon_atk') combatModifiers.doubleWeapon = true;
    else if (it.eff === 'null_enemy_weapon') combatModifiers.nullEnemyWeapon = true;
    else if (it.eff === 'def_malus_round') {
      const opp = deckOpponent();
      if (opp && socket) socket.emit('apply_special_to_target', { targetPlayerToken: opp.playerToken, targetSocketId: opp.socketId, effectType: 'canette', senderCaid: getMyCaid().name });
    }
    localPlayer.inventory.splice(idx, 1);
  });
  closeItemDeck();
  refreshHud();
  if (socket && currentDuelInfo) {
    const stat = (currentDuelInfo.role === 'attacker') ? getTotalAtk() : getTotalDef();
    socket.emit('combat_play_items', { itemNames: playedNames, newTotalStat: stat });
  }
  fightLog(`✔️ Joué : ${escapeHtml(playedNames.join(', '))}`);
  updateArenaLiveStats();
}

// =========================================================================
// PASSEPORT DIPLOMATIQUE : proposé au moment du contrôle de police
// =========================================================================
async function offerPassportAtPolice() {
  const idx = localPlayer.inventory.findIndex(it => it && it.eff === 'cancel_police');
  if (idx < 0) return false;
  if (!await showAppConfirm("Sortir ton Passeport diplomatique ?\n\nLe contrôle est annulé, le passeport est utilisé.", "🛂 Passeport diplomatique", "Sortir le passeport", "Le garder")) return false;
  localPlayer.inventory.splice(idx, 1);
  refreshHud();
  await showAppAlert("« Bonjour m'sieur l'agent… On ne va pas risquer un incident diplomatique, si ? »\n\nContrôle annulé !", "🛂 Contrôle annulé");
  return true;
}
