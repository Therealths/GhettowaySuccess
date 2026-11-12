// Capacités spéciales : écran plein page (choix de la cible, lancement animé, pouvoir sans cible, Prière, « Touché ! » côté victime)

const POW_TARGETED = { caid_2: 'swap_pos', caid_4: 'danse', caid_6: 'shuriken', caid_7: 'steal_item', caid_8: 'siphon', canette: 'canette', crowbar: 'crowbar' };
const POW_CTA = { caid_1: 'Rouler', caid_2: 'Échanger les places', caid_3: 'Faire la sieste', caid_4: 'Lancer la danse', caid_6: 'Lancer le shuriken', caid_7: 'Faire les poches', caid_8: 'Siphonner', canette: 'Lancer la canette', crowbar: 'Forcer le coffre' };
// Accent de l'écran : couleur du Caïd (Weed-Nesday, gris, passe en rouge sang)
const powAccent = c => c.id === 'caid_8' ? '#fb7185' : c.hex;
let powTargetToken = null;
// Vieille canette ou Pied de biche utilisés depuis le sac : même écran, l'objet remplace le pouvoir du Caïd
let powItem = null;
const POW_ITEMS = {
  def_malus_round: { id: 'canette', skillName: 'Vieille canette', skillDesc: '−1 Défense à un rival jusqu’à la fin de la manche.', hex: '#f87171' },
  crowbar: { id: 'crowbar', skillName: 'Pied de biche', skillDesc: 'Force le coffre du QG d’un rival, regarde dedans et prends jusqu’à 5 000 €, 5 kg, ou un partage des deux.', hex: '#fbbf24' }
};
function powCaid() {
  const me = getMyCaid();
  if (!powItem) return me;
  return Object.assign({ name: 'Objet du sac', bannerFile: itemArt(powItem, true) || 'wallpaper-clean.jpg', imageFile: me.imageFile }, POW_ITEMS[powItem.eff] || POW_ITEMS.def_malus_round);
}
let powResolve = null;
// Pied de biche : 5 parts à prendre dans le coffre forcé, chaque part = 1 000 € ou 1 kg (selon ce qu'il contient)
const CROWBAR_PARTS = 5;
let crowbarSafe = null; // contenu du coffre forcé : { cash, kg, targetCaid }
const crowbarLabel = l => [l.cash ? `${l.cash.toLocaleString()} €` : '', l.kg ? `${l.kg} kg` : ''].filter(Boolean).join(' + ') || 'rien';
const crowbarPick = kg => ({ kg, cash: Math.min((CROWBAR_PARTS - kg) * 1000, crowbarSafe.cash) });

function powState() {
  const scr = document.getElementById('powerScreen');
  return scr && !scr.classList.contains('hidden') ? scr.dataset.state : null;
}

// Affiche un état ; même état déjà à l'écran : simple mise à jour sans rejouer les animations
function powRender(state, caid, chip, head, stage, bottom) {
  const scr = document.getElementById('powerScreen');
  const same = powState() === state;
  scr.dataset.state = state;
  scr.style.setProperty('--ac', state === 'touche' ? '#fb7185' : powAccent(caid));
  document.getElementById('powRound').innerText = currentSession.round || 1;
  document.getElementById('powChip').innerHTML = chip;
  const img = document.getElementById('powBanner');
  if (!img.src.endsWith(caid.bannerFile)) img.src = caid.bannerFile;
  document.getElementById('powHead').innerHTML = head;
  document.getElementById('powStage').innerHTML = stage;
  document.getElementById('powBottom').innerHTML = bottom;
  if (same) { scr.classList.add('static'); return; }
  scr.classList.remove('hidden', 'show', 'static');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');
  const prev = powResolve;
  return new Promise(resolve => { powResolve = () => { if (prev) prev(); resolve(); }; });
}

function closePowerScreen() {
  const scr = document.getElementById('powerScreen');
  if (scr) { scr.classList.add('hidden'); scr.classList.remove('show', 'static'); }
  const r = powResolve;
  powResolve = null;
  if (r) r();
}

