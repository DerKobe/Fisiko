// Heuristic computer commanders (easy / normal / hard).
import { NEIGHBORS, CONTINENTS, CONTINENT_MEMBERS, TERRITORY_CONTINENT } from '../data/world.js';

const enemyNeighbors = (g, t) => NEIGHBORS[t].filter((n) => g.s.owner[n] !== g.s.owner[t]);
const threat = (g, t) => enemyNeighbors(g, t).reduce((a, n) => a + g.s.armies[n], 0);
const isBorder = (g, t) => enemyNeighbors(g, t).length > 0;

// Which continent is this player trying to take or hold?
function goalContinents(g, p) {
  const scores = CONTINENTS.map((c, ci) => {
    const members = CONTINENT_MEMBERS[ci];
    const mine = members.filter((t) => g.s.owner[t] === p);
    const enemyArmies = members.filter((t) => g.s.owner[t] !== p).reduce((a, t) => a + g.s.armies[t], 0);
    const frac = mine.length / members.length;
    const value = (c.bonus / members.length) * 2 + frac * 2.5 + (frac === 1 ? 3 : 0);
    return { ci, score: value / Math.sqrt(enemyArmies + 1) };
  });
  return scores.sort((a, b) => b.score - a.score).map((x) => x.ci);
}

function placementScores(g, p) {
  const goals = goalContinents(g, p).slice(0, 2);
  const own = g.territoriesOf(p).filter((t) => isBorder(g, t));
  return own
    .map((t) => {
      const en = enemyNeighbors(g, t);
      let score = threat(g, t) / (g.s.armies[t] + 2);
      for (const n of en) {
        if (goals.includes(TERRITORY_CONTINENT[n])) score += 1.4;
        if (g.s.armies[n] <= 2) score += 0.4;
      }
      if (goals.includes(TERRITORY_CONTINENT[t])) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
}

// Returns a list of [territory, count] placements for `total` armies.
export function planPlacement(g, p, total, level = 'normal') {
  const scored = placementScores(g, p);
  if (!scored.length) {
    const any = g.territoriesOf(p);
    return [[any[0], total]];
  }
  const out = new Map();
  const add = (t, n) => out.set(t, (out.get(t) || 0) + n);
  if (level === 'easy') {
    for (let i = 0; i < total; i++) add(scored[Math.floor(Math.random() * scored.length)].t, 1);
  } else if (level === 'hard') {
    const first = Math.ceil(total * 0.75);
    add(scored[0].t, first);
    if (total - first > 0) add((scored[1] || scored[0]).t, total - first);
  } else {
    const top = scored.slice(0, 3);
    let left = total;
    top.forEach((s, i) => {
      const n = i === top.length - 1 ? left : Math.ceil(left * (i === 0 ? 0.6 : 0.5));
      if (n > 0) add(s.t, n);
      left -= n;
    });
  }
  return [...out.entries()].filter(([, n]) => n > 0);
}

export function chooseTrade(g, p) {
  const sets = g.findSets(p);
  return sets.length ? sets[0] : null;
}

export function chooseAttack(g, level = 'normal', attacksSoFar = 0) {
  const s = g.s;
  const p = s.current;
  if (attacksSoFar > 80) return null;
  const goals = goalContinents(g, p).slice(0, 2);
  const minRatio = { easy: 1.6, normal: 1.25, hard: 1.05 }[level];
  let best = null;
  for (const from of g.territoriesOf(p)) {
    if (s.armies[from] < 2) continue;
    for (const to of enemyNeighbors(g, from)) {
      const a = s.armies[from] - 1;
      const d = s.armies[to];
      let ratio = a / d;
      let score = ratio;
      const cont = TERRITORY_CONTINENT[to];
      const defender = s.owner[to];
      if (goals.includes(cont)) score += 0.6;
      if (g.ownsContinent(defender, cont)) score += level === 'easy' ? 0.2 : 1.0;
      if (g.territoriesOf(defender).length === 1) score += 1.5;
      let need = minRatio;
      if (!s.conquered && level !== 'easy') need = Math.min(need, 0.95);
      if (goals.includes(cont) && level === 'hard') need -= 0.1;
      if (a < 2 && d > 1) continue;
      if (ratio < need) continue;
      if (!best || score > best.score) best = { from, to, score };
    }
  }
  if (!best) return null;
  if (level === 'easy' && Math.random() < 0.15) return null;
  return { from: best.from, to: best.to, dice: g.maxAttackDice(best.from) };
}

export function chooseOccupy(g) {
  const { from, to, min, max } = g.s.pending;
  const src = threat(g, from);
  const dst = threat(g, to);
  if (src === 0) return max;
  if (dst === 0) return min;
  return Math.max(min, Math.min(max, Math.round((max * dst) / (src + dst)) + 1));
}

export function chooseFortify(g, level = 'normal') {
  if (level === 'easy' && Math.random() < 0.4) return null;
  const s = g.s;
  const p = s.current;
  const own = g.territoriesOf(p);
  // Interior stacks move to the most threatened connected border.
  const interior = own.filter((t) => !isBorder(g, t) && s.armies[t] > 1).sort((a, b) => s.armies[b] - s.armies[a]);
  for (const from of interior) {
    const targets = g.connectedOwn(from).filter((t) => isBorder(g, t));
    if (!targets.length) continue;
    targets.sort((a, b) => threat(g, b) / (s.armies[b] + 1) - threat(g, a) / (s.armies[a] + 1));
    return { from, to: targets[0], n: s.armies[from] - 1 };
  }
  // Otherwise balance a quiet border toward a hot one.
  let best = null;
  for (const from of own) {
    if (s.armies[from] < 4) continue;
    const spare = s.armies[from] - 1 - Math.ceil(threat(g, from) * 0.8);
    if (spare < 2) continue;
    for (const to of g.connectedOwn(from)) {
      const need = threat(g, to) - s.armies[to];
      if (need > 0 && (!best || need > best.need)) best = { from, to, n: Math.min(spare, need + 1), need };
    }
  }
  return best;
}
