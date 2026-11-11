// Stats du joueur, capacités, police, inventaire, HUD, transferts coffre

// Lascars donnent Attaque ET Défense
// Pot de Protéine : Lascars doublés jusqu'à la fin de la manche
const musclesDoubled = () => combatModifiers.doubleMuscles || (!!localPlayer.proteinRound && localPlayer.proteinRound === (currentSession.round || 1));

function getTotalAtk() {
  const armed = !!localPlayer.equipped.weapon && !myWeaponNullified;
  // Kitano : Attaque à mains nues = 3, seulement sans arme
  const base = (armed && localPlayer.caidId === 'caid_6') ? 1 : localPlayer.baseAtk;
  let atk = base - (localPlayer.tempAtkMalus || 0);
  if (armed) atk += (localPlayer.equipped.weapon.bonusVal * (combatModifiers.doubleWeapon ? 2 : 1));
  const multM = musclesDoubled() ? 2 : 1;
  const radioLascarBonus = isRadioEffectActive('LASCAR_ATK_BONUS') ? getRadioEffectValue('LASCAR_ATK_BONUS', 1) : 0;
  localPlayer.musclesOnPerson.forEach(m => {
    atk += (((m.bonusVal || 1) + radioLascarBonus) * multM);
  });
  if (localPlayer.strayDogActive) atk += 2;
  atk += combatModifiers.flatAtkBonus;
  return Math.max(0, atk);
}

function getTotalDef() {
  let def = localPlayer.baseDef - (localPlayer.tempDefMalus || 0) - (localPlayer.canetteDefMalus || 0);
  if (localPlayer.equipped.armor) def += localPlayer.equipped.armor.bonusVal;
  const multM = musclesDoubled() ? 2 : 1;
  localPlayer.musclesOnPerson.forEach(m => {
    def += ((m.bonusVal || 1) * multM);
  });
  if (localPlayer.strayDogActive) def += 2;
  return Math.max(0, def);
}

// Une action (attaque, Yencli, braquage, achat, objet ramassé) coûte 2 PM : simple décompte affiché, rien n'est bloqué
function spendActionPm() {
  pmSpentThisTurn += 2;
  refreshHud();
}

function getTotalPm() {
  // Malus Burger Queen : démarrage poussif, 0 PM pendant la manche 1 (les Vieilles baskets comptent quand même)
  if (localPlayer.caidId === 'caid_1' && currentSession.round === 1) return pmBonusThisTurn;
  const eqVeh = localPlayer.equipped.vehicle;
  let pm = 8 + (eqVeh ? eqVeh.bonusVal : 0);
  if (eqVeh) {
    const isMotor = eqVeh.isMotorized !== undefined ? eqVeh.isMotorized : (eqVeh.bonusVal >= 6);
    if (isMotor && isRadioEffectActive('MOTOR_PM_MOD')) {
      pm += getRadioEffectValue('MOTOR_PM_MOD', -2);
    }
  } else if (isRadioEffectActive('FOOT_PM_MOD')) {
    pm += getRadioEffectValue('FOOT_PM_MOD', -2);
  }
  return Math.max(1, pm) + pmBonusThisTurn;
}

async function clickMuscleSlot(idx) {
  if (!isMyTurnToPlay || !localPlayer.musclesOnPerson[idx]) return;
  const item = localPlayer.musclesOnPerson[idx];
  if (await showAppConfirm(`Congédier définitivement ${item.name} ?`, "Congédier Lascar")) {
    localPlayer.musclesOnPerson.splice(idx, 1);
    refreshHud();
  }
}
async function clickProstituteTransitSlot() {
  if (!isMyTurnToPlay) return;
  if (localPlayer.prostituteInTransit) {
    if (await showAppConfirm(`Congédier définitivement ${localPlayer.prostituteInTransit.name} ?`, "Congédier Escort")) {
      localPlayer.prostituteInTransit = null;
      refreshHud();
    }
  } else await showAppAlert("Aucune prostituée en transit. Flashe le Nightclub pour en recruter !", "Slot Vide");
}
async function depositProstituteToSafe() {
  if (!isMyTurnToPlay || !localPlayer.prostituteInTransit) return;
  localPlayer.prostitutesAtSafeList.push(localPlayer.prostituteInTransit);
  localPlayer.prostituteInTransit = null;
  refreshHud();
  await showAppAlert("Prostituée installée au QG ! Sa rente sera versée au coffre à chaque manche.", "🎉 Sécurisation QG");
}
// Capacités spéciales : voir js/powers.js

