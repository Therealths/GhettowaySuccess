// Combats de rue, riposte et pillage

// --- UI PILLAGE & BARRE DE PARTAGE ---
function selectRiposteTarget(chosenTargetToken) {
  if (!chosenTargetToken) return;
  const cta = document.getElementById('fightRiposteCta');
  if (cta) cta.disabled = true;
  if (socket) socket.emit('combat_select_riposte_target', { chosenTargetToken });
}

function openPillageModalUI(pillageInfo) {
  document.getElementById('pillageLoserName').innerText = pillageInfo.loserCaid || 'le perdant';
  const container = document.getElementById('pillageOptionsContainer');
  const btns = [];

  btns.push(`
    <button onclick="choosePillageReward('cash')" class="w-full p-3 glass-panel rounded-2xl border border-amber-500/40 flex items-center justify-between text-left">
      <div>
        <span class="text-xs font-black text-amber-300 uppercase block">💰 Son Cash en poche</span>
        <span class="text-[10px] font-mono text-white">la roulette décide : 30 à 60 %</span>
      </div>
      <i class="ph-bold ph-arrow-right text-amber-400"></i>
    </button>
  `);

  btns.push(`
    <button onclick="choosePillageReward('drugs')" class="w-full p-3 glass-panel rounded-2xl border border-emerald-500/40 flex items-center justify-between text-left">
      <div>
        <span class="text-xs font-black text-emerald-300 uppercase block">🌿 Sa Drogue en poche</span>
        <span class="text-[10px] font-mono text-white">la roulette décide : 30 à 60 %</span>
      </div>
      <i class="ph-bold ph-arrow-right text-emerald-400"></i>
    </button>
  `);

  // Objets de Fouille : jusqu'à 3, pris au hasard dans sa main (son Sac, sans l'équipement)
  const nItems = pillageInfo.availableItems || 0;
  btns.push(`
    <button onclick="choosePillageReward('items')" class="w-full p-3 glass-panel rounded-2xl border border-sky-500/40 flex items-center justify-between text-left ${nItems <= 0 ? 'opacity-40 pointer-events-none' : ''}">
      <div>
        <span class="text-xs font-black text-sky-300 uppercase block">🎒 ${Math.min(3, nItems) || 3} objet${Math.min(3, nItems) > 1 || !nItems ? 's' : ''} de Fouille au hasard</span>
        <span class="text-[10px] font-mono text-white">${nItems} objet${nItems > 1 ? 's' : ''} de Fouille dans sa main</span>
      </div>
      <i class="ph-bold ph-arrow-right text-sky-400"></i>
    </button>
  `);

  if (pillageInfo.hasProstitute) {
    // Alliés gagnants (si le serveur précise winnerTokens, on s'y limite)
    const winningAllies = (localPlayer.activeAllies || []).filter(a => !Array.isArray(pillageInfo.winnerTokens) || pillageInfo.winnerTokens.includes(a.allyToken));
    if (pillageInfo.isAlliedVictory && winningAllies.length) {
      if (!localPlayer.prostituteInTransit) {
        btns.push(`
          <button onclick="choosePillageReward('prostitute', '${myPlayerToken}')" class="w-full p-3 glass-panel rounded-2xl border border-pink-500/40 flex items-center justify-between text-left">
            <div>
              <span class="text-xs font-black text-pink-300 uppercase block">👠 Prendre sa Prostituée (Pour Moi)</span>
              <span class="text-[10px] font-mono text-white">Place l'escort dans ton slot transit</span>
            </div>
            <i class="ph-bold ph-arrow-right text-pink-400"></i>
          </button>
        `);
      }
      // Un bouton par allié dont le slot transit est libre
      winningAllies.filter(a => !a.hasProstituteInTransit).forEach(a => {
        btns.push(`
          <button onclick="choosePillageReward('prostitute', '${escapeHtml(a.allyToken)}')" class="w-full p-3 glass-panel rounded-2xl border border-purple-500/40 flex items-center justify-between text-left">
            <div>
              <span class="text-xs font-black text-purple-300 uppercase block">👠 Donner sa Prostituée à ${escapeHtml(a.caid || 'ton allié')}</span>
              <span class="text-[10px] font-mono text-white">Place l'escort chez ton allié</span>
            </div>
            <i class="ph-bold ph-arrow-right text-purple-400"></i>
          </button>
        `);
      });
    } else {
      const canTakePros = !localPlayer.prostituteInTransit;
      btns.push(`
        <button onclick="choosePillageReward('prostitute', '${myPlayerToken}')" class="w-full p-3 glass-panel rounded-2xl border border-pink-500/40 flex items-center justify-between text-left ${!canTakePros ? 'opacity-40 pointer-events-none' : ''}">
          <div>
            <span class="text-xs font-black text-pink-300 uppercase block">👠 Capturer sa Prostituée</span>
            <span class="text-[10px] font-mono text-white">${canTakePros ? 'Disponible en transit' : 'Ton slot transit est déjà occupé'}</span>
          </div>
          <i class="ph-bold ph-arrow-right text-pink-400"></i>
        </button>
      `);
    }
  }

  btns.push(`
    <button onclick="choosePillageReward('none')" class="w-full py-2.5 glass-panel text-slate-400 font-bold rounded-xl text-xs uppercase">Ne rien prendre / Fermer</button>
  `);

  container.innerHTML = btns.join('');
  document.getElementById('modalCombatPillage').classList.remove('hidden');
}

// « A », « A et B », « A, B et C »
function formatAllyNames(allies) {
  const names = allies.map(a => a.caid || 'un allié');
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : (names[0] || '');
}

function choosePillageReward(category, recipientToken = null) {
  closeModal('modalCombatPillage');
  if (socket) socket.emit('execute_pillage_choice', { category, recipientToken });
}

