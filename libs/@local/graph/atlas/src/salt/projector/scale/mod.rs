//! Detached local scales: per-node 2D radii over semantic neighbours.
//!
//! A node's local scale is the median 2D distance from its current coordinate to its nearest
//! semantic neighbours - the local ruler that makes one normalized relation distance comparable
//! between dense and sparse map regions. Every refresh measures scales from coordinates and never
//! differentiates through them: the training loss consumes them as detached constants and refreshes
//! them at a configured cadence.
//!
//! The neighbour set is the [`LOCAL_SCALE_NEIGHBOURS`] nearest rows by stored high-dimensional
//! distance. The neighbour table stores each row's entries in ascending row order, so this module
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

/// A node row's local scale overflowed the finite range.
///
/// `row` is the smallest node row whose scale came out non-finite. The coordinates are finite at
/// entry, so the only non-finite reading this computation can produce is a distance that
/// overflows to `+∞`, from pre-divergence coordinates large enough that their difference leaves
/// the finite range.
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
/// Every value is a [`NonNegative`]: finite and at least zero, so dividing by a scale plus a
/// positive ε is total.
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
    /// Returns [`NonFiniteScale`] naming the smallest affected row when a distance overflows the
    /// finite range (pre-divergence coordinates).
    ///
    /// # Panics
    ///
    /// This panics when the coordinate count differs from the table's row count or the table stores
    /// no neighbours. Both artifacts come from one generation, so a mismatch is a wiring defect.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "row-domain agreement is a wiring contract asserted at entry; the error channel \
                  is reserved for diverged coordinates, a runtime condition"
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
    /// shifts a zero scale off zero, and the geometric mean is total - the widened product is
    /// exact and the mean of two representable positives is representable. Every configured
    /// `ε` reads a finite normalization.
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
/// A distance between pre-divergence coordinates can overflow, and the escaped `+∞` sorts last
/// under the bit order, so it reaches the median only when overflow dominates the row. The
/// median returns unclaimed, and the table constructor's finish detects divergence at the
/// corpus level rather than per distance.
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
        *distance = coordinates[row].distance(coordinates[neighbour]);
    }
    distances[..count].sort_unstable();

    Derivation::from(sorted_median(&distances[..count]))
}
