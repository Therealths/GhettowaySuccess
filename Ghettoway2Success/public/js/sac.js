// Sac plein écran : argent et drogue (sur toi / au QG), ce que tu portes (arme, protection, véhicule),
// puis la pile de cartes du Sac (objets de Fouille et équipement en réserve), filtrable

let sacFilter = 'tout';
let sacIndex = 0;
let sacList = [];

const SAC_SLOTS = [
  { key: 'weapon', label: 'Arme', icon: 'ph-sword', cls: 'atk', unit: 'ATK' },
  { key: 'armor', label: 'Protection', icon: 'ph-shield', cls: 'def', unit: 'DÉF' },
  { key: 'vehicle', label: 'Véhicule', icon: 'ph-moped', cls: 'veh', unit: 'PM' }
];
const isGear = it => ['WEAPON', 'ARMOR', 'VEHICLE'].includes(it.type);
const inSac = it => it && it.name !== 'À pied' && !['FOOT', 'MUSCLE', 'PROSTITUTE'].includes(it.type);
const sacItems = () => localPlayer.inventory.filter(inSac);
// Matériel de labo sur soi : une carte du Sac en plus (rangée avec l'équipement), qui s'installe seulement au QG
const isLabCard = it => it && it.type === 'LABGEAR';
const isEqCard = it => isGear(it) || isLabCard(it);
const sacCardsAll = () => localPlayer.labGearInTransit ? [...sacItems(), { type: 'LABGEAR', lvl: localPlayer.labGearInTransit }] : sacItems();

// Image et texte de boutique d'un équipement (retrouvé par son nom dans les catalogues)
function gearInfo(it) {
  const c = [...ARMORY_CATALOG, ...DEALER_CATALOG].find(x => x.nom === it.name) || {};
  const img = /hache/i.test(it.name || '') ? 'arme-axe.jpg' : c.image || (it.type === 'VEHICLE' ? 'veh-scooter.jpg' : it.type === 'ARMOR' ? 'equip-hat.jpg' : 'arme-gun.jpg');
  const slot = SAC_SLOTS[['WEAPON', 'ARMOR', 'VEHICLE'].indexOf(it.type)];
  return { img, slot, desc: c.desc || it.desc || '', bonus: `+${it.bonusVal || 0} ${slot.unit}`, firearm: !!(it.isFirearm || c.isFirearm) };
}
// Revente : % réglé à la création (50 % d'origine), ou celui de la Prime à la casse (Flash Radio)
const sellPct = () => isRadioEffectActive('SELL_PCT_SET') ? getRadioEffectValue('SELL_PCT_SET', 100) : settingVal('sellPct', 50);
const sellPrice = it => Math.floor((it.price ?? it.p ?? 3000) * sellPct() / 100);

// Bouton d'action d'un objet de Fouille (null : objet automatique ou inutile)
const SAC_USE = {
  def_malus_round: ['ph-hand-grabbing', 'Lancer'], crowbar: ['ph-wrench', 'Forcer'], scratch: ['ph-hand', 'Gratter'],
  patrol_reroll: ['ph-broadcast', 'Utiliser'], voucher: ['ph-ticket', 'Activer'], pm_turn: ['ph-sneaker-move', 'Utiliser'],
  stray_dog: ['ph-dog', 'Siffler'], heal: ['ph-fork-knife', 'Manger'], botox: ['ph-syringe', 'Injecter']
};
const SAC_AUTO = ['cancel_police', 'free_prostitute', 'double_fouille'];
// Ces objets ouvrent leur propre écran : on ferme le Sac avant
const SAC_LEAVES = ['def_malus_round', 'crowbar', 'patrol_reroll'];

