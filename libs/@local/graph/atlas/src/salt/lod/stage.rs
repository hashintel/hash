//! The lod stage: from canonical coordinates to the served columns.
//!
//! [`Lod::build`] runs the whole level-of-detail derivation for one generation: fit the world
//! frame, normalize the coordinates into the wire frame, quantize Morton keys, rank, cascade, sort
//! into the base delivery order, and gather every served column into that order. The result is a
//! pure function of the coordinates, the rank inputs, the seed, and the configuration, so equal
//! generations produce byte-equal columns.

use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use super::{
    cascade, key,
    order::BaseOrder,
    rank::{RankInputs, Ranking},
};
use crate::{
    file::morton::Fenceposts,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonKey},
};

const WIRE_FRAME: Bounds2 = Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
    .expect("the wire frame corners are finite and ordered");

/// Configuration of the level-of-detail schedule.
///
/// Both values are unvalidated starting points, revised against the [`LodEvidence`] of real
/// generations; the manifest records what a generation was built with.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct LodConfig {
    /// Cells per tile axis of the delivery cut, as its base-2 log.
    ///
    /// A tile at zoom `z` delivers buckets at or below `z + span_log2`. Defaults to 6 (a 64x64
    /// sample grid, at most 4096 points per incremental tile).
    pub span_log2: u8 = 6,
    /// The deepest tile zoom the schedule serves.
    ///
    /// Defaults to 18, which with the default span puts the deepest cascade grid at depth 24 - the
    /// resolution where `f32` coordinates in the wire frame stop separating points.
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
    /// `max_tile_depth + span_log2`, the catch-all bucket of the cut schedule.
    ///
    /// Returns [`None`] when the sum exceeds the 32 subdivisions a 64-bit Morton key resolves - the
    /// key-width inequality `z_max + m <= 32` - in which case the configuration matches no
    /// buildable schedule.
    #[must_use]
    pub(crate) const fn deepest(self) -> Option<Depth> {
        let Some(sum) = self.span_log2.checked_add(self.max_tile_depth) else {
            return None;
        };
        Depth::new(sum)
    }
}

/// Building the lod structure failed.
#[derive(Debug, Copy, Clone, PartialEq)]
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
                config.span_log2,
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

/// The level-of-detail structure of one generation, every column in base delivery order.
///
/// This is the writable form of the serving artifacts: the wire coordinate column, the Morton code
/// column with its bucket fenceposts, the rank column, and the row permutations. The
/// [`evidence`](Self::evidence) is measured from the finished columns and belongs in the
/// generation's metadata document.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Lod {
    /// The world frame the coordinates were normalized from.
    ///
    /// Together with the fixed `[-1, 1]` wire frame this is the frame transform: the manifest
    /// records it, clients and the placement path re-derive the identical map from it.
    pub world: Bounds2,
    /// Wire coordinates in base order: the canonical coordinates normalized into the wire frame.
    ///
    /// This column is the wire.
    pub coordinates: Box<[Vec2]>,
    /// Morton codes in base order, segmented by [`Self::fenceposts`].
    pub codes: Box<[MortonKey]>,
    /// The bucket segmentation of every base-ordered column.
    pub fenceposts: Fenceposts,
    /// Each base position's importance rank.
    pub rank_of_position: Box<[u32]>,
    /// Each rank's base position: the traversal order of filter registration.
    pub position_of_rank: Box<[u32]>,
    /// Each row's base position: the permutation the filter contract maps entity bitmaps through.
    pub position_of_row: Box<[u32]>,
    /// Each base position's row.
    ///
    /// The gather order that assembles any further row-aligned column into base order.
    pub row_of_position: Box<[u32]>,
}

impl Lod {
    /// Builds the level-of-detail structure over the canonical coordinates.
    ///
    /// `coordinates` is the canonical `f32[N, 2]` column in row order; `inputs` the per-row rank
    /// columns; `seed` the generation's reproducibility seed. The world frame is fitted from the
    /// coordinates and each axis normalized onto `[-1, 1]` in `f64` with one final rounding, so the
    /// wire column is within `2^-23` of exact everywhere and reproducible across targets. Keys
    /// quantize the normalized column, not the input, so wire coordinates and tile cells can never
    /// disagree.
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
        let wire = world.normalize_into(WIRE_FRAME, coordinates);

