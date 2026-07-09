"""
Prepare static data for the zoomable-map demo (demo/index.html).

Produces, under demo/data/:
- nodes_xy.f32       -- (n, 2) float32 layout positions
- nodes_class.u8     -- (n,) uint8 type-class index (palette index)
- nodes_minzoom.u8   -- (n,) uint8 LOD reveal level
- nodes_degree.u16   -- (n,) uint16 link degree (clamped)
- nodes_weight.f32   -- (n,) float32 density-equalization weight (0..1]
- edges_offsets.u32  -- (n+1,) CSR offsets into edges_neighbors
- edges_neighbors.u32-- undirected adjacency, node indices
- manifest.json      -- extent, palette, types, labels, reveal counts

Nodes are sorted by (min_zoom asc, importance desc), so the set visible
at reveal level z is exactly the first cumulative[z] rows -- the viewer
just adjusts how many rows it draws (GPU-side, via a rank filter).
Within a level the most important nodes come first, letting the viewer
interpolate between levels for a smooth reveal while zooming.
"""

import json
import math
from pathlib import Path

import numpy as np
from scipy.ndimage import uniform_filter

import app.fit as f
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


# Quadtree LOD: at reveal level z the layout is divided into 2^z x 2^z
# cells and each cell surfaces its top-K nodes by importance (that
# aren't already visible at a coarser level). Reveal is monotone:
# zooming in only adds nodes. K*4^z grows fast, so ~1M nodes are fully
# assigned around level 8; MAX_Z leaves headroom.
MAX_Z = 10
PER_CELL = 24

DEGREE_QUERY = """
    SELECT web_id, entity_uuid, count(*) AS degree
    FROM (
        SELECT left_web_id AS web_id, left_entity_uuid AS entity_uuid
        FROM entity_has_left_entity
        UNION ALL
        SELECT right_web_id, right_entity_uuid
        FROM entity_has_right_entity
    ) endpoint
    GROUP BY web_id, entity_uuid
"""

# Link entities themselves carry no embeddings, so they aren't on the
# map; an "edge" for the demo connects a link's left target directly to
# its right target (both of which are embedded whole entities).
EDGE_QUERY = """
    SELECT l.left_web_id, l.left_entity_uuid, r.right_web_id, r.right_entity_uuid
    FROM entity_has_left_entity l
    JOIN entity_has_right_entity r
        ON l.web_id = r.web_id AND l.entity_uuid = r.entity_uuid
"""


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


def fetch_edges(
    conn, index_of: dict[bytes, int], n: int
) -> tuple[np.ndarray, np.ndarray]:
    """Undirected CSR adjacency over layout row indices."""
    src: list[int] = []
    dst: list[int] = []

    with conn.cursor(name="edges", binary=True) as cur:
        cur.itersize = 100_000
        cur.execute(EDGE_QUERY)
        while batch := cur.fetchmany(100_000):
            for lw, lu, rw, ru in batch:
                a = index_of.get(f"{lw}~{lu}".encode())
                b = index_of.get(f"{rw}~{ru}".encode())
                if a is not None and b is not None:
                    src.append(a)
                    dst.append(b)

    u = np.concatenate([np.array(src, dtype=np.int64), np.array(dst, dtype=np.int64)])
    v = np.concatenate([np.array(dst, dtype=np.int64), np.array(src, dtype=np.int64)])

    order = np.argsort(u, kind="stable")
    neighbors = v[order].astype(np.uint32)
    offsets = np.zeros(n + 1, dtype=np.uint32)
    offsets[1:] = np.cumsum(np.bincount(u, minlength=n)).astype(np.uint32)
    return offsets, neighbors


