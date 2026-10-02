// Application controller: loading, menus, turn flow, input, AI turns and HUD.
import { BoardScene } from './board/board3d.js';
import { paintBoard, computeSeaLanes } from './board/boardArt.js';
import { ArmyManager } from './pieces/armies.js';
import { ArrowManager } from './board/arrows.js';
import { DiceRoller } from './dice/dice.js';
import { Game } from './game/engine.js';
import * as AI from './game/ai.js';
import { t, tName, cName, getLang, setLang, onLangChange, applyStaticText } from './i18n.js';
import { sfx, unlockAudio, setSound, setMusic, isSoundOn, isMusicOn } from './audio.js';
import { updateTweens, wait } from './tween.js';
import { TERRITORIES, NEIGHBORS, CONTINENT_MEMBERS, TERRITORY_CONTINENT } from './data/world.js';

const $ = (id) => document.getElementById(id);
const PALETTE = ['#c0262e', '#2459b8', '#2f8f3e', '#e0b52a', '#7b3fb0', '#2b2b2e', '#e2742a', '#1f9aa0'];
const TEX_W = 4096;
const SAVE_KEY = 'wc-save';
const SYMBOL_GLYPH = ['♟', '♞', '♜', '★'];
const SYMBOL_KEY = ['infantry', 'cavalry', 'artillery', 'wild'];

const app = {
  game: null,
  session: 0,
  mode: 'menu', // menu | setup | reinforce | attack-select | attack-target | attack-dice | occupy | fortify-select | fortify-target | fortify-move | ai | busy | gameover
  sel: -1,
  target: -1,
  hover: -1,
  placed: [],
  paused: false,
  opts: { autoSetup: true, fastAi: false, aiDice: true, tint: true },
  nDice: 3,
};

let board;
let armies;
let arrows;
let dice;
let map;
let baseCanvas;
let boardCanvas;
let lanes;

try {
  Object.assign(app.opts, JSON.parse(localStorage.getItem('wc-opts') || '{}'));
} catch {
  /* ignore */
}
const saveOpts = () => {
  try {
    localStorage.setItem('wc-opts', JSON.stringify(app.opts));
  } catch {
    /* ignore */
  }
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('visible', s.id === id);
}

function loadMap() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./board/mapWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        document.querySelector('.progress-fill').style.width = `${Math.round(m.p * 90)}%`;
        document.querySelector('.loading-text').textContent = t(`stage.${m.stage}`);
      } else if (m.type === 'done') {
        worker.terminate();
        resolve(m.map);
      } else if (m.type === 'error') {
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => reject(e);
    worker.postMessage({ width: TEX_W });
  });
}

async function loadFonts() {
  if (!document.fonts) return;
  const loads = ['700 24px Cinzel', '900 24px Cinzel', 'italic 30px "IM Fell English"', '400 14px Inter'].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(loads), wait(4)]).catch(() => {});
}

function repaintBoard() {
  paintBoard(boardCanvas, baseCanvas, map, lanes);
  if (board.boardTexture) board.boardTexture.needsUpdate = true;
}

async function boot() {
  applyStaticText();
  document.documentElement.lang = getLang();
  board = new BoardScene($('stage'));
  const [m] = await Promise.all([loadMap(), loadFonts()]);
  map = m;
  baseCanvas = document.createElement('canvas');
  baseCanvas.width = map.W;
  baseCanvas.height = map.H;
  baseCanvas.getContext('2d').putImageData(new ImageData(map.color, map.W, map.H), 0, 0);
  map.color = null;
  boardCanvas = document.createElement('canvas');
  boardCanvas.width = map.W;
  boardCanvas.height = map.H;
  lanes = computeSeaLanes(map);
  paintBoard(boardCanvas, baseCanvas, map, lanes);
  board.buildBoard(map, boardCanvas);
  armies = new ArmyManager(board);
  armies.init(TERRITORIES.length);
  arrows = new ArrowManager(board, armies);
  dice = new DiceRoller(board, armies, {
    safeRect: visibleBoardRect,
    onSlowMo: (on) => $('slowmo').classList.toggle('on', on),
    onPower: (p) => {
      $('power').classList.toggle('on', p !== null);
      if (p !== null) $('power-fill').style.width = `${Math.round(p * 100)}%`;
    },
  });
  document.querySelector('.progress-fill').style.width = '100%';
  demoBoard();
  board.renderer.compile(board.scene, board.camera);
  requestAnimationFrame(loop);
  wireUI();
  await wait(0.3);
  showMenu();
}

// Screen area not covered by HUD panels or the slow-motion letterbox bars.
function visibleBoardRect() {
  const r = { left: 0, top: window.innerHeight * 0.09, right: window.innerWidth, bottom: window.innerHeight * 0.91 };
  if ($('hud').classList.contains('hidden')) return r;
  const box = (id) => {
    const el = $(id);
    return el && !el.classList.contains('hidden') ? el.getBoundingClientRect() : null;
  };
  const players = box('players');
  if (players) r.left = Math.max(r.left, players.right);
  for (const id of ['phasebar', 'top-actions']) {
    const b = box(id);
    if (b) r.top = Math.max(r.top, b.bottom);
  }
  const log = box('log-panel');
  if (log) {
    if (log.height > 120) r.right = Math.min(r.right, log.left);
    else r.top = Math.max(r.top, log.bottom);
  }
  for (const id of ['attack-panel', 'move-panel']) {
    const b = box(id);
    if (b) r.right = Math.min(r.right, b.left);
  }
  const bar = box('actionbar');
  if (bar) r.bottom = Math.min(r.bottom, bar.top);
  const power = box('power');
  if (power) r.bottom = Math.min(r.bottom, power.top);
  return r;
}

let lastT = performance.now();
let elapsed = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  elapsed += dt;
  updateTweens(dt);
  dice.update(dt);
  arrows.update(dt, elapsed);
  if (app.mode === 'menu' && !board.flying) {
    const theta = Math.sin(elapsed * 0.06) * 0.55;
    const r = 27;
    const phi = 0.82;
    board.controls.target.set(0, 0.6, 1);
    board.camera.position.set(Math.sin(theta) * Math.sin(phi) * r, 0.6 + Math.cos(phi) * r, 1 + Math.cos(theta) * Math.sin(phi) * r);
    board.camera.lookAt(board.controls.target);
    board.renderer.render(board.scene, board.camera);
  } else {
    board.render(dt, elapsed);
  }
  requestAnimationFrame(loop);
}

