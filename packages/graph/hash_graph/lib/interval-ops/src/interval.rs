use core::{cmp::Ordering, ops::Bound};

use crate::bounds::{
    LowerBound, LowerBoundComparison, LowerBoundObject, UpperBound, UpperBoundComparison,
    UpperBoundObject,
};

#[expect(
    clippy::type_complexity,
    reason = "Only used internally in this module"
)]
fn into_bounds_object<T, I: Interval<T>>(
    interval: I,
) -> Option<(
    LowerBoundObject<I::LowerBound, T>,
    UpperBoundObject<I::UpperBound, T>,
)> {
    interval
        .into_bounds()
        .map(|(lower, upper)| (LowerBoundObject::new(lower), UpperBoundObject::new(upper)))
}

#[expect(
    clippy::type_complexity,
    reason = "Only used internally in this module"
)]
fn as_bounds_object<T, I: Interval<T>>(
    interval: &I,
) -> Option<(
    LowerBoundObject<Bound<&T>, T>,
    UpperBoundObject<Bound<&T>, T>,
)> {
    interval.bounds().map(|(lower, upper)| {
        (
            LowerBoundObject::new(lower.as_bound()),
            UpperBoundObject::new(upper.as_bound()),
        )
    })
}

pub trait Interval<T>: Sized {
    type LowerBound: LowerBound<T>;
    type UpperBound: UpperBound<T>;

    /// Creates an empty interval.
    fn empty() -> Self;

    /// Creates an interval from the given bounds.
    ///
    /// # Panics
    ///
    /// Panics if the lower bound is greater than the upper bound.
    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        T: PartialOrd;

    /// Returns a reference to the lower and upper bounds of this interval
    fn bounds(&self) -> Option<(&Self::LowerBound, &Self::UpperBound)>;

    /// Converts the interval into its bounds if it is not empty.
    fn into_bounds(self) -> Option<(Self::LowerBound, Self::UpperBound)>;

    /// Returns `true` if the interval is empty.
    #[must_use]
    fn is_empty(&self) -> bool;

    /// Returns `true` if both intervals have any points in common.
    #[must_use]
    fn overlaps(&self, other: &Self) -> bool
    where
        T: PartialOrd,
    {
        match (as_bounds_object(self), as_bounds_object(other)) {
            // Range A:    [-----] | [-----]
            // Range B: [-----]    |    [-----]
            (Some((lhs_lower, lhs_upper)), Some((rhs_lower, rhs_upper))) => {
                lhs_lower >= rhs_lower && lhs_lower <= rhs_upper
                    || rhs_lower >= lhs_lower && rhs_lower <= lhs_upper
            }
            // At least one range is empty
            // Range A:   empty   | [-------] |   empty
            // Range B: [-------] |   empty   |   empty
            _ => false,
        }
    }

