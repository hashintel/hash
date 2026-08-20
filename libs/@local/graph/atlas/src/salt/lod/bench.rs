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
//! Both variants share one delivery model. The base column is bucket-major (the cascade's
//! coarse-to-fine assignment), a tile at zoom `z` with span exponent `m` schedules bucket `z + m`
//! within its extent (the root schedules buckets `0..=m` whole), and the budget is the scheduled
//! count before masking. A masked walk delivers the scheduled points the predicate admits, then
//! fills the shortfall from buckets below the cut, in bucket order and in morton order within a
//! bucket, until the delivery meets the budget or exhausts the extent.
//!
//! [`WalkBench::deliver`] runs that same chain against a [`FillRule`], the count each level fills
//! to: [`FillRule::Unmasked`] is the scheduled count before masking, [`FillRule::Coverage`] the
//! depth-`z + m` cells of the tile cell holding a visible point less the chain's own deliveries
//! inside it, [`FillRule::Visible`] the visible scheduled count alone, and
//! [`FillRule::CoverageCells`] the same cell count with the fill restricted to cells no delivered
//! point occupies. The coverage targets read a [`VisibleCellPyramid`], one cell census per cut
//! depth over the visible view; [`WalkBench::visible_cascade`] runs the production cascade over the
//! visible points alone, the schedule a coverage target claims to reproduce. [`WalkBench::audit`]
//! reports both alongside the cells a chain's delivery actually occupies.
//!
//! The rank-representative rules have two engines over one rule. [`WalkBench::deliver`] finds each
//! cell's representative by scanning the cell, `O(points in the extent)` per level.
//! [`WalkBench::served_deliver`] reads it out of a [`ServedGeneration`] instead: the visible view
//! published as its own generation, bucket-major, where a cell of depth `d` holds exactly one point
//! whose bucket lies at or below `d`, so the buckets-at-or-below-`d` ranges of an extent are its
//! depth-`d` representatives and their lengths count its occupied cells. Both engines deliver the
//! same rows in the same order, tile for tile, and the scanning one is the oracle that says so.
//!
//! [`WalkBench::build`] synthesizes a clustered corpus and runs the production cascade over it;
//! [`WalkBench::mask_uniform`] hides rows independently and [`WalkBench::mask_clustered`] hides
//! whole spatial blocks, the adversarial shape for walk lengths. Selections return plain counts;
//! wall time belongs to the bench target. Nothing here is API for consumers of the crate.

use alloc::collections::BinaryHeap;
use core::{cmp::Reverse, f64::consts::TAU, num::NonZero, ops::Range};
use std::collections::HashSet;

use hashql_core::id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet};

use super::{
    cascade,
    order::BaseOrder,
    rank::{RankInputs, Ranking},
    stage::{Lod, LodConfig},
};
use crate::{
    file::morton::{Fenceposts, SEGMENTS},
    identity::{BasePosition, ImportanceRank, NodeRowId, bench::KeyOrdinal},
    math::{FinitePointField, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    random::{keyed_rng, uniform_below},
};

/// The extent's positions inside each bucket segment, one range per bucket.
type Ranges = [Range<usize>; SEGMENTS];

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
    /// One point per level-cut cell holding a visible point, the best-ranked visible point in it.
    ///
    /// Cells the chain already represents deliver nothing further, and the cells deliver in
    /// ascending cell index. Both the cell set and the point chosen inside a cell depend on the
    /// visible view alone. A [`VisibleColumn`] is the whole input.
    CoverageRank,
    /// The same rule at depth `z + m + k`, `k` the finest grid a [`Refinement`] admits.
    ///
    /// The refinement raises the delivered count toward its budget by resolving finer cells rather
    /// than by delivering a second point into a cell already shown.
    Refined(Refinement),
}

/// A dot budget and the order a refinement spends the remainder of it in.
///
/// [`FillRule::Refined`] refines the whole level while the level's delivered count stays at or
/// below [`budget`](Self::budget), then refines individual cells one level further in
/// [`order`](Self::order) while each one still fits. Both inputs are public constants: a delivery
/// reads the visible view and these two numbers, never a hidden row.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Refinement {
    /// The count one level's own delivery aims at, `K_z`.
    ///
    /// A level whose cut depth alone already exceeds this count delivers the cut depth anyway: the
    /// budget bounds refinement, and the cut-depth floor is what keeps a cell from showing empty
    /// over visible content.
    pub budget: DotBudget,
    /// The order the leftover budget refines individual cells in.
    pub order: RefineOrder,
}

/// The count one level of a refinement aims at.
///
/// Both forms are functions of public data (a constant, or the corpus before masking), so neither
/// carries a hidden row into the delivered count.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DotBudget {
    /// One count for every tile.
    Constant(usize),
    /// The tile's own scheduled count before masking, which is today's per-tile budget.
    ///
    /// A tile delivers what today's rule would have delivered had the mask hidden nothing, so a
    /// view hiding nothing sees today's density exactly.
    Scheduled,
}

/// The order a partial refinement visits one level's cells in.
///
/// Every order is a function of the visible view, so the delivered set stays independent of the
/// hidden rows whichever one a delivery picks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RefineOrder {
    /// Whole levels alone: the delivered grid stays uniform at depth `z + m + k`.
    Whole,
    /// Ascending cell index.
    Morton,
    /// Descending visible population, ascending cell index within a tie.
    Population,
}

/// The grid one rank-representative level delivers over.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum RankPlan {
    /// The level's cut depth alone.
    Coarse,
    /// The finest grid the refinement admits.
    Refined(Refinement),
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
    /// cell the delivery covers. The fill stops once it holds `goal` of them.
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
    /// The tile's own delivery, scheduled admissions plus fill.
    pub delivered: usize,
    /// Chain and own deliveries inside the tile cell.
    pub cumulative: usize,
    /// Levels of refinement below the cut the tile's own delivery reached, `k`.
    ///
    /// Zero under every rule delivering at the cut depth itself.
    pub refined: u8,
    /// Cells a partial refinement took one level past `k`.
    pub deepened: usize,
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

/// One visible point of a [`VisibleColumn`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VisiblePoint {
    /// The point's Morton key bits.
    key: u64,
    /// The point's importance rank, smallest first.
    rank: u32,
    /// The point's base position.
    position: u32,
}

/// The visible view as one Morton-ordered column of key, rank, and base position.
///
/// This is the whole input of a rank-representative delivery: which cells hold visible content at
/// any depth, and which visible point represents each one. Sixteen bytes per visible row, one
/// column for one `(corpus, mask)` pair, invalidated by a mask replacement.
///
/// The rank column carries the corpus-wide importance rank, whose order restricted to the visible
/// rows is the same order a visible-only generation would rank them in, so the representative a
/// cell resolves to does not move when rows outside the view appear or vanish.
#[derive(Debug)]
pub struct VisibleColumn {
    /// Visible points ascending by key.
    points: Box<[VisiblePoint]>,
}

/// The visible-view artifacts a fill rule's target reads.
///
/// [`FillRule::Coverage`] and [`FillRule::CoverageCells`] read cell counts out of the pyramid;
/// [`FillRule::CoverageRank`] and [`FillRule::Refined`] read cells and representatives out of the
/// column. Both describe the same `(corpus, mask)` pair.
#[derive(Debug, Copy, Clone)]
pub struct VisibleView<'view> {
    /// The per-depth cell census.
    pyramid: &'view VisibleCellPyramid,
    /// The Morton-ordered visible column.
    column: &'view VisibleColumn,
}

impl<'view> VisibleView<'view> {
    /// Pairs a pyramid with a column over the same visible view.
    #[must_use]
    pub const fn new(pyramid: &'view VisibleCellPyramid, column: &'view VisibleColumn) -> Self {
        Self { pyramid, column }
    }
}

/// Where a served generation keeps its key column.
///
/// The keys are the only part of the artifact recoverable from elsewhere: a visible entry names a
/// base position, and the corpus-wide base column already holds that position's key. The choice is
/// therefore eight bytes per visible row against one indirect read per key comparison.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GenerationLayout {
    /// Keys beside the positions, eight further bytes per visible row.
    Inline,
    /// Keys read through the position from the corpus-wide base column.
    Shared,
}

/// The visible view published as its own generation: one bucket-major column plus a key index.
///
/// The visible points cascade alone at the finest grid and then sort as a published generation
/// does, bucket-major and ascending by key inside a bucket. The cascade's contract makes this the
/// whole input of a rank-representative delivery, without a scan. A cell of depth `d` holds exactly
/// one point whose bucket lies at or below `d`, its representative, so the buckets-at-or-below-`d`
/// ranges of an extent hold one representative per occupied depth-`d` cell and their lengths count
/// those cells.
///
/// The key index carries the same entries ascending by key, which is what answers a cell's visible
/// population - the one quantity the bucket-major order cannot count in sublinear time.
///
/// The cascade runs to [`Depth::MAX`] rather than to the schedule's deepest cut, because a
/// refinement addresses grids below that cut and a cascade's own deepest bucket is a catch-all
/// holding every co-located point rather than one per cell.
///
/// One generation describes one `(corpus, mask)` pair: a mask replacement invalidates it.
#[derive(Debug, PartialEq, Eq)]
pub struct ServedGeneration {
    /// Visible base positions, bucket-major, ascending by key inside a bucket.
    positions: Box<[u32]>,
    /// Entry-aligned keys under [`GenerationLayout::Inline`].
    keys: Option<Box<[u64]>>,
    /// Each bucket's segment of the entries.
    segments: Ranges,
    /// Entry indexes ascending by key: the population index.
    ascending: Box<[u32]>,
}

/// The rank order a visible-only cascade claims cells in.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VisibleRankOrder {
    /// Ascending base position.
    Base,
    /// Descending base position.
    Reversed,
}

/// The visible subcorpus's own cascade, the schedule a visible-only generation publishes.
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
    /// Each row's base position.
    position_of_row: Box<IdSlice<NodeRowId, BasePosition>>,
    /// Each base position's importance rank, smallest first.
    rank_of_position: Box<[u32]>,
    /// Each key-order ordinal's base position.
    position_of_key: Box<IdSlice<KeyOrdinal, BasePosition>>,
    /// Each base position's ordinal in `(key, rank)` order.
    key_order_of_position: Box<[KeyOrdinal]>,
    /// Every bucket's full segment in the base order.
    segments: Ranges,
    /// The cut's span exponent `m`.
    span: u8,
    /// The deepest tile zoom the schedule serves.
    max_zoom: u8,
    /// Bit `r` set means row `r` is visible.
    visible: DenseBitSet<NodeRowId>,
}

/// Builds both directions of the corpus-wide `(key, rank)` order.
fn key_order(
    codes: &[MortonKey],
    ranks: &[u32],
) -> (Box<IdSlice<KeyOrdinal, BasePosition>>, Box<[KeyOrdinal]>) {
    assert_eq!(codes.len(), ranks.len(), "the key and rank columns align");
    let mut position_of_key: IdVec<KeyOrdinal, BasePosition> =
        (BasePosition::MIN..BasePosition::from_usize(codes.len())).collect();
    position_of_key.sort_unstable_by_key(|&position| {
        let position = position.as_usize();
        (codes[position], ranks[position])
    });

    let mut key_order_of_position = vec![KeyOrdinal::MIN; codes.len()];
    for (ordinal, &position) in position_of_key.iter_enumerated() {
        key_order_of_position[position.as_usize()] = ordinal;
    }

    (
        position_of_key.into_boxed_slice(),
        key_order_of_position.into_boxed_slice(),
    )
}

/// Inverts the row column over its mask domain.
fn positions_of_rows(rows: &[u32], domain: usize) -> Box<IdSlice<NodeRowId, BasePosition>> {
    let mut positions: IdVec<NodeRowId, BasePosition> = IdVec::from_elem(BasePosition::MAX, domain);
    for (position, &row) in rows.iter().enumerate() {
        let slot = positions
            .get_mut(NodeRowId::from_u32(row))
            .expect("rows lie inside the mask domain");
        assert_eq!(*slot, BasePosition::MAX, "the row column is injective");
        *slot = BasePosition::from_usize(position);
    }
    positions.into_boxed_slice()
}

/// Orders base positions by their corpus-wide key ordinal with three stable radix passes.
fn radix_key_order(
    positions: impl IntoIterator<Item = BasePosition>,
    key_order_of_position: &[KeyOrdinal],
) -> Vec<BasePosition> {
    const DIGIT_BITS: u32 = 11;
    const RADIX: usize = 1 << DIGIT_BITS;
    const DIGIT_MASK: u32 = 0x07FF;

    let mut source: Vec<BasePosition> = positions.into_iter().collect();
    let mut target = vec![BasePosition::MIN; source.len()];
    let mut offsets = vec![0_usize; RADIX];

    for shift in [0_u32, DIGIT_BITS, DIGIT_BITS * 2] {
        offsets.fill(0);
        for &position in &source {
            let ordinal = key_order_of_position[position.as_usize()].as_u32();
            offsets[((ordinal >> shift) & DIGIT_MASK) as usize] += 1;
        }

        let mut start = 0_usize;
        for offset in &mut offsets {
            let count = *offset;
            *offset = start;
            start += count;
        }

        for &position in &source {
            let ordinal = key_order_of_position[position.as_usize()].as_u32();
            let digit = ((ordinal >> shift) & DIGIT_MASK) as usize;
            target[offsets[digit]] = position;
            offsets[digit] += 1;
        }
        core::mem::swap(&mut source, &mut target);
    }

    source
}

impl WalkBench {
    /// Builds the corpus and runs the production cascade over it.
    ///
    /// The corpus is eight gaussian clusters over a uniform background, so dense cells stay
    /// populated down to the deepest zooms and descent paths are real. Equal `(points, seed)` pairs
    /// build identical fixtures. The mask starts all-visible.
    ///
    /// # Panics
    ///
    /// This panics when `points` is zero or exceeds the `u32` row domain.
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
        let coordinates = FinitePointField::new(IdSlice::from_raw(&coordinates))
            .expect("the bench coordinates are finite");
        let lod = Lod::build(
            coordinates,
            RankInputs::new(
                IdSlice::from_raw(&importance),
                IdSlice::from_raw(&priority),
                IdSlice::from_raw(&identities),
            )
            .expect("the synthetic columns are equal-length and fit the row domain"),
            seed,
            config,
        )
        .expect("finite synthetic coordinates admit a world frame");

        // The column values cross from the typed lod domains into this instrument's raw u32
        // vocabulary once, at this seam; the scan machinery below reads the raw form, while
        // storage indexed by an id keeps its index domain.
        let row_of_position: Box<[u32]> = lod
            .row_of_position
            .as_raw()
            .iter()
            .map(|&row| {
                u32::try_from(row.as_u64()).expect("bench corpora share the u32 row domain")
            })
            .collect();
        let position_of_row = lod.position_of_row;
        let rank_of_position: Box<[u32]> = lod
            .rank_of_position
            .as_raw()
            .iter()
            .map(|&rank| rank.as_u32())
            .collect();
        let (position_of_key, key_order_of_position) =
            key_order(lod.codes.as_raw(), &rank_of_position);
        let visible = DenseBitSet::new_filled(points);

