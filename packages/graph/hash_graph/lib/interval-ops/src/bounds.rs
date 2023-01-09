use core::{cmp::Ordering, fmt, marker::PhantomData, ops::Bound};

use crate::invalid_bounds;

pub trait LowerBound<T> {
    type UpperBound: UpperBound<T>;

    fn as_bound(&self) -> Bound<&T>;
    fn into_upper(self) -> Self::UpperBound;
}

pub trait UpperBound<T> {
    type LowerBound: LowerBound<T>;

    fn as_bound(&self) -> Bound<&T>;
    fn into_lower(self) -> Self::LowerBound;
}

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
    type UpperBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        self.as_ref()
    }

    fn into_upper(self) -> Self::UpperBound {
        match self {
            Self::Included(value) => Self::Excluded(value),
            Self::Excluded(value) => Self::Included(value),
            Self::Unbounded => Self::Unbounded,
        }
    }
}

impl<T> LowerBound<T> for Bound<&T> {
    type UpperBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        *self
    }

    fn into_upper(self) -> Self::UpperBound {
        match self {
            Self::Included(value) => Self::Excluded(value),
            Self::Excluded(value) => Self::Included(value),
            Self::Unbounded => Self::Unbounded,
        }
    }
}

impl<T> UpperBound<T> for Bound<T> {
    type LowerBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        self.as_ref()
    }

    fn into_lower(self) -> Self::LowerBound {
        match self {
            Self::Included(value) => Self::Excluded(value),
            Self::Excluded(value) => Self::Included(value),
            Self::Unbounded => Self::Unbounded,
        }
    }
}

impl<T> UpperBound<T> for Bound<&T> {
    type LowerBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        *self
    }

    fn into_lower(self) -> Self::LowerBound {
        match self {
            Self::Included(value) => Self::Excluded(value),
            Self::Excluded(value) => Self::Included(value),
            Self::Unbounded => Self::Unbounded,
        }
    }
}

impl<T> LowerBound<T> for Option<T> {
    type UpperBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        self.as_ref().map_or(Bound::Unbounded, Bound::Included)
    }

    fn into_upper(self) -> Self::UpperBound {
        self
    }
}

impl<T> UpperBound<T> for Option<T> {
    type LowerBound = Self;

    fn as_bound(&self) -> Bound<&T> {
        self.as_ref().map_or(Bound::Unbounded, Bound::Excluded)
    }

    fn into_lower(self) -> Self::LowerBound {
        self
    }
}

pub trait LowerBoundComparison<T: PartialOrd>: LowerBound<T> {
    fn cmp_lower(&self, other: &Self) -> Ordering;
    fn cmp_lower_values(&self, other: &Self) -> Ordering;
    fn cmp_upper(&self, other: &Self::UpperBound) -> Ordering;
    fn cmp_upper_values(&self, other: &Self::UpperBound) -> Ordering;
}

impl<B, T> LowerBoundComparison<T> for B
where
    T: PartialOrd,
    B: LowerBound<T>,
{
    fn cmp_lower(&self, other: &Self) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Lower,
        )
    }

    fn cmp_lower_values(&self, other: &Self) -> Ordering {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Lower,
        )
    }

    fn cmp_upper(&self, other: &Self::UpperBound) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Upper,
        )
    }

    fn cmp_upper_values(&self, other: &Self::UpperBound) -> Ordering {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Lower,
            BoundType::Upper,
        )
    }
}

pub trait UpperBoundComparison<T>: UpperBound<T> {
    fn cmp_lower(&self, other: &Self::LowerBound) -> Ordering;
    fn cmp_lower_values(&self, other: &Self::LowerBound) -> Ordering;
    fn cmp_upper(&self, other: &Self) -> Ordering;
    fn cmp_upper_values(&self, other: &Self) -> Ordering;
    fn is_adjacent_to(&self, other: &Self::LowerBound) -> bool;
}

