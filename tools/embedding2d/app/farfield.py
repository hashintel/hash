"""Far-field first paint: a compact vector slice of the region products.

The blurred KDE raster is the instrument, not the picture: bandwidth_px of
smoothing is what makes the merge tree stable, but painting that raster
directly is physically out of focus (the regions-aXXX.png mud). The far
view is the *vector* slice of the same structure:

  farfield-aXXX.json          a ~top-K tree cut (see slice_tree: split by
                              entity mass, split parents kept as faint
                              `envelope` outlines), each region with its
                              boundary rings vectorized from the label
                              raster and Visvalingam-simplified to pixel
                              scale. Tens of KB, crisp at any zoom. The
                              `persistence` field is the label/LOD
                              ranking for the viewer.
  farfield-aXXX-density.png   small log-toned grayscale texture; the one
                              place the KDE blur is a feature, because it
                              is explicitly a glow underlayer, never the
                              figure.

Boundaries come from the LABEL raster (a region's territory = the pixels
of its subtree's most-specific labels), NOT from density iso-levels: the
raster is what `assign()` serves, so the drawn shape and the served region
always agree, sibling territories share borders instead of overlapping,
and each territory is one connected blob (union-find components grow by
pixel adjacency) -- one outer ring plus holes, no speckle.

First paint = glow texture + fills/strokes from the rings + labels for the
top-persistence regions. Points then stream in under an already-complete
picture, so latency reads as sharpening, not loading.

Regions are emitted in painter's order (subtree pixel area descending:
parents strictly contain their children's territory, so bigger-first
nests correctly in one pass); label LOD is a client-side sort on the
`persistence` field.
"""

from __future__ import annotations

import argparse
import heapq
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.measure import find_contours

from app.contours import Transform


@dataclass(frozen=True)
class FarfieldParams:
    # Slice size: split budget AND cut cap. A count, not a density or
    # persistence threshold, so the payload size is predictable and the
    # setting transfers across graphs whose density scales differ.
    top_k: int = 64
    # Boundaries are traced on a majority-vote downsample of the label
    # raster, not the analysis grid: the far view never resolves 2048
    # cells, and the skirt-gap filigree of dense cores is fractal at
    # full resolution (megabytes of ring points that render sub-pixel).
    # Coarse cells also act as morphological smoothing. 512 halves the
    # payload again but coastlines start reading low-poly.
    boundary_grid: int = 1024
    # Visvalingam effective-area floor in boundary-grid px^2. The mask
    # contour's half-pixel staircase (0.125 px^2 triangles) vanishes at
    # anything >~0.5; beyond ~4 simplification starts eating real shape.
    simplify_px2: float = 2.0
    # Rings enclosing less than this many boundary-grid px^2 are dropped:
    # pinhole holes and islets that are sub-pixel at any far zoom (the
    # glow shows through regardless).
    min_ring_px2: float = 4.0
    density_res: int = 256


def visvalingam(ring: np.ndarray, min_area: float) -> np.ndarray:
    """Visvalingam-Whyatt: repeatedly drop the vertex spanning the
    smallest triangle until every remaining vertex spans >= min_area.
    Cyclic over a closed ring (first == last); returns a closed ring."""
    pts = ring[:-1] if bool(np.all(ring[0] == ring[-1])) else ring
    n = len(pts)
    if n <= 4:
        return np.vstack([pts, pts[:1]])

    prev = np.roll(np.arange(n), 1)
    nxt = np.roll(np.arange(n), -1)
    alive = np.ones(n, dtype=bool)
    version = np.zeros(n, dtype=np.int64)
    x, y = pts[:, 0], pts[:, 1]

    def area(i: int) -> float:
        a, c = prev[i], nxt[i]
        return 0.5 * abs((x[i] - x[a]) * (y[c] - y[a]) - (x[c] - x[a]) * (y[i] - y[a]))

    heap = [(area(i), i, 0) for i in range(n)]
    heapq.heapify(heap)
    remaining = n
    while heap and remaining > 3:
        a, i, v = heapq.heappop(heap)
        if not alive[i] or v != version[i]:  # lazy invalidation
            continue
        if a >= min_area:
            break
        alive[i] = False
        remaining -= 1
        p, q = prev[i], nxt[i]
        nxt[p], prev[q] = q, p
        for j in (p, q):
            version[j] += 1
            heapq.heappush(heap, (area(j), j, int(version[j])))

    keep = pts[alive]
    return np.vstack([keep, keep[:1]])


