//! Measurement seam for the restricted-view backfill walk.
//!
//! A masked tile delivery fills its budget by pulling visible points up from deeper importance
//! buckets. Two candidate-selection strategies produce the same response shape and differ only in
//! how they treat points an ancestor tile already pulled up:
//!
//! - [`WalkBench::independent`] walks the tile's extent in isolation and fills to its budget;
//!   re-deliveries across the zoom ladder are the client's to skip.
//! - [`WalkBench::chained`] first re-derives every ancestor's delivery over the same predicate and
//!   starts its own fill where the chain left off, so no point crosses the wire twice.
//!
//! The delivery model both variants share: the base column is bucket-major (the cascade's
//! coarse-to-fine assignment), a tile at zoom `z` with span exponent `m` schedules bucket `z + m`
//! within its extent (the root schedules buckets `0..=m` whole), and the budget is the scheduled
//! count before masking. A masked walk delivers the scheduled points the predicate admits, then
//! fills the shortfall from buckets below the cut - in bucket order, morton order within a bucket -
//! until the budget is met or the extent is exhausted.
//!
//! [`WalkBench::build`] synthesizes a clustered corpus and runs the production cascade over it;
//! [`WalkBench::mask_uniform`] hides rows independently and [`WalkBench::mask_clustered`] hides
//! whole spatial blocks, the adversarial shape for walk lengths. Selections return plain counts;
//! wall time belongs to the bench target. Nothing here is API for consumers of the crate.

use core::{f64::consts::TAU, num::NonZero, ops::Range};

use super::{
    rank::RankInputs,
    stage::{Lod, LodConfig},
};
use crate::{
    bitset::BitSet,
    file::morton::Fenceposts,
    math::Vec2,
    morton::{Depth, MortonCell, MortonKey},
    random::{keyed_rng, uniform_below},
};

/// One range per bucket: the extent's positions inside each bucket segment.
type Ranges = [Range<usize>; Fenceposts::SEGMENTS];

/// One tile delivery's outcome, as plain counts.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Selection {
    /// The scheduled count before masking: the fill target.
    pub budget: usize,
    /// Scheduled points the predicate admitted.
    pub natural: usize,
    /// Points pulled up from deeper buckets to cover the shortfall.
    pub tail: usize,
    /// Candidate positions examined, hidden and taken ones included.
    ///
    /// [`WalkBench::chained`] sums the whole ancestor chain's scans into this count.
    pub scanned: usize,
}

/// A re-delivery census for the independent variant at one tile.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Crowding {
    /// Points the tile delivers when walked in isolation.
    pub delivered: usize,
    /// The subset an ancestor's fill already delivered: arrivals a client skips.
    pub duplicates: usize,
}

/// A synthetic corpus with its cascade output, a visibility mask, and the walk variants.
#[derive(Debug)]
pub struct WalkBench {
    /// Morton codes in base order, bucket-segmented.
    codes: Box<[MortonKey]>,
    /// Each base position's row: the mask's index domain.
    row_of_position: Box<[u32]>,
    /// Every bucket's full segment in the base order.
    segments: Ranges,
    /// The cut's span exponent `m`.
    span: u8,
    /// The deepest tile zoom the schedule serves.
    max_zoom: u8,
    /// Bit `r` set means row `r` is visible.
    visible: BitSet,
}

