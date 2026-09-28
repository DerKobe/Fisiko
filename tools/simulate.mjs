// Plays complete AI-only games headlessly to sanity-check the rules and AI.
import { Game } from '../public/js/game/engine.js';
import * as AI from '../public/js/game/ai.js';

function play(nPlayers, levels) {
  const g = Game.create({ players: levels.slice(0, nPlayers).map((ai, i) => ({ name: `P${i}`, color: '#fff', ai })) });
  const s = g.s;
  let guard = 0;
  while (s.phase === 'setup') {
    for (const [t, n] of AI.planPlacement(g, s.current, s.setupLeft[s.current], s.players[s.current].ai)) g.placeArmies(t, n);
    g.finishSetupTurn();
  }
  while (s.phase !== 'gameover' && guard++ < 20000) {
    const lvl = s.players[s.current].ai;
    if (s.phase === 'reinforce') {
      let set;
      while ((set = AI.chooseTrade(g, s.current)) && (g.player.cards.length >= 5 || lvl !== 'easy')) g.trade(set);
      if (s.reinforcements > 0) for (const [t, n] of AI.planPlacement(g, s.current, s.reinforcements, lvl)) g.placeArmies(t, n);
      if (!g.finishReinforce()) throw new Error('stuck in reinforce ' + JSON.stringify({ r: s.reinforcements, cards: g.player.cards.length }));
    } else if (s.phase === 'attack') {
      let k = 0, a;
      while (s.phase === 'attack' && (a = AI.chooseAttack(g, lvl, k++))) {
        const r = g.attack(a.from, a.to, a.dice);
        if (r.conquered) g.occupy(AI.chooseOccupy(g));
      }
      if (s.phase === 'attack') g.endAttack();
    } else if (s.phase === 'fortify') {
      const f = AI.chooseFortify(g, lvl);
      if (f) g.fortify(f.from, f.to, f.n);
      g.endTurn();
    } else if (s.phase === 'occupy') g.occupy(AI.chooseOccupy(g));
    // integrity
    for (let i = 0; i < 42; i++) if (s.armies[i] < 1 && s.phase !== 'occupy') throw new Error('empty territory ' + i + ' ' + s.phase);
  }
  return { winner: s.winner, lvl: s.players[s.winner]?.ai, turns: s.turn, guard };
}
const res = [];
for (let i = 0; i < 40; i++) res.push(play(2 + (i % 5), ['hard', 'normal', 'easy', 'normal', 'easy', 'hard']));
const wins = {};
res.forEach((r) => (wins[r.lvl] = (wins[r.lvl] || 0) + 1));
console.log('wins by level', wins, 'avg turns', (res.reduce((a, r) => a + r.turns, 0) / res.length).toFixed(1), 'unfinished', res.filter((r) => r.winner === null).length);