function openSac() {
  sacFilter = 'tout';
  sacIndex = 0;
  const scr = document.getElementById('sacScreen');
  // Le Sac monte sous le bandeau du Caïd et le cadre de ses stats, qui restent visibles
  setSheet(scr, true);
  document.getElementById('sacRound').innerText = currentSession.round || 1;
  renderSac();
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth;
  scr.classList.add('show');
  fitSacCards();
  bindDeckSwipeAndDrag('sacCards', stepSac);
}
// Les cartes prennent toute la hauteur libre entre les filtres et les points (sans dépasser en largeur)
function fitSacCards() {
  const wrap = document.getElementById('sacStageWrap');
  if (!wrap || !wrap.clientHeight) return;
  const cw = Math.floor(Math.min((wrap.clientHeight - 8) * 768 / 1226, wrap.clientWidth * 0.66));
  document.getElementById('sacCards').style.setProperty('--cw', `${Math.max(90, cw)}px`);
}
window.addEventListener('resize', () => { if (sacIsOpen()) fitSacCards(); });
function closeSac() {
  const scr = document.getElementById('sacScreen');
  if (!scr) return;
  closeSacZoom();
  hideSheet(scr, 'show');
}
const sacIsOpen = () => !isClosed(document.getElementById('sacScreen'));

function sacSlotsHtml() {
  return SAC_SLOTS.map(s => {
    const it = localPlayer.equipped[s.key];
    if (!it) return `<div class="sac-slot free"><i class="ph-bold ${s.icon}"></i><small>${s.label}</small><b>${s.key === 'vehicle' ? 'À pied' : 'Libre'}</b></div>`;
    const g = gearInfo(it);
    return `<button type="button" class="sac-slot ${s.cls}" onclick="unequipSlot('${s.key}')"><img src="${g.img}" alt=""><span class="t"><small>${s.label}</small><b>${escapeHtml(it.name)}</b><em>${g.bonus}</em></span><i class="ph-bold ph-arrow-u-down-left sac-slot-off"></i></button>`;
  }).join('');
}

// Carte de boutique : image en haut, nom, bonus, réplique (équipement, Lascar, Prostituée)
const shopCardFace = ({ img, name, bonus, desc, cls }) => `<div class="sac-gear ${cls || ''}"><img src="${img}" alt=""><div class="b"><h4>${escapeHtml(name)}</h4><span>${bonus}</span><p>${escapeHtml(desc || '')}</p></div></div>`;
// Face de la carte : carte Fouille de l'objet, ou carte de boutique de l'équipement
function sacFace(it) {
  if (isLabCard(it)) return labFace(labLevelInfo(it.lvl));
  if (isGear(it)) {
    const g = gearInfo(it);
    return shopCardFace({ img: g.img, name: it.name, bonus: `${g.bonus}${g.firearm ? ' · 🔥 Feu' : ''}`, desc: g.desc, cls: g.slot.cls });
  }
  const art = itemArt(it);
  return art ? `<img class="deck-face" src="${art}" alt="${escapeHtml(it.name || '')}" draggable="false">`
    : `<div class="deck-face deck-face-txt"><span>${itemEmoji(it)}</span><h4>${escapeHtml(it.name || 'Objet')}</h4><p>${escapeHtml(it.desc || '')}</p></div>`;
}
// Boutons de la carte zoomée : action principale, puis vendre / jeter
function sacActions(it) {
  if (isLabCard(it)) return `<button type="button" class="find-cta" disabled><i class="ph-bold ph-house-line"></i> Installation QG</button><span class="sac-pill"><i class="ph-bold ph-qr-code"></i> Flashe le QR de ton QG pour l'installer</span>`;
  const real = localPlayer.inventory.indexOf(it);
  const trash = `<button type="button" class="sac-zbtn ghost" onclick="sacDo('discard', ${real})"><i class="ph-bold ph-trash"></i> Jeter</button>`;
  if (isGear(it)) {
    return `<button type="button" class="find-cta" onclick="sacDo('equip', ${real})"><i class="ph-bold ph-arrow-fat-up"></i> Équiper</button>
      <div class="sac-zrow"><button type="button" class="sac-zbtn sell" onclick="sacDo('sell', ${real})"><i class="ph-bold ph-coins"></i> Vendre ${sellPrice(it).toLocaleString()} €</button>${trash}</div>`;
  }
  const eff = isHealItem(it) ? 'heal' : it.eff;
  const use = SAC_USE[eff] || (it.dur === 'combat' ? ['ph-sword', 'Activer'] : null);
  if (use) return `<button type="button" class="find-cta" onclick="sacDo('use', ${real})"><i class="ph-bold ${use[0]}"></i> ${use[1]}</button><div class="sac-zrow">${trash}</div>`;
  const pill = SAC_AUTO.includes(eff) ? `<span class="sac-pill auto"><i class="ph-bold ph-magic-wand"></i> Utilisée automatiquement</span>` : `<span class="sac-pill"><i class="ph-bold ph-trash-simple"></i> Ne sert à rien</span>`;
  return `${pill}<div class="sac-zrow">${trash}</div>`;
}
// Carte du Sac : pas de boutons dessous ; toucher la carte du dessus l'ouvre en grand
function sacCardHtml(it, idx) {
  return `<div id="sacCard_${idx}" class="deck-card-item item-deck" onclick="pickSacCard(${idx})"><div class="deck-cardbox">${sacFace(it)}</div></div>`;
}

