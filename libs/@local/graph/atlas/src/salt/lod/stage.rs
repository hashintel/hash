//! The lod stage, which derives the served columns from canonical coordinates.
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
        WriteAs, WriteInto,
        morton::{
            Fenceposts, SEGMENTS,
            write::{PAGE_STRIDE, write_regions},
        },
    },
    identity::{BasePosition, ImportanceRank, NodeRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::{Bounds2, FinitePointField, Log2, Vec2},
    morton::{Depth, MortonKey},
};

/// The fixed frame every wire coordinate lives in.
///
/// [`Bounds2::normalize_into`] maps the fitted world frame onto this `[-1, 1]` square. The world
/// frame and this constant specify the same map for later point placement.
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
    /// At zoom z, the cumulative cut includes buckets at or below z + m, where m is this span. Each tile contains a 2ᵐ by 2ᵐ cut grid. Before the catch-all, one representative per occupied cut cell bounds both cumulative and incremental delivery by 4ᵐ points per tile. The catch-all includes every remaining point and can exceed that cap.
    ///
    /// By default m = 6, or 64 cells per axis.
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
    /// Returns [`None`] when the sum exceeds the 32 subdivisions a 64-bit Morton key resolves. For
    /// maximum tile zoom zₘₐₓ and span m, a buildable schedule requires zₘₐₓ + m ≤ 32.
    #[must_use]
    pub(crate) const fn deepest(self) -> Option<Depth> {
        let Some(sum) = self.span.get().checked_add(self.max_tile_depth) else {
            return None;
        };

        Depth::new(sum)
    }
}

/// A schedule or input-column condition that prevents LOD construction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum LodError {
    /// The configuration names a schedule no 64-bit key resolves.
    Schedule { config: LodConfig },
    /// The rank columns cover a different row count than the coordinates.
    ///
    /// Columns disagreeing among themselves cannot reach here: [`RankInputs`] admits only
    /// equal-length columns.
    Columns { coordinates: usize },
    /// The coordinates hold no rows to fit a world frame from.
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
                "the coordinates hold no rows, so no world frame exists",
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
    /// C − G, where C is the catch-all population and G counts the deepest-grid cells represented
    /// within that bucket. Lower-bucket occupants of those cells contribute to neither count.
    pub co_location_excess: u64,
    /// The largest single-bucket population within a tile at that bucket's first zoom.
    ///
    /// Each bucket b uses tile depth max(b − m, 0), where m is the configured span. Buckets at or
    /// below m are measured separately, although the root delivers their sum. This statistic can
    /// therefore undercount the root's delivered delta.
    pub max_tile_delta: u64,
}

/// Aligned spatial serving columns and row permutations for one generation.
///
/// Coordinates, Morton codes, and importance ranks follow the [`BaseOrder`] permutation. The
/// fenceposts delimit the same bucket segments in each column. The inverse permutations translate
/// rows, ranks, and base positions without searching.
#[derive(Debug, PartialEq)]
pub(crate) struct Lod {
    /// The world frame the normalization mapped onto the wire frame.
    ///
    /// Together with [`WIRE_FRAME`], this specifies the per-axis normalization for subsequent
    /// point placement.
    pub world: Bounds2,
    /// Wire coordinates in base order: the canonical coordinates normalized into the wire frame.
    pub coordinates: Box<IdSlice<BasePosition, Vec2>>,
    /// Morton codes in base order, segmented by [`Self::fenceposts`].
    pub codes: Box<IdSlice<BasePosition, MortonKey>>,
    /// The bucket segmentation of every base-ordered column.
    pub fenceposts: Fenceposts<BasePosition>,
    /// Each base position's importance rank.
    pub rank_of_position: Box<IdSlice<BasePosition, ImportanceRank>>,
    /// Each rank's base position, for traversing the columns in importance order.
    pub position_of_rank: Box<IdSlice<ImportanceRank, BasePosition>>,
    /// Each row's base position, the inverse of [`Self::row_of_position`].
    pub position_of_row: Box<IdSlice<NodeRowId, BasePosition>>,
    /// Each base position's row.
    ///
    /// The gather order that assembles any further row-aligned column into base order.
    pub row_of_position: Box<IdSlice<BasePosition, NodeRowId>>,
}

