// Procedural sound effects and ambient music via the Web Audio API (no assets).
let ctx = null;
let master = null;
let musicGain = null;
let noiseBuf = null;
let enabled = true;
let musicOn = true;
let musicTimer = null;

try {
  enabled = localStorage.getItem('wc-sound') !== 'off';
  musicOn = localStorage.getItem('wc-music') !== 'off';
} catch {
  /* ignore */
}

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Browsers only allow audio after a user gesture.
export function unlockAudio() {
  ensure();
  if (musicOn) startMusic();
}

export const isSoundOn = () => enabled;
export const isMusicOn = () => musicOn;

export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem('wc-sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

export function setMusic(on) {
  musicOn = on;
  try {
    localStorage.setItem('wc-music', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) startMusic();
  else stopMusic();
}

function noise(dur, { freq = 2000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, when = 0 } = {}) {
  if (!ensure() || !enabled) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, dur + 0.05);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, when = 0, slide = 0, dest = null } = {}) {
  if (!ensure() || !enabled) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  // Dice clicking together in the hand.
  rattle(intensity = 1) {
    noise(0.05, { freq: 2500 + Math.random() * 2500, q: 4, gain: 0.12 * intensity });
    if (Math.random() < 0.5) noise(0.04, { freq: 1800 + Math.random() * 1500, q: 6, gain: 0.08 * intensity, when: 0.02 });
  },
  // Die hitting the wooden board (strength 0..1).
  diceHit(strength = 0.5) {
    const s = Math.min(1, strength);
    noise(0.07 + s * 0.05, { freq: 900 + Math.random() * 1500, q: 2.5, gain: 0.25 * s + 0.03 });
    tone(140 + Math.random() * 60, 0.09, { gain: 0.25 * s, slide: 0.6 });
  },
  diceClack(strength = 0.5) {
    noise(0.04, { freq: 3500 + Math.random() * 1500, q: 5, gain: 0.2 * Math.min(1, strength) + 0.02 });
  },
  place() {
    tone(420 + Math.random() * 60, 0.08, { type: 'triangle', gain: 0.18, slide: 0.7 });
    noise(0.05, { freq: 1200, q: 2, gain: 0.12 });
  },
  select() {
    tone(660, 0.08, { type: 'triangle', gain: 0.1 });
    tone(990, 0.1, { type: 'sine', gain: 0.06, when: 0.03 });
  },
  hover() {
    tone(1200, 0.03, { type: 'sine', gain: 0.02 });
  },
  whoosh() {
    noise(0.45, { freq: 700, q: 0.7, gain: 0.25, attack: 0.15, type: 'bandpass' });
  },
  // Losing armies: a short cannon boom.
  boom(big = false) {
    noise(big ? 1.1 : 0.6, { freq: 180, q: 0.8, type: 'lowpass', gain: big ? 0.9 : 0.6, attack: 0.003 });
    tone(big ? 70 : 90, big ? 0.8 : 0.5, { gain: 0.6, slide: 0.4 });
  },
  clash() {
    tone(1400, 0.35, { type: 'square', gain: 0.05, slide: 0.98 });
    tone(2100, 0.3, { type: 'sawtooth', gain: 0.03, slide: 1.01 });
    noise(0.2, { freq: 5000, q: 3, gain: 0.12 });
  },
  heartbeat() {
    tone(55, 0.18, { gain: 0.7, slide: 0.7 });
    tone(50, 0.2, { gain: 0.55, slide: 0.7, when: 0.22 });
  },
  drumroll(dur = 1.2) {
    for (let t = 0; t < dur; t += 0.045) noise(0.05, { freq: 300 + Math.random() * 100, q: 1, gain: 0.08 + (t / dur) * 0.2, when: t, type: 'lowpass' });
  },
  fanfare() {
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(f, 0.5, { type: 'sawtooth', gain: 0.07, when: i * 0.11, attack: 0.02 });
      tone(f * 2, 0.45, { type: 'triangle', gain: 0.05, when: i * 0.11, attack: 0.02 });
    });
    tone(783.99, 1.2, { type: 'sawtooth', gain: 0.08, when: 0.45, attack: 0.03 });
    tone(523.25, 1.2, { type: 'triangle', gain: 0.08, when: 0.45, attack: 0.03 });
  },
  defeat() {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.1, when: i * 0.18 }));
  },
  horn() {
    tone(196, 0.9, { type: 'sawtooth', gain: 0.06, attack: 0.08 });
    tone(293.66, 0.9, { type: 'sawtooth', gain: 0.05, attack: 0.08, when: 0.05 });
    tone(392, 1.0, { type: 'triangle', gain: 0.05, attack: 0.1, when: 0.1 });
  },
  card() {
    noise(0.15, { freq: 4000, q: 1, gain: 0.12, type: 'highpass', attack: 0.02 });
  },
  click() {
    tone(800, 0.04, { type: 'triangle', gain: 0.08 });
  },
  victory() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    seq.forEach((f, i) => tone(f, 0.6, { type: 'sawtooth', gain: 0.08, when: i * 0.16, attack: 0.02 }));
    tone(261.63, 2, { type: 'triangle', gain: 0.12, when: 0.8 });
  },
};

// Slow evolving modal pad: gentle, martial, unobtrusive.
function startMusic() {
  if (!ensure() || musicTimer) return;
  musicGain.gain.setTargetAtTime(0.35, ctx.currentTime, 2);
  const chords = [
    [110, 164.81, 220, 261.63],
    [98, 146.83, 196, 246.94],
    [87.31, 130.81, 174.61, 220],
    [82.41, 123.47, 164.81, 207.65],
  ];
  let k = 0;
  const play = () => {
    const chord = chords[k++ % chords.length];
    chord.forEach((f, i) => tone(f, 7.5, { type: i === 0 ? 'sine' : 'triangle', gain: i === 0 ? 0.12 : 0.035, attack: 2.5, dest: musicGain }));
    if (Math.random() < 0.6) tone(chord[3] * 2, 2.5, { type: 'sine', gain: 0.02, attack: 0.5, when: 2 + Math.random() * 3, dest: musicGain });
  };
  play();
  musicTimer = setInterval(play, 6500);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
}
