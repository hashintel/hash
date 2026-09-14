//! Delivery probes for comparing masked backfill and visible-cell selection.
//!
//! A masked tile delivery can fill its budget by pulling visible points from deeper importance
//! buckets. [`WalkBench::independent`] walks each tile in isolation and can repeat an ancestor's
//! delivery. [`WalkBench::chained`] recomputes the ancestor chain under the same mask and excludes
//! every position it already delivered.
//!
//! The base column is bucket-major, following the cascade's coarse-to-fine assignment. A tile at
//! zoom z with span exponent m schedules bucket z + m inside its extent. The root schedules buckets
//! `0..=m` whole. The unmasked budget is the scheduled count before masking. A bucket walk admits
//! visible, untaken scheduled points, then fills from deeper buckets in bucket order and Morton
//! order within a bucket, stopping at its target or exhaustion. Scheduled admissions can already
//! exceed a coverage-derived target.
//!
//! [`FillRule`] chooses the target or a representative-selection rule. [`FillRule::Coverage`]
//! subtracts inherited deliveries from the visible cut-cell count. [`FillRule::CoverageCells`]
//! instead tracks represented cells and fills only uncovered ones. [`VisibleCellPyramid`] supplies
//! these cell counts, while [`WalkBench::visible_cascade`] supplies the visible-only cascade's
//! schedule for comparison. At the cascade's deepest cut, its catch-all can deliver more than one
//! point per occupied cell. [`WalkBench::audit`] separates the target, delivered count and occupied
//! cells.
//!
//! The rank-representative rules resolve each unrepresented grid cell to its best-ranked visible
//! point. [`WalkBench::deliver`] scans each selected cell for that point.
//! [`WalkBench::served_deliver`] reads a [`ServedGeneration`]: a visible-only cascade at
//! [`Depth::MAX`], sorted into bucket-major order. Below the catch-all, a depth-d occupied cell has
//! exactly one point in buckets at or below d. Range lengths then count cells without scanning
//! every point. Refinement adds grid-planning work to either engine.
//!
//! The scanning engine provides a comparison oracle, but the served engine's refinement counts
//! treat catch-all entries as distinct cells. Exact-key duplicates can make the engines choose
//! different grids and deliveries when refinement reaches [`Depth::MAX`]. Direct representative
//! extraction deduplicates exact keys. Uniform-grid delivery deliberately keeps every catch-all
//! entry for terminal completeness.
//!
//! Noninterference comparisons hold visible keys, relative ranks and the schedule fixed. Under
//! these conditions, [`FillRule::CoverageRank`] and constant-budget refinements depend on the
//! visible view alone. [`DotBudget::Scheduled`] reads the unmasked corpus and does not have that
//! property. [`WalkBench::visible_only`] preserves existing keys and ranks rather than fitting the
//! visible rows again.
//!
//! [`WalkBench::build`] synthesizes a clustered corpus. [`WalkBench::mask_uniform`] hides rows by
//! independent draws, while [`WalkBench::mask_clustered`] hides spatial blocks to exercise long
//! fills. The probes return counts and delivered positions through the benchmark facade. Their work
//! counters are engine-specific, and wall time belongs to the benchmark target.

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

/// One tile's target, delivered counts and engine-specific work count.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Selection {
    /// The count the fill runs to, which [`FillRule`] chooses.
    ///
    /// Under [`FillRule::Unmasked`] it is the scheduled count before masking.
    pub budget: usize,
    /// Visible, untaken scheduled points, or all new representatives under a rank rule.
    pub natural: usize,
    /// Points pulled from deeper buckets, zero under a rank rule.
    pub tail: usize,
    /// The engine's work count, summed over the chain for chained deliveries.
    ///
    /// Bucket walks count examined positions, including hidden and taken ones. Scanning rank rules
    /// count cell ranges visited plus points scanned for representatives. Served rank rules count
    /// selected range operations, merge entries and population-search probes. This is not a
    /// complete count of memory reads or directly comparable work across engines.
    pub scanned: usize,
}

/// The count one masked delivery fills to at every level of its chain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum FillRule {
    /// The level's scheduled count before masking.
    Unmasked,
    /// The level cut's cells holding a visible point, less the chain's deliveries inside the cell.
    ///
    /// The target uses [`VisibleCellPyramid`] counts and inherited delivery counts. The inherited
    /// output can itself depend on hidden rows through the unmasked bucket assignment.
    Coverage,
    /// The level's visible scheduled count, which its own admissions meet.
    Visible,
    /// The level cut's cells holding a visible point, less the cells the chain already represents.
    ///
    /// The fill admits only points whose cut cell has no delivered point. Scheduled admissions
    /// still deliver whole, including co-located points in the catch-all.
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
/// [`FillRule::Refined`] tests successively finer whole grids until the next grid exceeds
/// [`budget`](Self::budget), then tries individual cells one level further in
/// [`order`](Self::order). The cut grid is always the minimum resolution, even when its delivery
/// exceeds the budget. Choose both fields explicitly. [`DotBudget::Constant`] fixes the budget
/// independently of the corpus, while [`DotBudget::Scheduled`] derives it from unmasked rows.
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
/// A constant is independent of hidden rows. The scheduled form uses the corpus before masking and
/// can change the delivered count when hidden rows change.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DotBudget {
    /// One count for every tile.
    Constant(usize),
    /// The tile's own scheduled count before masking.
    ///
    /// Refinement can undershoot this count when no finer split fits or exceed it at the cut-depth
    /// floor. It does not promise the unmasked rule's density.
    Scheduled,
}

/// The order a partial refinement visits one level's cells in.
///
/// Cell index and visible population determine these visit orders. The order adds no dependence on
/// hidden rows, but a [`DotBudget::Scheduled`] refinement still reads the unmasked corpus.
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
    /// Occupied cut-cell count, or all visible entries at a served catch-all cut.
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
    /// The engine-specific work count across the chain, as in [`Selection::scanned`].
    pub scanned: usize,
}

/// One cell census per delivery cut depth over the visible view.
///
/// Level `d` holds, ascending, every depth-`d` cell index containing at least one visible point.
/// The levels span the cut depths `m` through `z_max + m` a tile schedule reads.
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
/// The rank column retains the corpus-wide ranks. Restricting that order to visible rows preserves
/// each cell's representative when hidden rows disappear, provided the visible keys and relative
/// ranks remain unchanged. A fresh fit or ranking of changed inputs is outside this comparison.
#[derive(Debug)]
pub struct VisibleColumn {
    /// Visible points ascending by key.
    points: Box<[VisiblePoint]>,
}

