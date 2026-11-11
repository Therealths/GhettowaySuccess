// Boutiques (armurerie, nightclub, sportclub, concessionnaire), grossiste et paiement

// =========================================================================
// CATALOGUES DES 4 BOUTIQUES (Chargés depuis catalog.json + copies de secours)
// =========================================================================
let ARMORY_CATALOG = [
  { id: "wp_poing", categorie: "arme", slot: "WEAPON", nom: "Poing Américain", prix: 1000, bonusVal: 2, bonusLabel: "+2 Attaque", isFirearm: false, image: "arme-poing.jpg", desc: "Patate de forain !" },
  { id: "wp_knife", categorie: "arme", slot: "WEAPON", nom: "Cran d'arrêt", prix: 2000, bonusVal: 4, bonusLabel: "+4 Attaque", isFirearm: false, image: "arme-knife.jpg", desc: "Idéal pour intimider au corps à corps." },
  { id: "wp_axe", categorie: "arme", slot: "WEAPON", nom: "Hache", prix: 5000, bonusVal: 6, bonusLabel: "+6 Attaque", isFirearm: false, image: "arme-axe.jpg", desc: "On peut même couper du bois avec..." },
  { id: "wp_gun", categorie: "arme", slot: "WEAPON", nom: "Revolver", prix: 8000, bonusVal: 8, bonusLabel: "+8 Attaque", isFirearm: true, image: "arme-gun.jpg", desc: "Pan ! Pan ! Pan !" },
  { id: "wp_pompe", categorie: "arme", slot: "WEAPON", nom: "Fusil à pompe", prix: 12000, bonusVal: 10, bonusLabel: "+10 Attaque", isFirearm: true, image: "arme-pompe.jpg", desc: "Hasta la vista baby !" },
  { id: "ar_duck", categorie: "equipement", slot: "ARMOR", nom: "Bouée canard", prix: 0, bonusVal: 1, bonusLabel: "+1 Défense", isFirearm: false, image: "equip-duck.jpg", desc: "Coin !? Qu'est-ce qu'il y a !?" },
  { id: "ar_roller", categorie: "equipement", slot: "ARMOR", nom: "Protections Rollers", prix: 2000, bonusVal: 3, bonusLabel: "+3 Défense", isFirearm: false, image: "equip-roller.jpg", desc: "Paré à la chute !" },
  { id: "ar_hat", categorie: "equipement", slot: "ARMOR", nom: "Casque de soldat", prix: 5000, bonusVal: 5, bonusLabel: "+5 Défense", isFirearm: false, image: "equip-hat.jpg", desc: "J'ai la tête dure !" },
  { id: "ar_gilet", categorie: "equipement", slot: "ARMOR", nom: "Gilet pare-balles", prix: 8000, bonusVal: 8, bonusLabel: "+8 Défense", isFirearm: false, image: "equip-gilet.jpg", desc: "J'ai mis une petite laine" },
  { id: "ar_crs", categorie: "equipement", slot: "ARMOR", nom: "Armure de CRS", prix: 12000, bonusVal: 10, bonusLabel: "+10 Défense", isFirearm: false, image: "equip-crs.jpg", desc: "Robocop style" }
];

let NIGHTCLUB_CATALOG = [
  { id: "pr_lvl1", categorie: "prostituee", slot: "PROSTITUTE", lvl: 1, nom: "Prostituée Niv. 1", prix: 2000, rev: 1000, bonusVal: 1000, bonusLabel: "+1 000 € / manche au QG", image: "plvl1.jpg", desc: "Escort débutante à ramener au QG." },
  { id: "pr_lvl2", categorie: "prostituee", slot: "PROSTITUTE", lvl: 2, nom: "Prostituée Niv. 2", prix: 4000, rev: 2500, bonusVal: 2500, bonusLabel: "+2 500 € / manche au QG", image: "plvl2.jpg", desc: "Escort VIP haut de gamme, rente élevée." }
];

let SPORTCLUB_CATALOG = [
  { id: "gb_lvl1", categorie: "lascar", slot: "MUSCLE", lvl: 1, nom: "Lascar Niv. 1", prix: 1500, atk: 1, def: 1, bonusVal: 1, bonusLabel: "+1 Atk / +1 Def", image: "gblvl1.jpg", desc: "Homme de main solide (+1 Attaque et +1 Défense)." },
  { id: "gb_lvl2", categorie: "lascar", slot: "MUSCLE", lvl: 2, nom: "Lascar Niv. 2", prix: 3000, atk: 2, def: 2, bonusVal: 2, bonusLabel: "+2 Atk / +2 Def", image: "gblvl2.jpg", desc: "Gros bras surentraîné (+2 Attaque et +2 Défense)." }
];

let DEALER_CATALOG = [
  { id: "vh_roller", categorie: "vehicule", slot: "VEHICLE", nom: "Paire de rollers", prix: 1500, bonusVal: 2, isMotorized: false, bonusLabel: "+2 PM", image: "veh-roller.jpg", desc: "Ça roule ma poule !" },
  { id: "vh_trott", categorie: "vehicule", slot: "VEHICLE", nom: "Trottinette", prix: 3000, bonusVal: 4, isMotorized: false, bonusLabel: "+4 PM", image: "veh-trott.jpg", desc: "Pratique pour couper par les ruelles." },
  { id: "vh_scooter", categorie: "vehicule", slot: "VEHICLE", nom: "Scooter", prix: 6000, bonusVal: 6, isMotorized: true, bonusLabel: "+6 PM", image: "veh-scooter.jpg", desc: "Ça cabre dans toute la cité !" },
  { id: "vh_moto", categorie: "vehicule", slot: "VEHICLE", nom: "Grosse cylindrée", prix: 10000, bonusVal: 8, isMotorized: true, bonusLabel: "+8 PM", image: "veh-moto.jpg", desc: "Intouchable sur le périph' !" }
];

