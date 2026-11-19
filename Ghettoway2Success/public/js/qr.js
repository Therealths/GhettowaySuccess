// Scanner QR et actions des cases (braquages, missions...)

// =========================================================================
// SCANNER QR CORRIGÉ
// =========================================================================
// Objectifs arrière du téléphone : par défaut le navigateur prend parfois le grand-angle, souvent sans autofocus.
// On prend l'objectif principal (ou celui choisi avec le bouton « Caméra », retenu sur le téléphone)
const QR_CAM_KEY = 'g2s_qr_cam';
let qrBackCams = [], qrCamId = null;
async function pickBackCamera() {
  let cams = [];
  try { cams = await Html5Qrcode.getCameras(); } catch (e) { return null; }
  const back = cams.filter(c => /back|rear|arri[eè]re|environment/i.test(c.label || ''));
  qrBackCams = back.length ? back : cams;
  let saved = null;
  try { saved = localStorage.getItem(QR_CAM_KEY); } catch (e) {}
  if (saved && qrBackCams.some(c => c.id === saved)) return saved;
  const main = qrBackCams.find(c => /camera2 0\b|camera 0\b/i.test(c.label))
    || qrBackCams.find(c => !/ultra|wide|grand|tele|depth|macro|0[.,]5/i.test(c.label))
    || qrBackCams[0];
  return main ? main.id : null;
}
async function switchQrCamera() {
  if (qrBackCams.length < 2) return;
  const i = qrBackCams.findIndex(c => c.id === qrCamId);
  qrCamId = qrBackCams[(i + 1) % qrBackCams.length].id;
  try { localStorage.setItem(QR_CAM_KEY, qrCamId); } catch (e) {}
  await startLiveQrCamera();
  const n = qrBackCams.findIndex(c => c.id === qrCamId) + 1;
  document.getElementById('qrScannerStatus').innerText = `Caméra ${n} / ${qrBackCams.length} : vise le QR code`;
}
// Lecteur de QR du téléphone quand il existe (plus rapide, tolère mieux une image un peu floue)
const newQrReader = () => new Html5Qrcode("qr-reader", { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
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
      html5QrScannerInstance = newQrReader();
    } else if (html5QrScannerInstance.isScanning) {
      await html5QrScannerInstance.stop();
    }
    if (!qrCamId) qrCamId = await pickBackCamera();
    const lens = qrCamId ? { deviceId: { exact: qrCamId } } : { facingMode: 'environment' };
    await html5QrScannerInstance.start(
      qrCamId || { facingMode: 'environment' },
      {
        // Caméra plein écran : toute l'image est lue (le cadre de visée n'est qu'un repère)
        fps: 15,
        // Image en haute définition : un QR un peu loin ou un peu flou reste lisible
        videoConstraints: { ...lens, width: { ideal: 1280 }, height: { ideal: 720 } }
      },
      (txt) => onQrDetected(txt),
      () => {}
    );
    statusEl.innerText = 'Vise le QR code d’une case du plateau';
    setupQrTorch();
    tuneQrCamera();
  } catch (e) {
    // L'objectif retenu n'existe plus (autre téléphone, autre navigateur) : on repart sur la caméra arrière par défaut
    if (qrCamId) { qrCamId = null; try { localStorage.removeItem(QR_CAM_KEY); } catch (er) {} return startLiveQrCamera(); }
    document.getElementById('modalQrScanner').dataset.state = 'nocam';
    statusEl.innerText = 'Caméra indisponible : autorise-la dans ton navigateur, ou utilise « Photo ».';
  }
}

