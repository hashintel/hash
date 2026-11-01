const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
window.runTransfer = async ({ n, encoding, rounds = 12 }) => {
  const built = [],
    transit = [],
    clone = [];
  for (let i = 0; i < rounds; i++) {
    const result = await new Promise((resolve) => {
      worker.onmessage = (e) =>
        resolve({
          data: e.data,
          received: performance.timeOrigin + performance.now(),
        });
      worker.postMessage({ n, encoding });
    });
    built.push(result.data.built);
    transit.push(result.received - result.data.sent);
    if (encoding === "objects") {
      const t0 = performance.now();
      structuredClone(result.data.tree);
      clone.push(performance.now() - t0);
    }
  }
  return {
    built50: q(built, 0.5),
    transit50: q(transit, 0.5),
    transit95: q(transit, 0.95),
    mainClone50: q(clone, 0.5),
  };
};