fetch('/catalog.json')
  .then(r => r.json())
  .then(json => {
    if (!json) return;
    if (Array.isArray(json.armurerie)) {
      ARMORY_CATALOG = json.armurerie.map(item => {
        if (item.id === 'wp_axe' || (item.nom && item.nom.toLowerCase().includes('hache'))) {
          item.image = 'arme-axe.jpg';
        }
        return item;
      });
    }
    if (Array.isArray(json.nightclub)) NIGHTCLUB_CATALOG = json.nightclub;
    if (Array.isArray(json.sportclub)) SPORTCLUB_CATALOG = json.sportclub;
    if (Array.isArray(json.concessionnaire)) DEALER_CATALOG = json.concessionnaire;
  })
  .catch(() => {});

function getArmoryItemEffectivePrice(item) {
  let price = item.prix || 0;
  if (item.categorie === 'arme' && isRadioEffectActive('WEAPON_PRICE_MULT')) {
    price = Math.round(price * getRadioEffectValue('WEAPON_PRICE_MULT', 0.7));
  } else if (item.categorie === 'equipement' && isRadioEffectActive('ARMOR_PRICE_MULT')) {
    price = Math.round(price * getRadioEffectValue('ARMOR_PRICE_MULT', 0.5));
  }
  return price;
}

// Bon de réduction activé depuis le Sac : −50 % sur le prochain achat payant de la boutique
const hasVoucher = shop => (localPlayer.vouchers || []).includes(shop);
const voucherCost = (shop, cost) => cost > 0 && hasVoucher(shop) ? Math.round(cost / 2) : cost;
function useVoucher(shop) {
  const v = [...(localPlayer.vouchers || [])];
  const i = v.indexOf(shop);
  if (i >= 0) v.splice(i, 1);
  localPlayer.vouchers = v;
}
// Prix affiché : barré quand il est réduit
const priceTagHtml = (full, cost) => cost < full
  ? `<span class="line-through text-[9px] text-slate-500 mr-1">${full.toLocaleString()}€</span><span class="text-emerald-400">${cost.toLocaleString()} €</span>`
  : `${cost.toLocaleString()} €`;
// Manteau de fourrure (déguisement de Mac) : une Prostituée Niv. 1 gratuite, pris tout seul dans le Sac
const macCoatIndex = () => localPlayer.inventory.findIndex(it => it && it.eff === 'free_prostitute');

// =========================================================================
// MOTEUR D'ANIMATION 3D POUR LES PILES DE CARTES
// =========================================================================
function applyDeckStackPositions(prefix, totalCount, activeIndex) {
  for (let i = 0; i < totalCount; i++) {
    const el = document.getElementById(`${prefix}_${i}`);
    if (!el) continue;
    const buyBtn = el.querySelector('.deck-buy-btn');

    if (totalCount <= 2) {
      const diff = (i - activeIndex + totalCount) % totalCount;
      if (diff === 0) {
        el.style.zIndex = '25';
        el.style.opacity = '1';
        el.style.transform = 'translate3d(-10px, 2px, 0px) scale(1) rotate(0deg)';
        el.style.boxShadow = '0 18px 36px rgba(0, 0, 0, 0.88)';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'default';
        if (buyBtn) buyBtn.style.pointerEvents = 'auto';
      } else {
        el.style.zIndex = '15';
        el.style.opacity = '0.52';
        el.style.transform = 'translate3d(38px, -8px, -60px) scale(0.86) rotate(7deg)';
        el.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.5)';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        if (buyBtn) buyBtn.style.pointerEvents = 'none';
      }
    } else {
      if (i === activeIndex) {
        const xOffset = (activeIndex === 0) ? '-10px' : '0px';
        el.style.zIndex = '25';
        el.style.opacity = '1';
        el.style.transform = `translate3d(${xOffset}, 2px, 0px) scale(1) rotate(0deg)`;
        el.style.boxShadow = '0 18px 36px rgba(0, 0, 0, 0.88)';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'default';
        if (buyBtn) buyBtn.style.pointerEvents = 'auto';
      } else if (i === activeIndex - 1) {
        el.style.zIndex = '15';
        el.style.opacity = '0.52';
        el.style.transform = 'translate3d(-44px, -8px, -60px) scale(0.86) rotate(-7deg)';
        el.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.5)';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        if (buyBtn) buyBtn.style.pointerEvents = 'none';
      } else if (i === activeIndex + 1) {
        el.style.zIndex = '16';
        el.style.opacity = '0.52';
        el.style.transform = 'translate3d(44px, -8px, -60px) scale(0.86) rotate(7deg)';
        el.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.5)';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        if (buyBtn) buyBtn.style.pointerEvents = 'none';
      } else if (i < activeIndex - 1) {
        el.style.zIndex = '5';
        el.style.opacity = '0';
        el.style.transform = 'translate3d(-75px, 6px, -120px) scale(0.75) rotate(-12deg)';
        el.style.pointerEvents = 'none';
        if (buyBtn) buyBtn.style.pointerEvents = 'none';
      } else {
        el.style.zIndex = '5';
        el.style.opacity = '0';
        el.style.transform = 'translate3d(75px, 6px, -120px) scale(0.75) rotate(12deg)';
        el.style.pointerEvents = 'none';
        if (buyBtn) buyBtn.style.pointerEvents = 'none';
      }
    }
  }
}

function bindDeckSwipeAndDrag(containerId, onStep) {
  const el = document.getElementById(containerId);
  if (!el || el.dataset.swipeBound === '1') return;
  el.dataset.swipeBound = '1';

  let startX = null;
  el.addEventListener('touchstart', e => {
    if (e.touches && e.touches[0]) startX = e.touches[0].clientX;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (startX === null || !e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (dx < -22) onStep(1);
    else if (dx > 22) onStep(-1);
  }, { passive: true });

  el.addEventListener('mousedown', e => { startX = e.clientX; });
  el.addEventListener('mouseup', e => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (dx < -22) onStep(1);
    else if (dx > 22) onStep(-1);
  });
}

// --- 1. ARMURERIE ---
let currentArmoryCategory = 'arme';
let activeArmoryIndex = 0;
let currentArmoryItems = [];

