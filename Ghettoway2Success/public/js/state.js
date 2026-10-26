// État du joueur, roster des caïds, variables globales de la partie, effets radio

// =========================================================================
// LECTURE & CALCUL DES EFFETS FLASH RADIO
// =========================================================================
function isRadioEffectActive(type) {
  const ev = currentSession.currentRadioEvent;
  return !!(ev && ev.effectType === type);
}

function getRadioEffectValue(type, fallbackVal = 0) {
  const ev = currentSession.currentRadioEvent;
  if (ev && ev.effectType === type && ev.effectVal !== undefined) {
    return Number(ev.effectVal);
  }
  return fallbackVal;
}
const myPlayerToken = (() => {
  let t = localStorage.getItem('g2s_player_token');
  if (!t) { t = 'tok_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36); localStorage.setItem('g2s_player_token', t); }
  return t;
})();
const CAID_ROSTER = [
  { id: 'caid_1', name: 'Burger Queen', imageFile: 'bleu.jpg', bannerFile: 'bandeau-bleu.jpg', hex: '#3b82f6', bonus: 'Démarre avec 1 Kebab en inventaire (soigne 1 Cœur).', malus: 'Démarrage poussif : commence le tour 1 avec 0 PM.', skillName: 'Boule de Graisse', skillDesc: 'Se met en boule et roule jusqu\'à 5 cases.', startCash: 5000, startDrug: 5, startHearts: 3, startItems: [{ id: 'kebab_1', type: 'CONSUMABLE', name: 'Kebab', desc: 'Restaure 1 Cœur de Vie' }], unarmedAtk: 1 },
  { id: 'caid_2', name: 'Joint Dujardin', imageFile: 'rouge.jpg', bannerFile: 'bandeau-rouge.jpg', hex: '#ef4444', bonus: '+2 000 € au départ (7 000 € cash).', malus: '0 kg de drogue au départ.', skillName: 'Tour de Passe-Passe', skillDesc: 'Échange sa position avec un rival à 5 cases max.', startCash: 7000, startDrug: 0, startHearts: 3, startItems: [], unarmedAtk: 1 },
  { id: 'caid_3', name: 'Nelson Sativa', imageFile: 'vert.jpg', bannerFile: 'bandeau-vert.jpg', hex: '#22c55e', bonus: '+2 kg de drogue (7 kg au départ).', malus: 'Démarre avec 0 € en cash.', skillName: 'La Grosse Sieste', skillDesc: 'Récupère immédiatement 1 Cœur de Vie.', startCash: 0, startDrug: 7, startHearts: 3, startItems: [], unarmedAtk: 1 },
  { id: 'caid_4', name: 'Mary J Blunt', imageFile: 'rose.jpg', bannerFile: 'bandeau-rose.jpg', hex: '#ec4899', bonus: '1ère Prostituée Lvl 1 gratuite.', malus: 'Commence avec 1 seul Cœur.', skillName: 'Danse Lascive', skillDesc: 'Réduit l\'Attaque d\'un rival de 3 points ce tour.', startCash: 5000, startDrug: 5, startHearts: 1, startItems: [], unarmedAtk: 1 },
  { id: 'caid_5', name: 'J-Lo Gramme', imageFile: 'violet.jpg', bannerFile: 'bandeau-violet.jpg', hex: '#a855f7', bonus: 'Peut démarrer sur la tuile Église.', malus: '5 premiers kg au grossiste coûtent double.', skillName: 'Prière Miraculeuse', skillDesc: '50% de chance d\'annuler un contrôle ou une agression.', startCash: 5000, startDrug: 5, startHearts: 3, startItems: [], unarmedAtk: 1 },
  { id: 'caid_6', name: 'Tonteushi Kitano', imageFile: 'jaune.jpg', bannerFile: 'bandeau-jaune.jpg', hex: '#eab308', bonus: 'Attaque à mains nues = 3.', malus: '1er achat d\'arme coûte le double.', skillName: 'Tir de Shuriken', skillDesc: 'Réduit la Défense d\'un rival de 3 points.', startCash: 5000, startDrug: 5, startHearts: 3, startItems: [], unarmedAtk: 3 },
  { id: 'caid_7', name: 'Jamel Pépouze', imageFile: 'orange.jpg', bannerFile: 'bandeau-orange.jpg', hex: '#f97316', bonus: 'Démarre avec 1 Gilet pare-balles en main.', malus: 'Commence devant le Commissariat.', skillName: 'Vol à la Tire', skillDesc: 'Dérobe 1 objet à un rival à 1 case max.', startCash: 5000, startDrug: 5, startHearts: 3, startItems: [{ id: 'armor_jamel', type: 'ARMOR', name: 'Gilet pare-balles usagé', price: 2000, bonusVal: 1, bonusLabel: '+1 Défense', desc: 'Confère +1 en Défense' }], unarmedAtk: 1 },
  { id: 'caid_8', name: 'Weed-Nesday', imageFile: 'noir.jpg', bannerFile: 'bandeau-noir.jpg', hex: '#64748b', bonus: 'Démarre avec un Poing Américain (+1 Atk).', malus: 'Commence avec 2 Cœurs sur 3.', skillName: 'Siphon Vital', skillDesc: 'Aspire et vole 1 Cœur de Vie à un rival.', startCash: 5000, startDrug: 5, startHearts: 2, startItems: [{ id: 'weapon_poing', type: 'WEAPON', name: 'Poing Américain', price: 1500, bonusVal: 1, bonusLabel: '+1 Attaque', desc: 'Confère +1 en Attaque' }], unarmedAtk: 1 }
];
let localPlayer = {
  caidId: null,
  caidName: null,
  isHost: false,
  pocketCash: 5000,
  safeCash: 0,
  drugs: 5,
  safeDrugs: 0,
  hearts: 3,
  baseAtk: 1,
  baseDef: 0,
  tempAtkMalus: 0,
  tempDefMalus: 0,
  strayDogActive: false,
  firstWeaponDoubled: false,
  equipped: { weapon: null, armor: null, vehicle: null },
  musclesOnPerson: [],
  prostituteInTransit: null,
  prostitutesAtSafeList: [],
  freeProstituteClaimed: false,
  inventory: [],
  specialUsedThisTurn: false,
  allianceActive: false,
  activeAlly: null
};
function getMyCaid() {
  const id = localPlayer.caidId || localStorage.getItem('g2s_saved_caid_id');
  return CAID_ROSTER.find(c => c.id === id) || CAID_ROSTER[0];
}
let currentSession = { round: 1, currentRadioEvent: null };
let selectedPlayerCount = 4;
let selectedCaidMode = 'random';
let roomSelectionMode = 'random';
let manualFocusIndex = 0;
let caidLocked = false;
let carouselItems = [];
let isDrawingCarousel = false;
let html5QrScannerInstance = null;
let currentQrPhotoObjectUrl = null;
let currentTransferMode = 'deposit';
let currentTransferResource = 'cash';
let connectedRivals = [];
let nonAggressionPacts = [];
let takenCaidsInGame = [];
let pendingAllianceRequest = null;
let isMyTurnToPlay = true;
let activeTurnPlayerToken = null;
let pmSpentThisTurn = 0; // aide-mémoire : 2 PM décomptés par attaque lancée
let pendingPurchaseData = null;
let grossisteUnitCost = 1000;
let combatModifiers = { flatAtkBonus: 0, doubleMuscles: false, doubleWeapon: false, nullEnemyWeapon: false };
let currentDuelInfo = null;
let isCombatReady = false;
let myWeaponNullified = false; // Couvercle de poubelle adverse : mon arme compte pour 0 dans ce combat

function isRivalProtectedByPact(rivalToken) {
  if (!rivalToken || !nonAggressionPacts || !nonAggressionPacts.length) return false;
  return nonAggressionPacts.some(
    p => p.untilRound >= currentSession.round && p.tokens.includes(myPlayerToken) && p.tokens.includes(rivalToken)
  );
}

function applyCaidToLocalPlayer(chosenCaid) {
  if (!chosenCaid) return;
  caidLocked = true;
  localPlayer.caidId = chosenCaid.id;
  localPlayer.caidName = chosenCaid.name;
  localStorage.setItem('g2s_saved_caid_id', chosenCaid.id);
  localPlayer.pocketCash = chosenCaid.startCash;
  localPlayer.drugs = chosenCaid.startDrug;
  localPlayer.safeCash = 0;
  localPlayer.safeDrugs = 0;
  localPlayer.hearts = chosenCaid.startHearts;
  localPlayer.baseAtk = chosenCaid.unarmedAtk;
  localPlayer.baseDef = 0;
  localPlayer.inventory = JSON.parse(JSON.stringify(chosenCaid.startItems));
  localPlayer.equipped = { weapon: null, armor: null, vehicle: null };
  localPlayer.musclesOnPerson = [];
  localPlayer.prostituteInTransit = null;
  localPlayer.prostitutesAtSafeList = [];
  localPlayer.freeProstituteClaimed = false;
}

function updateRivalsList(players) {
  if (!players || !Array.isArray(players)) return;
  const meInServer = players.find(p => p.playerToken === myPlayerToken);
  if (meInServer && meInServer.caidId) {
    if (localPlayer.caidId !== meInServer.caidId) {
      const officialCaid = CAID_ROSTER.find(c => c.id === meInServer.caidId);
      if (officialCaid && !caidLocked) {
        applyCaidToLocalPlayer(officialCaid);
      } else {
        localPlayer.caidId = meInServer.caidId;
        localPlayer.caidName = meInServer.caidName;
        localStorage.setItem('g2s_saved_caid_id', meInServer.caidId);
      }
    }
  }
  connectedRivals = players.filter(p => p.socketId !== socket?.id && p.playerToken !== myPlayerToken);
  if (players.length > 1 && connectedRivals.length === 0) {
    connectedRivals = players.filter(p => p.socketId !== socket?.id);
  }
  if (localPlayer.allianceActive && localPlayer.activeAlly) {
    const freshAlly = connectedRivals.find(r => r.playerToken === localPlayer.activeAlly.allyToken);
    if (freshAlly) {
      localPlayer.activeAlly.grosBrasCount = freshAlly.musclesCount || 0;
      localPlayer.activeAlly.allyAtk = freshAlly.atk || 1;
      localPlayer.activeAlly.hasProstituteInTransit = !!freshAlly.hasProstituteInTransit;
    }
  }
  takenCaidsInGame = players.filter(p => p.caidId && p.playerToken !== myPlayerToken).map(p => p.caidId);
  syncMultiplayerTargets();
}