// Random armies on the board behind the main menu.
function demoBoard() {
  const colors = PALETTE.slice(0, 5);
  TERRITORIES.forEach((_, i) => {
    const c = colors[Math.floor(Math.random() * colors.length)];
    armies.set(i, c, 1 + Math.floor(Math.random() * 14), { animated: false });
    board.setOwnerColor(i, c);
  });
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
function hasSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && s.state && s.state.phase !== 'gameover';
  } catch {
    return false;
  }
}

function showMenu() {
  app.session++;
  app.mode = 'menu';
  dice.cleanupImmediate();
  arrows.clear();
  $('hud').classList.add('hidden');
  for (const id of ['cards-modal', 'handoff', 'pause', 'gameover']) $(id).classList.add('hidden');
  $('btn-continue').classList.toggle('hidden', !hasSave());
  showScreen('menu');
  updateLangButtons();
}

function updateLangButtons() {
  document.querySelectorAll('.lang-switch button').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  $('btn-lang').textContent = getLang() === 'en' ? 'DE' : 'EN';
}

const setupPlayers = [];
function defaultSetup() {
  const names = t('aiNames').split(',');
  setupPlayers.length = 0;
  setupPlayers.push({ name: t('defaultName', { n: 1 }), color: PALETTE[0], type: 'human' });
  for (let i = 1; i < 4; i++) setupPlayers.push({ name: names[(i - 1) % names.length], color: PALETTE[i], type: 'normal' });
}

function renderSetup() {
  const rows = $('player-rows');
  rows.innerHTML = '';
  setupPlayers.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    const sw = document.createElement('button');
    sw.className = 'color-pick';
    sw.style.background = p.color;
    sw.title = 'Colour';
    sw.onclick = () => {
      const used = new Set(setupPlayers.map((x) => x.color));
      let k = PALETTE.indexOf(p.color);
      for (let n = 0; n < PALETTE.length; n++) {
        k = (k + 1) % PALETTE.length;
        if (!used.has(PALETTE[k])) break;
      }
      p.color = PALETTE[k];
      renderSetup();
    };
    const name = document.createElement('input');
    name.type = 'text';
    name.value = p.name;
    name.maxLength = 18;
    name.oninput = () => (p.name = name.value);
    const type = document.createElement('select');
    for (const [v, label] of [
      ['human', t('human')],
      ['easy', `${t('ai')} · ${t('easy')}`],
      ['normal', `${t('ai')} · ${t('normal')}`],
      ['hard', `${t('ai')} · ${t('hard')}`],
    ]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      o.selected = p.type === v;
      type.appendChild(o);
    }
    type.onchange = () => (p.type = type.value);
    const rm = document.createElement('button');
    rm.className = 'remove-player';
    rm.textContent = '✕';
    rm.disabled = setupPlayers.length <= 2;
    rm.style.visibility = setupPlayers.length <= 2 ? 'hidden' : 'visible';
    rm.onclick = () => {
      setupPlayers.splice(i, 1);
      renderSetup();
    };
    const spacer = document.createElement('span');
    row.append(sw, name, type, spacer, rm);
    rows.appendChild(row);
  });
  $('btn-add-player').disabled = setupPlayers.length >= 6;
  $('opt-autosetup').checked = app.opts.autoSetup;
  $('opt-fastai').checked = app.opts.fastAi;
  $('opt-aidice').checked = app.opts.aiDice;
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------
const game = () => app.game;
const S = () => app.game.s;
const colorOf = (p) => S().players[p].color;
const isHuman = (p) => !S().players[p].ai;
const humanCount = () => S().players.filter((p) => !p.ai && p.alive).length;
const stale = (session) => session !== app.session;

function saveGame() {
  try {
    if (S().phase === 'gameover') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, state: S() }));
  } catch {
    /* ignore */
  }
}

function syncBoard(animated = false) {
  const s = S();
  TERRITORIES.forEach((_, i) => {
    armies.set(i, colorOf(s.owner[i]), s.armies[i], { animated });
    board.setOwnerColor(i, colorOf(s.owner[i]));
  });
  board.setTint(app.opts.tint ? 0.42 : 0);
}

function enterGame() {
  app.session++;
  app.mode = 'busy';
  app.sel = app.target = -1;
  dice.cleanupImmediate();
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('gameover').classList.add('hidden');
  syncBoard(false);
  board.overview(1.6);
  updateHUD();
}

function startNewGame() {
  const players = setupPlayers.map((p, i) => ({
    name: p.name.trim() || t('defaultName', { n: i + 1 }),
    color: p.color,
    ai: p.type === 'human' ? null : p.type,
  }));
  app.opts.autoSetup = $('opt-autosetup').checked;
  app.opts.fastAi = $('opt-fastai').checked;
  app.opts.aiDice = $('opt-aidice').checked;
  saveOpts();
  app.game = Game.create({ players, options: {} });
  enterGame();
  saveGame();
  setupFlow(app.session);
}

function continueGame() {
  const data = JSON.parse(localStorage.getItem(SAVE_KEY));
  app.game = new Game(data.state);
  const s = S();
  if (s.phase === 'occupy') game().occupy(s.pending.min);
  enterGame();
  const session = app.session;
  if (s.phase === 'setup') setupFlow(session);
  else resumeTurn(session);
}

async function resumeTurn(session) {
  await wait(0.8);
  if (stale(session)) return;
  if (!isHuman(S().current)) return runAI(session);
  await handoff(session);
  enterPhaseMode();
}

// Enter the right interaction mode for the current phase (human turn).
function enterPhaseMode() {
  const s = S();
  app.sel = app.target = -1;
  app.placed = [];
  if (s.phase === 'reinforce') {
    app.mode = 'reinforce';
    if (game().mustTradeNow()) openCards(true);
  } else if (s.phase === 'attack') app.mode = 'attack-select';
  else if (s.phase === 'fortify') app.mode = 'fortify-select';
  else if (s.phase === 'setup') app.mode = 'setup';
  updateHUD();
}

async function handoff(session) {
  if (humanCount() <= 1) return;
  const p = S().players[S().current];
  $('handoff-swatch').style.background = p.color;
  $('handoff-title').textContent = t('yourTurn', { p: p.name });
  $('handoff').classList.remove('hidden');
  await new Promise((res) => {
    $('handoff-ready').onclick = () => {
      sfx.click();
      $('handoff').classList.add('hidden');
      res();
    };
  });
  if (stale(session)) return;
}

async function pace(seconds, session) {
  await wait(seconds * (app.opts.fastAi ? 0.3 : 1));
  while (app.paused && !stale(session)) await wait(0.2);
}