    /// Returns `true` if both intervals are adjacent but do not overlap.
    #[must_use]
    fn is_adjacent_to(&self, other: &Self) -> bool
    where
        T: PartialOrd,
    {
        match (as_bounds_object(self), as_bounds_object(other)) {
            // Either the end bound of range a is the start bound of range b, or vice versa
            // Range A:       [-----] | [-----]
            // Range B: [-----]       |       [-----]
            (Some((lhs_lower, lhs_upper)), Some((rhs_lower, rhs_upper))) => {
                lhs_upper.is_adjacent_to(&rhs_lower) || rhs_upper.is_adjacent_to(&lhs_lower)
            }
            _ => false,
        }
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::union`], this method does not require the intervals to be adjacent
    /// or overlapping.
    #[must_use]
    fn merge(self, other: Self) -> Self
    where
        T: PartialOrd,
    {
        match (into_bounds_object(self), into_bounds_object(other)) {
            (None, None) => Self::empty(),
            // At least one range is empty
            // Range A:   empty   | [-------]
            // Range B: [-------] |   empty
            // Result:  [-------] | [-------]
            (None, Some((lower, upper))) | (Some((lower, upper)), None) => {
                Self::from_bounds(lower.0, upper.0)
            }
            // Range A:   [-----] | [-----]   | [-----]         |         [-----] | [---------]
            // Range B: [-----]   |   [-----] |         [-----] | [-----]         |   [-----]
            // Result:  [-------] | [-------] | [-------------] | [-------------] | [---------]
            (Some((lhs_lower, lhs_upper)), Some((rhs_lower, rhs_upper))) => {
                Self::from_bounds(lhs_lower.min(rhs_lower).0, lhs_upper.max(rhs_upper).0)
            }
        }
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// if the resulting interval would be two disjoint intervals, `None` is returned.
    ///
    /// In comparison to [`Self::merge`], this method requires the intervals to be adjacent or
    /// overlapping.
    ///
    /// The `union` method is the same as the `+` operator, however, instead of returning an
    /// `Option`, it returns `Self` and panics if the resulting interval would be two disjoint
    /// intervals.
    #[must_use]
    fn union(self, other: Self) -> Option<Self>
    where
        T: PartialOrd,
    {
        if self.is_empty() {
            return Some(other);
        }
        if other.is_empty() {
            return Some(self);
        }

        (self.overlaps(&other) || self.is_adjacent_to(&other)).then(|| self.merge(other))
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// The `intersection` method is the same as the `*` operator.
    #[must_use]
    fn intersect(self, other: Self) -> Self
    where
        T: PartialOrd,
    {
        if self.overlaps(&other) {
            match (into_bounds_object(self), into_bounds_object(other)) {
                (None, _) | (_, None) => unreachable!("`overlaps()` returned true"),
                // The ranges overlaps
                // Range A:   [-----] | [-----]
                // Range B: [-----]   |   [-----]
                // Result:    [---]   |   [---]
                (Some((lhs_lower, lhs_upper)), Some((rhs_lower, rhs_upper))) => {
                    Self::from_bounds(lhs_lower.max(rhs_lower).0, lhs_upper.min(rhs_upper).0)
                }
            }
        } else {
            // Ranges do not overlap
            // Range A: [-------]           |           [-------]
            // Range B:           [-------] | [-------]
            // Result:         empty        |        empty
            Self::empty()
        }
    }

    /// Returns the first interval without the second interval.
    ///
    /// If the intervals do not overlap, the first interval is returned. If the result would be two
    /// disjoint intervals, `None` is returned.
    ///
    /// The `difference` method is the same as the `-` operator, however, instead of returning an
    /// `Option`, it returns `Self` and panics if the resulting interval would be two disjoint
    /// intervals.
    #[must_use]
    fn difference(self, other: Self) -> Option<Self>
    where
        T: PartialOrd,
        Self::LowerBound: LowerBound<T, UpperBound = Self::UpperBound>,
        Self::UpperBound: UpperBound<T, LowerBound = Self::LowerBound>,
    {
        match (into_bounds_object(self), into_bounds_object(other)) {
            (None, _) => Some(Self::empty()),
            (Some((lower, upper)), None) => Some(Self::from_bounds(lower.0, upper.0)),
            (Some((lhs_lower, lhs_upper)), Some((rhs_lower, rhs_upper))) => {
                match (
                    lhs_lower.cmp_lower(&rhs_lower),
                    lhs_lower.cmp_upper(&rhs_upper),
                    lhs_upper.cmp_lower(&rhs_lower),
                    lhs_upper.cmp_upper(&rhs_upper),
                ) {
                    // Range b is completely contained in range a
                    // Range A: [---------------]
                    // Range B:     [-------]
                    // Result:  [---]       [---]
                    (Ordering::Less, _, _, Ordering::Greater) => None,

                    // Ranges do not overlap
                    // Range A:             [--------]
                    // Range B: [-------]
                    // Result:              [--------]
                    (_, Ordering::Greater, ..) | (_, _, Ordering::Less, _) => {
                        Some(Self::from_bounds(lhs_lower.0, lhs_upper.0))
                    }

                    // Range A is completely contained in range B
                    // Range A:   [---]   | [---]   |   [---] | [---]
                    // Range B: [-------] | [-----] | [-----] | [---]
                    // Result: empty
                    (Ordering::Greater | Ordering::Equal, .., Ordering::Less | Ordering::Equal) => {
                        Some(Self::empty())
                    }

                    // Range A starts before range b
                    // Range A: [-----]   | [-------]
                    // Range B:     [---] |     [---]
                    // Result:  [---]     | [---]
                    (
                        Ordering::Less,
                        _,
                        Ordering::Greater | Ordering::Equal,
                        Ordering::Less | Ordering::Equal,
                    ) => Some(Self::from_bounds(lhs_lower.0, rhs_lower.into_upper().0)),

                    // Range A ends after range b
                    // Range A:   [-----] | [-------]
                    // Range B: [---]     | [---]
                    // Result:      [---] |     [---]
                    (
                        Ordering::Greater | Ordering::Equal,
                        Ordering::Less | Ordering::Equal,
                        _,
                        Ordering::Greater,
                    ) => Some(Self::from_bounds(rhs_upper.into_lower().0, lhs_upper.0)),
                }
            }
        }
    }
}
