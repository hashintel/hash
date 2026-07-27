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
//! [`WalkBench::deliver`] runs that same chain against a [`FillRule`], the count each level fills
//! to: [`FillRule::Unmasked`] is the scheduled count before masking, [`FillRule::Coverage`] the
//! depth-`z + m` cells of the tile cell holding a visible point less the chain's own deliveries
//! inside it, [`FillRule::Visible`] the visible scheduled count alone, and
//! [`FillRule::CoverageCells`] the same cell count with the fill restricted to cells no delivered
//! point occupies. The coverage targets read a [`VisibleCellPyramid`], one cell census per cut
//! depth over the visible view;
//! [`WalkBench::visible_cascade`] runs the production cascade over the visible points alone, the
//! schedule a coverage target claims to reproduce. [`WalkBench::audit`] reports both alongside the
//! cells a chain's delivery actually occupies.
//!
//! [`WalkBench::build`] synthesizes a clustered corpus and runs the production cascade over it;
//! [`WalkBench::mask_uniform`] hides rows independently and [`WalkBench::mask_clustered`] hides
//! whole spatial blocks, the adversarial shape for walk lengths. Selections return plain counts;
//! wall time belongs to the bench target. Nothing here is API for consumers of the crate.

use core::{f64::consts::TAU, num::NonZero, ops::Range};
use std::collections::HashSet;

use super::{
    cascade,
    rank::{RankInputs, Ranking},
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
    /// The count the fill runs to, which [`FillRule`] chooses.
    ///
    /// Under [`FillRule::Unmasked`] it is the scheduled count before masking.
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

/// The count one masked delivery fills to at every level of its chain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum FillRule {
    /// The level's scheduled count before masking.
    Unmasked,
    /// The level cut's cells holding a visible point, less the chain's deliveries inside the cell.
    ///
    /// The target is a function of the visible view and the chain's own output: it reads a
    /// [`VisibleCellPyramid`] and the delivered positions, never a hidden row.
    Coverage,
    /// The level's visible scheduled count, which its own admissions meet.
    Visible,
    /// The level cut's cells holding a visible point, less the cells the chain already represents.
    ///
    /// The fill takes a point only where its cut cell holds no delivered point, so the delivery
    /// occupies one cell per covered cell.
    CoverageCells,
}

/// The count one level's walk fills to.
#[derive(Debug)]
enum FillTarget<'cells> {
    /// The level's scheduled count before masking.
    Scheduled,
    /// An explicit count.
    Count(usize),
    /// The scheduled admissions alone.
    Admitted,
    /// One delivered point per cell of `cut` the extent covers.
    ///
    /// `represented` enters holding the cells the chain already covers and leaves holding every
    /// cell the delivery covers; the fill stops once it holds `goal` of them.
    Cells {
        /// The cells the extent's visible points occupy at `cut`.
        goal: usize,
        /// The level's cut depth.
        cut: Depth,
        /// The cells a delivered point already occupies.
        represented: &'cells mut HashSet<u64>,
    },
}

/// One chain's coverage accounting at the target tile.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ChainAudit {
    /// The tile's own fill target.
    pub target: usize,
    /// Cells of the tile's cut depth inside the tile cell holding a visible point.
    pub covered: usize,
    /// Chain deliveries inside the tile cell, the levels above the tile alone.
    pub inherited: usize,
    /// Cut-depth cells those chain deliveries occupy.
    pub inherited_cells: usize,
    /// The tile's own delivery: scheduled admissions plus fill.
    pub delivered: usize,
    /// Chain and own deliveries inside the tile cell.
    pub cumulative: usize,
    /// Cut-depth cells the chain and own deliveries occupy.
    pub cumulative_cells: usize,
    /// Whether a level above the tile ended below its own target.
    pub spent: bool,
    /// Whether the tile's delivery ended below its target.
    pub dry: bool,
    /// Candidate positions examined across the chain.
    pub scanned: usize,
}

/// One cell census per delivery cut depth over the visible view.
///
/// Level `d` holds, ascending, every depth-`d` cell index containing at least one visible point;
/// the levels span the cut depths `m` through `z_max + m` a tile schedule reads.
/// [`VisibleCellPyramid::count`] answers how many of a cell's depth-`d` cells hold a visible point.
///
/// One pyramid describes one `(corpus, mask)` pair: a mask replacement invalidates it.
#[derive(Debug)]
pub struct VisibleCellPyramid {
    /// The shallowest depth the levels cover.
    shallowest: u8,
    /// Ascending distinct cell indexes per depth, shallowest level first.
    levels: Box<[Box<[u64]>]>,
}

/// The rank order a visible-only cascade claims cells in.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VisibleRankOrder {
    /// Ascending base position.
    Base,
    /// Descending base position.
    Reversed,
}