// --- Setup (initial deployment) ---------------------------------------------
async function setupFlow(session) {
  const g = game();
  const s = S();
  if (app.opts.autoSetup) {
    app.mode = 'busy';
    updateHUD();
    await wait(1.2);
    while (s.phase === 'setup') {
      if (stale(session)) return;
      const p = s.current;
      const plan = AI.planPlacement(g, p, s.setupLeft[p], s.players[p].ai || 'normal');
      for (const [ti, n] of plan) g.placeArmies(ti, n);
      g.finishSetupTurn();
    }
    TERRITORIES.forEach((_, i) => armies.set(i, colorOf(s.owner[i]), s.armies[i], { animated: true }));
    await wait(0.9);
    return startTurnFlow(session);
  }
  while (s.phase === 'setup') {
    if (stale(session)) return;
    const p = s.current;
    updateHUD();
    if (!isHuman(p)) {
      app.mode = 'ai';
      updateHUD();
      await pace(0.4, session);
      const plan = AI.planPlacement(g, p, s.setupLeft[p], s.players[p].ai);
      for (const [ti, n] of plan) {
        g.placeArmies(ti, n);
        armies.set(ti, colorOf(p), s.armies[ti]);
        await pace(0.12, session);
      }
      g.finishSetupTurn();
      continue;
    }
    await handoff(session);
    app.mode = 'setup';
    updateHUD();
    return; // continues from onTerritoryClick when this player is done
  }
  startTurnFlow(session);
}

// --- Turns --------------------------------------------------------------------
async function startTurnFlow(session) {
  if (stale(session)) return;
  const s = S();
  app.mode = isHuman(s.current) ? 'busy' : 'ai';
  app.sel = app.target = -1;
  app.placed = [];
  saveGame();
  updateHUD();
  sfx.horn();
  const p = s.players[s.current];
  banner(p.name, t('turn', { n: s.turn }), p.color);
  const br = game().reinforcementBreakdown(s.current);
  toast(`${t('reinforcements', { p: p.name, n: br.total })}${br.continents.map((c) => ` · ${t('continentBonus', { c: cName(c.c), n: c.bonus })}`).join('')}`);
  await wait(app.opts.fastAi && !isHuman(s.current) ? 0.5 : 1.2);
  if (stale(session)) return;
  if (!isHuman(s.current)) return runAI(session);
  await handoff(session);
  if (stale(session)) return;
  enterPhaseMode();
}

async function finishTurn(session) {
  const s = S();
  const p = s.current;
  const card = game().endTurn();
  if (card) {
    sfx.card();
    toast(t('cardEarned', { p: s.players[p].name }));
  }
  startTurnFlow(session);
}

// ---------------------------------------------------------------------------
// Human input
// ---------------------------------------------------------------------------
function onTerritoryClick(ti, shift) {
  const g = game();
  if (!g) return;
  const s = S();
  const me = s.current;
  switch (app.mode) {
    case 'setup': {
      if (s.owner[ti] !== me) return;
      const n = g.placeArmies(ti, shift ? 5 : 1);
      if (!n) return;
      armies.set(ti, colorOf(me), s.armies[ti]);
      if (s.setupLeft[me] === 0) {
        g.finishSetupTurn();
        saveGame();
        if (s.phase === 'setup') setupFlow(app.session);
        else startTurnFlow(app.session);
      }
      updateHUD();
      break;
    }
    case 'reinforce': {
      if (s.owner[ti] !== me) return;
      if (g.mustTradeNow()) return openCards(true);
      const n = g.placeArmies(ti, shift ? 5 : 1);
      if (!n) return;
      app.placed.push([ti, n]);
      armies.set(ti, colorOf(me), s.armies[ti]);
      if (s.reinforcements === 0 && g.finishReinforce()) {
        app.placed = [];
        app.mode = s.phase === 'attack' ? 'attack-select' : 'reinforce';
        saveGame();
      }
      updateHUD();
      break;
    }
    case 'attack-select':
    case 'attack-target': {
      if (s.owner[ti] === me) {
        if (app.sel === ti) {
          app.sel = -1;
          app.mode = 'attack-select';
        } else if (g.canAttackFrom(ti)) {
          app.sel = ti;
          app.mode = 'attack-target';
          sfx.select();
        }
      } else if (app.mode === 'attack-target' && NEIGHBORS[app.sel].includes(ti)) {
        openAttack(app.sel, ti);
      }
      updateHUD();
      break;
    }
    case 'fortify-select':
    case 'fortify-target': {
      if (s.owner[ti] !== me) return;
      if (app.mode === 'fortify-target' && ti !== app.sel && g.connectedOwn(app.sel).includes(ti)) {
        openFortify(app.sel, ti);
      } else if (app.sel === ti) {
        app.sel = -1;
        app.mode = 'fortify-select';
      } else if (g.canFortifyFrom(ti)) {
        app.sel = ti;
        app.mode = 'fortify-target';
        sfx.select();
      }
      updateHUD();
      break;
    }
    default:
  }
}

function undoPlacement() {
  const last = app.placed.pop();
  if (!last) return;
  const [ti, n] = last;
  game().unplaceArmies(ti, n);
  armies.set(ti, colorOf(S().current), S().armies[ti]);
  updateHUD();
}

function autoPlaceSetup() {
  const g = game();
  const s = S();
  const me = s.current;
  if (app.mode === 'setup') {
    for (const [ti, n] of AI.planPlacement(g, me, s.setupLeft[me], 'normal')) {
      g.placeArmies(ti, n);
      armies.set(ti, colorOf(me), s.armies[ti]);
    }
    g.finishSetupTurn();
    saveGame();
    if (s.phase === 'setup') setupFlow(app.session);
    else startTurnFlow(app.session);
  } else if (app.mode === 'reinforce' && !g.mustTradeNow()) {
    for (const [ti, n] of AI.planPlacement(g, me, s.reinforcements, 'normal')) {
      g.placeArmies(ti, n);
      armies.set(ti, colorOf(me), s.armies[ti]);
    }
    if (g.finishReinforce()) {
      app.mode = s.phase === 'attack' ? 'attack-select' : 'reinforce';
      app.placed = [];
      saveGame();
    }
  }
  updateHUD();
}

// --- Attack ------------------------------------------------------------------
function battleView(from, to) {
  const a = armies.terr[from].group.position;
  const b = armies.terr[to].group.position;
  const mid = a.clone().lerp(b, 0.5);
  const dist = Math.max(9, Math.min(20, a.distanceTo(b) * 1.5 + 6));
  return board.flyTo({ target: mid, dist, polar: 0.66, azimuth: 0 }, 1.0);
}

