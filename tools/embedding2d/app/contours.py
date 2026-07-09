"""Region hierarchy from the density field: one structure, three products.

The KDE raster's level-set merge tree IS the cluster hierarchy: contours,
nested regions, and the label pyramid are all slices of it. No HDBSCAN, no
stacked Louvain-then-kmeans; a union-find pass over pixels sorted by density,
with persistence pruning (a peak survives if birth_density - merge_density
exceeds tau) instead of an arbitrary k or min_cluster_size.

Complexity: O(P log P) in pixel count for the sort, near-linear union-find.
A 1024^2 raster is ~1M pixels; the pure-Python sweep takes seconds to tens of
seconds (offline, per refit, per alpha). If it ever matters, the sweep is
mechanically numba-able; it touches only flat int arrays.

Products, per (refit, alpha):
  *-tree.json     region hierarchy: leaves are persistent density peaks,
                  internal nodes are merges, each with birth/death density,
                  persistence, peak position, pixel area, entity count.
  *.npz           label raster (int32, -1 = below floor) + density raster +
                  the affine transform mapping layout coords to pixels.
                  Serving-side incremental assignment is `assign()`: an O(1)
                  raster lookup per new entity. Nothing is re-clustered
                  between refits.
  *-contours.json marching-squares isolines (layout coordinates) at the
                  surviving merge levels, i.e. exactly the rings that
                  separate regions from their siblings. Nesting is inherent.

Conventions: labels in the raster are the MOST SPECIFIC node containing the
pixel; skirt pixels attached after a merge carry the merged (parent) node's
label, which is precisely the "outer contour mass around both children"
reading the map wants. Ancestors come from the tree.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import find_contours


@dataclass(frozen=True)
class ContourParams:
    grid: int = 1024
    # KDE bandwidth in pixels; couples to grid, not to layout units, so the
    # same value behaves the same across refits with different extents.
    bandwidth_px: float = 6.0
    # Persistence threshold as a fraction of max density: a peak must rise
    # this far above the saddle where it merges to count as a region. The
    # one knob that matters; read it through leaf count (aim for tens to
    # hundreds of leaves at the working zoom).
    persistence_frac: float = 0.05
    # Pixels below floor_frac * max density belong to no region (-1).
    floor_frac: float = 0.01
    margin_frac: float = 0.03  # extent padding so contours never clip


@dataclass(frozen=True)
class Transform:
    """layout coords -> pixel indices: ix = (x - x0) / cell, iy = (y - y0) / cell."""

    x0: float
    y0: float
    cell: float
    grid: int

    def to_pixel(self, xy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        ix = np.floor((xy[:, 0] - self.x0) / self.cell).astype(np.int64)
        iy = np.floor((xy[:, 1] - self.y0) / self.cell).astype(np.int64)
        return ix, iy

    def to_layout(self, ix: np.ndarray, iy: np.ndarray) -> np.ndarray:
        return np.stack(
            [self.x0 + (ix + 0.5) * self.cell, self.y0 + (iy + 0.5) * self.cell],
            axis=-1,
        )


def density_raster(
    xy: np.ndarray, params: ContourParams
) -> tuple[np.ndarray, Transform]:
    lo = xy.min(axis=0)
    hi = xy.max(axis=0)
    span = float(max(hi[0] - lo[0], hi[1] - lo[1], 1e-9))
    pad = span * params.margin_frac
    x0, y0 = float(lo[0] - pad), float(lo[1] - pad)
    cell = (span + 2 * pad) / params.grid
    t = Transform(x0=x0, y0=y0, cell=cell, grid=params.grid)

    ix, iy = t.to_pixel(xy)
    ok = (ix >= 0) & (ix < params.grid) & (iy >= 0) & (iy < params.grid)
    hist = np.zeros((params.grid, params.grid), dtype=np.float64)  # [iy, ix]
    np.add.at(hist, (iy[ok], ix[ok]), 1.0)
    dens = gaussian_filter(hist, sigma=params.bandwidth_px).astype(np.float32)
    return dens, t


_NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


class _UnionFind:
    def __init__(self, capacity: int):
        # identity init: every pixel is its own singleton from the start,
        # so joining pixels need no explicit make() before find/union.
        self.parent = np.arange(capacity, dtype=np.int64)

    def find(self, i: int) -> int:
        p = self.parent
        root = i
        while p[root] != root:
            root = p[root]
        while p[i] != root:  # path compression
            p[i], i = root, p[i]
        return root

    def union(self, a: int, b: int) -> int:
        """Attach b's root under a's root; returns a's root."""
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra
        return ra