const powChipHtml = (icon, label) => `<i class="ph-fill ${icon}"></i> ${label}`;
const powHeadHtml = (kicker, title, desc) => `${kicker ? `<div class="pow-kicker">${escapeHtml(kicker)}</div>` : ''}<h2 class="font-anton pow-title">${escapeHtml(title)}</h2>${desc ? `<div class="pow-desc">${desc}</div>` : ''}`;
const powAv = (img, label, cls) => `<div class="pow-av ${cls || ''}"><img src="${img}" alt=""><b>${escapeHtml(label)}</b></div>`;
// Deux Caïds face à face (moi à gauche, la cible à droite) + l'effet qui circule entre eux
const powDuo = (left, right, fx, cls) => `<div class="pow-duo ${cls || ''}"><div class="pow-side l">${left}</div><div class="pow-side r">${right}</div>${fx || ''}</div>`;
const powHearts = (n, glow) => `<div class="pow-hearts">${[0, 1, 2].map(i => `<i class="ph-fill ph-heart ${i < n ? '' : 'off'} ${glow === i ? 'new' : ''}"></i>`).join('')}</div>`;
const powRow = (icon, label, after) => `<div class="police-row pow-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft">${after}</span></div>`;

// Ce qui file d'un Caïd à l'autre selon le pouvoir
function powFx(effect) {
  if (effect === 'shuriken') return `<div class="pow-track"><div class="pow-mv fx-throw"><img class="pow-spin" src="shuriken.webp" alt=""></div></div>`;
  if (effect === 'siphon') return `<div class="pow-track"><div class="pow-beam"></div><div class="pow-mv fx-back"><i class="ph-fill ph-heart pow-drop"></i></div></div>`;
  if (effect === 'danse') return `<div class="pow-track">${['♪', '♥', '♫'].map((s, i) => `<div class="pow-mv fx-float" style="animation-delay:${i * 0.18}s"><span class="pow-note n${i}">${s}</span></div>`).join('')}</div>`;
  if (effect === 'canette') return `<div class="pow-track"><div class="pow-mv fx-throw"><span class="pow-spin pow-can">🥫</span></div></div>`;
  if (effect === 'crowbar') return `<div class="pow-track"><div class="pow-mv fx-back"><span class="pow-can">💶</span></div></div>`;
  if (effect === 'steal_item') return `<div class="pow-track"><div class="pow-mv fx-grab"><i class="ph-fill ph-hand-grabbing pow-hand"></i></div></div>`;
  return '';
}
const POW_OUT = {
  shuriken: ['ph-shield', 'Sa défense cette manche', '−3'],
  danse: ['ph-sword', 'Son attaque cette manche', '−3'],
  siphon: ['ph-heart', 'Cœur volé', '+1 ❤️'],
  steal_item: ['ph-backpack', 'Tu fouilles son Sac', '…'],
  swap_pos: ['ph-arrows-left-right', 'Échangez vos pions', 'sur le plateau'],
  canette: ['ph-shield', 'Sa défense', '−1'],
  crowbar: ['ph-vault', 'Son coffre forcé', 'en cours…']
};