function openArmoryShopModal() {
  document.getElementById('armoryPocketCashDisplay').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('armorySafeCashDisplay').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  bindDeckSwipeAndDrag('armoryCardsContainer', stepArmoryDeck);
  switchArmoryTab('arme');
  document.getElementById('modalArmoryShop').classList.remove('hidden');
}

function switchArmoryTab(cat) {
  currentArmoryCategory = cat;
  activeArmoryIndex = 0;
  const bW = document.getElementById('tabBtnArmoryWeapons');
  const bA = document.getElementById('tabBtnArmoryArmor');
  if (cat === 'arme') {
    bW.className = "py-1.5 rounded-xl font-black uppercase bg-rose-500 text-white flex items-center justify-center gap-1.5 shadow-lg transition";
    bA.className = "py-1.5 rounded-xl font-bold uppercase text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition";
  } else {
    bA.className = "py-1.5 rounded-xl font-black uppercase bg-sky-500 text-black flex items-center justify-center gap-1.5 shadow-lg transition";
    bW.className = "py-1.5 rounded-xl font-bold uppercase text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition";
  }
  buildArmoryStackDOM();
}

function buildArmoryStackDOM() {
  const container = document.getElementById('armoryCardsContainer');
  currentArmoryItems = ARMORY_CATALOG.filter(it => it.categorie === currentArmoryCategory);
  const total = currentArmoryItems.length;

  container.innerHTML = currentArmoryItems.map((item, idx) => {
    const isWeapon = item.categorie === 'arme';
    const imgFile = (item.id === 'wp_axe' || (item.nom && item.nom.toLowerCase().includes('hache'))) ? 'arme-axe.jpg' : item.image;
    const borderColor = isWeapon ? 'border-rose-500/45' : 'border-sky-500/45';
    const badgeColor = isWeapon ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    const displayBonus = isWeapon ? `+${item.bonusVal} Attaque` : `+${item.bonusVal} Défense`;
    const firearmBadge = item.isFirearm ? `<span class="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[8px] font-bold">🔥 Feu</span>` : '';
    const effectivePrice = voucherCost('Armurerie', getArmoryItemEffectivePrice(item));
    const priceHtml = item.prix === 0 ? 'GRATUIT' : priceTagHtml(item.prix, effectivePrice);

    return `
      <div id="armoryDeckCard_${idx}" onclick="onArmoryCardClick(${idx})" class="deck-card-item border ${borderColor}">
        <div>
          <div class="relative w-full h-24 rounded-xl overflow-hidden bg-black/80 border border-white/10 mb-1.5 flex items-center justify-center">
            <img src="${imgFile}" alt="${item.nom}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="hidden flex-col items-center justify-center text-slate-500">
              <i class="ph-bold ${isWeapon ? 'ph-sword text-rose-400' : 'ph-shield text-sky-400'} text-3xl"></i>
              <span class="text-[8px] font-mono mt-1">${imgFile}</span>
            </div>
          </div>
          <div class="flex items-center justify-between gap-1">
            <span class="px-1.5 py-0.5 rounded-md border ${badgeColor} font-mono text-[9px] font-black">${displayBonus}</span>
            ${firearmBadge}
            <span class="text-[9px] font-mono text-slate-400">${idx + 1}/${total}</span>
          </div>
          <h4 class="text-xs font-black text-white uppercase truncate mt-1">${item.nom}</h4>
          <p class="text-[10px] text-slate-300 italic mt-0.5 leading-tight line-clamp-2">"${item.desc}"</p>
        </div>
        <div class="pt-1.5 border-t border-white/10">
          <div class="flex items-center justify-between font-mono mb-1">
            <span class="text-[9px] text-slate-400 uppercase">Prix :</span>
            <span class="text-xs font-black text-ghetto-gold">${priceHtml}</span>
          </div>
          ${freeItemClaimed(item) ? `<button type="button" disabled class="deck-buy-btn w-full py-2 bg-slate-800 text-slate-500 font-black uppercase tracking-wider rounded-xl text-[11px] flex items-center justify-center gap-1">
            <i class="ph-bold ph-check"></i> Déjà récupérée
          </button>` : `<button onclick="event.stopPropagation(); buyArmoryCatalogItem('${item.id}')" class="deck-buy-btn w-full py-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black uppercase tracking-wider rounded-xl text-[11px] shadow-lg active:scale-95 transition flex items-center justify-center gap-1">
            <i class="ph-bold ph-shopping-cart-simple"></i> Acheter
          </button>`}
        </div>
      </div>`;
  }).join('');

  applyDeckStackPositions('armoryDeckCard', total, activeArmoryIndex);
}

function stepArmoryDeck(dir = 1) {
  const total = currentArmoryItems.length;
  if (!total) return;
  const nextIdx = activeArmoryIndex + dir;
  if (nextIdx < 0 || nextIdx >= total) return;
  activeArmoryIndex = nextIdx;
  applyDeckStackPositions('armoryDeckCard', total, activeArmoryIndex);
}

function onArmoryCardClick(idx) {
  if (idx !== activeArmoryIndex) {
    activeArmoryIndex = idx;
    applyDeckStackPositions('armoryDeckCard', currentArmoryItems.length, activeArmoryIndex);
  }
}

// Objet gratuit de l'Armurerie (Bouée canard) : une seule fois par partie
function freeItemClaimed(item) { return !item.prix && (localPlayer.freeItemsClaimed || []).includes(item.id); }

