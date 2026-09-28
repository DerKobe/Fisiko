# World Conquest / Welteroberung

A 3D strategy board game of world domination in the spirit of the classic
territory-conquest board game, built with **three.js**, **cannon-es** physics
and a small **Node.js / Express** server. Playable in **English** and **German**.

## Run

```bash
npm install
npm start
```

Then open http://localhost:3000.

## Features

- **Hand-painted-style relief board** generated from real Natural Earth country
  outlines: 42 territories in 6 continents, inked borders, engraved coastal
  ripples, embossed mountain ranges, sea lanes, compass rose, title cartouche and
  a continent-bonus legend, all set in a wooden frame on a table.
- **Detailed figurines** modelled in code: infantry (shako, musket, pack), cavalry
  (rearing horse, sabre-wielding rider) and artillery (spoked wheels, bronze
  barrel, shot pile). 1 / 5 / 10 armies, drop-in and topple animations, marching
  when armies advance.
- **Physical 3D dice** – hold the *Roll* button (or Space) to shake the dice in
  your hand, move the mouse to aim, release to fling them across the board. They
  collide with each other and with the figurines. Decisive rolls trigger slow
  motion, a cinematic zoom and a heartbeat. The dice then line up so each pair
  can be compared, and the winning die glows.
- Classic rules: reinforcements (territories ÷ 3, continent bonuses), card sets
  with escalating trade values, attack/defend dice, advancing, fortifying,
  eliminations and card capture.
- 2–6 players, any mix of humans (hot-seat) and computer opponents
  (easy / normal / hard), blitz attacks, fast-AI mode, autosave & continue.
- Procedural sound effects and ambient music (Web Audio, no asset files).

## Controls

| Action | Input |
| --- | --- |
| Select territory | Left click |
| Place +5 armies | Shift + click |
| Pan / rotate / zoom | Left drag / right drag / mouse wheel |
| Shake & throw dice | Hold *Roll* or Space, move mouse, release |
| Overview camera | `O` |
| Cancel selection | `Esc` |

## Project layout

```
server.js                 Express server; converts world topology once at startup
public/js/data/           Territories, adjacency, country grouping, mountain ranges
public/js/board/          Map generator (Web Worker), board artwork, 3D scene & shader
public/js/pieces/         Figurine modelling and army placement/animation
public/js/dice/           cannon-es dice simulation, shaking, drama, presentation
public/js/game/           Pure rules engine and AI (usable from Node as well)
public/js/main.js         App controller: menus, turn flow, input, HUD
tools/                    Map preview + headless AI simulation scripts
```

`node tools/simulate.mjs` plays 40 AI-only games headlessly to sanity-check the
rules; `node tools/preview-map.mjs` renders the board to `tools/out-board.png`
and verifies drawn borders against the adjacency list.