// CHOIX : cartes des Caïds rivaux (pacte actif, hôpital et absents grisés)
function powChoice() {
  const caid = powCaid();
  const rivals = connectedRivals || [];
  const isOff = r => !!r.inHospital || !!r.away || isRivalProtectedByPact(r.playerToken);
  const free = rivals.filter(r => !isOff(r));
  if (!free.some(r => r.playerToken === powTargetToken)) powTargetToken = free.length ? free[0].playerToken : null;
  const target = free.find(r => r.playerToken === powTargetToken);
  const lascars = n => `${n} Lascar${n > 1 ? 's' : ''}`;
  const off = (img, name, why) => `<div class="ally-pick off"><img src="${img}" alt=""><div class="n"><b>${name}</b><span>${why}</span></div><i class="ph-bold ph-prohibit text-slate-500 text-xl"></i></div>`;
  const pick = r => {
    const img = allyCaidImg(r.caidId, allyRivalName(r)), name = escapeHtml(allyRivalName(r));
    if (isRivalProtectedByPact(r.playerToken)) return off(img, `🤝 ${name}`, `Pacte actif jusqu’à la manche ${fightPactUntil(r.playerToken) || (currentSession.round || 1)}`);
    if (r.away) return off(img, `💤 ${name}`, 'A quitté la partie : intouchable');
    if (r.inHospital) return off(img, `🏥 ${name}`, 'À l’hôpital : intouchable');
    const on = r.playerToken === powTargetToken;
    return `<button type="button" class="ally-pick ${on ? 'on' : ''}" data-token="${escapeHtml(r.playerToken)}" onclick="pickPowerTarget(this.dataset.token)"><img src="${img}" alt=""><div class="n"><b>${name}</b><span>${lascars(r.musclesCount || 0)} • Escort : ${r.hasProstituteInTransit ? 'oui' : 'non'} • Chien : ${r.hasStrayDog ? 'oui' : 'non'}</span></div><i class="${on ? 'ph-fill' : 'ph-bold'} ph-crosshair fight-aim"></i></button>`;
  };
  const bottom = `<div class="pow-label">Choisis ta cible</div>
    ${rivals.length ? '' : '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucun Caïd rival dans la partie</div>'}
    ${rivals.length && !free.length ? '<div class="text-center text-[11px] font-bold text-slate-400 mt-1">Aucune cible possible cette manche</div>' : ''}
    <div class="flex flex-col gap-2 mt-2">${rivals.map(pick).join('')}</div>
    <div class="grid grid-cols-[1fr_1.7fr] gap-2 mt-4"><button type="button" class="btn-close ally-ghost" onclick="closePowerScreen()">Annuler</button><button type="button" class="ally-cta pow-cta" onclick="launchTargetedPower()" ${target ? '' : 'disabled'}>${POW_CTA[caid.id]}</button></div>`;
  return powRender('choix', caid, powItem ? powChipHtml('ph-backpack', 'Objet du sac') : powChipHtml('ph-lightning', 'Capacité spéciale'), powHeadHtml(caid.name, caid.skillName, escapeHtml(caid.skillDesc)), '', bottom);
}
function pickPowerTarget(token) { powTargetToken = token; powChoice(); }
// Appelé par syncMultiplayerTargets : la liste des Caïds a changé
function refreshPowerChoice() { if (powState() === 'choix') powChoice(); }

async function openSpecialAbilityPrompt() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour de jouer !", "Tour Inactif");
  if (localPlayer.specialUsedThisTurn) return showAppAlert("Capacité spéciale déjà utilisée cette manche !", "Capacité Épuisée");
  powItem = null;
  const caid = getMyCaid();
  if (POW_TARGETED[caid.id]) {
    powTargetToken = null;
    syncMultiplayerTargets();
    return powChoice();
  }
  if (caid.id === 'caid_5') {
    // La Prière ne s'active pas à l'avance : elle est proposée automatiquement au moment du contrôle ou de l'agression
    const stage = `<div class="pow-solo">${powAv(caid.imageFile, 'Toi', 'halo')}</div>`;
    const bottom = `${powRow('ph-siren', 'Contrôle de police annulé', '50 %')}
      <div class="mt-2">${powRow('ph-sword', 'Agression d’un rival annulée', '50 %')}</div>
      <div class="text-center text-[11px] font-bold text-slate-400 mt-3">Elle te sera proposée automatiquement au bon moment. 1 fois par manche.</div>
      <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">Compris</button>`;
    return powRender('info', caid, powChipHtml('ph-hands-praying', 'Pouvoir passif'), powHeadHtml(caid.name, caid.skillName, escapeHtml(caid.skillDesc)), stage, bottom);
  }
  // Pouvoir sans cible (Grosse Sieste, Boule de Graisse)
  const sieste = caid.id === 'caid_3';
  const h = localPlayer.hearts;
  const stage = `<div class="pow-solo">${powAv(caid.imageFile, 'Toi')}</div>`;
  const info = sieste
    ? `${powHearts(h)}<div class="text-center text-sm font-bold text-slate-300 mt-2">Cœurs de vie : ${h} / 3${h < 3 ? ` → <b class="pow-ac">${h + 1} / 3</b>` : ' (déjà au maximum)'}</div>`
    : powRow('ph-path', 'Déplacement', 'jusqu’à 5 cases');
  const bottom = `${info}<div class="text-center text-[11px] font-bold text-slate-500 mt-2">Utilisable 1 fois par manche</div>
    <div class="grid grid-cols-[1fr_1.7fr] gap-2 mt-4"><button type="button" class="btn-close ally-ghost" onclick="closePowerScreen()">Annuler</button><button type="button" class="ally-cta pow-cta" onclick="launchSelfPower()">${POW_CTA[caid.id] || 'Activer'}</button></div>`;
  return powRender('self', caid, powChipHtml('ph-lightning', 'Capacité spéciale'), powHeadHtml(caid.name, caid.skillName, escapeHtml(caid.skillDesc)), stage, bottom);
}

