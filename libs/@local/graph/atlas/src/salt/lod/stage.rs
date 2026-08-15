//! The lod stage, which derives the served columns from canonical coordinates.
//!
//! The result is a pure function of the coordinates, the rank inputs, the seed, and the
//! configuration, so equal generations produce byte-equal columns.
//!
//! [`Lod::build`] runs the whole level-of-detail derivation for one generation:
//!
//! 1. Fit the world frame.
//! 2. Normalize the coordinates into the wire frame.
//! 3. Quantize the Morton keys.
//! 4. Rank the rows.
//! 5. Run the cascade.
//! 6. Sort into the base delivery order.
//! 7. Gather every served column into that order.

use std::io;

use hashql_core::id::{IdSlice, IdVec};

use super::{
    cascade, key,
    order::BaseOrder,
    rank::{RankInputs, Ranking},
};
use crate::{
    file::{
        WriteInto,
        morton::{
            Fenceposts, SEGMENTS,
            write::{PAGE_STRIDE, write_regions},
        },
    },
    identity::{BasePosition, ImportanceRank, NodeRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::{Bounds2, Log2, Vec2},
    morton::{Depth, MortonKey},
};

/// The fixed frame every wire coordinate lives in.
///
/// The world frame normalizes onto it at publish, and the online placement path re-derives the
/// identical map from the recorded world frame and this constant.
pub(crate) const WIRE_FRAME: Bounds2 = Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
    .expect("the wire frame corners are finite and ordered");

/// The default [`LodConfig::span`].
const DEFAULT_SPAN: Log2 = Log2::new(6).expect("6 lies below the shift width");

/// Configuration of the level-of-detail schedule.
///
/// Both values are starting points that no measurement has validated. The [`LodMeasurements`] of
/// real generations revise them, and the manifest records the configuration a generation used.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct LodConfig {
    /// Cells per tile axis of the delivery cut, as its base-2 log.
    ///
    /// A tile at zoom `z` delivers buckets at or below `z + span`, sampling a `2^span` by `2^span`
    /// grid per tile. Regular buckets deliver at most `4^span` points per incremental tile, and the
    /// deepest catch-all may exceed that cap by its co-located residue, measured as
    /// [`LodMeasurements::co_location_excess`].
    pub span: Log2 = DEFAULT_SPAN,
    /// The deepest tile zoom the schedule serves.
    ///
    /// The deepest cascade grid sits at `max_tile_depth + span`, which the configured defaults put
    /// at depth 24 - the resolution where `f32` coordinates in the wire frame stop separating
    /// points.
    pub max_tile_depth: u8 = 18,
}

const impl Default for LodConfig {
    fn default() -> Self {
        Self { .. }
    }
}

impl LodConfig {
    /// Returns the deepest cascade grid.
    ///
    /// `max_tile_depth + span`, the catch-all bucket of the cut schedule.
    ///
    /// Returns [`None`] when the sum exceeds the 32 subdivisions a 64-bit Morton key resolves - the
    /// key-width inequality `z_max + m ≤ 32` - in which case the configuration matches no
    /// buildable schedule.
    #[must_use]
    pub(crate) const fn deepest(self) -> Option<Depth> {
        let Some(sum) = self.span.get().checked_add(self.max_tile_depth) else {
            return None;
        };

        Depth::new(sum)
    }
}

/// Building the lod structure failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum LodError {
    /// The configuration names a schedule no 64-bit key resolves.
    Schedule { config: LodConfig },
    /// The rank columns cover a different row count than the coordinates.
    ///
    /// Columns disagreeing among themselves cannot reach here: [`RankInputs`] admits only
    /// equal-length columns.
    Columns { coordinates: usize },
    /// The coordinates hold a non-finite value or no rows, so no world frame exists.
    Frame,
}

impl core::fmt::Display for LodError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Schedule { config } => write!(
                fmt,
                "the schedule needs {} + {} subdivisions where a 64-bit Morton key resolves {}",
                config.max_tile_depth,
                config.span.get(),
                Depth::MAX.get(),
            ),
            Self::Columns { coordinates } => write!(
                fmt,
                "the rank columns must hold one row per coordinate ({coordinates})",
            ),
            Self::Frame => write!(
                fmt,
                "the coordinates hold a non-finite value or no rows, so no world frame exists",
            ),
        }
    }
}

impl core::error::Error for LodError {}

/// The measurements of one lod build.
///
/// What the manifest records so that data rather than taste drives a revision of the configuration.
/// These are build census numbers rather than evidence, and the metadata's `Evidence` section holds
/// the admission checks.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LodMeasurements {
    /// The world frame the normalization mapped onto the wire frame.
    pub world: Bounds2,
    /// Points per bucket.
    ///
    /// The tail calibrates `max_tile_depth`.
    pub bucket_histogram: [u64; SEGMENTS],
    /// Points in the deepest bucket.
    ///
    /// The co-located residue plus the deepest grid's regular claims.
    pub catch_all_population: u64,
    /// Catch-all points beyond one per distinct deepest-grid cell.
    ///
    /// The population no cut depth can thin.
    pub co_location_excess: u64,
    /// The largest own-bucket delta any tile of the schedule delivers.
    ///
    /// Verified against the geometric cap `4^span`; co-location can exceed the cap only in
    /// the catch-all bucket.
    pub max_tile_delta: u64,
}

