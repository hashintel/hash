mod bounds;

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
    iter::{once, Chain, Once},
    marker::PhantomData,
    ops::{Bound, RangeBounds},
};

use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

pub use self::bounds::IntervalBound;
use self::bounds::{compare_bounds, BoundType, IntervalBoundHelper};

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

// TODO: We want some sensible aliases for intervals with specific bounds, so we don't have to
//       write `Interval<T, S, E>` everywhere. This also improves the `ToSchema` definition.
//   see https://app.asana.com/0/0/1203783495017458/f
#[derive(Copy, Clone, Serialize, Deserialize)]
#[serde(bound(
    serialize = "S: Serialize, E: Serialize",
    deserialize = "S: Deserialize<'de>, E: Deserialize<'de>"
))]
pub struct Interval<T, S, E> {
    start: S,
    end: E,
    #[serde(skip)]
    _marker: PhantomData<T>,
}

impl<T, S, E> Interval<T, S, E> {
    /// Creates an interval from the given bounds.
    ///
    /// # Safety
    ///
    /// The start bound must be less than or equal to the end bound.
    pub fn new_unchecked(start: S, end: E) -> Self {
        Self {
            start,
            end,
            _marker: PhantomData,
        }
    }

    /// Returns a reference to the start bound of this interval
    pub fn start(&self) -> &S {
        &self.start
    }

    /// Returns a reference to the end bound of this interval
    pub fn end(&self) -> &E {
        &self.end
    }

    /// Converts the interval into its bounds.
    pub fn into_bounds(self) -> (S, E) {
        (self.start, self.end)
    }
}

impl<T, S: IntervalBound<T>, E: IntervalBound<T>> Interval<T, S, E> {
    /// Creates an interval from the given bounds.
    ///
    /// # Panics
    ///
    /// Panics if the start bound is greater than the end bound.
    pub fn new(start: S, end: E) -> Self
    where
        T: PartialOrd,
    {
        assert_ne!(
            compare_bounds(
                start.as_bound(),
                end.as_bound(),
                BoundType::Start,
                BoundType::End,
            ),
            Ordering::Greater,
            "Start bound must be less than or equal to end bound"
        );
        Self::new_unchecked(start, end)
    }

    pub fn convert<S2, E2>(self) -> Interval<T, E2, S2>
    where
        E2: IntervalBound<T>,
        S2: IntervalBound<T>,
    {
        let (lower, upper) = self.into_bounds();
        Interval::new_unchecked(
            E2::from_bound(lower.into_bound()),
            S2::from_bound(upper.into_bound()),
        )
    }

