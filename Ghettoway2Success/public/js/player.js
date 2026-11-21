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
  // Chutes de neige : aucun véhicule ne roule, tout le monde à pied
  const eqVeh = isRadioEffectActive('SNOW') ? null : localPlayer.equipped.vehicle;
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

// informant : contrôle imposé par le Flash Radio « Une balance… », sans confirmation, dès le résultat du vote,
// même hors de son tour (pas de fin de tour forcée alors). focus : ce que la balance a dénoncé (drogue, armes,
// escort en transit) → contrôle ciblé à 50 % rien / 50 % trouvé.
const POLICE_FOCUS = { drugs: 'DRUGS_FOUND', weapons: 'WEAPONS_FOUND', prostitute: 'PROSTITUTE_FOUND' };
// endingTurn : contrôle pendant une fin de tour (la sienne ou celle d'un autre) : pas de fin de tour forcée
async function triggerPoliceInspection(informant = false, focus = null, endingTurn = false) {
  if (!informant && !isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  if (!informant && !await showAppConfirm("Lancer le contrôle de police ?", "🚨 Contrôle de Police")) return;

  // Passeport diplomatique : proposé avant tout le reste, annule le contrôle
  if (await offerPassportAtPolice()) return;
  const caid = getMyCaid();
  if (caid.id === 'caid_5' && specialReady()) {
    if (await showAppConfirm("Tenter ta 'Prière Miraculeuse' (50 % d'annuler ce contrôle) ?", "🙏 J-Lo Gramme")) {
      markSpecialUsed();
      refreshHud();
      if (Math.random() >= 0.5) return showAppAlert("FACE ! Contrôle annulé ce tour !", "🙏 Miracle");
      await showAppAlert("PILE ! La prière échoue.", "🙏 Échec");
    }
  }

  // Chances : 30 % rien, le reste partagé entre drogue et armes (Festival en ville : 15 % rien) ;
  // contrôle ciblé par une balance : 50 % rien, 50 % ce qui a été dénoncé
  const target = POLICE_FOCUS[focus];
  const clean = getRadioField('policeClean', 0.30);
  const odds = target ? { CLEAN: 0.5, [target]: 0.5 } : { CLEAN: clean, DRUGS_FOUND: (1 - clean) / 2, WEAPONS_FOUND: (1 - clean) / 2 };
  let r = Math.random(), pick = 'CLEAN';
  for (const [k, p] of Object.entries(odds)) { pick = k; if ((r -= p) < 0) break; }

  const weapons = [localPlayer.equipped.weapon, ...localPlayer.inventory.filter(it => it && it.type === 'WEAPON')].filter(Boolean);
  const drugs = localPlayer.drugs;
  const prostitute = localPlayer.prostituteInTransit;
  const arrests = localPlayer.arrests || 0;
  const caught = (pick === 'DRUGS_FOUND' && drugs > 0) || (pick === 'WEAPONS_FOUND' && weapons.length > 0) || (pick === 'PROSTITUTE_FOUND' && !!prostitute);

  // La saisie est appliquée tout de suite (un rechargement de page ne l'annule pas), l'écran raconte ensuite la scène
  if (caught) {
    if (pick === 'DRUGS_FOUND') localPlayer.drugs = 0;
    else if (pick === 'PROSTITUTE_FOUND') localPlayer.prostituteInTransit = null;
    else {
      localPlayer.equipped.weapon = null;
      localPlayer.inventory = localPlayer.inventory.filter(it => !it || it.type !== 'WEAPON');
    }
    localPlayer.arrests = arrests + 1;
    refreshHud();
  }

  await showPoliceScreen({ pick, caught, drugs, weapons, prostitute, arrests, odds, endingTurn });
  if (caught && isMyTurnToPlay && !endingTurn) endCurrentPlayerTurn(true); // garde à vue : fin de tour forcée, sans confirmation
}

// Écran plein écran du contrôle : la patrouille arrive, tire au sort ce qu'elle cherche, puis le verdict
function showPoliceScreen({ pick, caught, drugs, weapons, prostitute, arrests, odds, endingTurn }) {
  const scr = document.getElementById('policeScreen');
  const caid = getMyCaid();
  const cta = document.getElementById('policeCta');
  // Seules les cartes possibles sont tirées, avec leurs vraies chances (Festival, contrôle ciblé d'une balance)
  const allCards = [...document.querySelectorAll('#policeDraw .police-card')];
  allCards.forEach(c => {
    const p = odds[c.dataset.pick];
    c.classList.toggle('hidden', p === undefined);
    if (p !== undefined) c.querySelector('small').innerText = `${Math.round(p * 100)}%`;
  });
  const cards = allCards.filter(c => odds[c.dataset.pick] !== undefined);
  document.getElementById('policeDraw').style.gridTemplateColumns = `repeat(${cards.length}, 1fr)`;
  const prName = prostitute ? (prostitute.name || 'Escort') : '';
  const weaponNames = weapons.map(w => w.name).join(', ');
  const row = (icon, label, before, after, note) => `<div class="police-row"><i class="ph-bold ${icon}"></i><span class="lbl">${label}${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>${before !== '' ? `<span class="bef">${before}</span><i class="ph-bold ph-arrow-right text-slate-500 text-xs"></i>` : ''}<span class="aft">${after}</span></div>`;
  const setRows = html => {
    const box = document.getElementById('policeRows');
    box.innerHTML = html;
    [...box.children].forEach((el, i) => el.style.animationDelay = `${0.15 + i * 0.1}s`);
  };
  const searched = { DRUGS_FOUND: 'de la drogue', WEAPONS_FOUND: 'des armes', PROSTITUTE_FOUND: 'ton escort' }[pick];
  // Ce que tu as sur toi, pour chaque chose que la patrouille peut chercher
  const onYou = () => (odds.DRUGS_FOUND !== undefined ? row('ph-leaf', 'Drogue sur toi', '', `${drugs} kg`) : '')
    + (odds.WEAPONS_FOUND !== undefined ? row('ph-knife', 'Armes sur toi', '', weapons.length ? `${weapons.length}` : 'aucune', weaponNames) : '')
    + (odds.PROSTITUTE_FOUND !== undefined ? row('ph-high-heel', 'Escort en transit', '', prostitute ? 'oui' : 'aucune', prName) : '');

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
      setRows(onYou());
      cta.disabled = false;
    };
    const tick = () => {
      if (i >= steps) return land();
      cards.forEach((c, k) => c.classList.toggle('on', k === i % cards.length));
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
          (isMyTurnToPlay && !endingTurn ? row('ph-person-simple-walk', 'Ton tour', '', 'continue') : '')
        );
      } else {
        setRows(
          (pick === 'DRUGS_FOUND' ? row('ph-leaf', 'Drogue sur toi', `${drugs} kg`, '0 kg', 'saisie')
            : pick === 'PROSTITUTE_FOUND' ? row('ph-high-heel', 'Escort en transit', '1', '0', `${prName} embarquée par la police`)
            : row('ph-knife', 'Armes sur toi', `${weapons.length}`, '0', `saisies : ${weaponNames}`)) +
          row('ph-lock-key', 'Arrestations', `${arrests}`, `${arrests + 1}`) +
          (isMyTurnToPlay ? row('ph-hourglass-simple', 'Ton tour', 'en cours', 'terminé') : '')
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
  const val = sellPrice(item);
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
      slotEl.innerHTML = `<img src="${img}" alt="Lascar niveau ${mb.level || 1}">`;
      slotEl.className = 'hud-slot l on';
    } else {
      slotEl.innerHTML = '✕';
      slotEl.className = 'hud-slot l';
    }
  }
  const pSlot = document.getElementById('prostituteTransitSlot');
  if (localPlayer.prostituteInTransit) {
    const pr = localPlayer.prostituteInTransit;
    const imgPr = (pr.level === 2) ? 'plvl2.jpg' : 'plvl1.jpg';
    pSlot.innerHTML = `<img src="${imgPr}" alt="Escort niveau ${pr.level || 1}">`;
    pSlot.className = 'hud-slot p on';
  } else {
    pSlot.innerHTML = '✕';
    pSlot.className = 'hud-slot p';
  }
  document.getElementById('hudPocketCash').innerText = `${localPlayer.pocketCash.toLocaleString()} €`;
  document.getElementById('hudSafeCash').innerText = `${localPlayer.safeCash.toLocaleString()} €`;
  document.getElementById('hudDrugs').innerText = `🌿 ${localPlayer.drugs} kg`;
  document.getElementById('hudSafeDrugs').innerText = `📦 ${localPlayer.safeDrugs} kg`;
  document.getElementById('hudSpecialPowerName').innerText = caid.skillName;
  document.getElementById('hudSpecialPowerDesc').innerText = caid.skillDesc;
  const btnSpec = document.getElementById('btnSpecialPower');
  const actionLabel = document.getElementById('hudSpecialActionBtnLabel');
  // Capacité en recharge (4 manches) : bouton grisé (il reste touchable pour le rappeler)
  btnSpec.classList.toggle('used', !specialReady());
  actionLabel.innerText = specialReady() ? 'prête' : `manche ${specialReadyRound()}`;
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
      specialUsedRound: localPlayer.specialUsedRound || 0,
      qgDef: localPlayer.qgDef || 0,
      qgRaidRound: localPlayer.qgRaidRound || 0,
      jloDoubledKgBought: localPlayer.jloDoubledKgBought || 0,
      freeItemsClaimed: localPlayer.freeItemsClaimed || [],
      roundSeen: localPlayer.roundSeen || 0,
      proteinRound: localPlayer.proteinRound || 0,
      botoxActive: !!localPlayer.botoxActive,
      vouchers: localPlayer.vouchers || [],
      labLevel: localPlayer.labLevel || 0,
      labGearInTransit: localPlayer.labGearInTransit || null
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
    if (isRadioEffectActive('NO_HEAL')) return showAppAlert("Les urgences sont saturées : ton Kebab ne soigne pas cette manche. Garde-le pour plus tard !", "🏥 Hôpital débordé");
    if (localPlayer.hearts >= 3) return showAppAlert("Tes Cœurs sont déjà au maximum !", "Santé Pleine");
    const before = localPlayer.hearts;
    localPlayer.hearts = Math.min(3, localPlayer.hearts + (it.val || 1));
    localPlayer.inventory.splice(idx, 1);
    refreshHud();
    return showCardPlayed(it, [['ph-heart', 'Cœurs de vie', `${'❤️'.repeat(before)} → ${'❤️'.repeat(localPlayer.hearts)}`]]);
  }
  // Vieille canette, Pied de biche : on choisit le rival à viser (écran des capacités spéciales)
  if (it.eff === 'def_malus_round' || it.eff === 'crowbar') return openItemTargetPower(it);
  if (it.eff === 'patrol_reroll') {
    if (isRadioEffectActive('NETWORK_DOWN')) return showAppAlert("Panne de réseau : ton Talkie-walkie ne capte rien cette manche. Garde-le pour plus tard !", "📡 Panne de réseau");
    return openTalkie(it);
  }
  if (it.eff === 'double_fouille') return showAppAlert("Tes Lunettes de soleil serviront toutes seules à ta prochaine Fouille : tu verras 2 objets et tu garderas le meilleur.", "🕶️ Lunettes de soleil");
  if (it.eff === 'scratch') {
    localPlayer.inventory.splice(idx, 1);
    const win = Math.random() < 1 / 3, prize = it.val || 5000;
    if (win) localPlayer.pocketCash += prize;
    refreshHud();
    // La carte du ticket se fait tamponner, puis le ticket arrive en tournant depuis le bord droit
    await showCardPlayed(it, [], 'Ticket à gratter', { autoClose: 1500 });
    return openScratch(win, prize);
  }
  if (it.eff === 'cancel_police') return showAppAlert("Ton Passeport diplomatique te sera proposé automatiquement au prochain contrôle de police.", "🛂 Passeport diplomatique");
  if (it.eff === 'none') return showAppAlert(/trognon/i.test(it.name || '') ? "Un trognon de pomme… Ça ne sert à rien, mais faut pas gâcher !" : `${it.name} : ça ne sert à rien…`, `${itemEmoji(it)} ${it.name}`);
  if (it.eff === 'free_prostitute') return showAppAlert("Ton Manteau de fourrure sera utilisé tout seul au Nightclub : ta prochaine Prostituée Niv. 1 est gratuite.", "🧥 Manteau de fourrure");
  // Seringue de botox : le joueur l'injecte ; la prochaine rente versée par ses prostituées au QG sera doublée
  if (it.eff === 'botox') {
    if (localPlayer.botoxActive) return showAppAlert("Une injection est déjà en cours : la prochaine rente de tes prostituées sera déjà doublée.", "💉 Seringue de botox");
    localPlayer.inventory.splice(idx, 1);
    localPlayer.botoxActive = true;
    refreshHud();
    return showCardPlayed(it, [['ph-high-heel', 'Prochaine rente de tes prostituées', '×2'], ['ph-clock', 'Quand ?', 'prochaine manche']]);
  }
  if (it.eff === 'pm_turn') {
    localPlayer.inventory.splice(idx, 1);
    const pm = isRadioEffectActive('BASKETS_PM_SET') ? getRadioEffectValue('BASKETS_PM_SET', 5) : (it.val || 3);
    pmBonusThisTurn += pm;
    refreshHud();
    return showCardPlayed(it, [['ph-sneaker-move', 'Jusqu’à la fin du tour', `+${pm} PM`]].concat(pm !== (it.val || 3) ? [['ph-train', 'Grève des transports', 'bonus radio']] : []));
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
const escortRent = pr => pr.revenue || prostituteRent(pr.level || 1);
const QG_ESCORT_SLOTS = 5; // emplacements d'escorts au QG
const escortImg = pr => pr.level === 2 ? 'plvl2.jpg' : 'plvl1.jpg';
// Le coffre ne s'ouvre qu'en flashant le QR de la case QG du plateau
async function qgOnlyHint() {
  await showAppAlert("Le coffre s'ouvre au QG : rends-toi sur la case QG du plateau et flashe son QR code.", "🏦 Coffre du QG");
}
async function openTransferModal(mode, res) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  currentTransferMode = mode === 'withdraw' ? 'withdraw' : 'deposit';
  currentTransferResource = res || (['escort', 'lab'].includes(currentTransferResource) ? 'cash' : currentTransferResource || 'cash');
  if (oneWayRes(currentTransferResource)) currentTransferMode = 'deposit';
  document.getElementById('qgRound').innerText = currentSession.round || 1;
  document.getElementById('modalTransfer').classList.remove('hidden');
  transferAmount = 0;
  updateTransferUI();
}
// Escort et matériel de labo : aller simple vers le QG
const oneWayRes = res => res === 'escort' || res === 'lab' || res === 'def';
// Défense du QG : achetée au QG, gardée toute la partie ; une attaque de QG doit la dépasser
const QG_DEF_PRICE = 2000;
function switchTransferResource(res) {
  currentTransferResource = res;
  if (oneWayRes(res)) currentTransferMode = 'deposit';
  transferAmount = 0;
  updateTransferUI();
}
function toggleTransferDirection() {
  if (oneWayRes(currentTransferResource)) return; // aller simple
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
  document.getElementById('qgAmountBox').classList.toggle('hidden', oneWayRes(res));
  document.getElementById('qgEscortBox').classList.toggle('hidden', res !== 'escort');
  document.getElementById('qgLabBox').classList.toggle('hidden', res !== 'lab');
  document.getElementById('qgDefBox').classList.toggle('hidden', res !== 'def');
  document.getElementById('qgArrowHint').innerText = oneWayRes(res) ? 'aller simple' : 'toucher pour inverser';
  document.getElementById('qgArrowLabel').innerText = res === 'def' ? 'Renforcer' : oneWayRes(res) ? 'Installer' : (dep ? 'Déposer' : 'Retirer');

  // Onglet Labo : l'illustration du labo (celui qui arrive, sinon celui installé) passe en fond
  const gearLab = labLevelInfo(localPlayer.labGearInTransit), curLab = labLevelInfo(localPlayer.labLevel || 0);
  const scene = document.getElementById('qgSceneImg');
  const sceneSrc = res === 'lab' ? (gearLab || curLab || LAB_LEVELS[0]).img : 'grossiste-hall.webp';
  if (scene.getAttribute('src') !== sceneSrc) scene.src = sceneSrc;
  if (res === 'lab') {
    const gear = gearLab, cur = curLab;
    meIll.innerHTML = gear ? labArt(gear, 'qg-portrait', true) : '<div class="qg-empty"><i class="ph-bold ph-package"></i></div>';
    document.getElementById('qgMeVal').innerText = gear ? gear.nom : 'rien';
    document.getElementById('qgMeAfter').innerText = gear ? '→ rien' : '';
    document.getElementById('qgSafeVal').innerText = cur ? cur.nom : 'pas de labo';
    document.getElementById('qgSafeAfter').innerText = gear ? `→ ${gear.kg} kg/manche` : (cur ? `${cur.kg} kg/manche` : '');
    // Les 3 niveaux du labo : installés, celui qui arrive en pointillés, à venir
    const slots = LAB_LEVELS.map(l => l.lvl <= (localPlayer.labLevel || 0) ? `<div class="qg-slot on">${labArt(l)}<b>${l.nom}</b></div>`
      : gear && l.lvl <= gear.lvl ? `<div class="qg-slot next">${labArt(l)}<b>+</b></div>`
      : `<div class="qg-slot locked">${labArt(l)}<b>${l.nom}</b></div>`).join('');
    document.getElementById('qgLabBox').innerHTML = `<div class="qg-escort-head">${gear
      ? `<b>${labCultureLabel(gear)}</b><span>+${gear.kg} kg / manche au coffre</span>`
      : cur && cur.lvl === LAB_LEVELS.length ? `<b>Labo au maximum</b><span>+${cur.kg} kg / manche au coffre</span>`
      : '<b>Aucun matériel sur toi</b><span>Achète-le au Dépôt-Vente</span>'}</div>
      <div class="qg-slots">${slots}</div><div class="qg-slots-cap">Production : ${cur ? cur.kg : 0} kg par manche</div>`;
    document.getElementById('qgHeadline').innerHTML = 'ÇA POUSSE.';
    hint.innerHTML = '<i class="ph-fill ph-flask"></i> Le labo dépose sa production au coffre au début de chaque manche';
    cta.innerText = 'Installer au QG';
    cta.disabled = !gear;
    return;
  }

  if (res === 'def') {
    const d = localPlayer.qgDef || 0, funds = localPlayer.pocketCash + localPlayer.safeCash;
    meIll.innerHTML = '<img src="pay-cash.webp" alt="Portefeuille">';
    document.getElementById('qgMeVal').innerText = `${QG_DEF_PRICE.toLocaleString()} €`;
    document.getElementById('qgMeAfter').innerText = 'par point';
    document.getElementById('qgSafeVal').innerText = `${d} Déf`;
    document.getElementById('qgSafeAfter').innerText = `→ ${d + 1} Déf`;
    document.getElementById('qgDefBox').innerHTML = `<div class="qg-escort-head"><b>Défense du QG : ${d}</b><span>+1 point pour ${QG_DEF_PRICE.toLocaleString()} €</span></div>
      <div class="qg-slots-cap">Pour forcer ton QG, l'Attaque des assaillants doit dépasser cette Défense. Elle reste toute la partie.</div>`;
    document.getElementById('qgHeadline').innerHTML = 'BARRICADÉ.';
    hint.innerHTML = '<i class="ph-fill ph-shield-check"></i> Payé avec ton cash ou ta CB (coffre)';
    cta.innerText = funds < QG_DEF_PRICE ? 'Pas assez d’argent' : `Renforcer : ${QG_DEF_PRICE.toLocaleString()} €`;
    cta.disabled = funds < QG_DEF_PRICE;
    return;
  }
  if (res === 'escort') {
    const pr = localPlayer.prostituteInTransit;
    const list = localPlayer.prostitutesAtSafeList || [];
    const rent = list.reduce((acc, p) => acc + escortRent(p), 0);
    meIll.innerHTML = pr ? `<img src="${pr.level === 2 ? 'plvl2.jpg' : 'plvl1.jpg'}" alt="" class="qg-portrait">` : '<div class="qg-empty"><i class="ph-bold ph-user"></i></div>';
    document.getElementById('qgMeVal').innerText = pr ? `L${pr.level || 1}` : 'personne';
    document.getElementById('qgMeAfter').innerText = pr ? '→ personne' : '';
    document.getElementById('qgSafeVal').innerText = `${list.length} escort${list.length > 1 ? 's' : ''}`;
    // Escort sur toi en une ligne, puis les 5 emplacements du QG : celles déjà installées, et la place qu'elle prendrait
    const full = list.length >= QG_ESCORT_SLOTS;
    document.getElementById('qgSafeAfter').innerText = pr && !full ? `→ ${(rent + escortRent(pr)).toLocaleString()} €/manche` : `${rent.toLocaleString()} €/manche`;
    const slots = Array.from({ length: QG_ESCORT_SLOTS }, (_, i) => {
      const p = list[i];
      if (p) return `<div class="qg-slot on"><img src="${escortImg(p)}" alt=""><b>L${p.level || 1}</b></div>`;
      if (pr && i === list.length) return `<div class="qg-slot next"><img src="${escortImg(pr)}" alt=""><b>+</b></div>`;
      return `<div class="qg-slot"><span>${i + 1}</span></div>`;
    }).join('');
    document.getElementById('qgEscortBox').innerHTML = `<div class="qg-escort-head">${pr
      ? `<b>${escapeHtml(pr.name || `Prostituée L${pr.level || 1}`)}</b><span>+${escortRent(pr).toLocaleString()} € / manche</span>`
      : '<b>Aucune escort sur toi</b><span>Recrute-en une au Nightclub</span>'}</div>
      <div class="qg-slots">${slots}</div><div class="qg-slots-cap">${list.length} / ${QG_ESCORT_SLOTS} emplacements au QG</div>`;
    document.getElementById('qgHeadline').innerHTML = 'AU CHAUD.';
    hint.innerHTML = full && pr ? '<i class="ph-fill ph-warning"></i> QG complet : 5 escorts au maximum' : '<i class="ph-fill ph-shield-check"></i> Au QG, elle rapporte sa rente à chaque manche et ne peut plus être rackettée';
    cta.innerText = full && pr ? 'QG complet' : 'Installer au QG';
    cta.disabled = !pr || full;
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
  if (res === 'def') {
    if (localPlayer.pocketCash + localPlayer.safeCash < QG_DEF_PRICE) return;
    closeModal('modalTransfer');
    return openPaymentChoiceModal({ type: 'qgdef', cost: QG_DEF_PRICE, name: 'Défense du QG +1', shop: 'QG' });
  }
  if (res === 'escort') {
    if (!localPlayer.prostituteInTransit || localPlayer.prostitutesAtSafeList.length >= QG_ESCORT_SLOTS) return;
    playTransferFly('💃', true);
    localPlayer.prostitutesAtSafeList.push(localPlayer.prostituteInTransit);
    localPlayer.prostituteInTransit = null;
  } else if (res === 'lab') {
    if (!localPlayer.labGearInTransit) return;
    playTransferFly('🧪', true);
    localPlayer.labLevel = localPlayer.labGearInTransit;
    localPlayer.labGearInTransit = null;
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
