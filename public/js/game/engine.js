// Classic world-conquest rules. Pure game state + rules, no rendering.
import { TERRITORIES, NEIGHBORS, CONTINENTS, CONTINENT_MEMBERS } from '../data/world.js';

export const PHASES = ['setup', 'reinforce', 'attack', 'occupy', 'fortify', 'gameover'];
export const SYMBOLS = ['infantry', 'cavalry', 'artillery', 'wild'];
const START_ARMIES = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
const T = TERRITORIES.length;

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const rollDie = () => 1 + Math.floor(Math.random() * 6);

export class Game {
  constructor(state) {
    this.s = state;
  }

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------
  static create({ players, options = {} }) {
    const n = players.length;
    const order = shuffle(Array.from({ length: T }, (_, i) => i));
    const owner = new Array(T).fill(-1);
    const armies = new Array(T).fill(0);
    const first = Math.floor(Math.random() * n);
    order.forEach((ti, k) => {
      owner[ti] = (first + k) % n;
      armies[ti] = 1;
    });
    const setupLeft = players.map((_, p) => START_ARMIES[n] - owner.filter((o) => o === p).length);
    const deck = shuffle([...TERRITORIES.map((_, i) => ({ t: i, s: i % 3 })), { t: -1, s: 3 }, { t: -1, s: 3 }]);
    const s = {
      version: 1,
      players: players.map((p) => ({ name: p.name, color: p.color, ai: p.ai || null, alive: true, cards: [] })),
      owner,
      armies,
      current: first,
      first,
      phase: 'setup',
      turn: 1,
      setupLeft,
      reinforcements: 0,
      conquered: false,
      deck,
      discard: [],
      tradeCount: 0,
      pending: null,
      mustTrade: false,
      afterTrade: null,
      winner: null,
      stats: players.map(() => ({ conquered: 0, lost: 0, rolls: 0 })),
      log: [],
      options,
    };
    return new Game(s);
  }

  get state() {
    return this.s;
  }
  get player() {
    return this.s.players[this.s.current];
  }