    /// Returns `true` if both intervals have any points in common.
    #[must_use]
    pub fn overlaps(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: PartialOrd,
    {
        // Examples |      1     |     2
        // =========|============|============
        // Range A  |    [-----] | [-----]
        // Range B  | [-----]    |    [-----]
        matches!(
            self.cmp_start_to_start(other),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            self.cmp_start_to_end(other),
            Ordering::Less | Ordering::Equal
        ) || matches!(
            other.cmp_start_to_start(self),
            Ordering::Greater | Ordering::Equal
        ) && matches!(
            other.cmp_start_to_end(self),
            Ordering::Less | Ordering::Equal
        )
    }

    /// Returns `true` if both intervals are adjacent but do not overlap.
    #[must_use]
    pub fn is_adjacent_to(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: PartialEq,
    {
        fn bounds_are_adjacent<T>(lhs: &impl IntervalBound<T>, rhs: &impl IntervalBound<T>) -> bool
        where
            T: PartialEq,
        {
            match (lhs.as_bound(), rhs.as_bound()) {
                (Bound::Included(lhs), Bound::Excluded(rhs))
                | (Bound::Excluded(lhs), Bound::Included(rhs)) => lhs == rhs,
                _ => false,
            }
        }

        bounds_are_adjacent(self.start(), other.end())
            || bounds_are_adjacent(other.start(), self.end())
    }

    /// Checks if this interval contains the other value.
    ///
    /// Returns `true` if this interval's start bound is less than or equal to `other` and this
    /// interval's end bound is greater than or equal to `other`.
    #[must_use]
    pub fn contains_point(&self, other: &T) -> bool
    where
        T: PartialOrd,
    {
        matches!(
            compare_bounds(
                self.start().as_bound(),
                Bound::Included(other),
                BoundType::Start,
                BoundType::Start,
            ),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            compare_bounds(
                self.end().as_bound(),
                Bound::Included(other),
                BoundType::End,
                BoundType::End,
            ),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Checks if this interval completely contains the other interval.
    ///
    /// Returns `true` if this interval's start bound is less than or equal to the other interval's
    /// start bound and this interval's end bound is greater than or equal to the other
    /// interval's end bound.
    #[must_use]
    pub fn contains_interval(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> bool
    where
        T: PartialOrd,
    {
        matches!(
            self.cmp_start_to_start(other),
            Ordering::Less | Ordering::Equal
        ) && matches!(
            self.cmp_end_to_end(other),
            Ordering::Greater | Ordering::Equal
        )
    }

    /// Returns the complement of this interval.
    ///
    /// A complement is the interval of all points that are not in the this interval. The resulting
    /// interval and this interval do not overlap.
    #[must_use]
    pub fn complement(self) -> impl ExactSizeIterator<Item = Self>
    where
        T: PartialOrd,
    {
        // Examples   |      1      |    2    |    3    |    4    |    5
        // =========================|=========|=========|=========|=========
        // Range      |   [-----]   | ---)    | ---]    |    (--- |    [---
        // -------------------------|---------|---------|---------|---------
        // Complement | --)     (-- |    [--- |    (--- | ---]    | ---)
        let start = S::from_bound(Bound::Unbounded);
        let end = E::from_bound(Bound::Unbounded);
        Self::new_unchecked(start, end).difference(self)
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::union`], this method does also return the points between the
    /// intervals if they do not overlap.
    pub fn merge(self, other: Self) -> Self
    where
        T: PartialOrd,
    {
        let start_ordering = self.cmp_start_to_start(&other);
        let end_ordering = self.cmp_end_to_end(&other);
        // Examples |     1     |      2    |        3        |        4        |      5
        // =========|===========|===========|=================|=================|=============
        // Range A  |   [-----] | [-----]   | [-----]         |         [-----] | [---------]
        // Range B  | [-----]   |   [-----] |         [-----] | [-----]         |   [-----]
        // ---------|-----------|-----------|-----------------|-----------------|-------------
        // Merge    | [-------] | [-------] | [-------------] | [-------------] | [---------]
        Self::new_unchecked(
            match start_ordering {
                Ordering::Less | Ordering::Equal => self.start,
                Ordering::Greater => other.start,
            },
            match end_ordering {
                Ordering::Greater | Ordering::Equal => self.end,
                Ordering::Less => other.end,
            },
        )
    }

    /// Returns a new interval that contains all points in both intervals.
    ///
    /// In comparison to [`Self::merge`], this method returns two intervals if they don't overlap.
    pub fn union(self, other: Self) -> impl ExactSizeIterator<Item = Self>
    where
        T: PartialOrd,
    {
        if self.overlaps(&other) || self.is_adjacent_to(&other) {
            Return::one(self.merge(other))
        } else if self.cmp_start_to_start(&other) == Ordering::Less {
            Return::two(self, other)
        } else {
            Return::two(other, self)
        }
    }

    /// Returns a new interval that contains all points in both intervals.
    #[must_use]
    pub fn intersect(self, other: Self) -> Option<Self>
    where
        T: PartialOrd,
    {
        self.overlaps(&other).then(|| {
            let start_ordering = self.cmp_start_to_start(&other);
            let end_ordering = self.cmp_end_to_end(&other);

            // Examples     |     1     |     2
            // =============|===========|===========
            // Range A      |   [-----] | [-----]
            // Range B      | [-----]   |   [-----]
            // -------------|-----------|-----------
            // Intersection |   [---]   |   [---]
            Self::new_unchecked(
                match start_ordering {
                    Ordering::Less | Ordering::Equal => other.start,
                    Ordering::Greater => self.start,
                },
                match end_ordering {
                    Ordering::Less | Ordering::Equal => self.end,
                    Ordering::Greater => other.end,
                },
            )
        })
    }

    /// Returns the first interval without the second interval.
    ///
    /// If the intervals do not overlap, the first interval is returned. If the result would be two
    /// disjoint intervals, `None` is returned.
    pub fn difference(self, other: Self) -> impl ExactSizeIterator<Item = Self>
    where
        T: PartialOrd,
    {
        match (
            self.cmp_start_to_start(&other),
            self.cmp_start_to_end(&other),
            self.cmp_end_to_start(&other),
            self.cmp_end_to_end(&other),
        ) {
            // Range B is completely contained in range A:
            // Example    |         1
            // ===========|===================
            // Range A    | [---------------]
            // Range B    |     [-------]
            // -----------|-------------------
            // Difference | [---]       [---]
            (Ordering::Less, _, _, Ordering::Greater) => Return::two(
                Self::new_unchecked(self.start, other.start.flip()),
                Self::new_unchecked(other.end.flip(), self.end),
            ),

            // Ranges do not overlap:
            // Example    |      1
            // ===========|==============
            // Range A    |        [---]
            // Range B    | [---]
            // -----------|--------------
            // Difference |        [---]
            (_, Ordering::Greater, ..) | (_, _, Ordering::Less, _) => Return::one(self),

            // Range A is completely contained in range B:
            // Examples   |     1     |    2    |    3    |   4
            // ===========|===========|=========|=========|=======
            // Range A    |   [---]   | [---]   |   [---] | [---]
            // Range B    | [-------] | [-----] | [-----] | [---]
            // -----------|-----------|---------|---------|-------
            // Difference |   empty   |  empty  |  empty  | empty
            (Ordering::Greater | Ordering::Equal, .., Ordering::Less | Ordering::Equal) => {
                Return::none()
            }

            // Range A starts before range B:
            // Examples   |     1     |     2
            // ===========|===========|===========
            // Range A    | [-----]   | [-------]
            // Range B    |     [---] |     [---]
            // -----------|-----------|-----------
            // Difference | [---]     | [---]
            (
                Ordering::Less,
                _,
                Ordering::Greater | Ordering::Equal,
                Ordering::Less | Ordering::Equal,
            ) => Return::one(Self::new_unchecked(self.start, other.start.flip())),

            // Range A ends after range B:
            // Examples   |     1     |     2
            // ===========|===========|===========
            // Range A    |   [-----] | [-------]
            // Range B    | [---]     | [---]
            // -----------|-----------|-----------
            // Difference |     [---] |     [---]
            (
                Ordering::Greater | Ordering::Equal,
                Ordering::Less | Ordering::Equal,
                _,
                Ordering::Greater,
            ) => Return::one(Self::new_unchecked(other.end.flip(), self.end)),
        }
    }
}

impl<T, S, E> RangeBounds<T> for Interval<T, S, E>
where
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn start_bound(&self) -> Bound<&T> {
        self.start.as_bound()
    }

    fn end_bound(&self) -> Bound<&T> {
        self.end.as_bound()
    }
}

impl<T, S, E, R> PartialEq<R> for Interval<T, S, E>
where
    T: PartialEq,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
    R: RangeBounds<T>,
{
    fn eq(&self, other: &R) -> bool {
        self.start_bound() == other.start_bound() && self.end_bound() == other.end_bound()
    }
}

impl<T, S, E> Eq for Interval<T, S, E>
where
    T: Eq,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
}

impl<T, S, E> Hash for Interval<T, S, E>
where
    S: Hash,
    E: Hash,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.start.hash(state);
        self.end.hash(state);
    }
}

impl<T, S, E> fmt::Debug for Interval<T, S, E>
where
    T: fmt::Debug,
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.start_bound() {
            Bound::Included(limit) => write!(fmt, "[{limit:?}")?,
            Bound::Excluded(limit) => write!(fmt, "({limit:?}")?,
            Bound::Unbounded => write!(fmt, "(-∞")?,
        }
        fmt.write_str(", ")?;
        match self.end_bound() {
            Bound::Included(limit) => write!(fmt, "{limit:?}]"),
            Bound::Excluded(limit) => write!(fmt, "{limit:?})"),
            Bound::Unbounded => write!(fmt, "+∞)"),
        }
    }
}

// utoipa does not properly support generics yet, so we need to manually implement ToSchema for
// Interval. `#[schema(inline)]` does not work as well as it does not add a `ToSchema` bound.
impl<'s, A, S, E> ToSchema<'s> for Interval<A, S, E>
where
    S: ToSchema<'s>,
    E: ToSchema<'s>,
{
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "Interval",
            openapi::Schema::Object(
                openapi::ObjectBuilder::new()
                    .property("start", openapi::Ref::from_schema_name(S::schema().0))
                    .required("start")
                    .property("end", openapi::Ref::from_schema_name(E::schema().0))
                    .required("end")
                    .build(),
            )
            .into(),
        )
    }
}

#[inline(never)]
fn invalid_bounds() -> ! {
    panic!("interval lower bound must be less than or equal to its upper bound")
}

#[cfg(test)]
mod tests {
    use core::ops::Bound;

    use super::*;

    fn assert_equality(
        actual: impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
        expected: impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
        operator: &'static str,
    ) {
        let actual: Vec<_> = actual
            .into_iter()
            .map(|actual| {
                let (start, end) = actual.into_bounds();
                Interval::new(start.into_bound(), end.into_bound())
            })
            .collect();
        let expected: Vec<_> = expected
            .into_iter()
            .map(|expected| {
                let (start, end) = expected.into_bounds();
                Interval::new(start.into_bound(), end.into_bound())
            })
            .collect();

        assert_eq!(
            actual, expected,
            "{operator} output failed, expected {expected:?}, got {actual:?}"
        );
    }

    struct TestData<I, U, D> {
        lhs: Interval<u32, Bound<u32>, Bound<u32>>,
        rhs: Interval<u32, Bound<u32>, Bound<u32>>,
        intersection: I,
        union: U,
        merge: Interval<u32, Bound<u32>, Bound<u32>>,
        difference: D,
    }

    fn test(
        test_data: TestData<
            impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
            impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
            impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
        >,
    ) {
        let TestData {
            lhs,
            rhs,
            intersection,
            union,
            merge,
            difference,
        } = test_data;

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
                "{lhs:?} does not contain {rhs:?}, but `contains_interval` reports so"
            );
        }

        if lhs.union(rhs).len() == 1 && lhs.intersect(rhs).is_some() {
            assert!(
                lhs.overlaps(&rhs),
                "{lhs:?} overlaps with {rhs:?}, but `overlaps` does not report so"
            );
        } else {
            assert!(
                !lhs.overlaps(&rhs),
                "{lhs:?} doesn't overlap with {rhs:?}, but `overlaps` does report so"
            );
        }

        if lhs.union(rhs).len() == 1 && !lhs.overlaps(&rhs) {
            assert!(
                lhs.is_adjacent_to(&rhs),
                "{lhs:?} is adjacent to {rhs:?}, but `is_adjacent_to` does not report so"
            );
        } else {
            assert!(
                !lhs.is_adjacent_to(&rhs),
                "{lhs:?} is not adjacent to {rhs:?}, but `is_adjacent_to` does report so"
            );
        }
        // TODO: Not implemented yet
        // assert_equality(lhs.symmetric_difference(rhs),
        // lhs.difference(rhs).union(rhs.difference(lhs)), "symmetric difference");
    }

    fn unbounded_unbounded() -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Unbounded, Bound::Unbounded)
    }

    fn included_unbounded(start: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Included(start), Bound::Unbounded)
    }