async function triggerPoliceInspection() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  if (!await showAppConfirm("Lancer le contrôle de police ?", "🚨 Contrôle de Police")) return;

  // Passeport diplomatique : proposé avant tout le reste, annule le contrôle
  if (await offerPassportAtPolice()) return;
  const caid = getMyCaid();
  if (caid.id === 'caid_5' && !localPlayer.specialUsedThisTurn) {
    if (await showAppConfirm("Tenter ta 'Prière Miraculeuse' (50 % d'annuler ce contrôle) ?", "🙏 J-Lo Gramme")) {
      localPlayer.specialUsedThisTurn = true;
      refreshHud();
      if (Math.random() >= 0.5) return showAppAlert("FACE ! Contrôle annulé ce tour !", "🙏 Miracle");
      await showAppAlert("PILE ! La prière échoue.", "🙏 Échec");
    }
  }

  const r = Math.random();
  let pick = 'CLEAN';
  if (r < 0.30) pick = 'CLEAN';
  else if (r < 0.65) pick = 'DRUGS_FOUND';
  else pick = 'WEAPONS_FOUND';

  const weapons = [localPlayer.equipped.weapon, ...localPlayer.inventory.filter(it => it && it.type === 'WEAPON')].filter(Boolean);
  const drugs = localPlayer.drugs;
  const arrests = localPlayer.arrests || 0;
  const caught = (pick === 'DRUGS_FOUND' && drugs > 0) || (pick === 'WEAPONS_FOUND' && weapons.length > 0);

  // La saisie est appliquée tout de suite (un rechargement de page ne l'annule pas), l'écran raconte ensuite la scène
  if (caught) {
    if (pick === 'DRUGS_FOUND') localPlayer.drugs = 0;
    else {
      localPlayer.equipped.weapon = null;
      localPlayer.inventory = localPlayer.inventory.filter(it => !it || it.type !== 'WEAPON');
    }
    localPlayer.arrests = arrests + 1;
    refreshHud();
  }

  await showPoliceScreen({ pick, caught, drugs, weapons, arrests });
  if (caught) endCurrentPlayerTurn(true); // garde à vue : fin de tour forcée, sans confirmation
}

