"""Merge-tree leaf persistence over a 2-D layout density raster.

This is the battery's primary structure metric. Pipeline (defaults in parentheses):

1. Density raster: a 2-D histogram of the layout at ``grid_size`` (1024) bins per axis over the
   layout's own extent, then a gaussian blur of ``bandwidth_px`` (4) pixels sigma
   (``scipy.ndimage.gaussian_filter``). Calibrated reference values are recorded against these
   defaults; changing them invalidates every recorded reference.
2. Superlevel-set sweep: pixels with density at or above ``floor_frac`` (0.005) of the density
   maximum are processed in descending density order, which is equivalent to a threshold sweep
   descending over the unique density levels above the floor, with ties broken by flat pixel
   index, using a union-find with a per-component birth level. A pixel with no activated
   8-neighbors births a new component at its own level. When components meet at level ``v``, the
   elder (higher birth; ties go to the lower component id) survives; each younger component
   whose persistence ``birth - v`` reaches ``persistence_frac * birth`` (0.05) is recorded as a
   leaf, otherwise it is merged silently. Components still alive at the floor are finalized the
   same way against the floor level.
3. A leaf born at ``B`` and merged or finalized at ``D`` has persistence ``P = B - D``.
   ``normalized_persistence`` is the sum of leaf persistences divided by the density maximum.

Anti-cheat property: because the histogram is taken over the layout's own per-axis extent and
persistence is normalized by the density maximum, any positive per-axis affine map
``(x, y) -> (a*x + c, b*y + d)`` with ``a, b > 0`` — uniform contraction included, but also
anisotropic scaling and translation — leaves the raster bit-identical, and therefore leaf count
and normalized persistence exactly unchanged (measured bit-identical at both the test and the
production grid; adversarial bin-boundary values could in principle round differently).
Inflating density contrast by collapsing points buys nothing, isotropically or anisotropically.
The invariance holds for every positive scale (an axis shrunk by ``1e-9`` scores exactly like
an unshrunk one) and breaks only at exactly zero, where the degenerate-extent widening below
takes over — an intentional discontinuity, pinned in the tests.

Frame caveat: the raster frame is the layout's own axis-aligned bounding box with square bins
in index space; there is no common isotropic frame. The score is therefore NOT invariant under
rigid rotation — rotating a layout can change leaf count and persistence — and the affine
invariance means the metric cannot police aspect-ratio or per-axis density distortion.

Blind spot (by design): the metric is a pure function of the *multiset* of layout positions and
is blind to which node sits where, and — per the affine invariance above — blind to per-axis
distortion of where those positions sit. A row-shuffled or anisotropically squashed layout
scores identically to its source, so persistence gates never stand alone; suites pair them with
neighbor-identity metrics such as kNN recall and trustworthiness/continuity, which collapse
under exactly the distortions this metric ignores.
"""

from dataclasses import dataclass, field
from typing import Annotated, Final

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat, PositiveInt
from scipy.ndimage import gaussian_filter

DEFAULT_GRID_SIZE = 1024
DEFAULT_BANDWIDTH_PX = 4.0
DEFAULT_FLOOR_FRAC = 0.005
DEFAULT_PERSISTENCE_FRAC = 0.05

_LAYOUT_AXES: Final = 2
"""Layouts are (n, 2) point sets and density rasters are 2-D grids."""

_MIN_GRID_SIZE: Final = 2
"""A raster needs at least two bins per axis to resolve any structure."""

type PositiveFraction = Annotated[float, Field(gt=0.0, le=1.0)]
"""A strictly positive fraction of a maximum, in the interval (0, 1]."""


class MergeTreeConfig(BaseModel):
    """Density raster and superlevel-sweep parameters.

    The defaults are the calibrated production values; recorded reference values (see
    :mod:`atlas_tools.battery.calibrate`) assume them.
    """

    model_config = ConfigDict(extra="forbid")

    grid_size: PositiveInt = DEFAULT_GRID_SIZE
    bandwidth_px: PositiveFloat = DEFAULT_BANDWIDTH_PX
    floor_frac: PositiveFraction = DEFAULT_FLOOR_FRAC
    persistence_frac: PositiveFraction = DEFAULT_PERSISTENCE_FRAC


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
    """Rasterize a layout into a blurred 2-D density histogram over its own extent.

    The histogram spans exactly the layout's bounding box (a degenerate axis is widened by 0.5
    on each side) with ``grid_size`` bins per axis, then receives a gaussian blur of
    ``bandwidth_px`` pixels sigma. Rasterizing over the layout's own per-axis extent makes the
    raster invariant to positive per-axis affine maps (scaling and translation, anisotropic
    included) but not to rotation — see the module docstring for the full invariance class and
    its limits. An empty layout yields an all-zero raster; raises
    :class:`ValueError` for non-(n, 2) input or ``grid_size < 2``.
    """
    xy = np.asarray(xy, dtype=np.float64)
    if xy.ndim != _LAYOUT_AXES or xy.shape[1] != _LAYOUT_AXES:
        raise ValueError(f"xy must have shape (n, 2), got {xy.shape}")

    if grid_size < _MIN_GRID_SIZE:
        raise ValueError("grid_size must be >= 2")

    if len(xy) == 0:
        return np.zeros((grid_size, grid_size))

    xmin, ymin = xy.min(axis=0)
    xmax, ymax = xy.max(axis=0)

    if xmax <= xmin:
        xmin, xmax = xmin - 0.5, xmax + 0.5

    if ymax <= ymin:
        ymin, ymax = ymin - 0.5, ymax + 0.5

    histogram, _, _ = np.histogram2d(
        xy[:, 0], xy[:, 1], bins=grid_size, range=[[xmin, xmax], [ymin, ymax]]
    )

    return gaussian_filter(histogram, sigma=bandwidth_px)