def slice_tree(nodes: list[dict], top_k: int) -> list[dict]:
    """Greedy tree cut by entity mass, plus its envelope ancestors.

    Repeatedly split the most entity-massive region into its children
    (top_k splits, then cap the cut at the top_k most massive members).
    Mass, not persistence, decides where the budget goes: ranking nodes
    by persistence spends slots on tiny-but-dense isolated islands while
    painting the whole core as one root blob. The build's tau already
    guarantees every surviving child is a real peak, so mass-first
    splitting decomposes the continents without descending into noise.
    Split parents are kept as `envelope` regions -- their outline still
    reads as the continent under the finer shapes drawn on top.

    Output regions carry subtree label ids (the raster pixels the
    territory owns), entity/pixel rollups, and the nearest emitted
    ancestor. Painter's order (area descending)."""
    by_id = {n["id"]: n for n in nodes}
    roots = [n["id"] for n in nodes if n["parent"] is None]

    # subtree rollups, iterative post-order over the forest
    mass: dict[int, int] = {}
    area: dict[int, int] = {}
    stack = [(r, False) for r in roots]
    while stack:
        nid, done = stack.pop()
        kids = by_id[nid]["children"]
        if not done:
            stack.append((nid, True))
            stack.extend((c, False) for c in kids)
        else:
            mass[nid] = by_id[nid]["n_entities"] + sum(mass[c] for c in kids)
            area[nid] = by_id[nid]["area_px"] + sum(area[c] for c in kids)

    heap = [(-mass[r], r) for r in roots]
    heapq.heapify(heap)
    final: list[int] = []
    envelopes: list[int] = []
    for _ in range(top_k):
        while heap and not by_id[heap[0][1]]["children"]:
            final.append(heapq.heappop(heap)[1])  # leaf: unsplittable, keep
        if not heap:
            break
        _, nid = heapq.heappop(heap)
        # only root envelopes are emitted: intermediate merge nodes trace
        # near-identical nested coastlines that cost points and clutter
        if by_id[nid]["parent"] is None:
            envelopes.append(nid)
        for c in by_id[nid]["children"]:
            heapq.heappush(heap, (-mass[c], c))
    cut = sorted(final + [nid for _, nid in heap], key=lambda i: -mass[i])[:top_k]

    def subtree(nid: int) -> list[int]:
        out, stack = [], [nid]
        while stack:
            cur = stack.pop()
            out.append(cur)
            stack.extend(by_id[cur]["children"])
        return out

    emitted = set(cut) | set(envelopes)
    regions = []
    for nid in envelopes + cut:
        parent = by_id[nid]["parent"]
        while parent is not None and parent not in emitted:
            parent = by_id[parent]["parent"]
        regions.append(
            {
                "id": nid,
                "parent": parent,
                "envelope": nid in envelopes,
                "persistence": round(float(by_id[nid]["persistence"]), 4),
                "n_entities": mass[nid],
                "area_px": area[nid],
                "_subtree": subtree(nid),
            }
        )
    regions.sort(key=lambda r: r["area_px"], reverse=True)
    return regions


def density_texture(dens: np.ndarray, res: int) -> np.ndarray:
    """Log-toned uint8 glow texture, block-averaged down to res^2."""
    g = dens.shape[0]
    if g % res == 0:
        f = g // res
        small = dens.reshape(res, f, res, f).mean(axis=(1, 3))
    else:
        small = np.asarray(Image.fromarray(dens).resize((res, res), Image.BILINEAR))
    toned = (np.log1p(small) / np.log1p(max(float(small.max()), 1e-9))) ** 0.7
    return (toned * 255).astype(np.uint8)