// Écran plein écran du contrôle : la patrouille arrive, tire au sort ce qu'elle cherche, puis le verdict
function showPoliceScreen({ pick, caught, drugs, weapons, arrests }) {
  const scr = document.getElementById('policeScreen');
  const caid = getMyCaid();
  const cta = document.getElementById('policeCta');
  const cards = [...document.querySelectorAll('#policeDraw .police-card')];
  const weaponNames = weapons.map(w => w.name).join(', ');
  const row = (icon, label, before, after, note) => `<div class="police-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>${before !== '' ? `<span class="bef">${before}</span><i class="ph-bold ph-arrow-right text-slate-500 text-xs"></i>` : ''}<span class="aft">${after}</span></div>`;
  const setRows = html => {
    const box = document.getElementById('policeRows');
    box.innerHTML = html;
    [...box.children].forEach((el, i) => el.style.animationDelay = `${0.15 + i * 0.1}s`);
  };
  const searched = pick === 'DRUGS_FOUND' ? 'de la drogue' : 'des armes';

  document.getElementById('policeRound').innerText = currentSession.round || 1;
  document.getElementById('policeCaidImg').src = caid.imageFile;
  document.getElementById('policeCaidName').innerText = caid.name;
  document.getElementById('policeCaidSub').innerText = 'se fait fouiller…';
  document.getElementById('policeBadge').innerText = '…';
  document.getElementById('policeHeadline').innerHTML = 'PAPIERS,<br>S’IL VOUS PLAÎT.';
  document.getElementById('policeDrawLabel').innerText = 'La patrouille choisit ce qu’elle cherche…';
  document.getElementById('policeRows').innerHTML = '';
  cards.forEach(c => c.classList.remove('on'));
  cta.innerText = 'Voir le résultat';
  cta.disabled = true;
  scr.dataset.state = 'fouille';
  scr.classList.remove('hidden', 'result', 'show');
  void scr.offsetWidth; // relance les animations d'arrivée
  scr.classList.add('show');

  return new Promise(resolve => {
    // Tirage : la sélection saute de carte en carte puis s'arrête sur ce que cherche la police
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = cards.findIndex(c => c.dataset.pick === pick);
    const steps = reduce ? 0 : 12;
    let i = 0;
    const land = () => {
      cards.forEach((c, k) => c.classList.toggle('on', k === target));
      document.getElementById('policeDrawLabel').innerText = 'Ils cherchent :';
      setRows(
        row('ph-leaf', 'Drogue sur toi', '', `${drugs} kg`) +
        row('ph-knife', 'Armes sur toi', '', weapons.length ? `${weapons.length}` : 'aucune', weaponNames)
      );
      cta.disabled = false;
    };
    const tick = () => {
      if (i >= steps) return land();
      cards.forEach((c, k) => c.classList.toggle('on', k === i % 3));
      i++;
      setTimeout(tick, 70 + i * 9);
    };
    setTimeout(tick, reduce ? 0 : 900);

    cta.onclick = () => {
      if (scr.classList.contains('result')) {
        scr.classList.add('hidden');
        scr.classList.remove('show', 'result');
        return resolve();
      }
      scr.dataset.state = caught ? 'gav' : 'ras';
      scr.classList.add('result');
      document.getElementById('policeDrawLabel').innerText = 'Ils cherchaient :';
      document.getElementById('policeHeadline').innerHTML = caught ? 'AU POSTE.' : 'CIRCULEZ.';
      document.getElementById('policeBadge').innerText = caught ? 'GAV' : 'LIBRE';
      document.getElementById('policeCaidSub').innerText = caught ? 'placé en garde à vue' : 'repart libre';
      if (!caught) {
        setRows(
          (pick === 'CLEAN' ? row('ph-magnifying-glass', 'Contrôle de routine', '', 'R.A.S.') : row('ph-magnifying-glass', `Ils cherchaient ${searched}`, '', 'rien trouvé')) +
          row('ph-person-simple-walk', 'Ton tour', '', 'continue')
        );
      } else {
        setRows(
          (pick === 'DRUGS_FOUND'
            ? row('ph-leaf', 'Drogue sur toi', `${drugs} kg`, '0 kg', 'saisie')
            : row('ph-knife', 'Armes sur toi', `${weapons.length}`, '0', `saisies : ${weaponNames}`)) +
          row('ph-lock-key', 'Arrestations', `${arrests}`, `${arrests + 1}`) +
          row('ph-hourglass-simple', 'Ton tour', 'en cours', 'terminé')
        );
      }
      cta.innerText = caught ? 'Direction le poste' : 'Repartir';
    };
  });
}

async function sellItem(idx) {
  if (!isMyTurnToPlay) return;
  const item = localPlayer.inventory[idx];
  if (!item) return;
  const val = Math.floor((item.price ?? item.p ?? 3000) * 0.5);
  if (await showAppConfirm(`Revendre "${item.name}" pour ${val.toLocaleString()} € ?`, "💰 Revente")) {
    localPlayer.inventory.splice(idx, 1);
    localPlayer.pocketCash += val;
    refreshHud();
  }
}

async function discardItem(idx) {
  if (!isMyTurnToPlay) return;
  const item = localPlayer.inventory[idx];
  if (!item) return;
  if (await showAppConfirm(`Jeter définitivement "${item.name}" ?`, "Jeter")) {
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
  }
}

