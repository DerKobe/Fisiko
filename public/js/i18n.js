// English / German translations.
import { TERRITORIES, CONTINENTS } from './data/world.js';

const STRINGS = {
  en: {
    title: 'World Conquest',
    subtitle: 'A game of strategic domination',
    mapSubtitle: 'Tabula Imperii Mundi',
    legendTitle: 'Continent Bonus',
    oceans: 'Pacific Ocean|Atlantic Ocean|Indian Ocean',
    compass: 'NESW',
    loading: 'Charting the known world…',
    'stage.rasterize': 'Surveying coastlines…',
    'stage.distances': 'Measuring the seas…',
    'stage.borders': 'Drawing borders…',
    'stage.relief': 'Raising mountains…',
    'stage.normals': 'Carving valleys…',
    'stage.paint': 'Painting the map…',
    'stage.done': 'Polishing the figurines…',
    newGame: 'New Game',
    continueGame: 'Continue',
    howToPlay: 'How to Play',
    settings: 'Settings',
    language: 'Language',
    back: 'Back',
    start: 'Start Campaign',
    players: 'Commanders',
    addPlayer: 'Add commander',
    human: 'Human',
    ai: 'Computer',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
    options: 'Options',
    autoSetup: 'Place starting armies automatically',
    fastAi: 'Fast computer turns',
    aiDice: 'Show computer dice rolls',
    ownerTint: 'Tint territories in owner colour',
    sound: 'Sound',
    music: 'Ambient music',
    defaultName: 'Commander {n}',
    aiNames: 'Napoleon,Caesar,Genghis,Alexander,Hannibal,Cleopatra,Boudica,Saladin',
    // phases
    'phase.setup': 'Deployment',
    'phase.reinforce': 'Reinforce',
    'phase.attack': 'Attack',
    'phase.occupy': 'Advance',
    'phase.fortify': 'Fortify',
    'phase.gameover': 'Victory',
    turn: 'Turn {n}',
    // instructions
    'hint.setup': 'Place your starting armies: {n} left. Click your territories.',
    'hint.reinforce': 'Deploy {n} reinforcements. Click your territories (Shift: +5).',
    'hint.reinforceCards': 'You hold 5 or more cards — you must trade a set first.',
    'hint.attackSelect': 'Select one of your territories with at least 2 armies to attack from.',
    'hint.attackTarget': 'Choose an enemy territory adjacent to {t}.',
    'hint.fortifySelect': 'Optionally move armies once: pick a territory to move from.',
    'hint.fortifyTarget': 'Pick a connected territory of yours to move armies from {t} to.',
    'hint.aiThinking': '{p} is planning the next move…',
    'hint.dice': 'Hold the button (or Space) to shake the dice, move the mouse and release to throw!',
    endAttack: 'End Attack',
    endTurn: 'End Turn',
    skipFortify: 'End Turn',
    undo: 'Undo',
    autoPlace: 'Auto-place',
    cards: 'Cards',
    tradeCards: 'Trade Set',
    cardsTitle: 'Territory Cards',
    cardsHint: 'Trade three matching cards or one of each symbol. Next set: {n} armies.',
    mustTrade: 'You must trade before continuing.',
    close: 'Close',
    infantry: 'Infantry',
    cavalry: 'Cavalry',
    artillery: 'Artillery',
    wild: 'Wild',
    // attack
    attackTitle: '{a} attacks {d}',
    attackerDice: 'Attacker dice',
    defenderDice: 'Defender dice',
    holdToRoll: 'Hold to Shake · Release to Roll',
    quickRoll: 'Quick Roll',
    blitz: 'Blitz',
    retreat: 'Retreat',
    armies: 'armies',
    army: 'army',
    moveArmies: 'Advance armies',
    moveTitle: 'Move armies into {t}',
    fortifyTitle: 'Move armies from {a} to {b}',
    confirm: 'Confirm',
    cancel: 'Cancel',
    // events
    conquered: '{t} conquered!',
    held: 'The line holds!',
    tripleSix: 'Triple six!',
    wipeout: 'Devastating blow!',
    eliminated: '{p} has been eliminated!',
    cardEarned: '{p} earns a territory card',
    newCard: 'New territory card!',
    yourCards: 'Your cards',
    newBadge: 'NEW',
    continue: 'Continue',
    setReady: 'You hold a complete set: trade it next turn for {n} armies.',
    mustTradeNext: 'With {c} cards you must trade a set next turn ({n} armies).',
    noSetYet: 'Collect three of a kind or one of each symbol to trade a set.',
    ownedHint: '★ = your territory (+2 armies there when traded)',
    tradedFor: '{p} trades cards for {n} armies',
    continentBonus: '{c} +{n}',
    reinforcements: '{p} receives {n} armies',
    yourTurn: "{p}, it's your turn",
    ready: 'Ready',
    victory: '{p} conquers the world!',
    victorySub: 'After {n} turns of war, the world bows to a single banner.',
    playAgain: 'Play Again',
    mainMenu: 'Main Menu',
    log: 'War Journal',
    logAttack: '{p}: {a} ⚔ {d} — lost {al}, defender lost {dl}',
    logConquer: '{p} captured {t}',
    logFortify: '{p} moved {n} from {a} to {b}',
    logTrade: '{p} traded cards for {n}',
    logReinforce: '{p} received {n} reinforcements',
    territories: 'Territories',
    troops: 'Armies',
    owner: 'Held by',
    neutral: 'Unclaimed',
    continent: 'Continent',
    bonus: 'bonus',
    confirmNew: 'Abandon the current campaign?',
    menu: 'Menu',
    resume: 'Resume',
    overview: 'Overview',
    rulesHtml: `
      <h3>Objective</h3><p>Conquer all 42 territories and eliminate every rival commander.</p>
      <h3>Your turn</h3>
      <ol>
        <li><b>Reinforce:</b> receive armies equal to your territories ÷ 3 (at least 3), plus bonuses for every continent you fully control, plus any card trades. Place them on your territories.</li>
        <li><b>Attack:</b> attack adjacent enemy territories (dashed lines are sea routes). The attacker rolls up to 3 dice (one fewer than the armies in the territory), the defender up to 2. Highest dice are compared pairwise; ties go to the defender. Keep attacking as long as you like.</li>
        <li><b>Fortify:</b> once per turn, move armies between two of your territories connected through your own lands.</li>
      </ol>
      <h3>Cards</h3><p>Conquer at least one territory in a turn to earn a card. Trade three of a kind or one of each (infantry, cavalry, artillery; wild cards count as anything) for escalating reinforcements: 4, 6, 8, 10, 12, 15, then +5 each. Owning a pictured territory gives +2 armies there. With 5+ cards you must trade.</p>
      <h3>Dice</h3><p>Press and hold <b>Roll</b> (or the Space bar) to shake the dice in your hand — move the mouse to aim and release to fling them across the board. The longer you shake, the wilder the throw!</p>
      <h3>Controls</h3><p>Left-click: select · Left-drag: pan · Right-drag: rotate · Wheel: zoom · <b>O</b>: overview.</p>`,
  },
  de: {
    title: 'Welteroberung',
    subtitle: 'Ein Spiel der strategischen Weltherrschaft',
    mapSubtitle: 'Tabula Imperii Mundi',
    legendTitle: 'Kontinentbonus',
    oceans: 'Pazifischer Ozean|Atlantischer Ozean|Indischer Ozean',
    compass: 'NOSW',
    loading: 'Die bekannte Welt wird kartiert…',
    'stage.rasterize': 'Küstenlinien werden vermessen…',
    'stage.distances': 'Die Meere werden ausgelotet…',
    'stage.borders': 'Grenzen werden gezogen…',
    'stage.relief': 'Gebirge werden aufgetürmt…',
    'stage.normals': 'Täler werden gemeißelt…',
    'stage.paint': 'Die Karte wird bemalt…',
    'stage.done': 'Die Figuren werden poliert…',
    newGame: 'Neues Spiel',
    continueGame: 'Fortsetzen',
    howToPlay: 'Spielregeln',
    settings: 'Einstellungen',
    language: 'Sprache',
    back: 'Zurück',
    start: 'Feldzug beginnen',
    players: 'Feldherren',
    addPlayer: 'Feldherr hinzufügen',
    human: 'Mensch',
    ai: 'Computer',
    easy: 'Leicht',
    normal: 'Normal',
    hard: 'Schwer',
    options: 'Optionen',
    autoSetup: 'Startarmeen automatisch verteilen',
    fastAi: 'Schnelle Computerzüge',
    aiDice: 'Würfe des Computers zeigen',
    ownerTint: 'Gebiete in Besitzerfarbe tönen',
    sound: 'Ton',
    music: 'Hintergrundmusik',
    defaultName: 'Feldherr {n}',
    aiNames: 'Napoleon,Cäsar,Dschingis,Alexander,Hannibal,Kleopatra,Boudicca,Saladin',
    'phase.setup': 'Aufstellung',
    'phase.reinforce': 'Verstärken',
    'phase.attack': 'Angreifen',
    'phase.occupy': 'Nachrücken',
    'phase.fortify': 'Befestigen',
    'phase.gameover': 'Sieg',
    turn: 'Runde {n}',
    'hint.setup': 'Stelle deine Startarmeen auf: noch {n}. Klicke auf deine Gebiete.',
    'hint.reinforce': 'Setze {n} Verstärkungen ein. Klicke auf deine Gebiete (Umschalt: +5).',
    'hint.reinforceCards': 'Du hast 5 oder mehr Karten — tausche zuerst ein Set ein.',
    'hint.attackSelect': 'Wähle ein eigenes Gebiet mit mindestens 2 Armeen als Ausgangspunkt.',
    'hint.attackTarget': 'Wähle ein feindliches Nachbargebiet von {t}.',
    'hint.fortifySelect': 'Optional einmal Armeen verschieben: wähle das Ausgangsgebiet.',
    'hint.fortifyTarget': 'Wähle ein verbundenes eigenes Gebiet als Ziel für Armeen aus {t}.',
    'hint.aiThinking': '{p} plant den nächsten Zug…',
    'hint.dice': 'Halte den Knopf (oder die Leertaste), um die Würfel zu schütteln, ziele mit der Maus und lass los!',
    endAttack: 'Angriff beenden',
    endTurn: 'Zug beenden',
    skipFortify: 'Zug beenden',
    undo: 'Rückgängig',
    autoPlace: 'Automatisch',
    cards: 'Karten',
    tradeCards: 'Set eintauschen',
    cardsTitle: 'Gebietskarten',
    cardsHint: 'Tausche drei gleiche Karten oder je eine von jedem Symbol. Nächstes Set: {n} Armeen.',
    mustTrade: 'Du musst zuerst eintauschen.',
    close: 'Schließen',
    infantry: 'Infanterie',
    cavalry: 'Kavallerie',
    artillery: 'Artillerie',
    wild: 'Joker',
    attackTitle: '{a} greift {d} an',
    attackerDice: 'Angreiferwürfel',
    defenderDice: 'Verteidigerwürfel',
    holdToRoll: 'Halten zum Schütteln · Loslassen zum Würfeln',
    quickRoll: 'Schnellwurf',
    blitz: 'Blitzangriff',
    retreat: 'Rückzug',
    armies: 'Armeen',
    army: 'Armee',
    moveArmies: 'Armeen nachrücken',
    moveTitle: 'Armeen nach {t} verlegen',
    fortifyTitle: 'Armeen von {a} nach {b} verlegen',
    confirm: 'Bestätigen',
    cancel: 'Abbrechen',
    conquered: '{t} erobert!',
    held: 'Die Stellung hält!',
    tripleSix: 'Dreifache Sechs!',
    wipeout: 'Vernichtender Schlag!',
    eliminated: '{p} wurde ausgelöscht!',
    cardEarned: '{p} erhält eine Gebietskarte',
    newCard: 'Neue Gebietskarte!',
    yourCards: 'Deine Karten',
    newBadge: 'NEU',
    continue: 'Weiter',
    setReady: 'Du hast ein vollständiges Set: Tausche es nächste Runde gegen {n} Armeen ein.',
    mustTradeNext: 'Mit {c} Karten musst du nächste Runde ein Set eintauschen ({n} Armeen).',
    noSetYet: 'Sammle drei gleiche oder je ein Symbol, um ein Set einzutauschen.',
    ownedHint: '★ = dein Gebiet (+2 Armeen dort beim Eintausch)',
    tradedFor: '{p} tauscht Karten gegen {n} Armeen',
    continentBonus: '{c} +{n}',
    reinforcements: '{p} erhält {n} Armeen',
    yourTurn: '{p}, du bist am Zug',
    ready: 'Bereit',
    victory: '{p} erobert die Welt!',
    victorySub: 'Nach {n} Runden Krieg beugt sich die Welt einem einzigen Banner.',
    playAgain: 'Nochmal spielen',
    mainMenu: 'Hauptmenü',
    log: 'Kriegstagebuch',
    logAttack: '{p}: {a} ⚔ {d} — verlor {al}, Verteidiger verlor {dl}',
    logConquer: '{p} eroberte {t}',
    logFortify: '{p} verlegte {n} von {a} nach {b}',
    logTrade: '{p} tauschte Karten gegen {n}',
    logReinforce: '{p} erhielt {n} Verstärkungen',
    territories: 'Gebiete',
    troops: 'Armeen',
    owner: 'Besitzer',
    neutral: 'Unbesetzt',
    continent: 'Kontinent',
    bonus: 'Bonus',
    confirmNew: 'Den laufenden Feldzug aufgeben?',
    menu: 'Menü',
    resume: 'Weiter',
    overview: 'Übersicht',
    rulesHtml: `
      <h3>Ziel</h3><p>Erobere alle 42 Gebiete und schalte jeden gegnerischen Feldherrn aus.</p>
      <h3>Dein Zug</h3>
      <ol>
        <li><b>Verstärken:</b> Du erhältst Armeen in Höhe deiner Gebiete ÷ 3 (mindestens 3), dazu Boni für jeden vollständig kontrollierten Kontinent sowie Karteneintausch. Verteile sie auf deine Gebiete.</li>
        <li><b>Angreifen:</b> Greife benachbarte feindliche Gebiete an (gestrichelte Linien sind Seewege). Der Angreifer würfelt mit bis zu 3 Würfeln (eine Armee muss zurückbleiben), der Verteidiger mit bis zu 2. Die höchsten Würfel werden paarweise verglichen; bei Gleichstand gewinnt der Verteidiger. Greife so oft an, wie du willst.</li>
        <li><b>Befestigen:</b> Einmal pro Zug darfst du Armeen zwischen zwei eigenen, über eigene Gebiete verbundenen Ländern verschieben.</li>
      </ol>
      <h3>Karten</h3><p>Erobere mindestens ein Gebiet pro Zug, um eine Karte zu erhalten. Tausche drei gleiche oder je eine von jeder Sorte (Infanterie, Kavallerie, Artillerie; Joker zählen als alles) gegen steigende Verstärkungen: 4, 6, 8, 10, 12, 15, danach jeweils +5. Besitzt du ein abgebildetes Gebiet, erhältst du dort +2 Armeen. Ab 5 Karten musst du tauschen.</p>
      <h3>Würfel</h3><p>Halte <b>Würfeln</b> (oder die Leertaste) gedrückt, um die Würfel in der Hand zu schütteln — ziele mit der Maus und lass los, um sie über das Brett zu schleudern. Je länger du schüttelst, desto wilder der Wurf!</p>
      <h3>Steuerung</h3><p>Linksklick: auswählen · Linke Maustaste ziehen: verschieben · Rechte Maustaste ziehen: drehen · Mausrad: zoomen · <b>O</b>: Übersicht.</p>`,
  },
};

let lang = 'en';
try {
  const saved = localStorage.getItem('wc-lang');
  if (saved === 'en' || saved === 'de') lang = saved;
  else if ((navigator.language || '').toLowerCase().startsWith('de')) lang = 'de';
} catch {
  /* storage unavailable */
}

const listeners = new Set();

export const getLang = () => lang;

export function setLang(l) {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem('wc-lang', l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

export const onLangChange = (fn) => listeners.add(fn);

export function t(key, params = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

export const tName = (i) => TERRITORIES[i].name[lang];
export const cName = (i) => CONTINENTS[i].name[lang];

// Fill every [data-i18n] element in the document.
export function applyStaticText(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
}