def merge_tree(
    dens: np.ndarray, params: ContourParams
) -> tuple[np.ndarray, list[dict]]:
    """Persistence-pruned merge tree + per-pixel most-specific-node labels.

    Sweep pixels by descending density. A pixel with no higher neighbor
    births a component (candidate peak). A pixel adjacent to one component
    joins it. A pixel adjacent to several is a saddle: components whose
    persistence (birth - saddle) is below tau dissolve into the oldest;
    components above tau survive the merge as children of a new parent node.
    """
    g = dens.shape[0]
    dmax = float(dens.max())
    floor = dmax * params.floor_frac
    tau = dmax * params.persistence_frac

    flat = dens.ravel()
    active = np.nonzero(flat > floor)[0]
    order = active[np.argsort(flat[active])[::-1]]

    uf = _UnionFind(g * g)
    # per union-find root: the current tree node id
    root_node = {}
    # tree nodes; alias maps dissolved node -> absorbing node
    nodes: list[dict] = []
    alias: dict[int, int] = {}
    label = np.full(g * g, -1, dtype=np.int32)

    def new_node(birth: float, peak: int | None, children: list[int] | None) -> int:
        nid = len(nodes)
        nodes.append(
            {
                "id": nid,
                "birth": float(birth),
                "death": None,
                "parent": None,
                "peak_pixel": peak,
                "children": children or [],
            }
        )
        return nid

    in_set = np.zeros(g * g, dtype=bool)
    for p in order:
        py, px = divmod(int(p), g)
        cur = float(flat[p])

        roots = []
        for dy, dx in _NEIGH:
            ny, nx = py + dy, px + dx
            if 0 <= ny < g and 0 <= nx < g:
                q = ny * g + nx
                if in_set[q]:
                    r = uf.find(q)
                    if r not in roots:
                        roots.append(r)

        in_set[p] = True
        if not roots:
            nid = new_node(cur, int(p), None)
            root_node[p] = nid
            label[p] = nid
            continue

        comps = [(r, root_node[r]) for r in roots]
        # oldest = highest birth; it absorbs / parents the rest
        comps.sort(key=lambda rn: nodes[rn[1]]["birth"], reverse=True)
        survivors = [comps[0]]
        dissolved = []
        for r, nid in comps[1:]:
            if nodes[nid]["birth"] - cur >= tau:
                survivors.append((r, nid))
            else:
                dissolved.append((r, nid))

        base_root, base_nid = survivors[0]
        if len(survivors) > 1:
            parent = new_node(cur, None, [nid for _, nid in survivors])
            for _, nid in survivors:
                nodes[nid]["death"] = cur
                nodes[nid]["parent"] = parent
            for r, _ in survivors[1:]:
                base_root = uf.union(base_root, r)
            base_nid = parent
        for r, nid in dissolved:
            base_root = uf.union(base_root, r)
            alias[nid] = base_nid

        base_root = uf.union(base_root, int(p))
        for r, _ in comps:
            root_node.pop(r, None)
        root_node[base_root] = base_nid
        label[p] = base_nid

    # resolve alias chains in the label raster and drop dissolved nodes
    if alias:
        resolve = {}

        def chase(n: int) -> int:
            seen = n
            while seen in alias:
                seen = alias[seen]
            return seen

        for n in list(alias):
            resolve[n] = chase(n)
        lut = np.arange(len(nodes), dtype=np.int32)
        for src, dst in resolve.items():
            lut[src] = dst
        mask = label >= 0
        label[mask] = lut[label[mask]]

        # a dissolved MERGE node's subtree outlives it: its children are
        # persistent peaks in their own right, so reattach them (and
        # their parent pointers) to the absorbing node -- otherwise the
        # written tree has dangling parents and orphaned branches
        for src, dst in resolve.items():
            for c in nodes[src]["children"]:
                nodes[c]["parent"] = dst
                nodes[dst]["children"].append(c)
            nodes[src]["children"] = []

    # prune isolated low-persistence islands (LEAF peaks that never met
    # another component and never rose tau above the floor): they are
    # noise pimples, not regions. Their pixels drop to -1. Merge nodes
    # are exempt: a root merge with a thin skirt still parents
    # persistent children.
    lut = np.arange(len(nodes), dtype=np.int32)
    pruned = set()
    for n in nodes:
        if n["id"] in alias or n["children"]:
            continue
        if n["death"] is None and n["parent"] is None and (n["birth"] - floor) < tau:
            pruned.add(n["id"])
            lut[n["id"]] = -1
    if pruned:
        mask = label >= 0
        label[mask] = lut[label[mask]]

    kept = [n for n in nodes if n["id"] not in alias and n["id"] not in pruned]
    for n in kept:
        n["floor"] = floor
    return label.reshape(g, g), kept