/// The visible subcorpus's own cascade: the schedule a visible-only generation publishes.
///
/// The production first-occupant cascade over the visible points alone, at the corpus's deepest
/// grid. [`VisibleCascade::schedule`] returns one tile's scheduled count under that assignment and
/// [`VisibleCascade::covered`] the count the tile's cut reaches, so a delivery target derived from
/// the visible view compares against the schedule it stands in for.
#[derive(Debug)]
pub struct VisibleCascade {
    /// Visible points as key bits paired with their bucket depth, ascending by key.
    points: Box<[(u64, u8)]>,
    /// The cut's span exponent `m`.
    span: u8,
    /// The deepest grid the cascade assigned over.
    deepest: Depth,
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

    /// Builds the instrument over externally supplied cascade artifacts.
    ///
    /// `code_bits` is the bucket-segmented base-order key column as raw key bits; `lengths` the
    /// per-bucket segment lengths in depth order (fewer entries than the bucket table reads as
    /// trailing empty buckets); `row_of_position` the base permutation; `span` and `max_zoom`
    /// the delivery schedule. The mask starts all-visible. Feeding one corpus's real artifacts
    /// to both this instrument and the serving path is what a set-agreement comparison rides.
    ///
    /// # Panics
    ///
    /// Panics when the lengths overrun the bucket table or disagree with the code count, or when
    /// the columns disagree on length.
    #[must_use]
    pub fn from_parts(
        code_bits: &[u64],
        lengths: &[u64],
        row_of_position: Vec<u32>,
        span: u8,
        max_zoom: u8,
    ) -> Self {
        assert!(
            lengths.len() <= Fenceposts::SEGMENTS,
            "the bucket table holds {} segments",
            Fenceposts::SEGMENTS,
        );
        assert_eq!(
            lengths.iter().sum::<u64>(),
            code_bits.len() as u64,
            "the segment lengths must cover the code column exactly",
        );
        assert_eq!(
            code_bits.len(),
            row_of_position.len(),
            "the code and row columns are position-aligned",
        );

        let mut segments: Ranges = core::array::from_fn(|_| 0..0);
        let mut at = 0_usize;
        for (bucket, &length) in lengths.iter().enumerate() {
            let length = usize::try_from(length).expect("resident columns fit the address space");
            segments[bucket] = at..at + length;
            at += length;
        }
        for segment in segments.iter_mut().skip(lengths.len()) {
            *segment = at..at;
        }

        let rows = row_of_position.len();
        let mut visible = BitSet::new(rows);
        for row in 0..rows {
            visible.insert(row);
        }

        Self {
            codes: code_bits
                .iter()
                .map(|&bits| MortonKey::from_bits(bits))
                .collect(),
            row_of_position: row_of_position.into_boxed_slice(),
            segments,
            span,
            max_zoom,
            visible,
        }
    }