async function buyArmoryCatalogItem(itemId) {
  const item = ARMORY_CATALOG.find(i => i.id === itemId);
  if (!item) return;
  if (freeItemClaimed(item)) return showAppAlert(`${item.nom} : déjà récupérée, une seule par partie !`, "⛔ Déjà prise");
  let cost = getArmoryItemEffectivePrice(item);
  const isWeapon = item.categorie === 'arme';
  if (isWeapon && getMyCaid().id === 'caid_6' && !localPlayer.firstWeaponDoubled && cost > 0) {
    cost *= 2;
    await showAppAlert(`Malus Tonteushi Kitano : ton premier achat d'arme à l'Armurerie coûte le double (${cost.toLocaleString()} €) !`, "🥋 Malus Kitano");
  }
  const fullCost = cost;
  cost = voucherCost('Armurerie', cost);
  const totalFunds = localPlayer.pocketCash + localPlayer.safeCash;
  if (totalFunds < cost) {
    return showBrokeScreen(cost, item.nom || item.name);
  }
  const pPayload = {
    type: 'eq',
    cost: cost,
    name: item.nom,
    markKitanoWeapon: (isWeapon && getMyCaid().id === 'caid_6' && !localPlayer.firstWeaponDoubled),
    data: {
      sl: isWeapon ? 'arme' : 'prot',
      n: item.nom,
      atk: isWeapon ? item.bonusVal : 0,
      def: !isWeapon ? item.bonusVal : 0,
      isFirearm: !!item.isFirearm,
      desc: item.desc
    }
  };
  pPayload.shop = 'Armurerie';
  if (cost < fullCost) pPayload.voucher = 'Armurerie';
  closeModal('modalArmoryShop');
  if (cost === 0) {
    if (!item.prix) localPlayer.freeItemsClaimed = [...(localPlayer.freeItemsClaimed || []), item.id];
    await finalizePurchaseExecution(pPayload);
    refreshHud();
    return;
  }
  openPaymentChoiceModal(pPayload);
}

// --- 2. NIGHTCLUB ---
let activeNightclubIndex = 0;

function openNightclubShopModal() {
  document.getElementById('nightclubPocketCashDisplay').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('nightclubSafeCashDisplay').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  activeNightclubIndex = 0;
  buildNightclubStackDOM();
  bindDeckSwipeAndDrag('nightclubStackContainer', () => toggleNightclubStackCard());
  document.getElementById('modalNightclubShop').classList.remove('hidden');
}

function buildNightclubStackDOM() {
  const container = document.getElementById('nightclubStackContainer');
  const isMaryFree = (getMyCaid().id === 'caid_4' && !localPlayer.freeProstituteClaimed);
  const hasCoat = macCoatIndex() >= 0;
  container.innerHTML = NIGHTCLUB_CATALOG.map((item, idx) => {
    const displayPrice = (item.lvl === 1 && isMaryFree) ? 'GRATUIT (Bonus)'
      : (item.lvl === 1 && hasCoat) ? 'GRATUIT (Manteau)' : priceTagHtml(item.prix, voucherCost('Nightclub', item.prix));
    return `
      <div id="nightclubDeckCard_${idx}" onclick="onNightclubCardClick(${idx})" class="deck-card-item border border-pink-500/45">
        <div>
          <div class="relative w-full h-24 rounded-xl overflow-hidden bg-black/80 border border-white/10 mb-1.5 flex items-center justify-center">
            <img src="${item.image}" alt="${item.nom}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="hidden flex-col items-center justify-center text-pink-400">
              <i class="ph-bold ph-high-heel text-3xl"></i>
              <span class="text-[8px] font-mono mt-1">${item.image}</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="px-1.5 py-0.5 rounded-md border bg-pink-500/20 text-pink-300 border-pink-500/40 font-mono text-[9px] font-black">${item.bonusLabel}</span>
            <span class="text-[9px] font-mono text-slate-400">${idx + 1}/${NIGHTCLUB_CATALOG.length}</span>
          </div>
          <h4 class="text-xs font-black text-white uppercase truncate mt-1">${item.nom}</h4>
          <p class="text-[10px] text-slate-300 italic mt-0.5 leading-tight line-clamp-2">"${item.desc}"</p>
        </div>
        <div class="pt-1.5 border-t border-white/10">
          <div class="flex items-center justify-between font-mono mb-1">
            <span class="text-[9px] text-slate-400 uppercase">Prix :</span>
            <span class="text-xs font-black text-ghetto-gold">${displayPrice}</span>
          </div>
          <button onclick="event.stopPropagation(); buyNightclubItem('${item.id}')" class="deck-buy-btn w-full py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black uppercase tracking-wider rounded-xl text-[11px] shadow-lg active:scale-95 transition flex items-center justify-center gap-1">
            <i class="ph-bold ph-shopping-cart-simple"></i> Recruter
          </button>
        </div>
      </div>`;
  }).join('');

  applyDeckStackPositions('nightclubDeckCard', NIGHTCLUB_CATALOG.length, activeNightclubIndex);
}

function onNightclubCardClick(idx) {
  if (idx !== activeNightclubIndex) toggleNightclubStackCard();
}

function toggleNightclubStackCard() {
  activeNightclubIndex = activeNightclubIndex === 0 ? 1 : 0;
  applyDeckStackPositions('nightclubDeckCard', NIGHTCLUB_CATALOG.length, activeNightclubIndex);
}

async function buyNightclubItem(itemId) {
  const item = NIGHTCLUB_CATALOG.find(i => i.id === itemId || i.lvl === itemId);
  if (!item) return;
  if (localPlayer.prostituteInTransit) {
    return showAppAlert("Tu as déjà 1 prostituée en transit ! Dépose-la d'abord au QG.", "Limite Atteinte");
  }
  const cost = voucherCost('Nightclub', item.prix);
  const rev = item.rev || item.bonusVal || (item.lvl === 2 ? 2500 : 1000);
  const dataPayload = { t: 'pr', lvl: item.lvl || 1, p: item.prix, rev: rev, n: item.nom };
  closeModal('modalNightclubShop');
  if (getMyCaid().id === 'caid_4' && !localPlayer.freeProstituteClaimed && (item.lvl === 1 || item.id === 'pr_lvl1')) {
    localPlayer.freeProstituteClaimed = true;
    await finalizePurchaseExecution({ type: 'pr', data: dataPayload, cost: 0, name: item.nom });
    refreshHud();
    return;
  }
  if ((item.lvl || 1) === 1 && macCoatIndex() >= 0) {
    localPlayer.inventory.splice(macCoatIndex(), 1);
    await showAppAlert("Ton Manteau de fourrure fait son effet : elle te suit gratuitement !", "🧥 Déguisement de Mac");
    await finalizePurchaseExecution({ type: 'pr', data: dataPayload, cost: 0, name: item.nom });
    refreshHud();
    return;
  }
  if (localPlayer.pocketCash + localPlayer.safeCash < cost) {
    return showBrokeScreen(cost, item.nom || item.name);
  }
  openPaymentChoiceModal({ type: 'pr', data: dataPayload, cost, name: item.nom, shop: 'Nightclub', voucher: cost < item.prix ? 'Nightclub' : null });
}