        Self {
            segments: segments(&lod.fenceposts),
            codes: IdSlice::into_boxed_raw(lod.codes),
            row_of_position,
            position_of_row,
            rank_of_position,
            position_of_key,
            key_order_of_position,
            span: config.span.get(),
            max_zoom: config.max_tile_depth,
            visible,
        }
    }

    /// Builds the instrument over externally supplied cascade artifacts.
    ///
    /// `code_bits` is the bucket-segmented base-order key column as raw key bits; `lengths` the
    /// per-bucket segment lengths in depth order (fewer entries than the bucket table reads as
    /// trailing empty buckets); `row_of_position` the base permutation; `span` and `max_zoom` the
    /// delivery schedule. The mask starts all-visible. Feeding one corpus's real artifacts to both
    /// this instrument and the serving path is what a set-agreement comparison rides.
    ///
    /// The row identity stands in for the importance rank a rank-representative rule reads, so a
    /// delivery over these parts represents each cell by its lowest row id.
    ///
    /// # Panics
    ///
    /// This panics when the lengths overrun the bucket table or disagree with the code count, or
    /// when the columns disagree on length.
    #[must_use]
    pub fn from_parts(
        code_bits: &[u64],
        lengths: &[u64],
        row_of_position: Vec<u32>,
        span: u8,
        max_zoom: u8,
    ) -> Self {
        assert!(
            lengths.len() <= SEGMENTS,
            "the bucket table holds {SEGMENTS} segments",
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
        let codes: Box<[MortonKey]> = code_bits
            .iter()
            .map(|&bits| MortonKey::from_bits(bits))
            .collect();
        let rank_of_position = row_of_position.clone().into_boxed_slice();
        let (position_of_key, key_order_of_position) = key_order(&codes, &rank_of_position);
        let position_of_row = positions_of_rows(&row_of_position, rows);
        let visible = DenseBitSet::new_filled(rows);

        Self {
            codes,
            rank_of_position,
            position_of_row,
            row_of_position: row_of_position.into_boxed_slice(),
            position_of_key,
            key_order_of_position,
            segments,
            span,
            max_zoom,
            visible,
        }
    }

    /// Returns the corpus columns as plain numbers: key bits, rows, and bucket segment bounds.
    ///
    /// The synthetic corpus becomes visitable by an external reference implementation - the mirror
    /// of [`Self::from_parts`].
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
        let mut mask = DenseBitSet::new_empty(rows);
        for row in 0..rows {
            if uniform(&mut rng) < visible {
                mask.insert(NodeRowId::from_usize(row));
            }
        }
        self.visible = mask;
    }

    /// Replaces the mask, hiding whole spatial blocks until the hidden rows meet the quota.
    ///
    /// Blocks are cells drawn at depths 4 through 7; every row inside a drawn cell hides until the
    /// hidden rows reach the `1 - visible` share of the corpus, rounded down to whole rows.
    /// Spatially contiguous hiding is the adversarial mask shape: whole scheduled runs vanish and
    /// fills walk deep.
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
        let mut hidden = DenseBitSet::new_empty(rows);
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
                    let row = NodeRowId::from_u32(self.row_of_position[position]);
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

        let mut mask = DenseBitSet::new_empty(rows);
        for row in 0..rows {
            let row = NodeRowId::from_usize(row);
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
    /// This panics when a row lies beyond the corpus row domain.
    pub fn mask_rows(&mut self, visible: impl IntoIterator<Item = u32>) {
        let mut mask = DenseBitSet::new_empty(self.row_of_position.len());
        for row in visible {
            mask.insert(NodeRowId::from_u32(row));
        }
        self.visible = mask;
    }

    /// Returns the visible keys the tile's cut reaches inside the tile cell, ascending.
    ///
    /// Every visible point whose bucket lies at or below `z + m`: what today's chain delivers
    /// cumulatively for the tile's extent when the mask hides nothing.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn reached(&self, z: u8, x: u32, y: u32) -> Vec<u64> {
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

        let mut keys = Vec::new();
        for range in &ranges[..=usize::from(z + self.span)] {
            for position in range.clone() {
                if self
                    .visible
                    .contains(NodeRowId::from_u32(self.row_of_position[position]))
                {
                    keys.push(self.codes[position].to_bits());
                }
            }
        }
        keys.sort_unstable();

        keys
    }

    /// Returns the tile's scheduled count before masking, which is today's per-tile budget.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid.
    #[must_use]
    pub fn scheduled(&self, z: u8, x: u32, y: u32) -> usize {
        self.budget_of(z, x, y)
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

    /// Returns the cut's span exponent `m`.
    ///
    /// A tile at zoom `z` cuts at depth `z + m`.
    #[must_use]
    pub const fn span(&self) -> u8 {
        self.span
    }

    /// Returns the root-to-deepest descent path through the densest cells.
    ///
    /// Each step descends into the child holding the most points before masking, so the path is one
    /// fixture-determined column a whole mask sweep can share.
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
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn independent(&self, z: u8, x: u32, y: u32) -> Selection {
        let taken = DenseBitSet::new_empty(0);
        let mut delivered = Vec::new();
        self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled)
    }

    /// Delivers one tile behind its recomputed ancestor chain.
    ///
    /// The walk re-derives every ancestor's delivery against the same mask, top down, and the
    /// tile's own fill skips everything the chain took. An ancestor whose fill ends short of budget
    /// spent its subtree's visible pool, so the chain stops there and the tile delivers nothing.
    /// Every descendant extent is a subset of the spent one. [`Selection::scanned`] sums the
    /// chain's scans. The other counts describe the tile itself.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn chained(&self, z: u8, x: u32, y: u32) -> Selection {
        let mut taken = DenseBitSet::new_empty(self.codes.len());
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
                taken.insert(BasePosition::from_u32(position));
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
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn independent_delivery(&self, z: u8, x: u32, y: u32) -> Vec<u32> {
        let taken = DenseBitSet::new_empty(0);
        let mut delivered = Vec::new();
        self.walk(z, x, y, &taken, &mut delivered, FillTarget::Scheduled);
        delivered
    }

    /// Delivers one tile behind its recomputed ancestor chain, returning the delivered positions in
    /// delivery order.
    ///
    /// The chain and its early exit follow [`Self::chained`] exactly; a spent chain returns the
    /// empty delivery.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn chained_delivery(&self, z: u8, x: u32, y: u32) -> Vec<u32> {
        let mut taken = DenseBitSet::new_empty(self.codes.len());
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
                taken.insert(BasePosition::from_u32(position));
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
    /// This panics when the schedule's deepest cut lies beyond the key width.
    #[must_use]
    pub fn pyramid(&self) -> VisibleCellPyramid {
        let mut codes = Vec::with_capacity(self.visible.count());
        for (position, code) in self.codes.iter().enumerate() {
            if self
                .visible
                .contains(NodeRowId::from_u32(self.row_of_position[position]))
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

    /// Builds the Morton-ordered visible column over the whole corpus.
    ///
    /// One sort of the visible key column; the footprint is sixteen bytes per visible row, which
    /// [`VisibleColumn::footprint`] reports.
    #[must_use]
    pub fn column(&self) -> VisibleColumn {
        let mut points = Vec::with_capacity(self.visible.count());
        for position in 0..self.codes.len() {
            self.collect(position, &mut points);
        }
        points.sort_unstable_by_key(|point| point.key);

        VisibleColumn {
            points: points.into_boxed_slice(),
        }
    }

    /// Builds the visible base positions ascending by key.
    ///
    /// This is the leanest per-view artifact that still answers a cell's visible population and
    /// enumerates a grid's occupied cells, at four bytes per visible row. The key of an entry comes
    /// from the corpus-wide base column the position indexes, and its importance rank from the
    /// corpus-wide rank column.
    ///
    /// # Panics
    ///
    /// This panics when the visible rows overrun the `u32` row domain.
    #[must_use]
    pub fn position_column(&self) -> Box<[u32]> {
        let mut positions: Vec<u32> = Vec::with_capacity(self.visible.count());
        for position in 0..self.codes.len() {
            if self
                .visible
                .contains(NodeRowId::from_u32(self.row_of_position[position]))
            {
                positions
                    .push(u32::try_from(position).expect("positions share the u32 row domain"));
            }
        }
        positions.sort_unstable_by_key(|&position| self.codes[position as usize]);

        positions.into_boxed_slice()
    }

    /// Builds the Morton-ordered visible column of one cell from the base column and the mask.
    ///
    /// The gather takes the extent's visible points alone out of the bucket segments the cell
    /// narrows to and sorts them. This is the same column [`Self::column`] holds, restricted to the
    /// cell and computed without a resident per-view artifact. The mask bitmap and the served base
    /// column are its whole input.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn gather(&self, z: u8, x: u32, y: u32) -> VisibleColumn {
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let ranges = if z == 0 {
            self.segments.clone()
        } else {
            self.narrowed(cell_of(z, x, y))
        };

        let mut points = Vec::new();
        for range in ranges {
            for position in range {
                self.collect(position, &mut points);
            }
        }
        points.sort_unstable_by_key(|point| point.key);

        VisibleColumn {
            points: points.into_boxed_slice(),
        }
    }

    /// Appends the position's column entry when its row is visible.
    fn collect(&self, position: usize, points: &mut Vec<VisiblePoint>) {
        if !self
            .visible
            .contains(NodeRowId::from_u32(self.row_of_position[position]))
        {
            return;
        }

        points.push(VisiblePoint {
            key: self.codes[position].to_bits(),
            rank: self.rank_of_position[position],
            position: u32::try_from(position).expect("positions share the u32 row domain"),
        });
    }

    /// Returns the rows the base positions carry, in the order given.
    ///
    /// A delivery names base positions, which address one corpus's column, and the rows those
    /// positions map to are what two corpora over the same view compare on.
    ///
    /// # Panics
    ///
    /// This panics when a position lies beyond the corpus column.
    #[must_use]
    pub fn rows(&self, positions: impl IntoIterator<Item = u32>) -> Vec<u32> {
        positions
            .into_iter()
            .map(|position| self.row_of_position[position as usize])
            .collect()
    }

    /// Returns the visible view as its own corpus, with nothing hidden.
    ///
    /// The visible keys enter the production cascade as a standalone generation at the same deepest
    /// grid, ranked in the relative order they hold here, and sort into the base delivery order a
    /// published generation would carry. The row column keeps this corpus's row identities, so
    /// [`Self::rows`] over either corpus names the same rows.
    ///
    /// A rule whose delivery is a function of the visible view alone delivers equal rows over the
    /// two corpora, tile for tile and in the same order; a rule reading any hidden quantity does
    /// not. That comparison is what the corpus is for.
    ///
    /// # Panics
    ///
    /// This panics when the schedule's deepest cut lies beyond the key width.
    #[must_use]
    pub fn visible_only(&self) -> Self {
        // The gathered columns are the visible-only corpus's row-indexed
        // storage: its own NodeRowId universe, 0..V in gather order.
        let mut keys: IdVec<NodeRowId, MortonKey> = IdVec::with_capacity(self.visible.count());
        let mut rows: IdVec<NodeRowId, u32> = IdVec::with_capacity(self.visible.count());
        let mut ranks: IdVec<NodeRowId, u32> = IdVec::with_capacity(self.visible.count());
        for (position, code) in self.codes.iter().enumerate() {
            let row = self.row_of_position[position];
            if self.visible.contains(NodeRowId::from_u32(row)) {
                keys.push(*code);
                rows.push(row);
                ranks.push(self.rank_of_position[position]);
            }
        }

        let keyed = keys.as_slice();
        let mut row_of_rank: IdVec<ImportanceRank, NodeRowId> = keyed.ids().collect();
        row_of_rank.sort_unstable_by_key(|&entry| ranks[entry]);
        let ranking = Ranking::from_row_of_rank(row_of_rank);

        let deepest = Depth::new(self.max_zoom + self.span)
            .expect("the schedule's cuts lie within the key width");
        let buckets = cascade::buckets(keyed, &ranking, deepest);
        let order = BaseOrder::new(keyed, &buckets, &ranking);

        let mut lengths = [0_usize; SEGMENTS];
        for bucket in buckets.iter() {
            lengths[usize::from(bucket.get())] += 1;
        }
        let mut segments: Ranges = core::array::from_fn(|_| 0..0);
        let mut at = 0_usize;
        for (bucket, &length) in lengths.iter().enumerate() {
            segments[bucket] = at..at + length;
            at += length;
        }

        let mut visible = DenseBitSet::new_empty(self.visible.domain_size());
        for &row in &rows {
            visible.insert(NodeRowId::from_u32(row));
        }

        let codes: Box<[MortonKey]> = order
            .row_of_position
            .iter()
            .map(|&entry| keys[entry])
            .collect();
        let row_of_position: Box<[u32]> = order
            .row_of_position
            .iter()
            .map(|&entry| rows[entry])
            .collect();
        let rank_of_position: Box<[u32]> = order
            .row_of_position
            .iter()
            .map(|&entry| ranks[entry])
            .collect();

        let position_of_row = positions_of_rows(&row_of_position, self.visible.domain_size());
        let (position_of_key, key_order_of_position) = key_order(&codes, &rank_of_position);

        Self {
            codes,
            row_of_position,
            position_of_row,
            rank_of_position,
            position_of_key,
            key_order_of_position,
            segments,
            span: self.span,
            max_zoom: self.max_zoom,
            visible,
        }
    }

    /// Builds the visible view's own generation, bucket-major, with its key index.
    ///
    /// The visible entries cascade alone at [`Depth::MAX`] under the corpus's own importance order
    /// restricted to them, then sort bucket-major and ascending by key inside a bucket. `layout`
    /// chooses whether the keys ride along: [`GenerationLayout::Shared`] recovers each key from the
    /// corpus base column through the entry's position, for four bytes per visible row against
    /// twelve.
    ///
    /// [`ServedGeneration::footprint`] reports the bytes.
    ///
    /// # Panics
    ///
    /// This panics when the visible rows overrun the `u32` row domain.
    #[must_use]
    pub fn generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let (keys, positions, ranks) = self.visible_entries();
        // The visible entries enter the cascade as their own row universe:
        // the pins claim the gather-order NodeRowId domain once.
        let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
        let ranked = IdSlice::<NodeRowId, u32>::from_raw(&ranks);

        let mut row_of_rank: IdVec<ImportanceRank, NodeRowId> = keyed.ids().collect();
        row_of_rank.sort_unstable_by_key(|&entry| ranked[entry]);

        let ranking = Ranking::from_row_of_rank(row_of_rank);
        let buckets = cascade::buckets(keyed, &ranking, Depth::MAX);

        Self::assemble(layout, &keys, &positions, &ranks, buckets.as_raw())
    }

    /// Builds the same generation by neighbour separation instead of a per-depth cascade.
    ///
    /// A point is its cell's representative from the depth at which the cell no longer holds a
    /// better-ranked point on, so its bucket is one past the deepest grid it shares with any
    /// better-ranked visible point, and the key-nearest better-ranked point on either side reaches
    /// that deepest shared grid. Deleting the entries from a key-ordered list in worst-rank-first
    /// order exposes exactly those two neighbours, so two sorts and one linear pass assign every
    /// bucket.
    ///
    /// The assignment equals [`Self::generation`]'s entry for entry; equal keys share every grid,
    /// so a point sharing its key with a better-ranked one takes the catch-all bucket.
    ///
    /// # Panics
    ///
    /// This panics when the visible rows overrun the `u32` row domain.
    #[must_use]
    pub fn separated_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let (keys, positions, ranks) = self.visible_entries();
        let count = keys.len();

        let mut order: Vec<u32> =
            (0..u32::try_from(count).expect("visible rows fit u32")).collect();
        order.sort_unstable_by_key(|&entry| keys[entry as usize]);

        let mut place = vec![0_u32; count];
        for (at, &entry) in order.iter().enumerate() {
            place[entry as usize] = u32::try_from(at).expect("visible rows fit u32");
        }
        let mut worst: Vec<u32> =
            (0..u32::try_from(count).expect("visible rows fit u32")).collect();
        worst.sort_unstable_by_key(|&entry| Reverse(ranks[entry as usize]));

        // The key order as a doubly linked list, `count` standing for "no neighbour".
        let mut before: Vec<usize> = (0..count).map(|at| at.wrapping_sub(1)).collect();
        let mut after: Vec<usize> = (0..count).map(|at| at + 1).collect();
        if let Some(first) = before.first_mut() {
            *first = count;
        }
        if let Some(last) = after.last_mut() {
            *last = count;
        }

        let mut buckets = vec![Depth::MAX; count];
        for &entry in &worst {
            let at = place[entry as usize] as usize;
            let key = keys[entry as usize];

            let mut shared = Depth::MIN;
            let mut separated = true;
            for neighbour in [before[at], after[at]] {
                if neighbour == count {
                    continue;
                }
                separated = false;
                shared = shared.max(key.shared_depth(keys[order[neighbour] as usize]));
            }

            buckets[entry as usize] = if separated {
                Depth::MIN
            } else {
                shared.saturating_add(1)
            };

            let (low, high) = (before[at], after[at]);
            if low != count {
                after[low] = high;
            }
            if high != count {
                before[high] = low;
            }
        }

        Self::assemble(layout, &keys, &positions, &ranks, &buckets)
    }

    /// Builds a served generation from visible positions in `(key, rank)` order.
    fn generation_from_key_order(
        &self,
        layout: GenerationLayout,
        positions: impl IntoIterator<Item = BasePosition>,
    ) -> ServedGeneration {
        let positions: Vec<BasePosition> = positions.into_iter().collect();
        let count = positions.len();
        let buckets = cascade::separation_buckets(
            &positions,
            |&position| self.codes[position.as_usize()],
            |&position| ImportanceRank::from_u32(self.rank_of_position[position.as_usize()]),
        );

        let mut lengths = [0_usize; SEGMENTS];
        for bucket in &buckets {
            lengths[usize::from(bucket.get())] += 1;
        }
        let mut segments: Ranges = core::array::from_fn(|_| 0..0);
        let mut at = 0_usize;
        for (bucket, &length) in lengths.iter().enumerate() {
            segments[bucket] = at..at + length;
            at += length;
        }

        let mut cursors: [usize; SEGMENTS] = core::array::from_fn(|bucket| segments[bucket].start);
        let mut ordered = vec![0_u32; count];
        let mut ascending = vec![0_u32; count];
        let mut inline_keys = match layout {
            GenerationLayout::Inline => Some(vec![0_u64; count]),
            GenerationLayout::Shared => None,
        };
        for (key_ordinal, (&position, bucket)) in positions.iter().zip(&buckets).enumerate() {
            let bucket = usize::from(bucket.get());
            let output = cursors[bucket];
            cursors[bucket] += 1;
            ordered[output] = position.as_u32();
            ascending[key_ordinal] =
                u32::try_from(output).expect("generation entries share the u32 row domain");
            if let Some(keys) = &mut inline_keys {
                keys[output] = self.codes[position.as_usize()].to_bits();
            }
        }

        ServedGeneration {
            positions: ordered.into_boxed_slice(),
            keys: inline_keys.map(Vec::into_boxed_slice),
            segments,
            ascending: ascending.into_boxed_slice(),
        }
    }

    /// Builds the served generation by merging the production buckets' visible runs.
    ///
    /// The base order is 33 `(key, rank)`-ordered runs, one per bucket. Transposing the row mask to
    /// base positions restricts each run without sorting; a 33-way merge then produces visible key
    /// order for the monotonic-stack assignment. For `N` corpus rows and `V` visible rows, this
    /// costs `O(N / 64 + V log 33)` and needs no further corpus-wide index.
    ///
    /// # Panics
    ///
    /// This panics when the corpus columns no longer form aligned permutations of the `u32` row
    /// domain.
    #[must_use]
    pub fn merged_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let mut visible_by_position = DenseBitSet::new_empty(self.codes.len());
        for row in &self.visible {
            visible_by_position.insert(self.position_of_row[row]);
        }
        let base_positions: Vec<BasePosition> = visible_by_position.iter().collect();

        let mut runs: Ranges = core::array::from_fn(|_| 0..0);
        let mut at = 0_usize;
        for (bucket, segment) in self.segments.iter().enumerate() {
            let start = at;
            while at < base_positions.len() && base_positions[at].as_usize() < segment.end {
                debug_assert!(base_positions[at].as_usize() >= segment.start);
                at += 1;
            }
            runs[bucket] = start..at;
        }
        assert_eq!(
            at,
            base_positions.len(),
            "the bucket runs cover every position"
        );

        let mut next: [usize; SEGMENTS] = core::array::from_fn(|bucket| runs[bucket].start);
        let mut heap: BinaryHeap<Reverse<(MortonKey, u32, usize, BasePosition)>> =
            BinaryHeap::new();
        for (bucket, run) in runs.iter().enumerate() {
            if next[bucket] < run.end {
                let position = base_positions[next[bucket]];
                next[bucket] += 1;
                heap.push(Reverse((
                    self.codes[position.as_usize()],
                    self.rank_of_position[position.as_usize()],
                    bucket,
                    position,
                )));
            }
        }

        let mut positions = Vec::with_capacity(base_positions.len());
        while let Some(Reverse((_, _, bucket, position))) = heap.pop() {
            positions.push(position);
            if next[bucket] < runs[bucket].end {
                let position = base_positions[next[bucket]];
                next[bucket] += 1;
                heap.push(Reverse((
                    self.codes[position.as_usize()],
                    self.rank_of_position[position.as_usize()],
                    bucket,
                    position,
                )));
            }
        }

        self.generation_from_key_order(layout, positions)
    }

    /// Builds the served generation by filtering a shared corpus-wide key order.
    ///
    /// The filter performs no comparison sort. For `N` corpus rows and `V` visible rows, it scans
    /// `N` positions and performs `O(V)` stack and distribution work.
    #[must_use]
    pub fn filtered_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let positions = self.position_of_key.iter().copied().filter(|&position| {
            self.visible.contains(NodeRowId::from_u32(
                self.row_of_position[position.as_usize()],
            ))
        });
        self.generation_from_key_order(layout, positions)
    }

    /// Builds the served generation by transposing the visible mask into key order.
    ///
    /// Each visible row sets its shared key ordinal in a temporary bit set; iterating that set is
    /// the visible restriction of `(key, rank)` order. One monotonic-stack pass then finds both
    /// nearest better-ranked neighbours, and one counting distribution produces bucket-major order.
    /// For `N` corpus rows and `V` visible rows, this costs `O(N / 64 + V)`.
    #[must_use]
    pub fn indexed_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let mut visible_by_key = DenseBitSet::new_empty(self.codes.len());
        for row in &self.visible {
            let position = self.position_of_row[row];
            visible_by_key.insert(self.key_order_of_position[position.as_usize()]);
        }
        let positions = visible_by_key
            .iter()
            .map(|ordinal| self.position_of_key[ordinal]);
        self.generation_from_key_order(layout, positions)
    }

    /// Builds the served generation by radix-ordering the visible key ordinals.
    ///
    /// This form needs the inverse key ordinal alone, rather than both directions of the shared key
    /// order. Its mask iteration costs `O(N / 64 + V)` and its three radix passes, monotonic stack,
    /// and bucket distribution each cost `O(V)`.
    #[must_use]
    pub fn radix_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let positions = self.visible.iter().map(|row| self.position_of_row[row]);
        let positions = radix_key_order(positions, &self.key_order_of_position);
        self.generation_from_key_order(layout, positions)
    }

    /// Counts surviving entries that moved shallower or deeper under a mask.
    ///
    /// `full` must cover this instrument's whole corpus and `masked` its current visible view. The
    /// returned pair is `(shallower, deeper)`.
    ///
    /// # Panics
    ///
    /// This panics when either artifact covers a different corpus or mask.
    #[must_use]
    pub fn bucket_movements(
        &self,
        full: &ServedGeneration,
        masked: &ServedGeneration,
    ) -> (usize, usize) {
        assert_eq!(
            full.len(),
            self.codes.len(),
            "the full artifact covers the corpus"
        );
        assert_eq!(
            masked.len(),
            self.visible.count(),
            "the masked artifact covers the visible view",
        );

        let mut full_buckets = vec![u8::MAX; self.codes.len()];
        for (bucket, segment) in full.segments.iter().enumerate() {
            let bucket = u8::try_from(bucket).expect("segment ordinals lie in the depth domain");
            for &position in &full.positions[segment.clone()] {
                full_buckets[position as usize] = bucket;
            }
        }

        let mut shallower = 0_usize;
        let mut deeper = 0_usize;
        for (bucket, segment) in masked.segments.iter().enumerate() {
            let bucket = u8::try_from(bucket).expect("segment ordinals lie in the depth domain");
            for &position in &masked.positions[segment.clone()] {
                let full_bucket = full_buckets[position as usize];
                assert_ne!(
                    full_bucket,
                    u8::MAX,
                    "the full artifact contains every position"
                );
                shallower += usize::from(bucket < full_bucket);
                deeper += usize::from(bucket > full_bucket);
            }
        }

        (shallower, deeper)
    }

    /// Returns the visible entries in base order.
    ///
    /// The keys, base positions, and importance ranks come out as three aligned columns.
    fn visible_entries(&self) -> (Vec<MortonKey>, Vec<u32>, Vec<u32>) {
        let mut keys: Vec<MortonKey> = Vec::with_capacity(self.visible.count());
        let mut positions: Vec<u32> = Vec::with_capacity(self.visible.count());
        let mut ranks: Vec<u32> = Vec::with_capacity(self.visible.count());

        for (position, code) in self.codes.iter().enumerate() {
            if self
                .visible
                .contains(NodeRowId::from_u32(self.row_of_position[position]))
            {
                keys.push(*code);
                positions
                    .push(u32::try_from(position).expect("positions share the u32 row domain"));
                ranks.push(self.rank_of_position[position]);
            }
        }

        (keys, positions, ranks)
    }

    /// Orders the visible entries into a served generation under one bucket assignment.
    fn assemble(
        layout: GenerationLayout,
        keys: &[MortonKey],
        positions: &[u32],
        ranks: &[u32],
        buckets: &[Depth],
    ) -> ServedGeneration {
        let count = u32::try_from(keys.len()).expect("visible rows share the u32 row domain");
        let mut entries: Vec<u32> = (0..count).collect();
        entries.sort_unstable_by_key(|&entry| {
            let entry = entry as usize;
            (buckets[entry], keys[entry], ranks[entry])
        });

        let mut lengths = [0_usize; SEGMENTS];
        for bucket in buckets {
            lengths[usize::from(bucket.get())] += 1;
        }
        let mut segments: Ranges = core::array::from_fn(|_| 0..0);
        let mut at = 0_usize;
        for (bucket, &length) in lengths.iter().enumerate() {
            segments[bucket] = at..at + length;
            at += length;
        }

        let ordered: Box<[u32]> = entries
            .iter()
            .map(|&entry| positions[entry as usize])
            .collect();
        let mut ascending: Vec<u32> = (0..count).collect();
        ascending.sort_unstable_by_key(|&index| keys[entries[index as usize] as usize]);

        ServedGeneration {
            keys: match layout {
                GenerationLayout::Inline => Some(
                    entries
                        .iter()
                        .map(|&entry| keys[entry as usize].to_bits())
                        .collect(),
                ),
                GenerationLayout::Shared => None,
            },
            positions: ordered,
            segments,
            ascending: ascending.into_boxed_slice(),
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
    /// This panics when the schedule's deepest cut lies beyond the key width.
    #[must_use]
    pub fn visible_cascade(&self, order: VisibleRankOrder) -> VisibleCascade {
        let mut keys = Vec::with_capacity(self.visible.count());
        for (position, code) in self.codes.iter().enumerate() {
            if self
                .visible
                .contains(NodeRowId::from_u32(self.row_of_position[position]))
            {
                keys.push(*code);
            }
        }

        let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
        let row_of_rank: IdVec<ImportanceRank, NodeRowId> = match order {
            VisibleRankOrder::Base => keyed.ids().collect(),
            VisibleRankOrder::Reversed => keyed.ids().rev().collect(),
        };
        let ranking = Ranking::from_row_of_rank(row_of_rank);

        let deepest = Depth::new(self.max_zoom + self.span)
            .expect("the schedule's cuts lie within the key width");
        let buckets = cascade::buckets(keyed, &ranking, deepest);

        let mut points: Vec<(u64, u8)> = keys
            .iter()
            .zip(buckets.iter())
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
    /// The chain, the per-level order, and the early exit match [`Self::chained`].
    /// [`FillRule::Unmasked`] reproduces that variant's counts exactly. [`Selection::budget`] holds
    /// the tile's own target under `rule`.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn deliver(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        view: VisibleView<'_>,
    ) -> Selection {
        let mut delivered = Vec::new();
        self.chain(
            rule,
            z,
            x,
            y,
            view,
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
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn delivery(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        view: VisibleView<'_>,
    ) -> Vec<u32> {
        let mut delivered = Vec::new();
        self.chain(
            rule,
            z,
            x,
            y,
            view,
            ChainBuffers {
                own: &mut delivered,
                inside: None,
            },
        );
        delivered
    }

    /// Delivers one tile and returns every chain delivery inside the tile cell.
    ///
    /// Ancestor deliveries first, in chain order, then the tile's own: what a client holds for the
    /// tile's extent once the descent reaches it.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn cumulative_delivery(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        view: VisibleView<'_>,
    ) -> Vec<u32> {
        let mut delivered = Vec::new();
        let mut inside = Vec::new();
        self.chain(
            rule,
            z,
            x,
            y,
            view,
            ChainBuffers {
                own: &mut delivered,
                inside: Some(&mut inside),
            },
        );
        inside.extend_from_slice(&delivered);

        inside
    }

    /// Returns the depth-`depth` cells inside the tile cell holding a visible point.
    ///
    /// Built by one pass over the whole corpus under the current mask, independent of every
    /// artifact a delivery reads.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn occupied_cells(&self, z: u8, x: u32, y: u32, depth: Depth) -> HashSet<u64> {
        let cell = cell_of(z, x, y);
        let mut cells = HashSet::new();
        for (position, code) in self.codes.iter().enumerate() {
            if cell.contains(*code)
                && self
                    .visible
                    .contains(NodeRowId::from_u32(self.row_of_position[position]))
            {
                cells.insert(code.prefix(depth));
            }
        }

        cells
    }

    /// Audits one tile's chain against the visible cells its cut resolves.
    ///
    /// The delivery runs exactly as [`Self::deliver`] does; the audit additionally counts the
    /// cut-depth cells the chain's deliveries inside the tile cell occupy, so a target's count and
    /// the coverage it achieves are separate numbers.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn audit(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        view: VisibleView<'_>,
    ) -> ChainAudit {
        let mut delivered = Vec::new();
        let mut inside = Vec::new();
        let chain = self.chain(
            rule,
            z,
            x,
            y,
            view,
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
            refined: chain.refined,
            deepened: chain.deepened,
            cumulative_cells,
            spent: chain.spent,
            dry: delivered < own.budget,
            scanned: own.scanned,
        }
    }

    /// Delivers one tile behind its chain, recording the chain's deliveries inside the tile cell.
    ///
    /// The rank-representative rules run their own engine over the visible column; the count-based
    /// rules run the bucket walk.
    fn chain(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        view: VisibleView<'_>,
        buffers: ChainBuffers<'_>,
    ) -> ChainOutcome {
        if let Some(plan) = rank_plan(rule) {
            return self.rank_chain(plan, z, x, y, view.column, buffers);
        }

        let pyramid = view.pyramid;
        let ChainBuffers { own, mut inside } = buffers;
        let key = cell_of(z, x, y).min_key();
        let mut taken = DenseBitSet::new_empty(self.codes.len());
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
                taken.insert(BasePosition::from_u32(position));
                let depth = self.codes[position as usize].shared_depth(key).get().min(z);
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
            return ChainOutcome {
                own: Selection {
                    budget: spent_budget(&target, self.budget_of(z, x, y), entry),
                    natural: 0,
                    tail: 0,
                    scanned,
                },
                covered,
                inherited,
                spent,
                refined: 0,
                deepened: 0,
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
            refined: 0,
            deepened: 0,
        }
    }

    /// Delivers one tile behind its chain by representing cells, not by filling a count.
    ///
    /// Every level resolves the cells of its own grid and delivers the best-ranked visible point of
    /// each cell no chain delivery already sits in, ascending by cell index. The grid is the level
    /// cut under [`RankPlan::Coarse`] and the finest grid the budget admits under
    /// [`RankPlan::Refined`]. Nothing read here is a bucket, a hidden row, or a count derived from
    /// one, so the delivered rows are a function of the visible view alone.
    fn rank_chain(
        &self,
        plan: RankPlan,
        z: u8,
        x: u32,
        y: u32,
        column: &VisibleColumn,
        buffers: ChainBuffers<'_>,
    ) -> ChainOutcome {
        let ChainBuffers { own, mut inside } = buffers;
        let cell = cell_of(z, x, y);
        let mut scratch = RankScratch::default();
        // The chain's deliveries so far, ascending by key: what a cell counts as represented.
        let mut represented: Vec<u64> = Vec::new();
        let mut level_out: Vec<u32> = Vec::new();
        let mut scanned = 0_usize;
        let mut inherited = 0_usize;

        for level in 0..z {
            let shift = z - level;
            level_out.clear();
            let step = self.rank_level(
                plan,
                RankLevel {
                    address: (level, x >> shift, y >> shift),
                    column,
                    represented: &represented,
                    scratch: &mut scratch,
                    out: &mut level_out,
                },
            );
            scanned += step.scanned;

            for &position in &level_out {
                let code = self.codes[position as usize];
                if cell.contains(code) {
                    inherited += 1;
                    if let Some(inside) = inside.as_deref_mut() {
                        inside.push(position);
                    }
                }
            }
            merge_keys(
                &mut represented,
                level_out.iter().map(|&position| {
                    self.codes[usize::try_from(position).expect("positions fit usize")].to_bits()
                }),
            );
        }

        let step = self.rank_level(
            plan,
            RankLevel {
                address: (z, x, y),
                column,
                represented: &represented,
                scratch: &mut scratch,
                out: own,
            },
        );

        ChainOutcome {
            own: Selection {
                budget: step.target,
                natural: step.delivered,
                tail: 0,
                scanned: scanned + step.scanned,
            },
            covered: column.coverage(cell, self.cut_of(z)),
            inherited,
            spent: false,
            refined: step.refined,
            deepened: step.deepened,
        }
    }

    /// Plans one level's delivered grid and delivers its representatives.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    fn rank_level(&self, plan: RankPlan, level: RankLevel<'_>) -> RankStep {
        let RankLevel {
            address: (z, x, y),
            column,
            represented,
            scratch,
            out,
        } = level;
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let cell = cell_of(z, x, y);
        let cut = self.cut_of(z);
        let range = column.range(cell);
        if range.is_empty() {
            return RankStep::default();
        }

        let mut cells = core::mem::take(&mut scratch.cells);
        let mut depth = cut;
        column.split(range.clone(), depth, &mut cells);
        let mut target = needing(column, &cells, represented, depth);
        let mut scanned = cells.len();
        let mut deepened = 0_usize;

        if let RankPlan::Refined(refinement) = plan {
            let budget = match refinement.budget {
                DotBudget::Constant(budget) => budget,
                DotBudget::Scheduled => self.budget_of(z, x, y),
            };
            // Whole levels first: the coarsest grid stays the floor, so a level whose cut alone
            // overruns the budget still delivers the cut.
            while depth < Depth::MAX && cells.len() < range.len() {
                let finer =
                    Depth::new(depth.get() + 1).expect("a depth below the maximum has a successor");
                column.split(range.clone(), finer, &mut scratch.finer);
                let wanted = needing(column, &scratch.finer, represented, finer);
                scanned += scratch.finer.len();
                if wanted > budget {
                    break;
                }

                depth = finer;
                target = wanted;
                core::mem::swap(&mut cells, &mut scratch.finer);
            }

            if refinement.order != RefineOrder::Whole && depth < Depth::MAX {
                let finer =
                    Depth::new(depth.get() + 1).expect("a depth below the maximum has a successor");
                let deepening = rank_deepen(
                    (refinement.order, budget.saturating_sub(target)),
                    column,
                    represented,
                    &cells,
                    (depth, finer),
                    scratch,
                );
                target += deepening.0;
                deepened = deepening.1;
                scanned += deepening.2;
            }
        }

        let finer = Depth::new(depth.get().saturating_add(1).min(Depth::MAX.get()))
            .expect("the clamped successor lies within the key width");
        let mut delivered = 0_usize;
        for (index, leaf) in cells.iter().enumerate() {
            if scratch.split.get(index).copied().unwrap_or(false) {
                column.split(leaf.clone(), finer, &mut scratch.children);
                scanned += scratch.children.len();
                for child in &scratch.children {
                    scanned += child.len();
                    delivered +=
                        usize::from(represent(column, child.clone(), represented, finer, out));
                }
            } else {
                scanned += leaf.len();
                delivered += usize::from(represent(column, leaf.clone(), represented, depth, out));
            }
        }

        scratch.cells = cells;
        scratch.split.clear();
        RankStep {
            target,
            delivered,
            refined: depth.get() - cut.get(),
            deepened,
            scanned,
        }
    }

    /// Delivers one tile under a rank-representative rule out of a served generation.
    ///
    /// The rule, the chain, and the delivered sequence are [`Self::deliver`]'s; the work is range
    /// reads over the generation rather than a scan of each cell.
    ///
    /// # Panics
    ///
    /// This panics when `rule` is not a rank-representative rule, or when the coordinate lies off
    /// the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn served_deliver(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Selection {
        let mut delivered = Vec::new();
        self.served_chain(
            served_plan(rule),
            z,
            x,
            y,
            generation,
            ChainBuffers {
                own: &mut delivered,
                inside: None,
            },
        )
        .own
    }

    /// Delivers one tile out of a served generation, returning the positions in delivery order.
    ///
    /// # Panics
    ///
    /// This panics when `rule` is not a rank-representative rule, or when the coordinate lies off
    /// the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn served_delivery(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        let mut delivered = Vec::new();
        self.served_chain(
            served_plan(rule),
            z,
            x,
            y,
            generation,
            ChainBuffers {
                own: &mut delivered,
                inside: None,
            },
        );
        delivered
    }

    /// Delivers one tile out of a served generation and returns every chain delivery inside the
    /// tile cell.
    ///
    /// # Panics
    ///
    /// This panics when `rule` is not a rank-representative rule, or when the coordinate lies off
    /// the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn served_cumulative_delivery(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        let mut delivered = Vec::new();
        let mut inside = Vec::new();
        self.served_chain(
            served_plan(rule),
            z,
            x,
            y,
            generation,
            ChainBuffers {
                own: &mut delivered,
                inside: Some(&mut inside),
            },
        );
        inside.extend_from_slice(&delivered);

        inside
    }

    /// Audits one tile's served chain against the visible cells its cut resolves.
    ///
    /// Every count is [`Self::audit`]'s; [`ChainAudit::scanned`] counts generation entries read in
    /// place of candidate positions examined.
    ///
    /// # Panics
    ///
    /// This panics when `rule` is not a rank-representative rule, or when the coordinate lies off
    /// the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn served_audit(
        &self,
        rule: FillRule,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> ChainAudit {
        let mut delivered = Vec::new();
        let mut inside = Vec::new();
        let chain = self.served_chain(
            served_plan(rule),
            z,
            x,
            y,
            generation,
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
            refined: chain.refined,
            deepened: chain.deepened,
            cumulative_cells,
            spent: chain.spent,
            dry: delivered < own.budget,
            scanned: own.scanned,
        }
    }

    /// Reads one extent's depth-`depth` representatives out of a served generation.
    ///
    /// The base positions of the buckets-at-or-below-`depth` entries inside the tile cell,
    /// ascending by key: one point per depth-`depth` cell of the extent holding visible content,
    /// each its cell's best-ranked visible point.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid, beyond the schedule's deepest zoom, or
    /// when `depth` lies above the tile cell's own depth.
    #[must_use]
    pub fn served_representatives(
        &self,
        z: u8,
        x: u32,
        y: u32,
        depth: Depth,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let cell = cell_of(z, x, y);
        assert!(
            cell.depth().get() <= depth.get(),
            "a cell at depth {} holds no depth-{} cells",
            cell.depth().get(),
            depth.get(),
        );
        let ranges = generation.narrowed(cell, &generation.segments, &self.codes);
        let mut scratch = ServedScratch::default();
        self.represented_cells(generation, &ranges, depth, &mut scratch);

        scratch
            .candidates
            .iter()
            .map(|&(_, position)| position)
            .collect()
    }

    /// Returns one zoom's public uniform-grid depth.
    ///
    /// The grid is `d(z) = z + m + k`, where `m` is the schedule span and `k` is
    /// `additional_depth`. The result clamps to [`Depth::MAX`].
    ///
    /// # Panics
    ///
    /// This panics when `z` lies beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_grid_depth(&self, z: u8, additional_depth: u8) -> Depth {
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        Depth::new(z)
            .expect("the asserted zoom lies within the key width")
            .saturating_add(self.span)
            .saturating_add(additional_depth)
    }

    // Reads either one delta or the cumulative prefix directly in scope-bucket order.
    fn uniform_positions(
        &self,
        address: (u8, u32, u32),
        depths: (u8, u8),
        generation: &ServedGeneration,
        cumulative: bool,
    ) -> Vec<u32> {
        let (z, x, y) = address;
        let (additional_depth, previous_additional_depth) = depths;
        let depth = self.uniform_grid_depth(z, additional_depth);
        let ranges = if z == 0 {
            generation.segments.clone()
        } else {
            generation.narrowed(cell_of(z, x, y), &generation.segments, &self.codes)
        };
        let first = if cumulative || z == 0 {
            0
        } else {
            usize::from(
                self.uniform_grid_depth(z - 1, previous_additional_depth)
                    .get(),
            ) + 1
        };
        let last = usize::from(depth.get());
        if first > last {
            return Vec::new();
        }

        let capacity = ranges[first..=last]
            .iter()
            .map(ExactSizeIterator::len)
            .sum();
        let mut delivered = Vec::with_capacity(capacity);
        for range in &ranges[first..=last] {
            delivered.extend_from_slice(&generation.positions[range.clone()]);
        }

        delivered
    }

    /// Delivers one tile from a public uniform grid in scope-bucket order.
    ///
    /// Every zoom uses the same `additional_depth`, so consecutive levels read consecutive buckets
    /// of the visible-only generation. A non-root delta is one bucket; the root is the prefix
    /// through [`Self::uniform_grid_depth`].
    ///
    /// Before [`Depth::MAX`], accumulating these deltas gives exactly one best-ranked visible point
    /// per occupied cell of the public grid. At [`Depth::MAX`], the catch-all bucket also carries
    /// entries sharing an exact key.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_delivery(
        &self,
        additional_depth: u8,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        self.uniform_positions(
            (z, x, y),
            (additional_depth, additional_depth),
            generation,
            false,
        )
    }

    /// Accumulates a public uniform grid inside one tile in scope-bucket order.
    ///
    /// The result is the visible-only generation prefix through [`Self::uniform_grid_depth`],
    /// narrowed to the tile cell. Accumulating [`Self::uniform_delivery`] down the tile's ancestor
    /// chain yields the same set.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_cumulative_delivery(
        &self,
        additional_depth: u8,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        self.uniform_positions(
            (z, x, y),
            (additional_depth, additional_depth),
            generation,
            true,
        )
    }

    /// Returns the grid depth of a public one-level refinement step.
    ///
    /// The grid is the cut below `refine_from_zoom`, one level finer from that zoom onward, and
    /// [`Depth::MAX`] at the terminal zoom.
    ///
    /// # Panics
    ///
    /// This panics when `z` lies beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_step_grid_depth(&self, refine_from_zoom: u8, z: u8) -> Depth {
        let additional_depth = if z == self.max_zoom {
            Depth::MAX.get().saturating_sub(z.saturating_add(self.span))
        } else {
            u8::from(z >= refine_from_zoom)
        };
        self.uniform_grid_depth(z, additional_depth)
    }

    /// Delivers one tile from a public one-level refinement step.
    ///
    /// Zooms below `refine_from_zoom` use the cut grid. That zoom and every later regular zoom use
    /// one additional level globally. The transition delta reads two consecutive scope buckets;
    /// later deltas read one. The deepest zoom reads through [`Depth::MAX`] so the terminal tile
    /// keeps the cascade's catch-all completeness. Delivery remains scope-bucket ordered
    /// throughout.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_step_delivery(
        &self,
        refine_from_zoom: u8,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        let additional_depth =
            self.uniform_step_grid_depth(refine_from_zoom, z).get() - z - self.span;
        let previous_additional_depth = if z == 0 {
            0
        } else {
            self.uniform_step_grid_depth(refine_from_zoom, z - 1).get() - (z - 1) - self.span
        };
        self.uniform_positions(
            (z, x, y),
            (additional_depth, previous_additional_depth),
            generation,
            false,
        )
    }

    /// Accumulates a public one-level refinement step inside one tile.
    ///
    /// The result is the visible-only generation prefix reaching the cut below `refine_from_zoom`,
    /// one additional level from that zoom onward, and the catch-all at the deepest zoom.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn uniform_step_cumulative_delivery(
        &self,
        refine_from_zoom: u8,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
    ) -> Vec<u32> {
        let additional_depth =
            self.uniform_step_grid_depth(refine_from_zoom, z).get() - z - self.span;
        self.uniform_positions(
            (z, x, y),
            (additional_depth, additional_depth),
            generation,
            true,
        )
    }

    /// Delivers one tile behind its chain out of a served generation.
    ///
    /// The chain is [`Self::rank_chain`]'s: every level resolves its own grid and delivers the
    /// best-ranked visible point of each cell no chain delivery already sits in, ascending by cell
    /// index.
    fn served_chain(
        &self,
        plan: RankPlan,
        z: u8,
        x: u32,
        y: u32,
        generation: &ServedGeneration,
        buffers: ChainBuffers<'_>,
    ) -> ChainOutcome {
        let ChainBuffers { own, mut inside } = buffers;
        let cell = cell_of(z, x, y);
        let mut scratch = ServedScratch::default();
        // The chain's deliveries so far, ascending: what a cell counts as represented.
        let mut represented: Vec<u64> = Vec::new();
        let mut merged: Vec<u64> = Vec::new();
        let mut run: Vec<u64> = Vec::new();
        let mut level_out: Vec<u32> = Vec::new();
        let mut ranges = generation.segments.clone();
        let mut scanned = 0_usize;
        let mut inherited = 0_usize;

        for level in 0..z {
            let shift = z - level;
            let (level_x, level_y) = (x >> shift, y >> shift);
            ranges = generation.narrowed(cell_of(level, level_x, level_y), &ranges, &self.codes);
            level_out.clear();
            let step = self.served_level(
                plan,
                ServedLevel {
                    address: (level, level_x, level_y),
                    generation,
                    ranges: &ranges,
                    represented: &represented,
                    scratch: &mut scratch,
                    out: &mut level_out,
                },
            );
            scanned += step.scanned;

            run.clear();
            for &position in &level_out {
                let code = self.codes[position as usize];
                run.push(code.to_bits());
                if cell.contains(code) {
                    inherited += 1;
                    if let Some(inside) = inside.as_deref_mut() {
                        inside.push(position);
                    }
                }
            }
            merge_ascending(&mut represented, &mut merged, &run);
            // Every later level's extent lies inside the next one, so a key outside it can never
            // sit in a cell a later level asks about.
            retain_cell(
                &mut represented,
                cell_of(level + 1, x >> (shift - 1), y >> (shift - 1)),
            );
        }

        ranges = generation.narrowed(cell, &ranges, &self.codes);
        let step = self.served_level(
            plan,
            ServedLevel {
                address: (z, x, y),
                generation,
                ranges: &ranges,
                represented: &represented,
                scratch: &mut scratch,
                out: own,
            },
        );

        ChainOutcome {
            own: Selection {
                budget: step.target,
                natural: step.delivered,
                tail: 0,
                scanned: scanned + step.scanned,
            },
            covered: reach(&ranges, self.cut_of(z)),
            inherited,
            spent: false,
            refined: step.refined,
            deepened: step.deepened,
        }
    }

    /// Plans one level's delivered grid out of range reads and delivers its representatives.
    ///
    /// The plan reads three quantities off the generation without scanning the extent. The lengths
    /// of the buckets-at-or-below-depth ranges count the cells of a grid, the length of the one
    /// bucket below a cell counts its children, and one search of the key index answers a cell's
    /// population. The delivered points are the ranges themselves.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    fn served_level(&self, plan: RankPlan, level: ServedLevel<'_>) -> RankStep {
        let ServedLevel {
            address,
            generation,
            ranges,
            represented,
            scratch,
            out,
        } = level;
        let (z, x, y) = address;
        assert!(
            z <= self.max_zoom,
            "the schedule serves zooms up to {}",
            self.max_zoom,
        );
        let cell = cell_of(z, x, y);
        let cut = self.cut_of(z);
        let extent = ServedExtent {
            ranges: ranges.clone(),
            held: inside_cell(represented, cell),
            cell,
        };
        if extent.population() == 0 {
            return RankStep::default();
        }

        let (depth, budget, mut reads) = self.served_grid(plan, address, &extent, cut);
        reads += 2 * SEGMENTS;
        reads += self.represented_cells(generation, &extent.ranges, depth, scratch);
        let cells = scratch.candidates.len();
        scratch.occupied.clear();
        scratch.occupied.resize(cells, false);
        mark_represented(
            &scratch.candidates,
            extent.held,
            depth,
            &mut scratch.occupied,
        );
        let mut target = cells - scratch.occupied.iter().filter(|&&held| held).count();
        scratch.split.clear();
        scratch.split.resize(cells, false);

        let finer = Depth::new(depth.get().saturating_add(1).min(Depth::MAX.get()))
            .expect("the clamped successor lies within the key width");
        let mut deepened = 0_usize;
        if let RankPlan::Refined(refinement) = plan
            && refinement.order != RefineOrder::Whole
            && depth < Depth::MAX
        {
            let spendable = budget.saturating_sub(target);
            let deepening = self.served_deepen(
                (refinement.order, spendable),
                generation,
                &extent,
                (depth, finer),
                scratch,
            );
            target += deepening.0;
            deepened = deepening.1;
            reads += deepening.2;
        }

        let delivered = deliver_grid(extent.held, (depth, finer), cells, scratch, out);

        RankStep {
            target,
            delivered,
            refined: depth.get() - cut.get(),
            deepened,
            scanned: reads,
        }
    }

    /// Returns the finest grid one level's budget admits, that budget, and the entries the search
    /// read.
    ///
    /// The coarsest grid stays the floor, so a level whose cut depth alone overruns the budget
    /// still delivers the cut. Each candidate grid costs one range length and one pass over the
    /// chain's keys inside the extent: the cells of a grid are the entries at or below its depth,
    /// so the search never looks at a point.
    fn served_grid(
        &self,
        plan: RankPlan,
        address: (u8, u32, u32),
        extent: &ServedExtent<'_>,
        cut: Depth,
    ) -> (Depth, usize, usize) {
        let RankPlan::Refined(refinement) = plan else {
            return (cut, 0, 0);
        };

        let (z, x, y) = address;
        let budget = match refinement.budget {
            DotBudget::Constant(budget) => budget,
            DotBudget::Scheduled => self.budget_of(z, x, y),
        };
        let population = extent.population();
        let mut depth = cut;
        let mut covered = reach(&extent.ranges, cut);
        let mut reads = 0_usize;
        while depth < Depth::MAX && covered < population {
            let finer =
                Depth::new(depth.get() + 1).expect("a depth below the maximum has a successor");
            let reached = covered + extent.ranges[usize::from(finer.get())].len();
            reads += extent.held.len();
            if reached - distinct_prefixes(extent.held, finer) > budget {
                break;
            }

            depth = finer;
            covered = reached;
        }

        (depth, budget, reads)
    }

    /// Marks the grid cells a partial refinement takes one level further.
    ///
    /// Returns the count the deepening adds to the level's target, the cells it deepened, and the
    /// entries it read. A cell's children are the one bucket below the grid plus the cell's own
    /// representative, one range length; its population is one search of the key index, which a
    /// level with nothing left to spend never makes - what remains to deepen there costs no budget
    /// in any order.
    fn served_deepen(
        &self,
        spending: (RefineOrder, usize),
        generation: &ServedGeneration,
        extent: &ServedExtent<'_>,
        grid: (Depth, Depth),
        scratch: &mut ServedScratch,
    ) -> (usize, usize, usize) {
        let (order_of, mut remaining) = spending;
        let (depth, finer) = grid;
        let cells = scratch.candidates.len();
        // A level with nothing left to spend can only deepen a cell whose every child a chain
        // delivery already sits in, so a level whose grid the chain has not reached deepens
        // nothing and needs neither the children nor the populations.
        if remaining == 0 && !scratch.occupied.contains(&true) {
            return (0, 0, 0);
        }

        let run = extent.ranges[usize::from(finer.get())].clone();
        let mut reads = run.len() + extent.held.len();
        scratch.finer.clear();
        scratch.finer.extend(run.map(|index| {
            (
                generation.key(index, &self.codes),
                generation.positions[index],
            )
        }));
        children_of(
            &scratch.candidates,
            &scratch.finer,
            extent.held,
            grid,
            &mut scratch.children,
            &mut scratch.wanted,
        );

        let mut order = core::mem::take(&mut scratch.order);
        order.clear();
        order.extend(0..cells);
        if remaining > 0 && order_of == RefineOrder::Population {
            reads += self.populations(generation, extent.cell, depth, cells, scratch);
            let populations = &scratch.populations;
            order.sort_by_key(|&index| (Reverse(populations[index]), index));
        }

        let mut growth = 0_usize;
        let mut deepened = 0_usize;
        for &index in &order {
            if scratch.children[index] < 2 {
                continue;
            }
            let wanted = scratch.wanted[index] - usize::from(!scratch.occupied[index]);
            if wanted > remaining {
                continue;
            }

            remaining -= wanted;
            growth += wanted;
            deepened += 1;
            scratch.split[index] = true;
        }
        scratch.order = order;

        (growth, deepened, reads)
    }

    /// Reads the extent's depth-`depth` representatives into the scratch, ascending by key.
    ///
    /// Returns the generation entries the read touched.
    fn represented_cells(
        &self,
        generation: &ServedGeneration,
        ranges: &Ranges,
        depth: Depth,
        scratch: &mut ServedScratch,
    ) -> usize {
        scratch.candidates.clear();
        let mut reads = 0_usize;
        for bucket in &ranges[..=usize::from(depth.get())] {
            if bucket.is_empty() {
                continue;
            }

            reads += bucket.len() + scratch.candidates.len();
            merge_entries(
                &mut scratch.candidates,
                &mut scratch.merged,
                generation,
                bucket.clone(),
                &self.codes,
            );
        }
        // Equal keys share every cell, so the finest grid's catch-all bucket can repeat a cell's
        // representative; the smallest bucket sorts first, which is the best-ranked one.
        scratch.candidates.dedup_by_key(|&mut (key, _)| key);

        reads
    }

    /// Reads each depth-`depth` cell's visible population out of the generation's key index.
    ///
    /// Returns the index entries the searches probed.
    fn populations(
        &self,
        generation: &ServedGeneration,
        cell: MortonCell,
        depth: Depth,
        cells: usize,
        scratch: &mut ServedScratch,
    ) -> usize {
        let extent = generation.ascending_range(cell, &self.codes);
        scratch.populations.clear();
        scratch.populations.resize(cells, 0);

        let mut at = extent.start;
        let mut probes = 0_usize;
        for population in &mut scratch.populations {
            let (end, steps) = generation.ascending_cell_end(at, extent.end, depth, &self.codes);
            *population = end - at;
            probes += steps;
            at = end;
        }

        probes
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
    ///
    /// A function of the corpus and the tile address alone: no mask enters it.
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
    /// This panics when the coordinate lies off the grid or beyond the schedule's deepest zoom.
    #[must_use]
    pub fn crowding(&self, z: u8, x: u32, y: u32) -> Crowding {
        let mut taken = DenseBitSet::new_empty(self.codes.len());
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
                taken.insert(BasePosition::from_u32(position));
            }
        }

        delivered.clear();
        let none = DenseBitSet::new_empty(0);
        self.walk(z, x, y, &none, &mut delivered, FillTarget::Scheduled);

        let duplicates = delivered
            .iter()
            .filter(|&&position| taken.contains(BasePosition::from_u32(position)))
            .count();
        Crowding {
            delivered: delivered.len(),
            duplicates,
        }
    }

    /// Delivers one tile, scheduled points first, then the fill from deeper buckets.
    ///
    /// `taken` positions never deliver. The walk appends every delivered position to `out`. The
    /// scheduled admissions deliver whole, and the fill runs while the delivery stays below `fill`.
    fn walk(
        &self,
        z: u8,
        x: u32,
        y: u32,
        taken: &DenseBitSet<BasePosition>,
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

        // The root's schedule is buckets 0..=m whole. Deeper tiles schedule bucket z + m alone.
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
    /// A `taken` set sized zero excludes nothing: positions beyond its domain are absent by
    /// definition.
    fn admits(&self, taken: &DenseBitSet<BasePosition>, position: usize) -> bool {
        let taken =
            position < taken.domain_size() && taken.contains(BasePosition::from_usize(position));
        !taken
            && self
                .visible
                .contains(NodeRowId::from_u32(self.row_of_position[position]))
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
    /// This panics when `depth` lies outside the pyramid's levels or above `cell`'s own depth.
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
    /// This panics when `depth` lies outside the pyramid's levels.
    #[must_use]
    pub fn occupied(&self, depth: Depth) -> usize {
        self.level(depth).len()
    }

    /// Returns the pyramid's depths, shallowest first.
    ///
    /// # Panics
    ///
    /// This panics when a level's depth lies beyond the key width.
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

impl VisibleColumn {
    /// Returns the visible point count.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.points.len()
    }

    /// Returns whether the view holds no visible point.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    /// Returns the bytes the column occupies.
    #[must_use]
    pub const fn footprint(&self) -> usize {
        self.points.len() * size_of::<VisiblePoint>()
    }

    /// Counts the depth's cells inside `cell` holding a visible point.
    ///
    /// # Panics
    ///
    /// This panics when `depth` lies above `cell`'s own depth.
    #[must_use]
    pub fn coverage(&self, cell: MortonCell, depth: Depth) -> usize {
        assert!(
            cell.depth().get() <= depth.get(),
            "a cell at depth {} holds no depth-{} cells",
            cell.depth().get(),
            depth.get(),
        );
        let range = self.range(cell);

        let mut count = 0_usize;
        let mut at = range.start;
        while at < range.end {
            at = self.cell_end(at, range.end, depth);
            count += 1;
        }

        count
    }

    /// Counts the visible points inside `cell`.
    #[must_use]
    pub fn population(&self, cell: MortonCell) -> usize {
        self.range(cell).len()
    }

    /// Returns the column's slice inside `cell`.
    fn range(&self, cell: MortonCell) -> Range<usize> {
        let low = cell.min_key().to_bits();
        let high = cell.max_key().to_bits();
        let start = self.points.partition_point(|point| point.key < low);
        let end = self.points.partition_point(|point| point.key <= high);

        start..end
    }

    /// Splits the slice into its depth's cells, ascending by cell index.
    fn split(&self, range: Range<usize>, depth: Depth, out: &mut Vec<Range<usize>>) {
        out.clear();
        let mut at = range.start;
        while at < range.end {
            let end = self.cell_end(at, range.end, depth);
            out.push(at..end);
            at = end;
        }
    }

    /// Returns the end of the depth's cell the slice's first point lies in.
    fn cell_end(&self, at: usize, end: usize, depth: Depth) -> usize {
        let prefix = MortonKey::from_bits(self.points[at].key).prefix(depth);
        let slice = &self.points[at..end];

        at + slice.partition_point(|point| MortonKey::from_bits(point.key).prefix(depth) <= prefix)
    }

    /// Returns the cell of `depth` the slice's points share.
    fn cell_of_slice(&self, at: usize, depth: Depth) -> MortonCell {
        MortonKey::from_bits(self.points[at].key).cell(depth)
    }

    /// Returns the base position of the slice's best-ranked point.
    ///
    /// Equal ranks resolve to the smallest key, which the corpus rank's totality leaves
    /// unreachable.
    fn representative(&self, range: Range<usize>) -> u32 {
        let mut best = self.points[range.start];
        for point in &self.points[range] {
            if point.rank < best.rank {
                best = *point;
            }
        }

        best.position
    }
}

impl ServedGeneration {
    /// Returns the visible entry count.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.positions.len()
    }

    /// Returns whether the generation holds no visible entry.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.positions.is_empty()
    }

    /// Returns the bytes the columns and the bucket table occupy.
    #[must_use]
    pub fn footprint(&self) -> usize {
        let keys = self
            .keys
            .as_ref()
            .map_or(0, |keys| keys.len() * size_of::<u64>());

        self.positions.len() * size_of::<u32>()
            + self.ascending.len() * size_of::<u32>()
            + keys
            + size_of::<Ranges>()
    }

    /// Returns the entry's key.
    fn key(&self, index: usize, codes: &[MortonKey]) -> u64 {
        self.keys.as_ref().map_or_else(
            || codes[self.positions[index] as usize].to_bits(),
            |keys| keys[index],
        )
    }

    /// Returns the key index entry's key.
    fn ascending_key(&self, at: usize, codes: &[MortonKey]) -> u64 {
        self.key(self.ascending[at] as usize, codes)
    }

    /// Narrows every bucket range of an enclosing extent to the entries inside `cell`.
    ///
    /// A chain descends through nested cells, so each level searches its parent's ranges rather
    /// than the whole segment.
    fn narrowed(&self, cell: MortonCell, within: &Ranges, codes: &[MortonKey]) -> Ranges {
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());

        core::array::from_fn(|bucket| {
            let range = within[bucket].clone();
            let start = self.partition(range.clone(), codes, |key| key < low);
            let end = self.partition(start..range.end, codes, |key| key <= high);
            start..end
        })
    }

    /// Returns the key index's slice inside `cell`.
    fn ascending_range(&self, cell: MortonCell, codes: &[MortonKey]) -> Range<usize> {
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());
        let start = self.ascending_partition(0..self.ascending.len(), codes, |key| key < low);
        let end = self.ascending_partition(start..self.ascending.len(), codes, |key| key <= high);

        start..end
    }

    /// Returns the end of the depth's cell the key index's entry at `at` lies in, and the probes
    /// the search took.
    fn ascending_cell_end(
        &self,
        at: usize,
        end: usize,
        depth: Depth,
        codes: &[MortonKey],
    ) -> (usize, usize) {
        let prefix = MortonKey::from_bits(self.ascending_key(at, codes)).prefix(depth);
        let holds = |index: usize| {
            MortonKey::from_bits(self.ascending_key(index, codes)).prefix(depth) <= prefix
        };

        // A grid cell holds few entries beside its representative, so the search finds the end by
        // doubling out from the start before it narrows: the probes stay logarithmic in the cell,
        // not in the extent.
        let mut probes = 0_usize;
        let mut inside = at;
        let mut outside = end;
        let mut step = 1_usize;
        while inside + step < end {
            let probe = inside + step;
            probes += 1;
            if !holds(probe) {
                outside = probe;
                break;
            }
            inside = probe;
            step *= 2;
        }

        let mut low = inside + 1;
        let mut high = outside;
        while low < high {
            let middle = usize::midpoint(low, high);
            probes += 1;
            if holds(middle) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        (low, probes)
    }

    /// Returns the first index of `range` whose key fails `before`.
    fn partition(
        &self,
        range: Range<usize>,
        codes: &[MortonKey],
        before: impl Fn(u64) -> bool,
    ) -> usize {
        let mut low = range.start;
        let mut high = range.end;
        while low < high {
            let middle = usize::midpoint(low, high);
            if before(self.key(middle, codes)) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        low
    }

    /// Returns the first index of the key index's `range` whose key fails `before`.
    fn ascending_partition(
        &self,
        range: Range<usize>,
        codes: &[MortonKey],
        before: impl Fn(u64) -> bool,
    ) -> usize {
        let mut low = range.start;
        let mut high = range.end;
        while low < high {
            let middle = usize::midpoint(low, high);
            if before(self.ascending_key(middle, codes)) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        low
    }
}

impl VisibleCascade {
    /// Returns the tile's scheduled count under the visible-only assignment.
    ///
    /// The count covers the tile's own cut alone: bucket `z + m` inside the tile cell, and buckets
    /// `0..=m` whole at the root.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate lies off the zoom's grid.
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
    /// This panics when the coordinate lies off the zoom's grid.
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
    /// This panics when a stored bucket lies beyond the key width.
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

        cascade::verify_coverage(
            IdSlice::<NodeRowId, _>::from_raw(&keys),
            IdSlice::<NodeRowId, _>::from_raw(&buckets),
            self.deepest,
        )
        .is_ok()
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
    /// Levels of refinement below the cut the tile's own delivery reached.
    refined: u8,
    /// Cells a partial refinement took one level further.
    deepened: usize,
}

/// One rank-representative level's outcome.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
struct RankStep {
    /// Cells of the level's grid the level itself has to represent.
    target: usize,
    /// Points the level delivered.
    delivered: usize,
    /// Levels of refinement below the cut, `k`.
    refined: u8,
    /// Cells a partial refinement took one level further.
    deepened: usize,
    /// Column entries examined.
    scanned: usize,
}

/// One served level's extent, with its bucket ranges and the chain's keys inside it.
#[derive(Debug)]
struct ServedExtent<'level> {
    /// The extent's per-bucket ranges of the generation.
    ranges: Ranges,
    /// The chain's delivered keys inside the extent, ascending.
    held: &'level [u64],
    /// The extent's own cell.
    cell: MortonCell,
}

impl ServedExtent<'_> {
    /// Returns the visible points the extent holds.
    fn population(&self) -> usize {
        self.ranges.iter().map(ExactSizeIterator::len).sum()
    }
}

