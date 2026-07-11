"""Merge-tree leaf persistence over a 2-D layout density raster (W3.2.1).

Pipeline (PRD defaults in parentheses):

1. Density raster: 2-D histogram of the layout at ``grid_size`` (1024) bins
   per axis over the *layout's own extent*, then a gaussian blur of
   ``bandwidth_px`` (4) pixels sigma (``scipy.ndimage.gaussian_filter``).
2. Superlevel-set sweep: pixels with density >= ``floor_frac`` (0.005) of
   the density max are processed in descending density order — equivalent
   to a threshold sweep descending over the unique density levels above the
   floor — with ties broken by flat pixel index, using a union-find with a
   per-component birth level. A pixel with no activated 8-neighbors births
   a new component at its own level. When components meet at level ``v``,
   the elder (higher birth; ties to lower component id) survives; each
   younger component with peak persistence ``birth - v >=
   persistence_frac * birth`` (0.05) is recorded as a leaf, otherwise it is
   merged silently. Components still alive at the floor are finalized the
   same way against the floor level.
3. A leaf born at ``B`` and merged/finalized at ``D`` has persistence
   ``P = B - D``. ``normalized_persistence`` is the sum of leaf
   persistences divided by the density max.

Anti-cheat property: because the histogram is taken over the layout's own
extent and persistence is normalized by the density max, uniformly
contracting the layout (multiplying all coordinates by a constant) leaves
the raster — and therefore leaf count and normalized persistence — exactly
unchanged (up to float rounding of bin assignment). Inflating density
contrast by collapsing points buys nothing.

Blind spot (by design): the metric is a pure function of the *multiset* of
layout positions and is blind to which node sits where. A row-shuffled
layout scores identically to its unshuffled source, so persistence gates
must always be paired with neighbor-identity metrics (kNN recall,
trustworthiness/continuity), per the atlas spec: "Persistence does not
replace neighbor metrics; both are required."
"""

from dataclasses import dataclass

import numpy as np
from pydantic import BaseModel, ConfigDict, PositiveFloat, PositiveInt
from scipy.ndimage import gaussian_filter

DEFAULT_GRID_SIZE = 1024
DEFAULT_BANDWIDTH_PX = 4.0
DEFAULT_FLOOR_FRAC = 0.005
DEFAULT_PERSISTENCE_FRAC = 0.05


class MergeTreeConfig(BaseModel):
    """Raster + sweep parameters (PRD defaults)."""

    model_config = ConfigDict(extra="forbid")

    grid_size: PositiveInt = DEFAULT_GRID_SIZE
    bandwidth_px: PositiveFloat = DEFAULT_BANDWIDTH_PX
    floor_frac: PositiveFloat = DEFAULT_FLOOR_FRAC
    persistence_frac: PositiveFloat = DEFAULT_PERSISTENCE_FRAC


@dataclass(frozen=True)
class MergeTreeResult:
    leaf_count: int
    total_persistence: float  # sum of leaf persistences, density units
    normalized_persistence: float  # total_persistence / density_max
    density_max: float
    leaves: tuple[tuple[float, float], ...]  # (birth, death) per leaf


def density_raster(
    xy: np.ndarray,
    *,
    grid_size: int = DEFAULT_GRID_SIZE,
    bandwidth_px: float = DEFAULT_BANDWIDTH_PX,
) -> np.ndarray:
    """2-D histogram over the layout's own extent + gaussian blur (pixels)."""

    xy = np.asarray(xy, dtype=np.float64)
    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError(f"xy must have shape (n, 2), got {xy.shape}")

    if grid_size < 2:
        raise ValueError("grid_size must be >= 2")

    if len(xy) == 0:
        return np.zeros((grid_size, grid_size))

    xmin, ymin = xy.min(axis=0)
    xmax, ymax = xy.max(axis=0)

    if xmax <= xmin:
        xmin, xmax = xmin - 0.5, xmax + 0.5

    if ymax <= ymin:
        ymin, ymax = ymin - 0.5, ymax + 0.5

    hist, _, _ = np.histogram2d(
        xy[:, 0], xy[:, 1], bins=grid_size, range=[[xmin, xmax], [ymin, ymax]]
    )

    return gaussian_filter(hist, sigma=bandwidth_px)


