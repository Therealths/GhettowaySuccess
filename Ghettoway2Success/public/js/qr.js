// Scanner QR et actions des cases (braquages, missions...)

// =========================================================================
// SCANNER QR CORRIGÉ
// =========================================================================
async function startLiveQrCamera() {
  const statusEl = document.getElementById('qrScannerStatus');
  const previewBox = document.getElementById('qr-photo-preview-box');
  const cancelBtn = document.getElementById('btnCancelQrPhoto');
  const fileInput = document.getElementById('qrFileInput');

  if (previewBox) previewBox.classList.add('hidden');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (fileInput) fileInput.value = '';
  if (currentQrPhotoObjectUrl) {
    URL.revokeObjectURL(currentQrPhotoObjectUrl);
    currentQrPhotoObjectUrl = null;
  }

  if (typeof Html5Qrcode === 'undefined') {
    statusEl.innerText = "Librairie QR non disponible.";
    return;
  }

  statusEl.innerText = 'Démarrage de la caméra…';
  try {
    if (!html5QrScannerInstance) {
      html5QrScannerInstance = new Html5Qrcode("qr-reader");
    } else if (html5QrScannerInstance.isScanning) {
      await html5QrScannerInstance.stop();
    }
    await html5QrScannerInstance.start(
      { facingMode: "environment" },
      {
        // Caméra plein écran : toute l'image est lue (le cadre de visée n'est qu'un repère)
        fps: 15
      },
      (txt) => onQrDetected(txt),
      () => {}
    );
    statusEl.innerText = 'Vise le QR code d’une case du plateau';
    setupQrTorch();
  } catch (e) {
    document.getElementById('modalQrScanner').dataset.state = 'nocam';
    statusEl.innerText = 'Caméra indisponible : autorise-la dans ton navigateur, ou utilise « Photo ».';
  }
}

// QR reconnu : cadre vert, vibration, bandeau de ce qui a été flashé, puis on ouvre la case
const QR_LABELS = { qg: 'COFFRE DU QG', coffre: 'COFFRE DU QG', armurerie: 'ARMURERIE', nightclub: 'NIGHTCLUB', sportclub: 'SPORTCLUB', concessionnaire: 'CONCESSIONNAIRE', dealer: 'CONCESSIONNAIRE', grossiste: 'GROSSISTE', obj: 'OBJET TROUVÉ', brq: 'BRAQUAGE', yen: 'DEAL YENCLI', gb: 'LASCAR', pr: 'NIGHTCLUB', eq: 'ÉQUIPEMENT' };
// Fond de la case à précharger pendant le bandeau, pour qu'elle s'affiche d'un coup
const QR_PRELOAD = { qg: 'qg-coffre.webp', coffre: 'qg-coffre.webp', armurerie: 'wp_armurerie.jpg', nightclub: 'wp_club.jpg', pr: 'wp_club.jpg', sportclub: 'wp_sport.jpg', gb: 'wp_sport.jpg', concessionnaire: 'wp_concessionnaire.jpg', dealer: 'wp_concessionnaire.jpg', grossiste: 'grossiste-hall.webp', brq: 'sac-butin.webp' };
function qrType(txt) {
  let data;
  try { data = JSON.parse(String(txt).trim().replace(/[\u201C\u201D]/g, '"')); } catch (e) { data = { t: String(txt).trim() }; }
  if (typeof data === 'string') data = { t: data };
  return { data, type: String((data && (data.t || data.type)) || '').toLowerCase() };
}
function preloadQrTarget(txt) {
  const src = QR_PRELOAD[qrType(txt).type];
  if (!src) return;
  const img = new Image();
  img.src = src;
  if (img.decode) img.decode().catch(() => {});
}
function qrLabel(txt) {
  const { data, type } = qrType(txt);
  const base = QR_LABELS[type] || 'QR CODE LU';
  return type === 'brq' && data.n ? `${base} : ${String(data.n).toUpperCase()}` : base;
}
let qrDetectedLock = false;
function onQrDetected(txt) {
  if (qrDetectedLock) return;
  qrDetectedLock = true;
  const scr = document.getElementById('modalQrScanner');
  scr.dataset.state = 'ok';
  document.getElementById('scanTape').innerText = qrLabel(txt);
  preloadQrTarget(txt);
  document.getElementById('qrScannerStatus').innerText = 'QR code reconnu !';
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  setTimeout(() => { qrDetectedLock = false; processQrPayload(txt); }, 650);
}