/// The buffers one served chain reuses across its levels.
#[derive(Debug, Default)]
struct ServedScratch {
    /// The level's grid, one representative per cell, ascending by key.
    candidates: Vec<(u64, u32)>,
    /// The merge target one bucket range accumulates into.
    merged: Vec<(u64, u32)>,
    /// The extent's entries one bucket below the level's grid, ascending by key.
    finer: Vec<(u64, u32)>,
    /// Occupied cells one level below each grid cell.
    children: Vec<usize>,
    /// Those children no chain delivery sits in.
    wanted: Vec<usize>,
    /// Whether a chain delivery sits in each grid cell.
    occupied: Vec<bool>,
    /// Each grid cell's visible population.
    populations: Vec<usize>,
    /// The visit order of a partial refinement.
    order: Vec<usize>,
    /// Whether a partial refinement took each grid cell one level further.
    split: Vec<bool>,
}

/// The per-level inputs and outputs of one served chain step.
#[derive(Debug)]
struct ServedLevel<'level> {
    /// The level's tile address, `(z, x, y)`.
    address: (u8, u32, u32),
    /// The generation the level reads its grid and representatives out of.
    generation: &'level ServedGeneration,
    /// The level extent's per-bucket ranges of the generation.
    ranges: &'level Ranges,
    /// The chain's deliveries so far, ascending by key.
    represented: &'level [u64],
    /// The buffers the level plans its grid in.
    scratch: &'level mut ServedScratch,
    /// The delivery the level appends its representatives to.
    out: &'level mut Vec<u32>,
}

