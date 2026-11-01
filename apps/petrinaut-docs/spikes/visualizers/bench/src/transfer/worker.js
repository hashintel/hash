/** Builds an element tree for n tokens and posts it in three encodings. */
self.onmessage = (e) => {
  const { n, encoding } = e.data;
  const t0 = performance.now();
  if (encoding === "objects") {
    const children = new Array(n);
    for (let i = 0; i < n; i++)
      children[i] = {
        t: "circle",
        k: "t" + i,
        p: { cx: (i * 37) % 1000, cy: (i * 91) % 1000, r: 3, fill: "#e11" },
      };
    self.postMessage({
      built: performance.now() - t0,
      sent: performance.timeOrigin + performance.now(),
      tree: { t: "svg", p: { viewBox: "0 0 1000 1000" }, c: children },
    });
  } else if (encoding === "columns") {
    // One typed array per attribute, keys as indices into a per-net string table (sent once).
    const cx = new Float64Array(n),
      cy = new Float64Array(n),
      fill = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      cx[i] = (i * 37) % 1000;
      cy[i] = (i * 91) % 1000;
      fill[i] = i % 3;
    }
    self.postMessage(
      {
        built: performance.now() - t0,
        sent: performance.timeOrigin + performance.now(),
        cx,
        cy,
        fill,
      },
      [cx.buffer, cy.buffer, fill.buffer],
    );
  } else if (encoding === "patches") {
    // Only what changed since the last frame: 10% of tokens, two attributes each.
    const m = Math.round(n * 0.1);
    const idx = new Int32Array(m),
      cx = new Float64Array(m),
      cy = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      idx[i] = i;
      cx[i] = (i * 37 + 3) % 1000;
      cy[i] = (i * 91 + 2) % 1000;
    }
    self.postMessage(
      {
        built: performance.now() - t0,
        sent: performance.timeOrigin + performance.now(),
        idx,
        cx,
        cy,
      },
      [idx.buffer, cx.buffer, cy.buffer],
    );
  }
};
