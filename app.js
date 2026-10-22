// EV Charger prototype — hash-routed screens built 1:1 from Figma Section 1.

const VARIANTS = {
  dc:    { ac: null,          dc: 'dc.png',     avail: '2 of 4 available' },
  acdc:  { ac: 'ac.png',      dc: 'dc.png',     avail: '2 of 4 available' },
  ac:    { ac: 'ac.png',      dc: null,         avail: '2 of 4 available' },
  acoff: { ac: 'ac-off.png',  dc: 'dc.png',     avail: '2 of 4 available' },
  dcoff: { ac: 'ac.png',      dc: 'dc-off.png', avail: '2 of 4 available' },
  none:  { ac: 'ac-off.png',  dc: 'dc-off.png', avail: '0 of 4 available' },
};
const ROUTES = ['map', 'detail', 'scan', 'charging'];
// Position in the navigation stack: higher pushes in from the right.
const DEPTH = { map: 0, detail: 0, scan: 1, charging: 2 };
const EASE = 'cubic-bezier(.32, .72, 0, 1)';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const root = document.documentElement;
const phone = $('#phone');
const mapScreen = $('#screen-map');
const scanScreen = $('#screen-scan');
const chargingScreen = $('#screen-charging');
const statusBar = $('#status-bar');
const chargerId = $('#charger-id');
const themeColor = $('meta[name="theme-color"]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let variant = 'acdc';
let scale = 1;

/* ---------- Station state ---------- */
function setVariant(key) {
  const v = VARIANTS[key];
  if (!v) return;
  variant = key;
  mapScreen.dataset.variant = key;
  const ac = $('.charger-ac', mapScreen);
  const dc = $('.charger-dc', mapScreen);
  ac.hidden = !v.ac;
  dc.hidden = !v.dc;
  if (v.ac) ac.src = `assets/${v.ac}`;
  if (v.dc) dc.src = `assets/${v.dc}`;
  $('.avail-text', mapScreen).textContent = v.avail;

  // With nothing free the preview CTA becomes the outlined "View Station".
  const primary = $('[data-action="primary"]', mapScreen);
  const full = key === 'none';
  primary.textContent = full ? 'View Station' : 'Start Charging';
  primary.classList.toggle('is-outline', full);

  $$('#variant-list button').forEach(b => b.setAttribute('aria-current', b.dataset.variant === key));
}

/* ---------- Routing ---------- */
function currentRoute() {
  const r = location.hash.slice(1);
  return ROUTES.includes(r) ? r : 'map';
}
function go(route, { replace = false } = {}) {
  if (currentRoute() === route) return render();
  if (replace) location.replace(`#${route}`);
  else location.hash = route;
}
function screenFor(route) {
  return route === 'scan' ? scanScreen : route === 'charging' ? chargingScreen : mapScreen;
}

let activeScreen = null;
let activeRoute = null;

// Native-style push/pop: the new screen slides over, the old one parallaxes and dims.
function transition(from, to, dir) {
  to.classList.add('is-active');
  if (!from || reducedMotion.matches) {
    if (from) from.classList.remove('is-active');
    return;
  }
  const opts = { duration: 480, easing: EASE };
  const top = dir > 0 ? to : from;
  const under = dir > 0 ? from : to;
  top.style.zIndex = 2;
  under.style.zIndex = 1;
  const slide = [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }];
  const park = [{ transform: 'translateX(0)', '--veil': 0 }, { transform: 'translateX(-30%)', '--veil': 0.25 }];
  const animTop = top.animate(dir > 0 ? slide : [...slide].reverse(), opts);
  under.animate(dir > 0 ? park : [...park].reverse(), opts);
  animTop.finished.then(() => {
    if (activeScreen !== from) from.classList.remove('is-active');
    top.style.zIndex = under.style.zIndex = '';
  });
}

function render() {
  const route = currentRoute();
  const screen = screenFor(route);
  if (screen !== activeScreen) {
    const dir = activeRoute ? Math.sign(DEPTH[route] - DEPTH[activeRoute]) || 1 : 0;
    const from = activeScreen;
    activeScreen = screen;
    transition(from, screen, dir);
  }
  activeRoute = route;
  if (screen === mapScreen) mapScreen.dataset.mode = route === 'detail' ? 'detail' : 'preview';

  const light = screen !== mapScreen;
  statusBar.classList.toggle('is-light', light);
  const tone = light ? 'light' : 'dark';
  $('.i-signal', statusBar).src = `assets/signal-${tone}.svg`;
  $('.i-wifi', statusBar).src = `assets/wifi-${tone}.svg`;
  $('.i-battery', statusBar).src = `assets/battery-${tone}.svg`;
  themeColor.content = light ? '#1b1b1b' : '#ffffff';

  if (route === 'charging') startSession(); else stopSession();
  if (route !== 'scan') { chargerId.value = ''; syncScan(); }
  if (route !== 'scan' && document.activeElement === chargerId) chargerId.blur();

  $$('#route-list button').forEach(b => b.setAttribute('aria-current', b.dataset.route === route));
}
window.addEventListener('hashchange', render);

