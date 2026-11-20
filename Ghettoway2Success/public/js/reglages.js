// Réglages avancés de la partie : prix des boutiques, rentes, production du labo, départ des Caïds, gains.
// L'hôte les règle à la création ; le serveur les garde avec la partie (room.settings) et chaque téléphone
// les applique par-dessus les valeurs d'origine (applyGameSettings). Sans réglages, rien ne change.

let GAME_SETTINGS = null;
let pendingSettings = {}; // page de création : clé « section.id » → valeur modifiée

// Valeur d'origine d'un champ, mémorisée la première fois (propriété cachée, jamais envoyée)
function baseVal(o, k) {
  const b = '_b_' + k;
  if (!Object.prototype.hasOwnProperty.call(o, b)) Object.defineProperty(o, b, { value: o[k], writable: true });
  return o[b];
}
const settingIn = (m, k, d) => m && m[k] !== undefined ? m[k] : d;
const settingVal = (k, d) => GAME_SETTINGS && GAME_SETTINGS[k] !== undefined ? GAME_SETTINGS[k] : d;
// Prix du kilo réglé : les cartes Grossiste et la radio sont mises à l'échelle (1 000 € d'origine)
const grossisteFactor = () => settingVal('grossiste', 1000) / 1000;
const prostituteRent = lvl => (NIGHTCLUB_CATALOG.find(i => (i.lvl || 1) === lvl) || {}).rev || (lvl === 2 ? 2500 : 1000);

function applyGameSettings(s) {
  GAME_SETTINGS = s && typeof s === 'object' ? s : null;
  const g = GAME_SETTINGS || {};
  [...ARMORY_CATALOG, ...NIGHTCLUB_CATALOG, ...SPORTCLUB_CATALOG, ...DEALER_CATALOG].forEach(it => { it.prix = settingIn(g.prices, it.id, baseVal(it, 'prix')); });
  NIGHTCLUB_CATALOG.forEach(it => {
    const base = baseVal(it, 'rev'), rev = settingIn(g.rent, String(it.lvl || 1), base);
    baseVal(it, 'bonusVal'); baseVal(it, 'bonusLabel');
    it.rev = rev;
    it.bonusVal = rev === base ? it._b_bonusVal : rev;
    it.bonusLabel = rev === base ? it._b_bonusLabel : `+${rev.toLocaleString()} € / manche au QG`;
  });
  LAB_LEVELS.forEach(l => {
    l.prix = settingIn(g.prices, `lab_${l.lvl}`, baseVal(l, 'prix'));
    l.kg = settingIn(g.labKg, String(l.lvl), baseVal(l, 'kg'));
  });
  CAID_ROSTER.forEach(c => {
    c.startCash = settingIn(g.startCash, c.id, baseVal(c, 'startCash'));
    c.startDrug = settingIn(g.startDrug, c.id, baseVal(c, 'startDrug'));
  });
}

