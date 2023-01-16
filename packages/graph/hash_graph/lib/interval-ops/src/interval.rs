use core::{
    cmp::Ordering,
    iter::{once, Chain, Once},
    ops::Bound,
};

use crate::bounds::{
    compare_bounds, BoundType, LowerBound, LowerBoundHelper, UpperBound, UpperBoundHelper,
};

pub trait IntervalBounds<T> {
    fn lower_bound(&self) -> Bound<&T>;
    fn upper_bound(&self) -> Bound<&T>;

    fn into_lower_bound(self) -> Bound<T>;
    fn into_upper_bound(self) -> Bound<T>;
}

enum Return<T> {
    None,
    One(Once<T>),
    Two(Chain<Once<T>, Once<T>>),
}

impl<T> Return<T> {
    fn none() -> Self {
        Return::None
    }

    fn one(value: T) -> Self {
        Return::One(once(value))
    }

    fn two(first: T, second: T) -> Self {
        Return::Two(once(first).chain(once(second)))
    }
}

impl<T> Iterator for Return<T> {
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Return::None => None,
            Return::One(value) => value.next(),
            Return::Two(values) => values.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Return::None => (0, Some(0)),
            Return::One(_) => (1, Some(1)),
            Return::Two(_) => (2, Some(2)),
        }
    }
}

impl<T> ExactSizeIterator for Return<T> {
    fn len(&self) -> usize {
        self.size_hint().0
    }
}

// To avoid exposing the type, we use `impl Trait` syntax here
type IntervalIter<T> = impl ExactSizeIterator<Item = T>;

pub trait Interval<T>: Sized {
    type LowerBound: LowerBound<T>;
    type UpperBound: UpperBound<T>;

    /// Creates an interval from the given bounds.
    ///
    /// # Panics
    ///
    /// Panics if the lower bound is greater than the upper bound.
    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        T: PartialOrd;

    /// Returns a reference to the lower bound of this interval
    fn lower_bound(&self) -> &Self::LowerBound;

    /// Returns a reference to the upper bound of this interval
    fn upper_bound(&self) -> &Self::UpperBound;

    /// Converts the interval into its bounds.
    fn into_bound(self) -> (Self::LowerBound, Self::UpperBound);

    /// Returns `true` if both intervals have any points in common.
    #[must_use]
    fn overlaps(&self, other: &impl Interval<T>) -> bool
    where
        T: PartialOrd,
    {
        let lhs_lower = self.lower_bound();
        let lhs_upper = self.upper_bound();
        let rhs_lower = other.lower_bound();
        let rhs_upper = other.upper_bound();

        // Range A:    [-----] | [-----]
        // Range B: [-----]    |    [-----]
        matches!(
            lhs_lower.cmp_lower(rhs_lower),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            lhs_lower.cmp_upper(rhs_upper),
            Ordering::Less | Ordering::Equal
        ) || matches!(
            rhs_lower.cmp_lower(lhs_lower),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            rhs_lower.cmp_upper(lhs_upper),
            Ordering::Less | Ordering::Equal
        )
    }

    /// Returns `true` if both intervals are adjacent but do not overlap.
    #[must_use]
    fn is_adjacent_to(&self, other: &impl Interval<T>) -> bool
    where
        T: PartialOrd,
    {
        self.upper_bound().is_adjacent_to(other.lower_bound())
            || other.upper_bound().is_adjacent_to(self.lower_bound())
    }