function isDecisive(from, to, nDice, forHuman) {
  const s = S();
  const pairs = Math.min(nDice, game().defenderDice(to));
  const lastStand = s.armies[to] <= pairs;
  const attackerDesperate = s.armies[from] - 1 <= pairs && s.armies[from] > 2;
  const defender = s.owner[to];
  const eliminates = game().territoriesOf(defender).length === 1;
  const cont = TERRITORY_CONTINENT[to];
  const continentStakes = CONTINENT_MEMBERS[cont].every((m) => m === to || s.owner[m] === defender) || CONTINENT_MEMBERS[cont].every((m) => m === to || s.owner[m] === s.current);
  if (!forHuman) return lastStand && (isHuman(defender) || eliminates) && Math.random() < 0.6;
  if (lastStand && (eliminates || continentStakes)) return true;
  if (lastStand || attackerDesperate) return Math.random() < 0.45;
  return s.armies[from] + s.armies[to] > 24 && Math.random() < 0.25;
}

function openAttack(from, to) {
  app.sel = from;
  app.target = to;
  app.mode = 'attack-dice';
  app.nDice = game().maxAttackDice(from);
  $('attack-panel').classList.remove('hidden');
  renderAttackPanel();
  battleView(from, to);
  sfx.select();
  prepareHumanDice();
  updateHUD();
}

function renderAttackPanel() {
  const s = S();
  const from = app.sel;
  const to = app.target;
  $('attack-title').textContent = t('attackTitle', { a: tName(from), d: tName(to) });
  $('att-name').innerHTML = `<span class="dot" style="background:${colorOf(s.owner[from])}"></span>${esc(s.players[s.owner[from]].name)}`;
  $('def-name').innerHTML = `<span class="dot" style="background:${colorOf(s.owner[to])}"></span>${esc(s.players[s.owner[to]].name)}`;
  $('att-count').textContent = s.armies[from];
  $('def-count').textContent = s.armies[to];
  const max = game().maxAttackDice(from);
  app.nDice = Math.min(app.nDice, max);
  const wrap = $('dice-buttons');
  wrap.innerHTML = '';
  for (let n = 1; n <= 3; n++) {
    const b = document.createElement('button');
    b.className = `die-btn${n === app.nDice ? ' active' : ''}`;
    b.textContent = n;
    b.disabled = n > max;
    b.onclick = () => {
      if (dice.state !== 'ready') return;
      app.nDice = n;
      renderAttackPanel();
      prepareHumanDice();
    };
    wrap.appendChild(b);
  }
}

function setAttackButtons(enabled) {
  for (const id of ['btn-roll', 'btn-quick', 'btn-blitz', 'btn-retreat']) $(id).disabled = !enabled;
  document.querySelectorAll('.die-btn').forEach((b) => {
    if (!enabled) b.disabled = true;
  });
}

function prepareHumanDice() {
  const s = S();
  const from = app.sel;
  const to = app.target;
  const session = app.session;
  const promise = dice.prepare({
    attackerDice: app.nDice,
    defenderDice: game().defenderDice(to),
    from: armies.terr[from].group.position,
    to: armies.terr[to].group.position,
    decisive: isDecisive(from, to, app.nDice, true),
    interactive: true,
  });
  setAttackButtons(true);
  renderAttackPanel();
  promise.then((res) => {
    if (!res || stale(session) || app.mode !== 'attack-dice') return;
    setAttackButtons(false);
    resolveBattle(from, to, app.nDice, res, session, true).then(() => afterHumanRoll(from, to, session));
  });
  return s;
}

function afterHumanRoll(from, to, session) {
  if (stale(session)) return;
  const s = S();
  if (s.phase === 'gameover') return;
  if (s.phase === 'occupy') return; // handled by the conquest flow
  if (app.mode !== 'attack-dice') return;
  if (s.owner[to] !== s.current && game().canAttackFrom(from)) {
    prepareHumanDice();
  } else {
    closeAttack();
  }
}

function closeAttack() {
  dice.cancel();
  $('attack-panel').classList.add('hidden');
  $('power').classList.remove('on');
  if (S().phase === 'attack') {
    app.mode = app.sel >= 0 && game().canAttackFrom(app.sel) ? 'attack-target' : 'attack-select';
    if (app.mode === 'attack-select') app.sel = -1;
  }
  app.target = -1;
  updateHUD();
}

// Apply one roll's result to the game, with drama and animation.
async function resolveBattle(from, to, nDice, roll, session, withDice) {
  const g = game();
  const s = S();
  const attacker = s.current;
  const r = g.attack(from, to, nDice, roll?.att, roll?.def);
  if (roll?.att && roll.att.length === 3 && roll.att.every((v) => v === 6)) {
    banner(t('tripleSix'), '', '#ffcf5a');
    sfx.fanfare();
  } else if (r.attLoss >= 2 && r.defLoss === 0 && withDice) {
    banner(t('held'), '', '#f4ecdc');
    sfx.defeat();
  } else if (r.defLoss >= 2 && r.attLoss === 0 && withDice && !r.conquered) {
    banner(t('wipeout'), '', '#ff8a80');
  }
  const outcome = withDice ? dice.showOutcome() : Promise.resolve();
  await wait(withDice ? 0.35 : 0);
  const effects = [];
  if (r.attLoss) {
    armies.floatText(from, `−${r.attLoss}`, '#ff8a80');
    effects.push(armies.set(from, colorOf(attacker), s.armies[from]));
    sfx.boom(r.attLoss > 1);
  }
  if (r.defLoss) {
    await wait(0.15);
    armies.floatText(to, `−${r.defLoss}`, '#ffe9a8');
    if (!r.conquered) effects.push(armies.set(to, colorOf(s.owner[to]), s.armies[to]));
    armies.flash(to);
    sfx.boom(r.defLoss > 1);
    board.addShake(0.15 * r.defLoss);
  }
  if (app.mode === 'attack-dice') renderAttackPanel();
  await outcome;
  if (stale(session)) return r;
  if (r.conquered) await handleConquest(r, session);
  else await Promise.all(effects);
  updateHUD();
  return r;
}

