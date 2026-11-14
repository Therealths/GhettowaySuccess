// Fenêtres système (alertes, confirmations), navigation entre écrans

// Vibration du téléphone (sans effet là où ce n'est pas possible)
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

// Pas de copier / couper / coller dans l'appli, ni de menu au toucher long, ni d'image qu'on fait glisser
['copy', 'cut', 'paste'].forEach(type => document.addEventListener(type, e => e.preventDefault()));
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });

// PWA : active l'installation sur l'écran d'accueil (voir sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Bandeau « Installe l'appli » sur l'accueil, seulement quand le jeu est ouvert dans le navigateur d'un téléphone.
// Quand Chrome propose l'installation, le bouton l'ouvre directement ; sinon il affiche les étapes à suivre
// (Chrome ne la propose qu'après un toucher et 30 s sur la page, et Safari jamais). « Plus tard » le cache 3 jours.
let deferredInstallPrompt = null;
const isStandaloneApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroidDevice = /android/i.test(navigator.userAgent);
function hideInstallBanner() { document.getElementById('installBanner').classList.add('hidden'); }
function showInstallBanner() {
  let later = 0;
  try { later = +localStorage.getItem('g2s_install_later') || 0; } catch (e) {}
  if (isStandaloneApp() || Date.now() < later) return;
  document.getElementById('installBanner').classList.remove('hidden');
}
async function installApp() {
  if (!deferredInstallPrompt) {
    return document.getElementById(isIosDevice ? 'installIosSteps' : 'installAndroidSteps').classList.toggle('hidden');
  }
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  prompt.prompt();
  if ((await prompt.userChoice).outcome === 'accepted') hideInstallBanner();
}
function dismissInstallBanner() {
  try { localStorage.setItem('g2s_install_later', Date.now() + 3 * 24 * 3600 * 1000); } catch (e) {}
  hideInstallBanner();
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installAndroidSteps').classList.add('hidden');
  showInstallBanner();
});
window.addEventListener('appinstalled', hideInstallBanner);
(async () => {
  if (!isIosDevice && !isAndroidDevice) return;
  // Chrome Android sait dire si l'appli de cette adresse est déjà installée (voir related_applications du manifeste)
  try {
    if (navigator.getInstalledRelatedApps && (await navigator.getInstalledRelatedApps()).length) return;
  } catch (e) {}
  showInstallBanner();
})();