/* ---------- Map: pan, pins, station sheet ---------- */
const mapLayer = $('#map-layer');
let panX = 0;
const PAN_MIN = -258; // map image spans -218…651 → keep the 393 window inside it
const PAN_MAX = 218;

(() => {
  let start = null;
  let moved = false;
  mapLayer.addEventListener('pointerdown', e => {
    start = { x: e.clientX, pan: panX, id: e.pointerId };
    moved = false;
  });
  mapLayer.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = (e.clientX - start.x) / scale;
    if (!moved && Math.abs(dx) < 6) return;
    if (!moved) mapLayer.setPointerCapture(e.pointerId);
    moved = true;
    panX = Math.max(PAN_MIN, Math.min(PAN_MAX, start.pan + dx));
    mapLayer.style.transform = `translateX(${panX}px)`;
  });
  const end = e => {
    if (!start) return;
    start = null;
    if (moved) return;
    // A plain tap: pins pick a station, bare map collapses the detail sheet.
    const pin = e.target.closest('.pin');
    if (pin) { setVariant(pin.dataset.pick); go('map'); }
    else if (currentRoute() === 'detail') go('map');
  };
  mapLayer.addEventListener('pointerup', end);
  mapLayer.addEventListener('pointercancel', () => { start = null; });
  // Keyboard activation (click with no pointer) still picks a pin.
  $$('.pin', mapLayer).forEach(pin => pin.addEventListener('click', e => {
    if (e.detail === 0) { setVariant(pin.dataset.pick); go('map'); }
  }));
})();

$('#identity').addEventListener('click', () => go(currentRoute() === 'detail' ? 'map' : 'detail'));

$('[data-action="primary"]', mapScreen).addEventListener('click', () => {
  go(variant === 'none' ? 'detail' : 'scan');
});
$('[data-action="start"]', mapScreen).addEventListener('click', () => go('scan'));

// Drag the station sheet up for detail, down for the preview.
(() => {
  const sheet = $('#station-sheet');
  let startY = null;
  sheet.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    startY = e.clientY;
  });
  window.addEventListener('pointerup', e => {
    if (startY === null) return;
    const dy = (e.clientY - startY) / scale;
    startY = null;
    if (dy < -40 && currentRoute() !== 'detail') go('detail');
    else if (dy > 40 && currentRoute() === 'detail') go('map');
  });
})();

/* ---------- Swipe from the left edge to go back (scan screen) ---------- */
(() => {
  let start = null;
  scanScreen.addEventListener('pointerdown', e => {
    const x = (e.clientX - phone.getBoundingClientRect().left) / scale;
    if (x <= 24) start = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = (e.clientX - start.x) / scale;
    const dy = Math.abs(e.clientY - start.y) / scale;
    start = null;
    if (dx > 70 && dy < 60 && currentRoute() === 'scan') history.back();
  });
})();

/* ---------- Scan ---------- */
function syncScan() {
  scanScreen.dataset.filled = chargerId.value.trim() !== '';
}
chargerId.addEventListener('input', () => {
  chargerId.value = chargerId.value.toUpperCase();
  syncScan();
});
chargerId.addEventListener('keydown', e => {
  if (e.key === 'Enter' && chargerId.value.trim()) go('charging');
});

$('#scan-target').addEventListener('click', e => {
  const target = e.currentTarget;
  target.classList.remove('is-hit');
  void target.offsetWidth;
  target.classList.add('is-hit');
  setTimeout(() => { chargerId.value = 'CUR-EP-03'; syncScan(); }, 220);
});

$('[data-action="charge"]', scanScreen).addEventListener('click', () => {
  chargerId.blur();
  go('charging');
});

/* ---------- Charging session ---------- */
// Figma snapshot: 18m 20s elapsed, 27.72 kWh at 92 kW, $0.45/kWh → $12.47.
const START_ELAPSED = 18 * 60 + 20;
const START_ENERGY = 27.72;
const POWER_KW = 92;
const RATE = 0.45;
const TARGET_PCT = 68;

let sessionTimer = null;
let sessionStart = 0;
let pctFrame = null;

function tickSession() {
  const secs = START_ELAPSED + Math.floor((Date.now() - sessionStart) / 1000);
  const energy = START_ENERGY + (secs - START_ELAPSED) * POWER_KW / 3600;
  $('#elapsed').textContent = `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`;
  $('#energy').textContent = `${energy.toFixed(2)} kWh`;
  $('#cost').textContent = `$${(energy * RATE).toFixed(2)}`;
}

