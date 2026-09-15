//! Detached local scales: per-node 2D radii over semantic neighbours.
//!
//! A node's local scale is the median 2D distance from its current coordinate to its nearest
//! semantic neighbours - the local ruler that makes one normalized relation distance comparable
//! between dense and sparse map regions. Every refresh measures scales from coordinates and never
//! differentiates through them: the training loss consumes them as detached constants and refreshes
//! them at a configured cadence.
//!
//! The neighbour set is the [`LOCAL_SCALE_NEIGHBOURS`] nearest rows by stored high-dimensional
//! distance. The neighbour table stores each row's entries in ascending row order. This module
//! selects the nearest subset by distance and breaks ties by row id.

#[cfg(test)]
mod tests;

pub(crate) mod frozen;

use core::{error::Error, fmt};

use hashql_core::id::{Id, IdSlice, IdVec};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{
    math::{Derivation, FinitePointField, NonNegative, Positive, Vec2},
    salt::knn::table::KnnView,
};

/// Neighbours contributing to one node's local scale.
///
/// Fifteen nearest neighbours keep the ruler local while denying a handful of mis-embedded
/// neighbours the median. Tables storing fewer neighbours contribute them all.
pub(crate) const LOCAL_SCALE_NEIGHBOURS: usize = 15;

/// A node row's local scale, its selected median distance, overflowed the finite range.
///
/// `row` is the smallest node row whose scale came out non-finite. The coordinates are finite at
/// entry, and the only non-finite reading this computation can produce is a 2D distance whose
/// `f32` arithmetic overflows to `+∞`: the coordinate differences square and sum in `f32`, and a
/// finite coordinate difference of `2⁶⁴` or more already overflows its square. The `+∞` sorts
/// last among the row's distances, and the scale is non-finite when the median selection reaches
/// an escaped distance and finite otherwise: one escaped distance is the median of a
/// one-neighbour row, and escaped distances sorted past the median leave the scale finite.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NonFiniteScale<N> {
    /// The smallest affected node row.
    pub row: N,
}

impl<N> fmt::Display for NonFiniteScale<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { row } = self;
        write!(fmt, "the local scale of node row {row} is non-finite")
    }
}

impl<N> Error for NonFiniteScale<N> where N: fmt::Debug + fmt::Display {}

/// Validated per-node local radii in node-row order.
///
/// Every value is a [`NonNegative`], finite and at least zero. A scale plus a positive ε is a
/// positive divisor, and it is finite whenever the `f32` sum is below `f32::MAX`.
#[derive(Debug, PartialEq)]
pub(crate) struct LocalScales<N>(Box<IdSlice<N, NonNegative>>);

impl<N> LocalScales<N>
where
    N: Id,
{
    /// Adopts scales whose element type carries the domain.
    #[inline]
    #[must_use]
    pub(crate) const fn new(scales: Box<IdSlice<N, NonNegative>>) -> Self {
        Self(scales)
    }

    /// Measures every node's local scale from current coordinates.
    ///
    /// Rows are independent and computed in parallel. The result is a function of the inputs alone.
    ///
    /// # Errors
    ///
    /// Returns [`NonFiniteScale`] naming the smallest row whose selected median is non-finite: a
    /// 2D distance's `f32` square or sum overflowed to `+∞` between finite coordinates, and the
    /// escaped distances reached the median. A row whose overflowed distances sort past the median
    /// keeps a finite scale.
    ///
    /// # Panics
    ///
    /// This panics when the coordinate count differs from the table's row count or the table stores
    /// no neighbours. Both artifacts come from one generation, and a mismatch is therefore a wiring
    /// defect.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "row-domain agreement is a wiring contract asserted at entry, and the error \
                  channel is reserved for diverged coordinates, a runtime condition"
    )]
    pub(crate) fn compute(
        coordinates: &FinitePointField<N>,
        knn: &KnnView<'_, N>,
    ) -> Result<Self, NonFiniteScale<N>> {
        assert_eq!(
            coordinates.len(),
            knn.rows(),
            "coordinates and the neighbour table should cover the same rows"
        );
        assert!(
            knn.neighbours() > 0,
            "the neighbour table should store at least one neighbour per row"
        );

        let derived: IdVec<N, _> = (0..coordinates.len())
            .into_par_iter()
            .map(|row| row_scale(coordinates, knn, N::from_usize(row)))
            .collect();

        // Each median makes its one domain claim here at the table boundary, and the smallest
        // diverged row is the refusal.
        let mut scales = IdVec::with_capacity(derived.len());
        for (row, derivation) in derived.iter_enumerated() {
            let Ok(scale) = derivation.finish() else {
                return Err(NonFiniteScale { row });
            };

            scales.push(scale);
        }

        Ok(Self(scales.into_boxed_slice()))
    }

    /// Borrows the scales in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &IdSlice<N, NonNegative> {
        &self.0
    }

    /// Returns the local normalization of a node pair's 2D distance.
    ///
    /// The value is `√((scale(source) + ε) · (scale(target) + ε))`: the geometric mean of the
    /// pair's ε-shifted local scales. Dividing a pair's distance by it yields the locally
    /// normalized distance `z`, comparable between dense and sparse map regions. `epsilon`
    /// shifts a zero scale off zero. Each shift is an `f32` addition, finite whenever the scale
    /// and `ε` sum below `f32::MAX`, and the geometric mean of two finite positives rounds within
    /// their range (the mean of `1` and `2` is `√2`, rounded). A finite normalization does not by
    /// itself bound the caller's `f32` quotient.
    ///
    /// # Panics
    ///
    /// This panics when either row is outside the node-row domain.
    #[inline]
    #[must_use]
    pub(crate) fn normalization(&self, source: N, target: N, epsilon: Positive) -> Positive {
        (self.0[source] + epsilon).geometric_mean(self.0[target] + epsilon)
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.0.len()
    }
}