    /// Returns the corpus columns as plain numbers: key bits, rows, and bucket segment bounds.
    ///
    /// The synthetic corpus becomes visitable by an external reference implementation - the
    /// mirror of [`Self::from_parts`].
    #[must_use]
    pub fn columns(&self) -> (Vec<u64>, Vec<u32>, Vec<(usize, usize)>) {
        (
            self.codes.iter().map(|code| code.to_bits()).collect(),
            self.row_of_position.to_vec(),
            self.segments
                .iter()
                .map(|range| (range.start, range.end))
                .collect(),
        )
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

    /// Replaces the mask with an explicit visible row set.
    ///
    /// The set is what a serving-side visibility proof pins, so one masked view can drive this
    /// instrument and the serving path at once.
    ///
    /// # Panics
    ///
    /// Panics when a row lies beyond the corpus row domain.
    pub fn mask_rows(&mut self, visible: impl IntoIterator<Item = u32>) {
        let mut mask = BitSet::new(self.row_of_position.len());
        for row in visible {
            mask.insert(row as usize);
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

    /// Returns the cut's span exponent `m`: a tile at zoom `z` cuts at depth `z + m`.
    #[must_use]
    pub const fn span(&self) -> u8 {
        self.span
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
        self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled)
    }

    /// Delivers one tile behind its recomputed ancestor chain: the chained variant.
    ///
    /// Every ancestor's delivery is re-derived against the same mask, top down, and the tile's own
    /// fill skips everything the chain took. An ancestor whose fill ends short of budget spent its
    /// subtree's visible pool, so the chain stops there and the tile delivers nothing - every
    /// descendant extent is a subset of the spent one. [`Selection::scanned`] sums the chain's
    /// scans; the other counts describe the tile itself.
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
            let ancestor = self.walk(
                level,
                x >> shift,
                y >> shift,
                &taken,
                &mut delivered,
                FillTarget::Scheduled,
            );
            scanned += ancestor.scanned;
            for &position in &delivered {
                taken.insert(position as usize);
            }
            if ancestor.natural + ancestor.tail < ancestor.budget {
                return Selection {
                    budget: self.budget_of(z, x, y),
                    natural: 0,
                    tail: 0,
                    scanned,
                };
            }
        }

        delivered.clear();
        let mut own = self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled);
        own.scanned += scanned;
        own
    }

    /// Delivers one tile in isolation, returning the delivered positions in delivery order.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn independent_delivery(&self, z: u8, x: u32, y: u32) -> Vec<u32> {
        let taken = BitSet::new(0);
        let mut delivered = Vec::new();
        self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled);
        delivered
    }

    /// Delivers one tile behind its recomputed ancestor chain, returning the delivered positions
    /// in delivery order.
    ///
    /// The chain and its early exit follow [`Self::chained`] exactly; a spent chain returns the
    /// empty delivery.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn chained_delivery(&self, z: u8, x: u32, y: u32) -> Vec<u32> {
        let mut taken = BitSet::new(self.codes.len());
        let mut delivered = Vec::new();

        for level in 0..z {
            let shift = z - level;
            delivered.clear();
            let ancestor = self.walk(
                level,
                x >> shift,
                y >> shift,
                &taken,
                &mut delivered,
                FillTarget::Scheduled,
            );
            for &position in &delivered {
                taken.insert(position as usize);
            }
            if ancestor.natural + ancestor.tail < ancestor.budget {
                return Vec::new();
            }
        }

        delivered.clear();
        self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled);
        delivered
    }

    /// Builds the visible-cell pyramid over the cut depths the schedule reads.
    ///
    /// One level per depth `m` through `z_max + m`, built from one sort of the visible key column
    /// and one pass per level. The footprint is eight bytes per occupied cell, which
    /// [`VisibleCellPyramid::footprint`] reports.
    ///
    /// # Panics
    ///
    /// Panics when the schedule's deepest cut lies beyond the key width.
    #[must_use]
    pub fn pyramid(&self) -> VisibleCellPyramid {
        let mut codes = Vec::with_capacity(self.visible.count());
        for (position, code) in self.codes.iter().enumerate() {
            if self
                .visible
                .contains(self.row_of_position[position] as usize)
            {
                codes.push(code.to_bits());
            }
        }
        codes.sort_unstable();

        let deepest = self.max_zoom + self.span;
        let mut levels = Vec::with_capacity(usize::from(self.max_zoom) + 1);
        for depth in self.span..=deepest {
            let depth = Depth::new(depth).expect("the schedule's cuts lie within the key width");
            let mut cells: Vec<u64> = Vec::new();
            for &bits in &codes {
                let cell = MortonKey::from_bits(bits).prefix(depth);
                if cells.last() != Some(&cell) {
                    cells.push(cell);
                }
            }
            levels.push(cells.into_boxed_slice());
        }

        VisibleCellPyramid {
            shallowest: self.span,
            levels: levels.into_boxed_slice(),
        }
    }

    /// Runs the production cascade over the visible points alone.
    ///
    /// The visible key column enters as its own corpus at the same deepest grid, ranked by base
    /// position in `order`. The resulting counts are a function of the keys and the deepest grid:
    /// both orders assign the same per-cell counts.
    ///
    /// # Panics
    ///
    /// Panics when the schedule's deepest cut lies beyond the key width.
    #[must_use]
    pub fn visible_cascade(&self, order: VisibleRankOrder) -> VisibleCascade {
        let mut keys = Vec::with_capacity(self.visible.count());
        for (position, code) in self.codes.iter().enumerate() {
            if self
                .visible
                .contains(self.row_of_position[position] as usize)
            {
                keys.push(*code);
            }
        }

        let rows = u32::try_from(keys.len()).expect("visible rows share the u32 row domain");
        let row_of_rank: Box<[u32]> = match order {
            VisibleRankOrder::Base => (0..rows).collect(),
            VisibleRankOrder::Reversed => (0..rows).rev().collect(),
        };
        let mut rank_of_row = vec![0_u32; keys.len()];
        for (rank, &row) in row_of_rank.iter().enumerate() {
            rank_of_row[row as usize] =
                u32::try_from(rank).expect("visible ranks share the u32 row domain");
        }
        let ranking = Ranking {
            row_of_rank,
            rank_of_row: rank_of_row.into_boxed_slice(),
        };

        let deepest = Depth::new(self.max_zoom + self.span)
            .expect("the schedule's cuts lie within the key width");
        let buckets = cascade::buckets(&keys, &ranking, deepest);

        let mut points: Vec<(u64, u8)> = keys
            .iter()
            .zip(&buckets)
            .map(|(key, bucket)| (key.to_bits(), bucket.get()))
            .collect();
        points.sort_unstable();

        VisibleCascade {
            points: points.into_boxed_slice(),
            span: self.span,
            deepest,
        }
    }

    /// Delivers one tile behind its recomputed ancestor chain under a fill rule.
    ///
    /// The chain, its per-level order, and its early exit follow [`Self::chained`];
    /// [`FillRule::Unmasked`] reproduces that variant's counts exactly. [`Selection::budget`] holds
    /// the tile's own target under `rule`.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn deliver(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        pyramid: &VisibleCellPyramid,
    ) -> Selection {
        let mut delivered = Vec::new();
        self.chain(
            rule,
            z,
            x,
            y,
            pyramid,
            ChainBuffers {
                own: &mut delivered,
                inside: None,
            },
        )
        .own
    }

    /// Delivers one tile under a fill rule, returning the delivered positions in delivery order.
    ///
    /// A spent chain returns the empty delivery, as [`Self::chained_delivery`] does.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn delivery(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        pyramid: &VisibleCellPyramid,
    ) -> Vec<u32> {
        let mut delivered = Vec::new();
        self.chain(
            rule,
            z,
            x,
            y,
            pyramid,
            ChainBuffers {
                own: &mut delivered,
                inside: None,
            },
        );
        delivered
    }

    /// Audits one tile's chain against the visible cells its cut resolves.
    ///
    /// The delivery runs exactly as [`Self::deliver`] does; the audit additionally counts the
    /// cut-depth cells the chain's deliveries inside the tile cell occupy, so a target's count and
    /// the coverage it achieves are separate numbers.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn audit(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        pyramid: &VisibleCellPyramid,
    ) -> ChainAudit {
        let mut delivered = Vec::new();
        let mut inside = Vec::new();
        let chain = self.chain(
            rule,
            z,
            x,
            y,
            pyramid,
            ChainBuffers {
                own: &mut delivered,
                inside: Some(&mut inside),
            },
        );

        let cut = Depth::new(z + self.span).expect("the schedule's cuts lie within the key width");
        let inherited_cells = self.distinct_cells(&inside, cut);
        inside.extend_from_slice(&delivered);
        let cumulative_cells = self.distinct_cells(&inside, cut);

        let own = chain.own;
        let delivered = own.natural + own.tail;
        ChainAudit {
            target: own.budget,
            covered: chain.covered,
            inherited: chain.inherited,
            inherited_cells,
            delivered,
            cumulative: chain.inherited + delivered,
            cumulative_cells,
            spent: chain.spent,
            dry: delivered < own.budget,
            scanned: own.scanned,
        }
    }

    /// Delivers one tile behind its chain, recording the chain's deliveries inside the tile cell.
    fn chain(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        pyramid: &VisibleCellPyramid,
        buffers: ChainBuffers<'_>,
    ) -> ChainOutcome {
        let ChainBuffers { own, mut inside } = buffers;
        let key = cell_of(z, x, y).min_key();
        let mut taken = BitSet::new(self.codes.len());
        let mut delivered = Vec::new();
        // Chain deliveries by the deepest chain level whose cell holds them: a position counts
        // inside every level at or above its entry.
        let mut nesting = vec![0_usize; usize::from(z) + 1];
        // The cell rule re-reads the chain's positions at each level's own cut depth, so the
        // history stays grouped by the deepest level holding them.
        let mut history: Vec<Vec<u32>> = if rule == FillRule::CoverageCells {
            vec![Vec::new(); usize::from(z) + 1]
        } else {
            Vec::new()
        };
        let mut scanned = 0_usize;
        let mut spent = false;

        for level in 0..z {
            let shift = z - level;
            let (ancestor_x, ancestor_y) = (x >> shift, y >> shift);
            let inherited: usize = nesting[usize::from(level)..].iter().sum();
            let cut = self.cut_of(level);
            let covered = covered_of(rule, cell_of(level, ancestor_x, ancestor_y), cut, pyramid);
            let mut represented = HashSet::new();
            self.represent(rule, &history, level, cut, &mut represented);
            let target = target_of(rule, inherited, covered, cut, &mut represented);

            delivered.clear();
            let ancestor = self.walk(
                level,
                ancestor_x,
                ancestor_y,
                &taken,
                &mut delivered,
                target,
            );
            scanned += ancestor.scanned;

            for &position in &delivered {
                taken.insert(position as usize);
                let depth = shared_depth(self.codes[position as usize], key).min(z);
                nesting[usize::from(depth)] += 1;
                if rule == FillRule::CoverageCells {
                    history[usize::from(depth)].push(position);
                }
                if depth == z
                    && let Some(inside) = inside.as_deref_mut()
                {
                    inside.push(position);
                }
            }

            let short = if rule == FillRule::CoverageCells {
                represented.len() < covered
            } else {
                ancestor.natural + ancestor.tail < ancestor.budget
            };
            if short {
                spent = true;
                break;
            }
        }

        let inherited = nesting[usize::from(z)];
        let cut = self.cut_of(z);
        // The audit reports the tile's covered count under every rule; the coverage rules need it
        // for the target itself.
        let covered = if inside.is_some() {
            pyramid.count(cell_of(z, x, y), cut)
        } else {
            covered_of(rule, cell_of(z, x, y), cut, pyramid)
        };
        let mut represented = HashSet::new();
        self.represent(rule, &history, z, cut, &mut represented);
        let entry = represented.len();
        let target = target_of(rule, inherited, covered, cut, &mut represented);

        if spent {
            let budget = match target {
                FillTarget::Scheduled => self.budget_of(z, x, y),
                FillTarget::Count(count) => count,
                FillTarget::Admitted => 0,
                FillTarget::Cells { goal, .. } => goal.saturating_sub(entry),
            };
            return ChainOutcome {
                own: Selection {
                    budget,
                    natural: 0,
                    tail: 0,
                    scanned,
                },
                covered,
                inherited,
                spent,
            };
        }

        let mut selection = self.walk(z, x, y, &taken, own, target);
        if rule == FillRule::CoverageCells {
            selection.budget = covered.saturating_sub(entry);
        }
        selection.scanned += scanned;
        ChainOutcome {
            own: selection,
            covered,
            inherited,
            spent,
        }
    }

    /// Returns the level's cut depth.
    const fn cut_of(&self, z: u8) -> Depth {
        Depth::new(z + self.span).expect("the schedule's cuts lie within the key width")
    }

    /// Collects the cells the chain's deliveries inside the level's cell occupy at `cut`.
    ///
    /// `history` groups the chain's deliveries by the deepest level whose cell holds them, so the
    /// levels from `z` on are exactly the deliveries inside this level's cell.
    fn represent(
        &self,
        rule: FillRule,
        history: &[Vec<u32>],
        z: u8,
        cut: Depth,
        represented: &mut HashSet<u64>,
    ) {
        if rule != FillRule::CoverageCells {
            return;
        }

        for level in history.iter().skip(usize::from(z)) {
            for &position in level {
                represented.insert(self.codes[position as usize].prefix(cut));
            }
        }
    }

    /// Counts the distinct cells the positions occupy at `depth`.
    fn distinct_cells(&self, positions: &[u32], depth: Depth) -> usize {
        let mut cells = HashSet::with_capacity(positions.len());
        for &position in positions {
            cells.insert(self.codes[position as usize].prefix(depth));
        }
        cells.len()
    }

    /// Returns the tile's scheduled count before masking.
    fn budget_of(&self, z: u8, x: u32, y: u32) -> usize {
        let cell = cell_of(z, x, y);
        let ranges = if z == 0 {
            self.segments.clone()
        } else {
            self.narrowed(cell)
        };
        let cut = usize::from(z + self.span);
        let natural = if z == 0 { 0..=cut } else { cut..=cut };

        ranges[natural].iter().map(ExactSizeIterator::len).sum()
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
            self.walk(
                level,
                x >> shift,
                y >> shift,
                &taken,
                &mut delivered,
                FillTarget::Scheduled,
            );
            for &position in &delivered {
                taken.insert(position as usize);
            }
        }

        delivered.clear();
        let none = BitSet::new(0);
        self.walk(z, x, y, &none, &mut delivered, FillTarget::Scheduled);

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
    /// `taken` positions never deliver; every delivered position lands in `out`. The scheduled
    /// admissions deliver whole, and the fill runs while the delivery stays below `fill`.
    fn walk(
        &self,
        z: u8,
        x: u32,
        y: u32,
        taken: &BitSet,
        out: &mut Vec<u32>,
        fill: FillTarget,
    ) -> Selection {
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let cell = cell_of(z, x, y);

        let ranges = if z == 0 {
            self.segments.clone()
        } else {
            self.narrowed(cell)
        };
        let cut = usize::from(z + self.span);

        // The root's schedule is buckets 0..=m whole; deeper tiles schedule bucket z + m alone.
        let natural_buckets = if z == 0 { 0..=cut } else { cut..=cut };
        let scheduled: usize = ranges[natural_buckets.clone()]
            .iter()
            .map(ExactSizeIterator::len)
            .sum();

        let goal = match &fill {
            FillTarget::Scheduled => scheduled,
            FillTarget::Count(count) => *count,
            FillTarget::Admitted => 0,
            FillTarget::Cells { goal, .. } => *goal,
        };
        let admissions_only = matches!(fill, FillTarget::Admitted);
        let mut cells = match fill {
            FillTarget::Cells {
                cut, represented, ..
            } => Some((cut, represented)),
            FillTarget::Scheduled | FillTarget::Count(_) | FillTarget::Admitted => None,
        };

        let mut scanned = 0_usize;
        let mut natural = 0_usize;
        for range in &ranges[natural_buckets] {
            for position in range.clone() {
                scanned += 1;
                if self.admits(taken, position) {
                    natural += 1;
                    if let Some((cut, represented)) = cells.as_mut() {
                        represented.insert(self.codes[position].prefix(*cut));
                    }
                    out.push(u32::try_from(position).expect("positions share the u32 row domain"));
                }
            }
        }

        let budget = if admissions_only { natural } else { goal };

        let mut tail = 0_usize;
        if let Some((cut_depth, represented)) = cells.as_mut() {
            'cover: for range in &ranges[cut + 1..] {
                if represented.len() >= goal {
                    break;
                }
                for position in range.clone() {
                    scanned += 1;
                    if !self.admits(taken, position)
                        || !represented.insert(self.codes[position].prefix(*cut_depth))
                    {
                        continue;
                    }
                    tail += 1;
                    out.push(u32::try_from(position).expect("positions share the u32 row domain"));
                    if represented.len() >= goal {
                        break 'cover;
                    }
                }
            }

            return Selection {
                budget,
                natural,
                tail,
                scanned,
            };
        }

        'fill: for range in &ranges[cut + 1..] {
            if natural + tail >= budget {
                break;
            }
            for position in range.clone() {
                scanned += 1;
                if self.admits(taken, position) {
                    tail += 1;
                    out.push(u32::try_from(position).expect("positions share the u32 row domain"));
                    if natural + tail >= budget {
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

impl VisibleCellPyramid {
    /// Counts the depth's cells inside `cell` holding a visible point.
    ///
    /// # Panics
    ///
    /// Panics when `depth` lies outside the pyramid's levels or above `cell`'s own depth.
    #[must_use]
    pub fn count(&self, cell: MortonCell, depth: Depth) -> usize {
        assert!(
            cell.depth().get() <= depth.get(),
            "a cell at depth {} holds no depth-{} cells",
            cell.depth().get(),
            depth.get(),
        );
        let level = self.level(depth);
        let low = cell.min_key().prefix(depth);
        let high = cell.max_key().prefix(depth);

        level.partition_point(|&index| index <= high) - level.partition_point(|&index| index < low)
    }

    /// Returns the cells one depth holds.
    ///
    /// # Panics
    ///
    /// Panics when `depth` lies outside the pyramid's levels.
    #[must_use]
    pub fn occupied(&self, depth: Depth) -> usize {
        self.level(depth).len()
    }

    /// Returns the pyramid's depths, shallowest first.
    ///
    /// # Panics
    ///
    /// Panics when a level's depth lies beyond the key width.
    #[must_use]
    pub fn depths(&self) -> impl IntoIterator<Item = Depth> {
        let shallowest = self.shallowest;
        (0..self.levels.len()).map(move |offset| {
            let offset = u8::try_from(offset).expect("the levels span at most the key width");
            Depth::new(shallowest + offset).expect("every level's depth lies within the key width")
        })
    }

    /// Returns the bytes the cell levels occupy.
    #[must_use]
    pub fn footprint(&self) -> usize {
        self.levels
            .iter()
            .map(|level| level.len() * size_of::<u64>())
            .sum()
    }

    /// Returns one depth's cells.
    fn level(&self, depth: Depth) -> &[u64] {
        let offset = depth
            .get()
            .checked_sub(self.shallowest)
            .expect("the pyramid holds the depth");
        &self.levels[usize::from(offset)]
    }
}

impl VisibleCascade {
    /// Returns the tile's scheduled count under the visible-only assignment.
    ///
    /// The tile's own cut alone: bucket `z + m` inside the tile cell, and buckets `0..=m` whole at
    /// the root.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the zoom's grid.
    #[must_use]
    pub fn schedule(&self, z: u8, x: u32, y: u32) -> usize {
        let cut = z + self.span;
        self.within(cell_of(z, x, y))
            .iter()
            .filter(
                |&&(_, bucket)| {
                    if z == 0 { bucket <= cut } else { bucket == cut }
                },
            )
            .count()
    }

    /// Returns the count the tile's cut reaches inside the tile cell.
    ///
    /// Every visible point whose bucket lies at or below `z + m`: the schedule's cumulative
    /// delivery through the tile's level.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the zoom's grid.
    #[must_use]
    pub fn covered(&self, z: u8, x: u32, y: u32) -> usize {
        let cut = z + self.span;
        self.within(cell_of(z, x, y))
            .iter()
            .filter(|&&(_, bucket)| bucket <= cut)
            .count()
    }

    /// Returns the visible point count the cascade ran over.
    #[must_use]
    pub fn points(&self) -> usize {
        self.points.len()
    }

    /// Checks the cascade's coverage contract over the visible assignment.
    ///
    /// Every occupied cell of every grid up to the deepest holds a point whose bucket lies at or
    /// below that grid's depth.
    ///
    /// # Panics
    ///
    /// Panics when a stored bucket lies beyond the key width.
    #[must_use]
    pub fn coverage_holds(&self) -> bool {
        let keys: Vec<MortonKey> = self
            .points
            .iter()
            .map(|&(bits, _)| MortonKey::from_bits(bits))
            .collect();
        let buckets: Vec<Depth> = self
            .points
            .iter()
            .map(|&(_, bucket)| Depth::new(bucket).expect("buckets lie within the key width"))
            .collect();

        cascade::verify_coverage(&keys, &buckets, self.deepest).is_ok()
    }

    /// Returns the points inside `cell`.
    fn within(&self, cell: MortonCell) -> &[(u64, u8)] {
        let low = cell.min_key().to_bits();
        let high = cell.max_key().to_bits();
        let start = self.points.partition_point(|&(bits, _)| bits < low);
        let end = self.points.partition_point(|&(bits, _)| bits <= high);

        &self.points[start..end]
    }
}

/// The delivery buffers one chain fills.
#[derive(Debug)]
struct ChainBuffers<'buffers> {
    /// The tile's own delivery, in delivery order.
    own: &'buffers mut Vec<u32>,
    /// Chain deliveries inside the tile cell, for a caller that reads them.
    inside: Option<&'buffers mut Vec<u32>>,
}

/// One chain's outcome at the target tile.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ChainOutcome {
    /// The tile's own delivery counts.
    own: Selection,
    /// Cut-depth cells inside the tile cell holding a visible point.
    covered: usize,
    /// Chain deliveries inside the tile cell, the levels above the tile alone.
    inherited: usize,
    /// Whether a level above the tile ended below its own target.
    spent: bool,
}

/// Returns the cells the extent covers at `cut`, for the rules deriving a target from them.
fn covered_of(rule: FillRule, cell: MortonCell, cut: Depth, pyramid: &VisibleCellPyramid) -> usize {
    match rule {
        FillRule::Coverage | FillRule::CoverageCells => pyramid.count(cell, cut),
        FillRule::Unmasked | FillRule::Visible => 0,
    }
}

/// Returns the count one level fills to under a rule.
const fn target_of(
    rule: FillRule,
    inherited: usize,
    covered: usize,
    cut: Depth,
    represented: &mut HashSet<u64>,
) -> FillTarget<'_> {
    match rule {
        FillRule::Unmasked => FillTarget::Scheduled,
        FillRule::Coverage => FillTarget::Count(covered.saturating_sub(inherited)),
        FillRule::Visible => FillTarget::Admitted,
        FillRule::CoverageCells => FillTarget::Cells {
            goal: covered,
            cut,
            represented,
        },
    }
}