/// The visible-view artifacts a fill rule's target reads.
///
/// [`FillRule::Coverage`] and [`FillRule::CoverageCells`] read cell counts out of the pyramid.
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
    /// Pairs cell counts and representatives for one visible view.
    ///
    /// Both artifacts must describe the same corpus and mask. Construction does not compare them.
    #[must_use]
    pub const fn new(pyramid: &'view VisibleCellPyramid, column: &'view VisibleColumn) -> Self {
        Self { pyramid, column }
    }
}

/// Where a served generation keeps its key column.
///
/// A visible entry's base position also identifies its key in the corpus-wide column. Inline keys
/// cost eight extra bytes per visible row. Shared keys require an indirect read through the base
/// position at each key comparison.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GenerationLayout {
    /// Keys beside the positions, eight further bytes per visible row.
    Inline,
    /// Keys read through the position from the corpus-wide base column.
    Shared,
}

/// A visible-only cascade in bucket-major order with a population index.
///
/// The visible points cascade alone at the finest grid, then sort by bucket, key and rank. For a
/// cell extent no deeper than d, with d below [`Depth::MAX`], the buckets-at-or-below-d ranges
/// contain exactly one best-ranked representative per occupied depth-d cell. Their lengths count
/// cells. At the maximum depth, exact-key duplicates also enter the catch-all and these lengths
/// count points instead.
///
/// The separate key-sorted index permits cell-population queries without searching each bucket. A
/// cell occupies one contiguous interval in this index.
///
/// Cascading to [`Depth::MAX`] supports refinement below the schedule's deepest cut. The catch-all
/// retains every point that never claimed a distinct cell.
///
/// Delivery methods require the generation's original corpus and mask. Even the inline-key layout
/// contains base positions belonging to that corpus. No generation identity check enforces this
/// pairing.
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
/// grid. [`VisibleCascade::schedule`] returns one tile's scheduled count under that assignment, and
/// [`VisibleCascade::covered`] returns the cumulative point count at its cut. Below the catch-all,
/// this cumulative count equals occupied-cell coverage. At the catch-all it can exceed coverage.
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

/// A corpus and visibility mask for comparing tile-delivery rules.
///
/// [`Self::build`] produces a clustered fixture, and [`Self::from_parts`] accepts existing cascade
/// artifacts. Per-view pyramids, columns and served generations must come from this corpus under
/// its current mask. Rebuild them after replacing the mask. These methods check no artifact
/// provenance.
///
/// Tile-delivery addresses must be on-grid and within [`Self::max_zoom`], with cuts inside the key
/// width. Some early returns precede validation. For a root gather or uniform-grid delivery, the
/// implementation ignores x and y.
///
/// [`Self::visible_only`] retains original row identities and can leave a sparse row domain. Mask
/// replacement methods require row ids dense in the resident row count. Use a sparse visible-only
/// corpus without remasking.
///
/// # Example
///
/// With the `bench` feature, compare independent and chained delivery on co-located points. Row
/// zero represents the root, and row one occupies the depth-one catch-all. Hiding row zero makes
/// the root fill with row one:
///
/// ```rust
/// use hash_graph_atlas::bench::lod::WalkBench;
///
/// let mut bench = WalkBench::from_parts(&[0, 0], &[1, 1], vec![0, 1], 0, 1);
/// bench.mask_rows([1]);
/// assert_eq!(bench.independent_delivery(0, 0, 0), vec![1]);
/// assert_eq!(bench.independent_delivery(1, 0, 0), vec![1]);
/// assert!(bench.chained_delivery(1, 0, 0).is_empty());
/// ```
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
///
/// # Panics
///
/// Panics when the columns differ in length or their count exceeds `u32::MAX`.
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
///
/// Absent rows receive [`BasePosition::MAX`]. The rows must be distinct, lie below `domain` and
/// number at most `u32::MAX`.
///
/// # Panics
///
/// Panics on a repeated row, a row outside `domain` or a position beyond the base-position domain.
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

