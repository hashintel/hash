//! The per-subject movement readings between two aligned steps.
//!
//! [`Movement`] holds the zero-condition and canonical frames of one generation, already aligned
//! by the ladder, and reads each drawn subject. A pair reading ([`Movement::pair`]) carries the
//! source-to-partner distance and the partner's local rank at both steps. A control reading
//! ([`Movement::control`]) carries the row's displacement between the steps and its zero-step
//! distance to the nearest sampled anchor, the stratification key of the collateral deciles.
//!
//! The local rank follows the union domain. With `K_r(u)` the exact `k` nearest other rows
//! of `u` at step `r`, the partner's rank at step `r` is one plus the number of rows in
//! `K_0(u) ∪ K_c(u)` whose `(distance at step r, row)` orders before the partner's own reading.
//! The union is the candidate domain at both steps. A row that leaves the neighbourhood at one
//! step is still rank-relevant at the other, and a rank read over a single step's `k`-set alone
//! would miscount it.
//! Every distance is [`Vec2::distance_squared_wide`](crate::math::Vec2::distance_squared_wide),
//! the one metric, whether the row came from a tree readout or enters the comparison directly,
//! so tie sets never depend on the path that produced a reading.
//!
//! Readings are exact and deterministic: the trees only accelerate neighbour selection, and the
//! module's tests hold every reading to a full-scan restatement of the same definitions.
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
    math::{DNonNegative, FinitePointField, KdTree, Vec2x4T},
};

/// The rank-readout window `k`, the size of one row's local neighbourhood.
///
/// A rank reading counts within the union of both steps' `k`-sets, so the readout resolves rank
/// movement inside the window and saturates beyond it, and no rank exceeds `1 + 2k`. The window
/// is a readout resolution rather than a derived quantity, and the evidence body records it
/// beside every generation's readings, so a persisted reading stays interpretable if the window
/// moves.
pub(super) const RANK_WINDOW: NonZero<usize> = NonZero::new(256).expect("256 is not zero");

/// The reading of one drawn pair, its distance and local rank at both steps.
///
/// Distances are world-unit Euclidean readings, finite and non-negative by construction. Ranks
/// are one-based over the union domain, so a rank never exceeds `1 + 2k`. Downstream
/// aggregation forms the per-pair differences from these fields directly and never subtracts
/// step aggregates.
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
    /// The row's zero-step distance to the nearest sampled anchor.
    pub anchor_distance: DNonNegative,
}

hashql_core::id::newtype! {
    /// A position in the sampled anchor frame.
    ///
    /// The anchor frame restates the drawn pairs' deduplicated endpoints as a compact frame of its own,
    /// so a position in it is not a corpus row, and confusing the two domains is the wiring defect this
    /// type prevents. The `u32` width holds the domain whole: the anchor count is bounded by twice the
    /// pair sample cap.
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
    /// The frames share the corpus row domain, so row `r` is one corpus row's position at each
    /// step. Alignment between the steps is the caller's and arrives already applied.
    ///
    /// # Errors
    ///
    /// [`MovementError::Rows`] when the frames disagree on the row count.
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
    /// The readouts and the union buffer allocate in `scratch`, and the reading returns none of
    /// them, so the caller resets the arena between readings to reclaim them in bulk.
    ///
    /// # Panics
    ///
    /// This panics when `source` or `partner` is not a frame row.
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

        // One plus the union rows ordering before the partner under `(distance, row)`. The
        // partner itself never counts: its own reading compares equal, and equality is not
        // before. Recomputing every union member's reading through the one metric keeps the
        // comparison independent of which step's readout supplied the row. The union rows are
        // scattered by construction, so the sweep gathers four at a time through the lane
        // metric, whose readings equal the scalar metric's bit for bit.
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
    /// `anchors` indexes the anchor positions at the zero step, and the reading's
    /// `anchor_distance` is [`Self::anchor_distance`], the nearest of them to this row's
    /// zero-step position.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row or when `anchors` indexes an empty frame
    /// ([`Self::anchor_distance`]).
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

    /// Reads one frame row's zero-step distance to the nearest sampled anchor.
    ///
    /// The one anchor readout. The drawn controls ([`Self::control`]) and the evidence writer's
    /// candidate sweep both read through it, so a drawn control's reading is bit-identical to
    /// its own candidate reading and the collateral strata always cover the draw.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row or when `anchors` indexes an empty frame. An
    /// empty anchor frame is unreachable from the draw: readings run only under a nonempty
    /// draw, and every drawn pair contributes an endpoint.
    pub(super) fn anchor_distance(
        &self,
        row: NodeRowId,
        anchors: &KdTree<'_, AnchorRowId>,
        scratch: &Scratch,
    ) -> DNonNegative {
        let readout = anchors.nearest_point_in(self.zero[row], NonZero::<usize>::MIN, scratch);
        let nearest = readout
            .first()
            .expect("readings run only under a nonempty draw, so an anchor exists");
        nearest.distance_squared.sqrt()
    }
}