/// The buffers one rank-representative chain reuses across its levels.
#[derive(Debug, Default)]
struct RankScratch {
    /// The level's grid, one slice per cell, ascending by cell index.
    cells: Vec<Range<usize>>,
    /// The candidate grid one level finer.
    finer: Vec<Range<usize>>,
    /// One cell's children.
    children: Vec<Range<usize>>,
    /// The visit order of a partial refinement.
    order: Vec<usize>,
    /// Whether a partial refinement took each cell one level further.
    split: Vec<bool>,
}

/// The per-level inputs and outputs of one rank-representative chain step.
#[derive(Debug)]
struct RankLevel<'level> {
    /// The level's tile address, `(z, x, y)`.
    address: (u8, u32, u32),
    /// The visible view the level scans.
    column: &'level VisibleColumn,
    /// The chain's deliveries so far, ascending by key.
    represented: &'level [u64],
    /// The buffers the level plans its grid in.
    scratch: &'level mut RankScratch,
    /// The delivery the level appends its representatives to.
    out: &'level mut Vec<u32>,
}

/// Delivers the slice's representative when no chain delivery already sits in its cell.
///
/// Returns `true` when the representative delivers.
fn represent(
    column: &VisibleColumn,
    range: Range<usize>,
    represented: &[u64],
    depth: Depth,
    out: &mut Vec<u32>,
) -> bool {
    if holds(represented, column.cell_of_slice(range.start, depth)) {
        return false;
    }
    out.push(column.representative(range));

    true
}