@dataclass
class _Components:
    """Union-find over sweep components, each carrying the density level it was born at."""

    parent: list[int] = field(default_factory=list)
    birth: list[float] = field(default_factory=list)

    def add(self, birth_level: float) -> int:
        """Create a new root component born at ``birth_level`` and return its id."""
        component = len(self.parent)
        self.parent.append(component)
        self.birth.append(birth_level)

        return component

    def find(self, child: int) -> int:
        """Return the root of ``child``, compressing the path along the way."""
        root = child

        while self.parent[root] != root:
            root = self.parent[root]

        while self.parent[child] != root:
            self.parent[child], child = root, self.parent[child]

        return root


def _neighbor_roots(
    components: _Components,
    component_of: list[int],
    pixel: int,
    height: int,
    width: int,
) -> list[int]:
    """Collect the distinct component roots among a pixel's activated 8-neighbors."""
    row, col = divmod(pixel, width)
    roots: list[int] = []

    for row_offset in (-1, 0, 1):
        neighbor_row = row + row_offset
        if not 0 <= neighbor_row < height:
            continue
        base = neighbor_row * width

        for col_offset in (-1, 0, 1):
            if row_offset == 0 and col_offset == 0:
                continue

            neighbor_col = col + col_offset
            if not 0 <= neighbor_col < width:
                continue

            neighbor_component = component_of[base + neighbor_col]

            if neighbor_component >= 0:
                root = components.find(neighbor_component)
                if root not in roots:
                    roots.append(root)

    return roots


def _merge_roots(
    components: _Components,
    roots: list[int],
    level: float,
    persistence_frac: float,
    leaves: list[tuple[float, float]],
) -> int:
    """Merge the meeting components into the eldest at ``level``; return the survivor.

    The elder (higher birth; ties go to the lower component id) survives. Each younger component
    whose persistence ``birth - level`` reaches ``persistence_frac * birth`` is recorded as a
    leaf; the rest merge silently.
    """
    eldest = roots[0]
    for root in roots[1:]:
        if components.birth[root] > components.birth[eldest] or (
            components.birth[root] == components.birth[eldest] and root < eldest
        ):
            eldest = root

    for root in roots:
        if root == eldest:
            continue

        persistence = components.birth[root] - level
        if persistence >= persistence_frac * components.birth[root]:
            leaves.append((components.birth[root], level))

        components.parent[root] = eldest

    return eldest


def _finalize_survivors(
    components: _Components,
    floor: float,
    persistence_frac: float,
    leaves: list[tuple[float, float]],
) -> None:
    """Record components still alive at the floor as leaves, under the same persistence filter."""
    for component in range(len(components.parent)):
        if components.parent[component] == component:
            birth = components.birth[component]

            if birth - floor >= persistence_frac * birth:
                leaves.append((birth, floor))


def merge_tree_from_density(
    density: np.ndarray,
    *,
    floor_frac: float = DEFAULT_FLOOR_FRAC,
    persistence_frac: float = DEFAULT_PERSISTENCE_FRAC,
) -> MergeTreeResult:
    """Run the persistence superlevel sweep over a density raster.

    Deterministic: pixels are processed in (descending density, ascending flat index) order and
    all tie-breaks are index-based. Raises :class:`ValueError` for a non-2-D raster; an all-zero
    raster yields zero leaves.
    """
    density = np.asarray(density, dtype=np.float64)
    if density.ndim != _LAYOUT_AXES:
        raise ValueError(f"density must be 2-d, got shape {density.shape}")

    density_max = float(density.max()) if density.size else 0.0
    if density_max <= 0.0:
        return MergeTreeResult(0, 0.0, 0.0, density_max, ())

    floor = floor_frac * density_max
    height, width = density.shape

    flat = density.ravel()
    active = np.nonzero(flat >= floor)[0]

    # Primary: descending density; ties: ascending flat index.
    order: list[int] = active[np.lexsort((active, -flat[active]))].tolist()
    values: list[float] = flat.tolist()

    component_of: list[int] = [-1] * (height * width)
    components = _Components()
    leaves: list[tuple[float, float]] = []

    for pixel in order:
        level = values[pixel]
        roots = _neighbor_roots(components, component_of, pixel, height, width)

        if roots:
            component_of[pixel] = _merge_roots(components, roots, level, persistence_frac, leaves)
        else:
            component_of[pixel] = components.add(level)

    _finalize_survivors(components, floor, persistence_frac, leaves)

    total = float(sum(birth - death for birth, death in leaves))

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
    """Compute merge-tree leaf persistence of a layout (raster and sweep composed)."""
    config = config if config is not None else MergeTreeConfig()
    raster = density_raster(xy, grid_size=config.grid_size, bandwidth_px=config.bandwidth_px)

    return merge_tree_from_density(
        raster,
        floor_frac=config.floor_frac,
        persistence_frac=config.persistence_frac,
    )