// LANCEMENT sans cible : Zzz puis le cœur qui se rallume, ou la boule qui roule
function launchSelfPower() {
  if (localPlayer.specialUsedThisTurn) return;
  const caid = getMyCaid();
  const sieste = caid.id === 'caid_3';
  const before = localPlayer.hearts;
  if (sieste) localPlayer.hearts = Math.min(3, localPlayer.hearts + 1);
  localPlayer.specialUsedThisTurn = true;
  refreshHud();
  const stage = sieste
    ? `<div class="pow-solo">${powAv(caid.imageFile, 'Toi', 'sleep')}<span class="pow-z z0">Z</span><span class="pow-z z1">z</span><span class="pow-z z2">z</span></div>`
    : `<div class="pow-roll"><div class="pow-mv fx-roll">${powAv(caid.imageFile, 'Toi', 'ball')}</div></div>`;
  const out = sieste
    ? `${powHearts(localPlayer.hearts, localPlayer.hearts > before ? before : null)}<div class="text-center text-sm font-bold text-slate-300 mt-2">${localPlayer.hearts > before ? `<b class="pow-ac">+1 Cœur de Vie</b> : ${localPlayer.hearts} / 3` : 'Bien reposé, mais déjà au maximum'}</div>`
    : `${powRow('ph-path', 'Roule ton pion', 'jusqu’à 5 cases')}<div class="text-center text-[11px] font-bold text-slate-400 mt-2">Déplace-toi sur le plateau maintenant.</div>`;
  const bottom = `<div class="pow-result">${out}<button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">Continuer</button></div>`;
  powRender('fx', caid, powChipHtml('ph-lightning', 'Capacité activée'), powHeadHtml(caid.name, caid.skillName, ''), stage, bottom);
}

// LANCEMENT ciblé : envoi au serveur, animation de l'effet vers la cible, puis le résultat
function openItemTargetPower(item) {
  powItem = item;
  crowbarSafe = null;
  powTargetToken = null;
  syncMultiplayerTargets();
  return powChoice();
}