/// Marks the grid cells a partial refinement takes one level further.
///
/// Returns the count the deepening adds to the level's target, the cells it deepened, and the
/// column entries it read. A cell of fewer than two points, and a cell whose finer split holds a
/// single child, stay whole: deepening either one adds no representative.
fn rank_deepen(
    spending: (RefineOrder, usize),
    column: &VisibleColumn,
    represented: &[u64],
    cells: &[Range<usize>],
    grid: (Depth, Depth),
    scratch: &mut RankScratch,
) -> (usize, usize, usize) {
    let (order_of, mut remaining) = spending;
    let (depth, finer) = grid;
    let mut order = core::mem::take(&mut scratch.order);
    order.clear();
    order.extend(0..cells.len());
    if order_of == RefineOrder::Population {
        order.sort_by_key(|&index| (Reverse(cells[index].len()), index));
    }

    scratch.split.clear();
    scratch.split.resize(cells.len(), false);
    let mut added = 0_usize;
    let mut deepened = 0_usize;
    let mut scanned = 0_usize;
    for &index in &order {
        let leaf = cells[index].clone();
        if leaf.len() < 2 {
            continue;
        }
        column.split(leaf.clone(), finer, &mut scratch.children);
        scanned += scratch.children.len();
        if scratch.children.len() < 2 {
            continue;
        }

        let wanted = needing(column, &scratch.children, represented, finer);
        let held = usize::from(!holds(represented, column.cell_of_slice(leaf.start, depth)));
        let growth = wanted - held;
        if growth > remaining {
            continue;
        }

        remaining -= growth;
        added += growth;
        deepened += 1;
        scratch.split[index] = true;
    }
    scratch.order = order;

    (added, deepened, scanned)
}

