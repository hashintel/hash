//! The served tile grid.
//!
//! The bucket schedule and its addressing.
//!
//! One generation serves a quadtree of tiles whose delivery follows the recorded bucket schedule. A
//! tile at zoom `z` delivers the Morton buckets at or below the cut `z + span`, and the deepest
//! zoom's cut is the catch-all bucket holding every remaining point. [`Grid`] is that schedule
//! validated against the key width (`max_tile_depth + span ≤ 32`, the subdivisions a 64-bit Morton
//! key resolves), so every depth the serve paths derive from it exists by construction.
//!
//! Addressing lives beside the schedule: [`cell_of`] maps a request's tile coordinate onto the
//! Morton grid, and [`tile_of`] inverts a point's key back to the tile owning it at a zoom.

use super::error::OpenAtlasError;
use crate::{
    morton::{Depth, MortonCell, MortonKey},
    salt::{lod::stage::LodConfig, wire::tile::TileCoordinate},
};

/// The Morton key's coordinate width: each axis index carries 32 subdivision bits.
const AXIS_BITS: u8 = 32;

/// One generation's validated bucket schedule.
///
/// Construction proves `max_tile_depth + span` within the key width, so the cut of every served
/// zoom and every bucket at or below the deepest grid wrap into [`Depth`] without a failure path.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct Grid {
    /// Cells per tile axis of the delivery cut, as its base-2 log.
    span: u8,
    /// The deepest tile zoom the schedule serves.
    max_tile_depth: u8,
}

impl Grid {
    /// Validates the recorded schedule against the Morton key width.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Schedule`] when `max_tile_depth + span` exceeds the 32
    /// subdivisions a 64-bit Morton key resolves, in which case no tile grid exists to serve.
    pub(super) const fn new(config: LodConfig) -> Result<Self, OpenAtlasError> {
        if config.deepest().is_none() {
            return Err(OpenAtlasError::Schedule {
                span_log2: config.span.get(),
                max_tile_depth: config.max_tile_depth,
            });
        }

        Ok(Self {
            span: config.span.get(),
            max_tile_depth: config.max_tile_depth,
        })
    }

    /// Returns the deepest tile zoom the schedule serves.
    pub(super) const fn max_tile_depth(self) -> u8 {
        self.max_tile_depth
    }

    /// Returns the cells-per-tile-axis exponent of the delivery cut.
    pub(super) const fn span_log2(self) -> u8 {
        self.span
    }

    /// Returns the delivery cut of zoom `z`: buckets at or below it form the zoom's cumulative
    /// schedule.
    ///
    /// # Panics
    ///
    /// This panics beyond the served grid. A zoom above [`max_tile_depth`](Self::max_tile_depth) is
    /// a caller defect rather than request data, and request validation rejects it first.
    pub(super) const fn cut(self, z: u8) -> Depth {
        assert!(
            z <= self.max_tile_depth,
            "the grid serves zooms 0..=max_tile_depth",
        );
        Depth::new(z + self.span).expect("construction validated the schedule's deepest cut")
    }

    /// Returns the deepest served bucket: the deepest zoom's cut, the catch-all.
    ///
    /// The fit clamps every natural bucket into it, so no corpus row and no delivered arrival
    /// sits beyond it.
    pub(super) const fn deepest(self) -> Depth {
        self.cut(self.max_tile_depth)
    }

    /// Iterates the cumulative schedule of zoom `z`: every bucket at or below its cut.
    ///
    /// # Panics
    ///
    /// As [`cut`](Self::cut).
    pub(super) fn cut_buckets(self, z: u8) -> impl Iterator<Item = Depth> {
        let cut = self.cut(z);
        (0..=cut.get()).map(|bucket| Depth::new(bucket).expect("bounded by the validated cut"))
    }

    /// Iterates the delta schedule of zoom `z`: the buckets the zoom newly delivers.
    ///
    /// The root delivers its whole cut range. Every deeper zoom delivers exactly its cut.
    ///
    /// # Panics
    ///
    /// As [`cut`](Self::cut).
    pub(super) fn level_buckets(self, z: u8) -> impl Iterator<Item = Depth> {
        let cut = self.cut(z);
        let first = if z == 0 { 0 } else { cut.get() };
        (first..=cut.get()).map(|bucket| Depth::new(bucket).expect("bounded by the validated cut"))
    }

    /// Returns the first zoom whose cumulative schedule delivers bucket `bucket`.
    ///
    /// Bucket `b` first enters the schedule at zoom `b - span`, clamped to the root for the buckets
    /// the root itself spans.
    pub(super) const fn first_zoom(self, bucket: Depth) -> u8 {
        bucket.get().saturating_sub(self.span)
    }
}

/// Returns the Morton cell a tile coordinate addresses.
///
/// [`None`] outside the zoom's `2^z` grid or beyond the key width.
pub(super) const fn cell_of(coordinate: TileCoordinate) -> Option<MortonCell> {
    let Some(depth) = Depth::new(coordinate.z) else {
        return None;
    };

    MortonCell::new(depth, coordinate.x, coordinate.y)
}

/// Returns the tile owning a Morton key at zoom `zoom`.
///
/// The key's axis indices truncate to the zoom's grid. Zoom 0 is the root tile whole.
///
/// # Panics
///
/// This panics beyond the key width, which the schedule's zooms rule out.
pub(super) const fn tile_of(key: MortonKey, zoom: u8) -> TileCoordinate {
    assert!(zoom <= AXIS_BITS, "zooms lie within the key width");
    if zoom == 0 {
        return TileCoordinate { z: 0, x: 0, y: 0 };
    }

    let [x, y] = key.coordinates();
    TileCoordinate {
        z: zoom,
        x: x >> (AXIS_BITS - zoom),
        y: y >> (AXIS_BITS - zoom),
    }
}