async function handleConquest(r, session) {
  const s = S();
  const g = game();
  const me = s.current;
  sfx.fanfare();
  banner(t('conquered', { t: tName(r.to) }), '', colorOf(me));
  board.setOwnerColor(r.to, colorOf(me));
  armies.set(r.to, colorOf(me), 0);
  if (r.eliminated >= 0) {
    setTimeout(() => {
      banner(t('eliminated', { p: s.players[r.eliminated].name }), '', colorOf(r.eliminated));
      sfx.defeat();
    }, 1600);
  }
  const { min, max } = s.pending;
  let n = min;
  if (isHuman(me) && max > min) {
    $('attack-panel').classList.add('hidden');
    app.mode = 'occupy';
    updateHUD();
    n = await askAmount(t('moveTitle', { t: tName(r.to) }), min, max, max, false);
  } else if (!isHuman(me)) {
    n = AI.chooseOccupy(g);
  }
  if (stale(session)) return;
  g.occupy(n);
  armies.set(r.from, colorOf(me), s.armies[r.from]);
  await armies.march(r.from, r.to, n, colorOf(me));
  await armies.set(r.to, colorOf(me), s.armies[r.to]);
  updateHUD();
  saveGame();
  if (s.phase === 'gameover') return showGameOver(session);
  if (isHuman(me)) {
    $('attack-panel').classList.add('hidden');
    dice.cancel();
    app.target = -1;
    if (s.phase === 'reinforce') {
      app.mode = 'reinforce';
      openCards(true);
    } else {
      app.sel = g.canAttackFrom(r.to) ? r.to : g.canAttackFrom(r.from) ? r.from : -1;
      app.mode = app.sel >= 0 ? 'attack-target' : 'attack-select';
    }
    updateHUD();
  }
}

async function blitz() {
  const session = app.session;
  const from = app.sel;
  const to = app.target;
  dice.cancel();
  setAttackButtons(false);
  const s = S();
  while (s.phase === 'attack' && s.owner[to] !== s.current && game().canAttackFrom(from)) {
    const r = await resolveBattle(from, to, game().maxAttackDice(from), null, session, false);
    if (stale(session) || r.conquered) return;
    await wait(0.22);
  }
  if (!stale(session) && s.phase === 'attack') closeAttack();
}

// --- Fortify -------------------------------------------------------------------
async function openFortify(from, to) {
  const s = S();
  app.mode = 'fortify-move';
  app.target = to;
  updateHUD();
  const n = await askAmount(t('fortifyTitle', { a: tName(from), b: tName(to) }), 1, s.armies[from] - 1, s.armies[from] - 1, true);
  if (n === null) {
    app.mode = 'fortify-target';
    app.target = -1;
    updateHUD();
    return;
  }
  const session = app.session;
  const moved = game().fortify(from, to, n);
  app.mode = 'busy';
  updateHUD();
  armies.set(from, colorOf(s.current), s.armies[from]);
  await armies.march(from, to, moved, colorOf(s.current));
  await armies.set(to, colorOf(s.current), s.armies[to]);
  if (stale(session)) return;
  finishTurn(session);
}

// Amount picker (occupy / fortify). Resolves with a number, or null if cancelled.
function askAmount(title, min, max, value, cancellable) {
  const panel = $('move-panel');
  const range = $('move-range');
  panel.classList.remove('hidden');
  $('move-title').textContent = title;
  range.min = min;
  range.max = max;
  range.value = value;
  const show = () => {
    $('move-value').textContent = range.value;
    $('move-unit').textContent = Number(range.value) === 1 ? t('army') : t('armies');
  };
  show();
  range.oninput = show;
  $('move-minus').onclick = () => {
    range.value = Math.max(min, Number(range.value) - 1);
    show();
  };
  $('move-plus').onclick = () => {
    range.value = Math.min(max, Number(range.value) + 1);
    show();
  };
  $('move-cancel').classList.toggle('hidden', !cancellable);
  return new Promise((res) => {
    $('move-confirm').onclick = () => {
      sfx.click();
      panel.classList.add('hidden');
      res(Number(range.value));
    };
    $('move-cancel').onclick = () => {
      panel.classList.add('hidden');
      res(null);
    };
  });
}

// --- Cards -------------------------------------------------------------------------
let cardSel = [];
let cardsForced = false;
function openCards(forced = false) {
  cardsForced = forced;
  cardSel = [];
  renderCards();
  $('cards-modal').classList.remove('hidden');
  sfx.card();
}

function renderCards() {
  const s = S();
  const viewer = isHuman(s.current) ? s.current : s.players.findIndex((p) => !p.ai);
  const hand = viewer >= 0 ? s.players[viewer].cards : [];
  $('cards-hint').textContent = (cardsForced && game().mustTradeNow() ? `${t('mustTrade')} ` : '') + t('cardsHint', { n: game().tradeValue() });
  const list = $('card-list');
  list.innerHTML = '';
  hand.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = `card${cardSel.includes(i) ? ' selected' : ''}${c.t >= 0 && s.owner[c.t] === viewer ? ' owned' : ''}`;
    el.innerHTML = `<div class="cname">${c.t >= 0 ? esc(tName(c.t)) : t('wild')}</div><div class="csym">${SYMBOL_GLYPH[c.s]}</div><div class="ctype">${t(SYMBOL_KEY[c.s])}</div>`;
    el.onclick = () => {
      if (cardSel.includes(i)) cardSel = cardSel.filter((x) => x !== i);
      else if (cardSel.length < 3) cardSel.push(i);
      sfx.click();
      renderCards();
    };
    list.appendChild(el);
  });
  const canTrade = viewer === s.current && s.phase === 'reinforce' && isHuman(s.current) && cardSel.length === 3 && Game.isSet(cardSel.map((i) => hand[i]));
  $('cards-trade').disabled = !canTrade;
  $('cards-close').disabled = cardsForced && game().mustTradeNow();
}

function tradeSelected() {
  const g = game();
  const s = S();
  const res = g.trade(cardSel);
  cardSel = [];
  sfx.fanfare();
  toast(t('tradedFor', { p: s.players[s.current].name, n: res.value }));
  if (res.bonusTerritory >= 0) {
    armies.set(res.bonusTerritory, colorOf(s.current), s.armies[res.bonusTerritory]);
    armies.floatText(res.bonusTerritory, '+2', '#9dff9d');
  }
  if (!g.mustTradeNow()) $('cards-modal').classList.add('hidden');
  else renderCards();
  app.mode = 'reinforce';
  updateHUD();
}

// ---------------------------------------------------------------------------
// AI turns
// ---------------------------------------------------------------------------
async function aiReinforce(session) {
  const g = game();
  const s = S();
  const p = s.current;
  const lvl = s.players[p].ai;
  let set;
  while ((set = AI.chooseTrade(g, p)) && (s.players[p].cards.length >= 5 || lvl !== 'easy')) {
    const res = g.trade(set);
    sfx.card();
    toast(t('tradedFor', { p: s.players[p].name, n: res.value }));
    if (res.bonusTerritory >= 0) armies.set(res.bonusTerritory, colorOf(p), s.armies[res.bonusTerritory]);
    await pace(0.5, session);
  }
  if (s.reinforcements > 0) {
    for (const [ti, n] of AI.planPlacement(g, p, s.reinforcements, lvl)) {
      if (stale(session)) return;
      g.placeArmies(ti, n);
      armies.set(ti, colorOf(p), s.armies[ti]);
      armies.floatText(ti, `+${n}`, '#bfffb0', 0.8);
      await pace(0.3, session);
    }
  }
  g.finishReinforce();
  updateHUD();
}

