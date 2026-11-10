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
    <button onclick="choosePillageReward('cash')" class="w-full p-3 glass-panel rounded-2xl border border-amber-500/40 flex items-center justify-between text-left ${pillageInfo.availableCash <= 0 ? 'opacity-40 pointer-events-none' : ''}">
      <div>
        <span class="text-xs font-black text-amber-300 uppercase block">💰 100% du Cash en Poche</span>
        <span class="text-[10px] font-mono text-white">${(pillageInfo.availableCash || 0).toLocaleString()} € disponibles</span>
      </div>
      <i class="ph-bold ph-arrow-right text-amber-400"></i>
    </button>
  `);

  btns.push(`
    <button onclick="choosePillageReward('drugs')" class="w-full p-3 glass-panel rounded-2xl border border-emerald-500/40 flex items-center justify-between text-left ${pillageInfo.availableDrugs <= 0 ? 'opacity-40 pointer-events-none' : ''}">
      <div>
        <span class="text-xs font-black text-emerald-300 uppercase block">🌿 100% de la Drogue en Poche</span>
        <span class="text-[10px] font-mono text-white">${pillageInfo.availableDrugs || 0} kg disponibles</span>
      </div>
      <i class="ph-bold ph-arrow-right text-emerald-400"></i>
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
              <span class="text-[10px] font-mono text-white">Place l'escort dans votre slot transit</span>
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
              <span class="text-xs font-black text-purple-300 uppercase block">👠 Donner sa Prostituée à ${escapeHtml(a.caid || 'votre allié')}</span>
              <span class="text-[10px] font-mono text-white">Place l'escort chez votre allié</span>
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
            <span class="text-[10px] font-mono text-white">${canTakePros ? 'Disponible en transit' : 'Votre slot transit est déjà occupé'}</span>
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
  return scr && !scr.classList.contains('hidden') ? scr.dataset.state : null;
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
  if (same) { scr.classList.add('static'); return; }
  scr.classList.remove('hidden', 'show', 'static');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  const prev = fightResolve;
  return new Promise(resolve => { fightResolve = () => { if (prev) prev(); resolve(); }; });
}

function closeFightScreen() {
  const scr = document.getElementById('fightScreen');
  if (scr) { scr.classList.add('hidden'); scr.classList.remove('show', 'static'); }
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
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour d'attaquer !", "Tour Inactif");
  isCombatReady = false;
  fightTargetToken = null;
  syncMultiplayerTargets();
  return renderFightChoice();
}

function fightPactUntil(token) {
  return (nonAggressionPacts || []).filter(p => p.tokens.includes(myPlayerToken) && p.tokens.includes(token))
    .reduce((m, p) => Math.max(m, p.untilRound || 0), 0);
}

function renderFightChoice() {
  const rivals = connectedRivals || [];
  const isOff = r => !!r.inHospital || !!r.away || isRivalProtectedByPact(r.playerToken);
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
    const on = r.playerToken === fightTargetToken;
    return `<button type="button" class="ally-pick ${on ? 'on' : ''}" data-token="${escapeHtml(r.playerToken)}" onclick="pickFightTarget(this.dataset.token)"><img src="${img}" alt=""><div class="n"><b>${name}</b><span>${lascars(r.musclesCount || 0)} • Escort : ${r.hasProstituteInTransit ? 'oui' : 'non'} • Chien : ${r.hasStrayDog ? 'oui' : 'non'}</span></div><i class="${on ? 'ph-fill' : 'ph-bold'} ph-crosshair fight-aim"></i></button>`;
  };
  const bottom = `<h2 class="font-anton ally-head sm">QUI TU ATTAQUES ?</h2>
    ${rivals.length ? '' : '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucun Caïd rival dans la partie</div>'}
    ${rivals.length && !free.length ? '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucune cible attaquable cette manche</div>' : ''}
    <div class="flex flex-col gap-2 mt-3">${rivals.map(pick).join('')}</div>
    <div class="grid grid-cols-[1fr_1.6fr] gap-2 mt-4"><button type="button" class="ally-ghost" onclick="closeFightScreen()">Annuler</button><button type="button" id="btnInitiateFightAction" class="ally-cta" onclick="initiateCombatEngagement()" ${target ? '' : 'disabled'}>Engager le combat</button></div>`;
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
    return showAppAlert("Pacte d'Alliance actif : vous ne pouvez pas attaquer votre allié (ni cette manche, ni la suivante) !", "🤝 Pacte Actif");
  }

  let useAlliance = false;
  // Alliés du tour, sauf la cible éventuelle
  const combatAllies = (localPlayer.activeAllies || []).filter(a => a.allyToken !== target.playerToken);
  if (localPlayer.allianceActive && combatAllies.length) {
    const n = combatAllies.length + 1;
    useAlliance = await showAppConfirm(
      `Vous êtes en Alliance avec ${formatAllyNames(combatAllies)}.\n\nComment voulez-vous attaquer ?\n\n• SOLO : vous attaquez seul.\n• EN ALLIANCE : attaque coordonnée à ${n} (si vous êtes ${n === 2 ? 'tous deux' : 'tous'} sur la bonne case).`,
      "⚔️ Solo ou en Alliance ?",
      "🤝 En Alliance",
      "Solo"
    );
  }

  const caid = getMyCaid();
  if (socket) {
    const btn = document.getElementById('btnInitiateFightAction');
    if (btn) btn.disabled = true; // en attente de l'ouverture du duel
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
    <div class="flex flex-col gap-2">${fightRiposteTargets.map(pick).join('')}</div>
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
function showFightVictory({ dmgNet, opponentCaid, isPrimaryPicker, pillageInfo }, last) {
  const mine = fightResultSides(last);
  const losers = fightNames(opponentCaid).map(n => ({ img: fightImg(n), label: n }));
  const stage = fightSide('l', mine) + fightSide('r', losers, true) + `<div class="ally-tape fight-tape" style="top:80%">K.O. !</div>`;
  const pick = !!(isPrimaryPicker && pillageInfo);
  const rows = fightRow('ph-sword', mine.length > 1 ? 'Votre assaut' : 'Ton attaque', `passe de ${fightPts(dmgNet || 0)}`)
    + fightRow('ph-heart-break', escapeHtml(opponentCaid || 'Le perdant'), '−1 cœur')
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
    + fightRow('ph-hand-grabbing', `${who} ${plural ? 'choisissent leur' : 'choisit son'} butin`, 'cash, drogue…');
  const bottom = `<h2 class="font-anton ally-head">DÉFAITE.</h2>
    <div class="flex flex-col gap-1.5 mt-3">${rows}</div>
    <button type="button" class="ally-cta mt-4" onclick="closeFightScreen()">Encaisser</button>`;
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
    const stat = (currentDuelInfo.role === 'attacker') ? getTotalAtk() : getTotalDef();
    socket.emit('combat_set_ready', { currentStat: stat, ready: isCombatReady });
  }
  fightLog(isCombatReady ? `⏳ Tu es prêt ! En attente…` : `Non prêt.`);
  updateCombatReadyButtonUI();
}

// Bouton Prêt et pastilles « prêt / réfléchit » : l'écran du duel se redessine sans animation
function updateCombatReadyButtonUI() {
  if (fightState() === 'duel') renderFightDuel();
}