// Page Flash Radio : les exemples de prix suivent les réglages de la partie
function radioRuleWithSettings(ev) {
  const rule = ev.rule;
  if (!rule || !GAME_SETTINGS) return rule;
  const fmt = n => `${n.toLocaleString()} €`;
  const v = Number(ev.effectVal), t = ev.effectType;
  let { rows = [], big, sub } = rule;
  if (/_PRICE_MULT$/.test(t)) {
    const items = [...ARMORY_CATALOG, ...NIGHTCLUB_CATALOG, ...SPORTCLUB_CATALOG, ...DEALER_CATALOG, ...LAB_LEVELS.map(l => ({ nom: labSetName(l), prix: l.prix })), { nom: 'Grossiste (le kilo)', prix: settingVal('grossiste', 1000) }];
    rows = rows.map(row => { const it = items.find(x => x.nom === row[1]); return it ? [row[0], row[1], fmt(it.prix), fmt(Math.round(it.prix * v))] : row; });
  } else if (t === 'PROSTITUTE_REV_MULT') {
    rows = rows.map(row => { const m = /Niveau (\d)/.exec(row[1]); if (!m) return row; const r = prostituteRent(+m[1]); return [row[0], row[1], fmt(r), fmt(Math.round(r * v))]; });
  } else if (/^(YENCLI|HEIST)_CASH_/.test(t)) {
    // Gains des cartes réglés en % : « Deal à 5 000 € » rapporte 5 000 × % (puis l'effet de la radio)
    const pct = settingVal(t.startsWith('YENCLI') ? 'yencliPct' : 'heistPct', 100) / 100;
    if (pct !== 1) rows = rows.map(row => {
      const card = Number(String(row[2]).replace(/\D/g, ''));
      if (!/€/.test(row[2]) || !card) return row;
      const gain = Math.round(card * pct);
      return [row[0], row[1], fmt(gain), fmt(/_MULT$/.test(t) ? Math.round(gain * v) : gain + v)];
    });
  } else if (t === 'GROSSISTE_PRICE_SET' && settingVal('grossiste', 1000) !== 1000) {
    const base = settingVal('grossiste', 1000), now = Math.round(v * grossisteFactor());
    big = fmt(now); sub = `au lieu de ${fmt(base)}`;
    rows = rows.map(row => [row[0], row[1], `${fmt(base)}/kg`, `${fmt(now)}/kg`]);
  }
  return { ...rule, rows, big, sub };
}

// =========================================================================
// PAGE « RÉGLAGES AVANCÉS » (création de partie)
// =========================================================================
function settingsSections() {
  const shop = (title, icon, list) => ({ title, icon, rows: list.map(it => ({ key: `prices.${it.id}`, label: it.nom, base: baseVal(it, 'prix'), unit: '€', step: 500 })) });
  return [
    shop('Armurerie', 'ph-sword', ARMORY_CATALOG),
    shop('Nightclub', 'ph-high-heel', NIGHTCLUB_CATALOG),
    shop('Sportclub', 'ph-barbell', SPORTCLUB_CATALOG),
    shop('Concessionnaire', 'ph-moped', DEALER_CATALOG),
    { title: 'Dépôt-Vente', icon: 'ph-flask', rows: LAB_LEVELS.map(l => ({ key: `prices.lab_${l.lvl}`, label: labSetName(l), base: baseVal(l, 'prix'), unit: '€', step: 500 })) },
    { title: 'Rentes et production', icon: 'ph-vault', rows: [
      ...NIGHTCLUB_CATALOG.map(it => ({ key: `rent.${it.lvl || 1}`, label: `Rente ${it.nom}`, base: baseVal(it, 'rev'), unit: '€ / manche', step: 500 })),
      ...LAB_LEVELS.map(l => ({ key: `labKg.${l.lvl}`, label: `Labo ${labSetName(l).replace('Set de culture ', '')} (${l.nom})`, base: baseVal(l, 'kg'), unit: 'kg / manche', step: 1 }))
    ] },
    { title: 'Départ des Caïds', icon: 'ph-users-three', caids: true, rows: CAID_ROSTER.flatMap(c => [
      { key: `startCash.${c.id}`, label: c.name, base: baseVal(c, 'startCash'), unit: '€', step: 500 },
      { key: `startDrug.${c.id}`, label: c.name, base: baseVal(c, 'startDrug'), unit: 'kg', step: 1 }
    ]) },
    { title: 'Gains et revente', icon: 'ph-coins', rows: [
      { key: 'grossiste', label: 'Grossiste : prix du kilo', base: 1000, unit: '€ / kg', step: 100 },
      { key: 'yencliPct', label: 'Gains des cartes Yencli', base: 100, unit: '%', step: 10 },
      { key: 'heistPct', label: 'Gains des braquages', base: 100, unit: '%', step: 10 },
      { key: 'sellPct', label: 'Revente des objets', base: 50, unit: '% du prix', step: 10, max: 100 }
    ] }
  ];
}
const settingsRowsAll = () => settingsSections().flatMap(s => s.rows);
const settingCurrent = row => pendingSettings[row.key] !== undefined ? pendingSettings[row.key] : row.base;

