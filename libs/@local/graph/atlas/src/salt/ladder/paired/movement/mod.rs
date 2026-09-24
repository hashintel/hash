//! Per-pair local-rank changes and control displacement between aligned steps.
//!
//! [`Movement`] holds the zero-condition and canonical frames of one generation, already aligned
//! by the ladder, and reads each drawn subject. A pair reading ([`Movement::pair`]) carries the
//! source-to-partner distance and the partner's local rank at both steps. A control reading
//! ([`Movement::control`]) carries the row's displacement between the steps and its zero-step
//! nearest-anchor reading, the stratification key of the collateral deciles.
//!
//! The ideal local rank follows the union domain. Let Kᵣ(u) be the first k other rows of source u
//! at step r ∈ {zero,canonical}, ordered by (squared distance, row). A frame with fewer than k
//! other rows uses them all. Let U(u) be the union of both Kᵣ(u). For partner v, rankᵣ(u,v) = 1 +
//! |{w ∈ U(u) : (dᵣ²(u,w),w) < (dᵣ²(u,v),v)}|, where dᵣ² is the squared-distance metric. The union
//! is the candidate domain at both steps. A row that leaves the neighbourhood at one step is still
//! rank-relevant at the other, and a rank read over a single step's `k`-set alone would miscount
//! it.
//!
//! The readout applies this equation to the union actually returned by the two [`KdTree`] queries.
//! Returned candidates are ordered by (squared distance, row) and limited to `k` per step. These
//! sets agree with Kᵣ(u) when the probed boundary is correct and radius selection is complete. The
//! readout inherits the index's selection-precision limit, including for nearest-anchor queries.
//!
//! Squared distances use [`Vec2::distance_squared_wide`](crate::math::Vec2::distance_squared_wide),
//! including direct comparisons and tree readouts. Finite f32 coordinates have magnitude below
//! 2¹²⁸. Widening before subtraction bounds the two-dimensional squared distance below 2²⁵⁹, within
//! f64's finite range. Pair distances and control displacements take their finite square roots.
//!
//! Equal frame bytes and query inputs give equal ranks under the same index implementation and
//! arithmetic semantics. Square roots can limit cross-platform bitwise replay of distances.
#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the k-nearest-neighbour count's literature name"
)]

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use hashql_core::heap::Scratch;

use crate::{
    identity::NodeRowId,
    math::{DNonNegative, FinitePointField, KdTree, Vec2x4T, nz},
};

/// The rank-readout window `k`, the size of one row's local neighbourhood.
///
/// The window is 256 rows per step. A union-domain rank never exceeds 1 + 2k, and partners beyond
/// the union's distances saturate at 1 + |U|. The evidence records this resolution to keep readings
/// interpretable if the window changes. Revisit it using the frequency of saturated ranks and the
/// readout cost.
pub(super) const RANK_WINDOW: NonZero<usize> = nz!(256);

/// The reading of one drawn pair, its distance and local rank at both steps.
///
/// Distances are world-unit Euclidean readings, finite and non-negative for valid input fields.
/// Ranks are one-based over the union domain and bounded by 1 + 2k under [`Movement::new`]'s window
/// requirement. Aggregation forms differences per pair and never subtracts step aggregates.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct PairMovement {
    /// The source-to-partner distance at the zero step.
    pub distance_zero: DNonNegative,
    /// The source-to-partner distance at the canonical step.
    pub distance_canonical: DNonNegative,
    /// The partner's local rank at the zero step.
    pub rank_zero: u32,
    /// The partner's local rank at the canonical step.
    pub rank_canonical: u32,
}

/// The reading of one drawn control row, its displacement and anchor proximity.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct ControlMovement {
    /// The row's displacement between the aligned zero and canonical steps.
    pub displacement: DNonNegative,
    /// The row's zero-step nearest-anchor reading from [`Movement::anchor_distance`].
    pub anchor_distance: DNonNegative,
}

