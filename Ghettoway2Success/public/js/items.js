// Objets : découverte en fouillant (carte de l'objet), cartes des objets de combat, Vieille canette, Passeport diplomatique

// Image de la carte d'un objet (trouvée par son nom) ; null = carte en carton dessinée
const ITEM_ART = [
  [/kebab/i, 'fouille-kebab'],
  [/passeport/i, 'fouille-passeport'],
  [/couvercle/i, 'fouille-couvercle'],
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
  [/r[ée]duction sportclub/i, 'fouille-bon-sportclub'],
  [/perforante/i, 'fouille-balle-or'],
  [/botox/i, 'fouille-botox'],
  [/ticket .*gratter/i, 'fouille-ticket'],
  [/talkie/i, 'fouille-talkie'],
  [/pied de biche/i, 'fouille-pied-de-biche'],
  [/lunettes/i, 'fouille-lunettes'],
  [/rat crev/i, 'fouille-rat']
];
function itemArt(item, thumb) {
  const hit = ITEM_ART.find(([re]) => re.test(item && (item.name || item.n) || ''));
  return hit ? `${hit[1]}${thumb ? '-vignette' : ''}.webp` : null;
}
const ITEM_EMOJI = { double_weapon_atk: '💥', double_muscles_atk: '🥛', null_enemy_weapon: '🗑️', bonus_combat_atk: '🔪', def_malus_round: '🥫', cancel_police: '🛂', heal: '🥙', stray_dog: '🐕', none: '🍎', cash: '💰', drug: '🌿', pm_turn: '👟', free_prostitute: '🧥', botox: '💉', scratch: '🎰', crowbar: '🛠️', patrol_reroll: '📻', double_fouille: '🕶️', voucher: '🎟️' };
const itemEmoji = it => /arête|poisson/i.test(it.name || '') ? '🐟' : /rat crev/i.test(it.name || '') ? '🐀' : ITEM_EMOJI[it.eff] || (/kebab/i.test(it.name || '') ? '🥙' : '🎒');
const itemRow = (icon, label, after) => `<div class="police-row find-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft">${after}</span></div>`;

// =========================================================================
// CARTE JOUÉE : la carte grandit, tampon « JOUÉE » avec choc, puis les effets mis en évidence
// rows : [[icône, libellé, valeur], ...] ; se résout quand le joueur touche « Continuer »
// =========================================================================
// it : une carte, ou plusieurs (pile du combat : elles tombent une à une, la suivante après le tampon de la précédente)
// opts : { kicker (bandeau du haut), stamp (icône du tampon rond), face (HTML de la carte, ex. équipement de boutique),
//          action: { icon, label, run } (bouton en plus de « Continuer »), flyToSac (la carte file vers le bouton Sac),
//          autoClose (ms : se ferme toute seule, sans bouton ni effets — ex. avant le ticket à gratter) }
function showCardPlayed(it, rows, title, opts = {}) {
  const items = Array.isArray(it) ? it : [it];
  const n = items.length;
  return msgQueue(done => {
    const scr = document.getElementById('playedScreen');
    const face = x => opts.face || (itemArt(x) ? `<img src="${itemArt(x)}" alt="${escapeHtml(x.name || '')}">` : findFallback(x));
    const stamp = `<b class="played-stamp ${opts.stamp ? 'alt' : ''}"><i class="ph-bold ${opts.stamp || 'ph-check'}"></i></b>`;
    const box = document.getElementById('playedCard');
    box.classList.toggle('multi', n > 1);
    box.innerHTML = n > 1 ? items.map((x, i) => `<div class="played-one" style="--i:${i};--n:${n}">${face(x)}${stamp}</div>`).join('') : face(items[0]) + stamp;
    const lag = (n - 1) * 1.2; // la carte suivante n'arrive qu'une fois le tampon de la précédente posé
    scr.style.setProperty('--lag', `${lag}s`);
    document.getElementById('playedKicker').innerHTML = `<i class="ph-fill ph-cards"></i> ${escapeHtml(opts.kicker || (n > 1 ? 'Cartes jouées' : 'Carte jouée'))}`;
    document.getElementById('playedTitle').innerText = title || items[0].name || 'Objet';
    document.getElementById('playedRows').innerHTML = rows.map(([icon, label, value], i) =>
      `<div class="police-row played-row" style="animation-delay:${1.15 + lag + i * 0.18}s"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft">${value}</span></div>`).join('');
    const act = document.getElementById('playedAct'), cta = document.getElementById('playedCta');
    const close = () => {
      if (opts.flyToSac) flyCardToSac(box);
      scr.classList.add('hidden');
      scr.classList.remove('show');
    };
    act.classList.toggle('hidden', !opts.action);
    cta.className = opts.action ? 'ally-ghost mt-2' : 'find-cta mt-3';
    if (opts.action) {
      act.innerHTML = `<i class="ph-bold ${opts.action.icon}"></i> ${escapeHtml(opts.action.label)}`;
      act.onclick = () => { close(); done(); opts.action.run(); };
    }
    cta.onclick = () => { close(); done(); };
    scr.classList.toggle('auto', !!opts.autoClose);
    if (opts.autoClose) setTimeout(() => { close(); done(); }, opts.autoClose);
    scr.classList.remove('hidden', 'show');
    void scr.offsetWidth;
    scr.classList.add('show');
    items.forEach((_, i) => setTimeout(() => buzz(70), 1050 + i * 1200)); // chaque tampon se pose
  });
}
// Après un achat : une copie de la carte rapetisse et file vers le bouton Sac de l'écran principal
function flyCardToSac(box) {
  const target = document.getElementById('btnOpenSac');
  const from = box.getBoundingClientRect(), to = target && target.getBoundingClientRect();
  if (!to || !to.width) return;
  const ghost = box.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.className = 'played-card fly-to-sac';
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.appendChild(ghost);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ghost.style.transform = `translate(${to.left + 30 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(0.12)`;
    ghost.style.opacity = '0.2';
  }));
  setTimeout(() => ghost.remove(), 750);
}

