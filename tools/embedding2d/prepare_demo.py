"""
Prepare static data for the zoomable-map demo (demo/index.html).

Reads the full alpha ladder (run/layout-aXXX.npz) and produces, under
demo/data/:
- nodes_xy_aXXX.f32     -- (n, 2) float32 positions, one file per alpha
- nodes_weight_aXXX.f32 -- (n,) float32 density-equalization weight (0..1]
- nodes_class.u8        -- (n,) uint8 type-class index (palette index)
- nodes_minzoom.u8      -- (n,) uint8 LOD reveal level
- nodes_degree.u16      -- (n,) uint16 link degree (clamped)
- edges_offsets.u32     -- (n+1,) CSR offsets into edges_neighbors
- edges_neighbors.u32   -- undirected adjacency, node indices
- manifest.json         -- alphas, extent, palette, types, labels, reveals

All per-alpha files share ONE row order (and one LOD assignment), both
computed from the alpha=1.0 layout: the viewer blends between position
buffers with a slider, which only works if row i is the same entity in
every buffer. LOD from a single canonical layout means the reveal order
is slightly off-optimal for the other levels -- an acceptable trade for
buffer alignment (the ladder is warm-chained, so points don't move far
between neighboring levels anyway).

Nodes are sorted by (min_zoom asc, importance desc), so the set visible
at reveal level z is exactly the first cumulative[z] rows -- the viewer
just adjusts how many rows it draws (GPU-side, via a rank filter).
"""

import json
import math
import re
import uuid
from pathlib import Path

import numpy as np
from scipy.ndimage import uniform_filter

from app.fit import Layout
from app.sample import connect
from plot_types import TYPE_QUERY

RUN = Path("run")
OUT = Path("demo/data")

# Golden-angle hue stepping in OKLCH: consecutive indices land maximally
# far apart on the hue wheel and never repeat, so the palette scales to
# any number of types. Fixed (perceptual) lightness/chroma tiers give
# every type equal visual weight on the dark background -- no color
# shouts or vanishes. Two alternating tiers add a lightness cue on top
# of hue, which helps once hues get crowded.
GOLDEN_ANGLE = 360.0 * (1.0 - 1.0 / ((1.0 + math.sqrt(5.0)) / 2.0))  # ~137.5
HUE_START = 250.0  # keep the dominant first type in the familiar blue
TIERS = [(0.76, 0.14), (0.65, 0.15)]  # (lightness, target chroma)

# Only label types with a real footprint; tiny types would spray
# unreadable labels over the map.
LABEL_MIN_COUNT = 2000

# Quadtree LOD: at reveal level z the layout is divided into 2^z x 2^z
# cells and each cell surfaces its top-K nodes by importance (that
# aren't already visible at a coarser level). Reveal is monotone:
# zooming in only adds nodes. K*4^z grows fast, so ~1M nodes are fully
# assigned around level 8; MAX_Z leaves headroom.
MAX_Z = 10
PER_CELL = 24

# Density-equalization weights for the viewer's far field. Point density
# spans orders of magnitude; linear light accumulation can only display
# ~one before clipping to white. Scaling each point's contribution by
# rho^-GAMMA makes accumulated brightness go as rho^(1-GAMMA) -- a
# compressive tone map applied in point space so it stays pixel-aligned
# and crisp at every zoom. The ratio clamp bounds how much cores are
# dimmed, keeping them clearly the brightest regions.
WEIGHT_GAMMA = 0.7
WEIGHT_MAX_RATIO = 150.0

DEGREE_QUERY = """
    SELECT web_id, entity_uuid, count(*) AS degree
    FROM (
        SELECT target_web_id AS web_id, target_entity_uuid AS entity_uuid
        FROM entity_edge
        WHERE direction = 'outgoing'
    ) endpoint
    GROUP BY web_id, entity_uuid
"""