hashql_core::id::newtype! {
    /// A position in the sampled anchor frame.
    ///
    /// Anchor positions have their own row domain, distinct from corpus rows. The drawn pairs contribute at most twice [`SAMPLE_CAP`](super::census::SAMPLE_CAP), or 145,110 anchors, within the `u32` domain.
    #[id(const)]
    pub(super) struct AnchorRowId(u32)
}

/// The frame pair [`Movement::new`] refused.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum MovementError {
    /// The step frames disagree on the corpus row count.
    Rows {
        /// The zero-condition frame's row count.
        zero: usize,
        /// The canonical frame's row count.
        canonical: usize,
    },
}

impl fmt::Display for MovementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rows { zero, canonical } => write!(
                fmt,
                "the zero frame holds {zero} rows where the canonical frame holds {canonical}",
            ),
        }
    }
}

impl Error for MovementError {}

/// The movement readout over one generation's aligned step frames.
#[derive(Debug)]
pub(super) struct Movement<'frame> {
    /// The zero-condition frame, row-indexed.
    zero: &'frame FinitePointField<NodeRowId>,
    /// The canonical frame, row-indexed and aligned onto the zero frame's basis.
    canonical: &'frame FinitePointField<NodeRowId>,
    /// The zero frame's neighbour index.
    zero_tree: KdTree<'frame, NodeRowId>,
    /// The canonical frame's neighbour index.
    canonical_tree: KdTree<'frame, NodeRowId>,
    /// The neighbourhood size `k` of each step's readout.
    k: NonZero<usize>,
}

impl<'frame> Movement<'frame> {
    /// Builds the readout over both aligned frames.
    ///
    /// Both frames must identify the same corpus row at each position, with alignment already
    /// applied. Only their lengths are checked. To keep every possible union rank representable,
    /// `k` must satisfy 2k + 1 ≤ `u32::MAX`. This window requirement is not checked here.
    ///
    /// Builds and retains a [`KdTree`] for each frame, with O(N) index storage for N rows. Each
    /// frame must satisfy the index's capacity and typed row-domain requirements.
    ///
    /// # Errors
    ///
    /// [`MovementError::Rows`] when the frames disagree on the row count.
    ///
    /// # Panics
    ///
    /// Panics under [`KdTree::build`]'s capacity or typed-domain failure conditions.
    pub(super) fn new(
        zero: &'frame FinitePointField<NodeRowId>,
        canonical: &'frame FinitePointField<NodeRowId>,
        k: NonZero<usize>,
    ) -> Result<Self, MovementError> {
        if zero.len() != canonical.len() {
            return Err(MovementError::Rows {
                zero: zero.len(),
                canonical: canonical.len(),
            });
        }

        Ok(Self {
            zero,
            canonical,
            zero_tree: KdTree::build(zero),
            canonical_tree: KdTree::build(canonical),
            k,
        })
    }

