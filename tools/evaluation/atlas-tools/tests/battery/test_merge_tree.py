"""Merge-tree unit tests (W3.2.1).

The synthetic blobs are truncated gaussians (tails rejected beyond a fixed
radius) so the density support is bounded and the tests are not hostage to
tail speckle; grid/bandwidth/persistence parameters are chosen
density-appropriately for the small test layouts (the PRD defaults target
the ~1M-point reference scale and stay the production defaults).
"""

import numpy as np
import pytest
from atlas_tools.battery.merge_tree import (
    MergeTreeResult,
    density_raster,
    merge_tree_from_density,
    merge_tree_persistence,
)

MT = {"grid_size": 64, "bandwidth_px": 3.0, "persistence_frac": 0.2}


def truncated_blob(center, n, sigma, seed, max_r=2.0):
    rng = np.random.default_rng(seed)
    noise = rng.normal(size=(n, 2))
    noise = noise[np.linalg.norm(noise, axis=1) <= max_r]
    return np.asarray(center, dtype=float) + sigma * noise


def blobs(c, n_per=3000, spread=6.0, sigma=0.5, seed=0):
    if c == 1:
        centers = np.zeros((1, 2))
    else:
        angles = 2 * np.pi * np.arange(c) / c
        centers = spread * np.stack([np.cos(angles), np.sin(angles)], axis=1)
    return np.concatenate(
        [truncated_blob(centers[i], n_per, sigma, seed * 101 + i) for i in range(c)]
    )


@pytest.mark.parametrize("c", [1, 3, 5])
def test_c_blobs_yield_exactly_c_leaves(c):
    result = merge_tree_persistence(blobs(c), **MT)
    assert result.leaf_count == c


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_blob_count_stable_across_seeds(seed):
    assert merge_tree_persistence(blobs(3, seed=seed), **MT).leaf_count == 3


def test_low_persistence_bump_is_merged_but_far_blob_is_detected():
    main = truncated_blob([0, 0], 3000, 0.5, seed=1)
    base = merge_tree_persistence(main, **MT)
    assert base.leaf_count == 1

    # A tiny bump inside the main blob's support: low persistence -> merged.
    bump = truncated_blob([0.8, 0], 40, 0.05, seed=3)
    with_bump = merge_tree_persistence(np.concatenate([main, bump]), **MT)
    assert with_bump.leaf_count == 1

    # Sensitivity counterpart: a genuine far mode DOES add a leaf.
    far = truncated_blob([6.0, 0], 800, 0.4, seed=4)
    with_far = merge_tree_persistence(np.concatenate([main, far]), **MT)
    assert with_far.leaf_count == 2
    assert with_far.normalized_persistence > base.normalized_persistence


def test_persistence_frac_controls_merge_vs_leaf():
    # Two overlapping blobs whose saddle sits well above the floor.
    main = truncated_blob([0, 0], 3000, 0.5, seed=1)
    near = truncated_blob([1.4, 0], 700, 0.35, seed=2)
    two = np.concatenate([main, near])
    lenient = merge_tree_persistence(
        two, grid_size=64, bandwidth_px=3.0, persistence_frac=0.05
    )
    harsh = merge_tree_persistence(
        two, grid_size=64, bandwidth_px=3.0, persistence_frac=0.95
    )
    assert lenient.leaf_count == 2
    assert harsh.leaf_count == 1


def test_contraction_does_not_increase_normalized_persistence():
    """The anti-cheat property: raster over the layout's own extent +
    normalization by the density max make pure contraction persistence-
    neutral."""
    xy = blobs(3)
    original = merge_tree_persistence(xy, **MT)
    collapsed = merge_tree_persistence(xy * 0.01, **MT)
    assert collapsed.leaf_count == original.leaf_count
    assert collapsed.normalized_persistence <= original.normalized_persistence + 1e-12


def test_determinism():
    xy = blobs(3)
    a = merge_tree_persistence(xy, **MT)
    b = merge_tree_persistence(xy, **MT)
    assert a == b
    assert isinstance(a, MergeTreeResult)


def test_exact_two_peak_raster():
    """Hand-crafted raster: two isolated peaks -> exact births and deaths."""
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


def test_saddle_merge_level_and_persistence_filter():
    """A 1-D ridge with two peaks joined at a saddle: the younger peak's
    persistence is measured at the merge level and filtered by
    persistence_frac * birth."""
    d = np.array([[0.0, 0.52, 0.45, 0.50, 0.0]])
    # younger peak birth 0.50, merges at 0.45: persistence 0.05 = 0.1*birth
    counted = merge_tree_from_density(d, floor_frac=0.01, persistence_frac=0.05)
    merged = merge_tree_from_density(d, floor_frac=0.01, persistence_frac=0.2)
    assert counted.leaf_count == 2
    assert merged.leaf_count == 1
    # the recorded leaf carries (birth, death) = (0.50, 0.45)
    assert (0.50, 0.45) in counted.leaves


def test_tiny_and_degenerate_inputs():
    assert merge_tree_persistence(np.zeros((0, 2)), grid_size=32).leaf_count == 0
    assert merge_tree_persistence(np.array([[1.0, 1.0]]), grid_size=32).leaf_count == 1
    assert merge_tree_persistence(np.ones((50, 2)), grid_size=32).leaf_count == 1


def test_density_raster_shape_and_mass():
    xy = blobs(2, n_per=500)
    raster = density_raster(xy, grid_size=32, bandwidth_px=1.0)
    assert raster.shape == (32, 32)
    # blur preserves mass (up to boundary truncation)
    assert raster.sum() == pytest.approx(len(xy), rel=0.05)
    with pytest.raises(ValueError, match=r"\(n, 2\)"):
        density_raster(np.zeros((5, 3)))