// --- 3. SPORTCLUB ---
let activeSportclubIndex = 0;

function openSportclubShopModal() {
  document.getElementById('sportclubPocketCashDisplay').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('sportclubSafeCashDisplay').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  activeSportclubIndex = 0;
  buildSportclubStackDOM();
  bindDeckSwipeAndDrag('sportclubStackContainer', () => toggleSportclubStackCard());
  document.getElementById('modalSportclubShop').classList.remove('hidden');
}

function buildSportclubStackDOM() {
  const container = document.getElementById('sportclubStackContainer');
  container.innerHTML = SPORTCLUB_CATALOG.map((item, idx) => `
    <div id="sportclubDeckCard_${idx}" onclick="onSportclubCardClick(${idx})" class="deck-card-item border border-sky-500/45">
      <div>
        <div class="relative w-full h-24 rounded-xl overflow-hidden bg-black/80 border border-white/10 mb-1.5 flex items-center justify-center">
          <img src="${item.image}" alt="${item.nom}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="hidden flex-col items-center justify-center text-sky-400">
            <i class="ph-bold ph-barbell text-3xl"></i>
            <span class="text-[8px] font-mono mt-1">${item.image}</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="px-1.5 py-0.5 rounded-md border bg-sky-500/20 text-sky-300 border-sky-500/40 font-mono text-[9px] font-black">${item.bonusLabel}</span>
          <span class="text-[9px] font-mono text-slate-400">${idx + 1}/${SPORTCLUB_CATALOG.length}</span>
        </div>
        <h4 class="text-xs font-black text-white uppercase truncate mt-1">${item.nom}</h4>
        <p class="text-[10px] text-slate-300 italic mt-0.5 leading-tight line-clamp-2">"${item.desc}"</p>
      </div>
      <div class="pt-1.5 border-t border-white/10">
        <div class="flex items-center justify-between font-mono mb-1">
          <span class="text-[9px] text-slate-400 uppercase">Prix :</span>
          <span class="text-xs font-black text-ghetto-gold">${priceTagHtml(item.prix, voucherCost('Sportclub', item.prix))}</span>
        </div>
        <button onclick="event.stopPropagation(); buySportclubItem('${item.id}')" class="deck-buy-btn w-full py-2 bg-gradient-to-r from-sky-400 to-blue-500 text-black font-black uppercase tracking-wider rounded-xl text-[11px] shadow-lg active:scale-95 transition flex items-center justify-center gap-1">
          <i class="ph-bold ph-shopping-cart-simple"></i> Recruter
        </button>
      </div>
    </div>`).join('');

  applyDeckStackPositions('sportclubDeckCard', SPORTCLUB_CATALOG.length, activeSportclubIndex);
}

function onSportclubCardClick(idx) {
  if (idx !== activeSportclubIndex) toggleSportclubStackCard();
}

function toggleSportclubStackCard() {
  activeSportclubIndex = activeSportclubIndex === 0 ? 1 : 0;
  applyDeckStackPositions('sportclubDeckCard', SPORTCLUB_CATALOG.length, activeSportclubIndex);
}

async function buySportclubItem(itemId) {
  const item = SPORTCLUB_CATALOG.find(i => i.id === itemId || i.lvl === itemId);
  if (!item) return;
  if (localPlayer.musclesOnPerson.length >= 3) {
    return showAppAlert("Tu as déjà 3 Lascars, le maximum !", "Limite Atteinte");
  }
  const cost = voucherCost('Sportclub', item.prix);
  if (localPlayer.pocketCash + localPlayer.safeCash < cost) {
    return showBrokeScreen(cost, item.nom || item.name);
  }
  const atkVal = item.atk || item.bonusVal || (item.lvl === 2 ? 2 : 1);
  const dataPayload = { t: 'gb', lvl: item.lvl || 1, p: item.prix, atk: atkVal, def: atkVal, n: item.nom };
  closeModal('modalSportclubShop');
  openPaymentChoiceModal({ type: 'gb', data: dataPayload, cost, name: item.nom, shop: 'Sportclub', voucher: cost < item.prix ? 'Sportclub' : null });
}

// --- 4. CONCESSIONNAIRE ---
let activeDealerIndex = 0;

function openDealerShopModal() {
  document.getElementById('dealerPocketCashDisplay').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('dealerSafeCashDisplay').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  activeDealerIndex = 0;
  buildDealerStackDOM();
  bindDeckSwipeAndDrag('dealerCardsContainer', stepDealerDeck);
  document.getElementById('modalDealerShop').classList.remove('hidden');
}

