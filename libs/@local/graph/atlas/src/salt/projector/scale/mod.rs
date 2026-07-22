//! Detached local scales: per-node 2D radii over semantic neighbours.
//!
//! A node's local scale is the median 2D distance from its current coordinate to its nearest
//! semantic neighbours - the local ruler that makes one normalized relation distance comparable
//! between dense and sparse map regions. Scales are measured from coordinates, never differentiated
//! through: the training loss consumes them as detached constants and refreshes them at a
//! configured cadence.
//!
//! The neighbour set is the [`LOCAL_SCALE_NEIGHBOURS`] nearest rows by stored high-dimensional
//! distance. The neighbour table stores each row's entries in ascending row order, so the nearest
//! subset is selected by distance here, tie-broken by row id.

#[cfg(test)]
mod tests;

use core::{error::Error, fmt};

use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{math::Vec2, salt::knn::table::KnnView};

/// Neighbours contributing to one node's local scale.
///
/// Fifteen nearest neighbours make the scale a robust local ruler: small enough to stay local,
/// large enough that a handful of mis-embedded neighbours cannot own the median. Tables storing
/// fewer neighbours contribute them all.
pub(crate) const LOCAL_SCALE_NEIGHBOURS: usize = 15;

/// A coordinate involved in scale computation was non-finite.
///
/// `row` is the smallest node row whose scale came out non-finite; the non-finite coordinate is
/// that row's own or one of its selected neighbours'.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NonFiniteScale {
    /// The smallest affected node row.
    pub row: usize,
}

impl fmt::Display for NonFiniteScale {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { row } = self;
        write!(fmt, "the local scale of node row {row} is non-finite")
    }
}

impl Error for NonFiniteScale {}

/// Validated per-node local radii in node-row order.
///
/// Every value is finite and non-negative; consumers divide by scales (plus their own epsilon)
/// without re-checking.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LocalScales(Box<[f32]>);

impl LocalScales {
    /// Validates externally produced scales.
    ///
    /// Returns [`None`] when any value is non-finite or negative.
    #[must_use]
    pub(crate) fn new(scales: Box<[f32]>) -> Option<Self> {
        scales
            .iter()
            .all(|scale| scale.is_finite() && *scale >= 0.0)
            .then_some(Self(scales))
    }

    /// Measures every node's local scale from current coordinates.
    ///
    /// Rows are independent and computed in parallel; the result is a function of the inputs alone.
    ///
    /// # Errors
    ///
    /// Returns [`NonFiniteScale`] naming the smallest affected row when any involved coordinate is
    /// non-finite (a diverged projection).
    ///
    /// # Panics
    ///
    /// Panics when the coordinate count differs from the table's row count or the table stores no
    /// neighbours; both artifacts come from one generation, so a mismatch is a wiring defect.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "row-domain agreement is a wiring contract asserted at entry; the error channel \
                  is reserved for diverged coordinates, a runtime condition"
    )]
    pub(crate) fn compute(coordinates: &[Vec2], knn: &KnnView<'_>) -> Result<Self, NonFiniteScale> {
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
            .map(|row| row_scale(coordinates, knn, row))
            .collect();

        if let Some(row) = scales.iter().position(|scale| !scale.is_finite()) {
            return Err(NonFiniteScale { row });
        }

        Ok(Self(scales.into_boxed_slice()))
    }

    /// Borrows the scales in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &[f32] {
        &self.0
    }

    /// Returns the local normalization of a node pair's 2D distance.
    ///
    /// The value is `sqrt((scale(source) + epsilon) * (scale(target) + epsilon))`: the geometric
    /// mean of the pair's epsilon-shifted local scales. Dividing a pair's distance by it yields the
    /// locally normalized distance `z`, comparable between dense and sparse map regions; `epsilon`
    /// keeps the result positive where a scale is zero.
    ///
    /// # Panics
    ///
    /// Panics when either row is outside the node-row domain.
    #[inline]
    #[must_use]
    pub(crate) fn normalization(&self, source: usize, target: usize, epsilon: f32) -> f32 {
        ((self.0[source] + epsilon) * (self.0[target] + epsilon)).sqrt()
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
/// ties in arrival order; the return value tells whether the key was inserted. Comparison is
/// [`PartialOrd`]: a key incomparable to every entry (such as NaN) is never inserted.
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
/// An even count takes the midpoint of the middle pair; an empty slice yields zero.
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
/// A row whose own coordinate is non-finite yields a non-finite median: every distance it
/// participates in is non-finite. A poisoned selected neighbour only sometimes reaches the median
/// (NaN sorts last under the total order), so per-row detection of neighbour divergence is
/// deliberately not promised - corpus-level detection is complete regardless, because the diverged
/// row itself always flags.
fn row_scale(coordinates: &[Vec2], knn: &KnnView<'_>, row: usize) -> f32 {
    // The nearest entries by (stored distance, row id); stored
    // distances are finite by the table's validation, so plain
    // lexicographic comparison is total.
    let mut nearest = [(f32::INFINITY, u64::MAX); LOCAL_SCALE_NEIGHBOURS];
    for neighbour in knn.row(row) {
        insert_nearest(&mut nearest, (neighbour.distance, neighbour.id.get()));
    }

    let count = knn.neighbours().min(LOCAL_SCALE_NEIGHBOURS);

    let mut distances = [0.0_f32; LOCAL_SCALE_NEIGHBOURS];
    for (distance, &(_, id)) in distances.iter_mut().zip(&nearest[..count]) {
        let neighbour =
            usize::try_from(id).expect("a validated table's rows fit the address space");
        *distance = coordinates[row].distance(coordinates[neighbour]);
    }
    distances[..count].sort_unstable_by(f32::total_cmp);

    sorted_median(&distances[..count])
}