impl<B, T> UpperBoundComparison<T> for B
where
    T: PartialOrd,
    B: UpperBound<T>,
{
    fn cmp_lower(&self, other: &Self::LowerBound) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Lower,
        )
    }

    fn cmp_lower_values(&self, other: &Self::LowerBound) -> Ordering {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Lower,
        )
    }

    fn cmp_upper(&self, other: &Self) -> Ordering {
        compare_bounds(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Upper,
        )
    }

    fn cmp_upper_values(&self, other: &Self) -> Ordering {
        compare_bound_values(
            self.as_bound(),
            other.as_bound(),
            BoundType::Upper,
            BoundType::Upper,
        )
    }

    fn is_adjacent_to(&self, other: &Self::LowerBound) -> bool {
        match (self.as_bound(), other.as_bound()) {
            (Bound::Included(lhs), Bound::Excluded(rhs))
            | (Bound::Excluded(lhs), Bound::Included(rhs)) => lhs == rhs,
            _ => false,
        }
    }
}

/// Thin wrapper around `IntervalLowerBound` to implement comparison traits.
pub struct LowerBoundObject<B, T>(pub B, PhantomData<T>);

impl<B, T> LowerBoundObject<B, T> {
    pub const fn new(bound: B) -> Self {
        Self(bound, PhantomData)
    }
}

impl<B, T> PartialEq for LowerBoundObject<B, T>
where
    T: PartialOrd,
    B: LowerBound<T>,
{
    fn eq(&self, other: &Self) -> bool {
        self.cmp_lower(other) == Ordering::Equal
    }
}

impl<B, T> Eq for LowerBoundObject<B, T>
where
    T: PartialOrd,
    B: LowerBound<T>,
{
}

impl<B, T> PartialOrd for LowerBoundObject<B, T>
where
    T: PartialOrd,
    B: LowerBound<T>,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp_lower(other))
    }
}

impl<B, T> Ord for LowerBoundObject<B, T>
where
    T: PartialOrd,
    B: LowerBound<T>,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.cmp_lower(other)
    }
}

impl<B, T> PartialEq<UpperBoundObject<B::UpperBound, T>> for LowerBoundObject<B, T>
where
    B: LowerBound<T>,
    T: PartialOrd,
{
    fn eq(&self, other: &UpperBoundObject<B::UpperBound, T>) -> bool {
        self.cmp_upper(other) == Ordering::Equal
    }
}

impl<B, T> PartialOrd<UpperBoundObject<B::UpperBound, T>> for LowerBoundObject<B, T>
where
    B: LowerBound<T>,
    T: PartialOrd,
{
    fn partial_cmp(&self, other: &UpperBoundObject<B::UpperBound, T>) -> Option<Ordering> {
        Some(self.cmp_upper(other))
    }
}

impl<B, T> LowerBound<T> for LowerBoundObject<B, T>
where
    B: LowerBound<T>,
    T: PartialOrd,
{
    type UpperBound = UpperBoundObject<B::UpperBound, T>;

    fn as_bound(&self) -> Bound<&T> {
        self.0.as_bound()
    }

    fn into_upper(self) -> Self::UpperBound {
        UpperBoundObject::new(self.0.into_upper())
    }
}

/// Thin wrapper around `IntervalUpperBound` to implement comparison traits.
pub struct UpperBoundObject<B, T>(pub B, PhantomData<T>);

impl<B, T> UpperBoundObject<B, T> {
    pub const fn new(bound: B) -> Self {
        Self(bound, PhantomData)
    }
}

impl<B, T> PartialEq for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    fn eq(&self, other: &Self) -> bool {
        self.cmp_upper(other) == Ordering::Equal
    }
}

impl<B, T> Eq for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
}

impl<B, T> PartialOrd for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp_upper(other))
    }
}

impl<B, T> Ord for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.cmp_upper(other)
    }
}

impl<B, T> PartialEq<LowerBoundObject<B::LowerBound, T>> for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    fn eq(&self, other: &LowerBoundObject<B::LowerBound, T>) -> bool {
        self.cmp_lower(other) == Ordering::Equal
    }
}

impl<B, T> PartialOrd<LowerBoundObject<B::LowerBound, T>> for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    fn partial_cmp(&self, other: &LowerBoundObject<B::LowerBound, T>) -> Option<Ordering> {
        Some(self.cmp_lower(other))
    }
}

impl<B, T> UpperBound<T> for UpperBoundObject<B, T>
where
    B: UpperBound<T>,
    T: PartialOrd,
{
    type LowerBound = LowerBoundObject<B::LowerBound, T>;

    fn as_bound(&self) -> Bound<&T> {
        self.0.as_bound()
    }

    fn into_lower(self) -> Self::LowerBound {
        LowerBoundObject::new(self.0.into_lower())
    }
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
