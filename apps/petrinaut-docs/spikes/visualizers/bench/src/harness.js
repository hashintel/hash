const KINDS = 3;
export function makeTokens(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++)
    out[i] = {
      id: "t" + i,
      x: (i * 37) % 1000,
      y: (i * 91) % 1000,
      kind: i % KINDS,
    };
  return out;
}
/** A fresh array of fresh objects (as a frame reader produces), moving `fraction` of the tokens. */
export function advance(prev, step, fraction) {
  const n = prev.length;
  const changed = Math.round(n * fraction);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = prev[i];
    const move = i < changed;
    out[i] = {
      id: t.id,
      x: move ? (t.x + 3 + (step % 5)) % 1000 : t.x,
      y: move ? (t.y + 2) % 1000 : t.y,
      kind: t.kind,
    };
  }
  return out;
}
const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
export function installHarness(impl) {
  window.bench = impl;
  window.runBench = async ({ n, changedFraction, frames = 40, warmup = 8 }) => {
    let tokens = makeTokens(n);
    impl.mount(document.getElementById("root"));
    const script = [];
    const intervals = [];
    let last = null;
    let step = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (last !== null && step > warmup) intervals.push(now - last);
        last = now;
        if (step >= warmup + frames) {
          resolve();
          return;
        }
        tokens = advance(tokens, step, changedFraction);
        const t0 = performance.now();
        impl.frame(tokens);
        const t1 = performance.now();
        if (step >= warmup) script.push(t1 - t0);
        step++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const nodes = document.querySelectorAll("circle").length;
    return {
      nodes,
      script50: q(script, 0.5),
      script95: q(script, 0.95),
      interval50: q(intervals, 0.5),
      interval95: q(intervals, 0.95),
    };
  };
}
export const COLORS = ["#e11", "#1a1", "#11e"];