    /// Checks if this interval contains the other value.
    ///
    /// Returns `true` if this interval's lower bound is less than or equal to `other` and this
    /// interval's upper bound is greater than or equal to `other`.
    #[must_use]
    fn contains_point(&self, other: &T) -> bool
    where
        T: PartialOrd,
    {
        matches!(
            compare_bounds(
                self.lower_bound().as_bound(),
                Bound::Included(other),
                BoundType::Lower,
                BoundType::Lower,
            ),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            compare_bounds(
                self.upper_bound().as_bound(),
                Bound::Included(other),
                BoundType::Upper,
                BoundType::Upper,
            ),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Checks if this interval completely contains the other interval.
    ///
    /// Returns `true` if this interval's lower bound is less than or equal to the other interval's
    /// lower bound and this interval's upper bound is greater than or equal to the other
    /// interval's upper bound.
    #[must_use]
    fn contains_interval(&self, other: &impl Interval<T>) -> bool
    where
        T: PartialOrd,
    {
        matches!(
            self.lower_bound().cmp_lower(other.lower_bound()),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            self.upper_bound().cmp_upper(other.upper_bound()),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Returns the complement of this interval.
    ///
    /// A complement is the interval of all points that are not in the this interval. The resulting
    /// interval and this interval do not overlap.
    #[must_use]
    fn complement(self) -> IntervalIter<Self>
    where
        T: PartialOrd,
    {
        // Range:        [-----]   | ---)    | ---]    |    (--- |    [---
        // Complement: --)     (-- |    [--- |    (--- | ---]    | ---)
        let lower = <Self::LowerBound as LowerBound<T>>::from_bound(Bound::Unbounded);
        let upper = <Self::UpperBound as UpperBound<T>>::from_bound(Bound::Unbounded);
        Self::from_bounds(lower, upper).difference(self)
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::union`], this method does also return the points between the
    /// intervals if they do not overlap.
    fn merge(self, other: Self) -> Self
    where
        T: PartialOrd,
    {
        let (lhs_lower, lhs_upper) = self.into_bound();
        let (rhs_lower, rhs_upper) = other.into_bound();

        // Range A:   [-----] | [-----]   | [-----]         |         [-----] | [---------]
        // Range B: [-----]   |   [-----] |         [-----] | [-----]         |   [-----]
        // Result:  [-------] | [-------] | [-------------] | [-------------] | [---------]
        Self::from_bounds(
            match lhs_lower.cmp_lower(&rhs_lower) {
                Ordering::Less | Ordering::Equal => lhs_lower,
                Ordering::Greater => {
                    <Self::LowerBound as LowerBound<T>>::from_bound(rhs_lower.into_bound())
                }
            },
            match lhs_upper.cmp_upper(&rhs_upper) {
                Ordering::Greater | Ordering::Equal => lhs_upper,
                Ordering::Less => {
                    <Self::UpperBound as UpperBound<T>>::from_bound(rhs_upper.into_bound())
                }
            },
        )
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::merge`], this method returns two intervals if they don't overlap.
    ///
    /// The `union` method is the same as the `+` operator, however, instead of returning an
    /// `Option`, it returns `Self` and panics if the resulting interval would be two disjoint
    /// intervals.
    fn union(self, other: Self) -> IntervalIter<Self>
    where
        T: PartialOrd,
    {
        if self.overlaps(&other) || self.is_adjacent_to(&other) {
            Return::one(self.merge(other))
        } else if self.lower_bound().cmp_lower(other.lower_bound()) == Ordering::Less {
            Return::two(self, other)
        } else {
            Return::two(other, self)
        }
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// The `intersection` method is the same as the `*` operator.
    #[must_use]
    fn intersect(self, other: Self) -> Option<Self>
    where
        T: PartialOrd,
    {
        self.overlaps(&other).then(|| {
            let (lhs_lower, lhs_upper) = self.into_bound();
            let (rhs_lower, rhs_upper) = other.into_bound();

            // The ranges overlaps
            // Range A:   [-----] | [-----]
            // Range B: [-----]   |   [-----]
            // Result:    [---]   |   [---]
            Self::from_bounds(
                match lhs_lower.cmp_lower(&rhs_lower) {
                    Ordering::Less | Ordering::Equal => rhs_lower,
                    Ordering::Greater => lhs_lower,
                },
                match lhs_upper.cmp_upper(&rhs_upper) {
                    Ordering::Less | Ordering::Equal => lhs_upper,
                    Ordering::Greater => rhs_upper,
                },
            )
        })
    }

    /// Returns the first interval without the second interval.
    ///
    /// If the intervals do not overlap, the first interval is returned. If the result would be two
    /// disjoint intervals, `None` is returned.
    ///
    /// The `difference` method is the same as the `-` operator, however, instead of returning an
    /// `Option`, it returns `Self` and panics if the resulting interval would be two disjoint
    /// intervals.
    fn difference(self, other: Self) -> IntervalIter<Self>
    where
        T: PartialOrd,
    {
        let (lhs_lower, lhs_upper) = self.into_bound();
        let (rhs_lower, rhs_upper) = other.into_bound();

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
            (Ordering::Less, _, _, Ordering::Greater) => Return::two(
                Self::from_bounds(lhs_lower, rhs_lower.into_upper()),
                Self::from_bounds(rhs_upper.into_lower(), lhs_upper),
            ),

            // Ranges do not overlap
            // Range A:             [--------]
            // Range B: [-------]
            // Result:              [--------]
            (_, Ordering::Greater, ..) | (_, _, Ordering::Less, _) => {
                Return::one(Self::from_bounds(lhs_lower, lhs_upper))
            }

            // Range A is completely contained in range B
            // Range A:   [---]   | [---]   |   [---] | [---]
            // Range B: [-------] | [-----] | [-----] | [---]
            // Result: empty
            (Ordering::Greater | Ordering::Equal, .., Ordering::Less | Ordering::Equal) => {
                Return::none()
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
            ) => Return::one(Self::from_bounds(lhs_lower, rhs_lower.into_upper())),

            // Range A ends after range b
            // Range A:   [-----] | [-------]
            // Range B: [---]     | [---]
            // Result:      [---] |     [---]
            (
                Ordering::Greater | Ordering::Equal,
                Ordering::Less | Ordering::Equal,
                _,
                Ordering::Greater,
            ) => Return::one(Self::from_bounds(rhs_upper.into_lower(), lhs_upper)),
        }
    }
}

#[cfg(test)]
mod tests {
    extern crate alloc;

    use alloc::vec::Vec;
    use core::ops::Bound;

    use crate::{
        bounds::{LowerBound, UpperBound},
        Interval, IntervalBounds,
    };

    fn assert_equality(
        actual: impl IntoIterator<Item = impl Interval<u32>>,
        expected: impl IntoIterator<Item = impl Interval<u32>>,
        operator: &'static str,
    ) {
        let actual: Vec<_> = actual
            .into_iter()
            .map(|actual| {
                let (lower, upper) = actual.into_bound();
                IntervalBounds::from_bounds(lower.into_bound(), upper.into_bound())
            })
            .collect();
        let expected: Vec<_> = expected
            .into_iter()
            .map(|expected| {
                let (lower, upper) = expected.into_bound();
                IntervalBounds::from_bounds(lower.into_bound(), upper.into_bound())
            })
            .collect();

        assert_eq!(
            actual, expected,
            "{operator} output failed, expected {expected:?}, got {actual:?}"
        );
    }

    fn test(
        lhs: IntervalBounds<u32>,
        rhs: IntervalBounds<u32>,
        intersection: impl IntoIterator<Item = IntervalBounds<u32>>,
        union: impl IntoIterator<Item = IntervalBounds<u32>>,
        merge: IntervalBounds<u32>,
        difference: impl IntoIterator<Item = IntervalBounds<u32>>,
    ) {
        let intersection = intersection.into_iter().collect::<Vec<_>>();
        let union = union.into_iter().collect::<Vec<_>>();
        let difference = difference.into_iter().collect::<Vec<_>>();

        assert_equality(lhs.intersect(rhs), intersection, "intersection");
        assert_equality(lhs.union(rhs), union, "union");
        assert_equality([lhs.merge(rhs)], [merge], "merge");
        assert_equality(lhs.difference(rhs), difference, "difference");

        let calculated_difference = rhs
            .complement()
            .filter_map(|rhs_complement| lhs.intersect(rhs_complement))
            .collect::<Vec<_>>();
        assert_equality(
            calculated_difference,
            lhs.difference(rhs),
            "difference calculated by complement",
        );

        if lhs.merge(rhs) == lhs {
            assert!(
                lhs.contains_interval(&rhs),
                "{lhs:?} contains {rhs:?}, but `contains_interval` reported otherwise"
            );
        } else {
            assert!(
                !lhs.contains_interval(&rhs),
                "{lhs:?} does not contain {rhs:?}, but reports so"
            );
        }

        if lhs.union(rhs).len() == 1 && lhs.intersect(rhs).is_some() {
            assert!(
                lhs.overlaps(&rhs),
                "{lhs:?} overlaps with {rhs:?}, but does not report so"
            );
        } else {
            assert!(
                !lhs.overlaps(&rhs),
                "{lhs:?} doesn't overlap with {rhs:?}, but does report so"
            );
        }

        if lhs.union(rhs).len() == 1 && !lhs.overlaps(&rhs) {
            assert!(
                lhs.is_adjacent_to(&rhs),
                "{lhs:?} is adjacent to {rhs:?}, but does not report so"
            );
        } else {
            assert!(
                !lhs.is_adjacent_to(&rhs),
                "{lhs:?} is not adjacent to {rhs:?}, but does report so"
            );
        }
        // TODO: Not implemented yet
        // assert_equality(lhs.symmetric_difference(rhs),
        // lhs.difference(rhs).union(rhs.difference(lhs)), "symmetric difference");
    }

    fn unbounded_unbounded() -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Unbounded, Bound::Unbounded)
    }

    fn included_unbounded(lower: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Included(lower), Bound::Unbounded)
    }

    fn excluded_unbounded(lower: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Excluded(lower), Bound::Unbounded)
    }