/// Counts the cells no chain delivery lies inside.
fn needing(
    column: &VisibleColumn,
    cells: &[Range<usize>],
    represented: &[u64],
    depth: Depth,
) -> usize {
    cells
        .iter()
        .filter(|range| !holds(represented, column.cell_of_slice(range.start, depth)))
        .count()
}

/// Counts the entries of an extent whose bucket lies at or below `depth`.
///
/// The cells the extent's depth-`depth` grid holds: the cascade gives each occupied cell exactly
/// one point at or below the cell's own depth.
fn reach(ranges: &Ranges, depth: Depth) -> usize {
    ranges[..=usize::from(depth.get())]
        .iter()
        .map(ExactSizeIterator::len)
        .sum()
}

/// Returns the ascending key list's slice inside `cell`.
fn inside_cell(keys: &[u64], cell: MortonCell) -> &[u64] {
    let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());
    let start = keys.partition_point(|&key| key < low);
    let end = keys.partition_point(|&key| key <= high);

    &keys[start..end]
}

/// Counts the depth's cells an ascending key list occupies.
fn distinct_prefixes(keys: &[u64], depth: Depth) -> usize {
    let mut cells = 0_usize;
    let mut last = None;
    for &key in keys {
        let cell = MortonKey::from_bits(key).prefix(depth);
        if last != Some(cell) {
            cells += 1;
            last = Some(cell);
        }
    }

    cells
}

/// Merges one bucket range's entries into an ascending candidate list.
///
/// Equal keys keep the accumulated entry first, which is the one from the shallower bucket.
fn merge_entries(
    candidates: &mut Vec<(u64, u32)>,
    merged: &mut Vec<(u64, u32)>,
    generation: &ServedGeneration,
    run: Range<usize>,
    codes: &[MortonKey],
) {
    if candidates.is_empty() {
        candidates
            .extend(run.map(|index| (generation.key(index, codes), generation.positions[index])));
        return;
    }

    merged.clear();
    merged.reserve(candidates.len() + run.len());
    let mut left = 0_usize;
    let mut at = run.start;
    while left < candidates.len() || at < run.end {
        let ahead = match (
            candidates.get(left),
            (at < run.end).then(|| generation.key(at, codes)),
        ) {
            (Some(&(key, _)), Some(other)) => key <= other,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if ahead {
            merged.push(candidates[left]);
            left += 1;
        } else {
            merged.push((generation.key(at, codes), generation.positions[at]));
            at += 1;
        }
    }

    core::mem::swap(candidates, merged);
}

/// Merges an ascending run of keys into an ascending key list.
fn merge_ascending(keys: &mut Vec<u64>, merged: &mut Vec<u64>, run: &[u64]) {
    if keys.is_empty() {
        keys.extend_from_slice(run);
        return;
    }
    if run.is_empty() {
        return;
    }

    merged.clear();
    merged.reserve(keys.len() + run.len());
    let mut left = 0_usize;
    let mut right = 0_usize;
    while left < keys.len() || right < run.len() {
        let ahead = match (keys.get(left), run.get(right)) {
            (Some(&key), Some(&other)) => key <= other,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if ahead {
            merged.push(keys[left]);
            left += 1;
        } else {
            merged.push(run[right]);
            right += 1;
        }
    }

    core::mem::swap(keys, merged);
}

/// Drops the keys outside `cell` from an ascending key list.
fn retain_cell(keys: &mut Vec<u64>, cell: MortonCell) {
    let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());
    let start = keys.partition_point(|&key| key < low);
    let end = keys.partition_point(|&key| key <= high);
    keys.truncate(end);
    keys.drain(..start);
}

/// Marks the grid cells a chain delivery sits in.
fn mark_represented(candidates: &[(u64, u32)], held: &[u64], depth: Depth, occupied: &mut [bool]) {
    let mut mark = 0_usize;
    for (index, &(key, _)) in candidates.iter().enumerate() {
        let cell = MortonKey::from_bits(key).cell(depth);
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());
        while mark < held.len() && held[mark] < low {
            mark += 1;
        }
        occupied[index] = held.get(mark).is_some_and(|&key| key <= high);
    }
}

/// Counts each grid cell's occupied children and the ones no chain delivery sits in.
fn children_of(
    candidates: &[(u64, u32)],
    finer_entries: &[(u64, u32)],
    held: &[u64],
    grid: (Depth, Depth),
    children: &mut Vec<usize>,
    wanted: &mut Vec<usize>,
) {
    let (depth, finer) = grid;
    children.clear();
    wanted.clear();
    let mut at = 0_usize;
    let mut mark = 0_usize;
    for &(key, _) in candidates {
        let cell = MortonKey::from_bits(key).cell(depth);
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());

        while at < finer_entries.len() && finer_entries[at].0 < low {
            at += 1;
        }
        let from = at;
        while at < finer_entries.len() && finer_entries[at].0 <= high {
            at += 1;
        }
        // The cell's own representative is its first child's, so the children are the one bucket
        // below plus it.
        let count = 1 + (at - from);

        while mark < held.len() && held[mark] < low {
            mark += 1;
        }
        let held_from = mark;
        while mark < held.len() && held[mark] <= high {
            mark += 1;
        }

        children.push(count);
        wanted.push(count - distinct_prefixes(&held[held_from..mark], finer));
    }
}

/// Delivers the level's grid and returns the points it delivered.
///
/// A whole cell delivers its representative when no chain delivery sits in it. A deepened cell
/// delivers its own representative and its occupied children's, ascending by key, so the delivery
/// stays in key order across the depths one level mixes.
fn deliver_grid(
    held: &[u64],
    grid: (Depth, Depth),
    cells: usize,
    scratch: &ServedScratch,
    out: &mut Vec<u32>,
) -> usize {
    let (depth, finer) = grid;
    let start = out.len();
    let mut at = 0_usize;
    for index in 0..cells {
        let (key, position) = scratch.candidates[index];
        if !scratch.split[index] {
            if !scratch.occupied[index] {
                out.push(position);
            }
            continue;
        }

        let parent = MortonKey::from_bits(key).cell(depth);
        let (low, high) = (parent.min_key().to_bits(), parent.max_key().to_bits());
        let tested = scratch.wanted[index] < scratch.children[index];
        while at < scratch.finer.len() && scratch.finer[at].0 < low {
            at += 1;
        }

        let mut parent_delivered = false;
        while at < scratch.finer.len() && scratch.finer[at].0 <= high {
            let (child_key, child_position) = scratch.finer[at];
            if !parent_delivered && key < child_key {
                deliver_child(key, position, tested, held, finer, out);
                parent_delivered = true;
            }
            deliver_child(child_key, child_position, tested, held, finer, out);
            at += 1;
        }
        if !parent_delivered {
            deliver_child(key, position, tested, held, finer, out);
        }
    }

    out.len() - start
}

/// Delivers one child cell's representative when no chain delivery sits in the child.
fn deliver_child(
    key: u64,
    position: u32,
    tested: bool,
    held: &[u64],
    finer: Depth,
    out: &mut Vec<u32>,
) {
    if tested && holds(held, MortonKey::from_bits(key).cell(finer)) {
        return;
    }

    out.push(position);
}

/// Returns whether an ascending key list holds a key inside the cell.
fn holds(keys: &[u64], cell: MortonCell) -> bool {
    let start = keys.partition_point(|&key| key < cell.min_key().to_bits());

    keys.get(start)
        .is_some_and(|&key| key <= cell.max_key().to_bits())
}

/// Adds a run of keys to an ascending key list, restoring the order.
fn merge_keys(keys: &mut Vec<u64>, run: impl IntoIterator<Item = u64>) {
    keys.extend(run);
    keys.sort_unstable();
}

/// Returns the count a spent chain reports as the tile's own target.
const fn spent_budget(target: &FillTarget<'_>, scheduled: usize, entry: usize) -> usize {
    match target {
        FillTarget::Scheduled => scheduled,
        FillTarget::Count(count) => *count,
        FillTarget::Admitted => 0,
        FillTarget::Cells { goal, .. } => goal.saturating_sub(entry),
    }
}

/// Returns the grid a served delivery's rule delivers over.
///
/// # Panics
///
/// This panics on a rule outside the rank-representative family.
const fn served_plan(rule: FillRule) -> RankPlan {
    rank_plan(rule).expect("the served form delivers the rank-representative rules")
}

/// Returns the grid a rank-representative rule delivers over.
const fn rank_plan(rule: FillRule) -> Option<RankPlan> {
    match rule {
        FillRule::CoverageRank => Some(RankPlan::Coarse),
        FillRule::Refined(refinement) => Some(RankPlan::Refined(refinement)),
        FillRule::Unmasked | FillRule::Coverage | FillRule::Visible | FillRule::CoverageCells => {
            None
        }
    }
}

/// Returns the cells the extent covers at `cut`, for the rules deriving a target from them.
fn covered_of(rule: FillRule, cell: MortonCell, cut: Depth, pyramid: &VisibleCellPyramid) -> usize {
    match rule {
        FillRule::Coverage | FillRule::CoverageCells => pyramid.count(cell, cut),
        FillRule::Unmasked | FillRule::Visible | FillRule::CoverageRank | FillRule::Refined(_) => 0,
    }
}

/// Returns the count one level fills to under a rule.
///
/// # Panics
///
/// This panics on a rank-representative rule, which delivers through its own engine.
fn target_of(
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
        FillRule::CoverageRank | FillRule::Refined(_) => {
            panic!("the rank-representative rules never reach the bucket walk")
        }
    }
}

/// Returns the cell at `(z, x, y)`.
///
/// # Panics
///
/// This panics when the zoom lies beyond the key width or the coordinate off the zoom's grid.
const fn cell_of(z: u8, x: u32, y: u32) -> MortonCell {
    MortonCell::new(
        Depth::new(z).expect("tile zooms lie within the key width"),
        x,
        y,
    )
    .expect("the coordinate lies on the zoom's grid")
}