impl WalkBench {
    /// Builds the corpus and runs the production cascade over it.
    ///
    /// The corpus is eight gaussian clusters over a uniform background, so dense cells stay
    /// populated down to the deepest zooms and descent paths are real. Equal `(points, seed)`
    /// pairs build identical fixtures. The mask starts all-visible.
    ///
    /// # Panics
    ///
    /// Panics when `points` is zero or exceeds the `u32` row domain.
    #[must_use]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "coordinates land in [-1, 1] and importances in [0, 1); f32 keeps the shape"
    )]
    pub fn build(points: usize, seed: u64) -> Self {
        /// Per-cluster gaussian spread, widening with the cluster index.
        const SIGMAS: [f64; 8] = [0.02, 0.035, 0.05, 0.065, 0.08, 0.095, 0.11, 0.125];

        let mut rng = keyed_rng(seed, 0xBAC0_F111, 0);

        let mut centers = [[0.0_f64; 2]; 8];
        for center in &mut centers {
            *center = [
                uniform(&mut rng) * 1.5 - 0.75,
                uniform(&mut rng) * 1.5 - 0.75,
            ];
        }

        let mut coordinates = Vec::with_capacity(points);
        for _ in 0..points {
            let pick = usize::try_from(uniform_below(
                &mut rng,
                NonZero::new(10).expect("ten is nonzero"),
            ))
            .expect("draws below ten fit usize");
            let point = if pick < 8 {
                let (unit, angle) = (uniform(&mut rng), uniform(&mut rng));
                let radius = SIGMAS[pick] * (-2.0 * unit.max(f64::MIN_POSITIVE).ln()).sqrt();
                let [x, y] = centers[pick];
                Vec2::new(
                    (x + radius * (TAU * angle).cos()) as f32,
                    (y + radius * (TAU * angle).sin()) as f32,
                )
            } else {
                Vec2::new(
                    (uniform(&mut rng) * 2.0 - 1.0) as f32,
                    (uniform(&mut rng) * 2.0 - 1.0) as f32,
                )
            };
            coordinates.push(point);
        }

        let importance: Vec<f32> = core::iter::repeat_with(|| uniform(&mut rng) as f32)
            .take(points)
            .collect();
        let priority = vec![0.0_f32; points];
        let identities: Vec<u64> = (0..points as u64).collect();

        let config = LodConfig::default();
        let lod = Lod::build(
            &coordinates,
            RankInputs::new(&importance, &priority, &identities)
                .expect("the synthetic columns are equal-length and fit the row domain"),
            seed,
            config,
        )
        .expect("finite synthetic coordinates admit a world frame");

        let mut visible = BitSet::new(points);
        for row in 0..points {
            visible.insert(row);
        }

        Self {
            segments: segments(&lod.fenceposts),
            codes: lod.codes,
            row_of_position: lod.row_of_position,
            span: config.span.get(),
            max_zoom: config.max_tile_depth,
            visible,
        }
    }

    /// Replaces the mask, hiding each row independently.
    ///
    /// Each row stays visible with probability `visible`; equal `(visible, seed)` pairs reproduce
    /// the same mask.
    pub fn mask_uniform(&mut self, visible: f64, seed: u64) {
        let rows = self.row_of_position.len();
        let mut rng = keyed_rng(seed, 0x0DD5_EED5, 1);
        let mut mask = BitSet::new(rows);
        for row in 0..rows {
            if uniform(&mut rng) < visible {
                mask.insert(row);
            }
        }
        self.visible = mask;
    }

    /// Replaces the mask, hiding whole spatial blocks until the quota is met.
    ///
    /// Blocks are cells drawn at depths 4 through 7; every row inside a drawn cell hides until
    /// roughly `1 - visible` of the corpus is hidden. Spatially contiguous hiding is the
    /// adversarial mask shape: whole scheduled runs vanish and fills walk deep.
    #[expect(
        clippy::missing_panics_doc,
        clippy::cast_possible_truncation,
        clippy::cast_precision_loss,
        clippy::cast_sign_loss,
        reason = "the expects name drawn depths and coordinates that lie on the grid by \
                  construction; the quota is a hiding target and row counts sit far below the \
                  mantissa width"
    )]
    pub fn mask_clustered(&mut self, visible: f64, seed: u64) {
        let rows = self.row_of_position.len();
        let mut rng = keyed_rng(seed, 0x00C1_0575, 2);
        let mut hidden = BitSet::new(rows);
        let quota = ((1.0 - visible) * rows as f64) as usize;

        let mut count = 0;
        while count < quota {
            let depth = 4 + u8::try_from(uniform_below(
                &mut rng,
                NonZero::new(4).expect("four is nonzero"),
            ))
            .expect("draws below four fit u8");
            let side = u64::from(1_u32 << depth);
            let bound = NonZero::new(side).expect("cell grids have nonzero sides");
            let cell = MortonCell::new(
                Depth::new(depth).expect("depths 4 through 7 lie within the key width"),
                u32::try_from(uniform_below(&mut rng, bound)).expect("draws stay below the side"),
                u32::try_from(uniform_below(&mut rng, bound)).expect("draws stay below the side"),
            )
            .expect("coordinates below the side length lie on the grid");

            let ranges = self.narrowed(cell);
            'block: for range in ranges {
                for position in range {
                    let row = self.row_of_position[position] as usize;
                    if !hidden.contains(row) {
                        hidden.insert(row);
                        count += 1;
                        if count == quota {
                            break 'block;
                        }
                    }
                }
            }
        }

        let mut mask = BitSet::new(rows);
        for row in 0..rows {
            if !hidden.contains(row) {
                mask.insert(row);
            }
        }
        self.visible = mask;
    }

    /// Returns the corpus row count.
    #[must_use]
    pub fn points(&self) -> usize {
        self.row_of_position.len()
    }

    /// Returns the visible row count under the current mask.
    #[must_use]
    pub fn visible_rows(&self) -> usize {
        self.visible.count()
    }

    /// Returns the deepest tile zoom the schedule serves.
    #[must_use]
    pub const fn max_zoom(&self) -> u8 {
        self.max_zoom
    }

    /// Returns the root-to-deepest descent path through the densest cells.
    ///
    /// Each step descends into the child holding the most points before masking, so the path is
    /// one fixture-determined column a whole mask sweep can share.
    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "the expects name children of on-grid cells, on the grid by construction"
    )]
    pub fn descent(&self) -> Vec<(u8, u32, u32)> {
        let mut path = vec![(0_u8, 0_u32, 0_u32)];
        let (mut x, mut y) = (0_u32, 0_u32);

        for z in 1..=self.max_zoom {
            let mut best = (0_usize, 0_u32, 0_u32);
            for quadrant in 0..4 {
                let (cx, cy) = (2 * x + (quadrant & 1), 2 * y + (quadrant >> 1));
                let cell = MortonCell::new(
                    Depth::new(z).expect("tile zooms lie within the key width"),
                    cx,
                    cy,
                )
                .expect("children of an on-grid cell lie on the grid");
                let population = self
                    .narrowed(cell)
                    .iter()
                    .map(ExactSizeIterator::len)
                    .sum::<usize>();
                if population > best.0 {
                    best = (population, cx, cy);
                }
            }
            if best.0 == 0 {
                break;
            }
            (x, y) = (best.1, best.2);
            path.push((z, x, y));
        }

        path
    }

    /// Delivers one tile in isolation: the independent-tails variant.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn independent(&self, z: u8, x: u32, y: u32) -> Selection {
        let taken = BitSet::new(0);
        let mut delivered = Vec::new();
        self.walk(z, x, y, &taken, &mut delivered)
    }

    /// Delivers one tile behind its recomputed ancestor chain: the chained variant.
    ///
    /// Every ancestor's delivery is re-derived against the same mask, top down, and the tile's own
    /// fill skips everything the chain took. [`Selection::scanned`] sums the chain's scans; the
    /// other counts describe the tile itself.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn chained(&self, z: u8, x: u32, y: u32) -> Selection {
        let mut taken = BitSet::new(self.codes.len());
        let mut delivered = Vec::new();
        let mut scanned = 0_usize;

        for level in 0..z {
            let shift = z - level;
            delivered.clear();
            let ancestor = self.walk(level, x >> shift, y >> shift, &taken, &mut delivered);
            scanned += ancestor.scanned;
            for &position in &delivered {
                taken.insert(position as usize);
            }
        }

        delivered.clear();
        let mut own = self.walk(z, x, y, &taken, &mut delivered);
        own.scanned += scanned;
        own
    }

    /// Counts the independent variant's re-deliveries at one tile.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn crowding(&self, z: u8, x: u32, y: u32) -> Crowding {
        let mut taken = BitSet::new(self.codes.len());
        let mut delivered = Vec::new();

        for level in 0..z {
            let shift = z - level;
            delivered.clear();
            self.walk(level, x >> shift, y >> shift, &taken, &mut delivered);
            for &position in &delivered {
                taken.insert(position as usize);
            }
        }

        delivered.clear();
        let none = BitSet::new(0);
        self.walk(z, x, y, &none, &mut delivered);

        let duplicates = delivered
            .iter()
            .filter(|&&position| taken.contains(position as usize))
            .count();
        Crowding {
            delivered: delivered.len(),
            duplicates,
        }
    }

    /// Delivers one tile: scheduled points first, then the fill from deeper buckets.
    ///
    /// `taken` positions never deliver; every delivered position lands in `out`.
    fn walk(&self, z: u8, x: u32, y: u32, taken: &BitSet, out: &mut Vec<u32>) -> Selection {
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let cell = MortonCell::new(
            Depth::new(z).expect("tile zooms lie within the key width"),
            x,
            y,
        )
        .expect("the coordinate lies on the zoom's grid");

        let ranges = if z == 0 {
            self.segments.clone()
        } else {
            self.narrowed(cell)
        };
        let cut = usize::from(z + self.span);

        // The root's schedule is buckets 0..=m whole; deeper tiles schedule bucket z + m alone.
        let natural_buckets = if z == 0 { 0..=cut } else { cut..=cut };
        let budget: usize = ranges[natural_buckets.clone()]
            .iter()
            .map(ExactSizeIterator::len)
            .sum();

        let mut scanned = 0_usize;
        let mut natural = 0_usize;
        for range in &ranges[natural_buckets] {
            for position in range.clone() {
                scanned += 1;
                if self.admits(taken, position) {
                    natural += 1;
                    out.push(u32::try_from(position).expect("positions share the u32 row domain"));
                }
            }
        }

        let mut tail = 0_usize;
        'fill: for range in &ranges[cut + 1..] {
            if natural + tail == budget {
                break;
            }
            for position in range.clone() {
                scanned += 1;
                if self.admits(taken, position) {
                    tail += 1;
                    out.push(u32::try_from(position).expect("positions share the u32 row domain"));
                    if natural + tail == budget {
                        break 'fill;
                    }
                }
            }
        }

        Selection {
            budget,
            natural,
            tail,
            scanned,
        }
    }

    /// Returns whether the position's row is visible and the position is untaken.
    ///
    /// A `taken` set sized zero excludes nothing: positions beyond its capacity are absent by
    /// definition.
    fn admits(&self, taken: &BitSet, position: usize) -> bool {
        let taken = position < taken.len() && taken.contains(position);
        !taken
            && self
                .visible
                .contains(self.row_of_position[position] as usize)
    }

    /// Narrows every bucket's segment to the codes inside `cell`.
    fn narrowed(&self, cell: MortonCell) -> Ranges {
        core::array::from_fn(|bucket| {
            let range = &self.segments[bucket];
            let slice = &self.codes[range.clone()];
            let start = range.start + slice.partition_point(|&code| code < cell.min_key());
            let end = range.start + slice.partition_point(|&code| code <= cell.max_key());
            start..end
        })
    }
}

/// The whole-domain ranges: every bucket's full segment.
fn segments(fenceposts: &Fenceposts) -> Ranges {
    core::array::from_fn(|bucket| {
        let bucket = u8::try_from(bucket).expect("segment indexes are bounded by the 33 buckets");
        let range = fenceposts
            .segment(Depth::new(bucket).expect("every segment index names a valid depth"));
        usize::try_from(range.start).expect("resident columns fit the address space")
            ..usize::try_from(range.end).expect("resident columns fit the address space")
    })
}

/// Draws one uniform sample from `[0, 1)`.
#[expect(
    clippy::cast_precision_loss,
    clippy::float_arithmetic,
    reason = "the 53-bit draw is the standard unit-interval construction: every value is exact"
)]
fn uniform(mut rng: impl rand::Rng) -> f64 {
    (rng.next_u64() >> 11) as f64 / (1_u64 << 53) as f64
}