function resetCombatModifiers() {
  combatModifiers = { flatAtkBonus: 0, doubleMuscles: false, doubleWeapon: false, nullEnemyWeapon: false };
}
// Fin d'un combat : Balle perforante et Couvercle de poubelle ne valent que pour un seul combat
// (le Pot de Protéine reste actif jusqu'à la fin de la manche)
function endSingleCombatEffects() {
  combatModifiers.doubleWeapon = false;
  combatModifiers.nullEnemyWeapon = false;
  myWeaponNullified = false;
  refreshHud();
}
function isFirearm(weaponObj) {
  if (!weaponObj) return false;
  if (typeof weaponObj === 'object' && weaponObj.isFirearm !== undefined) {
    return weaponObj.isFirearm === true;
  }
  const wName = typeof weaponObj === 'string' ? weaponObj : (weaponObj.name || '');
  const l = wName.toLowerCase();
  if (l.includes('batte') || l.includes('poing') || l.includes('couteau') || l.includes('cran') || l.includes('hache') || l.includes('mains')) return false;
  return l.includes('revolver') || l.includes('pistolet') || l.includes('fusil') || l.includes('pompe') || l.includes('mitraillette') || l.includes('canon') || l.includes('gun');
}

// --- Écran de combat plein page (même scène et mêmes briques que l'écran d'alliance) ---
// Règle : on ne montre jamais l'attaque ni la défense de l'adversaire, seulement « ? » et l'écart au résultat.
let fightTargetToken = null;       // cible choisie sur l'écran de choix
let fightReadyNames = new Set();   // combattants (hors moi) qui ont cliqué sur Prêt
let fightLogLines = [];            // journal du duel (seule la dernière ligne est affichée)
let fightForces = null;            // forces visibles du camp d'en face { muscles, prostitute, dog }
let fightWaiting = null;           // attaquant en attente du choix de riposte du défenseur
let fightRiposteTargets = [];      // attaquants proposés au défenseur pour sa riposte
let fightRipostePick = null;
let fightLast = null;              // dernier duel affiché (gardé pour l'écran de résultat)
let fightResolve = null;

const FIGHT_CHIPS = {
  combat: '<i class="ph-fill ph-sword"></i> Combat',
  defense: '<i class="ph-fill ph-shield"></i> Défense',
  riposte: '<i class="ph-bold ph-arrows-counter-clockwise"></i> Riposte',
  victoire: '<i class="ph-fill ph-trophy"></i> Victoire',
  defaite: '<i class="ph-fill ph-skull"></i> Défaite',
  nul: '<i class="ph-fill ph-handshake"></i> Match nul'
};
const fightImg = name => {
  const r = (connectedRivals || []).find(x => allyRivalName(x) === name);
  return allyCaidImg(r && r.caidId, name);
};
const fightNames = str => String(str || '').split(' & ').filter(Boolean);
const fightPts = n => `${n} point${Math.abs(n) > 1 ? 's' : ''}`;
// Avatar en grand ou en mini, grisé (perdant) sans pastille
const fightDim = html => html.replace('class="ally-tag ', 'class="ally-tag dim ').replace('class="ally-mini ', 'class="ally-mini dim ');
// Un camp : un avatar sur la silhouette, ou plusieurs minis empilés
function fightSide(side, list, dim) {
  if (!list.length) return '';
  const x = side === 'l' ? '18px' : '14px';
  if (list.length === 1) {
    const t = allyTag(list[0].img, list[0].label, list[0].st);
    return allyAt(side, '52%', dim ? fightDim(t) : t, x);
  }
  const minis = list.map(p => { const m = allyMini(p.img, p.label, p.st); return dim ? fightDim(m) : m; }).join('');
  return allyAt(side, ['52%', '44%', '36%', '28%', '22%'][Math.min(list.length, 5) - 1], minis, '12px');
}
const fightVs = (l, r) => `<div class="fight-vs" style="top:54%">${l > 1 || r > 1 ? `${l} VS ${r}` : 'VS'}</div>`;
const fightReady = ok => ok === true ? '<span class="fight-rdy ok">✓ prêt</span>' : `<span class="fight-rdy">${ok || 'réfléchit…'}</span>`;
const fightRow = (icon, label, after) => `<div class="police-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft">${after}</span></div>`;

function fightState() {
  const scr = document.getElementById('fightScreen');
  return scr && !isClosed(scr) ? scr.dataset.state : null;
}

// Affiche un état ; même état déjà à l'écran : simple mise à jour sans rejouer les animations (sauf replay)
function fightRender(state, theme, chip, stage, bottom, replay) {
  const scr = document.getElementById('fightScreen');
  const same = fightState() === state && !replay;
  scr.dataset.state = state;
  scr.dataset.theme = theme;
  document.getElementById('fightRound').innerText = currentSession.round || 1;
  document.getElementById('fightChip').innerHTML = FIGHT_CHIPS[chip] || '';
  document.getElementById('fightAbort').classList.toggle('hidden', !fightCanAbort(state));
  document.getElementById('fightStage').innerHTML = stage;
  document.getElementById('fightBottom').innerHTML = bottom;
  setSheet(scr, state === 'choix');
  if (same) { scr.classList.add('static'); return; }
  scr.classList.remove('hidden', 'show', 'static');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  const prev = fightResolve;
  return new Promise(resolve => { fightResolve = () => { if (prev) prev(); resolve(); }; });
}

function closeFightScreen() {
  const scr = document.getElementById('fightScreen');
  if (scr) hideSheet(scr, 'show', 'static');
  const r = fightResolve;
  fightResolve = null;
  if (r) r();
}

// Journal du duel : on garde tout, on affiche la dernière ligne
function fightLog(html, reset) {
  if (reset) fightLogLines = [];
  if (html) fightLogLines.push(html);
  const el = document.getElementById('combatLiveLog');
  // Zone toujours affichée, hauteur fixe (2 lignes) : le score et les boutons ne bougent pas quand un message arrive
  if (el) el.innerHTML = fightLogLines[fightLogLines.length - 1] || '<span class="text-slate-500">Choisis tes objets, puis déclare-toi prêt.</span>';
}