    fn excluded_unbounded(start: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Excluded(start), Bound::Unbounded)
    }

    fn unbounded_included(end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Unbounded, Bound::Included(end))
    }

    fn unbounded_excluded(end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Unbounded, Bound::Excluded(end))
    }

    fn included_included(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Included(start), Bound::Included(end))
    }

    fn included_excluded(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Included(start), Bound::Excluded(end))
    }

    fn excluded_included(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Excluded(start), Bound::Included(end))
    }

    fn excluded_excluded(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
        Interval::new(Bound::Excluded(start), Bound::Excluded(end))
    }

    #[test]
    fn partially_overlapping() {
        // Range A:      [-----]   |   [-----]
        // Range B:        [-----] | [-----]
        // intersection:   [---]   |   [---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)       |       (-]
        test(TestData {
            lhs: included_included(0, 10),
            rhs: included_included(5, 15),
            intersection: [included_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 15),
            rhs: included_included(0, 10),
            intersection: [included_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      [-----)   |   [-----]
        // Range B:        [-----] | [-----)
        // intersection:   [---)   |   [---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)       |       [-]
        test(TestData {
            lhs: included_excluded(0, 10),
            rhs: included_included(5, 15),
            intersection: [included_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 15),
            rhs: included_excluded(0, 10),
            intersection: [included_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      [-----]   |   [-----)
        // Range B:        [-----) | [-----]
        // intersection:   [---]   |   [---]
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-)       |       (-)
        test(TestData {
            lhs: included_included(0, 10),
            rhs: included_excluded(5, 15),
            intersection: [included_included(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(5, 15),
            rhs: included_included(0, 10),
            intersection: [included_included(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      [-----)   |   [-----)
        // Range B:        [-----) | [-----)
        // intersection:   [---)   |   [---)
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-)       |       [-)
        test(TestData {
            lhs: included_excluded(0, 10),
            rhs: included_excluded(5, 15),
            intersection: [included_excluded(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(5, 15),
            rhs: included_excluded(0, 10),
            intersection: [included_excluded(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      (-----]   |   [-----]
        // Range B:        [-----] | (-----]
        // intersection:   [---]   |   [---]
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-)       |       (-]
        test(TestData {
            lhs: excluded_included(0, 10),
            rhs: included_included(5, 15),
            intersection: [included_included(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 15),
            rhs: excluded_included(0, 10),
            intersection: [included_included(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      (-----)   |   [-----]
        // Range B:        [-----] | (-----)
        // intersection:   [---)   |   [---)
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-)       |       [-]
        test(TestData {
            lhs: excluded_excluded(0, 10),
            rhs: included_included(5, 15),
            intersection: [included_excluded(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 15),
            rhs: excluded_excluded(0, 10),
            intersection: [included_excluded(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      (-----]   |   [-----)
        // Range B:        [-----) | (-----]
        // intersection:   [---]   |   [---]
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-)       |       (-)
        test(TestData {
            lhs: excluded_included(0, 10),
            rhs: included_excluded(5, 15),
            intersection: [included_included(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(5, 15),
            rhs: excluded_included(0, 10),
            intersection: [included_included(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      (-----)   |   [-----)
        // Range B:        [-----) | (-----)
        // intersection:   [---)   |   [---)
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-)       |       [-)
        test(TestData {
            lhs: excluded_excluded(0, 10),
            rhs: included_excluded(5, 15),
            intersection: [included_excluded(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(5, 15),
            rhs: excluded_excluded(0, 10),
            intersection: [included_excluded(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      [-----]   |   (-----]
        // Range B:        (-----] | [-----]
        // intersection:   (---]   |   (---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]       |       (-]
        test(TestData {
            lhs: included_included(0, 10),
            rhs: excluded_included(5, 15),
            intersection: [excluded_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 15),
            rhs: included_included(0, 10),
            intersection: [excluded_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      [-----)   |   (-----]
        // Range B:        (-----] | [-----)
        // intersection:   (---)   |   [---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]       |       [-]
        test(TestData {
            lhs: included_excluded(0, 10),
            rhs: excluded_included(5, 15),
            intersection: [excluded_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 15),
            rhs: included_excluded(0, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      [-----]   |   (-----)
        // Range B:        (-----) | [-----]
        // intersection:   (---]   |   (---]
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-]       |       (-)
        test(TestData {
            lhs: included_included(0, 10),
            rhs: excluded_excluded(5, 15),
            intersection: [excluded_included(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 15),
            rhs: included_included(0, 10),
            intersection: [excluded_included(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      [-----)   |   (-----)
        // Range B:        (-----) | [-----)
        // intersection:   (---)   |   [---)
        // union:        [-------) | [-------)
        // merge:        [-------) | [-------)
        // difference:   [-]       |       [-)
        test(TestData {
            lhs: included_excluded(0, 10),
            rhs: excluded_excluded(5, 15),
            intersection: [excluded_excluded(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 15),
            rhs: included_excluded(0, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [included_excluded(0, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      (-----]   |   (-----]
        // Range B:        (-----] | (-----]
        // intersection:   (---]   |   [---]
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-]       |       (-]
        test(TestData {
            lhs: excluded_included(0, 10),
            rhs: excluded_included(5, 15),
            intersection: [excluded_included(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 15),
            rhs: excluded_included(0, 10),
            intersection: [excluded_included(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      (-----)   |   (-----]
        // Range B:        (-----] | (-----)
        // intersection:   (---)   |   (---)
        // union:        (-------] | (-------]
        // merge:        (-------] | (-------]
        // difference:   (-]       |       [-]
        test(TestData {
            lhs: excluded_excluded(0, 10),
            rhs: excluded_included(5, 15),
            intersection: [excluded_excluded(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 15),
            rhs: excluded_excluded(0, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [excluded_included(0, 15)],
            merge: excluded_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      (-----]   |   (-----)
        // Range B:        (-----) | (-----]
        // intersection:   (---]   |   (---]
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-]       |       (-)
        test(TestData {
            lhs: excluded_included(0, 10),
            rhs: excluded_excluded(5, 15),
            intersection: [excluded_included(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 15),
            rhs: excluded_included(0, 10),
            intersection: [excluded_included(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      (-----)   |   (-----)
        // Range B:        (-----) | (-----)
        // intersection:   (---)   |   (---)
        // union:        (-------) | (-------)
        // merge:        (-------) | (-------)
        // difference:   (-]       |       [-)
        test(TestData {
            lhs: excluded_excluded(0, 10),
            rhs: excluded_excluded(5, 15),
            intersection: [excluded_excluded(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 15),
            rhs: excluded_excluded(0, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [excluded_excluded(0, 15)],
            merge: excluded_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      ------]   |   [------
        // Range B:        [------ | ------]
        // intersection:   [---]   |   [---]
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --)       |       (--
        test(TestData {
            lhs: unbounded_included(10),
            rhs: included_unbounded(5),
            intersection: [included_included(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [unbounded_excluded(5)],
        });
        test(TestData {
            lhs: included_unbounded(5),
            rhs: unbounded_included(10),
            intersection: [included_included(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [excluded_unbounded(10)],
        });

        // Range A:      ------)   |   (------
        // Range B:        (------ | ------)
        // intersection:   (---)   |   (---)
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --]       |       [--
        test(TestData {
            lhs: unbounded_excluded(10),
            rhs: excluded_unbounded(5),
            intersection: [excluded_excluded(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [unbounded_included(5)],
        });
        test(TestData {
            lhs: excluded_unbounded(5),
            rhs: unbounded_excluded(10),
            intersection: [excluded_excluded(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [included_unbounded(10)],
        });
    }

    #[test]
    fn disjoint() {
        // Range A:      [---]       |       [---]
        // Range B:            [---] | [---]
        // intersection:    empty    |    empty
        // union:        [---] [---] | [---] [---]
        // merge:        [---------] | [---------]
        // difference:   [---]       |       [---]
        test(TestData {
            lhs: included_included(0, 5),
            rhs: included_included(10, 15),
            intersection: [],
            union: [included_included(0, 5), included_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: included_included(10, 15),
            rhs: included_included(0, 5),
            intersection: [],
            union: [included_included(0, 5), included_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      [---)       |       [---]
        // Range B:            [---] | [---)
        // intersection:    empty    |    empty
        // union:        [---) [---] | [---) [---]
        // merge:        [---------] | [---------]
        // difference:   [---)       |       [---]
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: included_included(10, 15),
            intersection: [],
            union: [included_excluded(0, 5), included_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(10, 15),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_excluded(0, 5), included_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      [---]       |       [---)
        // Range B:            [---) | [---]
        // intersection:    empty    |    empty
        // union:        [---] [---) | [---] [---)
        // merge:        [---------) | [---------)
        // difference:   [---]       |       [---)
        test(TestData {
            lhs: included_included(0, 5),
            rhs: included_excluded(10, 15),
            intersection: [],
            union: [included_included(0, 5), included_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(10, 15),
            rhs: included_included(0, 5),
            intersection: [],
            union: [included_included(0, 5), included_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      [---)       |       [---)
        // Range B:            [---) | [---)
        // intersection:    empty    |    empty
        // union:        [---) [---) | [---) [---)
        // merge:        [---------) | [---------)
        // difference:   [---)       |       [---)
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: included_excluded(10, 15),
            intersection: [],
            union: [included_excluded(0, 5), included_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(10, 15),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_excluded(0, 5), included_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      (---]       |       [---]
        // Range B:            [---] | (---]
        // intersection:    empty    |    empty
        // union:        (---] [---] | (---] [---]
        // merge:        (---------] | (---------]
        // difference:   (---]       |       [---]
        test(TestData {
            lhs: excluded_included(0, 5),
            rhs: included_included(10, 15),
            intersection: [],
            union: [excluded_included(0, 5), included_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: included_included(10, 15),
            rhs: excluded_included(0, 5),
            intersection: [],
            union: [excluded_included(0, 5), included_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      (---)       |       [---]
        // Range B:            [---] | (---)
        // intersection:    empty    |    empty
        // union:        (---) [---] | (---) [---]
        // merge:        (---------] | (---------]
        // difference:   (---)       |       [---]
        test(TestData {
            lhs: excluded_excluded(0, 5),
            rhs: included_included(10, 15),
            intersection: [],
            union: [excluded_excluded(0, 5), included_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(10, 15),
            rhs: excluded_excluded(0, 5),
            intersection: [],
            union: [excluded_excluded(0, 5), included_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [included_included(10, 15)],
        });

        // Range A:      (---]       |       [---)
        // Range B:            [---) | (---]
        // intersection:    empty    |    empty
        // union:        (---] [---) | (---] [---)
        // merge:        (---------) | (---------)
        // difference:   (---]       |       [---)
        test(TestData {
            lhs: excluded_included(0, 5),
            rhs: included_excluded(10, 15),
            intersection: [],
            union: [excluded_included(0, 5), included_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(10, 15),
            rhs: excluded_included(0, 5),
            intersection: [],
            union: [excluded_included(0, 5), included_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      (---)       |       [---)
        // Range B:            [---) | (---)
        // intersection:    empty    |    empty
        // union:        (---) [---) | (---) [---)
        // merge:        (---------) | (---------)
        // difference:   (---)       |       [---)
        test(TestData {
            lhs: excluded_excluded(0, 5),
            rhs: included_excluded(10, 15),
            intersection: [],
            union: [excluded_excluded(0, 5), included_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_excluded(10, 15),
            rhs: excluded_excluded(0, 5),
            intersection: [],
            union: [excluded_excluded(0, 5), included_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [included_excluded(10, 15)],
        });

        // Range A:      [---]       |       (---]
        // Range B:            (---] | [---]
        // intersection:    empty    |    empty
        // union:        [---] (---] | [---] (---]
        // merge:        [---------] | [---------]
        // difference:   [---]       |       (---]
        test(TestData {
            lhs: included_included(0, 5),
            rhs: excluded_included(10, 15),
            intersection: [],
            union: [included_included(0, 5), excluded_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(10, 15),
            rhs: included_included(0, 5),
            intersection: [],
            union: [included_included(0, 5), excluded_included(10, 15)],
            merge: included_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      [---)       |       (---]
        // Range B:            (---] | [---)
        // intersection:    empty    |    empty
        // union:        [---) (---] | [---) (---]
        // merge:        [---------] | [---------]
        // difference:   [---)       |       (---]
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: excluded_included(10, 15),
            intersection: [],
            union: [included_excluded(0, 5), excluded_included(10, 15)],
            merge: included_included(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(10, 15),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_excluded(0, 5), excluded_included(10, 15)],
            merge: included_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      [---]       |       (---)
        // Range B:            (---) | [---]
        // intersection:    empty    |    empty
        // union:        [---] (---) | [---] (---)
        // merge:        [---------) | [---------)
        // difference:   [---]       |       (---)
        test(TestData {
            lhs: included_included(0, 5),
            rhs: excluded_excluded(10, 15),
            intersection: [],
            union: [included_included(0, 5), excluded_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(10, 15),
            rhs: included_included(0, 5),
            intersection: [],
            union: [included_included(0, 5), excluded_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      [---)       |       (---)
        // Range B:            (---) | [---)
        // intersection:    empty    |    empty
        // union:        [---) (---) | [---) (---)
        // merge:        [---------) | [---------)
        // difference:   [---)       |       (---)
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: excluded_excluded(10, 15),
            intersection: [],
            union: [included_excluded(0, 5), excluded_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(10, 15),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_excluded(0, 5), excluded_excluded(10, 15)],
            merge: included_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      (---]       |       (---]
        // Range B:            (---] | (---]
        // intersection:    empty    |    empty
        // union:        (---] (---] | (---] (---]
        // merge:        (---------] | (---------]
        // difference:   (---]       |       (---]
        test(TestData {
            lhs: excluded_included(0, 5),
            rhs: excluded_included(10, 15),
            intersection: [],
            union: [excluded_included(0, 5), excluded_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(10, 15),
            rhs: excluded_included(0, 5),
            intersection: [],
            union: [excluded_included(0, 5), excluded_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      (---)       |       (---]
        // Range B:            (---] | (---)
        // intersection:    empty    |    empty
        // union:        (---) (---] | (---) (---]
        // merge:        (---------] | (---------]
        // difference:   (---)       |       (---]
        test(TestData {
            lhs: excluded_excluded(0, 5),
            rhs: excluded_included(10, 15),
            intersection: [],
            union: [excluded_excluded(0, 5), excluded_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(10, 15),
            rhs: excluded_excluded(0, 5),
            intersection: [],
            union: [excluded_excluded(0, 5), excluded_included(10, 15)],
            merge: excluded_included(0, 15),
            difference: [excluded_included(10, 15)],
        });

        // Range A:      (---]       |       (---)
        // Range B:            (---) | (---]
        // intersection:    empty    |    empty
        // union:        (---] (---) | (---] (---)
        // merge:        (---------) | (---------)
        // difference:   (---]       |       (---)
        test(TestData {
            lhs: excluded_included(0, 5),
            rhs: excluded_excluded(10, 15),
            intersection: [],
            union: [excluded_included(0, 5), excluded_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(10, 15),
            rhs: excluded_included(0, 5),
            intersection: [],
            union: [excluded_included(0, 5), excluded_excluded(10, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(10, 15)],
        });

        // Range A:      (---)       |       (---)
        // Range B:            (---) | (---)
        // intersection:    empty    |    empty
        // union:        (---) (---) | (---) (---)
        // merge:        (---------) | (---------)
        // difference:   (---)       |       (---)
        test(TestData {
            lhs: excluded_excluded(0, 5),
            rhs: excluded_excluded(5, 15),
            intersection: [],
            union: [excluded_excluded(0, 5), excluded_excluded(5, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(0, 5)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 15),
            rhs: excluded_excluded(0, 5),
            intersection: [],
            union: [excluded_excluded(0, 5), excluded_excluded(5, 15)],
            merge: excluded_excluded(0, 15),
            difference: [excluded_excluded(5, 15)],
        });
    }

    #[test]
    fn adjacent() {
        // Range A:      [---]     |     [---]
        // Range B:          [---] | [---]
        // intersection:     |     |     |
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     (---]
        test(TestData {
            lhs: included_included(0, 5),
            rhs: included_included(5, 10),
            intersection: [included_included(5, 5)],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 10),
            rhs: included_included(0, 5),
            intersection: [included_included(5, 5)],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [excluded_included(5, 10)],
        });

        // Range A:      [---]     |     (---]
        // Range B:          (---] | [---]
        // intersection:   empty   |   empty
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---]     |     (---]
        test(TestData {
            lhs: included_included(0, 5),
            rhs: excluded_included(5, 10),
            intersection: [],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [included_included(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 10),
            rhs: included_included(0, 5),
            intersection: [],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [excluded_included(5, 10)],
        });

        // Range A:      [---)     |     [---]
        // Range B:          [---] | [---)
        // intersection:   empty   |   empty
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     [---]
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: included_included(5, 10),
            intersection: [],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: included_included(5, 10),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_included(0, 10)],
            merge: included_included(0, 10),
            difference: [included_included(5, 10)],
        });

        // Range A:      [---)     |     (---]
        // Range B:          (---] | [---)
        // intersection:   empty   |   empty
        // union:        [---X---] | [---X---]
        // merge:        [-------] | [-------]
        // difference:   [---)     |     (---]
        test(TestData {
            lhs: included_excluded(0, 5),
            rhs: excluded_included(5, 10),
            intersection: [],
            union: [included_excluded(0, 5), excluded_included(5, 10)],
            merge: included_included(0, 10),
            difference: [included_excluded(0, 5)],
        });
        test(TestData {
            lhs: excluded_included(5, 10),
            rhs: included_excluded(0, 5),
            intersection: [],
            union: [included_excluded(0, 5), excluded_included(5, 10)],
            merge: included_included(0, 10),
            difference: [excluded_included(5, 10)],
        });
    }

    #[test]
    fn contained() {
        // Range A:      [-------] |   [---]
        // Range B:        [---]   | [-------]
        // intersection:   [---]   |   [---]
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-)   (-] |   empty
        test(TestData {
            lhs: included_included(0, 15),
            rhs: included_included(5, 10),
            intersection: [included_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_excluded(0, 5), excluded_included(10, 15)],
        });
        test(TestData {
            lhs: included_included(5, 10),
            rhs: included_included(0, 15),
            intersection: [included_included(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [],
        });

        // Range A:      [-------] |   (---)
        // Range B:        (---)   | [-------]
        // intersection:   (---)   |   (---)
        // union:        [-------] | [-------]
        // merge:        [-------] | [-------]
        // difference:   [-]   [-] |   empty
        test(TestData {
            lhs: included_included(0, 15),
            rhs: excluded_excluded(5, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [included_included(0, 5), included_included(10, 15)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 10),
            rhs: included_included(0, 15),
            intersection: [excluded_excluded(5, 10)],
            union: [included_included(0, 15)],
            merge: included_included(0, 15),
            difference: [],
        });

        // Range A:      --------- |   (---)
        // Range B:        (---)   | ---------
        // intersection:   (---)   |   (---)
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --]   [-- |   empty
        test(TestData {
            lhs: unbounded_unbounded(),
            rhs: excluded_excluded(5, 10),
            intersection: [excluded_excluded(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [unbounded_included(5), included_unbounded(10)],
        });
        test(TestData {
            lhs: excluded_excluded(5, 10),
            rhs: unbounded_unbounded(),
            intersection: [excluded_excluded(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [],
        });

        // Range A:      --------- |   [---]
        // Range B:        [---]   | ---------
        // intersection:   [---]   |   [---]
        // union:        --------- | ---------
        // merge:        --------- | ---------
        // difference:   --)   (-- |   empty
        test(TestData {
            lhs: unbounded_unbounded(),
            rhs: included_included(5, 10),
            intersection: [included_included(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [unbounded_excluded(5), excluded_unbounded(10)],
        });
        test(TestData {
            lhs: included_included(5, 10),
            rhs: unbounded_unbounded(),
            intersection: [included_included(5, 10)],
            union: [unbounded_unbounded()],
            merge: unbounded_unbounded(),
            difference: [],
        });
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
            test(TestData {
                lhs: interval,
                rhs: interval,
                intersection: [interval],
                union: [interval],
                merge: interval,
                difference: [],
            });
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
