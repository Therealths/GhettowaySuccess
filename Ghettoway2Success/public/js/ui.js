// Fenêtres système (alertes, confirmations), navigation entre écrans

// PWA : active l'installation sur l'écran d'accueil (voir sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Bandeau « Installe l'appli » sur l'accueil, seulement quand le jeu est ouvert dans le navigateur.
// Android (Chrome) : vrai bouton d'installation ; iPhone : les étapes Safari, car Apple n'en propose pas.
// « Plus tard » le cache 3 jours.
let deferredInstallPrompt = null;
const isStandaloneApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function hideInstallBanner() { document.getElementById('installBanner').classList.add('hidden'); }
function showInstallBanner() {
  let later = 0;
  try { later = +localStorage.getItem('g2s_install_later') || 0; } catch (e) {}
  if (isStandaloneApp() || Date.now() < later) return;
  document.getElementById('installBanner').classList.remove('hidden');
}
async function installApp() {
  if (!deferredInstallPrompt) return document.getElementById('installIosSteps').classList.toggle('hidden');
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  prompt.prompt();
  if ((await prompt.userChoice).outcome === 'accepted') hideInstallBanner();
}
function dismissInstallBanner() {
  try { localStorage.setItem('g2s_install_later', Date.now() + 3 * 24 * 3600 * 1000); } catch (e) {}
  hideInstallBanner();
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; showInstallBanner(); });
window.addEventListener('appinstalled', hideInstallBanner);
if (isIosDevice) showInstallBanner();

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
  if (!backTrapArmed) { clearTimeout(exitHintTimer); armBackTrap(); }
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

// Bouton retour du téléphone : on garde toujours une entrée d'historique en réserve pour que
// le retour agisse dans l'appli au lieu de la fermer. Sur l'accueil, il faut appuyer deux fois.
let backTrapArmed = false, exitHintTimer = null;
function armBackTrap() {
  if (backTrapArmed) return;
  history.pushState({ ghettoway: true }, '');
  backTrapArmed = true;
}
// Ferme la fenêtre du dessus si elle a un bouton de fermeture ; les fenêtres obligatoires restent ouvertes
function closeTopModalOnBack() {
  const open = [...document.querySelectorAll('[id^="modal"]:not(.hidden)')];
  const top = open[open.length - 1];
  if (!top) return false;
  if (top.id === 'modalCombat') { if (!currentDuelInfo) closeModal('modalCombat'); return true; }
  const btn = [...top.querySelectorAll('button')].find(b => {
    const a = b.getAttribute('onclick') || '';
    return a.includes(`closeModal('${top.id}')`) || a.includes('closeQrScannerModal()');
  });
  if (btn) btn.click();
  return true;
}
function showExitHint() {
  let el = document.getElementById('exitHint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'exitHint';
    el.className = 'absolute bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-black/85 border border-white/15 text-white text-xs font-bold whitespace-nowrap pointer-events-none transition-opacity duration-300';
    el.innerText = 'Appuie encore pour quitter';
    document.getElementById('app-container').appendChild(el);
  }
  el.style.opacity = '1';
}
window.addEventListener('popstate', () => {
  backTrapArmed = false;
  const page = document.querySelector('.screen-view.active:not(.slide-out-down)');
  const pageId = page && page.id;
  if (!closeTopModalOnBack()) {
    if (pageId === 'page-1') {
      // Pas de nouvelle entrée pendant 2 s : un second retour ferme l'appli
      showExitHint();
      clearTimeout(exitHintTimer);
      exitHintTimer = setTimeout(() => { document.getElementById('exitHint').style.opacity = '0'; armBackTrap(); }, 2000);
      return;
    }
    if (SLIDE_PAGES.includes(pageId)) navTo('page-1');
    else if (pageId === 'page-6' && document.getElementById('panelInteractions').classList.contains('hidden')) switchMainCaidTab('interactions');
  }
  armBackTrap();
});
armBackTrap();