async function launchTargetedPower() {
  const target = (connectedRivals || []).find(r => r.playerToken === powTargetToken);
  if (!target || (!powItem && localPlayer.specialUsedThisTurn)) return;
  if (isRivalProtectedByPact(target.playerToken)) return showAppAlert(`Pacte de non-agression avec ce Caïd jusqu’à la fin de la manche ${fightPactUntil(target.playerToken) || ((currentSession.round || 1) + 1)} : impossible de le cibler.`, "🤝 Cible protégée");
  const caid = powCaid();
  const effect = POW_TARGETED[caid.id];
  // Pied de biche : il faut être devant le QG de la cible sur le plateau
  if (effect === 'crowbar' && !await showAppConfirm(`Ton pion est-il bien sur la case en face du QG de ${allyRivalName(target)} ?\n\nSinon, impossible de forcer son coffre.`, "🛠️ Pied de biche", "Oui, j'y suis", "Pas encore")) return;
  if (socket) {
    socket.emit('apply_special_to_target', {
      targetSocketId: target.socketId,
      targetPlayerToken: target.playerToken,
      effectType: effect,
      senderCaid: getMyCaid().name
    });
  }
  // Siphon déjà à 3 Cœurs : la cible perd son cœur, mais le lanceur ne gagne rien
  const siphonGain = effect === 'siphon' && localPlayer.hearts < 3;
  const fromBag = !!powItem;
  if (effect === 'siphon') localPlayer.hearts = Math.min(3, localPlayer.hearts + 1);
  if (powItem) {
    // L'objet est utilisé : il quitte le sac, le pouvoir du Caïd reste disponible
    const idx = localPlayer.inventory.indexOf(powItem);
    if (idx >= 0) localPlayer.inventory.splice(idx, 1);
    powItem = null;
  } else localPlayer.specialUsedThisTurn = true;
  refreshHud();
  const name = allyRivalName(target);
  const stage = powDuo(powAv(caid.imageFile, 'Toi', 'me'), powAv(allyCaidImg(target.caidId, name), name, 'hit'), powFx(effect), `fx-${effect}`);
  const [icon, label, after] = effect === 'siphon' && !siphonGain ? ['ph-heart-break', 'Cœur détruit', 'déjà au max'] : effect === 'crowbar' ? ['ph-vault', 'Butin', 'forçage…'] : POW_OUT[effect];
  const bottom = `<div class="pow-result">${powRow(icon, `<span id="powOutLabel">${label}</span>`, `<span id="powOutAfter" class="pow-ac">${after}</span>`)}
    <div id="powOutNote" class="text-center text-[11px] font-bold text-slate-400 mt-2">${effect === 'crowbar' ? `Tu forces le coffre du QG de ${escapeHtml(name)}…` : effect === 'canette' ? `Pour ${escapeHtml(name)}, jusqu’à la fin de la manche.` : effect === 'shuriken' || effect === 'danse' ? `Pour ${escapeHtml(name)}, jusqu’à la fin de la manche.` : effect === 'swap_pos' ? `Échange ton pion avec celui de ${escapeHtml(name)}.` : `Sur ${escapeHtml(name)}.`}</div>
    <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">Continuer</button></div>`;
  powRender('fx', caid, fromBag ? powChipHtml('ph-backpack', effect === 'canette' ? 'Objet lancé' : 'Objet utilisé') : powChipHtml('ph-lightning', 'Capacité lancée'), powHeadHtml(caid.name, caid.skillName, ''), stage, bottom);
}

