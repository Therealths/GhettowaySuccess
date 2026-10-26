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

  statusEl.innerText = "Initialisation caméra...";
  try {
    if (!html5QrScannerInstance) {
      html5QrScannerInstance = new Html5Qrcode("qr-reader");
    } else if (html5QrScannerInstance.isScanning) {
      await html5QrScannerInstance.stop();
    }
    await html5QrScannerInstance.start(
      { facingMode: "environment" },
      {
        fps: 15,
        aspectRatio: 1.0,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.floor(minEdge * 0.78);
          return { width: boxSize, height: boxSize };
        }
      },
      (txt) => {
        processQrPayload(txt);
        closeQrScannerModal();
      },
      () => {}
    );
    statusEl.innerText = "Placez le QR Code au centre du carré...";
  } catch (e) {
    statusEl.innerText = "Caméra indisponible (utilisez Choisir Photo QR).";
  }
}

async function openQrScannerModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas votre tour !", "Tour Inactif");
  document.getElementById('modalQrScanner').classList.remove('hidden');
  await startLiveQrCamera();
}

async function closeQrScannerModal() {
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
  statusEl.innerText = "Analyse de la photo en cours...";

  try {
    if (!html5QrScannerInstance) {
      html5QrScannerInstance = new Html5Qrcode("qr-reader");
    }
    const decodedText = await html5QrScannerInstance.scanFile(file, false);
    statusEl.innerText = "✅ QR Code détecté sur la photo !";
    setTimeout(() => {
      processQrPayload(decodedText);
      closeQrScannerModal();
    }, 350);
  } catch (err) {
    statusEl.innerText = "❌ Aucun QR Code détecté sur cette photo.";
    await showAppAlert(
      "Impossible de lire un QR Code sur cette photo.\nVous pouvez cliquer sur « Annuler Photo / Caméra » ou choisir une autre image.",
      "QR Code Illisible"
    );
  } finally {
    input.value = '';
  }
}

async function cancelSelectedQrPhoto() {
  await startLiveQrCamera();
}

function openLootDiscoveryModal(title, desc, iconHtml, buttonText, onClaim) {
  document.getElementById('lootDiscoveryTitle').innerText = title;
  document.getElementById('lootDiscoveryDesc').innerText = desc;
  document.getElementById('lootDiscoveryIcon').innerHTML = iconHtml;
  const btn = document.getElementById('btnLootAction');
  btn.innerText = buttonText;
  btn.onclick = () => { closeModal('modalLootDiscovery'); onClaim(); };
  document.getElementById('modalLootDiscovery').classList.remove('hidden');
}

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

  if (type === 'armurerie') return openArmoryShopModal();
  if (type === 'nightclub') return openNightclubShopModal();
  if (type === 'sportclub') return openSportclubShopModal();
  if (type === 'concessionnaire' || type === 'dealer') return openDealerShopModal();

  if (type === 'grossiste') return openGrossisteModal(data.p || 1000);

  if (type === 'obj') {
    if (data.eff === 'cash') {
      const v = data.val || 1000;
      return openLootDiscoveryModal(data.n || "Cash", `+${v.toLocaleString()} €`, '<i class="ph-bold ph-coins text-emerald-300"></i>', "Récupérer", async () => { localPlayer.pocketCash += v; refreshHud(); });
    }
    if (data.eff === 'drug') {
      const v = data.val || 1;
      return openLootDiscoveryModal(data.n || "Drogue", `+${v} kg`, '<i class="ph-bold ph-plant text-emerald-400"></i>', "Récupérer", async () => { localPlayer.drugs += v; refreshHud(); });
    }
    return openLootDiscoveryModal(data.n || "Objet", data.desc || "Objet spécial", '<i class="ph-bold ph-backpack text-ghetto-gold"></i>', "Ajouter au sac", async () => {
      localPlayer.inventory.push({ id: 'obj_' + Date.now(), type: 'ITEM_CARD', name: data.n, eff: data.eff, val: data.val || 0, dur: data.dur || 'instant', desc: data.desc || "Objet" });
      refreshHud();
    });
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
    if (localPlayer.pocketCash + localPlayer.safeCash < cost) return showAppAlert("Fonds totaux insuffisants !", "Achat Impossible");
    return openPaymentChoiceModal({ type, data, cost, name: itemName });
  }

  if (type === 'yen') {
    if (localPlayer.drugs < data.d) return showAppAlert(`Drogue insuffisante (${data.d} kg requis).`, "Deal Refusé");
    const radioBonus = isRadioEffectActive('YENCLI_CASH_BONUS') ? getRadioEffectValue('YENCLI_CASH_BONUS', 1500) : 0;
    const totalGain = (data.c || 0) + radioBonus;
    localPlayer.drugs -= data.d;
    localPlayer.pocketCash += totalGain;
    const bonusTxt = radioBonus > 0 ? ` (dont +${radioBonus.toLocaleString()} € Bonus Radio !)` : '';
    await showAppAlert(`+${totalGain.toLocaleString()} € en poche !${bonusTxt}`, "🤝 Deal Yencli");
    refreshHud();
    return;
  }

  // BRAQUAGE (Choix entre Braquage Coordonné en Alliance ou Braquage Solo)
  if (type === 'brq') {
    let coordinateWithAlly = false;
    if (localPlayer.allianceActive && localPlayer.activeAlly) {
      coordinateWithAlly = await showAppConfirm(
        `Vous êtes en Alliance avec ${localPlayer.activeAlly.caid}.\n\nComment voulez-vous faire ce braquage ?\n\n• SOLO : vous tentez le braquage seul.\n• EN ALLIANCE : braquage coordonné à 2 (tous les deux sur la case : forces cumulées & butin partagé).`,
        "💥 Solo ou en Alliance ?",
        "🤝 En Alliance",
        "Solo"
      );
    }

    const allyAtk = coordinateWithAlly ? (localPlayer.activeAlly.allyAtk || 1) : 0;
    const allyMuscles = coordinateWithAlly ? (localPlayer.activeAlly.grosBrasCount || 0) : 0;
    const teamAtk = getTotalAtk() + allyAtk;
    const members = 1 + localPlayer.musclesOnPerson.length + (coordinateWithAlly ? (1 + allyMuscles) : 0);

    if (teamAtk < data.req || members < data.m) {
      return showAppAlert(
        `Prérequis insuffisants (${coordinateWithAlly ? 'en Duo' : 'en Solo'}) !\nRequis : ${data.req} Atk et ${data.m} membre(s).\nVotre force : ${teamAtk} Atk et ${members} membre(s).`,
        "💥 Échec Braquage"
      );
    }

    const radioHeistBonus = isRadioEffectActive('HEIST_CASH_BONUS') ? getRadioEffectValue('HEIST_CASH_BONUS', 2000) : 0;
    const totalCash = (data.c || 0) + radioHeistBonus;
    const totalDrugs = data.d || 0;

    if (coordinateWithAlly && socket) {
      socket.emit('initiate_allied_heist_split', {
        heistName: data.n || 'Braquage',
        totalCash,
        totalDrugs,
        allyToken: localPlayer.activeAlly.allyToken
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