def merge_tree_from_density(
    density: np.ndarray,
    *,
    floor_frac: float = DEFAULT_FLOOR_FRAC,
    persistence_frac: float = DEFAULT_PERSISTENCE_FRAC,
) -> MergeTreeResult:
    """Persistence-style superlevel sweep over a density raster.

    Deterministic: pixels are processed in (descending density, ascending
    flat index) order and all tie-breaks are index-based.
    """
    d = np.asarray(density, dtype=np.float64)
    if d.ndim != 2:
        raise ValueError(f"density must be 2-d, got shape {d.shape}")

    density_max = float(d.max()) if d.size else 0.0
    if density_max <= 0.0:
        return MergeTreeResult(0, 0.0, 0.0, density_max, ())

    floor = floor_frac * density_max
    h, w = d.shape

    flat = d.ravel()
    active = np.nonzero(flat >= floor)[0]

    # Primary: descending density; ties: ascending flat index.
    order: list[int] = active[np.lexsort((active, -flat[active]))].tolist()
    values: list[float] = flat.tolist()

    comp_of: list[int] = [-1] * (h * w)
    parent: list[int] = []
    birth: list[float] = []
    leaves: list[tuple[float, float]] = []

    def find(child: int) -> int:
        root = child

        while parent[root] != root:
            root = parent[root]

        while parent[child] != root:
            parent[child], child = root, parent[child]

        return root

    for p in order:
        v = values[p]
        row, col = divmod(p, w)
        roots: list[int] = []

        for dir_row in (-1, 0, 1):
            row_neighbour = row + dir_row
            if not 0 <= row_neighbour < h:
                continue
            base = row_neighbour * w

            for dir_col in (-1, 0, 1):
                if dir_row == 0 and dir_col == 0:
                    continue

                col_neighbour = col + dir_col
                if not 0 <= col_neighbour < w:
                    continue

                q = comp_of[base + col_neighbour]

                if q >= 0:
                    root = find(q)
                    if root not in roots:
                        roots.append(root)

        if not roots:
            comp_of[p] = len(parent)
            parent.append(len(parent))
            birth.append(v)

            continue

        eldest = roots[0]
        for r in roots[1:]:
            if birth[r] > birth[eldest] or (birth[r] == birth[eldest] and r < eldest):
                eldest = r

        comp_of[p] = eldest
        for r in roots:
            if r == eldest:
                continue

            persistence = birth[r] - v
            if persistence >= persistence_frac * birth[r]:
                leaves.append((birth[r], v))

            parent[r] = eldest

    # Finalize survivors at the floor with the same persistence filter.
    for c in range(len(parent)):
        if parent[c] == c:
            persistence = birth[c] - floor

            if persistence >= persistence_frac * birth[c]:
                leaves.append((birth[c], floor))

    total = float(sum(b - death for b, death in leaves))

    return MergeTreeResult(
        leaf_count=len(leaves),
        total_persistence=total,
        normalized_persistence=total / density_max,
        density_max=density_max,
        leaves=tuple(leaves),
    )


def merge_tree_persistence(
    xy: np.ndarray, config: MergeTreeConfig | None = None
) -> MergeTreeResult:
    """Merge-tree leaf persistence of a layout (raster + sweep composed)."""
    config = config if config is not None else MergeTreeConfig()
    raster = density_raster(
        xy, grid_size=config.grid_size, bandwidth_px=config.bandwidth_px
    )

    return merge_tree_from_density(
        raster,
        floor_frac=config.floor_frac,
        persistence_frac=config.persistence_frac,
    )