function refreshHud() {
  const caid = getMyCaid();
  const bannerImg = document.getElementById('caidBannerImg');
  if (bannerImg && caid.bannerFile) bannerImg.src = caid.bannerFile;
  let heartsStr = '';
  for (let i = 0; i < localPlayer.hearts; i++) heartsStr += '❤️';
  for (let i = localPlayer.hearts; i < 3; i++) heartsStr += '🖤';
  document.getElementById('hudHearts').innerText = heartsStr;
  document.getElementById('hudDogBadge').classList.toggle('hidden', !localPlayer.strayDogActive);
  document.getElementById('hudAtk').innerText = getTotalAtk();
  document.getElementById('hudDef').innerText = getTotalDef();
  // Aide-mémoire : PM restants après les actions du tour (2 PM par action, à décompter aussi sur le plateau)
  document.getElementById('hudCurrentPm').innerText = Math.max(0, getTotalPm() - pmSpentThisTurn);
  const pmNote = document.getElementById('hudPmNote');
  pmNote.innerText = pmSpentThisTurn > 0 ? `(−${pmSpentThisTurn})` : '';
  pmNote.classList.toggle('hidden', pmSpentThisTurn <= 0);
  if (currentSession.currentRadioEvent) {
    document.getElementById('hudRadioRoundTag').innerText = currentSession.round;
    document.getElementById('hudRadioReminderTitle').innerText = currentSession.currentRadioEvent.title;
    document.getElementById('hudRadioReminderDesc').innerText = currentSession.currentRadioEvent.impact || currentSession.currentRadioEvent.desc;
  }
  for (let i = 0; i < 3; i++) {
    const slotEl = document.getElementById(`muscleSlot_${i}`);
    if (localPlayer.musclesOnPerson[i]) {
      const mb = localPlayer.musclesOnPerson[i];
      const img = (mb.level === 2) ? 'gblvl2.jpg' : 'gblvl1.jpg';
      slotEl.innerHTML = `<img src="${img}" class="w-full h-full object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-[10px] font-black text-sky-300 font-mono\\'>L${mb.level||1}</span>';">`;
      slotEl.className = "w-8 h-8 rounded-xl bg-sky-950/80 border border-sky-400 overflow-hidden flex items-center justify-center cursor-pointer";
    } else {
      slotEl.innerHTML = `<span class="text-xs text-slate-500 font-mono font-bold">✕</span>`;
      slotEl.className = "w-8 h-8 rounded-xl bg-black/60 border border-sky-400/40 flex items-center justify-center cursor-pointer";
    }
  }
  const pSlot = document.getElementById('prostituteTransitSlot');
  if (localPlayer.prostituteInTransit) {
    const pr = localPlayer.prostituteInTransit;
    const imgPr = (pr.level === 2) ? 'plvl2.jpg' : 'plvl1.jpg';
    pSlot.innerHTML = `<img src="${imgPr}" class="w-full h-full object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-[10px] font-black text-rose-300 font-mono\\'>L${pr.level||1}</span>';">`;
    pSlot.className = "w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-400 overflow-hidden flex items-center justify-center cursor-pointer";
  } else {
    pSlot.innerHTML = `<span class="text-xs text-slate-500 font-mono font-bold">✕</span>`;
    pSlot.className = "w-8 h-8 rounded-xl bg-black/60 border border-rose-400/40 flex items-center justify-center cursor-pointer";
  }
  document.getElementById('hudPocketCash').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('hudSafeCash').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  document.getElementById('hudDrugs').innerText = `🌿 ${localPlayer.drugs} kg`;
  document.getElementById('hudSafeDrugs').innerText = `📦 ${localPlayer.safeDrugs} kg`;
  document.getElementById('hudSpecialPowerName').innerText = caid.skillName;
  document.getElementById('hudSpecialPowerDesc').innerText = caid.skillDesc;
  const btnSpec = document.getElementById('btnSpecialPower');
  const actionLabel = document.getElementById('hudSpecialActionBtnLabel');
  if (localPlayer.specialUsedThisTurn) {
    btnSpec.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
    actionLabel.innerText = "Épuisée";
    actionLabel.className = "text-[9px] font-black uppercase px-2 py-1 bg-slate-800 text-slate-500 rounded-lg inline-block";
  } else {
    btnSpec.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
    actionLabel.innerText = "Activer";
    actionLabel.className = "text-[9px] font-black uppercase px-2.5 py-1 bg-purple-500 text-black rounded-lg inline-block";
  }
  renderInventoryList(); // bouton Sac et écran Sac (js/sac.js)
  updateArenaLiveStats();
  if (socket) {
    socket.emit('sync_player', {
      caidId: localPlayer.caidId,
      caidName: caid.name,
      pocketCash: localPlayer.pocketCash,
      safeCash: localPlayer.safeCash,
      drugs: localPlayer.drugs,
      safeDrugs: localPlayer.safeDrugs,
      arrests: localPlayer.arrests || 0,
      hearts: localPlayer.hearts,
      inHospital: localPlayer.inHospital || null,
      atk: getTotalAtk(),
      def: getTotalDef(),
      musclesCount: localPlayer.musclesOnPerson.length,
      hasProstituteInTransit: !!localPlayer.prostituteInTransit,
      prostituteObj: localPlayer.prostituteInTransit,
      hasStrayDog: !!localPlayer.strayDogActive,
      nullEnemyWeapon: !!combatModifiers.nullEnemyWeapon,
      // État complet du Caïd, rendu par le serveur à la reconnexion (page rechargée, serveur redémarré)
      inventory: localPlayer.inventory,
      equipped: localPlayer.equipped,
      musclesOnPerson: localPlayer.musclesOnPerson,
      prostituteInTransit: localPlayer.prostituteInTransit,
      prostitutesAtSafeList: localPlayer.prostitutesAtSafeList,
      freeProstituteClaimed: localPlayer.freeProstituteClaimed,
      baseAtk: localPlayer.baseAtk,
      baseDef: localPlayer.baseDef,
      tempAtkMalus: localPlayer.tempAtkMalus,
      tempDefMalus: localPlayer.tempDefMalus,
      canetteDefMalus: localPlayer.canetteDefMalus || 0,
      firstWeaponDoubled: localPlayer.firstWeaponDoubled,
      specialUsedThisTurn: localPlayer.specialUsedThisTurn,
      jloDoubledKgBought: localPlayer.jloDoubledKgBought || 0,
      freeItemsClaimed: localPlayer.freeItemsClaimed || [],
      roundSeen: localPlayer.roundSeen || 0,
      proteinRound: localPlayer.proteinRound || 0,
      vouchers: localPlayer.vouchers || []
    });
  }
}