// Lampe du téléphone, seulement si la caméra la propose
let qrTorchOn = false;
function setupQrTorch() {
  const btn = document.getElementById('btnQrTorch');
  qrTorchOn = false;
  btn.classList.remove('on');
  let caps = {};
  try { caps = html5QrScannerInstance.getRunningTrackCapabilities() || {}; } catch (e) {}
  btn.disabled = !caps.torch;
}
async function toggleQrTorch() {
  if (!html5QrScannerInstance) return;
  try {
    await html5QrScannerInstance.applyVideoConstraints({ advanced: [{ torch: !qrTorchOn }] });
    qrTorchOn = !qrTorchOn;
    document.getElementById('btnQrTorch').classList.toggle('on', qrTorchOn);
  } catch (e) {}
}

async function openQrScannerModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  const scr = document.getElementById('modalQrScanner');
  scr.dataset.state = 'scan';
  qrDetectedLock = false;
  document.getElementById('scanRound').innerText = currentSession.round || 1;
  scr.classList.remove('hidden');
  applyQrTestMode();
  await startLiveQrCamera();
}

// Boutons de test cachés : 5 appuis rapides sur le titre « Scanner Tactique » les affichent (ou les recachent)
let scannerTitleTaps = [];
function applyQrTestMode() {
  document.getElementById('qrTestButtons').classList.toggle('hidden', localStorage.getItem('g2s_test_mode') !== '1');
}
function tapScannerTitle() {
  const now = Date.now();
  scannerTitleTaps = scannerTitleTaps.filter(t => now - t < 2500).concat(now);
  if (scannerTitleTaps.length < 5) return;
  scannerTitleTaps = [];
  const on = localStorage.getItem('g2s_test_mode') !== '1';
  localStorage.setItem('g2s_test_mode', on ? '1' : '0');
  applyQrTestMode();
  if (navigator.vibrate) navigator.vibrate(on ? [40, 60, 40] : 80);
}

async function closeQrScannerModal() {
  qrTorchOn = false;
  if (html5QrScannerInstance && html5QrScannerInstance.isScanning) {
    try { await html5QrScannerInstance.stop(); } catch (e) {}
  }
  try { if (html5QrScannerInstance) html5QrScannerInstance.clear(); } catch (e) {}
  if (currentQrPhotoObjectUrl) {
    URL.revokeObjectURL(currentQrPhotoObjectUrl);
    currentQrPhotoObjectUrl = null;
  }
  const previewBox = document.getElementById('qr-photo-preview-box');
  const cancelBtn = document.getElementById('btnCancelQrPhoto');
  const fileInput = document.getElementById('qrFileInput');
  if (previewBox) previewBox.classList.add('hidden');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (fileInput) fileInput.value = '';
  closeModal('modalQrScanner');
}

async function scanFromImageFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const statusEl = document.getElementById('qrScannerStatus');
  const previewBox = document.getElementById('qr-photo-preview-box');
  const previewImg = document.getElementById('qr-photo-preview-img');
  const cancelBtn = document.getElementById('btnCancelQrPhoto');

  if (html5QrScannerInstance && html5QrScannerInstance.isScanning) {
    try { await html5QrScannerInstance.stop(); } catch (e) {}
  }

  if (currentQrPhotoObjectUrl) URL.revokeObjectURL(currentQrPhotoObjectUrl);
  currentQrPhotoObjectUrl = URL.createObjectURL(file);
  previewImg.src = currentQrPhotoObjectUrl;
  previewBox.classList.remove('hidden');
  cancelBtn.classList.remove('hidden');
  statusEl.innerText = 'Analyse de la photo…';

  try {
    if (!html5QrScannerInstance) {
      html5QrScannerInstance = new Html5Qrcode("qr-reader");
    }
    const decodedText = await html5QrScannerInstance.scanFile(file, false);
    onQrDetected(decodedText);
  } catch (err) {
    statusEl.innerText = 'Aucun QR code trouvé sur cette photo.';
    await showAppAlert(
      "Impossible de lire un QR Code sur cette photo.\nTu peux revenir à la caméra ou choisir une autre image.",
      "QR Code Illisible"
    );
  } finally {
    input.value = '';
  }
}

