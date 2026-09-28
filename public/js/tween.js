// Tiny tween/animation scheduler driven by the render loop.
export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

const active = new Set();

// Calls onUpdate(easedT, rawT) each frame for `duration` seconds. Returns a promise.
export function animate(duration, onUpdate, ease = Ease.inOutQuad, delay = 0) {
  return new Promise((resolve) => {
    active.add({ t: -delay, duration: Math.max(1e-4, duration), onUpdate, ease, resolve });
  });
}

export const wait = (seconds) => animate(seconds, () => {});

export function updateTweens(dt) {
  for (const tw of [...active]) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const raw = Math.min(1, tw.t / tw.duration);
    tw.onUpdate(tw.ease(raw), raw);
    if (raw >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