function buildDealerStackDOM() {
  const container = document.getElementById('dealerCardsContainer');
  const total = DEALER_CATALOG.length;

  container.innerHTML = DEALER_CATALOG.map((item, idx) => `
    <div id="dealerDeckCard_${idx}" onclick="onDealerCardClick(${idx})" class="deck-card-item border border-amber-500/45">
      <div>
        <div class="relative w-full h-24 rounded-xl overflow-hidden bg-black/80 border border-white/10 mb-1.5 flex items-center justify-center">
          <img src="${item.image}" alt="${item.nom}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="hidden flex-col items-center justify-center text-amber-400">
            <i class="ph-bold ph-moped text-3xl"></i>
            <span class="text-[8px] font-mono mt-1">${item.image}</span>
          </div>
        </div>
        <div class="flex items-center justify-between gap-1">
          <span class="px-1.5 py-0.5 rounded-md border bg-amber-500/20 text-amber-300 border-amber-500/40 font-mono text-[9px] font-black">+${item.bonusVal} PM</span>
          <span class="text-[9px] font-mono text-slate-400">${idx + 1}/${total}</span>
        </div>
        <h4 class="text-xs font-black text-white uppercase truncate mt-1">${item.nom}</h4>
        <p class="text-[10px] text-slate-300 italic mt-0.5 leading-tight line-clamp-2">"${item.desc}"</p>
      </div>
      <div class="pt-1.5 border-t border-white/10">
        <div class="flex items-center justify-between font-mono mb-1">
          <span class="text-[9px] text-slate-400 uppercase">Prix :</span>
          <span class="text-xs font-black text-ghetto-gold">${item.prix === 0 ? 'GRATUIT' : priceTagHtml(item.prix, voucherCost('Concessionnaire', item.prix))}</span>
        </div>
        <button onclick="event.stopPropagation(); buyDealerCatalogItem('${item.id}')" class="deck-buy-btn w-full py-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black uppercase tracking-wider rounded-xl text-[11px] shadow-lg active:scale-95 transition flex items-center justify-center gap-1">
          <i class="ph-bold ph-shopping-cart-simple"></i> Acheter
        </button>
      </div>
    </div>`).join('');

  applyDeckStackPositions('dealerDeckCard', total, activeDealerIndex);
}

function stepDealerDeck(dir = 1) {
  const total = DEALER_CATALOG.length;
  if (!total) return;
  const nextIdx = activeDealerIndex + dir;
  if (nextIdx < 0 || nextIdx >= total) return;
  activeDealerIndex = nextIdx;
  applyDeckStackPositions('dealerDeckCard', total, activeDealerIndex);
}

function onDealerCardClick(idx) {
  if (idx !== activeDealerIndex) {
    activeDealerIndex = idx;
    applyDeckStackPositions('dealerDeckCard', DEALER_CATALOG.length, activeDealerIndex);
  }
}

async function buyDealerCatalogItem(itemId) {
  const item = DEALER_CATALOG.find(i => i.id === itemId);
  if (!item) return;
  const cost = voucherCost('Concessionnaire', item.prix || 0);
  const totalFunds = localPlayer.pocketCash + localPlayer.safeCash;
  if (totalFunds < cost) {
    return showBrokeScreen(cost, item.nom || item.name);
  }
  const pPayload = {
    type: 'eq',
    cost: cost,
    name: item.nom,
    data: {
      sl: 'veh',
      n: item.nom,
      pm: item.bonusVal || 2,
      isMotorized: item.isMotorized !== undefined ? item.isMotorized : (item.bonusVal >= 6),
      desc: item.desc
    }
  };
  pPayload.shop = 'Concessionnaire';
  if (cost < (item.prix || 0)) pPayload.voucher = 'Concessionnaire';
  closeModal('modalDealerShop');
  if (cost === 0) {
    await finalizePurchaseExecution(pPayload);
    refreshHud();
    return;
  }
  openPaymentChoiceModal(pPayload);
}