// --- MODALES SYSTÈME ---
// Messages et confirmations : ton (bonne / mauvaise nouvelle, info, question) déduit du titre et du texte,
// emoji du titre en grande icône animée, montants mis en couleur
const MSG_EMOJI = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}))*)\s*/u;
const MSG_WIN = /réussi|récupér|perçue|recrut|rallié|gagn|victoire|confirmé|sécuris|capturée|miracle|sieste|soign|de retour|livr|dérobé|acheté|pacte|butin|partag|encaiss|rente/i;
const MSG_LOSE = /subi|volé|échec|impossible|défaite|siphon|shuriken|danse|insuffisant|refus|déjà récupérée|ne peux pas|ne pouvez pas|impossible de l|protégée|neutralis|supprim|perdu|interrompu|expiré|quitté|garde à vue|k\.o|danger/i;
const MSG_TAGS = { win: 'Bonne nouvelle', lose: 'Aïe', info: 'Info', ask: 'Attention' };
const MSG_DEFAULT_ICON = { win: '✅', lose: '⛔', info: '🔔', ask: '❓' };
// Animations spéciales de certaines icônes
const MSG_SPECIAL = { '🐕': 'dog', '🩸': 'drop', '⭐': 'shuriken', '💃': 'dance', '🏆': 'shine' };
function msgParts(title, msg, confirm) {
  const m = String(title || '').match(MSG_EMOJI);
  const emoji = m ? m[1] : '';
  const clean = m ? String(title).slice(m[0].length) : String(title || '');
  const tone = confirm ? 'ask' : (MSG_LOSE.test(clean + ' ' + msg) && !MSG_WIN.test(clean) ? 'lose' : (MSG_WIN.test(clean) ? 'win' : 'info'));
  return { emoji: emoji || MSG_DEFAULT_ICON[tone], clean, tone, special: MSG_SPECIAL[emoji] || '' };
}
// Texte échappé, retours à la ligne, montants « +8 000 € », « −3 kg », « +2 Atk » en couleur
function msgHtml(msg) {
  const esc = String(msg || '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  return esc.replace(/([+\-−])\s?(\d[\d\s\u202f\u00a0.,]*\s?(?:€|kg|Atk|Def|PM|Cœurs?|cœurs?))/g,
    (all, sign, rest) => `<span class="${sign === '+' ? 'msg-up' : 'msg-down'}">${sign === '-' ? '−' : sign}${rest}</span>`).replace(/\n/g, '<br>');
}
function msgShow(modal, iconEl, parts, title) {
  modal.dataset.tone = parts.tone;
  modal.dataset.special = parts.special;
  iconEl.innerHTML = parts.special === 'shuriken' ? '<img src="shuriken.webp" alt="">' : parts.emoji;
  title.innerText = parts.clean;
  // Effets autour de l'icône : billets et pièces pour une bonne nouvelle, goutte de sang pour le siphon
  const fx = modal.querySelector('.msg-fx');
  fx.innerHTML = parts.tone === 'win'
    ? [['💵', -70, -40, -30], ['🪙', 62, -50, 40], ['💵', 70, 30, 25], ['🪙', -60, 40, -50], ['🪙', 0, -80, 90], ['💵', -20, 70, -20]]
      .map(([e, x, y, r], i) => `<i class="msg-coin" style="--x:${x}px;--y:${y}px;--r:${r}deg;animation-delay:${0.35 + i * 0.04}s">${e}</i>`).join('')
    : (parts.special === 'drop' ? '<i class="msg-drop"></i>' : '');
  modal.classList.remove('hidden', 'show');
  void modal.offsetWidth; // relance les animations d'arrivée
  modal.classList.add('show');
  if (parts.tone === 'lose') { try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) {} }
}
// Messages en file : un seul à la fois, le suivant attend le clic sur le précédent.
// Tant qu'un message est ouvert, les animations des écrans derrière sont en pause (body.msg-open)
let msgChain = Promise.resolve();
function msgQueue(open) {
  const p = msgChain.then(() => new Promise(res => {
    document.body.classList.add('msg-open');
    open(v => { document.body.classList.remove('msg-open'); res(v); });
  }));
  msgChain = p.catch(() => {});
  return p;
}
// Attend que tous les messages en cours aient été fermés (avant d'afficher un grand écran)
function msgIdle() { return msgChain; }
function showAppAlert(msg, title = "Information") {
  return msgQueue(done => {
    const m = document.getElementById('modalAppAlert');
    const parts = msgParts(title, msg, false);
    document.getElementById('appAlertTag').innerText = MSG_TAGS[parts.tone];
    document.getElementById('appAlertMessage').innerHTML = msgHtml(msg);
    msgShow(m, document.getElementById('appAlertIcon'), parts, document.getElementById('appAlertTitle'));
    document.getElementById('btnAppAlertOk').onclick = () => { m.classList.add('hidden'); m.classList.remove('show'); done(); };
  });
}
function showAppConfirm(msg, title = "Confirmation", yesLabel = "Confirmer", noLabel = "Annuler") {
  return msgQueue(done => {
    const m = document.getElementById('modalAppConfirm');
    const parts = msgParts(title, msg, true);
    document.getElementById('appConfirmMessage').innerHTML = msgHtml(msg);
    msgShow(m, document.getElementById('appConfirmIcon'), parts, document.getElementById('appConfirmTitle'));
    const btnYes = document.getElementById('btnAppConfirmYes');
    const btnNo = document.getElementById('btnAppConfirmNo');
    btnYes.innerText = yesLabel;
    btnNo.innerText = noLabel;
    // Action risquée : bouton rouge
    btnYes.classList.toggle('danger', /quitter|supprimer|congédier|abandonner/i.test(yesLabel));
    const close = v => { m.classList.add('hidden'); m.classList.remove('show'); done(v); };
    btnYes.onclick = () => close(true);
    btnNo.onclick = () => close(false);
  });
}