def oklch_hex(lightness: float, chroma: float, hue_deg: float) -> str:
    """OKLCH -> sRGB hex, reducing chroma until inside the sRGB gamut
    (not every hue reaches the requested chroma at a given lightness)."""

    def to_srgb(c: float) -> float:
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    h = math.radians(hue_deg)
    while chroma >= 0:
        a, b = chroma * math.cos(h), chroma * math.sin(h)
        l_ = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
        m_ = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
        s_ = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
        rgb = (
            +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
            -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
            -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
        )
        if all(0.0 <= c <= 1.0 for c in rgb):
            return "#" + "".join(f"{round(to_srgb(c) * 255):02x}" for c in rgb)
        chroma -= 0.005  # walk back toward the gamut boundary
    raise ValueError(f"no sRGB color for L={lightness} h={hue_deg}")


def make_palette(count: int) -> list[str]:
    return [
        oklch_hex(*TIERS[i % len(TIERS)], HUE_START + i * GOLDEN_ANGLE)
        for i in range(count)
    ]


def alpha_tag(alpha: float) -> str:
    return f"a{round(alpha * 100):03d}"


def load_ladder(run: Path) -> dict[float, Layout]:
    """All layout-aXXX.npz files, keyed by alpha, descending."""
    layouts: dict[float, Layout] = {}
    for path in run.glob("layout-a*.npz"):
        match = re.fullmatch(r"layout-a(\d{3})\.npz", path.name)
        assert match is not None, path
        layouts[int(match.group(1)) / 100] = Layout.load(path)
    if not layouts:
        raise SystemExit(f"no layout-aXXX.npz files in {run}/ -- run main.py first")
    return dict(sorted(layouts.items(), reverse=True))


def entity_ids(metadata: np.ndarray) -> np.ndarray:
    """METADATA_DT records -> canonical `web~uuid` byte strings."""
    return np.array(
        [
            f"{uuid.UUID(bytes=r['web_id'].tobytes())}"
            f"~{uuid.UUID(bytes=r['entity_uuid'].tobytes())}".encode()
            for r in metadata
        ]
    )


def short_name(base_url: str) -> str:
    if "/entity-type/" not in base_url:
        return base_url
    return base_url.split("/entity-type/")[1].rstrip("/")


def assign_min_zoom(xy: np.ndarray, importance: np.ndarray) -> np.ndarray:
    n = len(xy)
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    norm = (xy - lo) / np.maximum(hi - lo, 1e-9)

    min_zoom = np.full(n, MAX_Z, dtype=np.uint8)
    remaining = np.ones(n, dtype=bool)

    for z in range(MAX_Z):
        cells = 1 << z
        ij = np.minimum((norm * cells).astype(np.int64), cells - 1)
        cell = ij[:, 0] * cells + ij[:, 1]

        idx = np.nonzero(remaining)[0]
        # sort by cell, then importance descending within the cell
        order = np.lexsort((-importance[idx], cell[idx]))
        sorted_idx = idx[order]
        sorted_cell = cell[idx][order]

        # rank within each cell run
        starts = np.r_[True, sorted_cell[1:] != sorted_cell[:-1]]
        run_start = np.maximum.accumulate(
            np.where(starts, np.arange(len(sorted_cell)), 0)
        )
        rank = np.arange(len(sorted_cell)) - run_start

        take = sorted_idx[rank < PER_CELL]
        min_zoom[take] = z
        remaining[take] = False

    return min_zoom