function startSession() {
  if (sessionTimer) return;
  sessionStart = Date.now();
  tickSession();
  sessionTimer = setInterval(tickSession, 1000);

  const pct = $('#pct');
  const t0 = performance.now();
  const dur = 1600;
  const ease = t => 1 - Math.pow(1 - t, 4);
  cancelAnimationFrame(pctFrame);
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    pct.textContent = Math.round(TARGET_PCT * ease(t));
    if (t < 1) pctFrame = requestAnimationFrame(step);
  };
  pctFrame = requestAnimationFrame(step);
}

function stopSession() {
  clearInterval(sessionTimer);
  sessionTimer = null;
  cancelAnimationFrame(pctFrame);
}

// Ending a session returns to the map without leaving it on the back stack.
$('[data-action="end"]', chargingScreen).addEventListener('click', () => go('map', { replace: true }));

/* ---------- Prototype panel ---------- */
$$('#variant-list button').forEach(b => b.addEventListener('click', () => {
  setVariant(b.dataset.variant);
  if (!['map', 'detail'].includes(currentRoute())) go('map');
}));
$$('#route-list button').forEach(b => b.addEventListener('click', () => go(b.dataset.route)));

/* ---------- Fit ---------- */
// Desktop: the 393×852 Figma frame, scaled down if the window is short.
// Phone / home-screen app: width maps to 393 and the real visible height becomes
// the frame height, so top UI stays put and the sheets sit on the real bottom edge.
const touch = matchMedia('(pointer: coarse)');
const probe = $('#vp-probe');
const standalone = matchMedia('(display-mode: standalone)');
// Gap Figma leaves under each screen's bottom button; anything smaller than the
// home-indicator inset gets lifted.
const BOTTOM_GAP = { map: 36, detail: 31, scan: 31, charge: 18 };
// ?safe=top,bottom fakes safe-area insets for testing in a desktop browser.
const fakeSafe = new URLSearchParams(location.search).get('safe')?.split(',').map(Number);

function fit() {
  // The probe is position:fixed inset:0, so it measures what is actually on screen —
  // more reliable than innerHeight on an iOS home-screen launch.
  const box = probe.getBoundingClientRect();
  const vw = box.width || innerWidth;
  let vh = box.height || innerHeight;
  // iOS home-screen apps that draw under the status bar still lay out at
  // screen height minus the status bar, leaving a black strip at the bottom.
  // Standalone always fills the whole screen, so use the screen's own height.
  if (standalone.matches || navigator.standalone) {
    const portrait = innerHeight >= innerWidth;
    vh = Math.max(vh, portrait ? screen.height : screen.width);
  }
  root.style.setProperty('--app-h', `${vh}px`);
  const app = vw <= 760;
  root.classList.toggle('is-app', app);
  root.classList.toggle('is-touch', app && touch.matches);

  let h = 852;
  let safeBottom = 0;
  if (app) {
    scale = vw / 393;
    h = vh / scale;
    const cs = getComputedStyle(probe);
    safeBottom = (fakeSafe ? fakeSafe[1] : parseFloat(cs.paddingBottom) || 0) / scale;
  } else {
    scale = Math.min(1, (vh - 64) / 852);
  }
  const lift = gap => `${Math.max(0, safeBottom - gap)}px`;
  phone.style.setProperty('--h', `${h}px`);
  phone.style.setProperty('--lift-map', lift(BOTTOM_GAP.map));
  phone.style.setProperty('--lift-detail', lift(BOTTOM_GAP.detail));
  phone.style.setProperty('--lift-scan', lift(BOTTOM_GAP.scan));
  phone.style.setProperty('--lift-charge', lift(BOTTOM_GAP.charge));
  // Short screens (e.g. iPhone SE): fit the charging stats above the bottom sheet,
  // and lift the scan window clear of the filled ID sheet.
  const chargeSheet = 267 + Math.max(0, safeBottom - BOTTOM_GAP.charge);
  phone.style.setProperty('--charge-k', Math.min(1, (h - chargeSheet - 12) / 565).toFixed(3));
  phone.style.setProperty('--scan-shift', `${Math.max(0, (852 - h) * 0.6)}px`);
  phone.style.transformOrigin = 'top left';
  phone.style.transform = scale === 1 ? '' : `scale(${scale})`;
  phone.parentElement.style.width = `${393 * scale}px`;
  phone.parentElement.style.height = `${h * scale}px`;
}
window.addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
// iOS can settle the standalone viewport a moment after launch or when resumed.
window.addEventListener('pageshow', () => { fit(); setTimeout(fit, 300); });
window.addEventListener('load', () => setTimeout(fit, 300));

// ?v=<variant> opens the map in a given station state (handy for sharing a state).
const startVariant = new URLSearchParams(location.search).get('v');
setVariant(startVariant in VARIANTS ? startVariant : 'acdc');
fit();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