// QR reconnu : cadre vert, vibration, bandeau de ce qui a été flashé, puis on ouvre la case
const QR_LABELS = { qg: 'COFFRE DU QG', coffre: 'COFFRE DU QG', armurerie: 'ARMURERIE', nightclub: 'NIGHTCLUB', sportclub: 'SPORTCLUB', concessionnaire: 'CONCESSIONNAIRE', dealer: 'CONCESSIONNAIRE', grossiste: 'GROSSISTE', obj: 'OBJET TROUVÉ', brq: 'BRAQUAGE', yen: 'DEAL YENCLI', gb: 'LASCAR', pr: 'NIGHTCLUB', eq: 'ÉQUIPEMENT', fouilles: 'FOUILLES', fouille: 'FOUILLES' };
// Fond de la case à précharger pendant le bandeau, pour qu'elle s'affiche d'un coup
// Illustrations des braquages selon le lieu (champ "n" du QR, sans majuscules ni accents) ; plusieurs images → une au hasard
const HEIST_ART = {
  kebab: ['braquage-kebab-1.webp', 'braquage-kebab-2.webp', 'braquage-kebab-3.webp', 'braquage-kebab-4.webp'],
  laposte: ['braquage-poste-1.webp', 'braquage-poste-2.webp'],
  chantier: ['braquage-chantier-1.webp', 'braquage-chantier-2.webp'],
  parc: ['braquage-parc-1.webp', 'braquage-parc-2.webp'],
  cite: ['braquage-cite-1.webp', 'braquage-cite-2.webp'],
  eglise: ['braquage-eglise-1.webp'],
  nightclub: ['braquage-nightclub-1.webp'],
  magasin: ['braquage-magasin-1.webp'],
  maison: ['braquage-maison-1.webp', 'braquage-maison-2.webp'],
  armurerie: ['braquage-armurerie-1.webp'],
  hopital: ['braquage-hopital-1.webp'],
  concession: ['braquage-concession-1.webp']
};
HEIST_ART.poste = HEIST_ART.laposte;
HEIST_ART.concessionnaire = HEIST_ART.concession;
const heistKey = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
let heistArtPicked = null; // tirée au flash (préchargement), reprise à l'ouverture de l'écran
function heistArt(name, keep) {
  const key = heistKey(name);
  if (heistArtPicked && heistArtPicked.key === key) { const src = heistArtPicked.src; if (!keep) heistArtPicked = null; return src; }
  const list = HEIST_ART[key];
  const src = list ? list[Math.floor(Math.random() * list.length)] : 'wallpaper-clean.jpg';
  heistArtPicked = keep ? { key, src } : null;
  return src;
}
const QR_PRELOAD = { qg: 'qg-coffre.webp', coffre: 'qg-coffre.webp', armurerie: 'wp_armurerie.jpg', nightclub: 'wp_club.jpg', pr: 'wp_club.jpg', sportclub: 'wp_sport.jpg', gb: 'wp_sport.jpg', concessionnaire: 'wp_concessionnaire.jpg', dealer: 'wp_concessionnaire.jpg', grossiste: 'grossiste-hall.webp', magasin: 'magasin-hall.webp', depotvente: 'magasin-hall.webp', brq: 'sac-butin.webp', fouilles: 'fouilles-ruelle.webp', fouille: 'fouilles-ruelle.webp' };
function qrType(txt) {
  let data;
  try { data = JSON.parse(String(txt).trim().replace(/[\u201C\u201D]/g, '"')); } catch (e) { data = { t: String(txt).trim() }; }
  if (typeof data === 'string') data = { t: data };
  return { data, type: String((data && (data.t || data.type)) || '').toLowerCase() };
}
function preloadQrTarget(txt) {
  const { data, type } = qrType(txt);
  const src = type === 'brq' ? heistArt(data && data.n, true) : QR_PRELOAD[type];
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
// Mise au point : continue si la caméra le permet, léger zoom (on tient le téléphone plus loin, là où l'objectif
// fait le point), et un toucher sur l'image relance la mise au point à cet endroit
let qrCaps = {};
async function tuneQrCamera() {
  qrCaps = {};
  try { qrCaps = html5QrScannerInstance.getRunningTrackCapabilities() || {}; } catch (e) {}
  const focus = qrCaps.focusMode || [];
  if (focus.includes('continuous')) await qrConstrain({ focusMode: 'continuous' });
  const z = qrCaps.zoom;
  if (z && z.max >= 1.5) await qrConstrain({ zoom: Math.max(z.min || 1, Math.min(1.6, z.max)) });
  document.getElementById('btnQrCam').disabled = qrBackCams.length < 2;
  // Mode test : objectif utilisé et ce que la caméra sait faire (pour comprendre un téléphone qui ne fait pas le point)
  const dbg = document.getElementById('qrCamDebug');
  dbg.classList.toggle('hidden', !qrTestOn());
  if (qrTestOn()) {
    let label = '?', set = {};
    try { const tr = html5QrScannerInstance.getRunningTrackSettings() || {}; set = tr; } catch (e) {}
    const cam = qrBackCams.find(c => c.id === qrCamId);
    if (cam) label = cam.label;
    dbg.innerText = `${label} · ${qrBackCams.length} objectif(s) · focus [${focus.join(', ') || 'aucun'}] → ${set.focusMode || '?'} · zoom ${z ? `${z.min}-${z.max} → ${set.zoom ?? '?'}` : 'non'} · ${set.width || '?'}×${set.height || '?'}`;
  }
}
async function qrConstrain(c) {
  try { await html5QrScannerInstance.applyVideoConstraints({ advanced: [c] }); return true; } catch (e) { return false; }
}
async function refocusQrAt(e) {
  if (!html5QrScannerInstance || !html5QrScannerInstance.isScanning) return;
  const focus = qrCaps.focusMode || [];
  if (!focus.length) return;
  const box = e.currentTarget.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
  const spot = qrCaps.pointsOfInterest ? { pointsOfInterest: [{ x, y }] } : {};
  if (focus.includes('single-shot')) await qrConstrain({ ...spot, focusMode: 'single-shot' });
  else if (focus.includes('manual') && focus.includes('continuous')) await qrConstrain({ focusMode: 'manual' });
  if (focus.includes('continuous')) setTimeout(() => qrConstrain({ ...spot, focusMode: 'continuous' }), 700);
  const st = document.getElementById('qrScannerStatus');
  st.innerText = 'Mise au point…';
  setTimeout(() => { if (st.innerText === 'Mise au point…') st.innerText = 'Vise le QR code d’une case du plateau'; }, 1200);
}
document.addEventListener('DOMContentLoaded', () => { const r = document.getElementById('qr-reader'); if (r) r.addEventListener('pointerup', refocusQrAt); });

async function toggleQrTorch() {
  if (!html5QrScannerInstance) return;
  try {
    await html5QrScannerInstance.applyVideoConstraints({ advanced: [{ torch: !qrTorchOn }] });
    qrTorchOn = !qrTorchOn;
    document.getElementById('btnQrTorch').classList.toggle('on', qrTorchOn);
  } catch (e) {}
}

async function openQrScannerModal() {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
  const scr = document.getElementById('modalQrScanner');
  scr.dataset.state = 'scan';
  qrDetectedLock = false;
  document.getElementById('scanRound').innerText = currentSession.round || 1;
  setSheet(scr, true);
  scr.classList.remove('hidden');
  // La page se déploie en cercle depuis le bouton rond du scanner
  const btn = document.querySelector('.hud-scan'), b = btn && btn.getBoundingClientRect(), s = scr.getBoundingClientRect();
  if (b && b.width) {
    const cx = b.left + b.width / 2 - s.left, cy = b.top + b.height / 2 - s.top;
    scr.style.setProperty('--cx', `${Math.round(cx)}px`);
    scr.style.setProperty('--cy', `${Math.round(cy)}px`);
    scr.style.setProperty('--cr', `${Math.ceil(Math.hypot(Math.max(cx, s.width - cx), Math.max(cy, s.height - cy)))}px`);
  }
  applyQrTestMode();
  await startLiveQrCamera();
  placeScanFrame();
}

// Raccourcis de test (faux QR codes), cachés aux joueurs : 5 appuis rapides sur le titre « Flash un QR code »
// (ou sur l'étiquette « Scanner ») les affichent ou les recachent ; le choix est retenu sur le téléphone
const qrTestOn = () => { try { return localStorage.getItem('g2s_test_mode') === '1'; } catch (e) { return false; } };
function applyQrTestMode() {
  document.getElementById('qrTestButtons').classList.toggle('hidden', !qrTestOn());
  placeScanFrame();
}
let scannerTitleTaps = [];
function tapScannerTitle() {
  const now = Date.now();
  scannerTitleTaps = scannerTitleTaps.filter(t => now - t < 2500).concat(now);
  if (scannerTitleTaps.length < 5) return;
  scannerTitleTaps = [];
  const on = !qrTestOn();
  try { localStorage.setItem('g2s_test_mode', on ? '1' : '0'); } catch (e) {}
  applyQrTestMode();
  buzz(on ? [40, 60, 40] : 80);
}
// Le cadre à flasher prend toute la place libre entre le haut de l'écran et le panneau du bas (toujours entier)
function placeScanFrame() {
  const scr = document.getElementById('modalQrScanner');
  if (!scr || scr.classList.contains('hidden')) return;
  const box = scr.getBoundingClientRect();
  const top = document.getElementById('scanTop').getBoundingClientRect().bottom - box.top + 14;
  const bottom = document.getElementById('scanPanel').getBoundingClientRect().top - box.top - 14;
  const sw = Math.max(140, Math.min(box.width * 0.86, bottom - top, 380));
  scr.style.setProperty('--sw', `${Math.round(sw)}px`);
  scr.style.setProperty('--sy', `${Math.round((top + bottom) / 2)}px`);
}
window.addEventListener('resize', placeScanFrame);

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
  hideSheet(document.getElementById('modalQrScanner'));
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
      html5QrScannerInstance = newQrReader();
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

async function claimHeistProstitute(lvl) {
  const pr = NIGHTCLUB_CATALOG.find(i => (i.lvl || 1) === lvl) || {};
  const girl = { id: 'pr_' + Date.now(), type: 'PROSTITUTE', level: lvl, name: pr.nom || `Prostituée Niv. ${lvl}`, revenue: pr.rev || (lvl === 2 ? 2500 : 1000) };
  const old = localPlayer.prostituteInTransit;
  if (old && !(await showAppConfirm(`Une ${girl.name} veut te suivre, mais tu as déjà une ${old.name || 'Prostituée'} en transit (une seule à la fois).\n\nRemplacer l'actuelle par la ${girl.name} ?`, "👠 Prostituée libérée", "Remplacer", "Garder l'actuelle"))) return;
  localPlayer.prostituteInTransit = girl;
  refreshHud();
  await showCardPlayed({ name: girl.name }, [['ph-high-heel', 'Rente au QG', `+${girl.revenue.toLocaleString()} € / manche`], ['ph-map-pin', 'En transit', 'dépose-la au QG']], 'PROSTITUÉE LIBÉRÉE',
    { kicker: 'Butin du braquage', stamp: 'ph-heart', face: shopCardFace({ img: pr.image || `plvl${lvl}.jpg`, name: girl.name, bonus: `+${girl.revenue.toLocaleString()} € / manche`, desc: pr.desc, cls: 'veh' }) });
}

// DEAL YENCLI : écran avec l'illustration de l'échange ; le cash compte jusqu'au gain une fois les lignes arrivées
function showYencliScreen(ok, rows, cashGain = 0) {
  return msgQueue(done => {
    const scr = document.getElementById('yenScreen');
    scr.dataset.ok = ok ? '1' : '0';
    document.getElementById('yenRound').innerText = currentSession.round || 1;
    document.getElementById('yenHead').innerHTML = ok ? 'MARCHÉ<br>CONCLU.' : 'DEAL<br>REFUSÉ.';
    document.getElementById('yenSub').innerText = ok ? 'Le client a payé, la came a changé de mains.' : 'Pas assez de marchandise : le client repart les mains vides.';
    document.getElementById('yenRows').innerHTML = rows.map(([icon, label, value, cls], i) =>
      `<div class="police-row" style="animation-delay:${0.9 + i * 0.15}s"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft ${cls || ''}">${value}</span></div>`).join('');
    const cta = document.getElementById('yenCta');
    cta.innerText = ok ? 'Empocher' : 'Compris';
    cta.onclick = () => {
      cta.onclick = null;
      if (!ok || !cashGain) { scr.classList.add('hidden'); scr.classList.remove('show'); return done(); }
      // Empocher : coup de tampon qui secoue l'écran, puis l'écran s'efface pendant que les billets filent vers le Sac
      scr.classList.add('stamped');
      setTimeout(() => buzz([70, 30, 25]), 260);
      setTimeout(() => {
        flyCashToSac(document.querySelector('#yenScreen .yen-hand-cash'), `+${cashGain.toLocaleString()} €`, 0.7, 0.3);
        scr.classList.add('leaving');
      }, 900);
      setTimeout(() => { scr.classList.add('hidden'); scr.classList.remove('show', 'leaving', 'stamped'); done(); }, 1280);
    };
    scr.classList.remove('hidden', 'show', 'stamped', 'leaving');
    void scr.offsetWidth;
    scr.classList.add('show');
    setTimeout(() => buzz(ok ? [40, 60, 90] : 160), 550); // le titre tombe
    countUpGain(document.getElementById('yenCash'), cashGain);
  });
}
// Le gain défile de +0 € jusqu'au montant, une fois les lignes arrivées
function countUpGain(el, gain) {
  if (!el || !gain) return;
  const t0 = performance.now() + 1100, dur = 800;
  const tick = t => {
    const k = Math.max(0, Math.min(1, (t - t0) / dur));
    el.innerText = `+${Math.round(gain * (1 - Math.pow(1 - k, 3))).toLocaleString()} €`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// BRAQUAGE SOLO : même mise en scène que le Yencli, avec l'illustration du lieu ; Empocher → tampon « BRAQUÉ » puis le butin file vers le Sac
function showHeistScreen(ok, name, rows, cashGain = 0, drugsGain = 0) {
  return msgQueue(done => {
    const scr = document.getElementById('brqScreen');
    scr.dataset.ok = ok ? '1' : '0';
    document.getElementById('brqImg').src = heistArt(name);
    document.getElementById('brqRound').innerText = currentSession.round || 1;
    document.getElementById('brqPlace').innerText = name ? `Braquage · ${name}` : 'Braquage';
    document.getElementById('brqHead').innerHTML = ok ? 'BRAQUAGE<br>RÉUSSI.' : 'BRAQUAGE<br>RATÉ.';
    document.getElementById('brqSub').innerText = ok ? 'La caisse est vide, le sac est plein.' : 'Pas assez de monde ou de puissance de feu : vous repartez bredouilles.';
    document.getElementById('brqRows').innerHTML = rows.map(([icon, label, value, cls], i) =>
      `<div class="police-row" style="animation-delay:${0.9 + i * 0.15}s"><i class="ph-bold ${icon}"></i><span class="lbl">${label}</span><span class="aft ${cls || ''}">${value}</span></div>`).join('');
    const cta = document.getElementById('brqCta');
    cta.innerText = ok ? 'Empocher' : 'Compris';
    cta.onclick = () => {
      cta.onclick = null;
      if (!ok || !(cashGain || drugsGain)) { scr.classList.add('hidden'); scr.classList.remove('show'); return done(); }
      scr.classList.add('stamped');
      setTimeout(() => buzz([70, 30, 25]), 260);
      setTimeout(() => {
        flyCashToSac(document.querySelector('#brqScreen .yen-scene'), cashGain ? `+${cashGain.toLocaleString()} €` : `+${drugsGain} kg`, 0.5, 0.45, cashGain ? '💵' : '🌿');
        scr.classList.add('leaving');
      }, 900);
      setTimeout(() => { scr.classList.add('hidden'); scr.classList.remove('show', 'leaving', 'stamped'); done(); }, 1280);
    };
    scr.classList.remove('hidden', 'show', 'stamped', 'leaving');
    void scr.offsetWidth;
    scr.classList.add('show');
    setTimeout(() => buzz(ok ? [40, 60, 90] : 160), 550);
    countUpGain(document.getElementById('brqCash'), cashGain);
  });
}

// Billets (ou sachets) qui partent d'un point de l'élément (fx, fy en fraction de sa taille) et atterrissent sur le bouton Sac de l'écran principal, puis le gain (« +X € ») au-dessus du Sac
function flyCashToSac(fromEl, label, fx = 0.5, fy = 0.5, emoji = '💵') {
  const sac = document.getElementById('btnOpenSac');
  const to = sac && sac.getBoundingClientRect();
  if (!to || !to.width || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = fromEl.getBoundingClientRect();
  const x0 = from.left + from.width * fx, y0 = from.top + from.height * fy;
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
  const n = 7, flight = 900;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'cash-fly';
    el.textContent = emoji;
    document.body.appendChild(el);
    const sx = x0 + (Math.random() - 0.5) * 60, sy = y0 + (Math.random() - 0.5) * 30;
    const mx = (sx + x1) / 2 + (Math.random() - 0.5) * 90, my = Math.min(sy, y1) - 70 - Math.random() * 60;
    const r = (Math.random() - 0.5) * 70;
    el.animate([
      { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) rotate(${r}deg) scale(0.6)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy - 18}px) translate(-50%, -50%) rotate(${r}deg) scale(1.15)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) rotate(${r * -1.5}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) rotate(0deg) scale(0.45)`, opacity: 0.2 }
    ], { duration: flight, delay: i * 55, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'both' }).onfinish = () => el.remove();
  }
  setTimeout(() => {
    sac.classList.remove('got-cash'); void sac.offsetWidth; sac.classList.add('got-cash');
    const tag = document.createElement('span');
    tag.className = 'cash-fly-tag';
    tag.textContent = label;
    tag.style.left = `${x1}px`; tag.style.top = `${to.top}px`;
    document.body.appendChild(tag);
    setTimeout(() => { tag.remove(); sac.classList.remove('got-cash'); }, 1300);
    buzz(30);
  }, flight + (n - 1) * 55 - 120);
}

async function processQrPayload(payload) {
  if (!isMyTurnToPlay) return showAppAlert("Ce n'est pas ton tour !", "Tour Inactif");
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
  // Montants imprimés entre guillemets ("3000") : convertis en nombres
  ['c', 'd', 'p', 'val', 'req', 'm', 'lvl'].forEach(k => { if (data[k] !== undefined && data[k] !== null && data[k] !== '') data[k] = Number(data[k]) || 0; });
  const type = (data.t || data.type || '').toLowerCase();

  // Case QG du plateau : seule façon d'ouvrir le coffre (dépôt, retrait, escort)
  if (type === 'qg' || type === 'coffre') return openTransferModal('deposit');
  if (type === 'armurerie') return openArmoryShopModal();
  if (type === 'nightclub') return openNightclubShopModal();
  if (type === 'sportclub') return openSportclubShopModal();
  if (type === 'concessionnaire' || type === 'dealer') return openDealerShopModal();
  if (type === 'magasin' || type === 'depotvente') return openMagasinShopModal();

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
    let itemName = data.n || (type === 'gb' ? `Lascar Niv. ${data.lvl||1}` : `Prostituée Niv. ${data.lvl||1}`);
    if (type === 'gb' && localPlayer.musclesOnPerson.length >= 3) return showAppAlert("3 Lascars maximum sur le terrain !", "Limite Atteinte");
    if (type === 'pr' && localPlayer.prostituteInTransit) return showAppAlert("Déjà 1 prostituée en transit !", "Limite Atteinte");
    if (type === 'pr' && getMyCaid().id === 'caid_4' && !localPlayer.freeProstituteClaimed && (data.lvl || 1) === 1) {
      localPlayer.freeProstituteClaimed = true;
      await finalizePurchaseExecution({ type, data, cost: 0, name: itemName });
      refreshHud();
      return;
    }
    if (type === 'pr' && (data.lvl || 1) === 1 && macCoatIndex() >= 0) {
      localPlayer.inventory.splice(macCoatIndex(), 1);
      await showAppAlert("Ton Manteau de fourrure fait son effet : elle te suit gratuitement !", "🧥 Déguisement de Mac");
      await finalizePurchaseExecution({ type, data, cost: 0, name: itemName });
      refreshHud();
      return;
    }
    if (localPlayer.pocketCash + localPlayer.safeCash < cost) return showBrokeScreen(cost, itemName);
    return openPaymentChoiceModal({ type, data, cost, name: itemName });
  }

  if (type === 'yen') {
    if (localPlayer.drugs < data.d) return showYencliScreen(false, [['ph-leaf', 'Drogue demandée', `${data.d} kg`], ['ph-backpack', 'Sur toi', `${localPlayer.drugs} kg ❌`, 'neg'], ['ph-lightning', 'PM', 'non dépensés']]);
    const radioBonus = isRadioEffectActive('YENCLI_CASH_BONUS') ? getRadioEffectValue('YENCLI_CASH_BONUS', 1500) : 0;
    const radioMult = isRadioEffectActive('YENCLI_CASH_MULT') ? getRadioEffectValue('YENCLI_CASH_MULT', 1) : 1;
    const totalGain = Math.round((data.c || 0) * radioMult) + radioBonus;
    localPlayer.drugs -= data.d;
    localPlayer.pocketCash += totalGain;
    spendActionPm();
    const rows = [['ph-leaf', 'Drogue livrée', `−${data.d} kg`, 'neg'], ['ph-money', 'Cash en poche', '<span id="yenCash">+0 €</span>', 'pos']];
    if (radioBonus > 0) rows.push(['ph-radio', 'Dont bonus radio', `+${radioBonus.toLocaleString()} €`, 'pos']);
    else if (radioMult !== 1) rows.push(['ph-radio', 'Flash Radio', radioMult > 1 ? `×${radioMult}` : `−${Math.round((1 - radioMult) * 100)} %`, radioMult > 1 ? 'pos' : 'neg']);
    rows.push(['ph-lightning', 'PM', '−2']);
    refreshHud();
    await showYencliScreen(true, rows, totalGain);
    return;
  }

  // BRAQUAGE (Choix entre Braquage Coordonné en Alliance ou Braquage Solo)
  if (type === 'brq') {
    let coordinateWithAlly = false;
    const heistAllies = localPlayer.activeAllies || [];
    const n = heistAllies.length + 1;
    if (localPlayer.allianceActive && heistAllies.length) {
      coordinateWithAlly = await showAppConfirm(
        `Tu es en Alliance avec ${formatAllyNames(heistAllies)}.\n\nComment veux-tu faire ce braquage ?\n\n• SOLO : tu tentes le braquage seul.\n• EN ALLIANCE : braquage coordonné à ${n} (${n === 2 ? 'tous les deux' : 'tous'} sur la case : forces cumulées & butin partagé).`,
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
      const team = coordinateWithAlly ? (n === 2 ? ' (en duo)' : ` (à ${n})`) : '';
      return showHeistScreen(false, data.n, [
        ['ph-sword', `Attaque${team}`, `${teamAtk} / ${data.req} ${teamAtk < data.req ? '❌' : '✅'}`, teamAtk < data.req ? 'neg' : 'pos'],
        ['ph-users-three', `Membres${team}`, `${members} / ${data.m} ${members < data.m ? '❌' : '✅'}`, members < data.m ? 'neg' : 'pos'],
        ['ph-lightning', 'PM', 'non dépensés']
      ]);
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
        prostituteLvl: data.p || 0,
        allyTokens: heistAllies.map(a => a.allyToken)
      });
    } else {
      localPlayer.pocketCash += totalCash;
      localPlayer.drugs += totalDrugs;
      refreshHud(); // gain enregistré tout de suite, sans attendre la lecture du message
      const rows = [];
      if (totalCash) rows.push(['ph-money', 'Cash en poche', '<span id="brqCash">+0 €</span>', 'pos']);
      if (radioHeistBonus > 0) rows.push(['ph-radio', 'Dont bonus radio', `+${radioHeistBonus.toLocaleString()} €`, 'pos']);
      if (totalDrugs) rows.push(['ph-plant', 'Drogue', `+${totalDrugs} kg`, 'pos']);
      if (data.p) rows.push(['ph-person-simple-walk', 'Prostituée libérée', `Niv. ${data.p}`, 'pos']);
      rows.push(['ph-lightning', 'PM', '−2']);
      await showHeistScreen(true, data.n, rows, totalCash, totalDrugs);
    }
    // "p" : niveau des prostituées libérées pendant le braquage, une pour chaque braqueur (les alliés la reçoivent par le serveur)
    if (data.p) await claimHeistProstitute(data.p);
    return;
  }
  // QR lisible mais d'un type inconnu (faute à l'impression…)
  return showAppAlert("QR Code non reconnu.", "Erreur");
}