// CHOIX : cartes des Caïds rivaux (pacte actif et hôpital grisés)
async function openCombatModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour d'attaquer !", "Tour Inactif");
  isCombatReady = false;
  fightTargetToken = null;
  syncMultiplayerTargets();
  return renderFightChoice();
}

function fightPactUntil(token) {
  return (nonAggressionPacts || []).filter(p => p.tokens.includes(myPlayerToken) && p.tokens.includes(token))
    .reduce((m, p) => Math.max(m, p.untilRound || 0), 0);
}

// Caïds déjà attaqués pendant ce tour (une seule attaque par cible et par tour ; le serveur le vérifie aussi)
let attackedThisTurn = [];
// =========================================================================
// ATTAQUE DE QG : 3 Lascars au moins (avec ceux des alliés du tour), devant le QG, une fois par manche
// =========================================================================
const QG_RAID_LASCARS = 3;
const qgRaidAllies = () => (localPlayer.allianceActive ? (localPlayer.activeAllies || []) : []);
const allyLascars = a => ((connectedRivals || []).find(r => r.playerToken === a.allyToken) || {}).musclesCount || 0;
function qgRaidButtonHtml() {
  const rivals = (connectedRivals || []).filter(r => !r.away && !isRivalProtectedByPact(r.playerToken));
  if (!rivals.length) return '';
  const mine = localPlayer.musclesOnPerson.length, withAllies = mine + qgRaidAllies().reduce((n, a) => n + allyLascars(a), 0);
  const done = localPlayer.qgRaidRound === (currentSession.round || 1);
  const sub = done ? 'déjà fait cette manche' : withAllies >= QG_RAID_LASCARS ? `${withAllies} Lascars avec toi${withAllies > mine ? ' et tes alliés' : ''}` : `3 Lascars requis (tu en as ${withAllies})`;
  return `<button type="button" class="qg-raid-btn" onclick="startQgRaid()" ${done || withAllies < QG_RAID_LASCARS ? 'disabled' : ''}><i class="ph-fill ph-house-line"></i><span><b>Attaquer son QG</b><small>${sub}</small></span><i class="ph-bold ph-caret-right"></i></button>`;
}
async function startQgRaid() {
  const target = (connectedRivals || []).find(r => r.playerToken === fightTargetToken);
  if (!target || !isMyTurnToPlay) return;
  const name = allyRivalName(target);
  if (localPlayer.qgRaidRound === (currentSession.round || 1)) return showAppAlert('Une seule attaque de QG par manche.', '🏠 Attaque de QG');
  const allies = qgRaidAllies().filter(a => a.allyToken !== target.playerToken && !pactBetween(a.allyToken, target.playerToken));
  const mine = localPlayer.musclesOnPerson.length;
  let useAlliance = false;
  if (allies.length && mine < QG_RAID_LASCARS) useAlliance = true;
  else if (allies.length) useAlliance = await showAppConfirm(`Attaquer le QG de ${name} seul ou avec ${formatAllyNames(allies)} ?\n\nEn alliance, vos Lascars et vos Attaques s'additionnent, et le butin se partage.`, '🏠 Seul ou en Alliance ?', '🤝 En Alliance', 'Seul');
  const lascars = mine + (useAlliance ? allies.reduce((n, a) => n + allyLascars(a), 0) : 0);
  if (lascars < QG_RAID_LASCARS) return showAppAlert(`Il faut au moins 3 Lascars pour attaquer un QG : tu en as ${lascars}.`, '🏠 Attaque de QG');
  if (!await showAppConfirm(`Ton pion est-il bien sur la case en face du QG de ${name} ?\n\nTes Lascars risquent d'y rester : 25 % chacun si ça passe, 50 % si la défense tient.`, '🏠 Attaque de QG', "Oui, on y va", 'Pas encore')) return;
  localPlayer.qgRaidRound = currentSession.round || 1;
  closeFightScreen();
  spendActionPm();
  if (socket) socket.emit('qg_raid', { targetPlayerToken: target.playerToken, useAlliance });
}
// Résultat pour chaque assaillant : Attaque contre Défense du QG, Lascars perdus, puis le butin (premier assaillant)
function showQgRaidResult({ success, atk, def, lost, targetCaid, raiders, picker, late }) {
  if (lost && !late) localPlayer.musclesOnPerson.splice(Math.max(0, localPlayer.musclesOnPerson.length - lost), lost);
  refreshHud();
  const scr = document.getElementById('qgRaidScreen');
  scr.dataset.tone = success ? 'ko' : 'block';
  document.getElementById('qrrStatus').innerText = success ? 'QG FORCÉ !' : 'LA DÉFENSE TIENT';
  document.getElementById('qrrSub').innerText = `QG de ${targetCaid}${(raiders || []).length > 1 ? ` · ${allyListNames(raiders.map(allyShort))}` : ''}`;
  document.getElementById('qrrNums').innerHTML = `<div><small>Votre attaque</small><b>${atk}</b></div><div><small>Défense du QG</small><b>${def}</b></div>`;
  const rows = fightRow('ph-barbell', 'Lascars tombés', lost ? `−${lost}` : 'aucun')
    + fightRow('ph-skull', 'Risque pour chaque Lascar', success ? '25 %' : '50 %');
  const btns = success && picker && !late
    ? `<div class="ws-label text-center">Qu'est-ce que tu prends ? (la roulette décide de la part : 30 à 60 %)</div>
       <div class="grid grid-cols-2 gap-2"><button type="button" class="qrr-pick cash" onclick="takeQgRaid('cash')">💰 Le coffre<small>cash du QG</small></button><button type="button" class="qrr-pick drugs" onclick="takeQgRaid('drugs')">🌿 La drogue<small>stock du QG</small></button></div>`
    : `${success ? `<div class="text-center text-[11px] font-bold text-slate-400 mt-2">${picker ? '' : 'Ton allié choisit le butin, puis vous le partagez'}</div>` : '<div class="text-center text-[11px] font-bold text-slate-400 mt-2">Vous repartez les mains vides</div>'}
       <button type="button" class="lf-close" onclick="document.getElementById('qgRaidScreen').classList.add('hidden')">OK</button>`;
  document.getElementById('qrrBody').innerHTML = `<div class="flex flex-col gap-1.5">${rows}</div>${btns}`;
  scr.classList.remove('hidden');
}
function takeQgRaid(category) {
  document.getElementById('qgRaidScreen').classList.add('hidden');
  if (socket) socket.emit('qg_raid_take', { category });
}

