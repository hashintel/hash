#[cfg(any(feature = "canonical", feature = "continuous"))]
use core::fmt;
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

#[cfg(any(feature = "canonical", feature = "continuous"))]
#[expect(clippy::use_debug, reason = "Only used in `Debug` implementations")]
pub fn debug_lower_bound<T: fmt::Debug>(
    bound: &impl LowerBound<T>,
    fmt: &mut fmt::Formatter,
) -> fmt::Result {
    match bound.as_bound() {
        Bound::Included(value) => write!(fmt, "[{value:?}"),
        Bound::Excluded(value) => write!(fmt, "({value:?}"),
        Bound::Unbounded => write!(fmt, "(-∞"),
    }
}

#[cfg(any(feature = "canonical", feature = "continuous"))]
#[expect(clippy::use_debug, reason = "Only used in `Debug` implementations")]
pub fn debug_upper_bound<T: fmt::Debug>(
    bound: &impl UpperBound<T>,
    fmt: &mut fmt::Formatter,
) -> fmt::Result {
    match bound.as_bound() {
        Bound::Included(value) => write!(fmt, "{value:?}]"),
        Bound::Excluded(value) => write!(fmt, "{value:?})"),
        Bound::Unbounded => write!(fmt, "+∞)"),
    }
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

pub trait LowerBoundComparison<T: PartialOrd>: LowerBound<T> {
    fn cmp_lower(&self, other: &impl LowerBound<T>) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Lower,
        )
    }

    fn cmp_lower_values(&self, other: &impl LowerBound<T>) -> Ordering {
        compare_bound_values(
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

    fn cmp_upper_values(&self, other: &impl UpperBound<T>) -> Ordering {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Upper,
        )
    }
}

impl<B, T> LowerBoundComparison<T> for B
where
    T: PartialOrd,
    B: LowerBound<T>,
{
}

pub trait UpperBoundComparison<T: PartialEq>: UpperBound<T> {
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

    fn cmp_lower_values(&self, other: &impl LowerBound<T>) -> Ordering
    where
        T: PartialOrd,
    {
        compare_bound_values(
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

    fn cmp_upper_values(&self, other: &impl UpperBound<T>) -> Ordering
    where
        T: PartialOrd,
    {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Upper,
        )
    }

    fn is_adjacent_to(&self, other: &impl LowerBound<T>) -> bool {
        match (self.as_bound(), other.as_bound()) {
            (Bound::Included(lhs), Bound::Excluded(rhs))
            | (Bound::Excluded(lhs), Bound::Included(rhs)) => lhs == rhs,
            _ => false,
        }
    }
}

impl<B, T> UpperBoundComparison<T> for B
where
    T: PartialOrd,
    B: UpperBound<T>,
{
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum BoundType {
    Lower,
    Upper,
}

fn compare_bound_values<T: PartialOrd>(
    lhs: Bound<&T>,
    rhs: Bound<&T>,
    lhs_type: BoundType,
    rhs_type: BoundType,
) -> Ordering {
    match (lhs, rhs, lhs_type, rhs_type) {
        (
            Bound::Included(lhs) | Bound::Excluded(lhs),
            Bound::Included(rhs) | Bound::Excluded(rhs),
            ..,
        ) => lhs.partial_cmp(rhs).unwrap_or_else(|| invalid_bounds()),

        (Bound::Unbounded, Bound::Unbounded, BoundType::Lower, BoundType::Lower)
        | (Bound::Unbounded, Bound::Unbounded, BoundType::Upper, BoundType::Upper) => {
            Ordering::Equal
        }

        (Bound::Unbounded, Bound::Unbounded, BoundType::Lower, BoundType::Upper)
        | (Bound::Unbounded, _, BoundType::Lower, _)
        | (_, Bound::Unbounded, _, BoundType::Upper) => Ordering::Less,

        (Bound::Unbounded, Bound::Unbounded, BoundType::Upper, BoundType::Lower)
        | (Bound::Unbounded, _, BoundType::Upper, _)
        | (_, Bound::Unbounded, _, BoundType::Lower) => Ordering::Greater,
    }
}

fn compare_bounds<T: PartialOrd>(
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

        (Bound::Unbounded, Bound::Unbounded, BoundType::Lower, BoundType::Upper)
        | (Bound::Unbounded, _, BoundType::Lower, _)
        | (_, Bound::Unbounded, _, BoundType::Upper)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Upper, BoundType::Lower)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::Upper, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::Lower) => Ordering::Less,

        (Bound::Unbounded, Bound::Unbounded, BoundType::Upper, BoundType::Lower)
        | (Bound::Unbounded, _, BoundType::Upper, _)
        | (_, Bound::Unbounded, _, BoundType::Lower)
        | (Bound::Excluded(_), Bound::Excluded(_), BoundType::Lower, BoundType::Upper)
        | (Bound::Excluded(_), Bound::Included(_), BoundType::Lower, _)
        | (Bound::Included(_), Bound::Excluded(_), _, BoundType::Upper) => Ordering::Greater,
    }
}