function renderSac() {
  const scr = document.getElementById('sacScreen');
  if (!scr) return;
  const all = sacCardsAll();
  const counts = { tout: all.length, obj: all.filter(it => !isEqCard(it)).length, eq: all.filter(isEqCard).length };
  sacList = all.filter(it => sacFilter === 'tout' || (sacFilter === 'eq') === isEqCard(it));
  sacIndex = Math.max(0, Math.min(sacIndex, sacList.length - 1));
  document.getElementById('sacSlots').innerHTML = sacSlotsHtml();
  document.getElementById('sacTabs').innerHTML = [['tout', 'Tout'], ['obj', 'Objets'], ['eq', 'Équipement']]
    .map(([f, l]) => `<button type="button" class="${f === sacFilter ? 'on' : ''}" onclick="setSacFilter('${f}')">${l}<b>${counts[f]}</b></button>`).join('');
  document.getElementById('sacCards').innerHTML = sacList.length ? sacList.map(sacCardHtml).join('')
    : `<div class="sac-empty"><i class="ph-bold ph-backpack"></i><b>${sacFilter === 'eq' ? 'Aucun équipement en réserve' : sacFilter === 'obj' ? 'Aucun objet' : 'Ton Sac est vide'}</b><small>Fouille les poubelles ou passe en boutique.</small></div>`;
  scr.querySelectorAll('.deck-arrow').forEach(b => b.classList.toggle('hidden', sacList.length < 2));
  placeSacCards();
}
// Défilement : on déplace seulement les cartes (transition animée), sans les redessiner
function placeSacCards() {
  document.getElementById('sacDots').innerHTML = sacList.length < 2 ? '' : sacList.map((_, i) => `<i class="${i === sacIndex ? 'on' : ''}"></i>`).join('');
  applyDeckStackPositions('sacCard', sacList.length, sacIndex);
}
function setSacFilter(f) { sacFilter = f; sacIndex = 0; renderSac(); }
function stepSac(dir) {
  const next = sacIndex + dir;
  if (next < 0 || next >= sacList.length) return;
  sacIndex = next;
  placeSacCards();
}
function pickSacCard(idx) {
  if (idx !== sacIndex) { sacIndex = idx; placeSacCards(); return; }
  openSacZoom(sacList[idx]);
}
// Carte zoomée : en grand au-dessus du Sac, avec ses boutons ; on y fait défiler les cartes (glisser ou flèches)
function openSacZoom(it) {
  if (!it) return;
  const z = document.getElementById('sacZoom');
  fillSacZoom(it);
  document.getElementById('sacZoomCard').classList.remove('slide-l', 'slide-r');
  z.classList.remove('hidden', 'show');
  sizeSacZoom();
  void z.offsetWidth;
  z.classList.add('show');
  bindSacZoomSwipe();
}
function fillSacZoom(it) {
  document.getElementById('sacZoomCard').innerHTML = `<div class="deck-cardbox">${sacFace(it)}</div>`;
  document.getElementById('sacZoomActions').innerHTML = sacActions(it);
  const [prev, next] = document.querySelectorAll('#sacZoom .deck-arrow');
  prev.classList.toggle('hidden', sacIndex <= 0);
  next.classList.toggle('hidden', sacIndex >= sacList.length - 1);
}
// La carte prend toute la hauteur laissée par les boutons (sans dépasser en largeur) ; les flèches se calent sur elle
function sizeSacZoom() {
  const z = document.getElementById('sacZoom'), card = document.getElementById('sacZoomCard');
  const used = document.getElementById('sacZoomActions').offsetHeight + z.querySelector('.sac-zoom-back').offsetHeight + 24 + 2 * 10;
  const cw = Math.floor(Math.min((z.clientHeight - used) * 768 / 1226, z.clientWidth * 0.86));
  card.style.width = `${Math.max(120, cw)}px`;
  z.style.setProperty('--arrow-y', `${Math.round(card.offsetTop + card.offsetHeight / 2 - 18)}px`);
}
function stepSacZoom(dir) {
  const card = document.getElementById('sacZoomCard');
  const next = sacIndex + dir;
  if (next < 0 || next >= sacList.length) { card.style.transform = ''; return; } // bout de la pile : la carte revient
  sacIndex = next;
  placeSacCards(); // la pile du Sac suit, derrière
  card.style.transition = 'none';
  card.style.transform = '';
  fillSacZoom(sacList[sacIndex]);
  sizeSacZoom();
  card.classList.remove('slide-l', 'slide-r');
  void card.offsetWidth;
  card.classList.add(dir > 0 ? 'slide-r' : 'slide-l');
  card.style.transition = '';
}
// Glisser la carte zoomée à gauche ou à droite : carte suivante ou précédente
function bindSacZoomSwipe() {
  const card = document.getElementById('sacZoomCard');
  if (card.dataset.swipeBound) return;
  card.dataset.swipeBound = '1';
  let x0 = null, dx = 0;
  card.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; card.style.transition = 'none'; });
  card.addEventListener('pointermove', e => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) > 6) card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    card.style.transition = '';
    if (Math.abs(dx) > 50) stepSacZoom(dx < 0 ? 1 : -1);
    else card.style.transform = '';
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => card.addEventListener(t, end));
}
function closeSacZoom() { document.getElementById('sacZoom').classList.add('hidden'); }
function sacDo(action, idx) {
  closeSacZoom();
  if (action === 'use') sacUse(idx);
  else if (action === 'equip') equipItemFromInventory(idx);
  else if (action === 'sell') sellItem(idx);
  else if (action === 'discard') discardItem(idx);
}
function sacUse(idx) {
  const it = localPlayer.inventory[idx];
  if (it && SAC_LEAVES.includes(it.eff) && isMyTurnToPlay) closeSac();
  useItem(idx);
}

// Bouton « Sac » de l'écran principal : nombre de cartes, argent sur toi, mini-images de ce que tu portes
function renderSacButton() {
  const n = sacCardsAll().length;
  document.getElementById('hudItemCount').innerText = n;
  document.getElementById('hudPocketMini').innerText = `${localPlayer.pocketCash.toLocaleString()} € · ${localPlayer.drugs} kg sur toi`;
  document.getElementById('hudGearMini').innerHTML = SAC_SLOTS.map(s => {
    const it = localPlayer.equipped[s.key];
    return it ? `<img src="${gearInfo(it).img}" alt="${escapeHtml(it.name)}">` : `<span><i class="ph-bold ${s.icon}"></i></span>`;
  }).join('');
}
// Appelé par refreshHud : bouton à jour, et le Sac se redessine s'il est ouvert
function renderInventoryList() {
  renderSacButton();
  if (sacIsOpen()) renderSac();
}
