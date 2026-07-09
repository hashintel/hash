/* HASH Entity Map -- zoomable LOD demo with an alpha-ladder slider.
 *
 * Nodes arrive pre-sorted by (min_zoom asc, importance desc), so the
 * set visible at reveal level z is exactly the first cumulative[z]
 * rows. Each node's row index doubles as its reveal rank: a GPU-side
 * DataFilterExtension shows rows [0, count(zoom)], so zooming never
 * re-uploads buffers. Fractional zoom interpolates the count for a
 * smooth, monotone reveal (most important nodes first).
 *
 * The alpha slider morphs between the ladder's layouts (alpha=1.0 pure
 * semantic ... alpha=0.25 mostly relational). All levels share one row
 * order, so blending is a plain lerp between position buffers. The
 * lerp writes into one of two scratch buffers (deck re-uploads only on
 * array identity change, so we alternate); everything else that
 * depends on positions -- density weights, far-field colors, labels,
 * ambient links -- settles on a debounce after the scrub pauses.
 *
 * A "far field" layer draws every node as a tiny dim dot, playing the
 * continent/nebula role when zoomed out; because it shares the exact
 * same position buffer as the LOD layer, it is aligned by construction
 * and stays crisp at any zoom. Clicking a node pulls its adjacency
 * from a CSR edge index and lights up its connections; at deep zoom,
 * ambient links among on-screen nodes fade in.
 */

const {
  Deck,
  OrthographicView,
  ScatterplotLayer,
  LineLayer,
  TextLayer,
  PolygonLayer,
  BitmapLayer,
  DataFilterExtension,
  LinearInterpolator,
} = deck;

const MAX_EDGES_SHOWN = 1200;
// far-field: normal ("over") alpha blending, NOT additive. Additive
// light physically washes every dense region to white (all channels
// clip); over-blending instead converges toward the palette color, so
// density reads as "how solidly the type's color fills in" and hue is
// preserved everywhere -- same principle as the log-density render
// this emulates. Per-point density-equalization weights (rho^-0.7,
// precomputed per alpha level) keep cores from flattening; the zoom
// term is mild exposure compensation for overlap growth as you zoom
// out.
const FARFIELD_INTENSITY = 0.5; // exposure at the reference zoom
const FARFIELD_REF_REVEAL = 2.5;
const farfieldOpacity = (reveal) =>
  Math.max(
    0.08,
    Math.min(
      0.9,
      FARFIELD_INTENSITY * Math.pow(2, 0.6 * (reveal - FARFIELD_REF_REVEAL)),
    ),
  );
// vector far field: the first paint. Glow texture + flat region fills
// + coastline strokes, strongest fully zoomed out and gone once the
// point field has taken over (the speck layer above stays for texture
// in between). Fills are neutral ink, NOT type colors: the specks
// already carry type identity and a colored fill underneath would
// read as a type claim the regions don't make.
const FIELD_FADE_START = 1.5; // reveal where the field starts to yield
const FIELD_FADE_END = 3.5; // reveal where it is fully gone
const FIELD_GLOW = 0.45;
const fieldOpacity = (reveal) =>
  Math.max(
    0,
    Math.min(
      1,
      1 - (reveal - FIELD_FADE_START) / (FIELD_FADE_END - FIELD_FADE_START),
    ),
  );
const AMBIENT_MIN_REVEAL = 6; // reveal level where ambient links fade in
const AMBIENT_MAX_NODES = 4000;
const AMBIENT_MAX_EDGES = 6000;
const AMBIENT_PER_NODE = 8;

const $ = (id) => document.getElementById(id);

async function fetchBin(url, Type, onBytes) {
  const res = await fetch(url, { cache: "no-store" });
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(value.length);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return new Type(buf.buffer);
}