// Créer / Rejoindre glissent depuis le bas par-dessus l'accueil, et redescendent au retour
const SLIDE_PAGES = ['page-2', 'page-3'];
let slideTimer = null;
function navTo(pageId) {
  const current = document.querySelector('.screen-view.active');
  const target = document.getElementById(pageId);
  clearTimeout(slideTimer);
  armBackTrap();
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
  if (pageId === 'page-6') { closeSac(); refreshHud(); }
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Bouton retour du téléphone : il agit dans l'appli et ne la ferme jamais. Il ferme la fenêtre du dessus
// avec son propre bouton (Fermer, Annuler, Retour, Quitter…) ; sans bouton de ce genre (validation en
// attente), sur l'écran principal ou sur l'accueil, il ne fait rien.
// Chrome saute au retour les entrées d'historique ajoutées sans toucher de l'utilisateur. On n'en ajoute
// donc pas après chaque retour : on pose une entrée « du dessus » pendant un vrai toucher, et à chaque
// retour on traite l'action puis on revient sur cette entrée avec history.forward().
const BACK_SID = `${Date.now()}_${Math.random()}`;
let backTopN = 0, backTrapOk = false;
function pushBackTop() { history.pushState({ g: BACK_SID, n: ++backTopN }, ''); }
function armBackTrap() {
  if (backTrapOk) return;
  const ua = navigator.userActivation;
  if (ua && !ua.isActive) return; // hors toucher, l'entrée ne compterait pas
  pushBackTop();
  backTrapOk = true;
}
// Boutons qui ne sont pas un simple « retour » : quitter la partie, annuler un combat engagé
const BACK_NEVER = ['confirmLeaveGame', 'abortCombat'];
const isShown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
// Fenêtre du dessus : un écran plein (inset-0), un modal ou le zoom du Sac, visible, hors pages
function topOverlay() {
  const all = [...document.querySelectorAll('#app-container [id][class*="inset-0"], #app-container [id^="modal"], #sacZoom')]
    .filter(el => !el.classList.contains('screen-view') && isShown(el) && el.getClientRects().length)
    .filter(el => { for (let p = el.parentElement; p && p.id !== 'app-container'; p = p.parentElement) if (!isShown(p)) return false; return true; });
  if (!all.length) return null;
  // Le plus au-dessus à l'œil : celui qui contient l'élément au centre de l'écran, sinon le dernier du z-index le plus haut
  const r = document.getElementById('app-container').getBoundingClientRect();
  let hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  while (hit && !all.includes(hit)) hit = hit.parentElement;
  const z = el => parseInt(getComputedStyle(el).zIndex, 10) || 0;
  let win = hit || all.reduce((best, el) => (z(el) >= z(best) ? el : best));
  // Une fenêtre ouverte à l'intérieur d'une autre (zoom du Sac, aperçu photo du Scanner) passe avant elle
  for (let inner; (inner = all.filter(el => el !== win && win.contains(el)).pop());) win = inner;
  return win;
}
function backCloseButton(win) {
  return [...win.querySelectorAll('button')].find(b => {
    const a = b.getAttribute('onclick') || '';
    if (b.disabled || !b.getClientRects().length || BACK_NEVER.some(f => a.includes(f))) return false;
    for (let p = b.parentElement; p && p !== win; p = p.parentElement) if (!isShown(p)) return false;
    return b.classList.contains('btn-close') || /^\s*(close|cancel)\w*\(/.test(a);
  });
}
window.addEventListener('popstate', e => {
  const st = e.state;
  if (st && st.g === BACK_SID && st.n === backTopN) return; // retour sur notre entrée du dessus
  history.forward();
  if (document.body.classList.contains('msg-open')) return; // message à valider
  const win = topOverlay();
  if (win) {
    const btn = backCloseButton(win);
    if (btn) btn.click();
    return;
  }
  const page = document.querySelector('.screen-view.active:not(.slide-out-down)');
  if (page && SLIDE_PAGES.includes(page.id)) navTo('page-1');
});
// Entrée provisoire au chargement (avant tout toucher), puis la vraie au premier toucher
pushBackTop();
['pointerup', 'click', 'keydown'].forEach(t => document.addEventListener(t, armBackTrap, true));