// =========================================================================
// TICKET À GRATTER : le résultat est tiré avant, on le découvre en grattant la zone argentée
// =========================================================================
let scratchDone = null;
function openScratch(win, prize) {
  const scr = document.getElementById('scratchScreen');
  const symbols = win ? ['💰', '💰', '💰'] : [['🦆', '💰', '🍌'], ['💰', '🦆', '💰'], ['🍌', '🦆', '🦆']][Math.floor(Math.random() * 3)];
  document.getElementById('scratchPrize').innerHTML = `<div class="sym">${symbols.map(s => `<span>${s}</span>`).join('')}</div><b class="${win ? 'win' : 'lose'}">${win ? `${prize.toLocaleString()} €` : 'PERDU'}</b>`;
  document.getElementById('scratchTitle').innerText = 'GRATTE !';
  document.getElementById('scratchSub').innerText = 'Frotte la zone argentée avec ton doigt.';
  document.getElementById('scratchResult').classList.add('hidden');
  document.getElementById('scratchCta').classList.add('hidden');
  scr.classList.remove('hidden', 'show', 'revealed', 'won');
  void scr.offsetWidth;
  scr.classList.add('show');
  return new Promise(resolve => {
    scratchDone = () => {
      scr.classList.add('revealed');
      scr.classList.toggle('won', win);
      document.getElementById('scratchTitle').innerText = win ? 'GAGNANT !' : 'PERDU…';
      document.getElementById('scratchSub').innerText = win ? 'Trois sacs de billets !' : 'Pas les trois mêmes… La prochaine fois !';
      const res = document.getElementById('scratchResult');
      res.innerHTML = win ? `<i class="ph-bold ph-coins"></i><span class="lbl">Dans ta poche</span><span class="aft">+${prize.toLocaleString()} €</span>`
        : `<i class="ph-bold ph-smiley-sad"></i><span class="lbl">Rien sous la pellicule</span><span class="aft">0 €</span>`;
      res.classList.remove('hidden');
      document.getElementById('scratchCta').classList.remove('hidden');
      buzz(win ? [60, 60, 120] : 60);
    };
    document.getElementById('scratchCta').onclick = () => { scr.classList.add('hidden'); scr.classList.remove('show'); resolve(win); };
    requestAnimationFrame(setupScratchCanvas);
  });
}
// Couche argentée : on l'efface au doigt (ou à la souris) ; au-delà de 60 % grattés, tout se découvre
function setupScratchCanvas() {
  const cv = document.getElementById('scratchCanvas');
  const box = cv.parentElement; // taille sans la rotation d'arrivée du ticket
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(box.offsetWidth * dpr));
  cv.height = Math.max(1, Math.round(box.offsetHeight * dpr));
  cv.classList.remove('gone');
  const ctx = cv.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
  g.addColorStop(0, '#9ca3af'); g.addColorStop(0.45, '#e5e7eb'); g.addColorStop(0.55, '#d1d5db'); g.addColorStop(1, '#6b7280');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 160; i++) ctx.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2 * dpr, 2 * dpr);
  ctx.fillStyle = 'rgba(55,65,81,0.75)';
  ctx.font = `900 ${Math.round(cv.height * 0.3)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRATTE ICI', cv.width / 2, cv.height / 2);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = 24 * dpr;
  let last = null, moves = 0, finished = false;
  const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const cleared = () => {
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, t = 0;
    for (let i = 3; i < d.length; i += 4 * 16) { t++; if (d[i] < 40) n++; }
    return n / t;
  };
  const scratch = e => {
    if (finished) return;
    const p = at(e);
    ctx.beginPath();
    ctx.moveTo(...(last || p));
    ctx.lineTo(...p);
    ctx.stroke();
    last = p;
    if (++moves % 6 === 0 && cleared() > 0.6) {
      finished = true;
      cv.classList.add('gone');
      if (scratchDone) scratchDone();
    }
  };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); last = null; scratch(e); };
  cv.onpointermove = e => { if (e.buttons || e.pointerType === 'touch') scratch(e); };
  cv.onpointerup = cv.onpointercancel = () => { last = null; };
}

// =========================================================================
// DÉCOUVERTE : on fouille la poubelle, puis la carte de l'objet apparaît
// =========================================================================
let findTimer = null;
function findRows(it) {
  const e = it.eff;
  if (e === 'cash') return itemRow('ph-coins', 'Gain', `+${(it.val || 0).toLocaleString()} €`);
  if (e === 'drug') return itemRow('ph-plant', 'Gain', `+${it.val || 0} kg`);
  if (e === 'heal' || /kebab/i.test(it.name || '')) return itemRow('ph-heart', 'Effet', '+1 Cœur de vie') + itemRow('ph-backpack', 'Quand ?', 'ton tour ou en combat');
  if (e === 'cancel_police') return itemRow('ph-siren', 'Effet', 'annule un contrôle') + itemRow('ph-backpack', 'Quand ?', 'proposé au prochain contrôle');
  if (e === 'none') return itemRow('ph-trash', 'Effet', 'aucun…') + itemRow('ph-backpack', 'Quand ?', 'faut pas gâcher');
  if (e === 'pm_turn') return itemRow('ph-sneaker-move', 'Effet', `+${isRadioEffectActive('BASKETS_PM_SET') ? getRadioEffectValue('BASKETS_PM_SET', 5) : (it.val || 3)} PM jusqu’à la fin du tour`) + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (e === 'free_prostitute') return itemRow('ph-high-heel', 'Effet', '1 Prostituée Niv. 1 gratuite') + itemRow('ph-backpack', 'Quand ?', 'utilisé tout seul au Nightclub');
  if (e === 'scratch') return itemRow('ph-ticket', 'Effet', `1 chance sur 3 : +${(it.val || 5000).toLocaleString()} €`) + itemRow('ph-backpack', 'Quand ?', 'à gratter pendant ton tour');
  if (e === 'crowbar') return itemRow('ph-vault', 'Effet', 'coffre d’un rival : 5 000 € ou 5 kg') + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (e === 'patrol_reroll') return itemRow('ph-dice-five', 'Effet', 'tu choisis le prochain dé de patrouille') + itemRow('ph-backpack', 'Quand ?', 'pendant ton tour');
  if (e === 'double_fouille') return itemRow('ph-eye', 'Effet', '2 objets, tu gardes le meilleur') + itemRow('ph-backpack', 'Quand ?', 'tout seul à ta prochaine Fouille');
  if (e === 'botox') return itemRow('ph-syringe', 'Effet', 'prochaine rente des prostituées x2') + itemRow('ph-backpack', 'Quand ?', 'tout seul au début de la manche');
  if (e === 'voucher') return itemRow('ph-ticket', 'Effet', `−50 % : ${escapeHtml(it.shop || '')}`) + itemRow('ph-backpack', 'Quand ?', 'prochain achat (à activer)');
  if (e === 'def_malus_round') return itemRow('ph-shield', 'Effet', '−1 Défense à un rival') + itemRow('ph-backpack', 'Quand ?', 'avant ou pendant un combat');
  if (e === 'stray_dog') return itemRow('ph-dog', 'Effet', 'rallie le Chien Errant') + itemRow('ph-backpack', 'Quand ?', 'ton tour ou en combat');
  if (it.dur === 'combat') return itemRow('ph-sword', 'Effet', escapeHtml(it.desc || 'objet de combat')) + itemRow('ph-backpack', 'Quand ?', 'pendant un combat');
  return itemRow('ph-sparkle', 'Effet', escapeHtml(it.desc || 'objet spécial'));
}
// Carte en carton pour un objet sans image (cash, drogue, objet inconnu)
const findFallback = it => `<div class="find-carton"><div class="find-carton-ic">${itemEmoji(it)}</div><div class="find-carton-n">${escapeHtml(it.name || 'Objet')}</div><div class="find-carton-d">${escapeHtml(it.desc || '')}</div></div>`;

// it : { name, desc, eff, val, dur } ; cta : texte du bouton ; onClaim : appelé à la validation
const findFace = it => { const art = itemArt(it); return art ? `<img class="find-img" src="${art}" alt="${escapeHtml(it.name || '')}">` : findFallback(it); };
function openLootDiscoveryModal(it, cta, onClaim) {
  document.getElementById('findCard').classList.remove('duo');
  document.getElementById('findCard').innerHTML = findFace(it);
  document.getElementById('findBottom').innerHTML = `<h2 class="font-anton find-head">${it.eff === 'none' ? 'BOF…' : 'BIEN JOUÉ !'}</h2>
    <div class="flex flex-col gap-1.5 mt-3">${findRows(it)}</div>
    <button type="button" id="btnLootAction" class="find-cta mt-4">${escapeHtml(cta)}</button>`;
  document.getElementById('btnLootAction').onclick = () => {
    clearTimeout(findTimer);
    document.getElementById('modalLootDiscovery').classList.add('hidden');
    onClaim();
    refreshHud();
  };
  revealFindScreen();
}
// Lunettes de soleil : 2 cartes côte à côte, on touche celle qu'on garde
let findChoices = [];
function openFouilleChoice(items) {
  findChoices = items;
  const card = document.getElementById('findCard');
  card.classList.add('duo');
  card.innerHTML = items.map((it, i) => `<button type="button" class="find-duo-c" onclick="pickFouilleChoice(${i})">${findFace(it)}<span>${escapeHtml(it.name || 'Objet')}</span></button>`).join('');
  document.getElementById('findBottom').innerHTML = `<h2 class="font-anton find-head">LUNETTES DE SOLEIL</h2>
    <div class="text-center text-sm font-bold text-slate-300 mt-2">Tu repères 2 objets dans la poubelle.<br>Touche celui que tu gardes, l'autre reste au fond.</div>`;
  revealFindScreen();
}
function pickFouilleChoice(i) {
  const it = findChoices[i];
  if (!it) return;
  findChoices = [];
  findInstant = true; // déjà fouillée : la carte choisie s'affiche tout de suite
  claimFouille(it);
}
// Particules : détritus qui jaillissent de la poubelle pendant la fouille
const FIND_JUNK = ['📄', '🥫', '🍌', '🦴', '🧦', '📰', '🍕', '🥡', '🧻', '🍾'];
const rnd = (a, b) => a + Math.random() * (b - a);
function spawnFindParticles() {
  document.getElementById('findDebris').innerHTML = Array.from({ length: 32 }, (_, i) => {
    const dust = i % 3 === 0;
    const style = `--dx:${rnd(-170, 170) | 0}px;--up:${rnd(140, 360) | 0}px;--rot:${rnd(-540, 540) | 0}deg;animation-delay:${rnd(0, 1).toFixed(2)}s;animation-duration:${rnd(0.8, 1.3).toFixed(2)}s`;
    return dust ? `<i class="dust" style="${style}"></i>` : `<i style="${style}">${FIND_JUNK[Math.floor(Math.random() * FIND_JUNK.length)]}</i>`;
  }).join('');
}
// La fouille dure le temps de charger la carte (et au moins 2 s)
let findInstant = false;
function revealFindScreen() {
  const scr = document.getElementById('modalLootDiscovery');
  document.getElementById('findRound').innerText = currentSession.round || 1;
  if (findInstant) {
    findInstant = false;
    clearTimeout(findTimer);
    scr.classList.remove('hidden');
    scr.dataset.state = 'carte';
    return;
  }
  spawnFindParticles();
  scr.dataset.state = 'fouille';
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
  clearTimeout(findTimer);
  const t0 = Date.now();
  const reveal = () => { findTimer = setTimeout(() => { if (!scr.classList.contains('hidden')) scr.dataset.state = 'carte'; }, Math.max(0, 2000 - (Date.now() - t0))); };
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
  [1, { name: 'Bon de réduction Sportclub', eff: 'voucher', shop: 'Sportclub', desc: '−50 % sur ton prochain achat au Sportclub' }],
  [1, { name: 'Seringue de botox', eff: 'botox', desc: 'La prochaine rente de tes prostituées au QG est doublée (une seule fois)' }],
  [1, { name: 'Ticket à gratter', eff: 'scratch', val: 5000, desc: '1 chance sur 3 de gagner 5 000 €' }],
  [1, { name: 'Pied de biche', eff: 'crowbar', desc: 'Vole dans le coffre du QG d’un rival : jusqu’à 5 000 €, 5 kg, ou un partage des deux' }],
  [1, { name: 'Talkie-walkie de flic', eff: 'patrol_reroll', desc: 'Choisis à l’avance le dé et la direction du prochain déplacement de la patrouille' }],
  [1, { name: 'Lunettes de soleil', eff: 'double_fouille', desc: 'À ta prochaine Fouille, tu vois 2 objets et tu gardes le meilleur' }],
  [1, { name: 'Rat crevé', eff: 'none', desc: 'Il a eu une vie plus dure que toi.' }]
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
  // Lunettes de soleil dans le Sac : utilisées toutes seules, 2 objets différents au choix
  const g = localPlayer.inventory.findIndex(it => it && it.eff === 'double_fouille');
  if (g < 0) return claimFouille(drawFouilleItem());
  localPlayer.inventory.splice(g, 1);
  const a = drawFouilleItem();
  let b = drawFouilleItem();
  for (let k = 0; k < 10 && b.name === a.name; k++) b = drawFouilleItem();
  b.id += '_b';
  openFouilleChoice([a, b]);
}
function claimFouille(it) {
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

// Cartes jouables pendant un combat (Kebab et Sifflet aussi : se soigner ou rallier le chien juste avant de cogner)
// (un vieux Kebab sans « eff » se reconnaît à son nom)
const isHealItem = it => it.eff === 'heal' || it.type === 'CONSUMABLE' || /kebab/i.test(it.name || '');
const isCombatItem = it => it.dur === 'combat' || isHealItem(it) || ['def_malus_round', 'stray_dog'].includes(it.eff);
const deckAttacking = () => !!currentDuelInfo && currentDuelInfo.role === 'attacker';
// Ce que la carte rapporte, et pourquoi elle est injouable
function deckGain(it) {
  if (deckBlocked(it)) return '';
  // Gain réel calculé comme la stat (bonus de la radio, arme neutralisée...)
  if (['double_muscles_atk', 'double_weapon_atk', 'bonus_combat_atk', 'stray_dog'].includes(it.eff)) {
    const now = deckAttacking() ? getTotalAtk() : getTotalDef();
    return `+${deckPreview([it]) - now} ${deckAttacking() ? 'ATK' : 'DÉF'}`;
  }
  if (it.eff === 'null_enemy_weapon') return 'Arme 0';
  if (it.eff === 'def_malus_round') return '−1 DÉF';
  if (isHealItem(it)) return `+${it.val || 1} ❤️`;
  return '';
}
function deckBlocked(it) {
  if (!isCombatItem(it)) return 'Pas en combat';
  if (isHealItem(it) && isRadioEffectActive('NO_HEAL')) return 'Hôpital débordé';
  if (isHealItem(it) && localPlayer.hearts >= 3) return 'Cœurs au max';
  if (it.eff === 'stray_dog' && localPlayer.strayDogActive) return 'Chien déjà avec toi';
  if (it.eff === 'double_muscles_atk' && musclesDoubled()) return 'Déjà actif';
  if (it.eff === 'double_weapon_atk' && !isFirearm(localPlayer.equipped.weapon)) return 'Arme à feu requise';
  if (['double_weapon_atk', 'bonus_combat_atk'].includes(it.eff) && !deckAttacking()) return 'Sert quand tu attaques';
  return '';
}
const DECK_TAG = { double_muscles_atk: 'x2 Lascars', double_weapon_atk: '🔥 Arme à feu', null_enemy_weapon: 'Bouclier', bonus_combat_atk: 'Bonus', def_malus_round: 'À lancer' };
const DECK_DESC = {
  double_muscles_atk: 'Tes Lascars comptent double jusqu’à la fin de la manche.',
  double_weapon_atk: 'Le bonus d’Attaque de ton arme à feu est doublé pour ce combat.',
  null_enemy_weapon: 'L’arme de ton adversaire est réduite à 0 pour ce combat.',
  def_malus_round: 'Lance-la sur ton adversaire : −1 Défense jusqu’à la fin de la manche.',
  heal: 'Restaure 1 Cœur de Vie tout de suite.',
  stray_dog: 'Le Chien Errant te rejoint : +2 Attaque / +2 Défense.'
};

// Ma stat si je joue ces cartes (par défaut celles choisies), sans rien modifier
function deckPreview(items = deckItems.filter(it => deckPicked.has(it.id))) {
  const saved = Object.assign({}, combatModifiers), dog = localPlayer.strayDogActive;
  items.forEach(it => {
    if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'double_muscles_atk') combatModifiers.doubleMuscles = true;
    else if (it.eff === 'double_weapon_atk') combatModifiers.doubleWeapon = true;
    else if (it.eff === 'stray_dog') localPlayer.strayDogActive = true;
  });
  const v = deckAttacking() ? getTotalAtk() : getTotalDef();
  combatModifiers = saved;
  localPlayer.strayDogActive = dog;
  return v;
}