async function cancelSelectedQrPhoto() {
  await startLiveQrCamera();
}

// Découverte d'objet : voir js/items.js

async function processQrPayload(payload) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  closeQrScannerModal();
  let data = payload;
  if (typeof payload === 'string') {
    const cleanStr = payload.trim().replace(/[\u201C\u201D]/g, '"');
    try {
      data = JSON.parse(cleanStr);
      if (typeof data === 'string') data = { t: data.toLowerCase() };
    } catch(e) {
      data = { t: cleanStr.toLowerCase() };
    }
  }
  if (!data || typeof data !== 'object') return showAppAlert("QR Code non reconnu.", "Erreur");
  const type = (data.t || data.type || '').toLowerCase();

  // Case QG du plateau : seule façon d'ouvrir le coffre (dépôt, retrait, escort)
  if (type === 'qg' || type === 'coffre') return openTransferModal('deposit');
  if (type === 'armurerie') return openArmoryShopModal();
  if (type === 'nightclub') return openNightclubShopModal();
  if (type === 'sportclub') return openSportclubShopModal();
  if (type === 'concessionnaire' || type === 'dealer') return openDealerShopModal();

  if (type === 'grossiste') return openGrossisteModal(data.p || 1000);
  // Case Fouilles : objet tiré au hasard
  if (type === 'fouilles' || type === 'fouille') return openFouille();

  if (type === 'obj') {
    if (data.eff === 'cash') {
      const v = data.val || 1000;
      return openLootDiscoveryModal({ name: data.n || 'Cash', eff: 'cash', val: v, desc: `+${v.toLocaleString()} €` }, "Récupérer", () => { localPlayer.pocketCash += v; spendActionPm(); });
    }
    if (data.eff === 'drug') {
      const v = data.val || 1;
      return openLootDiscoveryModal({ name: data.n || 'Drogue', eff: 'drug', val: v, desc: `+${v} kg` }, "Récupérer", () => { localPlayer.drugs += v; spendActionPm(); });
    }
    const it = { id: 'obj_' + Date.now(), type: 'ITEM_CARD', name: data.n || 'Objet', eff: data.eff || 'none', val: data.val || 0, dur: data.dur || 'instant', desc: data.desc || "Objet" };
    return openLootDiscoveryModal(it, "Ajouter au sac", () => { localPlayer.inventory.push(it); spendActionPm(); });
  }

  if (type === 'eq' || type === 'gb' || type === 'pr') {
    let cost = data.p || (type === 'gb' ? (data.lvl === 2 ? 3000 : 1500) : (data.lvl === 2 ? 4000 : 2000));
    let itemName = data.n || (type === 'gb' ? `Lascar L${data.lvl||1}` : `Prostituée L${data.lvl||1}`);
    if (type === 'gb' && localPlayer.musclesOnPerson.length >= 3) return showAppAlert("3 Lascars maximum sur le terrain !", "Limite Atteinte");
    if (type === 'pr' && localPlayer.prostituteInTransit) return showAppAlert("Déjà 1 prostituée en transit !", "Limite Atteinte");
    if (type === 'pr' && getMyCaid().id === 'caid_4' && !localPlayer.freeProstituteClaimed && data.lvl === 1) {
      localPlayer.freeProstituteClaimed = true;
      await finalizePurchaseExecution({ type, data, cost: 0, name: itemName });
      refreshHud();
      return;
    }
    if (localPlayer.pocketCash + localPlayer.safeCash < cost) return showBrokeScreen(cost, itemName);
    return openPaymentChoiceModal({ type, data, cost, name: itemName });
  }

  if (type === 'yen') {
    if (localPlayer.drugs < data.d) return showAppAlert(`Drogue insuffisante (${data.d} kg requis).`, "Deal Refusé");
    const radioBonus = isRadioEffectActive('YENCLI_CASH_BONUS') ? getRadioEffectValue('YENCLI_CASH_BONUS', 1500) : 0;
    const totalGain = (data.c || 0) + radioBonus;
    localPlayer.drugs -= data.d;
    localPlayer.pocketCash += totalGain;
    spendActionPm();
    const bonusTxt = radioBonus > 0 ? ` (dont +${radioBonus.toLocaleString()} € Bonus Radio !)` : '';
    await showAppAlert(`+${totalGain.toLocaleString()} € en poche !${bonusTxt}`, "🤝 Deal Yencli");
    refreshHud();
    return;
  }

  // BRAQUAGE (Choix entre Braquage Coordonné en Alliance ou Braquage Solo)
  if (type === 'brq') {
    let coordinateWithAlly = false;
    const heistAllies = localPlayer.activeAllies || [];
    const n = heistAllies.length + 1;
    if (localPlayer.allianceActive && heistAllies.length) {
      coordinateWithAlly = await showAppConfirm(
        `Vous êtes en Alliance avec ${formatAllyNames(heistAllies)}.\n\nComment voulez-vous faire ce braquage ?\n\n• SOLO : vous tentez le braquage seul.\n• EN ALLIANCE : braquage coordonné à ${n} (${n === 2 ? 'tous les deux' : 'tous'} sur la case : forces cumulées & butin partagé).`,
        "💥 Solo ou en Alliance ?",
        "🤝 En Alliance",
        "Solo"
      );
    }

    // Forces cumulées de tous les alliés : attaque + gros bras + l'allié lui-même
    const allyAtk = coordinateWithAlly ? heistAllies.reduce((t, a) => t + (a.allyAtk || 1), 0) : 0;
    const allyMembers = coordinateWithAlly ? heistAllies.reduce((t, a) => t + 1 + (a.grosBrasCount || 0), 0) : 0;
    const teamAtk = getTotalAtk() + allyAtk;
    const members = 1 + localPlayer.musclesOnPerson.length + allyMembers;

    if (teamAtk < data.req || members < data.m) {
      return showAppAlert(
        `Prérequis insuffisants (${coordinateWithAlly ? (n === 2 ? 'en Duo' : `à ${n}`) : 'en Solo'}) !\nRequis : ${data.req} Atk et ${data.m} membre(s).\nVotre force : ${teamAtk} Atk et ${members} membre(s).`,
        "💥 Échec Braquage"
      );
    }

    const radioHeistBonus = isRadioEffectActive('HEIST_CASH_BONUS') ? getRadioEffectValue('HEIST_CASH_BONUS', 2000) : 0;
    const totalCash = (data.c || 0) + radioHeistBonus;
    const totalDrugs = data.d || 0;
    spendActionPm();

    if (coordinateWithAlly && socket) {
      socket.emit('initiate_allied_heist_split', {
        heistName: data.n || 'Braquage',
        totalCash,
        totalDrugs,
        allyTokens: heistAllies.map(a => a.allyToken)
      });
    } else {
      localPlayer.pocketCash += totalCash;
      localPlayer.drugs += totalDrugs;
      const bonusTxt = radioHeistBonus > 0 ? ` (dont +${radioHeistBonus.toLocaleString()} € Bonus Radio !)` : '';
      await showAppAlert(`+${totalCash.toLocaleString()} € et +${totalDrugs} kg gagnés en solo !${bonusTxt}`, "🏆 Braquage Réussi");
      refreshHud();
    }
    return;
  }
}