async function runAI(session) {
  const g = game();
  const s = S();
  const p = s.current;
  const lvl = s.players[p].ai;
  app.mode = 'ai';
  updateHUD();
  await pace(0.3, session);
  if (s.phase === 'reinforce') await aiReinforce(session);
  let k = 0;
  let lastPair = '';
  while (!stale(session) && (s.phase === 'attack' || s.phase === 'reinforce')) {
    if (s.phase === 'reinforce') {
      await aiReinforce(session);
      continue;
    }
    const a = AI.chooseAttack(g, lvl, k++);
    if (!a) break;
    app.sel = a.from;
    app.target = a.to;
    updateHUD();
    const pair = `${a.from}-${a.to}`;
    // Physical dice when a human is defending; AI-vs-AI skirmishes resolve briskly.
    const showDice = app.opts.aiDice && !app.opts.fastAi && isHuman(s.owner[a.to]);
    if (pair !== lastPair) {
      if (!app.opts.fastAi) await battleView(a.from, a.to);
      lastPair = pair;
      await pace(0.25, session);
    }
    if (stale(session)) return;
    let roll = null;
    if (showDice) {
      const defHuman = isHuman(s.owner[a.to]);
      roll = await dice.prepare({
        attackerDice: a.dice,
        defenderDice: g.defenderDice(a.to),
        from: armies.terr[a.from].group.position,
        to: armies.terr[a.to].group.position,
        decisive: isDecisive(a.from, a.to, a.dice, false),
        interactive: false,
        speed: defHuman ? 1.2 : 1.7,
      });
      if (!roll || stale(session)) return;
    }
    const r = await resolveBattle(a.from, a.to, a.dice, roll, session, showDice);
    if (stale(session)) return;
    if (s.phase === 'gameover') return;
    await pace(r.conquered ? 0.5 : showDice ? 0.2 : 0.35, session);
  }
  if (stale(session)) return;
  app.sel = app.target = -1;
  g.endAttack();
  updateHUD();
  const f = AI.chooseFortify(g, lvl);
  if (f) {
    const moved = g.fortify(f.from, f.to, f.n);
    armies.set(f.from, colorOf(p), s.armies[f.from]);
    await armies.march(f.from, f.to, moved, colorOf(p));
    await armies.set(f.to, colorOf(p), s.armies[f.to]);
  }
  await pace(0.4, session);
  if (stale(session)) return;
  finishTurn(session);
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------
async function showGameOver(session) {
  app.mode = 'gameover';
  const s = S();
  saveGame();
  updateHUD();
  await wait(1.2);
  if (stale(session)) return;
  const w = s.players[s.winner];
  $('gameover-title').textContent = t('victory', { p: w.name });
  $('gameover-title').style.color = w.color;
  $('gameover-sub').textContent = t('victorySub', { n: s.turn });
  $('gameover').classList.remove('hidden');
  sfx.victory();
  board.overview(2);
  confetti();
}

function confetti() {
  const box = $('confetti');
  box.innerHTML = '';
  const colors = ['#f6dd98', '#d9b45a', '#c0262e', '#fff', ...S().players.map((p) => p.color)];
  for (let i = 0; i < 140; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.5 + Math.random() * 3}s`;
    c.style.animationDelay = `${Math.random() * 1.5}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(c);
  }
  setTimeout(() => (box.innerHTML = ''), 7000);
}

// ---------------------------------------------------------------------------
// HUD rendering
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function banner(text, sub = '', color = null) {
  const el = $('banner');
  el.classList.remove('show');
  void el.offsetWidth;
  el.innerHTML = `${esc(text)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`;
  el.style.setProperty('--glow', color || 'rgba(255, 180, 60, 0.8)');
  el.classList.add('show');
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3300);
}

function button(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.className = `btn ${cls}`;
  b.textContent = label;
  b.onclick = () => {
    unlockAudio();
    sfx.click();
    onClick();
  };
  return b;
}

function updateHUD() {
  if (!app.game) return;
  const s = S();
  const g = game();
  // Players
  const pl = $('players');
  pl.innerHTML = '';
  s.players.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = `player-card${i === s.current ? ' current' : ''}${p.alive ? '' : ' dead'}`;
    const terr = g.territoriesOf(i).length;
    el.innerHTML = `<div class="swatch" style="background:${p.color}"></div>
      <div><div class="pname">${esc(p.name)}</div>
      <div class="pstats">${terr} ${t('territories')} · ${g.totalArmies(i)} ${t('troops')} · ${p.cards.length} 🂠</div></div>
      <div class="ptag">${p.ai ? t(p.ai) : '👤'}</div>`;
    pl.appendChild(el);
  });
  $('turn-label').textContent = t('turn', { n: s.turn });
  const cur = s.players[s.current];
  $('current-player').textContent = cur.name;
  $('current-player').style.color = cur.color;
  const phase = s.phase === 'occupy' ? 'attack' : s.phase;
  const order = ['reinforce', 'attack', 'fortify'];
  document.querySelectorAll('.phase-steps span').forEach((el) => {
    const k = order.indexOf(el.dataset.phase);
    const cur2 = order.indexOf(phase);
    el.classList.toggle('active', el.dataset.phase === phase);
    el.classList.toggle('done', cur2 > k);
    if (s.phase === 'setup') {
      el.classList.remove('active', 'done');
    }
  });
  if (s.phase === 'setup') {
    document.querySelector('.phase-steps span[data-phase="reinforce"]').textContent = t('phase.setup');
    document.querySelector('.phase-steps span[data-phase="reinforce"]').classList.add('active');
  } else {
    document.querySelector('.phase-steps span[data-phase="reinforce"]').textContent = t('phase.reinforce');
  }
  // Cards badge: the local human's hand
  const viewer = isHuman(s.current) ? s.current : s.players.findIndex((p) => !p.ai);
  $('card-count').textContent = viewer >= 0 ? s.players[viewer].cards.length : 0;
  renderActions();
  renderLog();
  applyHighlights();
  syncArrows();
}