// Malus J-Lo Gramme : ses 5 premiers kg achetés au grossiste (sur la partie) coûtent le double
function getJloDoubledKgLeft() {
  return localPlayer.caidId === 'caid_5' ? Math.max(0, 5 - (localPlayer.jloDoubledKgBought || 0)) : 0;
}
function getGrossisteCost(kg) {
  return (kg + Math.min(kg, getJloDoubledKgLeft())) * grossisteUnitCost;
}
function getGrossisteMaxKg() {
  let kg = 0;
  while (getGrossisteCost(kg + 1) <= localPlayer.pocketCash) kg++;
  return kg;
}
// Grossiste plein écran : compteur de kilos, raccourcis, total, puis écran de livraison
let grossisteKg = 0;
function openGrossisteModal(unitPrice) {
  let basePrice = unitPrice || 1000;
  if (isRadioEffectActive('GROSSISTE_PRICE_SET')) {
    basePrice = getRadioEffectValue('GROSSISTE_PRICE_SET', 1500);
  }
  grossisteUnitCost = basePrice;
  grossisteKg = Math.min(1, getGrossisteMaxKg());
  const scr = document.getElementById('grossisteScreen');
  document.getElementById('grossisteRound').innerText = currentSession.round || 1;
  document.getElementById('grossisteHeadline').innerText = 'HALL 7.';
  document.getElementById('grossisteSub').innerText = 'La marchandise est arrivée.';
  document.getElementById('grossisteBubble').innerText = getJloDoubledKgLeft() > 0 ? 'Pour toi, c’est le double.' : 'Combien tu prends ?';
  scr.dataset.state = 'choix';
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  renderGrossiste();
}
function closeGrossiste() {
  document.getElementById('grossisteScreen').classList.add('hidden');
}
function setGrossisteKg(kg) {
  grossisteKg = Math.max(0, Math.min(getGrossisteMaxKg(), kg));
  renderGrossiste();
}
function renderGrossiste() {
  const maxKg = getGrossisteMaxKg();
  const kg = grossisteKg;
  const jloLeft = getJloDoubledKgLeft();
  const doubled = Math.min(kg, jloLeft);
  const quick = [1, Math.round(maxKg / 2), maxKg].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
  document.getElementById('grossistePanel').innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <div class="gros-stat"><span class="text-amber-300">Cash en poche</span><b>${localPlayer.pocketCash.toLocaleString()} €</b></div>
      <div class="gros-stat"><span class="text-emerald-300">Tarif</span><b>${grossisteUnitCost.toLocaleString()} € / kg</b>${jloLeft > 0 ? ' <em class="gros-malus">×2</em>' : ''}</div>
    </div>
    <div class="flex items-center justify-between mt-4">
      <button type="button" class="gros-step" onclick="setGrossisteKg(grossisteKg - 1)" ${kg <= 0 ? 'disabled' : ''} aria-label="Un kilo de moins"><i class="ph-bold ph-minus"></i></button>
      <div class="text-center"><div class="gros-kg">${kg} <small>kg</small></div><div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">${maxKg > 0 ? `max ${maxKg} kg` : 'pas assez de cash'}</div></div>
      <button type="button" class="gros-step" onclick="setGrossisteKg(grossisteKg + 1)" ${kg >= maxKg ? 'disabled' : ''} aria-label="Un kilo de plus"><i class="ph-bold ph-plus"></i></button>
    </div>
    ${quick.length ? `<div class="flex gap-2 mt-4">${quick.map(v => `<button type="button" class="gros-quick ${v === kg ? 'on' : ''}" onclick="setGrossisteKg(${v})">${v === maxKg && quick.length > 1 ? `Max · ${v}` : `${v} kg`}</button>`).join('')}</div>` : ''}
    ${jloLeft > 0 ? `<div class="text-[11px] text-amber-300 font-bold text-center mt-3">Malus J-Lo : tes 5 premiers kg coûtent le double (encore ${jloLeft} kg)${doubled > 0 ? `, dont ${doubled} dans cet achat` : ''}</div>` : ''}
    <div class="flex items-center justify-between mt-4 px-1"><span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total (cash uniquement)</span><span class="font-anton text-2xl text-emerald-300 whitespace-nowrap">${getGrossisteCost(kg).toLocaleString()} €</span></div>
    <div class="grid grid-cols-[1fr_1.8fr] gap-2 mt-3"><button type="button" class="gros-ghost" onclick="closeGrossiste()">Partir</button><button type="button" class="police-cta gros-cta" style="margin-top:0" onclick="confirmGrossistePurchase()" ${kg <= 0 ? 'disabled' : ''}>Acheter ${kg} kg</button></div>`;
}
async function confirmGrossistePurchase() {
  if (!isMyTurnToPlay) { closeGrossiste(); return showAppAlert("Ce n'est plus ton tour !", "Tour Inactif"); }
  const kg = grossisteKg;
  if (kg <= 0) return showAppAlert("Sélectionne au moins 1 kg.", "Achat");
  const cost = getGrossisteCost(kg);
  if (localPlayer.pocketCash < cost) return showAppAlert("Cash en poche insuffisant !", "Fonds Insuffisants");
  const drugsBefore = localPlayer.drugs, cashBefore = localPlayer.pocketCash;
  if (localPlayer.caidId === 'caid_5') localPlayer.jloDoubledKgBought = (localPlayer.jloDoubledKgBought || 0) + Math.min(kg, getJloDoubledKgLeft());
  localPlayer.pocketCash -= cost;
  localPlayer.drugs += kg;
  spendActionPm();
  refreshHud();
  // Livraison : même écran, bilan avant → après
  const scr = document.getElementById('grossisteScreen');
  scr.dataset.state = 'livre';
  document.getElementById('grossisteBubble').innerText = 'Fais-en bon usage.';
  const row = (icon, color, label, before, after) => `<div class="police-row"><i class="ph-bold ${icon}" style="color:${color}"></i><span class="lbl">${label}</span>${before !== '' ? `<span class="bef">${before}</span><i class="ph-bold ph-arrow-right text-slate-500 text-xs"></i>` : ''}<span class="aft" style="color:${color}">${after}</span></div>`;
  document.getElementById('grossistePanel').innerHTML = `<h2 class="font-anton text-center text-white" style="font-size:40px;line-height:1">+${kg} KG.</h2>
    <div class="flex flex-col gap-1.5 mt-3">
      ${row('ph-leaf', '#34d399', 'Drogue sur toi', `${drugsBefore} kg`, `${localPlayer.drugs} kg`)}
      ${row('ph-money', '#fbbf24', 'Cash en poche', `${cashBefore.toLocaleString()} €`, `${localPlayer.pocketCash.toLocaleString()} €`)}
      ${row('ph-sneaker-move', '#cbd5e1', 'Action', '', '2 PM dépensés')}
    </div>
    <button type="button" class="police-cta gros-cta" onclick="closeGrossiste()">Repartir</button>`;
}

// Fauché : écran commun « pas assez d'argent » des boutiques (portefeuille vide et poussière animée)
function showBrokeScreen(cost, itemName) {
  const have = localPlayer.pocketCash + localPlayer.safeCash;
  const scr = document.getElementById('brokeScreen');
  document.getElementById('brokeItem').innerText = itemName ? `Pour : ${itemName}` : '';
  document.getElementById('brokePrice').innerText = `${cost.toLocaleString()} €`;
  document.getElementById('brokeHave').innerText = `${have.toLocaleString()} €`;
  document.getElementById('brokeMiss').innerText = `${Math.max(0, cost - have).toLocaleString()} €`;
  scr.classList.remove('hidden', 'show');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  try { if (navigator.vibrate) navigator.vibrate([40, 50, 40]); } catch (e) {}
  return new Promise(resolve => {
    document.getElementById('brokeCta').onclick = () => { scr.classList.add('hidden'); scr.classList.remove('show'); resolve(); };
  });
}
// Paiement : cash en poche, CB (coffre du QG) ou répartition choisie par le joueur
let paySplit = { cash: 0, min: 0, max: 0, step: 500 };
function openPaymentChoiceModal(purchaseData) {
  pendingPurchaseData = purchaseData;
  const cost = purchaseData.cost;
  const pocket = localPlayer.pocketCash, safe = localPlayer.safeCash;
  // Nom de la boutique (donné par l'achat, sinon celle ouverte derrière, sinon « Achat »)
  const shops = { modalArmoryShop: 'Armurerie', modalNightclubShop: 'Nightclub', modalSportclubShop: 'Sportclub', modalDealerShop: 'Concessionnaire' };
  const shop = Object.keys(shops).find(id => !document.getElementById(id).classList.contains('hidden'));
  document.getElementById('payShopName').innerText = purchaseData.shop || (shop ? shops[shop] : 'Achat');
  document.getElementById('paymentItemNameTitle').innerText = purchaseData.name;
  document.getElementById('paymentItemPriceDisplay').innerText = `${cost.toLocaleString()} €`;
  document.getElementById('paymentPocketAvailable').innerText = `${pocket.toLocaleString()} €`;
  document.getElementById('paymentSafeAvailable').innerText = `${safe.toLocaleString()} €`;
  document.getElementById('btnPayWithPocket').disabled = pocket < cost;
  document.getElementById('btnPayWithSafe').disabled = safe < cost;
  // Répartition : la part de cash va de « ce que la CB ne couvre pas » à « tout le cash disponible »
  const step = cost % 500 === 0 ? 500 : 100;
  const min = Math.max(0, cost - safe), max = Math.min(pocket, cost);
  paySplit = { cash: Math.min(max, Math.max(min, Math.round(cost / 2 / step) * step)), min, max, step };
  const range = document.getElementById('paySplitRange');
  range.min = min; range.max = max; range.step = step;
  const possible = max >= min && pocket + safe >= cost;
  document.getElementById('paySplit').classList.toggle('hidden', !possible || max === min && (pocket >= cost || safe >= cost));
  // Aucun moyen ne suffit seul : la répartition est dépliée d'office
  document.getElementById('paySplit').classList.toggle('open', pocket < cost && safe < cost);
  setPaySplit(paySplit.cash);
  document.getElementById('modalPaymentChoice').classList.remove('hidden');
}
function togglePaySplit() { document.getElementById('paySplit').classList.toggle('open'); }
function setPaySplit(cash) {
  const { min, max } = paySplit;
  paySplit.cash = Math.max(min, Math.min(max, Math.round(cash)));
  const cost = pendingPurchaseData ? pendingPurchaseData.cost : 0;
  const cb = cost - paySplit.cash;
  document.getElementById('paySplitRange').value = paySplit.cash;
  document.getElementById('paySplitCash').innerText = `${paySplit.cash.toLocaleString()} €`;
  document.getElementById('paySplitCb').innerText = `${cb.toLocaleString()} €`;
  document.getElementById('btnPayWithCumul').innerText = `Payer ${paySplit.cash.toLocaleString()} € cash + ${cb.toLocaleString()} € CB`;
}
function stepPaySplit(dir) {
  // Pas de 500 € (ou 100 €), en restant dans les limites des deux soldes
  const { step, min, max } = paySplit;
  let next = paySplit.cash + dir * step;
  if (dir > 0 && next > max) next = max;
  if (dir < 0 && next < min) next = min;
  setPaySplit(next);
}
async function confirmPaymentSource(source) {
  if (!pendingPurchaseData) return;
  if (!isMyTurnToPlay) { closeModal('modalPaymentChoice'); pendingPurchaseData = null; return showAppAlert("Ce n'est plus ton tour !", "Tour Inactif"); }
  const cost = pendingPurchaseData.cost;
  if (source === 'pocket') {
    if (localPlayer.pocketCash < cost) return;
    localPlayer.pocketCash -= cost;
  } else if (source === 'safe') {
    if (localPlayer.safeCash < cost) return;
    localPlayer.safeCash -= cost;
  } else {
    const cash = paySplit.cash, cb = cost - cash;
    if (cash > localPlayer.pocketCash || cb > localPlayer.safeCash || cash < 0 || cb < 0) return showAppAlert("Répartition impossible avec tes soldes.", "Paiement");
    localPlayer.pocketCash -= cash;
    localPlayer.safeCash -= cb;
  }
  const pData = pendingPurchaseData;
  closeModal('modalPaymentChoice');
  pendingPurchaseData = null;
  await finalizePurchaseExecution(pData);
  refreshHud();
}
async function finalizePurchaseExecution(pData) {
  const type = pData.type;
  const data = pData.data;
  if (pData.markKitanoWeapon) {
    localPlayer.firstWeaponDoubled = true;
  }
  if (pData.voucher) useVoucher(pData.voucher);
  spendActionPm();
  if (type === 'eq') {
    const slot = data.sl === 'arme' ? 'WEAPON' : (data.sl === 'prot' ? 'ARMOR' : 'VEHICLE');
    const bonus = data.atk || data.def || data.pm || 1;
    const bTxt = data.atk
      ? `+${bonus} Attaque`
      : (data.def ? `+${bonus} Défense` : `+${bonus} PM`);
    localPlayer.inventory.push({
      id: 'item_' + Date.now(),
      type: slot,
      name: data.n,
      price: pData.cost,
      bonusVal: bonus,
      isMotorized: data.isMotorized,
      bonusLabel: bTxt,
      isFirearm: !!data.isFirearm,
      desc: data.desc || `Confère ${bTxt}`
    });
    refreshHud(); // objet enregistré tout de suite, sans attendre la lecture du message
    await showAppAlert(`Rangé dans ton Sac : ${data.n}`, "📦 Achat Confirmé");
  } else if (type === 'gb') {
    const bVal = data.atk || (data.lvl === 2 ? 2 : 1);
    localPlayer.musclesOnPerson.push({
      id: 'gb_' + Date.now(),
      type: 'MUSCLE',
      level: data.lvl || 1,
      name: `Lascar Niv. ${data.lvl || 1}`,
      bonusVal: bVal,
      bonusLabel: `+${bVal} Atk / +${bVal} Def`
    });
    refreshHud();
    await showAppAlert(`Lascar recruté (+${bVal} Attaque et +${bVal} Défense) !`, "💪 Recrutement");
  } else if (type === 'pr') {
    localPlayer.prostituteInTransit = { id: 'pr_' + Date.now(), type: 'PROSTITUTE', level: data.lvl || 1, name: `Prostituée Niv. ${data.lvl||1}`, revenue: data.rev || (data.lvl === 2 ? 2500 : 1000) };
    refreshHud();
    await showAppAlert("Prostituée en transit. Dépose-la au QG !", "💃 Recrutement");
  }
}
