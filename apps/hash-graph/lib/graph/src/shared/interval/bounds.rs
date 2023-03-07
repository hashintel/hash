use core::{cmp::Ordering, ops::Bound};

use super::Interval;

pub trait IntervalBound<T> {
    fn as_bound(&self) -> Bound<&T>;
    fn into_bound(self) -> Bound<T>;
    fn from_bound(bound: Bound<T>) -> Self;
}

impl<T> IntervalBound<T> for Bound<T> {
    fn as_bound(&self) -> Bound<&T> {
        self.as_ref()
    }

    fn into_bound(self) -> Self {
        self
    }

    fn from_bound(bound: Self) -> Self {
        bound
    }
}

pub trait IntervalBoundHelper<T>: IntervalBound<T> {
    fn flip<B: IntervalBound<T>>(self) -> B
    where
        Self: Sized,
    {
        B::from_bound(match self.into_bound() {
            Bound::Included(value) => Bound::Excluded(value),
            Bound::Excluded(value) => Bound::Included(value),
            Bound::Unbounded => Bound::Unbounded,
        })
    }
}

impl<B, T> IntervalBoundHelper<T> for B where B: IntervalBound<T> {}

impl<T, S, E> Interval<T, S, E>
where
    S: IntervalBound<T>,
    E: IntervalBound<T>,
{
    pub(super) fn cmp_start_to_start(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> Ordering
    where
        T: Ord,
    {
        compare_bounds(
            self.start().as_bound(),
            other.start().as_bound(),
            BoundType::Start,
            BoundType::Start,
            Ord::cmp,
        )
    }

    pub(super) fn cmp_start_to_end(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> Ordering
    where
        T: Ord,
    {
        compare_bounds(
            self.start().as_bound(),
            other.end().as_bound(),
            BoundType::Start,
            BoundType::End,
            Ord::cmp,
        )
    }

    pub(super) fn cmp_end_to_start(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> Ordering
    where
        T: Ord,
    {
        compare_bounds(
            self.end().as_bound(),
            other.start().as_bound(),
            BoundType::End,
            BoundType::Start,
            Ord::cmp,
        )
    }

    pub(super) fn cmp_end_to_end(
        &self,
        other: &Interval<T, impl IntervalBound<T>, impl IntervalBound<T>>,
    ) -> Ordering
    where
        T: Ord,
    {
        compare_bounds(
            self.end().as_bound(),
            other.end().as_bound(),
            BoundType::End,
            BoundType::End,
            Ord::cmp,
        )
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum BoundType {
    Start,
    End,
}

pub fn compare_bounds<T: PartialEq, O: From<Ordering>>(
    lhs: Bound<&T>,
    rhs: Bound<&T>,
    lhs_type: BoundType,
    rhs_type: BoundType,
    cmp: impl FnOnce(&T, &T) -> O,
) -> O {
    match (lhs, rhs, lhs_type, rhs_type) {
        // If the bound values are not equal, then the bound with the start value is less than the
        // bound with the higher value.
        (
            Bound::Included(lhs) | Bound::Excluded(lhs),
            Bound::Included(rhs) | Bound::Excluded(rhs),
            ..,
        ) if lhs != rhs => cmp(lhs, rhs),

        // From here onwards, the bound values are equal
        (Bound::Unbounded, Bound::Unbounded, BoundType::Start, BoundType::Start)
        | (Bound::Unbounded, Bound::Unbounded, BoundType::End, BoundType::End)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Start, BoundType::Start)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::End, BoundType::End)
        | (Bound::Included(_), Bound::Included(_), ..) => Ordering::Equal.into(),

        (Bound::Unbounded, _, BoundType::Start, _)
        | (_, Bound::Unbounded, _, BoundType::End)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::End, BoundType::Start)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::End, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::Start) => Ordering::Less.into(),

        (Bound::Unbounded, _, BoundType::End, _)
        | (_, Bound::Unbounded, _, BoundType::Start)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Start, BoundType::End)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::Start, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::End) => Ordering::Greater.into(),
    }
}