  log(k, p) {
    this.s.log.push({ k, p, turn: this.s.turn });
    if (this.s.log.length > 150) this.s.log.shift();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  territoriesOf(p) {
    const out = [];
    for (let i = 0; i < T; i++) if (this.s.owner[i] === p) out.push(i);
    return out;
  }

  totalArmies(p) {
    let n = 0;
    for (let i = 0; i < T; i++) if (this.s.owner[i] === p) n += this.s.armies[i];
    return n;
  }

  ownsContinent(p, c) {
    return CONTINENT_MEMBERS[c].every((t) => this.s.owner[t] === p);
  }

  reinforcementBreakdown(p) {
    const count = this.territoriesOf(p).length;
    const base = Math.max(3, Math.floor(count / 3));
    const continents = [];
    CONTINENTS.forEach((c, ci) => {
      if (this.ownsContinent(p, ci)) continents.push({ c: ci, bonus: c.bonus });
    });
    return { base, continents, total: base + continents.reduce((a, b) => a + b.bonus, 0) };
  }

  canAttackFrom(t) {
    const s = this.s;
    return s.owner[t] === s.current && s.armies[t] >= 2 && NEIGHBORS[t].some((n) => s.owner[n] !== s.current);
  }

  attackTargets(t) {
    return NEIGHBORS[t].filter((n) => this.s.owner[n] !== this.s.owner[t]);
  }

  maxAttackDice(t) {
    return Math.min(3, this.s.armies[t] - 1);
  }

  defenderDice(t) {
    return Math.min(2, this.s.armies[t]);
  }

  // Own territories reachable from t through own territories.
  connectedOwn(t) {
    const p = this.s.owner[t];
    const seen = new Set([t]);
    const stack = [t];
    while (stack.length) {
      const c = stack.pop();
      for (const n of NEIGHBORS[c]) {
        if (!seen.has(n) && this.s.owner[n] === p) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    seen.delete(t);
    return [...seen];
  }

  canFortifyFrom(t) {
    return this.s.owner[t] === this.s.current && this.s.armies[t] >= 2 && this.connectedOwn(t).length > 0;
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  tradeValue(k = this.s.tradeCount) {
    const seq = [4, 6, 8, 10, 12, 15];
    return k < seq.length ? seq[k] : 15 + (k - 5) * 5;
  }

  static isSet(cards) {
    if (cards.length !== 3) return false;
    const wild = cards.filter((c) => c.s === 3).length;
    const syms = cards.filter((c) => c.s !== 3).map((c) => c.s);
    if (wild >= 1) return true;
    const uniq = new Set(syms).size;
    return uniq === 1 || uniq === 3;
  }

  // All valid sets in a hand, best first (prefer sets using owned territories, avoid wasting wilds).
  findSets(p) {
    const hand = this.s.players[p].cards;
    const sets = [];
    for (let a = 0; a < hand.length; a++)
      for (let b = a + 1; b < hand.length; b++)
        for (let c = b + 1; c < hand.length; c++) {
          const cards = [hand[a], hand[b], hand[c]];
          if (!Game.isSet(cards)) continue;
          const owned = cards.some((x) => x.t >= 0 && this.s.owner[x.t] === p) ? 1 : 0;
          const wilds = cards.filter((x) => x.s === 3).length;
          sets.push({ idx: [a, b, c], score: owned * 2 - wilds });
        }
    return sets.sort((x, y) => y.score - x.score).map((x) => x.idx);
  }

  mustTradeNow() {
    const s = this.s;
    return s.phase === 'reinforce' && this.player.cards.length >= 5 && this.findSets(s.current).length > 0;
  }

  trade(indices) {
    const s = this.s;
    const p = s.current;
    if (s.phase !== 'reinforce') throw new Error('Trading only during reinforcement');
    const hand = s.players[p].cards;
    const cards = indices.map((i) => hand[i]);
    if (!Game.isSet(cards)) throw new Error('Not a valid set');
    const value = this.tradeValue();
    s.tradeCount++;
    s.players[p].cards = hand.filter((_, i) => !indices.includes(i));
    s.discard.push(...cards);
    s.reinforcements += value;
    let bonusTerritory = -1;
    const owned = cards.find((c) => c.t >= 0 && s.owner[c.t] === p);
    if (owned) {
      bonusTerritory = owned.t;
      s.armies[owned.t] += 2;
    }
    this.log('logTrade', { p, n: value });
    return { value, bonusTerritory };
  }

  drawCard(p) {
    const s = this.s;
    if (!s.deck.length) {
      s.deck = shuffle(s.discard);
      s.discard = [];
    }
    const card = s.deck.pop();
    if (card) s.players[p].cards.push(card);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Setup & reinforcement
  // ---------------------------------------------------------------------------
  placeArmies(t, n = 1) {
    const s = this.s;
    if (s.owner[t] !== s.current) throw new Error('Not your territory');
    if (s.phase === 'setup') {
      n = Math.min(n, s.setupLeft[s.current]);
      if (n <= 0) return 0;
      s.armies[t] += n;
      s.setupLeft[s.current] -= n;
      return n;
    }
    if (s.phase === 'reinforce') {
      if (this.mustTradeNow()) throw new Error('Must trade first');
      n = Math.min(n, s.reinforcements);
      if (n <= 0) return 0;
      s.armies[t] += n;
      s.reinforcements -= n;
      return n;
    }
    throw new Error('Cannot place now');
  }

  unplaceArmies(t, n = 1) {
    // Used by the UI's undo for the current placement batch.
    const s = this.s;
    s.armies[t] -= n;
    if (s.phase === 'setup') s.setupLeft[s.current] += n;
    else s.reinforcements += n;
  }

  // After a setup player is done, move to the next player who still has armies.
  finishSetupTurn() {
    const s = this.s;
    if (s.phase !== 'setup' || s.setupLeft[s.current] > 0) return false;
    const n = s.players.length;
    for (let k = 1; k <= n; k++) {
      const p = (s.current + k) % n;
      if (s.setupLeft[p] > 0) {
        s.current = p;
        return true;
      }
    }
    s.current = s.first;
    this.startTurn();
    return true;
  }

  startTurn() {
    const s = this.s;
    s.phase = 'reinforce';
    s.conquered = false;
    s.pending = null;
    const br = this.reinforcementBreakdown(s.current);
    s.reinforcements = br.total;
    this.log('logReinforce', { p: s.current, n: br.total });
    return br;
  }

  finishReinforce() {
    const s = this.s;
    if (s.phase !== 'reinforce' || s.reinforcements > 0) return false;
    if (this.player.cards.length >= 5 && this.findSets(s.current).length) return false;
    s.phase = s.afterTrade || 'attack';
    s.afterTrade = null;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------
  // Resolve one battle roll. attRoll/defRoll may be supplied (from physical dice).
  attack(from, to, nDice, attRoll, defRoll) {
    const s = this.s;
    if (s.phase !== 'attack') throw new Error('Not attack phase');
    if (s.owner[from] !== s.current || s.owner[to] === s.current) throw new Error('Invalid attack');
    if (!NEIGHBORS[from].includes(to)) throw new Error('Not adjacent');
    nDice = Math.max(1, Math.min(nDice, this.maxAttackDice(from)));
    const dDice = this.defenderDice(to);
    const att = (attRoll || Array.from({ length: nDice }, rollDie)).slice(0, nDice).sort((a, b) => b - a);
    const def = (defRoll || Array.from({ length: dDice }, rollDie)).slice(0, dDice).sort((a, b) => b - a);
    let attLoss = 0;
    let defLoss = 0;
    for (let i = 0; i < Math.min(att.length, def.length); i++) {
      if (att[i] > def[i]) defLoss++;
      else attLoss++;
    }
    const defender = s.owner[to];
    s.armies[from] -= attLoss;
    s.armies[to] -= defLoss;
    s.stats[s.current].rolls++;
    this.log('logAttack', { p: s.current, a: from, d: to, al: attLoss, dl: defLoss });
    const result = { att, def, attLoss, defLoss, conquered: false, eliminated: -1, defender, from, to, nDice };
    if (s.armies[to] <= 0) {
      result.conquered = true;
      s.owner[to] = s.current;
      s.armies[to] = 0;
      s.conquered = true;
      s.stats[s.current].conquered++;
      s.stats[defender].lost++;
      s.pending = { from, to, min: Math.min(nDice, s.armies[from] - 1), max: s.armies[from] - 1 };
      s.phase = 'occupy';
      this.log('logConquer', { p: s.current, t: to });
      if (!this.territoriesOf(defender).length) {
        result.eliminated = defender;
        s.players[defender].alive = false;
        s.players[s.current].cards.push(...s.players[defender].cards);
        s.players[defender].cards = [];
        if (s.players[s.current].cards.length >= 6) s.mustTrade = true;
      }
      if (this.territoriesOf(s.current).length === T) {
        s.winner = s.current;
      }
    }
    return result;
  }

  occupy(n) {
    const s = this.s;
    if (s.phase !== 'occupy') throw new Error('Nothing to occupy');
    const { from, to, min, max } = s.pending;
    n = Math.max(min, Math.min(max, n));
    s.armies[from] -= n;
    s.armies[to] += n;
    s.pending = null;
    if (s.winner !== null) {
      s.phase = 'gameover';
    } else if (s.mustTrade) {
      s.mustTrade = false;
      s.phase = 'reinforce';
      s.afterTrade = 'attack';
    } else {
      s.phase = 'attack';
    }
    return n;
  }

  endAttack() {
    if (this.s.phase === 'attack') this.s.phase = 'fortify';
  }

  fortify(from, to, n) {
    const s = this.s;
    if (s.phase !== 'fortify') throw new Error('Not fortify phase');
    if (!this.connectedOwn(from).includes(to)) throw new Error('Not connected');
    n = Math.max(1, Math.min(n, s.armies[from] - 1));
    s.armies[from] -= n;
    s.armies[to] += n;
    this.log('logFortify', { p: s.current, n, a: from, b: to });
    return n;
  }

  // Ends the turn; returns the card drawn (if any).
  endTurn() {
    const s = this.s;
    let card = null;
    if (s.conquered) card = this.drawCard(s.current);
    const n = s.players.length;
    let next = s.current;
    for (let k = 1; k <= n; k++) {
      const p = (s.current + k) % n;
      if (s.players[p].alive) {
        next = p;
        break;
      }
    }
    // A new round starts whenever play wraps past the first player's seat.
    const seat = (p) => (p - s.first + n) % n;
    if (seat(next) <= seat(s.current)) s.turn++;
    s.current = next;
    this.startTurn();
    return card;
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.s));
  }
}