function renderActions() {
  const s = S();
  const g = game();
  const hint = $('hint');
  const actions = $('actions');
  actions.innerHTML = '';
  const cur = s.players[s.current];
  switch (app.mode) {
    case 'setup': {
      hint.innerHTML = t('hint.setup', { n: `<b>${s.setupLeft[s.current]}</b>` });
      actions.append(button(t('autoPlace'), autoPlaceSetup));
      break;
    }
    case 'reinforce': {
      if (g.mustTradeNow()) {
        hint.innerHTML = t('hint.reinforceCards');
        actions.append(button(t('cards'), () => openCards(true), 'gold'));
        break;
      }
      const count = document.createElement('div');
      count.className = 'reinforce-count';
      count.textContent = s.reinforcements;
      hint.innerHTML = t('hint.reinforce', { n: `<b>${s.reinforcements}</b>` });
      if (g.findSets(s.current).length) actions.append(button(t('tradeCards'), () => openCards(false)));
      if (app.placed.length) actions.append(button(t('undo'), undoPlacement));
      actions.append(button(t('autoPlace'), autoPlaceSetup));
      actions.prepend(count);
      break;
    }
    case 'attack-select':
      hint.innerHTML = t('hint.attackSelect');
      actions.append(button(t('endAttack'), endAttackPhase, 'gold'));
      break;
    case 'attack-target':
      hint.innerHTML = t('hint.attackTarget', { t: `<b>${esc(tName(app.sel))}</b>` });
      actions.append(button(t('endAttack'), endAttackPhase, 'gold'));
      break;
    case 'attack-dice':
      hint.innerHTML = t('hint.dice');
      break;
    case 'occupy':
      hint.innerHTML = t('moveArmies');
      break;
    case 'fortify-select':
      hint.innerHTML = t('hint.fortifySelect');
      actions.append(button(t('endTurn'), () => finishTurn(app.session), 'gold'));
      break;
    case 'fortify-target':
    case 'fortify-move':
      hint.innerHTML = t('hint.fortifyTarget', { t: `<b>${esc(tName(app.sel))}</b>` });
      actions.append(button(t('endTurn'), () => finishTurn(app.session), 'gold'));
      break;
    case 'ai':
      hint.innerHTML = `<span class="dot" style="background:${cur.color}"></span>${t('hint.aiThinking', { p: esc(cur.name) })}`;
      break;
    default:
      hint.innerHTML = s.phase === 'gameover' ? t('victory', { p: esc(s.players[s.winner]?.name || '') }) : '…';
  }
}

function endAttackPhase() {
  if (dice.state !== 'idle') dice.cancel();
  $('attack-panel').classList.add('hidden');
  game().endAttack();
  app.sel = app.target = -1;
  app.mode = 'fortify-select';
  saveGame();
  updateHUD();
}

function renderLog() {
  const s = S();
  const el = $('log');
  const name = (p) => `<span style="color:${s.players[p].color};font-weight:700">${esc(s.players[p].name)}</span>`;
  el.innerHTML = s.log
    .slice(-40)
    .reverse()
    .map((e) => {
      const p = { ...e.p };
      if ('p' in p) p.p = name(p.p);
      for (const k of ['a', 'd', 't', 'b']) if (k in p) p[k] = esc(tName(p[k]));
      return `<div>${t(e.k, p)}</div>`;
    })
    .join('');
}

// Attack arrows follow the interaction state: gold arcs to every possible
// target while choosing, one red arc for the chosen battle until it is over.
function syncArrows() {
  if (!app.game || app.mode === 'menu') return arrows.clear();
  const s = S();
  const inBattle = s.phase === 'attack' || s.phase === 'occupy';
  if (app.mode === 'attack-target' && app.sel >= 0 && isHuman(s.current)) {
    arrows.options(app.sel, game().attackTargets(app.sel));
  } else if (inBattle && app.sel >= 0 && app.target >= 0 && ['attack-dice', 'occupy', 'ai'].includes(app.mode)) {
    arrows.lock(app.sel, app.target);
  } else {
    arrows.clear();
  }
}

function applyHighlights() {
  if (!app.game) return;
  arrows.setHover(app.hover);
  const s = S();
  const g = game();
  const me = s.current;
  const humanTurn = isHuman(me);
  let targets = new Set();
  if (app.mode === 'attack-target' && app.sel >= 0) targets = new Set(g.attackTargets(app.sel));
  if ((app.mode === 'fortify-target' || app.mode === 'fortify-move') && app.sel >= 0) targets = new Set(g.connectedOwn(app.sel));
  TERRITORIES.forEach((_, i) => {
    let dim = false;
    if (humanTurn) {
      if (app.mode === 'setup' || app.mode === 'reinforce') dim = s.owner[i] !== me;
      else if (app.mode === 'attack-select') dim = !g.canAttackFrom(i);
      else if (app.mode === 'attack-target') dim = i !== app.sel && !targets.has(i) && !g.canAttackFrom(i);
      else if (app.mode === 'fortify-select') dim = !g.canFortifyFrom(i);
      else if (app.mode === 'fortify-target') dim = i !== app.sel && !targets.has(i);
    }
    const battle = app.mode === 'attack-dice' || app.mode === 'ai' || app.mode === 'occupy' || app.mode === 'fortify-move';
    board.setHighlight(i, {
      hover: i === app.hover,
      selected: i === app.sel,
      target: targets.has(i) || (battle && i === app.target),
      dim,
    });
  });
}