async function equipItemFromInventory(idx) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  const item = localPlayer.inventory[idx];
  if (!item) return;
  const slotKey = item.type === 'WEAPON' ? 'weapon' : (item.type === 'ARMOR' ? 'armor' : 'vehicle');
  if (localPlayer.equipped[slotKey]) localPlayer.inventory.push(localPlayer.equipped[slotKey]);
  localPlayer.equipped[slotKey] = item;
  localPlayer.inventory.splice(idx, 1);
  refreshHud();
}

async function unequipSlot(slotKey) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  const item = localPlayer.equipped[slotKey];
  if (!item) return;
  localPlayer.inventory.push(item);
  localPlayer.equipped[slotKey] = null;
  refreshHud();
}

async function useItem(idx) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  const it = localPlayer.inventory[idx];
  if (!it) return;
  if (it.eff === 'heal' || it.type === 'CONSUMABLE' || (it.name && it.name.includes('Kebab'))) {
    if (localPlayer.hearts >= 3) return showAppAlert("Tes Cœurs sont déjà au maximum !", "Santé Pleine");
    const before = localPlayer.hearts;
    localPlayer.hearts = Math.min(3, localPlayer.hearts + (it.val || 1));
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
    return showCardPlayed(it, [['ph-heart', 'Cœurs de vie', `${'❤️'.repeat(before)} → ${'❤️'.repeat(localPlayer.hearts)}`]]);
  }
  // Vieille canette, Pied de biche : on choisit le rival à viser (écran des capacités spéciales)
  if (it.eff === 'def_malus_round' || it.eff === 'crowbar') return openItemTargetPower(it);
  if (it.eff === 'patrol_reroll') return openTalkie(it);
  if (it.eff === 'double_fouille') return showAppAlert("Tes Lunettes de soleil serviront toutes seules à ta prochaine Fouille : tu verras 2 objets et tu garderas le meilleur.", "🕶️ Lunettes de soleil");
  if (it.eff === 'scratch') {
    localPlayer.inventory.splice(idx, 1);
    const win = Math.random() < 1 / 3, prize = it.val || 5000;
    if (win) localPlayer.pocketCash += prize;
    refreshHud();
    return openScratch(win, prize);
  }
  if (it.eff === 'cancel_police') return showAppAlert("Ton Passeport diplomatique te sera proposé automatiquement au prochain contrôle de police.", "🛂 Passeport diplomatique");
  if (it.eff === 'none') return showAppAlert(/trognon/i.test(it.name || '') ? "Un trognon de pomme… Ça ne sert à rien, mais faut pas gâcher !" : `${it.name} : ça ne sert à rien…`, `${itemEmoji(it)} ${it.name}`);
  if (it.eff === 'free_prostitute') return showAppAlert("Ton Manteau de fourrure sera utilisé tout seul au Nightclub : ta prochaine Prostituée Niv. 1 est gratuite.", "🧥 Manteau de fourrure");
  if (it.eff === 'botox') return showAppAlert("Ta Seringue de botox sera utilisée toute seule au début d'une manche où tu as des prostituées au QG : leur rente sera doublée.", "💉 Seringue de botox");
  if (it.eff === 'pm_turn') {
    localPlayer.inventory.splice(idx, 1);
    pmBonusThisTurn += it.val || 3;
    refreshHud();
    return showCardPlayed(it, [['ph-sneaker-move', 'Jusqu’à la fin du tour', `+${it.val || 3} PM`]]);
  }
  if (it.eff === 'voucher') {
    if (hasVoucher(it.shop)) return showAppAlert(`Tu as déjà un bon actif pour : ${it.shop}. Utilise-le d'abord !`, "🎟️ Bon de réduction");
    localPlayer.inventory.splice(idx, 1);
    localPlayer.vouchers = [...(localPlayer.vouchers || []), it.shop];
    refreshHud();
    return showCardPlayed(it, [['ph-ticket', `Prochain achat : ${escapeHtml(it.shop)}`, '−50 %']]);
  }
  if (it.eff === 'stray_dog') {
    const caid = getMyCaid();
    localPlayer.inventory.splice(idx, 1);
    dogFromCard = true; // la carte jouée remplace le message « Chien rallié »
    if (socket) socket.emit('claim_stray_dog', { senderCaid: caid.name, playerToken: myPlayerToken });
    else { localPlayer.strayDogActive = true; refreshHud(); }
    return showCardPlayed(it, [['ph-dog', 'Le Chien Errant te rejoint', '+2 ATK / +2 DÉF'], ['ph-info', 'Jusqu’à ce qu’un rival le siffle', '']]);
  }
  if (it.dur === 'combat') {
    if (it.eff === 'double_weapon_atk') {
      if (!isFirearm(localPlayer.equipped.weapon)) {
        return showAppAlert("Requiert une arme à feu équipée !", "Arme Incompatible");
      }
      combatModifiers.doubleWeapon = true;
    } else if (it.eff === 'double_muscles_atk') localPlayer.proteinRound = currentSession.round || 1;
    else if (it.eff === 'bonus_combat_atk') combatModifiers.flatAtkBonus += (it.val || 1);
    else if (it.eff === 'null_enemy_weapon') combatModifiers.nullEnemyWeapon = true;
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
    const row = it.eff === 'double_weapon_atk' ? ['ph-crosshair', 'Arme à feu, prochain combat du tour', '×2']
      : it.eff === 'null_enemy_weapon' ? ['ph-shield', 'Arme adverse, prochain combat du tour', '0']
      : it.eff === 'double_muscles_atk' ? ['ph-barbell', 'Lascars jusqu’à la fin de la manche', '×2']
      : ['ph-sword', 'Attaque jusqu’à la fin du tour', `+${it.val || 1}`];
    return showCardPlayed(it, it.eff === 'null_enemy_weapon' ? [row] : [row, ['ph-sword', 'Ton attaque', `${getTotalAtk()}`]]);
  }
  localPlayer.inventory.splice(idx, 1);
  refreshHud();
  await showAppAlert(`${it.name} utilisé !`, "Objet");
}