function renderFightChoice() {
  const rivals = connectedRivals || [];
  const isOff = r => !!r.inHospital || !!r.away || isRivalProtectedByPact(r.playerToken) || attackedThisTurn.includes(r.playerToken);
  const free = rivals.filter(r => !isOff(r));
  if (!free.some(r => r.playerToken === fightTargetToken)) fightTargetToken = free.length ? free[0].playerToken : null;
  const target = free.find(r => r.playerToken === fightTargetToken);
  const me = getMyCaid();

  const right = target
    ? allyTag(allyCaidImg(target.caidId, allyRivalName(target)), allyRivalName(target))
    : `<div class="ally-tag"><div class="ally-unknown">?</div><b>Ta cible</b></div>`;
  const stage = allyAt('l', '52%', allyTag(me.imageFile, 'Toi'), '18px') + allyAt('r', '52%', right, '14px') + fightVs(1, 1);

  const lascars = n => `${n} Lascar${n > 1 ? 's' : ''}`;
  const pick = r => {
    const img = allyCaidImg(r.caidId, allyRivalName(r)), name = escapeHtml(allyRivalName(r));
    if (isRivalProtectedByPact(r.playerToken)) return `<div class="ally-pick off"><img src="${img}" alt=""><div class="n"><b>🤝 ${name}</b><span>Pacte actif : pas d’attaque jusqu’à la manche ${fightPactUntil(r.playerToken) || (currentSession.round || 1)}</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    if (r.away) return `<div class="ally-pick off"><img src="${img}" alt=""><div class="n"><b>💤 ${name}</b><span>A quitté la partie : intouchable</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    if (r.inHospital) return `<div class="ally-pick off"><img src="${img}" alt=""><div class="n"><b>🏥 ${name}</b><span>À l’hôpital : intouchable</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    if (attackedThisTurn.includes(r.playerToken)) return `<div class="ally-pick off"><img src="${img}" alt=""><div class="n"><b>⚔️ ${name}</b><span>Déjà attaqué ce tour : une seule attaque par tour</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
    const on = r.playerToken === fightTargetToken;
    return `<button type="button" class="ally-pick ${on ? 'on' : ''}" data-token="${escapeHtml(r.playerToken)}" onclick="pickFightTarget(this.dataset.token)"><img src="${img}" alt=""><div class="n"><b>${name}</b><span>${lascars(r.musclesCount || 0)}<br>Escort : ${r.hasProstituteInTransit ? 'oui' : 'non'}<br>Chien : ${r.hasStrayDog ? 'oui' : 'non'}</span></div><i class="${on ? 'ph-fill' : 'ph-bold'} ph-crosshair fight-aim"></i></button>`;
  };
  const bottom = `<h2 class="font-anton ally-head sm">QUI TU ATTAQUES ?</h2>
    ${rivals.length ? '' : '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucun Caïd rival dans la partie</div>'}
    ${rivals.length && !free.length ? '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucune cible attaquable cette manche</div>' : ''}
    <div class="ally-picks mt-3">${rivals.map(pick).join('')}</div>
    <div class="grid grid-cols-[1fr_1.6fr] gap-2 mt-4"><button type="button" class="btn-close ally-ghost" onclick="closeFightScreen()">Annuler</button><button type="button" id="btnInitiateFightAction" class="ally-cta" onclick="initiateCombatEngagement()" ${target ? '' : 'disabled'}>Engager le combat</button></div>
    ${qgRaidButtonHtml()}`;
  return fightRender('choix', 'atk', 'combat', stage, bottom);
}

function pickFightTarget(token) { fightTargetToken = token; renderFightChoice(); }
// Appelé par syncMultiplayerTargets : la liste des Caïds a changé
function refreshFightChoice() { if (fightState() === 'choix') renderFightChoice(); }

// Choix entre Attaque Coordonnée (Alliance) ou Attaque Solo
async function initiateCombatEngagement() {
  const target = connectedRivals.find(r => r.playerToken === fightTargetToken);
  if (!target) return showAppAlert("Aucune cible attaquable sélectionnée.", "Cible Requise");

  if (isRivalProtectedByPact(target.playerToken)) {
    return showAppAlert(`Pacte de non-agression avec ce Caïd jusqu’à la fin de la manche ${fightPactUntil(target.playerToken) || ((currentSession.round || 1) + 1)} : impossible de l’attaquer.`, "🤝 Cible protégée");
  }

  let useAlliance = false;
  // Alliés du tour, sauf la cible éventuelle
  // (un allié lié à la cible par un pacte de non-agression n'attaque pas avec toi)
  const combatAllies = (localPlayer.activeAllies || []).filter(a => a.allyToken !== target.playerToken && !pactBetween(a.allyToken, target.playerToken));
  if (localPlayer.allianceActive && combatAllies.length) {
    const n = combatAllies.length + 1;
    useAlliance = await showAppConfirm(
      `Tu es en Alliance avec ${formatAllyNames(combatAllies)}.\n\nComment veux-tu attaquer ?\n\n• SOLO : tu attaques seul.\n• EN ALLIANCE : attaque coordonnée à ${n} (si vous êtes ${n === 2 ? 'tous deux' : 'tous'} sur la bonne case).`,
      "⚔️ Solo ou en Alliance ?",
      "🤝 En Alliance",
      "Solo"
    );
  }

  const caid = getMyCaid();
  if (socket) {
    const btn = document.getElementById('btnInitiateFightAction');
    if (btn) btn.disabled = true; // en attente de l'ouverture du duel
    attackedThisTurn.push(target.playerToken);
    socket.emit('start_combat_engagement', {
      targetSocketId: target.socketId,
      targetPlayerToken: target.playerToken,
      attackerCaid: caid.name,
      useAlliance: useAlliance
    });
    spendActionPm();
  }
}