def compute_labels(
    xy: np.ndarray,
    cls: np.ndarray,
    types: list[str],
    type_counts: list[int],
    extent: list[list[float]],
) -> list[dict]:
    """One label per sufficiently large type, placed at its densest spot."""
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
    layout = f.Layout.load(RUN / "layout.npz")
    n = len(layout.ids)

    print("fetching entity types + degrees ...")
    with f.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(TYPE_QUERY)
            type_by_id = {f"{w}~{u}".encode(): base_url for w, u, base_url in cur}
        with conn.cursor() as cur:
            cur.execute(DEGREE_QUERY)
            degree_by_id = {f"{w}~{u}".encode(): d for w, u, d in cur}

        types_arr = np.array([type_by_id.get(i, "unknown") for i in layout.ids])
        degree = np.array([degree_by_id.get(i, 0) for i in layout.ids], dtype=np.int64)

        uniques, counts = np.unique(types_arr, return_counts=True)
        order = np.argsort(-counts)
        all_types = list(uniques[order])
        class_of = {t: i for i, t in enumerate(all_types)}
        cls = np.array([class_of[t] for t in types_arr], dtype=np.uint8)

        print("assigning LOD levels ...")
        rng = np.random.default_rng(42)
        importance = degree + rng.random(n)  # jitter breaks ties stably
        min_zoom = assign_min_zoom(layout.xy, importance)

        # sort: coarser levels first, most important first within a level
        sort = np.lexsort((-importance, min_zoom))
        xy = layout.xy[sort].astype(np.float32)
        cls, degree, min_zoom = cls[sort], degree[sort], min_zoom[sort]
        ids_sorted = layout.ids[sort]

        print("fetching edges ...")
        index_of = {id_: i for i, id_ in enumerate(ids_sorted)}
        offsets, neighbors = fetch_edges(conn, index_of, n)

    cumulative = np.searchsorted(min_zoom, np.arange(MAX_Z + 1), side="right")
    extent = [
        [float(xy[:, 0].min()), float(xy[:, 1].min())],
        [float(xy[:, 0].max()), float(xy[:, 1].max())],
    ]

    # Density-equalization weights for the viewer's far field. Point
    # density spans orders of magnitude; linear light accumulation can
    # only display ~one before clipping to white. Scaling each point's
    # contribution by rho^-GAMMA makes accumulated brightness go as
    # rho^(1-GAMMA) -- a compressive tone map (like the log-scaled
    # density render this replaces), applied in point space so it stays
    # pixel-aligned and crisp at every zoom. The ratio clamp bounds how
    # much cores are dimmed, keeping them clearly the brightest regions.
    print("computing density weights ...")
    GAMMA = 0.7
    MAX_RATIO = 150.0
    bins = 512
    (xmin, ymin), (xmax, ymax) = extent
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
    weight = np.clip(rho / np.median(rho), 1.0, MAX_RATIO) ** -GAMMA

    print("writing demo/data ...")
    xy.tofile(OUT / "nodes_xy.f32")
    cls.tofile(OUT / "nodes_class.u8")
    min_zoom.tofile(OUT / "nodes_minzoom.u8")
    np.minimum(degree, 65535).astype(np.uint16).tofile(OUT / "nodes_degree.u16")
    weight.astype(np.float32).tofile(OUT / "nodes_weight.f32")
    offsets.tofile(OUT / "edges_offsets.u32")
    neighbors.tofile(OUT / "edges_neighbors.u32")

    type_names = [short_name(t) for t in all_types]
    type_counts = [int(c) for c in counts[order]]

    (OUT / "background.png").unlink(missing_ok=True)  # from older versions
    files = {
        p.name: p.stat().st_size
        for p in OUT.iterdir()
        if p.suffix in {".f32", ".u8", ".u16", ".u32"}
    }
    manifest = {
        "count": int(n),
        "extent": extent,
        "maxZoom": MAX_Z,
        "cumulative": cumulative.tolist(),
        "types": type_names,
        "palette": make_palette(len(all_types)),
        "typeCounts": type_counts,
        "labels": compute_labels(xy, cls, type_names, type_counts, extent),
        "edgeCount": int(len(neighbors) // 2),
        "files": files,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    for z in range(MAX_Z + 1):
        print(f"  level {z:>2}: {cumulative[z]:>9,} nodes visible")
    print(f"done: {n:,} nodes, {len(neighbors) // 2:,} edges")


if __name__ == "__main__":
    main()