async function main() {
  const manifest = await (
    await fetch("data/manifest.json", { cache: "no-store" })
  ).json();
  const totalBytes = Object.values(manifest.files).reduce((a, b) => a + b, 0);
  let loadedBytes = 0;
  const onBytes = (b) => {
    loadedBytes += b;
    $("loading-fill").style.width = `${(100 * loadedBytes) / totalBytes}%`;
    $("loading-status").textContent =
      `${(loadedBytes / 1e6).toFixed(1)} / ${(totalBytes / 1e6).toFixed(1)} MB`;
  };

  const alphas = manifest.alphas; // descending, e.g. [1.0, 0.75, 0.5, 0.25]
  const tags = alphas.map(
    (a) => `a${String(Math.round(a * 100)).padStart(3, "0")}`,
  );
  const levels = alphas.length;

  const [cls, minzoom, degree, edgeOffsets, edgeNeighbors] = await Promise.all([
    fetchBin("data/nodes_class.u8", Uint8Array, onBytes),
    fetchBin("data/nodes_minzoom.u8", Uint8Array, onBytes),
    fetchBin("data/nodes_degree.u16", Uint16Array, onBytes),
    fetchBin("data/edges_offsets.u32", Uint32Array, onBytes),
    fetchBin("data/edges_neighbors.u32", Uint32Array, onBytes),
  ]);
  const xyLevels = await Promise.all(
    tags.map((t) => fetchBin(`data/nodes_xy_${t}.f32`, Float32Array, onBytes)),
  );
  const weightLevels = await Promise.all(
    tags.map((t) =>
      fetchBin(`data/nodes_weight_${t}.f32`, Float32Array, onBytes),
    ),
  );

  // far-field vectors, already chain-aligned into the canonical frame
  // by prepare_demo. Flattened to one datum per polygon; array order is
  // painter's order (area desc), so nesting composites correctly.
  const farfieldPolys = manifest.farfield
    ? (
        await Promise.all(
          tags.map((t) =>
            fetch(`data/farfield_${t}.json`, { cache: "no-store" }).then((r) =>
              r.json(),
            ),
          ),
        )
      ).map((f) =>
        f.regions.flatMap((r) =>
          r.polygons.map((polygon) => ({ polygon, envelope: r.envelope })),
        ),
      )
    : null;

  const n = manifest.count;
  const [[xmin, ymin], [xmax, ymax]] = manifest.extent;
  const palette = manifest.palette.map((h) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
  );

  // --- alpha slider state --------------------------------------------------
  // `pos` in [0, levels-1]: integer values sit exactly on a fitted
  // level, fractional values lerp between the two adjacent ones.
  let sliderPos = 0;
  let xy = xyLevels[0]; // current (possibly blended) positions
  let weight = weightLevels[0]; // follows on settle, not per frame
  let positionVersion = 0;
  const scratch = [
    new Float32Array(n * 2),
    new Float32Array(n * 2),
    new Float32Array(n), // weights, blended on settle only
  ];

  const levelOf = (pos) => Math.max(0, Math.min(levels - 2, Math.floor(pos)));
  const alphaAt = (pos) => {
    if (levels === 1) return alphas[0];
    const i = levelOf(pos);
    return alphas[i] + (alphas[i + 1] - alphas[i]) * (pos - i);
  };

  function blendPositions(pos) {
    const i = levelOf(pos);
    const t = pos - i;
    if (t < 1e-3 || levels === 1) return xyLevels[i];
    if (t > 1 - 1e-3) return xyLevels[i + 1];
    // alternate scratch buffers: deck re-uploads when the attribute
    // array identity changes, and skips when it doesn't
    const out = xy === scratch[0] ? scratch[1] : scratch[0];
    const a = xyLevels[i];
    const b = xyLevels[i + 1];
    for (let k = 0; k < n * 2; k++) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }

  function blendWeights(pos) {
    const i = levelOf(pos);
    const t = pos - i;
    if (t < 1e-3 || levels === 1) return weightLevels[i];
    if (t > 1 - 1e-3) return weightLevels[i + 1];
    const out = scratch[2];
    const a = weightLevels[i];
    const b = weightLevels[i + 1];
    for (let k = 0; k < n; k++) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }

  // --- per-node GPU attributes -------------------------------------------
  const colors = new Uint8Array(n * 4);
  const farColors = new Uint8Array(n * 4); // alpha carries density weight
  const radius = new Float32Array(n);
  const ranks = new Float32Array(n);
  const activeTypes = new Set(palette.map((_, i) => i));
  let colorVersion = 0;

  function paintColors() {
    for (let i = 0; i < n; i++) {
      const c = palette[cls[i]];
      const on = activeTypes.has(cls[i]);
      colors[i * 4] = c[0];
      colors[i * 4 + 1] = c[1];
      colors[i * 4 + 2] = c[2];
      colors[i * 4 + 3] = on ? 235 : 14;
      farColors[i * 4] = c[0];
      farColors[i * 4 + 1] = c[1];
      farColors[i * 4 + 2] = c[2];
      farColors[i * 4 + 3] = on ? Math.round(255 * weight[i]) : 1;
    }
    colorVersion++;
  }
  paintColors();
  for (let i = 0; i < n; i++) {
    radius[i] = 1.8 + Math.log2(1 + degree[i]) * 0.7;
    ranks[i] = i;
  }

  // Rebuilt only when positionVersion changes, so ordinary pan/zoom
  // redraws keep stable data identities (no attribute re-uploads).
  let cachedData = null;
  let cachedFarData = null;
  let cachedVersion = -1;
  function nodeData() {
    if (cachedVersion !== positionVersion) {
      cachedData = {
        length: n,
        attributes: {
          getPosition: { value: xy, size: 2 },
          getFillColor: { value: colors, size: 4 },
          getRadius: { value: radius, size: 1 },
          getFilterValue: { value: ranks, size: 1 },
        },
      };
      // NB: binary attributes override accessor props, so the far field
      // gets its own set WITHOUT getRadius -- otherwise every far-field
      // speck inherits the degree-scaled radius and the far view floods
      // with light
      cachedFarData = {
        length: n,
        attributes: {
          getPosition: { value: xy, size: 2 },
          getFillColor: { value: farColors, size: 4 },
        },
      };
      cachedVersion = positionVersion;
    }
    return { nodes: cachedData, far: cachedFarData };
  }

  // --- zoom -> reveal ----------------------------------------------------
  const fitZoom = Math.log2(
    Math.min(
      window.innerWidth / (xmax - xmin),
      window.innerHeight / (ymax - ymin),
    ),
  );
  const revealOf = (z) => Math.max(0, Math.min(manifest.maxZoom, z - fitZoom));
  const visibleCount = (reveal) => {
    const z = Math.floor(reveal);
    const lo = manifest.cumulative[z];
    const hi = manifest.cumulative[Math.min(z + 1, manifest.maxZoom)];
    return Math.round(lo + (hi - lo) * (reveal - z));
  };

  // --- labels: lerp positions between the adjacent levels -----------------
  // prepare_demo guarantees each level has the same label list (same
  // types, same order), so blending by index is safe.
  function labelData(pos) {
    const i = levelOf(pos);
    const t = pos - i;
    const a = manifest.labels[tags[i]];
    if (t < 1e-3 || levels === 1) return a;
    const b = manifest.labels[tags[Math.min(i + 1, levels - 1)]];
    return a.map((la, j) => ({
      ...la,
      position: [
        la.position[0] + (b[j].position[0] - la.position[0]) * t,
        la.position[1] + (b[j].position[1] - la.position[1]) * t,
      ],
    }));
  }

  // --- ui chrome ----------------------------------------------------------
  $("legend-rows").innerHTML = manifest.types
    .map(
      (t, i) => `
      <div class="legend-row" data-class="${i}">
        <span class="swatch" style="background:${manifest.palette[i]}"></span>
        <span>${t}</span>
        <span class="count">${manifest.typeCounts[i].toLocaleString()}</span>
      </div>`,
    )
    .join("");

  function setTypeFilter(next) {
    activeTypes.clear();
    next.forEach((i) => activeTypes.add(i));
    paintColors();
    document.querySelectorAll(".legend-row").forEach((el) => {
      el.classList.toggle("off", !activeTypes.has(+el.dataset.class));
    });
    $("legend-reset").style.display =
      activeTypes.size === palette.length ? "none" : "inline";
    scheduleAmbient();
    redraw();
  }

  document.querySelectorAll(".legend-row").forEach((el) => {
    el.onclick = () => {
      const i = +el.dataset.class;
      const all = activeTypes.size === palette.length;
      // first click on a full set focuses that type; afterwards, toggle
      if (all) setTypeFilter([i]);
      else {
        const next = new Set(activeTypes);
        next.has(i) ? next.delete(i) : next.add(i);
        setTypeFilter(next.size ? [...next] : palette.map((_, j) => j));
      }
    };
  });
  $("legend-reset").onclick = () => setTypeFilter(palette.map((_, i) => i));

  const tooltip = $("tooltip");
  function showTooltip(info) {
    if (info.index == null || info.index < 0) {
      tooltip.style.display = "none";
      return;
    }
    const i = info.index;
    tooltip.innerHTML =
      `<b>${manifest.types[cls[i]]}</b><br/>` +
      `<span class="t-dim">${degree[i].toLocaleString()} connections · appears at level ${minzoom[i]}</span>`;
    tooltip.style.display = "block";
    tooltip.style.left = `${info.x + 14}px`;
    tooltip.style.top = `${info.y + 14}px`;
  }

  // --- alpha slider --------------------------------------------------------
  let settleTimer = null;
  function setSlider(pos) {
    sliderPos = pos;
    xy = blendPositions(pos);
    positionVersion++;
    $("alpha-value").textContent = `α ${alphaAt(pos).toFixed(2)}`;
    redraw();

    // weights (-> far-field brightness) and ambient links follow once
    // the scrub settles; they're O(n) CPU repaints, not per-frame work
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      weight = blendWeights(sliderPos);
      paintColors();
      scheduleAmbient();
      redraw();
    }, 120);
  }

  if (levels > 1) {
    const slider = $("alpha-slider");
    slider.max = levels - 1;
    slider.oninput = () => setSlider(+slider.value);
    $("alpha").style.display = "block";
    $("alpha-value").textContent = `α ${alphas[0].toFixed(2)}`;
  }

  // --- ambient links (deep zoom) -------------------------------------------
  // Recomputed on a debounce after the view settles: scan revealed nodes
  // for those near the viewport, then draw a capped sample of their
  // edges -- including ones that run offscreen.
  let ambient = [];
  let ambientVersion = 0;
  let ambientTimer = null;
  let viewTarget = null;

  function computeAmbient() {
    const reveal = revealOf(viewZoom);
    if (reveal < AMBIENT_MIN_REVEAL || !viewTarget) {
      if (ambient.length) {
        ambient = [];
        redraw();
      }
      return;
    }
    const scale = Math.pow(2, viewZoom);
    const hw = (window.innerWidth / scale) * 0.75; // 1.5x viewport
    const hh = (window.innerHeight / scale) * 0.75;
    const [cx, cy] = viewTarget;
    const inView = (i) =>
      Math.abs(xy[i * 2] - cx) <= hw && Math.abs(xy[i * 2 + 1] - cy) <= hh;

    const count = visibleCount(reveal);
    const nodes = [];
    for (let i = 0; i < count && nodes.length < AMBIENT_MAX_NODES; i++) {
      if (inView(i) && activeTypes.has(cls[i])) nodes.push(i);
    }

    const pairs = [];
    outer: for (const i of nodes) {
      const from = edgeOffsets[i];
      const to = Math.min(edgeOffsets[i + 1], from + AMBIENT_PER_NODE);
      for (let e = from; e < to; e++) {
        const t = edgeNeighbors[e];
        // if the other endpoint is also on-screen it draws its own copy;
        // skip one direction to avoid doubling
        if (t < i && inView(t)) continue;
        pairs.push([i, t]);
        if (pairs.length >= AMBIENT_MAX_EDGES) break outer;
      }
    }
    ambient = pairs;
    ambientVersion++;
    redraw();
  }

  function scheduleAmbient() {
    if (ambientTimer) clearTimeout(ambientTimer);
    ambientTimer = setTimeout(computeAmbient, 130);
  }

  // --- selection ----------------------------------------------------------
  let selected = null; // { index, neighbors: Uint32Array }

  function select(index) {
    const from = edgeOffsets[index];
    const to = edgeOffsets[index + 1];
    selected = { index, neighbors: edgeNeighbors.subarray(from, to) };

    $("card").style.display = "block";
    $("card-swatch").style.background = manifest.palette[cls[index]];
    $("card-type").textContent = manifest.types[cls[index]];
    const shown = Math.min(selected.neighbors.length, MAX_EDGES_SHOWN);
    $("card-metrics").innerHTML =
      `<b>${(to - from).toLocaleString()}</b> connections` +
      (shown < to - from
        ? ` <span>· showing ${shown.toLocaleString()}</span>`
        : "");
    redraw();
  }

  function clearSelection() {
    if (!selected) return;
    selected = null;
    $("card").style.display = "none";
    redraw();
  }

  // --- layers ---------------------------------------------------------------
  let viewZoom = fitZoom - 1.6; // intro start; animated to fitZoom below

  function layers() {
    const reveal = revealOf(viewZoom);
    const count = visibleCount(reveal);
    const labelOpacity = Math.max(0, Math.min(1, 1 - (reveal - 2.2) / 1.6));
    const ambientOpacity = Math.max(
      0,
      Math.min(1, (reveal - AMBIENT_MIN_REVEAL) / 1.5),
    );
    const data = nodeData();

    const out = [];

    // vector first paint: glow + region fills/strokes, bottom of the
    // stack. Region trees don't correspond across alpha levels (no
    // shared ids to lerp by), so the slider crossfades the two
    // adjacent levels instead -- shapes dissolve rather than morph.
    const fo = fieldOpacity(reveal);
    if (farfieldPolys && fo > 0.02) {
      const li = levelOf(sliderPos);
      const t = sliderPos - li;
      for (const [lvl, w] of [
        [li, 1 - t],
        [Math.min(li + 1, levels - 1), t],
      ]) {
        if (w < 0.02) continue;
        out.push(
          new BitmapLayer({
            id: `glow-${lvl}`,
            image: `data/glow_${tags[lvl]}.png`,
            bounds: [xmin, ymin, xmax, ymax],
            opacity: FIELD_GLOW * fo * w,
            pickable: false,
          }),
          new PolygonLayer({
            id: `farfield-regions-${lvl}`,
            data: farfieldPolys[lvl],
            getPolygon: (d) => d.polygon,
            filled: true,
            stroked: true,
            // envelopes are coastline-only; their children carry the fill
            getFillColor: (d) =>
              d.envelope ? [140, 155, 190, 10] : [140, 155, 190, 34],
            getLineColor: (d) =>
              d.envelope ? [175, 185, 210, 70] : [175, 185, 210, 110],
            getLineWidth: 1,
            lineWidthUnits: "pixels",
            opacity: fo * w,
            pickable: false,
          }),
        );
      }
    }

    out.push(
      // far field: every node as a speck of light; density-weighted
      // over-blending, see the constant block up top
      new ScatterplotLayer({
        id: "farfield",
        data: data.far,
        radiusUnits: "pixels",
        getRadius: 1,
        radiusMinPixels: 0.7,
        opacity: farfieldOpacity(reveal),
        pickable: false,
        antialiasing: true,
        updateTriggers: { getFillColor: colorVersion },
      }),
    );

    if (ambient.length && ambientOpacity > 0.02) {
      out.push(
        new LineLayer({
          id: "ambient-edges",
          data: ambient,
          getSourcePosition: (d) => [xy[d[0] * 2], xy[d[0] * 2 + 1]],
          getTargetPosition: (d) => [xy[d[1] * 2], xy[d[1] * 2 + 1]],
          getColor: [255, 255, 255, Math.round(26 * ambientOpacity)],
          getWidth: 1,
          widthUnits: "pixels",
          updateTriggers: {
            // accessors close over `xy`; nudge them when it changes
            getSourcePosition: [positionVersion, ambientVersion],
            getTargetPosition: [positionVersion, ambientVersion],
          },
        }),
      );
    }

    out.push(
      new ScatterplotLayer({
        id: "nodes",
        data: data.nodes,
        radiusUnits: "pixels",
        radiusMinPixels: 1,
        radiusMaxPixels: 11,
        // subtle dark rim separates same-colored dots in dense blobs
        stroked: true,
        getLineColor: [10, 10, 14, 150],
        getLineWidth: 0.8,
        lineWidthUnits: "pixels",
        pickable: true,
        antialiasing: true,
        extensions: [new DataFilterExtension({ filterSize: 1 })],
        filterRange: [0, count],
        updateTriggers: { getFillColor: colorVersion },
      }),
    );

    if (labelOpacity > 0.02) {
      out.push(
        new TextLayer({
          id: "labels",
          data: labelData(sliderPos),
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getColor: [235, 235, 245, Math.round(235 * labelOpacity)],
          getSize: 15,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: 650,
          fontSettings: { sdf: true },
          outlineWidth: 6,
          outlineColor: [13, 13, 18, Math.round(220 * labelOpacity)],
        }),
      );
    }

    if (selected) {
      const { index, neighbors } = selected;
      const sx = xy[index * 2];
      const sy = xy[index * 2 + 1];
      const shown = Math.min(neighbors.length, MAX_EDGES_SHOWN);
      const edges = new Array(shown);
      const ends = new Array(shown);
      for (let j = 0; j < shown; j++) {
        const t = neighbors[j];
        ends[j] = t;
        edges[j] = [xy[t * 2], xy[t * 2 + 1]];
      }
      out.push(
        new LineLayer({
          id: "edges",
          data: edges,
          getSourcePosition: [sx, sy],
          getTargetPosition: (d) => d,
          getColor: [255, 255, 255, 70],
          getWidth: 1,
          widthUnits: "pixels",
        }),
        new ScatterplotLayer({
          id: "edge-ends",
          data: ends,
          getPosition: (t) => [xy[t * 2], xy[t * 2 + 1]],
          getFillColor: (t) => [...palette[cls[t]], 255],
          getRadius: 3,
          radiusUnits: "pixels",
          stroked: true,
          getLineColor: [255, 255, 255, 200],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
          updateTriggers: { getPosition: positionVersion },
        }),
        new ScatterplotLayer({
          id: "selection-ring",
          data: [index],
          getPosition: [sx, sy],
          getRadius: Math.max(8, radius[index] + 5),
          radiusUnits: "pixels",
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 230],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
        }),
      );
    }

    return out;
  }

  function updateHud() {
    const reveal = revealOf(viewZoom);
    $("hud").innerHTML =
      `<b>${visibleCount(reveal).toLocaleString()}</b> of ${n.toLocaleString()} entities · ` +
      `<b>${manifest.edgeCount.toLocaleString()}</b> links · level <b>${reveal.toFixed(1)}</b>`;
  }

  function redraw() {
    deckgl.setProps({ layers: layers() });
    updateHud();
  }

  const center = [(xmin + xmax) / 2, (ymin + ymax) / 2, 0];
  const deckgl = new Deck({
    parent: $("map"),
    views: new OrthographicView({ flipY: false }),
    controller: { inertia: 350 },
    initialViewState: {
      target: center,
      zoom: viewZoom,
      minZoom: fitZoom - 1.8,
      maxZoom: fitZoom + manifest.maxZoom + 4,
    },
    layers: layers(),
    getCursor: ({ isHovering, isDragging }) =>
      isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
    onViewStateChange: ({ viewState }) => {
      viewZoom = viewState.zoom;
      viewTarget = viewState.target;
      scheduleAmbient();
      redraw();
      return viewState;
    },
    onHover: showTooltip,
    onClick: (info) => {
      if (info.layer?.id === "nodes" && info.index >= 0) select(info.index);
      else clearSelection();
    },
  });
  updateHud();

  // fade out the loader, then fly in
  $("loading").style.opacity = "0";
  setTimeout(() => $("loading").remove(), 450);
  deckgl.setProps({
    initialViewState: {
      target: center,
      zoom: fitZoom,
      minZoom: fitZoom - 1.8,
      maxZoom: fitZoom + manifest.maxZoom + 4,
      transitionDuration: 1600,
      transitionInterpolator: new LinearInterpolator(["zoom"]),
    },
  });
}

main();