function showTooltip(ti, x, y) {
  const tip = $('tooltip');
  if (ti < 0 || !app.game) {
    tip.classList.add('hidden');
    return;
  }
  const s = S();
  const o = s.owner[ti];
  tip.innerHTML = `<div class="tt-name">${esc(tName(ti))}</div>
    <div class="tt-row"><span>${t('continent')}</span><b>${esc(cName(TERRITORY_CONTINENT[ti]))}</b></div>
    <div class="tt-row"><span>${t('owner')}</span><b><span class="dot" style="background:${colorOf(o)}"></span>${esc(s.players[o].name)}</b></div>
    <div class="tt-row"><span>${t('troops')}</span><b>${s.armies[ti]}</b></div>`;
  tip.classList.remove('hidden');
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.min(window.innerWidth - w - 10, x + 18)}px`;
  tip.style.top = `${Math.min(window.innerHeight - h - 10, y + 18)}px`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function wireUI() {
  const canvas = board.renderer.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, button: e.button };
    unlockAudio();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (down.button === 0 && moved < 6 && app.mode !== 'menu') {
      const { territory } = board.pick(e.clientX, e.clientY);
      if (territory >= 0) onTerritoryClick(territory, e.shiftKey);
    }
    down = null;
  });
  let hoverQueued = null;
  window.addEventListener('pointermove', (e) => {
    dice.setPointer(e.clientX, e.clientY);
    if (e.target !== canvas) {
      if (app.hover !== -1) {
        app.hover = -1;
        applyHighlights();
      }
      showTooltip(-1);
      return;
    }
    if (!hoverQueued) {
      requestAnimationFrame(() => {
        const ev = hoverQueued;
        hoverQueued = null;
        if (app.mode === 'menu' || !app.game) return;
        const { territory } = board.pick(ev.clientX, ev.clientY);
        if (territory !== app.hover) {
          app.hover = territory;
          applyHighlights();
        }
        showTooltip(dice.state === 'shaking' ? -1 : territory, ev.clientX, ev.clientY);
      });
    }
    hoverQueued = e;
  });

  // Dice shaking: hold the roll button (or Space), move to aim, release to throw.
  const roll = $('btn-roll');
  const startShake = () => {
    if (app.mode !== 'attack-dice' || dice.state !== 'ready') return;
    unlockAudio();
    dice.beginShake();
    roll.classList.add('shaking');
  };
  const endShake = () => {
    roll.classList.remove('shaking');
    if (dice.state === 'shaking') dice.release();
  };
  roll.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dice.setPointer(e.clientX, e.clientY);
    startShake();
  });
  window.addEventListener('pointerup', endShake);
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      startShake();
    }
    if (e.key === 'o' || e.key === 'O') board.overview();
    if (e.key === 'Escape') {
      if (app.mode === 'attack-dice' && dice.state === 'ready') closeAttack();
      else if (app.mode === 'attack-target' || app.mode === 'fortify-target') {
        app.sel = -1;
        app.mode = app.mode === 'attack-target' ? 'attack-select' : 'fortify-select';
        updateHUD();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') endShake();
  });
  $('btn-quick').onclick = () => {
    unlockAudio();
    if (dice.state === 'ready') dice.autoThrow();
  };
  $('btn-blitz').onclick = () => {
    unlockAudio();
    if (dice.state === 'ready') blitz();
  };
  $('btn-retreat').onclick = () => {
    sfx.click();
    closeAttack();
  };

  // Menu
  $('btn-new').onclick = () => {
    unlockAudio();
    sfx.click();
    defaultSetup();
    renderSetup();
    showScreen('setup');
  };
  $('btn-continue').onclick = () => {
    unlockAudio();
    sfx.click();
    continueGame();
  };
  $('btn-rules').onclick = () => {
    sfx.click();
    app.rulesBack = 'menu';
    showScreen('rules');
  };
  $('btn-rules-back').onclick = () => {
    sfx.click();
    if (app.rulesBack === 'game') {
      showScreen(null);
      $('pause').classList.remove('hidden');
    } else showScreen('menu');
  };
  document.querySelectorAll('.lang-switch button').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      setLang(b.dataset.lang);
    };
  });
  $('btn-add-player').onclick = () => {
    sfx.click();
    const used = new Set(setupPlayers.map((p) => p.color));
    const names = t('aiNames').split(',');
    setupPlayers.push({ name: names[setupPlayers.length % names.length], color: PALETTE.find((c) => !used.has(c)), type: 'normal' });
    renderSetup();
  };
  $('btn-setup-back').onclick = () => {
    sfx.click();
    showScreen('menu');
  };
  $('btn-start').onclick = () => {
    sfx.click();
    startNewGame();
  };

  // HUD buttons
  $('btn-cards').onclick = () => app.game && openCards(false);
  $('cards-close').onclick = () => {
    sfx.click();
    $('cards-modal').classList.add('hidden');
  };
  $('cards-trade').onclick = tradeSelected;
  $('btn-overview').onclick = () => board.overview();
  const soundBtn = $('btn-sound');
  const musicBtn = $('btn-music');
  const refreshAudioBtns = () => {
    soundBtn.classList.toggle('off', !isSoundOn());
    soundBtn.textContent = isSoundOn() ? '🔊' : '🔇';
    musicBtn.classList.toggle('off', !isMusicOn());
  };
  soundBtn.onclick = () => {
    setSound(!isSoundOn());
    refreshAudioBtns();
  };
  musicBtn.onclick = () => {
    setMusic(!isMusicOn());
    refreshAudioBtns();
  };
  refreshAudioBtns();
  $('btn-lang').onclick = () => setLang(getLang() === 'en' ? 'de' : 'en');
  $('btn-menu').onclick = () => {
    sfx.click();
    app.paused = true;
    $('opt-tint').checked = app.opts.tint;
    $('opt-fastai2').checked = app.opts.fastAi;
    $('opt-aidice2').checked = app.opts.aiDice;
    $('pause').classList.remove('hidden');
  };
  $('pause-resume').onclick = () => {
    sfx.click();
    app.paused = false;
    $('pause').classList.add('hidden');
  };
  $('pause-rules').onclick = () => {
    $('pause').classList.add('hidden');
    app.rulesBack = 'game';
    showScreen('rules');
  };
  $('pause-menu').onclick = () => {
    app.paused = false;
    saveGame();
    showMenu();
  };
  $('opt-tint').onchange = (e) => {
    app.opts.tint = e.target.checked;
    board.setTint(app.opts.tint ? 0.42 : 0);
    saveOpts();
  };
  $('opt-fastai2').onchange = (e) => {
    app.opts.fastAi = e.target.checked;
    saveOpts();
  };
  $('opt-aidice2').onchange = (e) => {
    app.opts.aiDice = e.target.checked;
    saveOpts();
  };
  $('log-toggle').onclick = () => $('log-panel').classList.toggle('collapsed');
  $('gameover-menu').onclick = () => {
    $('gameover').classList.add('hidden');
    showMenu();
  };
  $('gameover-again').onclick = () => {
    $('gameover').classList.add('hidden');
    defaultSetup();
    renderSetup();
    showScreen('setup');
  };

  onLangChange(() => {
    applyStaticText();
    updateLangButtons();
    repaintBoard();
    if ($('setup').classList.contains('visible')) renderSetup();
    if (app.game) {
      updateHUD();
      if (app.mode === 'attack-dice') renderAttackPanel();
    }
  });
}

// Debug handle for the browser console.
window.__wc = {
  app,
  get board() {
    return board;
  },
  get armies() {
    return armies;
  },
  get dice() {
    return dice;
  },
};

boot().catch((err) => {
  console.error(err);
  document.querySelector('.loading-text').textContent = `Error: ${err.message}`;
});
