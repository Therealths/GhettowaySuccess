// Fenêtres système (alertes, confirmations), navigation entre écrans

// PWA : active l'installation sur l'écran d'accueil (voir sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// --- MODALES SYSTÈME ---
function showAppAlert(msg, title = "Information") {
  return new Promise(res => {
    document.getElementById('appAlertTitle').innerText = title;
    document.getElementById('appAlertMessage').innerText = msg;
    const m = document.getElementById('modalAppAlert');
    m.classList.remove('hidden');
    document.getElementById('btnAppAlertOk').onclick = () => { m.classList.add('hidden'); res(); };
  });
}
function showAppConfirm(msg, title = "Confirmation", yesLabel = "Confirmer", noLabel = "Annuler") {
  return new Promise(res => {
    document.getElementById('appConfirmTitle').innerText = title;
    document.getElementById('appConfirmMessage').innerText = msg;
    const m = document.getElementById('modalAppConfirm');
    m.classList.remove('hidden');
    const btnYes = document.getElementById('btnAppConfirmYes');
    const btnNo = document.getElementById('btnAppConfirmNo');
    btnYes.innerText = yesLabel;
    btnNo.innerText = noLabel;
    btnYes.onclick = () => { m.classList.add('hidden'); res(true); };
    btnNo.onclick = () => { m.classList.add('hidden'); res(false); };
  });
}

function navTo(pageId) {
  document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  if (pageId === 'page-4' && !caidLocked) initCarouselDOM();
  if (pageId === 'page-6') { switchMainCaidTab('interactions'); refreshHud(); }
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
