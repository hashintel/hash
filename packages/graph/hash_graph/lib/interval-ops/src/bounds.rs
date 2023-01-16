use core::{cmp::Ordering, ops::Bound};

use crate::invalid_bounds;

pub trait LowerBound<T> {
    fn as_bound(&self) -> Bound<&T>;
    fn into_bound(self) -> Bound<T>;
    fn from_bound(bound: Bound<T>) -> Self;
}

pub trait UpperBound<T> {
    fn as_bound(&self) -> Bound<&T>;
    fn into_bound(self) -> Bound<T>;
    fn from_bound(bound: Bound<T>) -> Self;
}

impl<T> LowerBound<T> for Bound<T> {
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

impl<T> UpperBound<T> for Bound<T> {
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

impl<T> LowerBound<T> for Option<T> {
    fn as_bound(&self) -> Bound<&T> {
        self.as_ref().map_or(Bound::Unbounded, Bound::Included)
    }

    fn into_bound(self) -> Bound<T> {
        self.map_or(Bound::Unbounded, Bound::Included)
    }

    fn from_bound(bound: Bound<T>) -> Self {
        match bound {
            Bound::Included(value) => Some(value),
            Bound::Excluded(_) => {
                panic!("excluded lower bounds are not supported on canonical intervals")
            }
            Bound::Unbounded => None,
        }
    }
}

impl<T> UpperBound<T> for Option<T> {
    fn as_bound(&self) -> Bound<&T> {
        self.as_ref().map_or(Bound::Unbounded, Bound::Excluded)
    }

    fn into_bound(self) -> Bound<T> {
        self.map_or(Bound::Unbounded, Bound::Excluded)
    }

    fn from_bound(bound: Bound<T>) -> Self {
        match bound {
            Bound::Included(_) => {
                panic!("included upper bounds are not supported on canonical intervals")
            }
            Bound::Excluded(value) => Some(value),
            Bound::Unbounded => None,
        }
    }
}

fn flip_bounds<T>(bound: Bound<T>) -> Bound<T> {
    match bound {
        Bound::Included(value) => Bound::Excluded(value),
        Bound::Excluded(value) => Bound::Included(value),
        Bound::Unbounded => Bound::Unbounded,
    }
}

pub trait LowerBoundHelper<T: PartialOrd>: LowerBound<T> {
    fn cmp_lower(&self, other: &impl LowerBound<T>) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Lower,
        )
    }

    fn cmp_upper(&self, other: &impl UpperBound<T>) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Upper,
        )
    }

    fn into_upper<U: UpperBound<T>>(self) -> U
    where
        Self: Sized,
    {
        U::from_bound(flip_bounds(self.into_bound()))
    }
}

impl<B, T> LowerBoundHelper<T> for B
where
    T: PartialOrd,
    B: LowerBound<T>,
{
}

pub trait UpperBoundHelper<T: PartialEq>: UpperBound<T> {
    fn cmp_lower(&self, other: &impl LowerBound<T>) -> Ordering
    where
        T: PartialOrd,
    {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Lower,
        )
    }

    fn cmp_upper(&self, other: &impl UpperBound<T>) -> Ordering
    where
        T: PartialOrd,
    {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Upper,
        )
    }

    fn into_lower<I: LowerBound<T>>(self) -> I
    where
        Self: Sized,
    {
        I::from_bound(flip_bounds(self.into_bound()))
    }

    fn is_adjacent_to(&self, other: &impl LowerBound<T>) -> bool {
        match (self.as_bound(), other.as_bound()) {
            (Bound::Included(lhs), Bound::Excluded(rhs))
            | (Bound::Excluded(lhs), Bound::Included(rhs)) => lhs == rhs,
            _ => false,
        }
    }
}

impl<B, T> UpperBoundHelper<T> for B
where
    T: PartialOrd,
    B: UpperBound<T>,
{
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum BoundType {
    Lower,
    Upper,
}

pub fn compare_bounds<T: PartialOrd>(
    lhs: Bound<&T>,
    rhs: Bound<&T>,
    lhs_type: BoundType,
    rhs_type: BoundType,
) -> Ordering {
    match (lhs, rhs, lhs_type, rhs_type) {
        // If the bounds are not equal, then the bound with the lower value is less than the bound
        // with the higher value.
        (
            Bound::Included(lhs) | Bound::Excluded(lhs),
            Bound::Included(rhs) | Bound::Excluded(rhs),
            ..,
        ) if lhs != rhs => lhs.partial_cmp(rhs).unwrap_or_else(|| invalid_bounds()),

        (Bound::Unbounded, Bound::Unbounded, BoundType::Lower, BoundType::Lower)
        | (Bound::Unbounded, Bound::Unbounded, BoundType::Upper, BoundType::Upper)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Lower, BoundType::Lower)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Upper, BoundType::Upper)
        | (Bound::Included(_), Bound::Included(_), ..) => Ordering::Equal,

        (Bound::Unbounded, _, BoundType::Lower, _)
        | (_, Bound::Unbounded, _, BoundType::Upper)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Upper, BoundType::Lower)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::Upper, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::Lower) => Ordering::Less,

        (Bound::Unbounded, _, BoundType::Upper, _)
        | (_, Bound::Unbounded, _, BoundType::Lower)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Lower, BoundType::Upper)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::Lower, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::Upper) => Ordering::Greater,
    }
}