function openCombatItemSelectorModal() {
  // Tout le Sac : les objets de combat d'abord, les autres sont visibles mais grisés
  const bag = localPlayer.inventory.filter(Boolean);
  deckItems = [...bag.filter(isCombatItem), ...bag.filter(i => !isCombatItem(i))];
  if (!deckItems.length) return showAppAlert("Ton Sac est vide !", "Sac Vide");
  deckItems.forEach((it, i) => { if (!it.id) it.id = 'obj_' + Date.now() + '_' + i; });
  deckIndex = 0;
  deckPicked = new Set();
  const scr = document.getElementById('modalCombatItemSelector');
  scr.dataset.theme = deckAttacking() ? 'atk' : 'def';
  document.getElementById('deckRound').innerText = currentSession.round || 1;
  document.getElementById('deckChip').innerHTML = deckAttacking() ? '<i class="ph-fill ph-sword"></i> Attaque' : '<i class="ph-fill ph-shield"></i> Défense';
  const n = deckItems.length, nc = deckItems.filter(isCombatItem).length;
  document.getElementById('deckCount').innerText = n === 1
    ? (nc ? 'Ton seul objet se joue en combat. Une carte jouée est perdue.' : 'Ton seul objet ne sert pas en combat.')
    : `${n} objets dans ton Sac, fais-les glisser. ` + (nc ? `${nc > 1 ? nc + ' se jouent' : '1 se joue'} en combat. Une carte jouée est perdue.` : 'Aucun ne sert pendant un combat.');
  buildItemDeck();
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
}