/// The level-of-detail structure of one generation, every column in base delivery order.
///
/// The serving artifacts are the wire coordinate column, the Morton code column with its bucket
/// fenceposts, the rank column, and the row permutations. [`measurements`](Self::measurements)
/// reads the finished columns and yields the numbers that belong in the generation's metadata
/// document.
#[derive(Debug, PartialEq)]
pub(crate) struct Lod {
    /// The world frame the normalization mapped onto the wire frame.
    ///
    /// Together with the fixed `[-1, 1]` wire frame this is the frame transform: the manifest
    /// records it, clients and the placement path re-derive the identical map from it.
    pub world: Bounds2,
    /// Wire coordinates in base order: the canonical coordinates normalized into the wire frame.
    ///
    /// This column is the wire.
    pub coordinates: Box<IdSlice<BasePosition, Vec2>>,
    /// Morton codes in base order, segmented by [`Self::fenceposts`].
    pub codes: Box<IdSlice<BasePosition, MortonKey>>,
    /// The bucket segmentation of every base-ordered column.
    pub fenceposts: Fenceposts<BasePosition>,
    /// Each base position's importance rank.
    pub rank_of_position: Box<IdSlice<BasePosition, ImportanceRank>>,
    /// Each rank's base position: the traversal order of filter registration.
    pub position_of_rank: Box<IdSlice<ImportanceRank, BasePosition>>,
    /// Each row's base position: the permutation the filter contract maps entity bitmaps through.
    pub position_of_row: Box<IdSlice<NodeRowId, BasePosition>>,
    /// Each base position's row.
    ///
    /// The gather order that assembles any further row-aligned column into base order.
    pub row_of_position: Box<IdSlice<BasePosition, NodeRowId>>,
}

impl Lod {
    /// Builds the level-of-detail structure over the canonical coordinates.
    ///
    /// `coordinates` is the canonical `f32[N, 2]` column in row order. `inputs` holds the per-row
    /// rank columns and `seed` the generation's reproducibility seed.
    ///
    /// The build fits the world frame from the coordinates and normalizes each axis onto `[-1, 1]`
    /// in `f64` with one final rounding, so the wire column is within `2^-23` of exact everywhere
    /// and reproducible across targets. Keys quantize the normalized column, not the input, so wire
    /// coordinates and tile cells can never disagree.
    ///
    /// # Errors
    ///
    /// Returns [`LodError::Schedule`] when the configuration exceeds the key width,
    /// [`LodError::Columns`] when the rank columns disagree with the coordinates, and
    /// [`LodError::Frame`] when the coordinates admit no world frame (no rows, or a non-finite
    /// value).
    pub(crate) fn build<I>(
        coordinates: &[Vec2],
        inputs: RankInputs<'_, I>,
        seed: u64,
        config: LodConfig,
    ) -> Result<Self, LodError>
    where
        I: Copy + zerocopy::IntoBytes + zerocopy::Immutable + Sync,
    {
        let deepest = config.deepest().ok_or(LodError::Schedule { config })?;
        if inputs.len() as usize != coordinates.len() {
            return Err(LodError::Columns {
                coordinates: coordinates.len(),
            });
        }

        let world = Bounds2::from_slice_par(coordinates).ok_or(LodError::Frame)?;
        let normalized = world.normalize_into(WIRE_FRAME, coordinates);

        let keys = key::keys(&normalized, WIRE_FRAME);
        let wire = IdSlice::<NodeRowId, Vec2>::from_raw(&normalized);
        let keyed = IdSlice::<NodeRowId, MortonKey>::from_raw(&keys);

        let ranking = Ranking::new(inputs, seed);

        let buckets = cascade::buckets(keyed, &ranking, deepest);
        let order = BaseOrder::new(keyed, &buckets, &ranking);

        // row_of_position is the gather order. Walking it assembles any row-ordered column into
        // base delivery order. Each gather is an index swizzle whose element work is one copy, so
        // parallelism pays per column, not per element. position_of_rank composes the permutations
        // by taking a rank's row and then that row's base position.
        let mut coordinates = IdVec::<BasePosition, Vec2>::new();
        let mut codes = IdVec::<BasePosition, MortonKey>::new();

        let mut rank_of_position = IdVec::<BasePosition, ImportanceRank>::new();
        let mut position_of_rank = IdVec::<ImportanceRank, BasePosition>::new();

        rayon::scope(|scope| {
            scope.spawn(|_scope| {
                coordinates = order.row_of_position.iter().map(|&row| wire[row]).collect();
            });

            scope.spawn(|_scope| {
                codes = order
                    .row_of_position
                    .iter()
                    .map(|&row| keyed[row])
                    .collect();
            });

            scope.spawn(|_scope| {
                rank_of_position = order
                    .row_of_position
                    .iter()
                    .map(|&row| ranking.rank_of_row[row])
                    .collect();
            });

            scope.spawn(|_scope| {
                position_of_rank = ranking
                    .row_of_rank
                    .iter()
                    .map(|&row| order.position_of_row[row])
                    .collect();
            });
        });

        let mut lengths = [0_u64; SEGMENTS];
        for &bucket in buckets.iter() {
            lengths[bucket.get() as usize] += 1;
        }
        let fenceposts =
            Fenceposts::from_lengths(&lengths).expect("row counts fit u32, far inside u64");

        Ok(Self {
            world,
            coordinates: coordinates.into_boxed_slice(),
            codes: codes.into_boxed_slice(),
            fenceposts,
            rank_of_position: rank_of_position.into_boxed_slice(),
            position_of_rank: position_of_rank.into_boxed_slice(),
            position_of_row: order.position_of_row,
            row_of_position: order.row_of_position,
        })
    }

