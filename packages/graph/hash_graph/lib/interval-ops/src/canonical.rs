use core::{
    cmp::Ordering,
    fmt,
    ops::{Add, Mul, Sub},
};
#[cfg(feature = "canonicalize")]
use core::{iter::Step, ops::RangeBounds};

#[cfg(feature = "canonicalize")]
use crate::ContinuousInterval;
use crate::{
    bounds::{debug_lower_bound, debug_upper_bound, LowerBoundComparison},
    invalid_bounds, Interval,
};

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum CanonicalInterval<T> {
    Empty,
    NonEmpty { lower: Option<T>, upper: Option<T> },
}

#[cfg(feature = "canonicalize")]
impl<T: PartialOrd + Step + Clone> CanonicalInterval<T> {
    pub fn from_range(range: impl RangeBounds<T>) -> Self {
        ContinuousInterval::from_range(range).canonicalize()
    }
}

impl<T: fmt::Debug> fmt::Debug for CanonicalInterval<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(fmt, "empty"),
            Self::NonEmpty { lower, upper } => {
                debug_lower_bound(lower, fmt)?;
                fmt.write_str(", ")?;
                debug_upper_bound(upper, fmt)
            }
        }
    }
}

impl<T> Interval<T> for CanonicalInterval<T> {
    type LowerBound = Option<T>;
    type UpperBound = Option<T>;

    fn empty() -> Self {
        Self::Empty
    }

    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        T: PartialOrd,
    {
        match lower.cmp_upper_values(&upper) {
            Ordering::Less => Self::NonEmpty { lower, upper },
            Ordering::Equal => Self::empty(),
            Ordering::Greater => invalid_bounds(),
        }
    }

    fn is_empty(&self) -> bool {
        matches!(self, Self::Empty)
    }

    fn bounds(&self) -> Option<(&Self::LowerBound, &Self::UpperBound)> {
        match self {
            Self::Empty => None,
            Self::NonEmpty { lower, upper } => Some((lower, upper)),
        }
    }

    fn into_bounds(self) -> Option<(Self::LowerBound, Self::UpperBound)> {
        match self {
            Self::Empty => None,
            Self::NonEmpty { lower, upper } => Some((lower, upper)),
        }
    }
}

impl<T: PartialOrd> Add for CanonicalInterval<T> {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        self.union(rhs)
            .expect("interval union result in disjoint spans")
    }
}

impl<T: PartialOrd> Sub for CanonicalInterval<T> {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        self.difference(rhs)
            .expect("interval difference result in disjoint spans")
    }
}

impl<T: PartialOrd> Mul for CanonicalInterval<T> {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        self.intersect(rhs)
    }
}