// Croix « annuler » : sur le choix de la cible, ou pour l'attaquant tant que le duel n'a pas commencé (personne n'est prêt)
function fightCanAbort(state) {
  if (state === 'choix') return true;
  const d = currentDuelInfo;
  return state === 'duel' && !!d && d.role === 'attacker' && (d.phase || 1) === 1 && !isCombatReady && !fightReadyNames.size;
}
function abortCombat() {
  // Assaut annulé avant le duel : il ne compte pas
  if (currentDuelInfo && currentDuelInfo.role === 'attacker') attackedThisTurn.pop();
  if (socket && currentDuelInfo) socket.emit('combat_cancel');
  else closeFightScreen();
}

// DUEL : avatars sur les silhouettes, ma stat contre « ? », prêt / réfléchit, journal, Objets / Prêt
function renderFightDuel(replay) {
  const d = currentDuelInfo;
  if (!d) return;
  fightLast = Object.assign({}, d);
  const me = getMyCaid();
  const atk = d.role === 'attacker';
  const p2 = d.phase === 2;
  const opp = fightNames(d.opponentCaid);
  const allies = atk ? (d.allies || []) : [];
  const mine = [{ img: me.imageFile, label: 'Toi' }, ...allies.map(a => ({ img: fightImg(a.caidName), label: a.caidName, st: fightReadyNames.has(a.caidName) ? 'ok' : '' }))];
  const theirs = opp.map(n => ({ img: fightImg(n), label: n, st: opp.length > 1 && fightReadyNames.has(n) ? 'ok' : '' }));
  const left = atk ? mine : theirs, right = atk ? theirs : mine;
  const nbAtk = left.length;

  const bubble = fightWaiting ? '' : (atk ? allyBubble('Viens là !', 'l', '4%') : allyBubble('Même pas peur.', 'r', '4%'));
  const stage = bubble + fightSide('l', left) + fightSide('r', right) + fightVs(left.length, right.length);

  const phase = fightWaiting ? 'Assaut repoussé'
    : p2 ? (atk ? 'Phase 2 · Riposte' : 'Phase 2 · Contre-attaque')
    : (nbAtk > 1 ? `Attaque coordonnée · ${nbAtk} alliés` : 'Phase 1 · Assaut');
  const title = fightWaiting ? 'BLOQUÉ !' : atk ? (p2 ? 'RIPOSTE !' : 'BASTON !') : 'TIENS BON !';

  const oppReady = opp.filter(n => fightReadyNames.has(n)).length;
  const oppSt = opp.length && oppReady >= opp.length ? true : (opp.length > 1 && oppReady ? `${oppReady}/${opp.length} prêts` : '');
  const plural = opp.length > 1;
  const myBox = `<div class="fight-box ${atk ? 'atk' : 'def'}"><span id="arenaAtkLabel"></span><b id="fightMyStat">0</b>${fightReady(isCombatReady)}</div>`;
  const oppBox = `<div class="fight-box hid"><span>${atk ? (plural ? 'Leur défense' : 'Sa défense') : (plural ? 'Leur assaut' : 'Son attaque')}</span><b>?</b><small>secrète</small>${fightReady(oppSt)}</div>`;
  const forces = !atk && fightForces ? `<div class="fight-log">Lascars en face : ${fightForces.muscles} · Escort : ${fightForces.prostitute ? 'oui' : 'non'} · Chien : ${fightForces.dog ? 'oui' : 'non'}</div>` : '';
  const actions = fightWaiting
    ? `<div class="text-center mt-3 ally-dots"><i></i><i></i><i></i></div><div class="text-center text-[11px] text-slate-400 mt-1">${escapeHtml(fightWaiting)}</div>`
    : `<div class="grid grid-cols-2 gap-2 mt-3"><button type="button" class="ally-ghost fight-items" onclick="openCombatItemSelectorModal()"><i class="ph-bold ph-backpack"></i> Objets</button><button type="button" id="btnToggleCombatReady" class="ally-cta fight-go ${isCombatReady ? 'on' : ''}" onclick="toggleCombatReadyState()"><span id="btnCombatReadyLabel">${isCombatReady ? '✓ Prêt (annuler)' : 'Prêt'}</span></button></div>`;
  const bottom = `<div class="fight-phase">${phase}</div>
    <h2 class="font-anton ally-head fight-title">${title}</h2>
    <div class="fight-score mt-3">${atk ? myBox : oppBox}<div class="fight-mid">VS</div>${atk ? oppBox : myBox}</div>
    <div class="flex flex-col gap-1.5 mt-3">${forces}<div id="combatLiveLog" class="fight-log"></div></div>
    ${actions}`;
  const theme = atk && !p2 ? 'atk' : 'def';
  const res = fightRender('duel', theme, atk ? (p2 ? 'riposte' : 'combat') : 'defense', stage, bottom, replay);
  fightLog();
  updateArenaLiveStats();
  return res;
}