        let keys = key::keys(&wire, WIRE_FRAME);
        let ranking = Ranking::new(inputs, seed);
        let buckets = cascade::buckets(&keys, &ranking, deepest);
        let order = BaseOrder::new(&keys, &buckets, &ranking);

        // row_of_position is the gather order: walking it assembles any
        // row-ordered column into base delivery order.
        let coordinates: Vec<Vec2> = order
            .row_of_position
            .par_iter()
            .map(|&row| wire[row as usize])
            .collect();
        let codes: Vec<MortonKey> = order
            .row_of_position
            .par_iter()
            .map(|&row| keys[row as usize])
            .collect();
        let rank_of_position: Vec<u32> = order
            .row_of_position
            .par_iter()
            .map(|&row| ranking.rank_of_row[row as usize])
            .collect();

        // position_of_rank composes the permutations: a rank's row,
        // then that row's base position.
        let position_of_rank: Vec<u32> = ranking
            .row_of_rank
            .par_iter()
            .map(|&row| order.position_of_row[row as usize])
            .collect();

        let mut lengths = [0_u64; Fenceposts::SEGMENTS];
        for &bucket in &buckets {
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

    /// Measures the publish evidence over the finished columns.
    ///
    /// The measurements the manifest records: the bucket histogram (whose tail calibrates
    /// `max_tile_depth`), the catch-all population and its co-location excess, and the observed
    /// per-tile own-bucket maximum against the geometric cap.
    ///
    /// # Panics
    ///
    /// Panics when `config` is not the configuration the structure was built under, detected
    /// through its unbuildable schedule.
    #[must_use]
    pub(crate) fn evidence(&self, config: LodConfig) -> LodEvidence {
        let deepest = config
            .deepest()
            .expect("the structure was built under this configuration");

        // Codes sort within every segment, so cell populations are
        // consecutive equal-prefix groups: one linear scan per
        // measurement, no hashing.
        let catch_all = self.segment_codes(deepest);
        let catch_all_population = catch_all.len() as u64;
        let co_location_excess = catch_all_population - distinct_prefixes(catch_all, deepest);

        // Per bucket, the largest number of its points sharing one
        // tile of the bucket's own zoom; the tile grid sits span_log2
        // above the bucket's grid, and buckets at or below span_log2
        // belong to the zoom-0 root tile.
        let mut max_tile_delta = 0;
        for bucket in 0..=deepest.get() {
            let tile = Depth::new(bucket.saturating_sub(config.span_log2))
                .expect("a tile depth never exceeds its bucket's own depth");
            let bucket = Depth::new(bucket).expect("buckets never exceed the deepest grid");
            let delta = largest_prefix_group(self.segment_codes(bucket), tile);
            max_tile_delta = max_tile_delta.max(delta);
        }

        LodEvidence {
            world: self.world,
            bucket_histogram: self.fenceposts.lengths(),
            catch_all_population,
            co_location_excess,
            max_tile_delta,
        }
    }

    /// Borrows one bucket's slice of the code column.
    fn segment_codes(&self, bucket: Depth) -> &[MortonKey] {
        let segment = self.fenceposts.segment(bucket);
        &self.codes[usize::try_from(segment.start).expect("resident columns fit the address space")
            ..usize::try_from(segment.end).expect("resident columns fit the address space")]
    }
}

/// The publish evidence of one lod build.
///
/// Measurements the manifest records so the configuration is revised from data, not taste.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LodEvidence {
    /// The world frame the wire coordinates were normalized from.
    pub world: Bounds2,
    /// Points per bucket; the tail calibrates `max_tile_depth`.
    pub bucket_histogram: [u64; Fenceposts::SEGMENTS],
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
    /// Verified against the geometric cap `4^span_log2`; co-location can exceed the cap only in
    /// the catch-all bucket.
    pub max_tile_delta: u64,
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