def build_farfield(
    regions_dir: Path, tag: str, params: FarfieldParams = FarfieldParams()
) -> Path:
    with np.load(regions_dir / f"regions-{tag}.npz") as data:
        label, dens = data["label"], data["density"]
        x0, y0, cell, grid = data["transform"]
    t = Transform(x0=float(x0), y0=float(y0), cell=float(cell), grid=int(grid))
    nodes = json.loads((regions_dir / f"regions-{tag}-tree.json").read_text())

    regions = slice_tree(nodes, params.top_k)
    member = np.zeros(max(n["id"] for n in nodes) + 1, dtype=bool)
    valid = label >= 0
    lv = label[valid]
    factor = max(t.grid // params.boundary_grid, 1)

    def trace(mask: np.ndarray, f: int) -> list[list[list[float]]]:
        if f > 1:
            g = mask.shape[0] // f
            mask = mask.reshape(g, f, g, f).mean(axis=(1, 3)) > 0.5
        rings = []
        for ring in find_contours(mask.astype(np.float32), 0.5):
            simplified = visvalingam(ring, params.simplify_px2 / f**2 * factor**2)
            if len(simplified) < 4:
                continue
            x, y = simplified[:, 1], simplified[:, 0]
            enclosed = 0.5 * abs(float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))
            if enclosed < params.min_ring_px2 / f**2 * factor**2:
                continue
            # find_contours yields (row=y, col=x) in coarse cells; a
            # coarse cell's center sits at fine index c*f + (f-1)/2
            ring_xy = t.to_layout(x * f + (f - 1) / 2, y * f + (f - 1) / 2)
            rings.append(np.round(ring_xy, 2).tolist())
        return rings

    for r in regions:
        member[:] = False
        member[r.pop("_subtree")] = True
        mask = np.zeros(label.shape, dtype=bool)
        mask[valid] = member[lv]

        # regions thinner than a coarse cell vanish in the majority
        # vote; retrace those few at full resolution
        r["rings"] = trace(mask, factor) or trace(mask, 1)

        # label anchor: densest pixel of the territory (internal nodes
        # have no peak of their own; this lands on the strongest child's
        # peak, which coexists fine with LOD-staggered labels)
        flat = int(np.argmax(np.where(mask, dens, -1.0)))
        ay, ax = divmod(flat, t.grid)
        r["anchor"] = [
            round(float(v), 2) for v in t.to_layout(np.array([ax]), np.array([ay]))[0]
        ]

    payload = {
        "extent": [
            [t.x0, t.y0],
            [t.x0 + t.grid * t.cell, t.y0 + t.grid * t.cell],
        ],
        "params": {"top_k": params.top_k, "simplify_px2": params.simplify_px2},
        "regions": regions,
    }
    out = regions_dir / f"farfield-{tag}.json"
    out.write_text(json.dumps(payload))

    # glow texture spans the same extent; row 0 = extent top (+y up)
    Image.fromarray(density_texture(dens, params.density_res)[::-1], mode="L").save(
        regions_dir / f"farfield-{tag}-density.png"
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=Path("run"))
    parser.add_argument("--source", choices=["encoder", "layout"], default="layout")
    parser.add_argument("--top-k", type=int, default=64)
    parser.add_argument("--boundary-grid", type=int, default=1024)
    parser.add_argument("--simplify-px2", type=float, default=2.0)
    parser.add_argument("--density-res", type=int, default=256)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    params = FarfieldParams(
        top_k=args.top_k,
        boundary_grid=args.boundary_grid,
        simplify_px2=args.simplify_px2,
        density_res=args.density_res,
    )

    regions_dir = args.run / f"regions-{args.source}"
    tags = sorted(
        m.group(1)
        for p in regions_dir.glob("regions-a*.npz")
        if (m := re.fullmatch(r"regions-(a\d{3})\.npz", p.name))
    )
    if not tags:
        raise SystemExit(f"no regions-aXXX.npz in {regions_dir}/ -- run app.regions")

    for tag in tags:
        out = build_farfield(regions_dir, tag, params)
        payload = json.loads(out.read_text())
        points = sum(len(ring) for r in payload["regions"] for ring in r["rings"])
        n_env = sum(r["envelope"] for r in payload["regions"])
        logging.info(
            f"farfield {tag}: {len(payload['regions']) - n_env} regions "
            f"+ {n_env} envelopes, {points:,} ring points, "
            f"{out.stat().st_size / 1024:.0f} KB"
        )


if __name__ == "__main__":
    main()
