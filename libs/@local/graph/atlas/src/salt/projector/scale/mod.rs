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

use core::{error::Error, fmt};

use hashql_core::id::{Id, IdSlice};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{
    math::{NonNegative, Vec2},
    salt::knn::table::KnnView,
};

/// Neighbours contributing to one node's local scale.
///
/// Fifteen nearest neighbours keep the ruler local while denying a handful of mis-embedded
/// neighbours the median. Tables storing fewer neighbours contribute them all.
pub(crate) const LOCAL_SCALE_NEIGHBOURS: usize = 15;

/// A coordinate involved in scale computation was non-finite.
///
/// `row` is the smallest node row whose scale came out non-finite; the non-finite coordinate is
/// that row's own or one of its selected neighbours'.
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
    /// Returns [`NonFiniteScale`] naming the smallest affected row when any involved coordinate is
    /// non-finite (a diverged projection).
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
        coordinates: &IdSlice<N, Vec2>,
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

        let scales: Vec<f32> = (0..coordinates.len())
            .into_par_iter()
            .map(|row| row_scale(coordinates, knn, N::from_usize(row)))
            .collect();

        if let Some(row) = scales.iter().position(|scale| !scale.is_finite()) {
            return Err(NonFiniteScale {
                row: N::from_usize(row),
            });
        }

        let scales = scales
            .into_iter()
            .map(|scale| {
                NonNegative::new(scale).expect(
                    "the scan above rejected non-finite scales, and a median of distances is \
                     never negative",
                )
            })
            .collect();

        Ok(Self(IdSlice::from_boxed_slice(scales)))
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
    /// normalized distance `z`, comparable between dense and sparse map regions; `epsilon` keeps
    /// the result positive where a scale is zero.
    ///
    /// # Panics
    ///
    /// This panics when either row is outside the node-row domain.
    #[inline]
    #[must_use]
    pub(crate) fn normalization(&self, source: N, target: N, epsilon: f32) -> f32 {
        ((self.0[source].get() + epsilon) * (self.0[target].get() + epsilon)).sqrt()
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
pub(crate) const fn sorted_median(distances: &[f32]) -> f32 {
    if distances.is_empty() {
        return 0.0;
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
/// A row whose own coordinate is non-finite yields a non-finite median, because every distance it
/// participates in is non-finite. A poisoned selected neighbour only sometimes reaches the median
/// (NaN sorts last under the total order), so the contract promises no per-row detection of
/// neighbour divergence. Corpus-level detection is complete regardless, because the diverged row
/// itself always flags.
fn row_scale<N>(coordinates: &IdSlice<N, Vec2>, knn: &KnnView<'_, N>, row: N) -> f32
where
    N: Id,
{
    // The nearest entries by (stored distance, row id); stored distances are finite by the table's
    // validation, so plain lexicographic comparison is total.
    let mut nearest = [(f32::INFINITY, N::MAX); LOCAL_SCALE_NEIGHBOURS];
    for neighbour in knn.row(row) {
        insert_nearest(&mut nearest, (neighbour.distance, neighbour.id));
    }

    let count = knn.neighbours().min(LOCAL_SCALE_NEIGHBOURS);

    let mut distances = [0.0_f32; LOCAL_SCALE_NEIGHBOURS];
    for (distance, &(_, neighbour)) in distances.iter_mut().zip(&nearest[..count]) {
        *distance = coordinates[row].distance(coordinates[neighbour]);
    }
    distances[..count].sort_unstable_by(f32::total_cmp);

    sorted_median(&distances[..count])
}