    /// Measures the finished columns for the generation metadata.
    ///
    /// The manifest records the bucket histogram (whose tail calibrates `max_tile_depth`), the
    /// catch-all population and its co-location excess, and the observed per-tile own-bucket
    /// maximum against the geometric cap.
    ///
    /// # Panics
    ///
    /// This panics when `config` is not the configuration the structure ran under, which shows up
    /// as an unbuildable schedule.
    #[must_use]
    pub(crate) fn measurements(&self, config: LodConfig) -> LodMeasurements {
        let deepest = config
            .deepest()
            .expect("the structure was built under this configuration");

        // Codes sort within every segment, so cell populations are consecutive equal-prefix groups.
        // One linear scan per measurement suffices.
        let catch_all = self.segment_codes(deepest);
        let catch_all_population = catch_all.len() as u64;
        let co_location_excess = catch_all_population - distinct_prefixes(catch_all, deepest);

        // Per bucket, the largest number of its points sharing one
        // tile of the bucket's own zoom; the tile grid sits span
        // above the bucket's grid, and buckets at or below span
        // belong to the zoom-0 root tile.
        let mut max_tile_delta = 0;
        for bucket in 0..=deepest.get() {
            let tile = Depth::new(bucket.saturating_sub(config.span.get()))
                .expect("a tile depth never exceeds its bucket's own depth");
            let bucket = Depth::new(bucket).expect("buckets never exceed the deepest grid");
            let delta = largest_prefix_group(self.segment_codes(bucket), tile);
            max_tile_delta = max_tile_delta.max(delta);
        }

        LodMeasurements {
            world: self.world,
            bucket_histogram: self.fenceposts.lengths().map(u64::from),
            catch_all_population,
            co_location_excess,
            max_tile_delta,
        }
    }

    /// Borrows one bucket's slice of the code column.
    ///
    /// The returned slice re-bases at the segment, so its indices are bucket offsets rather than
    /// base positions. The helpers scanning it consume values alone.
    fn segment_codes(&self, bucket: Depth) -> &[MortonKey] {
        &self.codes[self.fenceposts.segment(bucket)]
    }
}

/// The morton artifact of a built lod: the index, fencepost, and code regions.
///
/// Borrows the finished columns; writing streams them as one morton file under the production
/// page-filling index stride.
pub(crate) struct MortonColumn<'lod> {
    /// The bucket segmentation of the code column.
    pub fenceposts: &'lod Fenceposts<BasePosition>,
    /// Morton codes in base order, segmented by `fenceposts`.
    pub codes: &'lod [MortonKey],
}

impl WriteInto for MortonColumn<'_> {
    type Error = io::Error;

    /// Writes the columns as a morton file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_regions(PAGE_STRIDE, self.fenceposts, self.codes, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

/// Counts the distinct depth-`depth` prefixes of a segment-sorted code slice.
fn distinct_prefixes(codes: &[MortonKey], depth: Depth) -> u64 {
    let mut distinct = 0;
    let mut previous = None;
    for code in codes {
        let prefix = code.prefix(depth);
        if previous != Some(prefix) {
            distinct += 1;
            previous = Some(prefix);
        }
    }

    distinct
}

/// Returns the size of the largest group of equal depth-`depth` prefixes.
///
/// Measured over a segment-sorted code slice.
fn largest_prefix_group(codes: &[MortonKey], depth: Depth) -> u64 {
    let mut largest = 0;
    let mut current = 0;
    let mut previous = None;
    for code in codes {
        let prefix = code.prefix(depth);
        if previous == Some(prefix) {
            current += 1;
        } else {
            current = 1;
            previous = Some(prefix);
        }

        largest = largest.max(current);
    }

    largest
}