    fn unbounded_included(upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Unbounded, Bound::Included(upper))
    }

    fn unbounded_excluded(upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Unbounded, Bound::Excluded(upper))
    }

    fn included_included(lower: u32, upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Included(lower), Bound::Included(upper))
    }

    fn included_excluded(lower: u32, upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Included(lower), Bound::Excluded(upper))
    }

    fn excluded_included(lower: u32, upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Excluded(lower), Bound::Included(upper))
    }

    fn excluded_excluded(lower: u32, upper: u32) -> IntervalBounds<u32> {
        IntervalBounds::from_bounds(Bound::Excluded(lower), Bound::Excluded(upper))
    }

    #[test]
    fn partially_overlapping() {
        // Range A:      [-----]   |   [-----]
        // Range B:        [-----] | [-----]
        // intersection:   [---]   |   [---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)       |       (-]
        test(
            included_included(0, 10),
            included_included(5, 15),
            [included_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_included(5, 15),
            included_included(0, 10),
            [included_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      [-----)   |   [-----]
        // Range B:        [-----] | [-----)
        // intersection:   [---)   |   [---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)       |       [-]
        test(
            included_excluded(0, 10),
            included_included(5, 15),
            [included_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_included(5, 15),
            included_excluded(0, 10),
            [included_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      [-----]   |   [-----)
        // Range B:        [-----) | [-----]
        // intersection:   [---]   |   [---]
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-)       |       (-)
        test(
            included_included(0, 10),
            included_excluded(5, 15),
            [included_included(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_excluded(5, 15),
            included_included(0, 10),
            [included_included(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      [-----)   |   [-----)
        // Range B:        [-----) | [-----)
        // intersection:   [---)   |   [---)
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-)       |       [-)
        test(
            included_excluded(0, 10),
            included_excluded(5, 15),
            [included_excluded(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_excluded(5, 15),
            included_excluded(0, 10),
            [included_excluded(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      (-----]   |   [-----]
        // Range B:        [-----] | (-----]
        // intersection:   [---]   |   [---]
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-)       |       (-]
        test(
            excluded_included(0, 10),
            included_included(5, 15),
            [included_included(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_included(5, 15),
            excluded_included(0, 10),
            [included_included(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      (-----)   |   [-----]
        // Range B:        [-----] | (-----)
        // intersection:   [---)   |   [---)
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-)       |       [-]
        test(
            excluded_excluded(0, 10),
            included_included(5, 15),
            [included_excluded(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_included(5, 15),
            excluded_excluded(0, 10),
            [included_excluded(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      (-----]   |   [-----)
        // Range B:        [-----) | (-----]
        // intersection:   [---]   |   [---]
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-)       |       (-)
        test(
            excluded_included(0, 10),
            included_excluded(5, 15),
            [included_included(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_excluded(5, 15),
            excluded_included(0, 10),
            [included_included(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      (-----)   |   [-----)
        // Range B:        [-----) | (-----)
        // intersection:   [---)   |   [---)
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-)       |       [-)
        test(
            excluded_excluded(0, 10),
            included_excluded(5, 15),
            [included_excluded(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_excluded(5, 15),
            excluded_excluded(0, 10),
            [included_excluded(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      [-----]   |   (-----]
        // Range B:        (-----] | [-----]
        // intersection:   (---]   |   (---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]       |       (-]
        test(
            included_included(0, 10),
            excluded_included(5, 15),
            [excluded_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_included(5, 15),
            included_included(0, 10),
            [excluded_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      [-----)   |   (-----]
        // Range B:        (-----] | [-----)
        // intersection:   (---)   |   [---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]       |       [-]
        test(
            included_excluded(0, 10),
            excluded_included(5, 15),
            [excluded_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_included(5, 15),
            included_excluded(0, 10),
            [excluded_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      [-----]   |   (-----)
        // Range B:        (-----) | [-----]
        // intersection:   (---]   |   (---]
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-]       |       (-)
        test(
            included_included(0, 10),
            excluded_excluded(5, 15),
            [excluded_included(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_excluded(5, 15),
            included_included(0, 10),
            [excluded_included(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      [-----)   |   (-----)
        // Range B:        (-----) | [-----)
        // intersection:   (---)   |   [---)
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-]       |       [-)
        test(
            included_excluded(0, 10),
            excluded_excluded(5, 15),
            [excluded_excluded(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_excluded(5, 15),
            included_excluded(0, 10),
            [excluded_excluded(5, 10)],
            [included_excluded(0, 15)],
            included_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      (-----]   |   (-----]
        // Range B:        (-----] | (-----]
        // intersection:   (---]   |   [---]
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-]       |       (-]
        test(
            excluded_included(0, 10),
            excluded_included(5, 15),
            [excluded_included(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_included(5, 15),
            excluded_included(0, 10),
            [excluded_included(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      (-----)   |   (-----]
        // Range B:        (-----] | (-----)
        // intersection:   (---)   |   (---)
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-]       |       [-]
        test(
            excluded_excluded(0, 10),
            excluded_included(5, 15),
            [excluded_excluded(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_included(5, 15),
            excluded_excluded(0, 10),
            [excluded_excluded(5, 10)],
            [excluded_included(0, 15)],
            excluded_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      (-----]   |   (-----)
        // Range B:        (-----) | (-----]
        // intersection:   (---]   |   (---]
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-]       |       (-)
        test(
            excluded_included(0, 10),
            excluded_excluded(5, 15),
            [excluded_included(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_excluded(5, 15),
            excluded_included(0, 10),
            [excluded_included(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      (-----)   |   (-----)
        // Range B:        (-----) | (-----)
        // intersection:   (---)   |   (---)
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-]       |       [-)
        test(
            excluded_excluded(0, 10),
            excluded_excluded(5, 15),
            [excluded_excluded(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_excluded(5, 15),
            excluded_excluded(0, 10),
            [excluded_excluded(5, 10)],
            [excluded_excluded(0, 15)],
            excluded_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      ------]   |   [------
        // Range B:        [------ | ------]
        // intersection:   [---]   |   [---]
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --)       |       (--
        test(
            unbounded_included(10),
            included_unbounded(5),
            [included_included(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [unbounded_excluded(5)],
        );
        test(
            included_unbounded(5),
            unbounded_included(10),
            [included_included(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [excluded_unbounded(10)],
        );

        // Range A:      ------)   |   (------
        // Range B:        (------ | ------)
        // intersection:   (---)   |   (---)
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --]       |       [--
        test(
            unbounded_excluded(10),
            excluded_unbounded(5),
            [excluded_excluded(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [unbounded_included(5)],
        );
        test(
            excluded_unbounded(5),
            unbounded_excluded(10),
            [excluded_excluded(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [included_unbounded(10)],
        );
    }

    #[test]
    fn disjoint() {
        // Range A:      [---]       |       [---]
        // Range B:            [---] | [---]
        // intersection:    empty    |    empty
        // union:        [---] [---] | [---] [---]
        // merge:        [---------] | [---------]
        // difference:   [---]       |       [---]
        test(
            included_included(0, 5),
            included_included(10, 15),
            [],
            [included_included(0, 5), included_included(10, 15)],
            included_included(0, 15),
            [included_included(0, 5)],
        );
        test(
            included_included(10, 15),
            included_included(0, 5),
            [],
            [included_included(0, 5), included_included(10, 15)],
            included_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      [---)       |       [---]
        // Range B:            [---] | [---)
        // intersection:    empty    |    empty
        // union:        [---) [---] | [---) [---]
        // merge:        [---------] | [---------]
        // difference:   [---)       |       [---]
        test(
            included_excluded(0, 5),
            included_included(10, 15),
            [],
            [included_excluded(0, 5), included_included(10, 15)],
            included_included(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_included(10, 15),
            included_excluded(0, 5),
            [],
            [included_excluded(0, 5), included_included(10, 15)],
            included_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      [---]       |       [---)
        // Range B:            [---) | [---]
        // intersection:    empty    |    empty
        // union:        [---] [---) | [---] [---)
        // merge:        [---------) | [---------)
        // difference:   [---]       |       [---)
        test(
            included_included(0, 5),
            included_excluded(10, 15),
            [],
            [included_included(0, 5), included_excluded(10, 15)],
            included_excluded(0, 15),
            [included_included(0, 5)],
        );
        test(
            included_excluded(10, 15),
            included_included(0, 5),
            [],
            [included_included(0, 5), included_excluded(10, 15)],
            included_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      [---)       |       [---)
        // Range B:            [---) | [---)
        // intersection:    empty    |    empty
        // union:        [---) [---) | [---) [---)
        // merge:        [---------) | [---------)
        // difference:   [---)       |       [---)
        test(
            included_excluded(0, 5),
            included_excluded(10, 15),
            [],
            [included_excluded(0, 5), included_excluded(10, 15)],
            included_excluded(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            included_excluded(10, 15),
            included_excluded(0, 5),
            [],
            [included_excluded(0, 5), included_excluded(10, 15)],
            included_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      (---]       |       [---]
        // Range B:            [---] | (---]
        // intersection:    empty    |    empty
        // union:        (---] [---] | (---] [---]
        // merge:        (---------] | (---------]
        // difference:   (---]       |       [---]
        test(
            excluded_included(0, 5),
            included_included(10, 15),
            [],
            [excluded_included(0, 5), included_included(10, 15)],
            excluded_included(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            included_included(10, 15),
            excluded_included(0, 5),
            [],
            [excluded_included(0, 5), included_included(10, 15)],
            excluded_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      (---)       |       [---]
        // Range B:            [---] | (---)
        // intersection:    empty    |    empty
        // union:        (---) [---] | (---) [---]
        // merge:        (---------] | (---------]
        // difference:   (---)       |       [---]
        test(
            excluded_excluded(0, 5),
            included_included(10, 15),
            [],
            [excluded_excluded(0, 5), included_included(10, 15)],
            excluded_included(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_included(10, 15),
            excluded_excluded(0, 5),
            [],
            [excluded_excluded(0, 5), included_included(10, 15)],
            excluded_included(0, 15),
            [included_included(10, 15)],
        );

        // Range A:      (---]       |       [---)
        // Range B:            [---) | (---]
        // intersection:    empty    |    empty
        // union:        (---] [---) | (---] [---)
        // merge:        (---------) | (---------)
        // difference:   (---]       |       [---)
        test(
            excluded_included(0, 5),
            included_excluded(10, 15),
            [],
            [excluded_included(0, 5), included_excluded(10, 15)],
            excluded_excluded(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            included_excluded(10, 15),
            excluded_included(0, 5),
            [],
            [excluded_included(0, 5), included_excluded(10, 15)],
            excluded_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      (---)       |       [---)
        // Range B:            [---) | (---)
        // intersection:    empty    |    empty
        // union:        (---) [---) | (---) [---)
        // merge:        (---------) | (---------)
        // difference:   (---)       |       [---)
        test(
            excluded_excluded(0, 5),
            included_excluded(10, 15),
            [],
            [excluded_excluded(0, 5), included_excluded(10, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            included_excluded(10, 15),
            excluded_excluded(0, 5),
            [],
            [excluded_excluded(0, 5), included_excluded(10, 15)],
            excluded_excluded(0, 15),
            [included_excluded(10, 15)],
        );

        // Range A:      [---]       |       (---]
        // Range B:            (---] | [---]
        // intersection:    empty    |    empty
        // union:        [---] (---] | [---] (---]
        // merge:        [---------] | [---------]
        // difference:   [---]       |       (---]
        test(
            included_included(0, 5),
            excluded_included(10, 15),
            [],
            [included_included(0, 5), excluded_included(10, 15)],
            included_included(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_included(10, 15),
            included_included(0, 5),
            [],
            [included_included(0, 5), excluded_included(10, 15)],
            included_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      [---)       |       (---]
        // Range B:            (---] | [---)
        // intersection:    empty    |    empty
        // union:        [---) (---] | [---) (---]
        // merge:        [---------] | [---------]
        // difference:   [---)       |       (---]
        test(
            included_excluded(0, 5),
            excluded_included(10, 15),
            [],
            [included_excluded(0, 5), excluded_included(10, 15)],
            included_included(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            excluded_included(10, 15),
            included_excluded(0, 5),
            [],
            [included_excluded(0, 5), excluded_included(10, 15)],
            included_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      [---]       |       (---)
        // Range B:            (---) | [---]
        // intersection:    empty    |    empty
        // union:        [---] (---) | [---] (---)
        // merge:        [---------) | [---------)
        // difference:   [---]       |       (---)
        test(
            included_included(0, 5),
            excluded_excluded(10, 15),
            [],
            [included_included(0, 5), excluded_excluded(10, 15)],
            included_excluded(0, 15),
            [included_included(0, 5)],
        );
        test(
            excluded_excluded(10, 15),
            included_included(0, 5),
            [],
            [included_included(0, 5), excluded_excluded(10, 15)],
            included_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      [---)       |       (---)
        // Range B:            (---) | [---)
        // intersection:    empty    |    empty
        // union:        [---) (---) | [---) (---)
        // merge:        [---------) | [---------)
        // difference:   [---)       |       (---)
        test(
            included_excluded(0, 5),
            excluded_excluded(10, 15),
            [],
            [included_excluded(0, 5), excluded_excluded(10, 15)],
            included_excluded(0, 15),
            [included_excluded(0, 5)],
        );
        test(
            excluded_excluded(10, 15),
            included_excluded(0, 5),
            [],
            [included_excluded(0, 5), excluded_excluded(10, 15)],
            included_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      (---]       |       (---]
        // Range B:            (---] | (---]
        // intersection:    empty    |    empty
        // union:        (---] (---] | (---] (---]
        // merge:        (---------] | (---------]
        // difference:   (---]       |       (---]
        test(
            excluded_included(0, 5),
            excluded_included(10, 15),
            [],
            [excluded_included(0, 5), excluded_included(10, 15)],
            excluded_included(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_included(10, 15),
            excluded_included(0, 5),
            [],
            [excluded_included(0, 5), excluded_included(10, 15)],
            excluded_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      (---)       |       (---]
        // Range B:            (---] | (---)
        // intersection:    empty    |    empty
        // union:        (---) (---] | (---) (---]
        // merge:        (---------] | (---------]
        // difference:   (---)       |       (---]
        test(
            excluded_excluded(0, 5),
            excluded_included(10, 15),
            [],
            [excluded_excluded(0, 5), excluded_included(10, 15)],
            excluded_included(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            excluded_included(10, 15),
            excluded_excluded(0, 5),
            [],
            [excluded_excluded(0, 5), excluded_included(10, 15)],
            excluded_included(0, 15),
            [excluded_included(10, 15)],
        );

        // Range A:      (---]       |       (---)
        // Range B:            (---) | (---]
        // intersection:    empty    |    empty
        // union:        (---] (---) | (---] (---)
        // merge:        (---------) | (---------)
        // difference:   (---]       |       (---)
        test(
            excluded_included(0, 5),
            excluded_excluded(10, 15),
            [],
            [excluded_included(0, 5), excluded_excluded(10, 15)],
            excluded_excluded(0, 15),
            [excluded_included(0, 5)],
        );
        test(
            excluded_excluded(10, 15),
            excluded_included(0, 5),
            [],
            [excluded_included(0, 5), excluded_excluded(10, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(10, 15)],
        );

        // Range A:      (---)       |       (---)
        // Range B:            (---) | (---)
        // intersection:    empty    |    empty
        // union:        (---) (---) | (---) (---)
        // merge:        (---------) | (---------)
        // difference:   (---)       |       (---)
        test(
            excluded_excluded(0, 5),
            excluded_excluded(5, 15),
            [],
            [excluded_excluded(0, 5), excluded_excluded(5, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(0, 5)],
        );
        test(
            excluded_excluded(5, 15),
            excluded_excluded(0, 5),
            [],
            [excluded_excluded(0, 5), excluded_excluded(5, 15)],
            excluded_excluded(0, 15),
            [excluded_excluded(5, 15)],
        );
    }

    #[test]
    fn adjacent() {
        // Range A:      [---]     |     [---]
        // Range B:          [---] | [---]
        // intersection:     |     |     |
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     (---]
        test(
            included_included(0, 5),
            included_included(5, 10),
            [included_included(5, 5)],
            [included_included(0, 10)],
            included_included(0, 10),
            [included_excluded(0, 5)],
        );
        test(
            included_included(5, 10),
            included_included(0, 5),
            [included_included(5, 5)],
            [included_included(0, 10)],
            included_included(0, 10),
            [excluded_included(5, 10)],
        );

        // Range A:      [---]     |     (---]
        // Range B:          (---] | [---]
        // intersection:   empty  |   empty
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---]     |     (---]
        test(
            included_included(0, 5),
            excluded_included(5, 10),
            [],
            [included_included(0, 10)],
            included_included(0, 10),
            [included_included(0, 5)],
        );
        test(
            excluded_included(5, 10),
            included_included(0, 5),
            [],
            [included_included(0, 10)],
            included_included(0, 10),
            [excluded_included(5, 10)],
        );

        // Range A:      [---)     |     [---]
        // Range B:          [---] | [---)
        // intersection:   empty  |   empty
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     [---]
        test(
            included_excluded(0, 5),
            included_included(5, 10),
            [],
            [included_included(0, 10)],
            included_included(0, 10),
            [included_excluded(0, 5)],
        );
        test(
            included_included(5, 10),
            included_excluded(0, 5),
            [],
            [included_included(0, 10)],
            included_included(0, 10),
            [included_included(5, 10)],
        );

        // Range A:      [---)     |     (---]
        // Range B:          (---] | [---)
        // intersection:   empty  |   empty
        // union:        [---X---] | [---X---]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     (---]
        test(
            included_excluded(0, 5),
            excluded_included(5, 10),
            [],
            [included_excluded(0, 5), excluded_included(5, 10)],
            included_included(0, 10),
            [included_excluded(0, 5)],
        );
        test(
            excluded_included(5, 10),
            included_excluded(0, 5),
            [],
            [included_excluded(0, 5), excluded_included(5, 10)],
            included_included(0, 10),
            [excluded_included(5, 10)],
        );
    }

    #[test]
    fn contained() {
        // Range A:      [-------] |   [---]
        // Range B:        [---]   | [-------]
        // intersection:   [---]   |   [---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)   (-] |   empty
        test(
            included_included(0, 15),
            included_included(5, 10),
            [included_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_excluded(0, 5), excluded_included(10, 15)],
        );
        test(
            included_included(5, 10),
            included_included(0, 15),
            [included_included(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [],
        );

        // Range A:      [-------] |   (---)
        // Range B:        (---)   | [-------]
        // intersection:   (---)   |   (---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]   [-] |   empty
        test(
            included_included(0, 15),
            excluded_excluded(5, 10),
            [excluded_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [included_included(0, 5), included_included(10, 15)],
        );
        test(
            excluded_excluded(5, 10),
            included_included(0, 15),
            [excluded_excluded(5, 10)],
            [included_included(0, 15)],
            included_included(0, 15),
            [],
        );

        // Range A:      --------- |   (---)
        // Range B:        (---)   | ---------
        // intersection:   (---)   |   (---)
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --]   [-- |   empty
        test(
            unbounded_unbounded(),
            excluded_excluded(5, 10),
            [excluded_excluded(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [unbounded_included(5), included_unbounded(10)],
        );
        test(
            excluded_excluded(5, 10),
            unbounded_unbounded(),
            [excluded_excluded(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [],
        );

        // Range A:      --------- |   [---]
        // Range B:        [---]   | ---------
        // intersection:   [---]   |   [---]
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --)   (-- |   empty
        test(
            unbounded_unbounded(),
            included_included(5, 10),
            [included_included(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [unbounded_excluded(5), excluded_unbounded(10)],
        );
        test(
            included_included(5, 10),
            unbounded_unbounded(),
            [included_included(5, 10)],
            [unbounded_unbounded()],
            unbounded_unbounded(),
            [],
        );
    }

    #[test]
    fn equal() {
        for interval in [
            included_included(0, 5),
            excluded_included(0, 5),
            included_excluded(0, 5),
            excluded_excluded(0, 5),
            included_unbounded(0),
            unbounded_included(5),
            excluded_unbounded(0),
            unbounded_excluded(5),
            unbounded_unbounded(),
        ] {
            test(interval, interval, [interval], [interval], interval, []);
        }
    }

    #[test]
    fn contains_point() {
        assert!(included_included(5, 10).contains_point(&5));
        assert!(included_included(5, 10).contains_point(&10));
        assert!(!included_included(5, 10).contains_point(&4));
        assert!(!included_included(5, 10).contains_point(&11));

        assert!(excluded_included(5, 10).contains_point(&6));
        assert!(excluded_included(5, 10).contains_point(&10));
        assert!(!excluded_included(5, 10).contains_point(&5));
        assert!(!excluded_included(5, 10).contains_point(&11));

        assert!(included_excluded(5, 10).contains_point(&5));
        assert!(included_excluded(5, 10).contains_point(&9));
        assert!(!included_excluded(5, 10).contains_point(&4));
        assert!(!included_excluded(5, 10).contains_point(&10));

        assert!(excluded_excluded(5, 10).contains_point(&6));
        assert!(excluded_excluded(5, 10).contains_point(&9));
        assert!(!excluded_excluded(5, 10).contains_point(&5));
        assert!(!excluded_excluded(5, 10).contains_point(&10));

        assert!(included_unbounded(5).contains_point(&5));
        assert!(included_unbounded(5).contains_point(&10));
        assert!(!included_unbounded(5).contains_point(&4));

        assert!(unbounded_included(10).contains_point(&5));
        assert!(unbounded_included(10).contains_point(&10));
        assert!(!unbounded_included(10).contains_point(&11));

        assert!(excluded_unbounded(5).contains_point(&6));
        assert!(excluded_unbounded(5).contains_point(&10));
        assert!(!excluded_unbounded(5).contains_point(&5));

        assert!(unbounded_excluded(10).contains_point(&5));
        assert!(unbounded_excluded(10).contains_point(&4));
        assert!(!unbounded_excluded(10).contains_point(&10));

        assert!(unbounded_unbounded().contains_point(&5));
    }
}