// Pile 3D comme dans les boutiques : on glisse ou on touche les flèches, la carte du dessus est la carte active
function buildItemDeck() {
  document.getElementById('deckCards').innerHTML = deckItems.map((it, idx) => {
    const big = itemArt(it);
    const face = big ? `<img class="deck-face" src="${big}" alt="${escapeHtml(it.name || '')}" draggable="false">`
      : `<div class="deck-face deck-face-txt"><span>${itemEmoji(it)}</span><h4>${escapeHtml(it.name || 'Objet')}</h4><p>${escapeHtml(DECK_DESC[it.eff] || it.desc || '')}</p></div>`;
    return `<div id="itemDeckCard_${idx}" class="deck-card-item item-deck" onclick="pickDeckCard(${idx})">
      <div class="deck-cardbox">${face}</div>
      <div class="deck-under"><span class="item-badge">${deckGain(it)}</span><span id="itemDeckBtn_${idx}"></span></div></div>`;
  }).join('');
  document.querySelectorAll('#modalCombatItemSelector .deck-arrow').forEach(b => b.classList.toggle('hidden', deckItems.length < 2));
  bindDeckSwipeAndDrag('deckCards', stepItemDeck);
  updateItemDeck();
}

function updateItemDeck() {
  deckItems.forEach((it, idx) => {
    const why = deckBlocked(it), on = deckPicked.has(it.id);
    const slot = document.getElementById(`itemDeckCard_${idx}`);
    if (!slot) return;
    slot.className = `deck-card-item item-deck ${on ? 'sel' : ''} ${why ? 'off' : ''}`;
    document.getElementById(`itemDeckBtn_${idx}`).outerHTML = why
      ? `<button type="button" id="itemDeckBtn_${idx}" class="deck-buy-btn deck-btn off" disabled><i class="ph-bold ph-prohibit"></i> ${why}</button>`
      : `<button type="button" id="itemDeckBtn_${idx}" class="deck-buy-btn deck-btn ${on ? 'played' : ''}" onclick="event.stopPropagation(); toggleDeckItem(${idx})">${on ? '<i class="ph-bold ph-x"></i> Retirer' : '<i class="ph-bold ph-lightning"></i> Jouer'}</button>`;
  });
  document.getElementById('deckDots').innerHTML = deckItems.length < 2 ? '' : deckItems.map((it, i) => `<i class="${i === deckIndex ? 'on' : ''} ${deckPicked.has(it.id) ? 's' : ''}"></i>`).join('');
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
  applyDeckStackPositions('itemDeckCard', deckItems.length, deckIndex);
}