// RIPOSTE : le défenseur choisit l'attaquant qui reçoit sa contre-attaque (sans voir leur défense)
function renderFightRiposte() {
  const me = getMyCaid();
  const list = fightRiposteTargets.map(t => ({ img: fightImg(t.caidName), label: t.caidName }));
  const stage = fightSide('l', list) + fightSide('r', [{ img: me.imageFile, label: 'Toi' }]);
  const pick = t => {
    const r = (connectedRivals || []).find(x => x.playerToken === t.playerToken);
    const n = r ? (r.musclesCount || 0) : null;
    const on = t.playerToken === fightRipostePick;
    return `<button type="button" class="ally-pick ${on ? 'on' : ''}" data-token="${escapeHtml(t.playerToken)}" onclick="pickRiposteTarget(this.dataset.token)"><img src="${fightImg(t.caidName)}" alt=""><div class="n"><b>${escapeHtml(t.caidName)}</b>${n !== null ? `<span>${n} Lascar${n > 1 ? 's' : ''}</span>` : ''}</div><i class="${on ? 'ph-fill' : 'ph-bold'} ph-crosshair fight-aim"></i></button>`;
  };
  const bottom = `<div class="fight-phase">Phase 2 · Assaut repoussé</div>
    <h2 class="font-anton ally-head fight-title">À TOI DE FRAPPER</h2>
    <div class="text-center text-sm font-bold text-slate-300 mt-1 mb-3">Choisis qui reçoit ta contre-attaque</div>
    <div class="ally-picks">${fightRiposteTargets.map(pick).join('')}</div>
    <button type="button" id="fightRiposteCta" class="ally-cta mt-4" onclick="selectRiposteTarget(fightRipostePick)" ${fightRipostePick ? '' : 'disabled'}>Contre-attaquer</button>`;
  return fightRender('riposte', 'def', 'riposte', stage, bottom);
}
function pickRiposteTarget(token) { fightRipostePick = token; renderFightRiposte(); }

// Camps pour l'écran de résultat : moi (et mes alliés) à gauche, l'adversaire à droite
function fightResultSides(last) {
  const me = getMyCaid();
  const allies = last && last.role === 'attacker' ? (last.allies || []) : [];
  const mine = [{ img: me.imageFile, label: 'Toi' }, ...allies.map(a => ({ img: fightImg(a.caidName), label: a.caidName }))];
  return mine;
}

// VICTOIRE : bouton Racketter (pillage) pour le premier vainqueur, sinon OK
function showFightVictory({ dmgNet, opponentCaid, isPrimaryPicker, pillageInfo, winBonus }, last) {
  const mine = fightResultSides(last);
  const losers = fightNames(opponentCaid).map(n => ({ img: fightImg(n), label: n }));
  const stage = fightSide('l', mine) + fightSide('r', losers, true) + `<div class="ally-tape fight-tape" style="top:80%">K.O. !</div>`;
  const pick = !!(isPrimaryPicker && pillageInfo);
  const rows = fightRow('ph-sword', mine.length > 1 ? 'Votre assaut' : 'Ton attaque', `passe de ${fightPts(dmgNet || 0)}`)
    + fightRow('ph-heart-break', escapeHtml(opponentCaid || 'Le perdant'), '−1 cœur')
    + (winBonus ? fightRow('ph-broadcast', 'Règlement de comptes', `+${winBonus.toLocaleString()} €`) : '')
    + fightRow('ph-coins', 'Butin', pick ? 'à toi de choisir' : 'ton allié choisit');
  const bottom = `<h2 class="font-anton ally-head">VICTOIRE.</h2>
    <div class="flex flex-col gap-1.5 mt-3">${rows}</div>
    ${pick ? '' : '<div class="text-center text-[11px] font-bold text-slate-400 mt-3">Ton allié choisit le butin</div>'}
    <button type="button" class="ally-cta mt-4" onclick="${pick ? 'fightRacket()' : 'closeFightScreen()'}">${pick ? 'Racketter' : 'OK'}</button>`;
  fightPendingPillage = pick ? pillageInfo : null;
  return fightRender('victoire', 'win', 'victoire', stage, bottom);
}
let fightPendingPillage = null;
function fightRacket() {
  const info = fightPendingPillage;
  fightPendingPillage = null;
  closeFightScreen();
  if (info) openPillageModalUI(info);
}

// Roulette du racket (cash ou drogue) : la roue tourne et s'arrête sur la part prise (30 à 60 %), puis le montant
const RACKET_PCTS = [30, 35, 40, 45, 50, 55, 60];
function buildRacketWheel() {
  const el = document.getElementById('rrWheel');
  if (el.firstChild) return;
  const n = RACKET_PCTS.length, seg = 360 / n, r = 92, pt = (a, rr) => [100 + rr * Math.sin(a * Math.PI / 180), 100 - rr * Math.cos(a * Math.PI / 180)].map(v => v.toFixed(1));
  el.innerHTML = `<svg viewBox="0 0 200 200">${RACKET_PCTS.map((p, i) => {
    const a0 = i * seg - seg / 2, a1 = i * seg + seg / 2, [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r), [tx, ty] = pt(i * seg, r * 0.68);
    return `<path d="M100 100 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z" class="rr-seg${i % 2 ? ' b' : ''}"/><text x="${tx}" y="${ty}" transform="rotate(${(i * seg).toFixed(1)} ${tx} ${ty})">${p}%</text>`;
  }).join('')}<circle cx="100" cy="100" r="${r}" class="rr-rim"/><circle cx="100" cy="100" r="16" class="rr-hub"/></svg>`;
}
// role : 'thief' (tu prends) ou 'victim' (on te prend) ; who : l'autre Caïd
function showRacketRoulette({ category, pct, amount, who, role, qg }) {
  return new Promise(done => {
    const scr = document.getElementById('racketRoulette'), wheel = document.getElementById('rrWheel');
    buildRacketWheel();
    const cash = category === 'cash', amt = cash ? `${(amount || 0).toLocaleString()} €` : `${amount || 0} kg`;
    document.getElementById('rrKicker').innerText = qg ? `Attaque du QG · ${cash ? 'coffre' : 'drogue du QG'}` : `Racket · ${cash ? 'cash en poche' : 'drogue en poche'}`;
    document.getElementById('rrTitle').innerText = 'LA ROULETTE TOURNE…';
    document.getElementById('rrResult').innerHTML = '';
    const btn = document.getElementById('rrCta');
    btn.classList.add('hidden');
    btn.onclick = () => { scr.classList.add('hidden'); done(); };
    scr.dataset.cat = cash ? 'cash' : 'drugs';
    scr.classList.remove('hidden', 'landed');
    const i = Math.max(0, RACKET_PCTS.indexOf(pct)), seg = 360 / RACKET_PCTS.length;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    void wheel.offsetWidth;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wheel.style.transition = reduce ? 'none' : 'transform 3.6s cubic-bezier(.12,.8,.18,1)';
    wheel.style.transform = `rotate(${360 * 6 - i * seg + jitter}deg)`;
    setTimeout(() => {
      scr.classList.add('landed');
      buzz(80);
      document.getElementById('rrTitle').innerText = `${pct} %`;
      const line = role === 'thief' ? `Tu prends <b>${amt}</b> ${qg ? 'dans le QG de' : 'à'} ${escapeHtml(who)}` : `${escapeHtml(who)} te prend <b>${amt}</b>${qg ? ' dans ton QG' : ''}`;
      const empty = qg ? (role === 'thief' ? `Le QG de ${escapeHtml(who)} était vide !` : 'Ton QG était vide !') : `${role === 'thief' ? escapeHtml(who) + ' n’avait' : 'Tu n’avais'} rien sur ${role === 'thief' ? 'lui' : 'toi'} !`;
      document.getElementById('rrResult').innerHTML = amount ? line : empty;
      btn.classList.remove('hidden');
    }, reduce ? 300 : 3800);
  });
}