/// Every bucket's full segment, in the instrument's scan offsets.
fn segments(fenceposts: &Fenceposts<BasePosition>) -> Ranges {
    fenceposts
        .segments()
        .map(|range| range.start.as_usize()..range.end.as_usize())
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
    use std::collections::HashSet;

    use super::{
        ChainAudit, DotBudget, FillRule, GenerationLayout, RefineOrder, Refinement,
        ServedGeneration, VisibleRankOrder, VisibleView, WalkBench, cell_of,
    };
    use crate::morton::{Depth, MortonKey};

    /// The corpus scale the seam's own checks run at.
    const POINTS: usize = 8_000;

    /// The fixture seed.
    const SEED: u64 = 0x0C0F_F111;

    /// The dot budget the refinement checks run under: the cells one tile's cut grid holds.
    const BUDGET: usize = 4096;

    /// The dot budget the last round measured as the knee: the cells one zoom step coarser hold.
    const KNEE: usize = 1024;

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

    /// Every refinement order under one budget.
    fn refinements(budget: DotBudget) -> Vec<FillRule> {
        [
            RefineOrder::Whole,
            RefineOrder::Morton,
            RefineOrder::Population,
        ]
        .into_iter()
        .map(|order| FillRule::Refined(Refinement { budget, order }))
        .collect()
    }

    /// The rank-representative rules a check compares the served form against.
    ///
    /// The coarse rule, both constant budgets, and the scheduled budget in every refinement order:
    /// the whole family the last round measured.
    fn served_rules() -> Vec<FillRule> {
        let mut rules = vec![FillRule::CoverageRank];
        rules.extend(refinements(DotBudget::Constant(BUDGET)));
        rules.extend(refinements(DotBudget::Constant(KNEE)));
        rules.extend(refinements(DotBudget::Scheduled));

        rules
    }

    /// Returns the audit with its cost counter cleared.
    ///
    /// Engines delivering the same sequence report different work, and every other field is the
    /// delivery's own description.
    const fn counts(audit: ChainAudit) -> ChainAudit {
        ChainAudit {
            scanned: 0,
            ..audit
        }
    }

    /// Expands a generation's bucket segments into one bucket per base position.
    fn buckets_by_position(generation: &ServedGeneration, positions: usize) -> Vec<Depth> {
        let mut buckets = vec![Depth::MAX; positions];
        for (bucket, segment) in generation.segments.iter().enumerate() {
            let depth = Depth::new(
                u8::try_from(bucket).expect("the segment table lies in the depth domain"),
            )
            .expect("every segment names a valid depth");
            for &position in &generation.positions[segment.clone()] {
                buckets[position as usize] = depth;
            }
        }
        buckets
    }

    /// The count a rule's budget bounds one tile's own delivery by.
    ///
    /// A cut grid holds `4^m` cells, so the cut-depth floor never passes the constant budget; the
    /// scheduled budget's floor is the tile's own coverage.
    fn bound(bench: &WalkBench, rule: FillRule, z: u8, x: u32, y: u32) -> usize {
        match rule {
            FillRule::Refined(Refinement {
                budget: DotBudget::Scheduled,
                ..
            }) => bench.scheduled(z, x, y).max(
                bench
                    .occupied_cells(z, x, y, Depth::new(z + bench.span()).expect("a valid cut"))
                    .len(),
            ),
            FillRule::Refined(Refinement {
                budget: DotBudget::Constant(budget),
                ..
            }) => budget,
            FillRule::Unmasked
            | FillRule::Coverage
            | FillRule::Visible
            | FillRule::CoverageCells
            | FillRule::CoverageRank => BUDGET,
        }
    }

    /// Returns the tiles a check sweeps.
    ///
    /// The sweep covers every extent of the shallow zooms plus the densest descent.
    fn tiles(bench: &WalkBench) -> Vec<(u8, u32, u32)> {
        let mut tiles: Vec<(u8, u32, u32)> = Vec::new();
        for z in 0..=2_u8 {
            let side = 1_u32 << z;
            for x in 0..side {
                for y in 0..side {
                    tiles.push((z, x, y));
                }
            }
        }
        tiles.extend(bench.descent());
        tiles.sort_unstable();
        tiles.dedup();

        tiles
    }

    /// Returns the first tile whose delivered rows differ between the two corpora.
    ///
    /// Corpus B is the masked fixture. Corpus A contains the same visible rows and nothing else,
    /// all visible. A rule reading the visible view alone delivers the same rows over both, in the
    /// same order. Anything a hidden row reaches shows up here as a disagreement.
    fn interference(rule: FillRule, clustered: bool, visible: f64) -> Option<(u8, u32, u32)> {
        let hidden = masked(clustered, visible);
        let alone = hidden.visible_only();

        let (pyramid, column) = (hidden.pyramid(), hidden.column());
        let (alone_pyramid, alone_column) = (alone.pyramid(), alone.column());
        assert_eq!(
            column.len(),
            alone_column.len(),
            "the two corpora hold different visible views",
        );
        assert_eq!(alone.visible_rows(), hidden.visible_rows());
        let view = VisibleView::new(&pyramid, &column);
        let alone_view = VisibleView::new(&alone_pyramid, &alone_column);

        for (z, x, y) in tiles(&hidden) {
            let left = hidden.rows(hidden.delivery(rule, z, x, y, view));
            let right = alone.rows(alone.delivery(rule, z, x, y, alone_view));
            if left != right {
                return Some((z, x, y));
            }
        }

        None
    }

    /// Returns the first tile whose served delivered rows differ between the two corpora.
    ///
    /// [`interference`]'s comparison over the served engine: corpus B is the masked fixture, corpus
    /// A contains the same visible rows and nothing else.
    fn served_interference(
        rule: FillRule,
        clustered: bool,
        visible: f64,
    ) -> Option<(u8, u32, u32)> {
        let hidden = masked(clustered, visible);
        let alone = hidden.visible_only();

        let generation = hidden.indexed_generation(GenerationLayout::Inline);
        let alone_generation = alone.indexed_generation(GenerationLayout::Inline);
        assert_eq!(
            generation.len(),
            alone_generation.len(),
            "the two corpora hold different visible views",
        );
        assert_eq!(alone.visible_rows(), hidden.visible_rows());

        for (z, x, y) in tiles(&hidden) {
            let left = hidden.rows(hidden.served_delivery(rule, z, x, y, &generation));
            let right = alone.rows(alone.served_delivery(rule, z, x, y, &alone_generation));
            if left != right {
                return Some((z, x, y));
            }
        }

        None
    }

    /// Returns the first tile whose uniform-grid rows differ between the two corpora.
    fn uniform_interference(
        additional_depth: u8,
        clustered: bool,
        visible: f64,
    ) -> Option<(u8, u32, u32)> {
        let hidden = masked(clustered, visible);
        let alone = hidden.visible_only();
        let generation = hidden.indexed_generation(GenerationLayout::Inline);
        let alone_generation = alone.indexed_generation(GenerationLayout::Inline);

        for (z, x, y) in tiles(&hidden) {
            let left = hidden.rows(hidden.uniform_delivery(additional_depth, z, x, y, &generation));
            let right =
                alone.rows(alone.uniform_delivery(additional_depth, z, x, y, &alone_generation));
            if left != right {
                return Some((z, x, y));
            }
        }

        None
    }

    /// Returns the first tile whose stepped uniform-grid rows differ between the two corpora.
    fn uniform_step_interference(
        refine_from_zoom: u8,
        clustered: bool,
        visible: f64,
    ) -> Option<(u8, u32, u32)> {
        let hidden = masked(clustered, visible);
        let alone = hidden.visible_only();
        let generation = hidden.indexed_generation(GenerationLayout::Inline);
        let alone_generation = alone.indexed_generation(GenerationLayout::Inline);

        for (z, x, y) in tiles(&hidden) {
            let left =
                hidden.rows(hidden.uniform_step_delivery(refine_from_zoom, z, x, y, &generation));
            let right = alone.rows(alone.uniform_step_delivery(
                refine_from_zoom,
                z,
                x,
                y,
                &alone_generation,
            ));
            if left != right {
                return Some((z, x, y));
            }
        }

        None
    }

    #[test]
    fn the_served_form_delivers_the_scanning_form_exactly() {
        for clustered in [false, true] {
            for visible in [1.0, 0.75, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();
                let column = bench.column();
                let view = VisibleView::new(&pyramid, &column);
                let oracle = bench.generation(GenerationLayout::Inline);
                let generation = bench.indexed_generation(GenerationLayout::Inline);
                assert_eq!(generation, oracle);
                assert_eq!(generation.len(), bench.visible_rows());

                for rule in served_rules() {
                    for (z, x, y) in tiles(&bench) {
                        assert_eq!(
                            bench.served_delivery(rule, z, x, y, &generation),
                            bench.delivery(rule, z, x, y, view),
                            "{rule:?} serves a different delivery sequence at tile {z}/{x}/{y}, \
                             clustered {clustered}, visible {visible}",
                        );
                        assert_eq!(
                            bench.served_cumulative_delivery(rule, z, x, y, &generation),
                            bench.cumulative_delivery(rule, z, x, y, view),
                            "{rule:?} serves a different cumulative delivery at tile {z}/{x}/{y}, \
                             clustered {clustered}, visible {visible}",
                        );
                        assert_eq!(
                            counts(bench.served_audit(rule, z, x, y, &generation)),
                            counts(bench.audit(rule, z, x, y, view)),
                            "{rule:?} serves a different audit at tile {z}/{x}/{y}, clustered \
                             {clustered}, visible {visible}",
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn a_generation_prefix_holds_one_representative_per_occupied_cell() {
        for clustered in [false, true] {
            for visible in [1.0, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let column = bench.column();
                let generation = bench.generation(GenerationLayout::Inline);
                let (codes, _, _) = bench.columns();

                for (z, x, y) in tiles(&bench) {
                    let cut = Depth::new(z + bench.span()).expect("a valid cut");
                    for depth in [cut, Depth::new(cut.get() + 2).expect("a valid grid")] {
                        let served = bench.served_representatives(z, x, y, depth, &generation);
                        let cells: HashSet<u64> = served
                            .iter()
                            .map(|&position| {
                                MortonKey::from_bits(codes[position as usize]).prefix(depth)
                            })
                            .collect();

                        assert_eq!(
                            cells,
                            bench.occupied_cells(z, x, y, depth),
                            "the prefix read misses a depth-{} cell at tile {z}/{x}/{y}",
                            depth.get(),
                        );
                        assert_eq!(
                            served.len(),
                            cells.len(),
                            "the prefix read repeats a depth-{} cell at tile {z}/{x}/{y}",
                            depth.get(),
                        );
                        assert_eq!(
                            served.len(),
                            column.coverage(cell_of(z, x, y), depth),
                            "the prefix read and the column disagree on the depth-{} cells at \
                             tile {z}/{x}/{y}",
                            depth.get(),
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn neighbour_separation_assigns_the_cascade_s_buckets() {
        for clustered in [false, true] {
            for visible in [1.0, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                for layout in [GenerationLayout::Inline, GenerationLayout::Shared] {
                    let oracle = bench.generation(layout);
                    assert_eq!(
                        bench.separated_generation(layout),
                        oracle,
                        "neighbour deletion differs from the cascade, clustered {clustered}, \
                         visible {visible}",
                    );
                    assert_eq!(
                        bench.merged_generation(layout),
                        oracle,
                        "the bucket merge differs from the cascade, clustered {clustered}, \
                         visible {visible}",
                    );
                    assert_eq!(
                        bench.filtered_generation(layout),
                        oracle,
                        "the shared-order filter differs from the cascade, clustered {clustered}, \
                         visible {visible}",
                    );
                    assert_eq!(
                        bench.indexed_generation(layout),
                        oracle,
                        "the indexed stack differs from the cascade, clustered {clustered}, \
                         visible {visible}",
                    );
                    assert_eq!(
                        bench.radix_generation(layout),
                        oracle,
                        "the radix stack differs from the cascade, clustered {clustered}, visible \
                         {visible}",
                    );
                }
            }
        }
    }

    #[test]
    fn masking_never_moves_a_visible_point_to_a_deeper_bucket() {
        let mut strict = 0_usize;
        for clustered in [false, true] {
            for visible in [0.75, 0.5, 0.05] {
                let mut bench = WalkBench::build(POINTS, SEED);
                let full = bench.indexed_generation(GenerationLayout::Shared);
                let full_buckets = buckets_by_position(&full, bench.points());
                if clustered {
                    bench.mask_clustered(visible, SEED);
                } else {
                    bench.mask_uniform(visible, SEED);
                }
                let masked = bench.indexed_generation(GenerationLayout::Shared);
                let masked_buckets = buckets_by_position(&masked, bench.points());

                for &position in &masked.positions {
                    let position = position as usize;
                    assert!(
                        masked_buckets[position] <= full_buckets[position],
                        "masking moved position {position} from bucket {} to deeper bucket {}",
                        full_buckets[position].get(),
                        masked_buckets[position].get(),
                    );
                    strict += usize::from(masked_buckets[position] < full_buckets[position]);
                }
            }
        }
        assert!(
            strict > 0,
            "no point moved shallower, so the check pins nothing"
        );
    }

    #[test]
    fn the_shared_layout_serves_what_the_inline_layout_serves() {
        for clustered in [false, true] {
            let bench = masked(clustered, 0.5);
            let inline = bench.indexed_generation(GenerationLayout::Inline);
            let shared = bench.indexed_generation(GenerationLayout::Shared);

            assert!(shared.footprint() < inline.footprint());
            for rule in served_rules() {
                for (z, x, y) in tiles(&bench) {
                    assert_eq!(
                        bench.served_delivery(rule, z, x, y, &shared),
                        bench.served_delivery(rule, z, x, y, &inline),
                        "the two layouts differ at tile {z}/{x}/{y} under {rule:?}",
                    );
                }
            }
        }
    }

    #[test]
    fn a_hidden_row_never_moves_a_served_delivery() {
        let mut rules = vec![FillRule::CoverageRank];
        rules.extend(refinements(DotBudget::Constant(BUDGET)));

        for rule in rules {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    assert_eq!(
                        served_interference(rule, clustered, visible),
                        None,
                        "{rule:?} serves different rows once hidden rows exist, clustered \
                         {clustered}, visible {visible}",
                    );
                }
            }
        }
    }

    #[test]
    fn a_served_rule_reading_a_hidden_quantity_fails_the_noninterference_check() {
        for rule in refinements(DotBudget::Scheduled) {
            assert!(
                served_interference(rule, false, 0.5).is_some(),
                "{rule:?} passed the noninterference check over the served engine, so the check \
                 no longer separates a hidden-independent rule from a leaking one",
            );
        }
    }

    #[test]
    fn a_public_uniform_grid_is_proportional_in_bucket_order() {
        for additional_depth in [0_u8, 1] {
            for clustered in [false, true] {
                for visible in [1.0, 0.5, 0.05] {
                    let bench = masked(clustered, visible);
                    let generation = bench.indexed_generation(GenerationLayout::Inline);
                    let buckets = buckets_by_position(&generation, bench.points());
                    let (codes, _, _) = bench.columns();

                    for (z, x, y) in tiles(&bench) {
                        let depth = bench.uniform_grid_depth(z, additional_depth);
                        assert!(depth < Depth::MAX, "the fixture stays before the catch-all");
                        let delivered = bench.uniform_cumulative_delivery(
                            additional_depth,
                            z,
                            x,
                            y,
                            &generation,
                        );
                        let shown: HashSet<u64> = delivered
                            .iter()
                            .map(|&position| {
                                MortonKey::from_bits(codes[position as usize]).prefix(depth)
                            })
                            .collect();
                        let occupied = bench.occupied_cells(z, x, y, depth);

                        assert_eq!(
                            shown,
                            occupied,
                            "the public grid misses a depth-{} cell at tile {z}/{x}/{y}, \
                             clustered {clustered}, visible {visible}",
                            depth.get(),
                        );
                        assert_eq!(
                            delivered.len(),
                            shown.len(),
                            "the public grid repeats a depth-{} cell at tile {z}/{x}/{y}",
                            depth.get(),
                        );
                        assert!(
                            delivered.windows(2).all(|pair| {
                                let [left, right] = pair else {
                                    unreachable!("a two-entry window has two entries")
                                };
                                buckets
                                    .get(*left as usize)
                                    .expect("the left position lies in the bucket column")
                                    <= buckets
                                        .get(*right as usize)
                                        .expect("the right position lies in the bucket column")
                            }),
                            "the public grid is not in scope-bucket order at tile {z}/{x}/{y}",
                        );

                        let mut cell_order =
                            bench.served_representatives(z, x, y, depth, &generation);
                        let mut bucket_order = delivered.clone();
                        cell_order.sort_unstable();
                        bucket_order.sort_unstable();
                        assert_eq!(
                            bucket_order, cell_order,
                            "delivery order changed the selected set at tile {z}/{x}/{y}",
                        );

                        let cells_per_tile =
                            1_usize << (2 * u32::from(bench.span() + additional_depth));
                        assert!(
                            delivered.len() <= cells_per_tile,
                            "the public grid passed its geometric per-tile bound",
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn public_uniform_grid_deltas_accumulate_to_the_prefix() {
        for additional_depth in [0_u8, 1] {
            let bench = masked(false, 0.5);
            let generation = bench.indexed_generation(GenerationLayout::Inline);
            let (codes, _, _) = bench.columns();

            for (z, x, y) in tiles(&bench) {
                let cell = cell_of(z, x, y);
                let cumulative: HashSet<u32> = bench
                    .uniform_cumulative_delivery(additional_depth, z, x, y, &generation)
                    .into_iter()
                    .collect();
                let mut deltas = HashSet::new();
                for level in 0..=z {
                    let shift = z - level;
                    for position in bench.uniform_delivery(
                        additional_depth,
                        level,
                        x >> shift,
                        y >> shift,
                        &generation,
                    ) {
                        if cell.contains(MortonKey::from_bits(codes[position as usize])) {
                            assert!(
                                deltas.insert(position),
                                "a public-grid delta repeated position {position}",
                            );
                        }
                    }
                }

                assert_eq!(
                    deltas, cumulative,
                    "public-grid deltas do not accumulate at tile {z}/{x}/{y}",
                );
            }
        }

        for refine_from_zoom in [6_u8, 12, u8::MAX] {
            let bench = masked(false, 0.5);
            let generation = bench.indexed_generation(GenerationLayout::Inline);
            let (codes, _, _) = bench.columns();

            for (z, x, y) in tiles(&bench) {
                let cell = cell_of(z, x, y);
                let cumulative: HashSet<u32> = bench
                    .uniform_step_cumulative_delivery(refine_from_zoom, z, x, y, &generation)
                    .into_iter()
                    .collect();
                let mut deltas = HashSet::new();
                for level in 0..=z {
                    let shift = z - level;
                    for position in bench.uniform_step_delivery(
                        refine_from_zoom,
                        level,
                        x >> shift,
                        y >> shift,
                        &generation,
                    ) {
                        if cell.contains(MortonKey::from_bits(codes[position as usize])) {
                            assert!(
                                deltas.insert(position),
                                "a stepped public-grid delta repeated position {position}",
                            );
                        }
                    }
                }

                assert_eq!(
                    deltas, cumulative,
                    "stepped public-grid deltas do not accumulate at tile {z}/{x}/{y}",
                );
                let depth = bench.uniform_step_grid_depth(refine_from_zoom, z);
                let shown: HashSet<u64> = cumulative
                    .iter()
                    .map(|&position| MortonKey::from_bits(codes[position as usize]).prefix(depth))
                    .collect();
                assert_eq!(shown, bench.occupied_cells(z, x, y, depth));
                assert_eq!(shown.len(), cumulative.len());
            }
        }
    }

    #[test]
    fn scope_bucket_order_preserves_the_wire_split_and_full_cut_delivery() {
        let full = masked(false, 1.0);
        let full_generation = full.indexed_generation(GenerationLayout::Inline);
        let pyramid = full.pyramid();
        let column = full.column();
        let view = VisibleView::new(&pyramid, &column);
        for (z, x, y) in tiles(&full) {
            assert_eq!(
                full.uniform_step_delivery(u8::MAX, z, x, y, &full_generation),
                full.delivery(FillRule::Unmasked, z, x, y, view),
                "the public cut grid moved the full delivery at tile {z}/{x}/{y}",
            );
        }

        let bench = masked(false, 0.5);
        let generation = bench.indexed_generation(GenerationLayout::Inline);
        let buckets = buckets_by_position(&generation, bench.points());
        let refine_from_zoom = bench.span();
        let mut split_transition = false;
        for (z, x, y) in tiles(&bench) {
            let cut = z + bench.span();
            let delivered = bench.uniform_step_delivery(refine_from_zoom, z, x, y, &generation);
            let mut natural = 0_usize;
            let mut tail = 0_usize;
            let mut in_tail = false;
            for &position in &delivered {
                let bucket = buckets[position as usize].get();
                if bucket <= cut {
                    assert!(!in_tail, "a natural row followed the deeper tail");
                    natural += 1;
                } else {
                    in_tail = true;
                    tail += 1;
                }
            }

            if z == 0 {
                assert_eq!(tail, 0, "the root precedes the public refinement step");
            } else if z < refine_from_zoom {
                assert_eq!(tail, 0, "a pre-step tile delivered a deeper bucket");
            } else if z == refine_from_zoom {
                split_transition |= natural > 0 && tail > 0;
            } else {
                assert_eq!(natural, 0, "a post-step tile repeated its parent cut");
            }
            if z == bench.max_zoom() {
                assert_eq!(
                    bench
                        .uniform_step_cumulative_delivery(refine_from_zoom, z, x, y, &generation,)
                        .len(),
                    bench.gather(z, x, y).len(),
                    "the terminal public-grid tile omitted visible rows",
                );
            }
        }
        assert!(
            split_transition,
            "the transition never exercised both the natural run and deeper tail",
        );
    }

    #[test]
    fn a_public_uniform_grid_keeps_rows_invariant_while_the_known_bad_rule_fails() {
        for additional_depth in [0_u8, 1] {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    assert_eq!(
                        uniform_interference(additional_depth, clustered, visible),
                        None,
                        "the public grid moved rows once hidden rows existed, clustered \
                         {clustered}, visible {visible}",
                    );
                }
            }
        }

        for refine_from_zoom in [6_u8, 12, u8::MAX] {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    assert_eq!(
                        uniform_step_interference(refine_from_zoom, clustered, visible),
                        None,
                        "the stepped public grid moved rows once hidden rows existed, clustered \
                         {clustered}, visible {visible}",
                    );
                }
            }
        }

        for rule in refinements(DotBudget::Scheduled) {
            assert!(
                served_interference(rule, false, 0.5).is_some(),
                "{rule:?} passed beside the public grid, so the identity check no longer \
                 separates the known-bad rule",
            );
        }
    }

    #[test]
    fn the_density_metric_accepts_public_grids_and_rejects_per_tile_budgets() {
        let mut today_rejected = false;
        let mut budget_rejected = false;
        for clustered in [false, true] {
            let bench = masked(clustered, 0.5);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let generation = bench.indexed_generation(GenerationLayout::Inline);

            for z in 0..=3_u8 {
                let window_depth = Depth::new(z + 2).expect("the audit windows fit the key");
                let windows = 1_usize << (2 * u32::from(window_depth.get()));
                let counts = |positions: Vec<u32>| {
                    let mut counts = vec![0_usize; windows];
                    for position in positions {
                        let code = bench
                            .codes
                            .get(position as usize)
                            .expect("delivered positions lie in the code column");
                        let window = MortonKey::from_bits(code.to_bits()).prefix(window_depth);
                        *counts
                            .get_mut(usize::try_from(window).expect("the audit grid fits usize"))
                            .expect("the prefix lies in the audit grid") += 1;
                    }
                    counts
                };
                let occupied = |depth: Depth| {
                    let mut counts = vec![0_usize; windows];
                    let shift = 2 * u32::from(depth.get() - window_depth.get());
                    for cell in bench.occupied_cells(0, 0, 0, depth) {
                        let window =
                            usize::try_from(cell >> shift).expect("the audit grid fits usize");
                        *counts
                            .get_mut(window)
                            .expect("the prefix lies in the audit grid") += 1;
                    }
                    counts
                };
                let world = |rule: Option<FillRule>, additional_depth: Option<u8>| {
                    let side = 1_u32 << z;
                    let mut delivered = Vec::new();
                    for x in 0..side {
                        for y in 0..side {
                            delivered.extend(match (rule, additional_depth) {
                                (Some(rule), _) => {
                                    bench.served_cumulative_delivery(rule, z, x, y, &generation)
                                }
                                (None, Some(additional_depth)) => bench
                                    .uniform_cumulative_delivery(
                                        additional_depth,
                                        z,
                                        x,
                                        y,
                                        &generation,
                                    ),
                                (None, None) => {
                                    bench.cumulative_delivery(FillRule::Unmasked, z, x, y, view)
                                }
                            });
                        }
                    }
                    counts(delivered)
                };
                let proportional = |shown: &[usize], actual: &[usize]| {
                    let shown_total = shown.iter().sum::<usize>() as u128;
                    let actual_total = actual.iter().sum::<usize>() as u128;
                    shown.iter().zip(actual).all(|(&dots, &cells)| {
                        dots as u128 * actual_total == cells as u128 * shown_total
                    })
                };

                let cut = bench.uniform_grid_depth(z, 0);
                let finer = bench.uniform_grid_depth(z, 1);
                let coarse = world(Some(FillRule::CoverageRank), None);
                let uniform = world(None, Some(1));
                assert_eq!(coarse, occupied(cut));
                assert_eq!(uniform, occupied(finer));

                let today = world(None, None);
                let budgeted = world(
                    Some(FillRule::Refined(Refinement {
                        budget: DotBudget::Constant(KNEE),
                        order: RefineOrder::Population,
                    })),
                    None,
                );
                today_rejected |= !proportional(&today, &occupied(cut));
                budget_rejected |= !proportional(&budgeted, &occupied(cut));
            }
        }

        assert!(
            today_rejected,
            "the metric no longer catches today's spatial distortion",
        );
        assert!(
            budget_rejected,
            "the metric no longer catches per-tile budget equalization",
        );
    }

    #[test]
    fn the_served_form_shows_every_cell_holding_visible_content() {
        for rule in served_rules() {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    let bench = masked(clustered, visible);
                    let generation = bench.generation(GenerationLayout::Inline);
                    let (codes, _, _) = bench.columns();

                    for (z, x, y) in tiles(&bench) {
                        let audit = bench.served_audit(rule, z, x, y, &generation);
                        let delivered =
                            bench.served_cumulative_delivery(rule, z, x, y, &generation);
                        let cut =
                            Depth::new(z + bench.span()).expect("the cut lies in the key width");
                        let grid = Depth::new(cut.get() + audit.refined)
                            .expect("the delivered grid lies within the key width");

                        for depth in [cut, grid] {
                            let shown: HashSet<u64> = delivered
                                .iter()
                                .map(|&position| {
                                    MortonKey::from_bits(codes[position as usize]).prefix(depth)
                                })
                                .collect();
                            assert_eq!(
                                shown,
                                bench.occupied_cells(z, x, y, depth),
                                "{rule:?} serves a depth-{} cell empty over visible content at \
                                 tile {z}/{x}/{y}, clustered {clustered}, visible {visible}",
                                depth.get(),
                            );
                        }

                        assert_eq!(audit.covered, bench.occupied_cells(z, x, y, cut).len());
                        assert!(
                            audit.delivered <= bound(&bench, rule, z, x, y).max(audit.covered),
                            "{rule:?} served {} past both the budget and its own cut grid at tile \
                             {z}/{x}/{y}",
                            audit.delivered,
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn a_hidden_row_never_moves_a_rank_rule_delivery() {
        let mut rules = vec![FillRule::CoverageRank];
        rules.extend(refinements(DotBudget::Constant(BUDGET)));

        for rule in rules {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    assert_eq!(
                        interference(rule, clustered, visible),
                        None,
                        "{rule:?} delivers different rows once hidden rows exist, clustered \
                         {clustered}, visible {visible}",
                    );
                }
            }
        }
    }

    #[test]
    fn a_rule_reading_a_hidden_quantity_fails_the_noninterference_check() {
        let mut rules = vec![
            FillRule::Unmasked,
            FillRule::Coverage,
            FillRule::Visible,
            FillRule::CoverageCells,
        ];
        rules.extend(refinements(DotBudget::Scheduled));

        for rule in rules {
            assert!(
                interference(rule, false, 0.5).is_some(),
                "{rule:?} passed the noninterference check, so the check no longer separates a \
                 hidden-independent rule from a leaking one",
            );
        }
    }

    #[test]
    fn the_unmasked_rule_reproduces_the_chained_variant() {
        for clustered in [false, true] {
            for visible in [1.0, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();
                let column = bench.column();
                let view = VisibleView::new(&pyramid, &column);

                for (z, x, y) in bench.descent() {
                    assert_eq!(
                        bench.deliver(FillRule::Unmasked, z, x, y, view),
                        bench.chained(z, x, y),
                        "the unmasked rule and the chained variant differ at zoom {z}",
                    );
                    assert_eq!(
                        bench.delivery(FillRule::Unmasked, z, x, y, view),
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
                let column = bench.column();
                let cascade = bench.visible_cascade(VisibleRankOrder::Base);
                let reversed = bench.visible_cascade(VisibleRankOrder::Reversed);

                assert!(cascade.coverage_holds());
                assert_eq!(cascade.points(), bench.visible_rows());
                assert_eq!(column.len(), bench.visible_rows());

                for (z, x, y) in bench.descent() {
                    let cut = Depth::new(z + bench.span()).expect("the cut lies in the key width");
                    assert_eq!(
                        pyramid.count(cell_of(z, x, y), cut),
                        cascade.covered(z, x, y),
                        "the pyramid and the visible cascade differ at zoom {z}",
                    );
                    assert_eq!(
                        column.coverage(cell_of(z, x, y), cut),
                        cascade.covered(z, x, y),
                        "the column and the visible cascade differ at zoom {z}",
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
                    let column = bench.column();
                    let view = VisibleView::new(&pyramid, &column);
                    let (codes, _, _) = bench.columns();

                    for (z, x, y) in bench.descent() {
                        let cell = cell_of(z, x, y);
                        let mut inherited = 0_usize;
                        for level in 0..z {
                            let shift = z - level;
                            let (ancestor_x, ancestor_y) = (x >> shift, y >> shift);
                            let audit = bench.audit(rule, level, ancestor_x, ancestor_y, view);
                            if audit.spent {
                                break;
                            }
                            for position in
                                bench.delivery(rule, level, ancestor_x, ancestor_y, view)
                            {
                                let code = MortonKey::from_bits(codes[position as usize]);
                                inherited += usize::from(cell.contains(code));
                            }
                            if audit.dry {
                                break;
                            }
                        }

                        assert_eq!(
                            bench.audit(rule, z, x, y, view).inherited,
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
        let column = bench.column();
        let view = VisibleView::new(&pyramid, &column);

        for (z, x, y) in bench.descent() {
            let unmasked = bench.audit(FillRule::Unmasked, z, x, y, view);
            for rule in [
                FillRule::Coverage,
                FillRule::Visible,
                FillRule::CoverageCells,
            ] {
                assert_eq!(unmasked, bench.audit(rule, z, x, y, view));
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
                let column = bench.column();
                let view = VisibleView::new(&pyramid, &column);

                for (z, x, y) in bench.descent() {
                    let audit = bench.audit(FillRule::CoverageCells, z, x, y, view);
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
    fn a_rank_rule_shows_every_cell_holding_visible_content() {
        let mut rules = vec![FillRule::CoverageRank];
        rules.extend(refinements(DotBudget::Constant(BUDGET)));
        rules.extend(refinements(DotBudget::Scheduled));

        for rule in rules {
            for clustered in [false, true] {
                for visible in [0.75, 0.5, 0.05] {
                    let bench = masked(clustered, visible);
                    let pyramid = bench.pyramid();
                    let column = bench.column();
                    let view = VisibleView::new(&pyramid, &column);
                    let (codes, _, _) = bench.columns();

                    for (z, x, y) in tiles(&bench) {
                        let audit = bench.audit(rule, z, x, y, view);
                        let delivered = bench.cumulative_delivery(rule, z, x, y, view);
                        let cut = Depth::new(z + bench.span())
                            .expect("the cut lies within the key width");
                        let grid = Depth::new(cut.get() + audit.refined)
                            .expect("the delivered grid lies within the key width");

                        for depth in [cut, grid] {
                            let shown: HashSet<u64> = delivered
                                .iter()
                                .map(|&position| {
                                    MortonKey::from_bits(codes[position as usize]).prefix(depth)
                                })
                                .collect();
                            assert_eq!(
                                shown,
                                bench.occupied_cells(z, x, y, depth),
                                "{rule:?} leaves a depth-{} cell empty over visible content at \
                                 tile {z}/{x}/{y}, clustered {clustered}, visible {visible}",
                                depth.get(),
                            );
                        }

                        assert_eq!(audit.covered, bench.occupied_cells(z, x, y, cut).len());
                        assert!(
                            audit.delivered <= bound(&bench, rule, z, x, y),
                            "{rule:?} delivered {} past the budget at tile {z}/{x}/{y}",
                            audit.delivered,
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn a_budget_below_the_cut_grid_still_shows_every_cut_cell() {
        /// A budget far below the 4096 cells a tile's cut grid holds.
        const SMALL: usize = 256;

        let rule = FillRule::Refined(Refinement {
            budget: DotBudget::Constant(SMALL),
            order: RefineOrder::Population,
        });
        let bench = masked(false, 0.5);
        let pyramid = bench.pyramid();
        let column = bench.column();
        let view = VisibleView::new(&pyramid, &column);
        let (codes, _, _) = bench.columns();

        let mut overruns = 0_usize;
        for (z, x, y) in tiles(&bench) {
            let audit = bench.audit(rule, z, x, y, view);
            let cut = Depth::new(z + bench.span()).expect("the cut lies within the key width");
            let shown: HashSet<u64> = bench
                .cumulative_delivery(rule, z, x, y, view)
                .iter()
                .map(|&position| MortonKey::from_bits(codes[position as usize]).prefix(cut))
                .collect();

            assert_eq!(shown, bench.occupied_cells(z, x, y, cut));
            assert!(
                audit.delivered <= SMALL.max(audit.covered),
                "the delivery at tile {z}/{x}/{y} passed both the budget and its own cut grid",
            );
            overruns += usize::from(audit.delivered > SMALL);
        }

        assert!(
            overruns > 0,
            "the small budget never bound, so this check pins nothing",
        );
    }

    #[test]
    fn the_coarse_rank_rule_delivers_the_visible_only_generation() {
        for clustered in [false, true] {
            for visible in [0.75, 0.5, 0.05] {
                let bench = masked(clustered, visible);
                let pyramid = bench.pyramid();
                let column = bench.column();
                let view = VisibleView::new(&pyramid, &column);
                let cascade = bench.visible_cascade(VisibleRankOrder::Base);

                let (codes, _, _) = bench.columns();
                let alone = bench.visible_only();
                for (z, x, y) in tiles(&bench) {
                    assert_eq!(
                        bench.audit(FillRule::CoverageRank, z, x, y, view).delivered,
                        cascade.schedule(z, x, y),
                        "the coarse rank rule and the visible-only schedule differ at tile \
                         {z}/{x}/{y}, clustered {clustered}, visible {visible}",
                    );

                    // The deepest cut's bucket is the cascade's catch-all. It holds every
                    // co-located point, not one per cell, so the prefix is not a cell census there.
                    if z == bench.max_zoom() {
                        continue;
                    }
                    let mut keys: Vec<u64> = bench
                        .cumulative_delivery(FillRule::CoverageRank, z, x, y, view)
                        .iter()
                        .map(|&position| codes[position as usize])
                        .collect();
                    keys.sort_unstable();
                    let reached = alone.reached(z, x, y);
                    assert!(
                        keys == reached,
                        "the coarse rank rule's cumulative delivery is not the visible-only \
                         generation's cut prefix at tile {z}/{x}/{y}: {} against {}, clustered \
                         {clustered}, visible {visible}",
                        keys.len(),
                        reached.len(),
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
