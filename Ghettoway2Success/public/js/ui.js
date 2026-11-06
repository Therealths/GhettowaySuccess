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

// Créer / Rejoindre glissent depuis le bas par-dessus l'accueil, et redescendent au retour
const SLIDE_PAGES = ['page-2', 'page-3'];
let slideTimer = null;
function navTo(pageId) {
  const current = document.querySelector('.screen-view.active');
  const target = document.getElementById(pageId);
  clearTimeout(slideTimer);
  document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active', 'slide-in-up', 'slide-out-down'));
  if (target) target.classList.add('active');
  const fromId = current && current.id;
  if (target && fromId === 'page-1' && SLIDE_PAGES.includes(pageId)) {
    current.classList.add('active');
    target.classList.add('slide-in-up');
    slideTimer = setTimeout(() => { current.classList.remove('active'); target.classList.remove('slide-in-up'); }, 420);
  } else if (target && pageId === 'page-1' && SLIDE_PAGES.includes(fromId)) {
    current.classList.add('active', 'slide-out-down');
    slideTimer = setTimeout(() => current.classList.remove('active', 'slide-out-down'), 340);
  }
  if (pageId === 'page-4' && !caidLocked) initCarouselDOM();
  if (pageId === 'page-6') { switchMainCaidTab('interactions'); refreshHud(); }
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