// Racket subi : l'écran Défaite attend le choix du vainqueur (bouton grisé), l'affiche, puis libère le bouton
let fightRacketWait = false, fightRacketDone = null, fightRacketTimer = null;
function racketRowHtml(who, plural) {
  const r = fightRacketDone;
  if (!r) return fightRow('ph-hand-grabbing', `${who} ${plural ? 'choisissent leur' : 'choisit son'} butin`, '<span class="fight-wait">en attente…</span>');
  const thief = escapeHtml(allyShort(r.thiefCaid || who));
  const names = (r.items || []).map(it => escapeHtml(it.name)).join(', ');
  const pct = r.pct ? ` (${r.pct} %)` : '';
  const take = { cash: [`−${(r.amount || 0).toLocaleString()} €`, `ton cash${pct}`], drugs: [`−${r.amount || 0} kg`, `ta drogue${pct}`],
    items: [r.amount ? `${r.amount} objet${r.amount > 1 ? 's' : ''}` : 'Sac vide', 'dans ton Sac'], prostitute: ['ta prostituée', 'en transit'], none: ['rien', 'il te laisse filer'] }[r.category] || ['—', ''];
  if (r.category === 'none') return fightRow('ph-hand-grabbing', `${thief} te laisse filer`, 'rien pris');
  return fightRow('ph-hand-grabbing', `${thief} a pris <small class="fight-racket-sub">${take[1]}</small>`, take[0])
    + (names ? `<div class="fight-racket-items">${names}</div>` : '');
}
// Appelé à l'arrivée du racket : vrai si l'écran Défaite l'attendait (il l'affiche à la place du message)
function onRacketKnown(data) {
  if (!fightRacketWait) return false;
  fightRacketWait = false;
  clearTimeout(fightRacketTimer);
  fightRacketDone = data;
  const box = document.getElementById('fightRacketBox'), btn = document.getElementById('fightDefeatCta');
  if (box) box.innerHTML = racketRowHtml(box.dataset.who, box.dataset.plural === '1');
  if (btn) btn.disabled = false;
  return true;
}

// DÉFAITE : montrée avant l'écran Hôpital (l'appelant attend la fermeture)
function showFightDefeat({ dmgNet, opponentCaid, heartsBefore }, last) {
  const me = getMyCaid();
  const winners = fightNames(opponentCaid).map(n => ({ img: fightImg(n), label: n }));
  const stage = `<div class="ally-stamp" style="top:29%">K.O.</div>` + fightSide('l', [{ img: me.imageFile, label: 'Toi' }], true) + fightSide('r', winners);
  const after = localPlayer.hearts;
  const max = Math.max(3, heartsBefore || 0);
  const hearts = Array.from({ length: max }, (_, i) => `<i class="ph-fill ph-heart ${i < after ? '' : 'off'}"></i>`).join('');
  const riposte = last && last.phase === 2;
  const first = riposte
    ? fightRow('ph-arrows-counter-clockwise', 'Sa riposte', `passe de ${fightPts(dmgNet || 0)}`)
    : fightRow('ph-shield', 'Ta défense', `percée de ${fightPts(dmgNet || 0)}`);
  const plural = winners.length > 1;
  const who = plural ? escapeHtml(allyListNames(winners.map(w => allyShort(w.label)))) : escapeHtml(allyShort(opponentCaid || 'Le vainqueur'));
  const rows = first
    + fightRow('ph-heart-break', 'Cœurs de vie', `<span class="fight-hearts">${hearts}</span> ${heartsBefore} → ${after}`)
    + `<div id="fightRacketBox" class="flex flex-col gap-1.5" data-who="${who}" data-plural="${plural ? 1 : 0}">${racketRowHtml(who, plural)}</div>`;
  const bottom = `<h2 class="font-anton ally-head">DÉFAITE.</h2>
    <div class="flex flex-col gap-1.5 mt-3">${rows}</div>
    <button type="button" id="fightDefeatCta" class="ally-cta mt-4" onclick="closeFightScreen()" ${fightRacketWait ? 'disabled' : ''}>Je m’en souviendrai</button>`;
  // Filet de sécurité : si le vainqueur ne choisit jamais (téléphone éteint…), le bouton se libère au bout d'1 min 30
  if (fightRacketWait) fightRacketTimer = setTimeout(() => { if (fightRacketWait) onRacketKnown({ category: 'none', thiefCaid: opponentCaid }); }, 90000);
  return fightRender('defaite', 'lose', 'defaite', stage, bottom);
}