def build(
    xy: np.ndarray,
    out_dir: Path,
    *,
    params: ContourParams = ContourParams(),
    name: str = "regions",
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    dens, t = density_raster(xy, params)
    label, nodes = merge_tree(dens, params)

    # per-node stats: pixel area and entity counts (most-specific label)
    ix, iy = t.to_pixel(xy)
    ok = (ix >= 0) & (ix < t.grid) & (iy >= 0) & (iy < t.grid)
    pt_labels = np.full(len(xy), -1, dtype=np.int32)
    pt_labels[ok] = label[iy[ok], ix[ok]]

    areas = np.bincount(label[label >= 0].ravel(), minlength=len(nodes))
    counts = np.bincount(pt_labels[pt_labels >= 0], minlength=len(nodes))
    for n in nodes:
        n["area_px"] = int(areas[n["id"]]) if n["id"] < len(areas) else 0
        n["n_entities"] = int(counts[n["id"]]) if n["id"] < len(counts) else 0
        n["persistence"] = float(
            n["birth"] - (n["death"] if n["death"] is not None else n["floor"])
        )
        if n["peak_pixel"] is not None:
            py, px = divmod(n["peak_pixel"], t.grid)
            n["peak_xy"] = [
                float(v) for v in t.to_layout(np.array([px]), np.array([py]))[0]
            ]
        del n["peak_pixel"]

    # contours at surviving merge levels: exactly the rings separating
    # siblings. Plus one level just above the floor, so root regions that
    # never merge with anything (a forest is normal) still get an outer
    # outline. find_contours works on the (row=y, col=x) raster; map back.
    levels = sorted({n["death"] for n in nodes if n["death"] is not None}, reverse=True)
    if nodes:
        levels.append(nodes[0]["floor"] * 1.05)
    contours = []
    for lvl in levels:
        rings = []
        for ring in find_contours(dens, lvl):
            ring_xy = t.to_layout(ring[:, 1], ring[:, 0])
            rings.append(np.round(ring_xy, 2).tolist())
        contours.append({"level": float(lvl), "rings": rings})

    np.savez_compressed(
        out_dir / f"{name}.npz",
        label=label,
        density=dens,
        transform=np.array([t.x0, t.y0, t.cell, t.grid], dtype=np.float64),
    )
    (out_dir / f"{name}-tree.json").write_text(json.dumps(nodes, indent=1))
    (out_dir / f"{name}-contours.json").write_text(json.dumps(contours))
    return {"nodes": nodes, "label": label, "transform": t, "density": dens}


def assign(xy: np.ndarray, label: np.ndarray, transform: Transform) -> np.ndarray:
    """O(1) incremental region assignment for new entities between refits."""
    ix, iy = transform.to_pixel(np.atleast_2d(xy))
    out = np.full(len(ix), -1, dtype=np.int32)
    ok = (ix >= 0) & (ix < transform.grid) & (iy >= 0) & (iy < transform.grid)
    out[ok] = label[iy[ok], ix[ok]]
    return out


def load_for_assignment(path: Path) -> tuple[np.ndarray, Transform]:
    with np.load(path) as data:
        x0, y0, cell, grid = data["transform"]
        return data["label"].copy(), Transform(
            x0=float(x0), y0=float(y0), cell=float(cell), grid=int(grid)
        )