function stepItemDeck(dir) {
  const next = deckIndex + dir;
  if (next < 0 || next >= deckItems.length) return;
  deckIndex = next;
  updateItemDeck();
}
function pickDeckCard(idx) { if (idx !== deckIndex) { deckIndex = idx; updateItemDeck(); } }
function toggleDeckItem(idx) {
  const it = deckItems[idx];
  if (!it || deckBlocked(it)) return;
  if (deckPicked.has(it.id)) deckPicked.delete(it.id); else deckPicked.add(it.id);
  updateItemDeck();
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

const DECK_ICON = { heal: 'ph-heart', stray_dog: 'ph-dog', def_malus_round: 'ph-shield-slash', null_enemy_weapon: 'ph-shield', double_weapon_atk: 'ph-crosshair', double_muscles_atk: 'ph-barbell', bonus_combat_atk: 'ph-sword' };
function confirmCombatItems() {
  const picked = deckItems.filter(it => deckPicked.has(it.id) && !deckBlocked(it));
  if (!picked.length) return;
  // Ce que chaque carte rapporte et la stat avant, pour l'écran des cartes jouées
  const atk = deckAttacking();
  const rows = picked.map(it => [DECK_ICON[isHealItem(it) ? 'heal' : it.eff] || 'ph-cards', escapeHtml(it.name), deckGain(it) || '✓']);
  const before = atk ? getTotalAtk() : getTotalDef();
  const playedNames = [];
  picked.forEach(it => {
    const idx = localPlayer.inventory.indexOf(it);
    if (idx < 0) return;
    playedNames.push(it.name);
    if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'double_muscles_atk') localPlayer.proteinRound = currentSession.round || 1;
    else if (it.eff === 'double_weapon_atk') combatModifiers.doubleWeapon = true;
    else if (it.eff === 'null_enemy_weapon') combatModifiers.nullEnemyWeapon = true;
    else if (isHealItem(it)) localPlayer.hearts = Math.min(3, localPlayer.hearts + (it.val || 1));
    else if (it.eff === 'stray_dog') {
      localPlayer.strayDogActive = true;
      if (socket) socket.emit('claim_stray_dog', { senderCaid: getMyCaid().name, playerToken: myPlayerToken });
    }
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
  const after = atk ? getTotalAtk() : getTotalDef();
  showCardPlayed(picked, rows.concat([[atk ? 'ph-sword' : 'ph-shield', atk ? 'Ton attaque' : 'Ta défense', `${before} → ${after}`]]), picked.length > 1 ? `${picked.length} CARTES JOUÉES` : picked[0].name);
}

// =========================================================================
// TALKIE-WALKIE DE FLIC : on choisit en secret le dé et la direction de la prochaine patrouille
// =========================================================================
let talkieItem = null, talkieRoll = 3, talkieLeft = true;
function openTalkie(it) {
  talkieItem = it;
  const scr = document.getElementById('talkieScreen');
  document.getElementById('talkieRound').innerText = currentSession.round || 1;
  document.getElementById('talkiePic').src = itemArt(it) || 'patrol-car.webp';
  renderTalkie();
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
}
function renderTalkie() {
  document.getElementById('talkieDice').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button type="button" class="${n === talkieRoll ? 'on' : ''}" onclick="talkieRoll=${n};renderTalkie()">${n}</button>`).join('');
  document.getElementById('talkieDirs').innerHTML = [[true, '⬅ Gauche'], [false, 'Droite ➡']].map(([l, t]) => `<button type="button" class="${l === talkieLeft ? 'on' : ''}" onclick="talkieLeft=${l};renderTalkie()">${t}</button>`).join('');
}
function closeTalkie() {
  const scr = document.getElementById('talkieScreen');
  scr.classList.add('hidden');
  scr.classList.remove('show');
}
async function sendTalkieOrder() {
  const idx = localPlayer.inventory.indexOf(talkieItem);
  if (idx < 0) return closeTalkie();
  const it = talkieItem;
  if (socket) socket.emit('rig_patrol', { roll: talkieRoll, left: talkieLeft });
  localPlayer.inventory.splice(idx, 1);
  talkieItem = null;
  closeTalkie();
  refreshHud();
  await showCardPlayed(it, [['ph-dice-five', 'Dé de la prochaine patrouille', `${talkieRoll}`], ['ph-arrows-left-right', 'Direction', talkieLeft ? '⬅ Gauche' : 'Droite ➡'], ['ph-broadcast', 'Bonus de la radio', 'en plus']]);
}

// =========================================================================
// PASSEPORT DIPLOMATIQUE : proposé au moment du contrôle de police
// =========================================================================
async function offerPassportAtPolice() {
  const idx = localPlayer.inventory.findIndex(it => it && it.eff === 'cancel_police');
  if (idx < 0) return false;
  // Écran plein page avec la carte du passeport : on le sort ou on le garde
  const scr = document.getElementById('passportScreen');
  document.getElementById('passRound').innerText = currentSession.round || 1;
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
  const use = await new Promise(resolve => {
    document.getElementById('passUse').onclick = () => resolve(true);
    document.getElementById('passKeep').onclick = () => resolve(false);
  });
  scr.classList.add('hidden');
  scr.classList.remove('show');
  if (!use) return false;
  const passport = localPlayer.inventory.splice(idx, 1)[0];
  refreshHud();
  await showCardPlayed(passport, [['ph-siren', 'Contrôle de police', 'annulé'], ['ph-chat-teardrop-text', '« On ne va pas risquer un incident diplomatique, si ? »', '']]);
  return true;
}

// Préchargement : toutes les cartes (grandes et vignettes) et les décors des écrans d'objets, une image à la fois
// quelques secondes après l'ouverture ; le service worker les garde ensuite en cache (aucune n'arrive en retard)
function preloadCardImages() {
  const files = ITEM_ART.flatMap(([, f]) => [`${f}.webp`, `${f}-vignette.webp`])
    .concat(['fouilles-ruelle.webp', 'ticket-gratter.webp', 'qg-coffre.webp', 'patrol-car.webp']);
  let i = 0;
  const next = () => {
    if (i >= files.length) return;
    const img = new Image();
    img.onload = img.onerror = () => setTimeout(next, 40);
    img.src = files[i++];
  };
  next();
}
window.addEventListener('load', () => setTimeout(preloadCardImages, 2500));
