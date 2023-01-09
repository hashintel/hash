#[cfg(feature = "canonicalize")]
use core::iter::Step;
use core::{
    cmp::Ordering,
    fmt,
    ops::{Add, Bound, Mul, RangeBounds, Sub},
};

#[cfg(feature = "canonicalize")]
use crate::CanonicalInterval;
use crate::{
    bounds::{debug_lower_bound, debug_upper_bound, LowerBoundComparison},
    invalid_bounds, Interval,
};

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum ContinuousInterval<T> {
    Empty,
    NonEmpty { lower: Bound<T>, upper: Bound<T> },
}

impl<T: PartialOrd + Clone> ContinuousInterval<T> {
    pub fn from_range(range: impl RangeBounds<T>) -> Self {
        Self::from_bounds(range.start_bound().cloned(), range.end_bound().cloned())
    }
}

#[cfg(feature = "canonicalize")]
impl<T: PartialOrd + Step> ContinuousInterval<T> {
    #[must_use]
    pub fn canonicalize(self) -> CanonicalInterval<T> {
        match self {
            Self::Empty => CanonicalInterval::Empty,
            Self::NonEmpty { lower, upper } => {
                let lower = match lower {
                    Bound::Included(value) => Some(value),
                    Bound::Excluded(value) => match Step::forward_checked(value, 1) {
                        Some(value) => Some(value),
                        None => return CanonicalInterval::Empty,
                    },
                    Bound::Unbounded => None,
                };

                let upper = match upper {
                    Bound::Included(value) => Step::forward_checked(value, 1),
                    Bound::Excluded(value) => Some(value),
                    Bound::Unbounded => None,
                };

                CanonicalInterval::NonEmpty { lower, upper }
            }
        }
    }
}

impl<T: fmt::Debug> fmt::Debug for ContinuousInterval<T> {
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

impl<T> Interval<T> for ContinuousInterval<T> {
    type LowerBound = Bound<T>;
    type UpperBound = Bound<T>;

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

impl<T: PartialOrd, I: Interval<T>> Add<I> for ContinuousInterval<T> {
    type Output = Self;

    fn add(self, rhs: I) -> Self::Output {
        self.union(rhs)
            .expect("interval union result in disjoint spans")
    }
}

impl<T: PartialOrd, I: Interval<T>> Sub<I> for ContinuousInterval<T> {
    type Output = Self;

    fn sub(self, rhs: I) -> Self::Output {
        self.difference(rhs)
            .expect("interval difference result in disjoint spans")
    }
}

impl<T: PartialOrd, I: Interval<T>> Mul<I> for ContinuousInterval<T> {
    type Output = Self;

    fn mul(self, rhs: I) -> Self::Output {
        self.intersect(rhs)
    }
}