/// A placed frame beside local scales covering the same rows.
///
/// The pairing claims one row domain and nothing more. Scales are detached measurements that a
/// consumer may read against a re-forwarded frame from a later step. Which frame measured them is
/// the call site's contract rather than this type's.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ScaledFrame<'frame, N> {
    /// The placed coordinates.
    coordinates: &'frame FinitePointField<N>,
    /// The rows' local scales.
    scales: &'frame LocalScales<N>,
}

impl<'frame, N> ScaledFrame<'frame, N>
where
    N: Id,
{
    /// Pairs a placed frame with local scales over its rows.
    ///
    /// # Panics
    ///
    /// This panics when the scales do not cover the coordinate rows: the pair describes one
    /// corpus, and a mismatch is therefore a wiring defect.
    #[must_use]
    pub(crate) fn new(
        coordinates: &'frame FinitePointField<N>,
        scales: &'frame LocalScales<N>,
    ) -> Self {
        assert_eq!(
            scales.len(),
            coordinates.len(),
            "local scales and coordinates should cover the same rows"
        );

        Self {
            coordinates,
            scales,
        }
    }

    /// Borrows the placed coordinates.
    #[inline]
    #[must_use]
    pub(crate) const fn coordinates(&self) -> &'frame FinitePointField<N> {
        self.coordinates
    }

    /// Borrows the rows' local scales.
    #[inline]
    #[must_use]
    pub(crate) const fn scales(&self) -> &'frame LocalScales<N> {
        self.scales
    }
}

/// Inserts a key into an ascending bounded nearest-key array.
///
/// The array holds the smallest keys seen so far in ascending order, pre-filled with a maximal
/// sentinel. A key smaller than the current worst entry displaces it and slots into order, keeping
/// ties in arrival order. The return value reports whether the array accepted the key. Comparison
/// is [`PartialOrd`]: a key incomparable to every entry (such as NaN) is never inserted.
pub(crate) fn insert_nearest<K: PartialOrd + Copy, const N: usize>(
    nearest: &mut [K; N],
    key: K,
) -> bool {
    let mut slot = N;
    while slot > 0 && key < nearest[slot - 1] {
        slot -= 1;
    }

    if slot == N {
        return false;
    }

    nearest[slot..].rotate_right(1);
    nearest[slot] = key;
    true
}

/// Returns the median of ascending distances.
///
/// An even count takes the midpoint of the middle pair, and an empty slice yields zero.
pub(crate) const fn sorted_median(distances: &[NonNegative]) -> NonNegative {
    if distances.is_empty() {
        return NonNegative::ZERO;
    }

    let middle = distances.len() >> 1;
    if distances.len() & 1 == 0 {
        distances[middle - 1].midpoint(distances[middle])
    } else {
        distances[middle]
    }
}

/// Computes one row's median 2D distance to its nearest neighbours.
///
/// The distance squares and sums the coordinate differences in `f32`, and a coordinate difference
/// of `2⁶⁴` or more overflows its square to `+∞` between finite coordinates. The escaped `+∞`
/// sorts last under the bit order, and the median is non-finite when the selection reaches an
/// escaped distance, which one distance does in a one-neighbour row. The median returns
/// unclaimed, and the table constructor's finish detects divergence at the corpus level rather
/// than per distance.
fn row_scale<N>(
    coordinates: &IdSlice<N, Vec2>,
    knn: &KnnView<'_, N>,
    row: N,
) -> Derivation<NonNegative>
where
    N: Id,
{
    // The nearest entries by (stored distance, row id), lexicographic and total by the types.
    let mut nearest = [(NonNegative::MAX, N::MAX); LOCAL_SCALE_NEIGHBOURS];
    for neighbour in knn.row(row) {
        insert_nearest(&mut nearest, (neighbour.distance, neighbour.id));
    }

    let count = knn.neighbours().min(LOCAL_SCALE_NEIGHBOURS);

    let mut distances = [NonNegative::ZERO; LOCAL_SCALE_NEIGHBOURS];
    for (distance, &(_, neighbour)) in distances.iter_mut().zip(&nearest[..count]) {
        // `Vec2::distance` squares and sums in `f32`, and an overflow escapes to `+∞` here. With
        // debug assertions enabled the scalar square and sum assert at this operation, ahead of
        // the finish's refusal.
        *distance = coordinates[row].distance(coordinates[neighbour]);
    }
    distances[..count].sort_unstable();

    Derivation::from(sorted_median(&distances[..count]))
}