/// Returns the cell at `(z, x, y)`.
///
/// # Panics
///
/// Panics when the zoom lies beyond the key width or the coordinate off the zoom's grid.
const fn cell_of(z: u8, x: u32, y: u32) -> MortonCell {
    MortonCell::new(
        Depth::new(z).expect("tile zooms lie within the key width"),
        x,
        y,
    )
    .expect("the coordinate lies on the zoom's grid")
}

/// Returns the deepest grid depth at which two keys share a cell.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "a cell index is two key bits, so the shared depth is the shared bit count halved"
)]
fn shared_depth(left: MortonKey, right: MortonKey) -> u8 {
    let difference = left.to_bits() ^ right.to_bits();
    if difference == 0 {
        return Depth::MAX.get();
    }

    u8::try_from(difference.leading_zeros() / 2).expect("halved key widths fit u8")
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

#[cfg(test)]
mod tests {
    use super::{FillRule, VisibleRankOrder, WalkBench, cell_of};
    use crate::morton::{Depth, MortonKey};

    /// The corpus scale the seam's own checks run at.
    const POINTS: usize = 8_000;

    /// The fixture seed.
    const SEED: u64 = 0x0C0F_F111;

    /// Builds the fixture under one mask.
    fn masked(clustered: bool, visible: f64) -> WalkBench {
        let mut bench = WalkBench::build(POINTS, SEED);
        if clustered {
            bench.mask_clustered(visible, SEED);
        } else {
            bench.mask_uniform(visible, SEED);
        }

        bench
    }

    #[test]
    fn the_unmasked_rule_reproduces_the_chained_variant() {
        for clustered in [false, true] {
            for visible in [1.0, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();

                for (z, x, y) in bench.descent() {
                    assert_eq!(
                        bench.deliver(FillRule::Unmasked, z, x, y, &pyramid),
                        bench.chained(z, x, y),
                        "the unmasked rule and the chained variant differ at zoom {z}",
                    );
                    assert_eq!(
                        bench.delivery(FillRule::Unmasked, z, x, y, &pyramid),
                        bench.chained_delivery(z, x, y),
                        "the unmasked rule and the chained variant deliver differently at zoom {z}",
                    );
                }
            }
        }
    }

    #[test]
    fn the_pyramid_counts_what_the_visible_cascade_reaches() {
        for clustered in [false, true] {
            for visible in [1.0, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();
                let cascade = bench.visible_cascade(VisibleRankOrder::Base);
                let reversed = bench.visible_cascade(VisibleRankOrder::Reversed);

                assert!(cascade.coverage_holds());
                assert_eq!(cascade.points(), bench.visible_rows());

                for (z, x, y) in bench.descent() {
                    let cut = Depth::new(z + bench.span()).expect("the cut lies in the key width");
                    assert_eq!(
                        pyramid.count(cell_of(z, x, y), cut),
                        cascade.covered(z, x, y),
                        "the pyramid and the visible cascade differ at zoom {z}",
                    );
                    assert_eq!(
                        reversed.covered(z, x, y),
                        cascade.covered(z, x, y),
                        "the visible cascade's reach depends on the rank order at zoom {z}",
                    );
                    assert_eq!(
                        reversed.schedule(z, x, y),
                        cascade.schedule(z, x, y),
                        "the visible cascade's schedule depends on the rank order at zoom {z}",
                    );
                }
            }
        }
    }

    #[test]
    fn the_chain_inherits_exactly_its_ancestor_deliveries() {
        for rule in [FillRule::Unmasked, FillRule::Coverage, FillRule::Visible] {
            for clustered in [false, true] {
                for visible in [0.5, 0.05] {
                    let bench = masked(clustered, visible);
                    let pyramid = bench.pyramid();
                    let (codes, _, _) = bench.columns();

                    for (z, x, y) in bench.descent() {
                        let cell = cell_of(z, x, y);
                        let mut inherited = 0_usize;
                        for level in 0..z {
                            let shift = z - level;
                            let (ancestor_x, ancestor_y) = (x >> shift, y >> shift);
                            let audit = bench.audit(rule, level, ancestor_x, ancestor_y, &pyramid);
                            if audit.spent {
                                break;
                            }
                            for position in
                                bench.delivery(rule, level, ancestor_x, ancestor_y, &pyramid)
                            {
                                let code = MortonKey::from_bits(codes[position as usize]);
                                inherited += usize::from(cell.contains(code));
                            }
                            if audit.dry {
                                break;
                            }
                        }

                        assert_eq!(
                            bench.audit(rule, z, x, y, &pyramid).inherited,
                            inherited,
                            "the chain's inherited count disagrees with its ancestor deliveries \
                             at zoom {z}",
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn an_all_visible_mask_makes_every_rule_agree() {
        let bench = WalkBench::build(POINTS, SEED);
        let pyramid = bench.pyramid();

        for (z, x, y) in bench.descent() {
            let unmasked = bench.audit(FillRule::Unmasked, z, x, y, &pyramid);
            for rule in [
                FillRule::Coverage,
                FillRule::Visible,
                FillRule::CoverageCells,
            ] {
                assert_eq!(unmasked, bench.audit(rule, z, x, y, &pyramid));
            }
            assert_eq!(unmasked.cumulative, unmasked.covered);
            assert_eq!(unmasked.cumulative_cells, unmasked.covered);
        }
    }

    #[test]
    fn the_cell_rule_occupies_every_covered_cell() {
        for clustered in [false, true] {
            for visible in [0.75, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();

                for (z, x, y) in bench.descent() {
                    let audit = bench.audit(FillRule::CoverageCells, z, x, y, &pyramid);
                    assert_eq!(
                        audit.cumulative_cells, audit.covered,
                        "the cell rule leaves a covered cell unrepresented at zoom {z}",
                    );
                    assert!(
                        !audit.spent,
                        "the cell rule's chain ran short of its target at zoom {z}",
                    );
                }
            }
        }
    }

    #[test]
    fn the_pyramid_holds_every_cut_depth() {
        let bench = WalkBench::build(POINTS, SEED);
        let pyramid = bench.pyramid();
        let depths: Vec<Depth> = pyramid.depths().into_iter().collect();

        assert_eq!(depths.first().map(|&depth| depth.get()), Some(bench.span()));
        assert_eq!(
            depths.last().map(|&depth| depth.get()),
            Some(bench.max_zoom() + bench.span()),
        );
        assert_eq!(
            pyramid.footprint(),
            depths
                .iter()
                .map(|&depth| pyramid.occupied(depth) * size_of::<u64>())
                .sum::<usize>(),
        );

        let root = cell_of(0, 0, 0);
        for &depth in &depths {
            assert_eq!(pyramid.count(root, depth), pyramid.occupied(depth));
        }
    }
}