// Pied de biche, coffre forcé : on voit ce qu'il contient et on choisit sa part avec le curseur (argent ⇄ drogue)
function showCrowbarSafe(safe) {
  crowbarSafe = safe;
  const box = document.getElementById('powOutNote');
  if (!box || powState() !== 'fx') return false;
  const maxKg = Math.min(CROWBAR_PARTS, safe.kg);
  // Le coffre-fort du QG s'ouvre à la place des deux Caïds
  document.getElementById('powStage').innerHTML = `<div class="pow-safe"><img src="qg-coffre.webp" alt="Coffre-fort du QG"><span>QG de ${escapeHtml(safe.targetCaid)}</span></div>`;
  document.getElementById('powOutLabel').innerText = 'Dans son coffre';
  document.getElementById('powOutAfter').innerText = crowbarLabel(safe);
  const cta = document.querySelector('#powBottom .pow-cta');
  if (!safe.cash && !safe.kg) { // coffre vide : rien à choisir
    box.innerText = 'Le coffre est vide…';
    socket.emit('crowbar_take', { kg: 0 });
    return true;
  }
  if (cta) cta.classList.add('hidden');
  box.outerHTML = `<div id="powOutNote" class="mt-3">
    <div class="pow-label">Ce que tu prends (5 parts au plus)</div>
    <div class="pow-slide mt-2"><span><i class="ph-bold ph-coins"></i> Argent</span><input id="crowbarRange" type="range" min="0" max="${maxKg}" step="1" value="0" ${maxKg ? '' : 'disabled'} oninput="updateCrowbarPick()"><span>Drogue <i class="ph-bold ph-plant"></i></span></div>
    <div id="crowbarPick" class="text-center font-black text-2xl text-white mt-2"></div>
    <button type="button" class="ally-cta pow-cta mt-3" onclick="takeCrowbarLoot(this)">Prendre</button></div>`;
  updateCrowbarPick();
  return true;
}
function updateCrowbarPick() {
  document.getElementById('crowbarPick').innerText = crowbarLabel(crowbarPick(+document.getElementById('crowbarRange').value));
}
function takeCrowbarLoot(btn) {
  btn.disabled = true;
  socket.emit('crowbar_take', { kg: +document.getElementById('crowbarRange').value });
}
// Pied de biche : le serveur renvoie ce qui a vraiment été volé ; affiché sur l'écran du lancement s'il est encore ouvert
// Faire les poches : son Sac était vide
function showStealMissed(targetCaid) {
  const after = document.getElementById('powOutAfter');
  if (!after || powState() !== 'fx') return false;
  document.getElementById('powOutLabel').innerText = 'Son Sac était vide';
  after.innerText = 'RATÉ';
  document.getElementById('powOutNote').innerText = `Rien à prendre chez ${targetCaid}.`;
  return true;
}
function showCrowbarResult(l) {
  const after = document.getElementById('powOutAfter');
  if (!after || powState() !== 'fx') return false;
  const ok = l.cash || l.kg;
  document.getElementById('powOutLabel').innerText = ok ? 'Coffre forcé !' : 'Coffre vide';
  after.innerText = ok ? `+${crowbarLabel(l)}` : 'raté';
  document.getElementById('powOutNote').outerHTML = `<div id="powOutNote" class="text-center text-[11px] font-bold text-slate-400 mt-2">${ok ? 'C’est sur toi maintenant (dans tes poches).' : 'Il n’y avait rien à prendre.'}</div>`;
  const cta = document.querySelector('#powBottom .pow-cta.hidden');
  if (cta) cta.classList.remove('hidden');
  return true;
}

// VICTIME : « Touché ! » avec l'effet subi ; se résout quand le joueur encaisse
const POW_HIT = {
  siphon: (s) => [`${s} t’aspire 1 Cœur de Vie.`, 'ph-heart', 'Tes cœurs de vie', '−1'],
  shuriken: (s) => [`${s} t’a lancé un shuriken.`, 'ph-shield', 'Ta défense cette manche', '−3'],
  danse: (s) => [`${s} t’a envoûté avec sa danse.`, 'ph-sword', 'Ton attaque cette manche', '−3'],
  steal_item: (s, item) => item ? [`${s} t’a fait les poches.`, 'ph-backpack', escapeHtml(item.name), 'volé'] : [`${s} a tenté de te faire les poches…`, 'ph-backpack', 'Ton sac était vide', 'raté'],
  swap_pos: (s) => [`${s} a échangé sa place avec toi.`, 'ph-arrows-left-right', 'Échangez vos pions', 'sur le plateau'],
  canette: (s) => [`${s} t’a balancé une vieille canette.`, 'ph-shield', 'Ta défense jusqu’à la fin de la manche', '−1'],
  crowbar: (s, loot) => loot && (loot.cash || loot.kg) ? [`${s} a forcé le coffre de ton QG.`, 'ph-vault', 'Volé dans ton coffre', `−${crowbarLabel(loot)}`] : [`${s} a forcé le coffre de ton QG…`, 'ph-vault', 'Ton coffre était vide', 'raté']
};
function showPowerHit(effectType, senderCaid, item) {
  const sender = CAID_ROSTER.find(c => c.name === senderCaid) || getMyCaid();
  const me = getMyCaid();
  const missed = (effectType === 'steal_item' && !item) || (effectType === 'crowbar' && !(item && (item.cash || item.kg)));
  buzz(missed ? 40 : [90, 50, 90]); // « TOUCHÉ ! »
  const [desc, icon, label, after] = (POW_HIT[effectType] || POW_HIT.shuriken)(escapeHtml(senderCaid || 'Un rival'), item);
  const stage = powDuo(powAv(sender.imageFile, senderCaid || 'Rival', 'foe'), powAv(me.imageFile, 'Toi', missed ? '' : 'hit'), powFx(effectType), `fx-${effectType} victim`);
  const extra = effectType === 'siphon' ? `<div class="mt-2">${powHearts(localPlayer.hearts)}</div>` : '';
  const bottom = `<div class="pow-result">${powRow(icon, label, `<span class="pow-ac">${after}</span>`)}${extra}
    <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">${missed ? 'Ouf' : 'Encaisser'}</button></div>`;
  return powRender('touche', sender, powChipHtml('ph-warning', 'Attaque spéciale'), powHeadHtml('', missed ? 'RATÉ !' : 'TOUCHÉ !', desc), stage, bottom);
}

