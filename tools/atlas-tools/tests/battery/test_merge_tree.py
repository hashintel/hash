"""Merge-tree unit tests.

The synthetic blobs are truncated gaussians (tails rejected beyond a fixed radius) so the
density support is bounded and the tests are not hostage to tail speckle. Grid, bandwidth, and
persistence parameters are chosen density-appropriately for the small test layouts; the
production defaults (grid 1024, bandwidth 4 px) target the roughly million-point reference
scale and are not exercised here.
"""

from collections.abc import Sequence

import numpy as np
import pytest
from pydantic import ValidationError

from atlas_tools.battery.merge_tree import (
    MergeTreeConfig,
    MergeTreeResult,
    density_raster,
    merge_tree_from_density,
    merge_tree_persistence,
)

MT = MergeTreeConfig(grid_size=64, bandwidth_px=3.0, persistence_frac=0.2)


def truncated_blob(
    center: Sequence[float] | np.ndarray,
    n: int,
    sigma: float,
    seed: int,
    max_r: float = 2.0,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.normal(size=(n, 2))
    noise = noise[np.linalg.norm(noise, axis=1) <= max_r]
    return np.asarray(center, dtype=float) + sigma * noise


def blobs(
    c: int,
    n_per: int = 3000,
    spread: float = 6.0,
    sigma: float = 0.5,
    seed: int = 0,
) -> np.ndarray:
    if c == 1:
        centers = np.zeros((1, 2))
    else:
        angles = 2 * np.pi * np.arange(c) / c
        centers = spread * np.stack([np.cos(angles), np.sin(angles)], axis=1)
    return np.concatenate(
        [truncated_blob(centers[i], n_per, sigma, seed * 101 + i) for i in range(c)]
    )


@pytest.mark.parametrize("c", [1, 3, 5])
def test_c_blobs_yield_exactly_c_leaves(c: int) -> None:
    result = merge_tree_persistence(blobs(c), MT)
    assert result.leaf_count == c


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_blob_count_stable_across_seeds(seed: int) -> None:
    assert merge_tree_persistence(blobs(3, seed=seed), MT).leaf_count == 3


def test_low_persistence_bump_is_merged_but_far_blob_is_detected() -> None:
    main = truncated_blob([0, 0], 3000, 0.5, seed=1)
    base = merge_tree_persistence(main, MT)
    assert base.leaf_count == 1

    # A tiny bump inside the main blob's support: low persistence, so it merges.
    bump = truncated_blob([0.8, 0], 40, 0.05, seed=3)
    with_bump = merge_tree_persistence(np.concatenate([main, bump]), MT)
    assert with_bump.leaf_count == 1

    # Sensitivity counterpart: a genuine far mode does add a leaf.
    far = truncated_blob([6.0, 0], 800, 0.4, seed=4)
    with_far = merge_tree_persistence(np.concatenate([main, far]), MT)
    assert with_far.leaf_count == 2
    assert with_far.normalized_persistence > base.normalized_persistence


def test_persistence_frac_controls_merge_vs_leaf() -> None:
    # Two overlapping blobs whose saddle sits well above the floor.
    main = truncated_blob([0, 0], 3000, 0.5, seed=1)
    near = truncated_blob([1.4, 0], 700, 0.35, seed=2)
    two = np.concatenate([main, near])
    lenient = merge_tree_persistence(
        two, MergeTreeConfig(grid_size=64, bandwidth_px=3.0, persistence_frac=0.05)
    )
    harsh = merge_tree_persistence(
        two, MergeTreeConfig(grid_size=64, bandwidth_px=3.0, persistence_frac=0.95)
    )
    assert lenient.leaf_count == 2
    assert harsh.leaf_count == 1


def test_contraction_does_not_increase_normalized_persistence() -> None:
    """Pin the anti-cheat property.

    Rasterizing over the layout's own extent and normalizing by the density maximum make pure
    contraction persistence-neutral.
    """
    xy = blobs(3)
    original = merge_tree_persistence(xy, MT)
    collapsed = merge_tree_persistence(xy * 0.01, MT)
    assert collapsed.leaf_count == original.leaf_count
    assert collapsed.normalized_persistence <= original.normalized_persistence + 1e-12


def test_determinism() -> None:
    xy = blobs(3)
    a = merge_tree_persistence(xy, MT)
    b = merge_tree_persistence(xy, MT)
    assert a == b
    assert isinstance(a, MergeTreeResult)


def test_exact_two_peak_raster() -> None:
    """Check a hand-crafted raster: two isolated peaks give exact births and deaths."""
    d = np.zeros((16, 16))
    d[4, 4] = 1.0
    d[10, 10] = 0.8
    result = merge_tree_from_density(d, floor_frac=0.005, persistence_frac=0.05)
    assert result.leaf_count == 2
    assert result.density_max == 1.0
    floor = 0.005
    expected = (1.0 - floor) + (0.8 - floor)
    assert result.total_persistence == pytest.approx(expected)
    assert result.normalized_persistence == pytest.approx(expected / 1.0)


def test_saddle_merge_level_and_persistence_filter() -> None:
    """Check a 1-D ridge with two peaks joined at a saddle.

    The younger peak's persistence is measured at the merge level and filtered by
    ``persistence_frac * birth``.
    """
    d = np.array([[0.0, 0.52, 0.45, 0.50, 0.0]])
    # younger peak birth 0.50, merges at 0.45: persistence 0.05 = 0.1 * birth
    counted = merge_tree_from_density(d, floor_frac=0.01, persistence_frac=0.05)
    merged = merge_tree_from_density(d, floor_frac=0.01, persistence_frac=0.2)
    assert counted.leaf_count == 2
    assert merged.leaf_count == 1
    # the recorded leaf carries (birth, death) = (0.50, 0.45)
    assert (0.50, 0.45) in counted.leaves


def test_tiny_and_degenerate_inputs() -> None:
    small_grid = MergeTreeConfig(grid_size=32)
    assert merge_tree_persistence(np.zeros((0, 2)), small_grid).leaf_count == 0
    assert merge_tree_persistence(np.array([[1.0, 1.0]]), small_grid).leaf_count == 1
    assert merge_tree_persistence(np.ones((50, 2)), small_grid).leaf_count == 1


@pytest.mark.parametrize("field", ["floor_frac", "persistence_frac"])
@pytest.mark.parametrize("bad_value", [0.0, -0.1, 1.0000001])
def test_out_of_range_fractions_rejected(field: str, bad_value: float) -> None:
    # floor_frac and persistence_frac are fractions of the density maximum:
    # zero disables the floor/filter entirely and values above 1 select nothing.
    with pytest.raises(ValidationError, match=field):
        MergeTreeConfig.model_validate({field: bad_value})


def test_density_raster_shape_and_mass() -> None:
    xy = blobs(2, n_per=500)
    raster = density_raster(xy, grid_size=32, bandwidth_px=1.0)
    assert raster.shape == (32, 32)
    # blur preserves mass (up to boundary truncation)
    assert raster.sum() == pytest.approx(len(xy), rel=0.05)
    with pytest.raises(ValueError, match=r"\(n, 2\)"):
        density_raster(np.zeros((5, 3)))