def build_csr(edges: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Undirected CSR adjacency from (m, 2) row pairs (demo row order)."""
    keep = edges[:, 0] != edges[:, 1]
    src, dst = edges[keep, 0], edges[keep, 1]

    u = np.concatenate([src, dst])
    v = np.concatenate([dst, src])

    order = np.argsort(u, kind="stable")
    neighbors = v[order].astype(np.uint32)
    offsets = np.zeros(n + 1, dtype=np.uint32)
    offsets[1:] = np.cumsum(np.bincount(u, minlength=n)).astype(np.uint32)
    return offsets, neighbors


def procrustes_align(target: np.ndarray, source: np.ndarray) -> np.ndarray:
    """Similarity-align `source` onto `target` (paired rows): optimal
    rotation/reflection + uniform scale + translation, least squares.

    Absolute scale/orientation between separate UMAP fits is arbitrary,
    so consecutive ladder levels differ by a similarity transform on top
    of real rearrangement; removing it keeps the slider from reading as
    a zoom/rotate and leaves only the movement that means something.
    """
    mu_t, mu_s = target.mean(axis=0), source.mean(axis=0)
    t, s = target - mu_t, source - mu_s
    u, sig, vt = np.linalg.svd(s.T @ t)
    rotation = u @ vt
    scale = sig.sum() / (s * s).sum()
    return ((s @ rotation) * scale + mu_t).astype(np.float32)


def density_weights(xy: np.ndarray, extent: list[list[float]]) -> np.ndarray:
    (xmin, ymin), (xmax, ymax) = extent
    bins = 512
    hist, _, _ = np.histogram2d(
        xy[:, 0], xy[:, 1], bins=bins, range=[[xmin, xmax], [ymin, ymax]]
    )
    smooth = np.maximum(uniform_filter(hist, size=3), 1e-9)
    ix = np.clip(
        ((xy[:, 0] - xmin) / (xmax - xmin) * bins).astype(np.int64), 0, bins - 1
    )
    iy = np.clip(
        ((xy[:, 1] - ymin) / (ymax - ymin) * bins).astype(np.int64), 0, bins - 1
    )
    rho = smooth[ix, iy]
    weight = np.clip(rho / np.median(rho), 1.0, WEIGHT_MAX_RATIO) ** -WEIGHT_GAMMA
    return weight.astype(np.float32)


def compute_labels(
    xy: np.ndarray,
    cls: np.ndarray,
    types: list[str],
    type_counts: list[int],
    extent: list[list[float]],
) -> list[dict]:
    """One label per sufficiently large type, placed at its densest spot.

    Iterates types in palette order, so every alpha level yields the
    same label list (same length, same order) -- the viewer lerps label
    positions between levels by index.
    """
    (xmin, ymin), (xmax, ymax) = extent
    bins = 256
    labels = []
    for i, t in enumerate(types):
        if type_counts[i] < LABEL_MIN_COUNT:
            continue
        pts = xy[cls == i]
        if not len(pts):
            continue
        hist, xe, ye = np.histogram2d(
            pts[:, 0], pts[:, 1], bins=bins, range=[[xmin, xmax], [ymin, ymax]]
        )
        smooth = uniform_filter(hist, size=5)
        bx, by = np.unravel_index(np.argmax(smooth), smooth.shape)
        labels.append(
            {
                "text": short_name(t),
                "position": [
                    float((xe[bx] + xe[bx + 1]) / 2),
                    float((ye[by] + ye[by + 1]) / 2),
                ],
                "class": i,
            }
        )
    return labels


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    layouts = load_ladder(RUN)
    alphas = list(layouts)  # descending; alphas[0] (=1.0) is canonical
    canonical = layouts[alphas[0]]
    metadata = canonical.metadata
    n = len(metadata)

    # One row order across all levels requires one shared entity set.
    for alpha in alphas[1:]:
        assert np.array_equal(layouts[alpha].metadata, metadata), (
            f"layout {alpha_tag(alpha)} was fitted on a different sample"
        )

    print(
        f"{len(alphas)} alpha levels over {n:,} nodes: "
        + ", ".join(f"{a:g}" for a in alphas)
    )

    ids = entity_ids(metadata)

    print("fetching entity types + degrees ...")
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(TYPE_QUERY)
            type_by_id = {f"{w}~{u}".encode(): base_url for w, u, base_url in cur}
        with conn.cursor() as cur:
            cur.execute(DEGREE_QUERY)
            degree_by_id = {f"{w}~{u}".encode(): d for w, u, d in cur}

    types_arr = np.array([type_by_id.get(i, "unknown") for i in ids])
    degree = np.array([degree_by_id.get(i, 0) for i in ids], dtype=np.int64)

    uniques, counts = np.unique(types_arr, return_counts=True)
    order = np.argsort(-counts)
    all_types = list(uniques[order])
    class_of = {t: i for i, t in enumerate(all_types)}
    cls = np.array([class_of[t] for t in types_arr], dtype=np.uint8)

    print("assigning LOD levels (from the alpha=1.0 layout) ...")
    rng = np.random.default_rng(42)
    importance = degree + rng.random(n)  # jitter breaks ties stably
    min_zoom = assign_min_zoom(canonical.xy, importance)

    # sort: coarser levels first, most important first within a level
    sort = np.lexsort((-importance, min_zoom))
    cls, degree, min_zoom = cls[sort], degree[sort], min_zoom[sort]

    # sample.edges.npy holds (source, target) sample-row pairs; remap
    # them through the inverse permutation into demo row order.
    inverse = np.empty(n, dtype=np.int64)
    inverse[sort] = np.arange(n)
    sample_edges = np.load(RUN / "sample.edges.npy")
    offsets, neighbors = build_csr(inverse[sample_edges], n)

    cumulative = np.searchsorted(min_zoom, np.arange(MAX_Z + 1), side="right")

    xys = {alpha: layouts[alpha].xy[sort].astype(np.float32) for alpha in alphas}

    # Chain-align each level onto its aligned predecessor, so the whole
    # ladder lives in the alpha=1.0 frame.
    for prev, cur in zip(alphas, alphas[1:]):
        xys[cur] = procrustes_align(xys[prev], xys[cur])

    # Global extent (union over levels): the camera and density binning
    # stay fixed while the slider morphs between levels.
    lo = np.min([xy.min(axis=0) for xy in xys.values()], axis=0)
    hi = np.max([xy.max(axis=0) for xy in xys.values()], axis=0)
    extent = [[float(lo[0]), float(lo[1])], [float(hi[0]), float(hi[1])]]

    print("writing demo/data ...")
    labels: dict[str, list[dict]] = {}
    type_names = [short_name(t) for t in all_types]
    type_counts = [int(c) for c in counts[order]]

    for alpha in alphas:
        tag = alpha_tag(alpha)
        xy = xys[alpha]
        xy.tofile(OUT / f"nodes_xy_{tag}.f32")
        density_weights(xy, extent).tofile(OUT / f"nodes_weight_{tag}.f32")
        labels[tag] = compute_labels(xy, cls, type_names, type_counts, extent)

    cls.tofile(OUT / "nodes_class.u8")
    min_zoom.tofile(OUT / "nodes_minzoom.u8")
    np.minimum(degree, 65535).astype(np.uint16).tofile(OUT / "nodes_degree.u16")
    offsets.tofile(OUT / "edges_offsets.u32")
    neighbors.tofile(OUT / "edges_neighbors.u32")

    # stale artifacts from older single-layout versions
    for old in ("nodes_xy.f32", "nodes_weight.f32", "background.png"):
        (OUT / old).unlink(missing_ok=True)

    files = {
        p.name: p.stat().st_size
        for p in OUT.iterdir()
        if p.suffix in {".f32", ".u8", ".u16", ".u32"}
    }
    manifest = {
        "count": int(n),
        "alphas": alphas,
        "extent": extent,
        "maxZoom": MAX_Z,
        "cumulative": cumulative.tolist(),
        "types": type_names,
        "palette": make_palette(len(all_types)),
        "typeCounts": type_counts,
        "labels": labels,
        "edgeCount": int(len(neighbors) // 2),
        "files": files,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    for z in range(MAX_Z + 1):
        print(f"  level {z:>2}: {cumulative[z]:>9,} nodes visible")
    print(f"done: {n:,} nodes, {len(neighbors) // 2:,} edges, {len(alphas)} levels")


if __name__ == "__main__":
    main()