// FLASH RADIO « Une balance dans le quartier » : le vote se fait sur la page Flash Radio (game.js) ;
// ici, l'écran du résultat pour tout le monde (même écran plein page que les capacités)
const INFORMANT_SCREEN = { id: 'informant', name: 'Flash Radio', skillName: 'Une balance dans le quartier', hex: '#fb7185', bannerFile: 'wallpaper-clean.jpg' };
const informantHead = desc => powHeadHtml('Flash Radio', 'Une balance dans le quartier', desc);
// Résultat : le Caïd balancé, tamponné, et le décompte des votes
async function informantResultScreen(r) {
  await msgIdle();
  const me = r.targetToken === myPlayerToken;
  const rival = (connectedRivals || []).find(x => x.playerToken === r.targetToken);
  const img = me ? getMyCaid().imageFile : allyCaidImg(rival && rival.caidId, r.targetCaid);
  const stage = `<div class="pow-solo">${powAv(img, me ? 'Toi' : r.targetCaid)}<div class="pow-stamp">BALANCÉ</div></div>`;
  const votes = n => `${n} vote${n > 1 ? 's' : ''}`;
  const what = { drugs: 'de drogue', weapons: 'd’armes', prostitute: 'des escorts' }[r.policeTarget] || 'de police';
  const rows = r.tally.map(t => powRow('ph-hand-pointing', escapeHtml(t.token === myPlayerToken ? 'Toi' : t.caidName), votes(t.votes))).join('<div class="mt-2"></div>')
    + (r.tie ? `<div class="mt-2">${powRow('ph-shuffle', 'Égalité', 'tirage au sort')}</div>` : '')
    // Sur le plateau, le pion de la patrouille rejoint le Caïd balancé
    + `<div class="mt-2">${powRow('ph-police-car', `Voiture de police déplacée sur la case ${me ? 'où tu es' : `de ${escapeHtml(allyShort(r.targetCaid))}`}`, '🚓')}</div>`;
  const bottom = `${rows}
    <div class="text-center text-[11px] font-bold ${me ? 'text-rose-300' : 'text-slate-400'} mt-3">${me ? `Les keufs débarquent : contrôle ${what} immédiat !` : `${escapeHtml(r.targetCaid)} subit un contrôle ${what} tout de suite.`}</div>
    <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">${me ? 'Subir le contrôle' : 'OK'}</button>`;
  buzz(me ? [80, 60, 120] : 60);
  return powRender('vote-result', INFORMANT_SCREEN, powChipHtml('ph-siren', 'Résultat du vote'), informantHead(''), stage, bottom);
}
