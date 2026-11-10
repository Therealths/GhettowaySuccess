// Capacités spéciales : écran plein page (choix de la cible, lancement animé, pouvoir sans cible, Prière, « Touché ! » côté victime)

const POW_TARGETED = { caid_2: 'swap_pos', caid_4: 'danse', caid_6: 'shuriken', caid_7: 'steal_item', caid_8: 'siphon', canette: 'canette' };
const POW_CTA = { caid_1: 'Rouler', caid_2: 'Échanger les places', caid_3: 'Faire la sieste', caid_4: 'Lancer la danse', caid_6: 'Lancer le shuriken', caid_7: 'Faire les poches', caid_8: 'Siphonner', canette: 'Lancer la canette' };
// Accent de l'écran : couleur du Caïd (Weed-Nesday, gris, passe en rouge sang)
const powAccent = c => c.id === 'caid_8' ? '#fb7185' : c.hex;
let powTargetToken = null;
// Vieille canette lancée depuis le sac : même écran, l'objet remplace le pouvoir du Caïd
let powItem = null;
function powCaid() {
  const me = getMyCaid();
  if (!powItem) return me;
  return { id: 'canette', name: 'Objet du sac', skillName: 'Vieille canette', skillDesc: '−1 Défense à un rival jusqu’à la fin de la manche.', bannerFile: 'obj-canette-vignette.webp', hex: '#f87171', imageFile: me.imageFile };
}
let powResolve = null;

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
  if (effect === 'steal_item') return `<div class="pow-track"><div class="pow-mv fx-grab"><i class="ph-fill ph-hand-grabbing pow-hand"></i></div></div>`;
  return '';
}
const POW_OUT = {
  shuriken: ['ph-shield', 'Sa défense cette manche', '−3'],
  danse: ['ph-sword', 'Son attaque cette manche', '−3'],
  siphon: ['ph-heart', 'Cœur volé', '+1 ❤️'],
  steal_item: ['ph-backpack', 'Objet dérobé', 'si son sac n’est pas vide'],
  swap_pos: ['ph-arrows-left-right', 'Échangez vos pions', 'sur le plateau'],
  canette: ['ph-shield', 'Sa défense', '−1']
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
    <div class="grid grid-cols-[1fr_1.7fr] gap-2 mt-4"><button type="button" class="ally-ghost" onclick="closePowerScreen()">Annuler</button><button type="button" class="ally-cta pow-cta" onclick="launchTargetedPower()" ${target ? '' : 'disabled'}>${POW_CTA[caid.id]}</button></div>`;
  return powRender('choix', caid, caid.id === 'canette' ? powChipHtml('ph-backpack', 'Objet du sac') : powChipHtml('ph-lightning', 'Capacité spéciale'), powHeadHtml(caid.name, caid.skillName, escapeHtml(caid.skillDesc)), '', bottom);
}
function pickPowerTarget(token) { powTargetToken = token; powChoice(); }
// Appelé par syncMultiplayerTargets : la liste des Caïds a changé
function refreshPowerChoice() { if (powState() === 'choix') powChoice(); }

async function openSpecialAbilityPrompt() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour de jouer !", "Tour Inactif");
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
    <div class="grid grid-cols-[1fr_1.7fr] gap-2 mt-4"><button type="button" class="ally-ghost" onclick="closePowerScreen()">Annuler</button><button type="button" class="ally-cta pow-cta" onclick="launchSelfPower()">${POW_CTA[caid.id] || 'Activer'}</button></div>`;
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
function openCanetteThrow(item) {
  powItem = item;
  powTargetToken = null;
  syncMultiplayerTargets();
  return powChoice();
}

function launchTargetedPower() {
  const target = (connectedRivals || []).find(r => r.playerToken === powTargetToken);
  if (!target || (!powItem && localPlayer.specialUsedThisTurn)) return;
  if (isRivalProtectedByPact(target.playerToken)) return showAppAlert("Pacte d'Alliance actif : vous ne pouvez pas cibler votre allié !", "Pacte Actif");
  const caid = powCaid();
  const effect = POW_TARGETED[caid.id];
  if (socket) {
    socket.emit('apply_special_to_target', {
      targetSocketId: target.socketId,
      targetPlayerToken: target.playerToken,
      effectType: effect,
      senderCaid: getMyCaid().name
    });
  }
  if (effect === 'siphon') localPlayer.hearts = Math.min(3, localPlayer.hearts + 1);
  if (powItem) {
    // La canette est lancée : elle quitte le sac, le pouvoir du Caïd reste disponible
    const idx = localPlayer.inventory.indexOf(powItem);
    if (idx >= 0) localPlayer.inventory.splice(idx, 1);
    powItem = null;
  } else localPlayer.specialUsedThisTurn = true;
  refreshHud();
  const name = allyRivalName(target);
  const stage = powDuo(powAv(caid.imageFile, 'Toi', 'me'), powAv(allyCaidImg(target.caidId, name), name, 'hit'), powFx(effect), `fx-${effect}`);
  const [icon, label, after] = POW_OUT[effect];
  const bottom = `<div class="pow-result">${powRow(icon, `${label}`, `<span class="pow-ac">${after}</span>`)}
    <div class="text-center text-[11px] font-bold text-slate-400 mt-2">${effect === 'canette' ? `Pour ${escapeHtml(name)}, jusqu’à la fin de la manche.` : effect === 'shuriken' || effect === 'danse' ? `Pour ${escapeHtml(name)}, jusqu’à la fin de la manche.` : effect === 'swap_pos' ? `Échange ton pion avec celui de ${escapeHtml(name)}.` : `Sur ${escapeHtml(name)}.`}</div>
    <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">Continuer</button></div>`;
  powRender('fx', caid, caid.id === 'canette' ? powChipHtml('ph-backpack', 'Objet lancé') : powChipHtml('ph-lightning', 'Capacité lancée'), powHeadHtml(caid.name, caid.skillName, ''), stage, bottom);
}

// VICTIME : « Touché ! » avec l'effet subi ; se résout quand le joueur encaisse
const POW_HIT = {
  siphon: (s) => [`${s} t’aspire 1 Cœur de Vie.`, 'ph-heart', 'Tes cœurs de vie', '−1'],
  shuriken: (s) => [`${s} t’a lancé un shuriken.`, 'ph-shield', 'Ta défense cette manche', '−3'],
  danse: (s) => [`${s} t’a envoûté avec sa danse.`, 'ph-sword', 'Ton attaque cette manche', '−3'],
  steal_item: (s, item) => item ? [`${s} t’a fait les poches.`, 'ph-backpack', escapeHtml(item.name), 'volé'] : [`${s} a tenté de te faire les poches…`, 'ph-backpack', 'Ton sac était vide', 'raté'],
  swap_pos: (s) => [`${s} a échangé sa place avec toi.`, 'ph-arrows-left-right', 'Échangez vos pions', 'sur le plateau'],
  canette: (s) => [`${s} t’a balancé une vieille canette.`, 'ph-shield', 'Ta défense jusqu’à la fin de la manche', '−1']
};
function showPowerHit(effectType, senderCaid, item) {
  const sender = CAID_ROSTER.find(c => c.name === senderCaid) || getMyCaid();
  const me = getMyCaid();
  const missed = effectType === 'steal_item' && !item;
  const [desc, icon, label, after] = (POW_HIT[effectType] || POW_HIT.shuriken)(escapeHtml(senderCaid || 'Un rival'), item);
  const stage = powDuo(powAv(sender.imageFile, senderCaid || 'Rival', 'foe'), powAv(me.imageFile, 'Toi', missed ? '' : 'hit'), powFx(effectType), `fx-${effectType} victim`);
  const extra = effectType === 'siphon' ? `<div class="mt-2">${powHearts(localPlayer.hearts)}</div>` : '';
  const bottom = `<div class="pow-result">${powRow(icon, label, `<span class="pow-ac">${after}</span>`)}${extra}
    <button type="button" class="ally-cta pow-cta mt-4" onclick="closePowerScreen()">${missed ? 'Ouf' : 'Encaisser'}</button></div>`;
  return powRender('touche', sender, powChipHtml('ph-warning', 'Attaque spéciale'), powHeadHtml('', missed ? 'RATÉ !' : 'TOUCHÉ !', desc), stage, bottom);
}