// Coffre du QG : sur toi ⇄ au QG pour l'argent et la drogue, installation d'une escort (aller simple)
let transferAmount = 0;
const escortRent = pr => pr.revenue || (pr.level === 2 ? 2500 : 1000);
// Le coffre ne s'ouvre qu'en flashant le QR de la case QG du plateau
async function qgOnlyHint() {
  await showAppAlert("Le coffre s'ouvre au QG : rends-toi sur la case QG du plateau et flashe son QR code.", "🏦 Coffre du QG");
}
async function openTransferModal(mode, res) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  currentTransferMode = mode === 'withdraw' ? 'withdraw' : 'deposit';
  currentTransferResource = res || (currentTransferResource === 'escort' ? 'cash' : currentTransferResource || 'cash');
  if (currentTransferResource === 'escort') currentTransferMode = 'deposit';
  document.getElementById('qgRound').innerText = currentSession.round || 1;
  document.getElementById('modalTransfer').classList.remove('hidden');
  transferAmount = 0;
  updateTransferUI();
}
function switchTransferResource(res) {
  currentTransferResource = res;
  if (res === 'escort') currentTransferMode = 'deposit';
  transferAmount = 0;
  updateTransferUI();
}
function toggleTransferDirection() {
  if (currentTransferResource === 'escort') return; // aller simple
  currentTransferMode = currentTransferMode === 'deposit' ? 'withdraw' : 'deposit';
  transferAmount = 0;
  updateTransferUI();
}
function getTransferMaxLimit() {
  return currentTransferResource === 'cash'
    ? (currentTransferMode === 'deposit' ? localPlayer.pocketCash : localPlayer.safeCash)
    : (currentTransferMode === 'deposit' ? localPlayer.drugs : (localPlayer.safeDrugs || 0));
}
function transferStep() { return currentTransferResource === 'cash' ? 500 : 1; }
function fmtTransfer(v) { return currentTransferResource === 'cash' ? `${v.toLocaleString()} €` : `${v} kg`; }
function setTransferAmount(v) {
  transferAmount = Math.max(0, Math.min(getTransferMaxLimit(), Math.round(v)));
  updateTransferUI(true);
}
function stepTransfer(dir) {
  const step = transferStep();
  const max = getTransferMaxLimit();
  // Pas de 500 € ou 1 kg ; le dernier pas va jusqu'au maximum
  setTransferAmount(dir > 0 ? Math.min(max, (Math.floor(transferAmount / step) + 1) * step) : Math.max(0, (Math.ceil(transferAmount / step) - 1) * step));
}
function setTransferFraction(f) {
  const max = getTransferMaxLimit();
  setTransferAmount(f >= 1 ? max : Math.floor((max * f) / transferStep()) * transferStep());
}
function updateTransferUI(amountOnly) {
  const scr = document.getElementById('modalTransfer');
  const res = currentTransferResource, dep = currentTransferMode === 'deposit';
  scr.dataset.res = res;
  scr.dataset.dir = currentTransferMode;
  document.querySelectorAll('#modalTransfer .qg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.res === res));
  const meIll = document.getElementById('qgMeIll');
  const hint = document.getElementById('qgHint');
  const cta = document.getElementById('qgCta');
  document.getElementById('qgAmountBox').classList.toggle('hidden', res === 'escort');
  document.getElementById('qgEscortBox').classList.toggle('hidden', res !== 'escort');
  document.getElementById('qgArrowHint').innerText = res === 'escort' ? 'aller simple' : 'toucher pour inverser';
  document.getElementById('qgArrowLabel').innerText = res === 'escort' ? 'Installer' : (dep ? 'Déposer' : 'Retirer');

  if (res === 'escort') {
    const pr = localPlayer.prostituteInTransit;
    const list = localPlayer.prostitutesAtSafeList || [];
    const rent = list.reduce((acc, p) => acc + escortRent(p), 0);
    meIll.innerHTML = pr ? `<img src="${pr.level === 2 ? 'plvl2.jpg' : 'plvl1.jpg'}" alt="" class="qg-portrait">` : '<div class="qg-empty"><i class="ph-bold ph-user"></i></div>';
    document.getElementById('qgMeVal').innerText = pr ? `L${pr.level || 1}` : 'personne';
    document.getElementById('qgMeAfter').innerText = pr ? '→ personne' : '';
    document.getElementById('qgSafeVal').innerText = `${list.length} escort${list.length > 1 ? 's' : ''}`;
    document.getElementById('qgSafeAfter').innerText = pr ? `→ ${(rent + escortRent(pr)).toLocaleString()} €/manche` : `${rent.toLocaleString()} €/manche`;
    document.getElementById('qgEscortBox').innerHTML = pr
      ? `<div class="font-anton text-2xl text-white">${escapeHtml(pr.name || `Prostituée L${pr.level || 1}`)}</div><div class="text-sm font-bold text-pink-300">Rente : ${escortRent(pr).toLocaleString()} € à chaque manche</div>`
      : `<div class="text-sm font-bold text-slate-300">Aucune escort sur toi</div><div class="text-[11px] text-slate-500">Recrute-en une au Nightclub.</div>`;
    document.getElementById('qgHeadline').innerHTML = 'AU CHAUD.';
    hint.innerHTML = '<i class="ph-fill ph-shield-check"></i> Au QG, elle rapporte sa rente à chaque manche et ne peut plus être rackettée';
    cta.innerText = 'Installer au QG';
    cta.disabled = !pr;
    return;
  }
  const cash = res === 'cash';
  const mine = cash ? localPlayer.pocketCash : localPlayer.drugs;
  const safe = cash ? localPlayer.safeCash : (localPlayer.safeDrugs || 0);
  const max = getTransferMaxLimit();
  transferAmount = Math.min(transferAmount, max);
  meIll.innerHTML = cash ? '<img src="pay-cash.webp" alt="Portefeuille">' : '<img src="qg-sachet.webp" alt="Sachet de drogue">';
  document.getElementById('qgMeVal').innerText = fmtTransfer(mine);
  document.getElementById('qgSafeVal').innerText = fmtTransfer(safe);
  document.getElementById('qgMeAfter').innerText = `→ ${fmtTransfer(dep ? mine - transferAmount : mine + transferAmount)}`;
  document.getElementById('qgSafeAfter').innerText = `→ ${fmtTransfer(dep ? safe + transferAmount : safe - transferAmount)}`;
  document.getElementById('qgAmount').innerText = fmtTransfer(transferAmount);
  document.getElementById('qgMax').innerText = `max ${fmtTransfer(max)}`;
  const range = document.getElementById('transferRangeSlider');
  range.max = max; range.step = transferStep(); range.value = transferAmount;
  document.getElementById('qgHeadline').innerHTML = dep ? 'À L’ABRI.' : 'ON RESSORT<br>LE MAGOT.';
  hint.innerHTML = `<i class="ph-fill ph-shield-check"></i> ${cash ? 'Au QG, ton argent est à l’abri du racket' : 'Au QG, ta drogue échappe aux contrôles de police'}`;
  cta.innerText = `${dep ? 'Déposer' : 'Retirer'} ${fmtTransfer(transferAmount)}`;
  cta.disabled = transferAmount <= 0;
}
// Petite animation : billets, sachets ou portrait qui passent d'un côté à l'autre
function playTransferFly(icon, toRight) {
  const box = document.querySelector('#modalTransfer .qg-duo');
  [0, 1, 2].forEach(i => {
    const el = document.createElement('span');
    el.className = `qg-fly ${toRight ? 'right' : 'left'}`;
    el.innerHTML = icon;
    el.style.animationDelay = `${i * 0.09}s`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 900);
  });
}
async function confirmTransferAction() {
  if (!isMyTurnToPlay) return;
  const res = currentTransferResource, dep = currentTransferMode === 'deposit';
  if (res === 'escort') {
    if (!localPlayer.prostituteInTransit) return;
    playTransferFly('💃', true);
    localPlayer.prostitutesAtSafeList.push(localPlayer.prostituteInTransit);
    localPlayer.prostituteInTransit = null;
  } else {
    const amt = transferAmount;
    if (amt <= 0) return;
    if (res === 'cash') {
      if (dep && amt <= localPlayer.pocketCash) { localPlayer.pocketCash -= amt; localPlayer.safeCash += amt; }
      else if (!dep && amt <= localPlayer.safeCash) { localPlayer.safeCash -= amt; localPlayer.pocketCash += amt; }
      else return;
    } else {
      if (dep && amt <= localPlayer.drugs) { localPlayer.drugs -= amt; localPlayer.safeDrugs += amt; }
      else if (!dep && amt <= localPlayer.safeDrugs) { localPlayer.safeDrugs -= amt; localPlayer.drugs += amt; }
      else return;
    }
    playTransferFly(res === 'cash' ? '💵' : '🌿', dep);
  }
  transferAmount = 0;
  refreshHud();
  setTimeout(() => updateTransferUI(), 450);
}