/// Orders base positions by their corpus-wide key ordinal.
///
/// Three stable 11-bit radix passes cover all 32 ordinal bits.
///
/// # Panics
///
/// Panics when a position lies outside `key_order_of_position`.
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
    /// The corpus mixes eight Gaussian clusters with a uniform background to populate deep cells
    /// and exercise long descent paths. Equal `(points, seed)` pairs repeat within the same
    /// floating-point and sorting implementation. The mask starts all-visible.
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

        // the scan machinery uses raw u32 values, while id-indexed storage retains its domain
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

    /// Builds a delivery probe over supplied cascade artifacts.
    ///
    /// `code_bits` contains base-order keys. `lengths` gives each bucket's length in depth order,
    /// with omitted trailing buckets empty. `row_of_position` must permute `0..code_bits.len()`.
    /// The mask starts all-visible.
    ///
    /// Row ids stand in for importance ranks: rank-representative rules select the lowest row id in
    /// a cell. Keys within each bucket must ascend by `(key, row id)`. The bucket assignment must
    /// be the cascade for these ranks and the supplied schedule. The schedule requires `span +
    /// max_zoom ≤ 32`. Construction checks lengths, the row permutation and the individual
    /// parameter domains, but not sortedness, cascade agreement or the depth sum.
    ///
    /// # Panics
    ///
    /// Panics when lengths overrun the bucket table or fail to cover the code column, the columns
    /// differ in length, the row count exceeds `u32::MAX`, a row is repeated or out of range, `span
    /// ≥ 64`, or `max_zoom > 32`.
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
    /// A row is visible when its discrete uniform draw in `[0, 1)` is below `visible`. Values at
    /// least one show every row, and nonpositive values or NaN hide every row. Equal `(visible,
    /// seed)` pairs reproduce the mask for the same row count. Row ids must be dense in the
    /// resident row count.
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

    /// Replaces the mask by hiding rows in randomly drawn spatial blocks.
    ///
    /// `visible` must lie in `[0, 1]`, and row ids must be dense in the resident row count. The
    /// quota is ⌊(1 − visible) · rows⌋ after `f64` arithmetic. Drawn cells have depths 4 through 7.
    /// The last block can be partially hidden to meet the quota exactly. Spatially contiguous
    /// hiding exercises fills whose scheduled runs contain no visible rows.
    ///
    /// The loop has no iteration bound. A negative `visible` can request more hidden rows than
    /// exist and prevent termination.
    ///
    /// # Panics
    ///
    /// Panics when a retained row id lies outside the resident row count.
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
    /// Repeated ids have no additional effect. Row ids must lie in the resident row count,
    /// including after a [`Self::visible_only`] transformation.
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
    /// Includes every visible point in buckets at or below `z + m`. With full visibility, this is
    /// the unmasked chain's cumulative delivery inside the tile.
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

    /// Returns the tile's scheduled count before masking.
    ///
    /// The schedule's maximum zoom is not checked here.
    ///
    /// # Panics
    ///
    /// Panics when the coordinate lies off the grid, `z > 32`, or `z + span > 32`.
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
    /// The walk recomputes each ancestor's delivery against the same mask, top down, and excludes
    /// everything it took. An ancestor that exhausts its visible, untaken candidates below budget
    /// ends the chain. Every descendant extent is a subset of that exhausted extent and has no
    /// eligible point left. The tile then delivers nothing. [`Selection::scanned`] sums the chain's
    /// scans, while the other counts describe the tile itself.
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

    /// Returns one tile's new positions after recomputing its ancestor chain.
    ///
    /// Positions follow delivery order. The chain and early exit follow [`Self::chained`], with an
    /// empty delivery after ancestor exhaustion.
    ///
    /// # Panics
    ///
    /// May panic on an off-grid coordinate, a zoom beyond the schedule or an unrepresentable cut.
    /// Ancestor exhaustion can return before checking the target address.
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
    /// The footprint is sixteen bytes per visible row, which [`VisibleColumn::footprint`] reports.
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
    /// Panics when `z` exceeds the schedule's maximum zoom or a non-root coordinate lies off its
    /// grid. The root ignores x and y.
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
    ///
    /// # Panics
    ///
    /// Panics when `position` lies outside the corpus or its row lies outside the mask domain.
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
    /// The visible keys enter the production cascade at the same deepest grid, preserving their
    /// relative rank order, then sort into base delivery order. Original row ids remain intact:
    /// [`Self::rows`] over either corpus names the same rows. Keys are copied without fitting or
    /// normalization.
    ///
    /// Comparing the two corpora tests whether a rule's delivered sequence depends on hidden rows
    /// when visible keys, relative ranks and schedule are fixed. Reading a hidden quantity can
    /// change a result, but need not do so for every fixture.
    ///
    /// Retained row ids can be sparse. Mask replacement methods require dense row ids within the
    /// resident count, which this transformation does not establish.
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
    /// chooses whether each entry stores its key: [`GenerationLayout::Shared`] recovers it from the
    /// corpus base column through the entry's position. Including the population index, the shared
    /// columns use eight bytes per visible row and the inline columns sixteen.
    ///
    /// [`ServedGeneration::footprint`] reports the bytes.
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

    /// Assigns visible-generation buckets by nearest-better-neighbour deletion.
    ///
    /// Keys sharing a cell form a contiguous interval in key order. For any point, the nearest
    /// better-ranked key on either side attains that side's deepest shared grid. Deleting points
    /// worst-rank-first from a key-ordered list exposes exactly these neighbours. Therefore two
    /// sorts and one linear deletion pass recover the first-separation bucket assignment.
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
    ///
    /// Positions must be distinct and sorted by their corpus keys and ranks.
    ///
    /// # Panics
    ///
    /// Panics when a position lies outside the corpus or the entry count exceeds `u32::MAX`.
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
    /// The base order has 33 `(key, rank)`-ordered runs, one per bucket. Transposing the row mask
    /// to base positions restricts each run without sorting. A 33-way merge produces visible key
    /// order for the monotonic-stack assignment.
    ///
    /// # Complexity
    ///
    /// For N resident rows, a mask domain of D rows and V visible rows, time is O((N + D)/64 + V
    /// log 33). Temporary storage is O(N/64 + V), with no additional corpus-wide key index.
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
    /// Each visible row sets its shared key ordinal in a temporary bit set. Iterating that set is
    /// the visible restriction of `(key, rank)` order. One monotonic-stack pass then finds both
    /// nearest better-ranked neighbours, and one counting distribution produces bucket-major order.
    /// With N resident rows, a mask domain of D rows and V visible rows, time is O((N + D)/64 + V)
    /// and temporary storage is O(N/64 + V).
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
    /// order. For a mask domain of D rows and V visible rows, mask iteration costs O(D/64 + V). Its
    /// three fixed-width radix passes, monotonic stack and bucket distribution each cost O(V), with
    /// O(V) temporary storage.
    #[must_use]
    pub fn radix_generation(&self, layout: GenerationLayout) -> ServedGeneration {
        let positions = self.visible.iter().map(|row| self.position_of_row[row]);
        let positions = radix_key_order(positions, &self.key_order_of_position);
        self.generation_from_key_order(layout, positions)
    }

    /// Counts surviving entries that moved shallower or deeper under a mask.
    ///
    /// `full` must cover this whole corpus and `masked` its current visible view. The returned pair
    /// is `(shallower, deeper)`.
    ///
    /// # Properties
    ///
    /// Removing rows restricts each survivor's set of better-ranked neighbours. With fixed keys and
    /// relative ranks, the maximum shared depth cannot increase. Therefore no surviving bucket
    /// moves deeper, and the second count is zero for matching full and masked generations.
    ///
    /// # Panics
    ///
    /// Panics when artifact lengths differ from the expected full and visible counts, a position
    /// lies outside the corpus, or a masked position is absent from `full`. Equal lengths establish
    /// neither corpus nor mask agreement.
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
    ///
    /// Columns must be entry-aligned, with distinct ranks and a valid bucket assignment.
    ///
    /// # Panics
    ///
    /// Panics when the key count exceeds `u32::MAX` or an entry has no corresponding position, rank
    /// or bucket.
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
    /// position in `order`. Both orders cover the same occupied cells. Cumulative counts below the
    /// catch-all agree. With positive span, per-tile scheduled counts agree too. With zero span,
    /// changing an ancestor's representative can change a child's own scheduled count. At the
    /// catch-all, cumulative counts include all visible points.
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
    /// [`FillRule::Unmasked`] reproduces [`Self::chained`]'s counts. Other bucket rules change the
    /// target and exhaustion test. Rank rules resolve unrepresented cells in key order and do not
    /// use the exhaustion exit. [`Selection::budget`] holds the tile's own target under `rule`. The
    /// artifacts must satisfy [`VisibleView`]'s corpus and mask pairing.
    ///
    /// # Panics
    ///
    /// May panic on an invalid tile address, an unrepresentable cut or mismatched view artifacts.
    /// Ancestor exhaustion can return before checking the maximum zoom.
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
    /// Exhausted bucket-walk chains return an empty delivery, as [`Self::chained_delivery`] does.
    /// The view must describe this corpus and its current mask.
    ///
    /// # Panics
    ///
    /// May panic on an invalid tile address, an unrepresentable cut or mismatched view artifacts.
    /// Ancestor exhaustion can return before checking the maximum zoom.
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
    /// May panic on an invalid tile address, an unrepresentable cut or mismatched view artifacts.
    /// Ancestor exhaustion can return before checking the maximum zoom.
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
    /// Scans the corpus under its current mask, independently of cached view artifacts. Depths
    /// shallower than the tile are permitted and identify containing cells. The schedule's maximum
    /// zoom is not checked.
    ///
    /// # Panics
    ///
    /// Panics when `z > 32` or the coordinate lies off its grid.
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
    /// The delivery follows [`Self::deliver`]. The audit additionally counts the cut-depth cells
    /// occupied by the chain's deliveries inside the tile, separating the target from achieved
    /// coverage.
    ///
    /// # Panics
    ///
    /// May panic on an invalid tile address, an unrepresentable cut or mismatched view artifacts.
    /// Ancestor exhaustion can return before checking the maximum zoom.
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
    /// Rank-representative rules use the visible column. Count-based rules use the bucket walk.
    ///
    /// # Panics
    ///
    /// May panic on an invalid tile address, a cut beyond the key width or mismatched view
    /// artifacts.
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

    /// Delivers one tile's new cell representatives after recomputing its chain.
    ///
    /// Every level resolves its grid and delivers the best-ranked visible point of each cell that
    /// no chain delivery represents, ascending by cell index. [`RankPlan::Coarse`] uses the level
    /// cut. [`RankPlan::Refined`] chooses a finer grid, optionally deepening individual cells. The
    /// representative choices use the visible column, but a scheduled refinement budget also reads
    /// the unmasked bucket counts.
    ///
    /// # Panics
    ///
    /// Panics on an invalid tile address or cut depth. A column from another corpus can also
    /// contain out-of-range positions.
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
            // the cut grid is the minimum resolution, even when its target exceeds the budget
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
    /// Uses generation ranges to select representatives. See the module's catch-all limitation
    /// before comparing this with [`Self::deliver`]: exact-key duplicates can change refinement
    /// choices at the maximum depth. `generation` must describe this corpus and mask.
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

    /// Returns a served chain's cumulative positions inside one tile.
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
    /// Compare with [`Self::audit`] using the same corpus and mask. [`ChainAudit::scanned`] uses
    /// the served engine's work counter. At a cut of [`Depth::MAX`], `covered` counts all visible
    /// entries, including exact-key duplicates, rather than distinct cells. Refinement has the
    /// module's catch-all limitation.
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
    /// Returns positions in ascending key order, one best-ranked point per occupied cell. At
    /// [`Depth::MAX`], exact-key deduplication removes catch-all duplicates. `generation` must
    /// describe this corpus and mask.
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
    /// The grid is d(z) = min(z + m + k, 32), where m is the schedule span and k is
    /// `additional_depth`.
    ///
    /// # Panics
    ///
    /// Panics when `z` exceeds the schedule's maximum zoom or `additional_depth ≥ 64`.
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

    /// Reads one delta or cumulative prefix in generation-bucket order.
    ///
    /// `previous` is the parent tile's grid depth. The read starts one bucket below it, or at the
    /// shallowest bucket when a cumulative read or the root passes `None`. The root ignores x and
    /// y.
    ///
    /// # Panics
    ///
    /// Panics on an off-grid non-root coordinate. Mismatched generation positions can also exceed
    /// the corpus key column.
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

    /// Delivers one uniform-grid tile in generation-bucket order.
    ///
    /// A fixed `additional_depth` makes successive grids differ by one depth until saturation. The
    /// root reads the prefix through [`Self::uniform_grid_depth`]. Each non-root delta reads the
    /// next bucket, or nothing when both grids have saturated.
    ///
    /// Before [`Depth::MAX`], accumulating these deltas gives exactly one best-ranked visible point
    /// per occupied cell of the public grid. At [`Depth::MAX`], the catch-all bucket also carries
    /// entries sharing an exact key.
    ///
    /// # Panics
    ///
    /// Panics when `z` exceeds the schedule's maximum zoom, `additional_depth ≥ 64`, or a non-root
    /// coordinate lies off its grid. Mismatched generation positions can also exceed the corpus key
    /// column. The root ignores x and y.
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

    /// Accumulates a uniform grid inside one tile in generation-bucket order.
    ///
    /// The result is the visible-only generation prefix through [`Self::uniform_grid_depth`],
    /// narrowed to the tile cell. Accumulating [`Self::uniform_delivery`] down the tile's ancestor
    /// chain yields the same set.
    ///
    /// # Panics
    ///
    /// Panics when `z` exceeds the schedule's maximum zoom, `additional_depth ≥ 64`, or a non-root
    /// coordinate lies off its grid. Mismatched generation positions can also exceed the corpus key
    /// column. The root ignores x and y.
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
    /// one additional level globally. Before saturation, a non-root transition delta reads two
    /// consecutive generation buckets and later regular deltas read one. The deepest zoom reads
    /// through [`Depth::MAX`] to include every remaining visible point. Delivery stays in
    /// generation-bucket order.
    ///
    /// # Panics
    ///
    /// Panics when `z` exceeds the schedule's maximum zoom or a non-root coordinate lies off its
    /// grid. Mismatched generation positions can also exceed the corpus key column. The root
    /// ignores x and y.
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
    /// Panics when `z` exceeds the schedule's maximum zoom or a non-root coordinate lies off its
    /// grid. Mismatched generation positions can also exceed the corpus key column. The root
    /// ignores x and y.
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
    /// index. The generation must describe this corpus and mask.
    ///
    /// # Panics
    ///
    /// Panics on an invalid tile address or cut depth. Mismatched generation positions can also
    /// exceed the corpus key column.
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
    /// Below the catch-all, prefix range lengths count occupied cells. Within a cell, the next
    /// bucket plus its existing representative counts occupied children. The key index supplies
    /// visible populations. These range identities avoid scanning every point, but count exact-key
    /// duplicates as separate cells at the catch-all.
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

    /// Returns the chosen whole-grid depth, its budget and the search work count.
    ///
    /// The cut grid is the minimum resolution even when its target exceeds the budget. Each
    /// candidate grid adds the next bucket's length and subtracts distinct represented cells. Below
    /// the catch-all, this gives the new representative count without scanning points. Catch-all
    /// duplicates can overestimate it. The work count includes passes over the inherited keys.
    ///
    /// # Panics
    ///
    /// May panic on an invalid address, an unrepresentable cut or inconsistent range and
    /// inherited-key counts.
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
    /// Returns target growth, deepened-cell count and work count. Below the catch-all, the next
    /// bucket plus the parent representative counts occupied children. With no remaining budget,
    /// only zero-growth splits can fit. Selecting them is independent of visit order, which makes
    /// population searches unnecessary.
    ///
    /// # Panics
    ///
    /// May panic when scratch columns, grid ranges or inherited keys disagree.
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
        // Splitting an unrepresented cell into at least two children increases the target. If no
        // grid cell is represented and no budget remains, every eligible split has positive cost.
        // Therefore no child or population lookup can select a split.
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
    /// Deduplicates exact keys, retaining the best-ranked representative. Returns the work count
    /// for range reads and merges.
    ///
    /// # Panics
    ///
    /// Panics when a range or a shared-layout position lies outside its column.
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
        // Equal keys share every cell. Merges retain shallower buckets first, and each bucket
        // orders equal keys by rank. Therefore exact-key deduplication retains the best-ranked
        // representative, including when all duplicates occupy the catch-all.
        scratch.candidates.dedup_by_key(|&mut (key, _)| key);

        reads
    }

    /// Reads each depth-`depth` cell's visible population out of the generation's key index.
    ///
    /// Returns the number of counted search probes. `cells` must match the occupied-cell count at
    /// `depth` within `cell`, and the generation must describe this corpus.
    ///
    /// # Panics
    ///
    /// Panics when `cells` exceeds that count or an indexed position lies outside its column.
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
    /// `history` groups deliveries by the deepest chain cell containing them. Entries from `z`
    /// onward are exactly the deliveries inside this level's cell. Other rules leave `represented`
    /// unchanged.
    ///
    /// # Panics
    ///
    /// Panics when a selected history position lies outside the corpus.
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
    ///
    /// # Panics
    ///
    /// Panics when a position lies outside the corpus.
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
    /// scheduled admissions deliver whole, even if they exceed the target or repeat represented
    /// cells. The tail fills a count or uncovered cells according to `fill`.
    ///
    /// # Panics
    ///
    /// Panics on an invalid tile address, a cut beyond the key width or a row outside the mask
    /// domain.
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
    /// A zero-sized `taken` set excludes nothing. This method treats positions outside that set's
    /// domain as untaken.
    ///
    /// # Panics
    ///
    /// Panics when `position` lies outside the corpus or its row lies outside the mask domain.
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

    /// Returns the number of occupied cells at one depth.
    ///
    /// # Panics
    ///
    /// This panics when `depth` lies outside the pyramid's levels.
    #[must_use]
    pub fn occupied(&self, depth: Depth) -> usize {
        self.level(depth).len()
    }

    /// Returns the pyramid's depths, shallowest first.
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

    /// Returns one depth's occupied cells in ascending order.
    ///
    /// # Panics
    ///
    /// Panics when `depth` lies outside the pyramid's levels.
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

    /// Replaces `out` with the range's occupied cells in ascending cell order.
    ///
    /// # Panics
    ///
    /// Panics when a nonempty range extends beyond the column.
    fn split(&self, range: Range<usize>, depth: Depth, out: &mut Vec<Range<usize>>) {
        out.clear();
        let mut at = range.start;
        while at < range.end {
            let end = self.cell_end(at, range.end, depth);
            out.push(at..end);
            at = end;
        }
    }

    /// Returns the end of the first occupied cell in `at..end`.
    ///
    /// # Panics
    ///
    /// Panics when `at` lies outside the column, `end` exceeds it or `at > end`.
    fn cell_end(&self, at: usize, end: usize, depth: Depth) -> usize {
        let prefix = MortonKey::from_bits(self.points[at].key).prefix(depth);
        let slice = &self.points[at..end];

        at + slice.partition_point(|point| MortonKey::from_bits(point.key).prefix(depth) <= prefix)
    }

    /// Returns the depth-`depth` cell containing the point at `at`.
    ///
    /// # Panics
    ///
    /// Panics when `at` lies outside the column.
    fn cell_of_slice(&self, at: usize, depth: Depth) -> MortonCell {
        MortonKey::from_bits(self.points[at].key).cell(depth)
    }

    /// Returns the base position of the slice's best-ranked point.
    ///
    /// The range must be nonempty. A rank tie resolves to the earliest point in the range, although
    /// valid corpus ranks are distinct.
    ///
    /// # Panics
    ///
    /// Panics when the range starts outside the column or is invalid for slicing.
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

    /// Returns an entry's inline key or resolves it through its base position.
    ///
    /// # Panics
    ///
    /// Panics when `index` lies outside the generation or a shared-layout position lies outside
    /// `codes`.
    fn key(&self, index: usize, codes: &[MortonKey]) -> u64 {
        self.keys.as_ref().map_or_else(
            || codes[self.positions[index] as usize].to_bits(),
            |keys| keys[index],
        )
    }

    /// Returns the key at one ordinal of the ascending population index.
    ///
    /// # Panics
    ///
    /// Panics when `at` lies outside the index or [`Self::key`] cannot resolve its entry.
    fn ascending_key(&self, at: usize, codes: &[MortonKey]) -> u64 {
        self.key(self.ascending[at] as usize, codes)
    }

    /// Narrows every bucket range of an enclosing extent to the entries inside `cell`.
    ///
    /// Searching the enclosing extent's ranges restricts work to the current subtree. `within` must
    /// contain `cell`'s entries, and shared-layout keys must come from this generation's original
    /// corpus.
    ///
    /// # Panics
    ///
    /// Panics when a searched range or shared-layout position lies outside its column.
    fn narrowed(&self, cell: MortonCell, within: &Ranges, codes: &[MortonKey]) -> Ranges {
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());

        core::array::from_fn(|bucket| {
            let range = within[bucket].clone();
            let start = self.partition(range.clone(), codes, |key| key < low);
            let end = self.partition(start..range.end, codes, |key| key <= high);
            start..end
        })
    }

    /// Returns the key index's range inside `cell`.
    ///
    /// # Panics
    ///
    /// Panics when a shared-layout position lies outside `codes`.
    fn ascending_range(&self, cell: MortonCell, codes: &[MortonKey]) -> Range<usize> {
        let (low, high) = (cell.min_key().to_bits(), cell.max_key().to_bits());
        let start = self.ascending_partition(0..self.ascending.len(), codes, |key| key < low);
        let end = self.ascending_partition(start..self.ascending.len(), codes, |key| key <= high);

        start..end
    }

    /// Returns the first cell's end in `at..end` and the counted search probes.
    ///
    /// Requires a nonempty range in the ascending index. The work count excludes the initial prefix
    /// lookup.
    ///
    /// # Panics
    ///
    /// Panics when a probed ordinal or shared-layout position lies outside its column.
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

        // doubling from the start before binary search makes probe count logarithmic in the current
        // cell's population, rather than the enclosing extent
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
    ///
    /// `before` must be true on an initial prefix and false thereafter.
    ///
    /// # Panics
    ///
    /// Panics when a probed entry or shared-layout position lies outside its column.
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

    /// Returns the first ordinal of the key-index range whose key fails `before`.
    ///
    /// `before` must be true on an initial prefix and false thereafter.
    ///
    /// # Panics
    ///
    /// Panics when a probed ordinal or shared-layout position lies outside its column.
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
    /// Panics when `z > 32`, the coordinate lies off its grid or `z + span > 32`.
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
    /// Panics when `z > 32`, the coordinate lies off its grid or `z + span > 32`.
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
    /// Cut-cell count, including duplicates when a served cut reaches the catch-all.
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
    /// The engine-specific work count, as in [`Selection::scanned`].
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
/// Returns `true` when a point is appended. `range` must be nonempty, and `represented` must ascend
/// by key.
///
/// # Panics
///
/// Panics when the range starts outside the column or is invalid for slicing.
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
/// Returns target growth, deepened-cell count and the number of child ranges examined. A cell of
/// fewer than two points, and a cell whose finer split holds a single child, stay whole: deepening
/// either one adds no representative. `cells` must be nonempty ranges of depth-`depth` cells,
/// `finer` their next depth, and `represented` an ascending key list.
///
/// # Panics
///
/// Panics when a cell range lies outside the column. Inconsistent grids can also make the
/// target-growth subtraction underflow.
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
///
/// Cell ranges must be nonempty, and `represented` must ascend by key.
///
/// # Panics
///
/// Panics when a cell range starts outside the column.
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
/// When the extent is a cell no deeper than `depth`, this is its occupied-cell count below the
/// catch-all: the cascade assigns exactly one cumulative representative per cell. At the catch-all,
/// it includes exact-key duplicates.
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
/// Equal keys keep the accumulated entry first. Merging buckets shallowest-first preserves the
/// shallower representative.
///
/// # Panics
///
/// Panics when a run entry or shared-layout position lies outside its column.
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
///
/// Candidates and held keys must ascend. Each candidate must represent one distinct cell at
/// `depth`.
///
/// # Panics
///
/// Panics when `occupied` has fewer entries than `candidates`.
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