// MATCH NUL : la riposte est bloquée aussi, personne ne perd rien
function showFightDraw(message, last) {
  const mine = fightResultSides(last);
  const opp = fightNames(last && last.opponentCaid).map(n => ({ img: fightImg(n), label: n }));
  const stage = fightSide('l', mine) + fightSide('r', opp) + `<div class="ally-tape fight-tape" style="top:80%">ÉGALITÉ</div>`;
  const rows = fightRow('ph-arrows-counter-clockwise', 'Contre-attaque', 'bloquée aussi')
    + fightRow('ph-heart', 'Cœurs de vie', 'personne ne perd rien');
  const bottom = `<h2 class="font-anton ally-head">MATCH NUL.</h2>
    ${message ? `<div class="text-center text-[11px] font-bold text-slate-400 mt-1">${escapeHtml(message)}</div>` : ''}
    <div class="flex flex-col gap-1.5 mt-3">${rows}</div>
    <button type="button" class="ally-cta mt-4" onclick="closeFightScreen()">OK</button>`;
  return fightRender('nul', 'draw', 'nul', stage, bottom);
}

// Choix des objets de combat : voir js/items.js

async function toggleCombatReadyState() {
  if (!currentDuelInfo) return;
  isCombatReady = !isCombatReady;
  if (socket) {
    const stat = (currentDuelInfo.role === 'attacker') ? getTotalAtk() + nightAtkBonus() : getTotalDef();
    socket.emit('combat_set_ready', { currentStat: stat, ready: isCombatReady });
  }
  fightLog(isCombatReady ? `⏳ Tu es prêt ! En attente…` : `Non prêt.`);
  updateCombatReadyButtonUI();
}

// Bouton Prêt et pastilles « prêt / réfléchit » : l'écran du duel se redessine sans animation
function updateCombatReadyButtonUI() {
  if (fightState() === 'duel') renderFightDuel();
}

// =========================================================================
// COMBAT EN DIRECT : les joueurs qui ne combattent pas suivent le duel (rien à faire, juste regarder)
// =========================================================================
let liveFight = null;
const LIVE_RACKET = {
  cash: d => `${d.thief} racket ${d.pct} % du cash de ${d.loser}`,
  drugs: d => `${d.thief} racket ${d.pct} % de la drogue de ${d.loser}`,
  items: d => `${d.thief} fouille le Sac de ${d.loser}`,
  prostitute: d => `${d.thief} capture la prostituée de ${d.loser}`,
  none: d => `${d.thief} laisse filer ${d.loser}`
};
function onCombatLive(d) {
  if (!liveFight || liveFight.id !== d.id) liveFight = { id: d.id, closed: false, log: [], clash: false, status: 'COMBAT !', tone: '', winners: [], loser: '' };
  const f = liveFight, A = allyListNames((d.attackers || []).map(allyShort)), D = allyShort(d.defender);
  if (d.attackers && d.attackers.length) { f.attackers = d.attackers; f.defender = d.defender; }
  f.ready = d.ready || [];
  const log = t => f.log.push(t);
  switch (d.stage) {
    case 'start': f.status = 'COMBAT !'; log(`${A} attaque ${D}`); break;
    case 'items': log(`${allyShort(d.actor)} joue ${d.count > 1 ? `${d.count} objets` : 'un objet'}`); break;
    case 'ready': log(`${allyShort(d.actor)} est prêt`); break;
    case 'unready': log(`${allyShort(d.actor)} n’est plus prêt`); break;
    case 'hit': f.clash = true; f.status = 'ÇA PASSE !'; f.tone = 'hit'; log('L’attaque passe la défense'); break;
    case 'blocked': f.clash = true; f.status = 'BLOQUÉ !'; f.tone = 'block'; log('La défense tient'); break;
    case 'riposte': f.clash = false; f.status = 'RIPOSTE !'; f.tone = ''; f.ready = []; log(`${A} contre-attaque ${D}`); break;
    case 'draw': f.status = 'MATCH NUL'; f.tone = 'block'; log('Contre-attaque bloquée aussi : personne ne perd rien'); break;
    case 'result': f.status = 'K.O. !'; f.tone = 'ko'; f.winners = d.winners || []; f.loser = d.loser; log(`${allyListNames(f.winners.map(allyShort))} gagne : ${allyShort(d.loser)} perd 1 cœur`); break;
    case 'racket': f.status = 'RACKET'; f.tone = 'ko'; log((LIVE_RACKET[d.category] || LIVE_RACKET.none)({ ...d, thief: allyShort(d.thief), loser: allyShort(d.loser) })); break;
    case 'prayer': f.status = 'ANNULÉ'; f.tone = 'block'; log(`Prière miraculeuse de ${allyShort(d.actor)} : combat annulé`); break;
    case 'aborted': f.status = 'ANNULÉ'; f.tone = 'block'; log('Le combat a été annulé'); break;
  }
  renderLiveFight();
}
function renderLiveFight() {
  const f = liveFight, scr = document.getElementById('liveFight');
  if (!f || !scr) return;
  const side = (names, cls) => `<div class="lf-side ${cls}">${(names || []).map(n => {
    const lost = f.loser && n === f.loser, won = f.winners.includes(n), ready = f.ready.includes(n);
    return `<div class="lf-fighter ${lost ? 'lost' : ''} ${won ? 'won' : ''}"><img src="${fightImg(n)}" alt=""><b>${escapeHtml(allyShort(n))}</b>${ready && !f.clash ? '<em><i class="ph-bold ph-check"></i> prêt</em>' : ''}</div>`;
  }).join('')}</div>`;
  scr.dataset.tone = f.tone;
  document.getElementById('lfRound').innerText = currentSession.round || 1;
  document.getElementById('lfStatus').innerText = f.status;
  document.getElementById('lfStage').innerHTML = side(f.attackers, 'l') + '<div class="lf-vs">VS</div>' + side([f.defender], 'r');
  document.getElementById('lfLog').innerHTML = f.log.slice(-5).map((t, i, a) => `<div class="${i === a.length - 1 ? 'new' : ''}">${escapeHtml(t)}</div>`).join('');
  if (!f.closed && scr.classList.contains('hidden')) scr.classList.remove('hidden');
}
function closeLiveFight() {
  if (liveFight) liveFight.closed = true;
  document.getElementById('liveFight').classList.add('hidden');
}