function settingInputHtml(row) {
  const v = settingCurrent(row), changed = v !== row.base;
  return `<label class="set-field${changed ? ' changed' : ''}" data-key="${row.key}">
    <input type="number" inputmode="numeric" min="0" ${row.max ? `max="${row.max}"` : ''} step="${row.step}" value="${v}" data-key="${row.key}" data-base="${row.base}" onchange="onSettingInput(this)" oninput="onSettingInput(this, true)">
    <span>${row.unit}</span></label>`;
}
function renderSettingsPage() {
  const html = settingsSections().map(sec => {
    let body;
    if (sec.caids) {
      body = `<div class="set-caid-head"><span></span><span>Cash</span><span>Drogue</span></div>` + CAID_ROSTER.map(c => {
        const [cash, drug] = sec.rows.filter(r => r.label === c.name);
        return `<div class="set-row set-caid"><b><img src="${c.imageFile}" alt="">${escapeHtml(c.name)}</b>${settingInputHtml(cash)}${settingInputHtml(drug)}</div>`;
      }).join('');
    } else {
      body = sec.rows.map(row => `<div class="set-row"><b>${escapeHtml(row.label)}<small>origine ${row.base.toLocaleString()} ${row.unit}</small></b>${settingInputHtml(row)}</div>`).join('');
    }
    return `<section class="set-sec"><h3><i class="ph-bold ${sec.icon}"></i>${sec.title}</h3>${body}</section>`;
  }).join('');
  document.getElementById('settingsList').innerHTML = html;
  updateSettingsCount();
}
function onSettingInput(el, typing) {
  const key = el.dataset.key, base = Number(el.dataset.base);
  if (typing && el.value === '') return;
  let v = Math.max(0, Math.round(Number(el.value) || 0));
  if (el.max) v = Math.min(v, Number(el.max));
  if (!typing) el.value = v;
  if (v === base) delete pendingSettings[key]; else pendingSettings[key] = v;
  el.closest('.set-field').classList.toggle('changed', v !== base);
  updateSettingsCount();
}
function updateSettingsCount() {
  const n = Object.keys(pendingSettings).length;
  const txt = n ? `${n} valeur${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''}` : 'Valeurs d’origine';
  const cnt = document.getElementById('settingsCount');
  if (cnt) cnt.innerText = txt;
  const badge = document.getElementById('createSettingsBadge');
  if (badge) { badge.innerText = n ? `${n} modifiée${n > 1 ? 's' : ''}` : 'origine'; badge.classList.toggle('on', n > 0); }
}
function openSettingsPage() {
  applyGameSettings(null); // on part des valeurs d'origine (une ancienne partie a pu en laisser d'autres)
  renderSettingsPage();
  navTo('page-reglages');
  document.getElementById('page-reglages').scrollTop = 0;
}
async function resetSettings() {
  if (!Object.keys(pendingSettings).length) return;
  if (!await showAppConfirm('Remettre toutes les valeurs d’origine ?', '↺ Réglages avancés', 'Tout remettre', 'Annuler')) return;
  pendingSettings = {};
  renderSettingsPage();
}
function closeSettingsPage() { navTo('page-2'); }
// Réglages envoyés au serveur à la création : { prices: { wp_poing: 800 }, rent: { 1: 1500 }, grossiste: 1200, … }
function buildGameSettings() {
  const out = {};
  Object.entries(pendingSettings).forEach(([key, v]) => {
    const [sec, id] = key.split('.');
    if (id === undefined) out[sec] = v;
    else (out[sec] = out[sec] || {})[id] = v;
  });
  return Object.keys(out).length ? out : null;
}