/// Computes child and unrepresented-child counts from one finer bucket.
///
/// Candidates, finer entries and held keys must ascend. Each candidate represents one distinct
/// cell, and `finer` must be one depth below `depth`. Counts equal occupied children only before
/// the catch-all or when exact keys are distinct.
///
/// # Panics
///
/// May panic when inherited keys represent more children than the supplied entries count.
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
        // the parent representative supplies one child, and the next bucket supplies the others
        // below the catch-all
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
/// A whole cell delivers its representative unless already represented. For a deepened cell, merge
/// the parent representative with the finer bucket and omit represented children. The merge
/// preserves key order across the mixed-depth grid. Catch-all duplicates in the finer bucket are
/// not deduplicated here.
///
/// # Panics
///
/// Panics when `cells` exceeds a scratch column's length.
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

/// Appends one child representative, checking inherited coverage when `tested` is true.
///
/// If `tested` is false, the child must be unrepresented. `held` must ascend by key.
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

/// Returns the cells the extent covers at `cut`, for rules deriving a target from them.
///
/// Other rules return zero.
///
/// # Panics
///
/// For a coverage rule, panics when the pyramid lacks `cut` or the cut is shallower than `cell`.
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

/// Returns every bucket's full segment as scan offsets.
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
    use core::ops::RangeInclusive;
    use std::collections::HashSet;

    use proptest::{
        prop_assert, prop_assert_eq, prop_oneof, property_test,
        sample::Index,
        strategy::{Just, Strategy},
    };

    use super::{
        ChainAudit, DotBudget, FillRule, GenerationLayout, RefineOrder, Refinement,
        ServedGeneration, VisibleRankOrder, VisibleView, WalkBench, cell_of,
    };
    use crate::morton::{Depth, MortonKey};

    /// The corpus scale the module's exhaustive checks run at.
    const POINTS: usize = 8_000;

    /// The fixture seed.
    const SEED: u64 = 0x0C0F_F111;

    /// The dot budget the refinement checks run under: the cells one tile's cut grid holds.
    const BUDGET: usize = 4096;

    /// A secondary budget: 4⁵ = 1024 cells, one subdivision coarser than the default cut grid.
    const KNEE: usize = 1024;

    /// The corpus scales a property builds per case.
    ///
    /// Bounds repeated fixture construction while providing clustered inputs for cell sharing and
    /// refinement.
    const CORPUS: RangeInclusive<usize> = 64..=1_024;

    /// The visible fractions a property masks with, from everything hidden to nothing.
    const VISIBLE: RangeInclusive<f64> = 0.0..=1.0;

    /// The constant budgets a property refines under.
    ///
    /// From one dot to twice the largest corpus: budgets the cut-depth floor overrides, budgets
    /// that bind, and budgets nothing reaches.
    const BUDGETS: RangeInclusive<usize> = 1..=2_048;

    /// Builds the fixed fixture under a uniform or clustered mask.
    ///
    /// A clustered mask requires `visible` in `[0, 1]` as in [`WalkBench::mask_clustered`].
    fn masked(clustered: bool, visible: f64) -> WalkBench {
        corpus(POINTS, SEED, clustered, visible)
    }

    /// Builds a corpus of `points` rows from `seed` and masks it with the same seed.
    ///
    /// A clustered mask requires `visible` in `[0, 1]` as in [`WalkBench::mask_clustered`].
    ///
    /// # Panics
    ///
    /// Panics when `points` is zero or exceeds `u32::MAX`.
    fn corpus(points: usize, seed: u64, clustered: bool, visible: f64) -> WalkBench {
        let mut bench = WalkBench::build(points, seed);
        if clustered {
            bench.mask_clustered(visible, seed);
        } else {
            bench.mask_uniform(visible, seed);
        }

        bench
    }

    /// Generates every refinement order.
    fn refine_order() -> impl Strategy<Value = RefineOrder> {
        prop_oneof![
            Just(RefineOrder::Whole),
            Just(RefineOrder::Morton),
            Just(RefineOrder::Population),
        ]
    }

    /// Generates constant-budget refinements over [`BUDGETS`].
    fn constant_refinement() -> impl Strategy<Value = FillRule> {
        (BUDGETS, refine_order()).prop_map(|(budget, order)| {
            FillRule::Refined(Refinement {
                budget: DotBudget::Constant(budget),
                order,
            })
        })
    }

    /// Generates scheduled-budget refinements in every order.
    fn scheduled_refinement() -> impl Strategy<Value = FillRule> {
        refine_order().prop_map(|order| {
            FillRule::Refined(Refinement {
                budget: DotBudget::Scheduled,
                order,
            })
        })
    }

    /// Generates rank rules whose delivery depends only on the fixed visible view.
    ///
    /// Includes the coarse rule and constant-budget refinements. The scheduled budget reads
    /// unmasked corpus counts and is excluded from this comparison.
    fn hidden_independent_rule() -> impl Strategy<Value = FillRule> {
        prop_oneof![
            1 => Just(FillRule::CoverageRank),
            3 => constant_refinement(),
        ]
    }

    /// Generates the served engine's coarse and refined rule families.
    fn served_rule() -> impl Strategy<Value = FillRule> {
        prop_oneof![
            1 => Just(FillRule::CoverageRank),
            6 => constant_refinement(),
            3 => scheduled_refinement(),
        ]
    }

    /// Returns every refinement order under one budget.
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

    /// Returns the coarse rule and refinements under both constant budgets and the schedule.
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

    /// Expands bucket segments into one bucket per base position.
    ///
    /// Positions absent from the generation retain [`Depth::MAX`].
    ///
    /// # Panics
    ///
    /// Panics when a generation position is at least `positions`.
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

    /// Returns the configured bound before the caller applies actual cut-cell coverage.
    ///
    /// A tile cut contains at most 4ᵐ cells, where m is the span. Small constant budgets can lie
    /// below this floor. Scheduled budgets include the occupied cut-cell count here.
    ///
    /// # Panics
    ///
    /// Panics on an invalid address or cut when resolving a scheduled budget.
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
    /// same order. A mismatch on a sampled tile demonstrates interference for that fixture.
    /// Agreement on the sampled tiles alone is not a proof.
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
    ///
    /// # Panics
    ///
    /// Panics when `rule` is outside the rank-representative family.
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
    ///
    /// # Panics
    ///
    /// Panics when `additional_depth ≥ 64`.
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

    /// Picks one of the tiles a check sweeps.
    fn tile(bench: &WalkBench, pick: Index) -> (u8, u32, u32) {
        let tiles = tiles(bench);
        tiles[pick.index(tiles.len())]
    }

    #[property_test]
    fn served_matches_scanning(
        #[strategy = CORPUS] points: usize,
        seed: u64,
        clustered: bool,
        #[strategy = VISIBLE] visible: f64,
        #[strategy = served_rule()] rule: FillRule,
        pick: Index,
    ) {
        let bench = corpus(points, seed, clustered, visible);
        let pyramid = bench.pyramid();
        let column = bench.column();
        let view = VisibleView::new(&pyramid, &column);
        let oracle = bench.generation(GenerationLayout::Inline);
        let generation = bench.indexed_generation(GenerationLayout::Inline);
        prop_assert_eq!(&generation, &oracle);
        prop_assert_eq!(generation.len(), bench.visible_rows());

        let (z, x, y) = tile(&bench, pick);
        prop_assert_eq!(
            bench.served_delivery(rule, z, x, y, &generation),
            bench.delivery(rule, z, x, y, view),
            "{:?} serves a different delivery sequence at tile {}/{}/{}",
            rule,
            z,
            x,
            y
        );
        prop_assert_eq!(
            bench.served_cumulative_delivery(rule, z, x, y, &generation),
            bench.cumulative_delivery(rule, z, x, y, view),
            "{:?} serves a different cumulative delivery at tile {}/{}/{}",
            rule,
            z,
            x,
            y
        );
        prop_assert_eq!(
            counts(bench.served_audit(rule, z, x, y, &generation)),
            counts(bench.audit(rule, z, x, y, view)),
            "{:?} serves a different audit at tile {}/{}/{}",
            rule,
            z,
            x,
            y
        );
    }

    #[test]
    fn generation_prefix_one_per_occupied_cell() {
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
    fn separation_matches_cascade_buckets() {
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
    fn masked_bucket_not_deeper() {
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
    fn shared_layout_matches_inline() {
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

    #[property_test]
    fn served_noninterference(
        #[strategy = CORPUS] points: usize,
        seed: u64,
        clustered: bool,
        #[strategy = VISIBLE] visible: f64,
        #[strategy = hidden_independent_rule()] rule: FillRule,
        pick: Index,
    ) {
        let hidden = corpus(points, seed, clustered, visible);
        let alone = hidden.visible_only();
        prop_assert_eq!(alone.visible_rows(), hidden.visible_rows());

        let generation = hidden.indexed_generation(GenerationLayout::Inline);
        let alone_generation = alone.indexed_generation(GenerationLayout::Inline);
        prop_assert_eq!(generation.len(), alone_generation.len());

        let (z, x, y) = tile(&hidden, pick);
        prop_assert_eq!(
            hidden.rows(hidden.served_delivery(rule, z, x, y, &generation)),
            alone.rows(alone.served_delivery(rule, z, x, y, &alone_generation)),
            "{:?} serves different rows once hidden rows exist at tile {}/{}/{}",
            rule,
            z,
            x,
            y
        );
    }

    #[test]
    fn served_noninterference_rejects_scheduled() {
        for rule in refinements(DotBudget::Scheduled) {
            assert!(
                served_interference(rule, false, 0.5).is_some(),
                "{rule:?} passed the noninterference check over the served engine, so the check \
                 no longer separates a hidden-independent rule from a leaking one",
            );
        }
    }

    #[test]
    fn uniform_grid_proportional_in_bucket_order() {
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
    fn uniform_grid_deltas_accumulate() {
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
    fn bucket_order_wire_split_and_full_cut() {
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
    fn uniform_grid_noninterference() {
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
    fn density_metric_accepts_grids_rejects_budgets() {
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
                // cross multiplication compares normalized window histograms without division
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

    #[property_test]
    fn served_covers_visible_cells(
        #[strategy = CORPUS] points: usize,
        seed: u64,
        clustered: bool,
        #[strategy = VISIBLE] visible: f64,
        #[strategy = served_rule()] rule: FillRule,
        pick: Index,
    ) {
        let bench = corpus(points, seed, clustered, visible);
        let generation = bench.generation(GenerationLayout::Inline);
        let (codes, _, _) = bench.columns();

        let (z, x, y) = tile(&bench, pick);
        let audit = bench.served_audit(rule, z, x, y, &generation);
        let delivered = bench.served_cumulative_delivery(rule, z, x, y, &generation);
        let cut = Depth::new(z + bench.span()).expect("the cut lies in the key width");
        let grid = Depth::new(cut.get() + audit.refined)
            .expect("the delivered grid lies within the key width");

        for depth in [cut, grid] {
            let shown: HashSet<u64> = delivered
                .iter()
                .map(|&position| MortonKey::from_bits(codes[position as usize]).prefix(depth))
                .collect();
            prop_assert_eq!(
                shown,
                bench.occupied_cells(z, x, y, depth),
                "{:?} serves a depth-{} cell empty over visible content at tile {}/{}/{}",
                rule,
                depth.get(),
                z,
                x,
                y
            );
        }

        prop_assert_eq!(audit.covered, bench.occupied_cells(z, x, y, cut).len());
        prop_assert!(
            audit.delivered <= bound(&bench, rule, z, x, y).max(audit.covered),
            "{:?} served {} past both the budget and its own cut grid at tile {}/{}/{}",
            rule,
            audit.delivered,
            z,
            x,
            y
        );
    }

    #[property_test]
    fn rank_rule_noninterference(
        #[strategy = CORPUS] points: usize,
        seed: u64,
        clustered: bool,
        #[strategy = VISIBLE] visible: f64,
        #[strategy = hidden_independent_rule()] rule: FillRule,
        pick: Index,
    ) {
        let hidden = corpus(points, seed, clustered, visible);
        let alone = hidden.visible_only();
        prop_assert_eq!(alone.visible_rows(), hidden.visible_rows());

        let (pyramid, column) = (hidden.pyramid(), hidden.column());
        let (alone_pyramid, alone_column) = (alone.pyramid(), alone.column());
        let view = VisibleView::new(&pyramid, &column);
        let alone_view = VisibleView::new(&alone_pyramid, &alone_column);

        let (z, x, y) = tile(&hidden, pick);
        prop_assert_eq!(
            hidden.rows(hidden.delivery(rule, z, x, y, view)),
            alone.rows(alone.delivery(rule, z, x, y, alone_view)),
            "{:?} delivers different rows once hidden rows exist at tile {}/{}/{}",
            rule,
            z,
            x,
            y
        );
    }

    #[test]
    fn noninterference_rejects_hidden_readers() {
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
    fn unmasked_matches_chained() {
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
    fn pyramid_matches_visible_cascade() {
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
    fn chain_inherited_matches_ancestors() {
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
    fn full_visibility_rules_agree() {
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
    fn cell_rule_covers_cut_cells() {
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

    #[property_test]
    fn rank_rule_covers_visible_cells(
        #[strategy = CORPUS] points: usize,
        seed: u64,
        clustered: bool,
        #[strategy = VISIBLE] visible: f64,
        #[strategy = served_rule()] rule: FillRule,
        pick: Index,
    ) {
        let bench = corpus(points, seed, clustered, visible);
        let pyramid = bench.pyramid();
        let column = bench.column();
        let view = VisibleView::new(&pyramid, &column);
        let (codes, _, _) = bench.columns();

        let (z, x, y) = tile(&bench, pick);
        let audit = bench.audit(rule, z, x, y, view);
        let delivered = bench.cumulative_delivery(rule, z, x, y, view);
        let cut = Depth::new(z + bench.span()).expect("the cut lies within the key width");
        let grid = Depth::new(cut.get() + audit.refined)
            .expect("the delivered grid lies within the key width");

        for depth in [cut, grid] {
            let shown: HashSet<u64> = delivered
                .iter()
                .map(|&position| MortonKey::from_bits(codes[position as usize]).prefix(depth))
                .collect();
            prop_assert_eq!(
                shown,
                bench.occupied_cells(z, x, y, depth),
                "{:?} leaves a depth-{} cell empty over visible content at tile {}/{}/{}",
                rule,
                depth.get(),
                z,
                x,
                y
            );
        }

        prop_assert_eq!(audit.covered, bench.occupied_cells(z, x, y, cut).len());
        prop_assert!(
            audit.delivered <= bound(&bench, rule, z, x, y).max(audit.covered),
            "{:?} delivered {} past both the budget and its own cut grid at tile {}/{}/{}",
            rule,
            audit.delivered,
            z,
            x,
            y
        );
    }

    #[test]
    fn small_budget_covers_cut_cells() {
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
    fn coverage_rank_matches_visible_only() {
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

                    // The deepest bucket contains all points that never claimed a distinct cell.
                    // Its cumulative prefix includes co-located points in both this bucket and
                    // shallower buckets. Therefore the deepest prefix need not equal the
                    // occupied-cell count.
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
    fn pyramid_holds_cut_depths() {
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