impl Lod {
    /// Builds the level-of-detail structure over the canonical coordinates.
    ///
    /// `coordinates` is the canonical column in row order, proven finite by its type. `inputs`
    /// holds the per-row rank columns and `seed` the generation's reproducibility seed.
    ///
    /// The build fits a tight world frame and maps each axis onto `[-1, 1]` with
    /// [`Bounds2::normalize_into`]. For an axis with minimum a and positive extent e, the exact map
    /// is 2 · (x − a) / e − 1. A zero-extent axis maps to zero. The computation uses `f64`
    /// intermediates and a final narrowing to `f32`, giving an absolute coordinate error at most
    /// 2⁻²³ within the fitted frame. The bound is absolute, and near zero it amounts to many ULPs
    /// of the result.
    ///
    /// Morton keys quantize the resulting wire coordinates, keeping the spatial index tied to the
    /// published column. [`Ranking::new`] specifies the byte-encoding and equal-key conditions for
    /// ranking replay.
    ///
    /// # Errors
    ///
    /// Returns a [`LodError`] for an invalid schedule, mismatched coordinate and rank counts, or an
    /// empty coordinate column.
    pub(crate) fn build<I>(
        coordinates: &FinitePointField<NodeRowId>,
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

        // finite input leaves emptiness as the only reason no frame exists
        let world =
            Bounds2::from_slice_par(coordinates.as_slice().as_raw()).ok_or(LodError::Frame)?;
        let normalized = world.normalize_into(WIRE_FRAME, coordinates.as_slice().as_raw());

        let keys = key::keys(&normalized, WIRE_FRAME);
        let wire = IdSlice::<NodeRowId, Vec2>::from_raw(&normalized);
        let keyed = IdSlice::<NodeRowId, MortonKey>::from_raw(&keys);

        let ranking = Ranking::new(inputs, seed);

        let buckets = cascade::buckets(keyed, &ranking, deepest);
        let order = BaseOrder::new(keyed, &buckets, &ranking);

        // row_of_position gathers each row-ordered column into base order. Parallelizing by column
        // keeps each task a sequential gather of copied values. position_of_rank composes
        // rank-to-row with row-to-position to preserve importance traversal.
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
    /// `config` must be the configuration used by [`Self::build`]. A different valid schedule
    /// changes the catch-all and tile-depth choices without detecting the mismatch.
    /// [`LodMeasurements`] defines each statistic, including the separate treatment of the root's
    /// buckets.
    ///
    /// # Complexity
    ///
    /// The scans take O(N + D) time for N points and deepest grid D, using constant additional
    /// storage.
    ///
    /// # Panics
    ///
    /// Panics when `config.deepest()` is [`None`], or when the fenceposts address codes outside the
    /// column.
    #[must_use]
    pub(crate) fn measurements(&self, config: LodConfig) -> LodMeasurements {
        let deepest = config
            .deepest()
            .expect("the structure was built under this configuration");

        // sorted segment codes put each cell's population in one consecutive equal-prefix group
        let catch_all = self.segment_codes(deepest);
        let catch_all_population = catch_all.len() as u64;
        let co_location_excess = catch_all_population - distinct_prefixes(catch_all, deepest);

        // each bucket uses its first tile zoom; the root's buckets are scanned separately
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
    /// Indices in the returned slice are bucket offsets rather than base positions.
    ///
    /// # Panics
    ///
    /// Panics when the fenceposts address codes outside the column.
    fn segment_codes(&self, bucket: Depth) -> &[MortonKey] {
        &self.codes[self.fenceposts.segment(bucket)]
    }
}

/// Borrowed bucket segments and Morton codes for writing a spatial index.
///
/// Writing emits a Morton file with one index key per [`PAGE_STRIDE`] codes.
///
/// # Panics
///
/// Writing panics if the code count differs from the fencepost count or if codes decrease within
/// any bucket segment.
pub(crate) struct MortonColumn<'lod> {
    /// The bucket segmentation of the code column.
    pub fenceposts: &'lod Fenceposts<BasePosition>,
    /// Morton codes in base order, segmented by `fenceposts`.
    pub codes: &'lod [MortonKey],
}

impl WriteAs<crate::file::salt::artifact::Morton> for MortonColumn<'_> {}

impl WriteInto for MortonColumn<'_> {
    type Error = io::Error;

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