    /// Reads one drawn pair: distances and union-domain local ranks at both steps.
    ///
    /// The source and partner may be equal. Only the source is excluded from neighbour selection.
    /// The partner itself never counts ahead of its own reading, although a lower row at the same
    /// position can.
    ///
    /// Reset `scratch` between readings to reclaim the neighbour results and union buffer.
    /// Tree-query scratch can also allocate outside this arena.
    ///
    /// # Complexity
    ///
    /// Worst-case O(N log N) work and O(N) temporary storage for N frame rows. A boundary tie can
    /// include every row before the neighbour selection sorts and truncates, even when `k` is
    /// small.
    ///
    /// # Panics
    ///
    /// This panics when `source` or `partner` is not a frame row, or query or union-buffer capacity
    /// is exceeded. Queries also inherit [`KdTree::nearest_in`]'s typed-domain requirements.
    pub(super) fn pair(
        &self,
        source: NodeRowId,
        partner: NodeRowId,
        scratch: &Scratch,
    ) -> PairMovement {
        let zero = self.zero_tree.nearest_in(source, self.k, scratch);
        let canonical = self.canonical_tree.nearest_in(source, self.k, scratch);

        let mut union = Vec::with_capacity_in(zero.len() + canonical.len(), scratch);
        union.extend(zero.iter().map(|neighbour| neighbour.row));
        union.extend(canonical.iter().map(|neighbour| neighbour.row));
        union.sort_unstable();
        union.dedup();

        let source_zero = self.zero[source];
        let source_canonical = self.canonical[source];
        let partner_zero = source_zero.distance_squared_wide(self.zero[partner]);
        let partner_canonical = source_canonical.distance_squared_wide(self.canonical[partner]);

        // Both steps rank against the same union, irrespective of which step supplied a row. The
        // lane metric widens before subtraction and uses the scalar metric's separate square and
        // addition roundings. The four-row gathers therefore preserve the scalar comparison and its
        // ties.
        let mut rank_zero: u32 = 1;
        let mut rank_canonical: u32 = 1;
        let source_zero_batch = Vec2x4T::splat(source_zero);
        let source_canonical_batch = Vec2x4T::splat(source_canonical);

        let (row_quads, row_remainder) = union.as_chunks::<4>();
        for &rows in row_quads {
            let zero_readings = source_zero_batch
                .distance_squared_wide(Vec2x4T::from(rows.map(|row| self.zero[row])));
            let canonical_readings = source_canonical_batch
                .distance_squared_wide(Vec2x4T::from(rows.map(|row| self.canonical[row])));

            for ((zero, canonical), row) in
                zero_readings.into_iter().zip(canonical_readings).zip(rows)
            {
                if zero < partner_zero || (zero == partner_zero && row < partner) {
                    rank_zero += 1;
                }

                if canonical < partner_canonical
                    || (canonical == partner_canonical && row < partner)
                {
                    rank_canonical += 1;
                }
            }
        }

        for &row in row_remainder {
            let zero = source_zero.distance_squared_wide(self.zero[row]);
            if zero < partner_zero || (zero == partner_zero && row < partner) {
                rank_zero += 1;
            }
            let canonical = source_canonical.distance_squared_wide(self.canonical[row]);
            if canonical < partner_canonical || (canonical == partner_canonical && row < partner) {
                rank_canonical += 1;
            }
        }

        PairMovement {
            distance_zero: partner_zero.sqrt(),
            distance_canonical: partner_canonical.sqrt(),
            rank_zero,
            rank_canonical,
        }
    }

    /// Reads one drawn control row against the sampled anchor index.
    ///
    /// `anchors` indexes the anchor positions at the zero step. The reading's `anchor_distance` is
    /// [`Self::anchor_distance`], subject to the index's selection precision and typed-domain
    /// requirements.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row, the anchor query returns no candidate, or query
    /// capacity is exceeded (see [`Self::anchor_distance`]).
    pub(super) fn control(
        &self,
        row: NodeRowId,
        anchors: &KdTree<'_, AnchorRowId>,
        scratch: &Scratch,
    ) -> ControlMovement {
        ControlMovement {
            displacement: self.zero[row]
                .distance_squared_wide(self.canonical[row])
                .sqrt(),
            anchor_distance: self.anchor_distance(row, anchors, scratch),
        }
    }

    /// Reads one frame row's zero-step distance to the index-selected anchor.
    ///
    /// The nearest-anchor query inherits [`KdTree`]'s selection precision and typed-domain
    /// requirements. With the same frame and anchors, repeated calls read the same distance under
    /// the same index implementation and arithmetic semantics. This gives sampling and the
    /// candidate census a common stratification key.
    ///
    /// # Panics
    ///
    /// Panics when `row` is not a frame row, the anchor query returns no candidate, or query
    /// capacity is exceeded. An empty anchor frame returns no candidate.
    pub(super) fn anchor_distance(
        &self,
        row: NodeRowId,
        anchors: &KdTree<'_, AnchorRowId>,
        scratch: &Scratch,
    ) -> DNonNegative {
        let readout = anchors.nearest_point_in(self.zero[row], NonZero::<usize>::MIN, scratch);
        let nearest = readout
            .first()
            .expect("the nearest-anchor query should return a candidate");
        nearest.distance_squared.sqrt()
    }
}
