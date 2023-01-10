use core::{
    cmp::Ordering,
    fmt,
    ops::{Add, Bound, Mul, RangeBounds, Sub},
};

use crate::{bounds::LowerBoundHelper, invalid_bounds, Interval};

#[derive(Copy, Clone)]
pub struct IntervalBounds<T> {
    lower: Bound<T>,
    upper: Bound<T>,
}

impl<T> RangeBounds<T> for IntervalBounds<T> {
    fn start_bound(&self) -> Bound<&T> {
        self.lower.as_ref()
    }

    fn end_bound(&self) -> Bound<&T> {
        self.upper.as_ref()
    }
}

impl<T, R> PartialEq<R> for IntervalBounds<T>
where
    T: PartialEq,
    R: RangeBounds<T>,
{
    fn eq(&self, other: &R) -> bool {
        self.start_bound() == other.start_bound() && self.end_bound() == other.end_bound()
    }
}

impl<T> Eq for IntervalBounds<T> where T: Eq {}

impl<T: PartialOrd + Clone> IntervalBounds<T> {
    pub fn from_range(range: impl RangeBounds<T>) -> Self {
        Self::from_bounds(range.start_bound().cloned(), range.end_bound().cloned())
    }
}

impl<T: fmt::Debug> fmt::Debug for IntervalBounds<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.lower_bound() {
            Bound::Included(value) => write!(fmt, "[{value:?}")?,
            Bound::Excluded(value) => write!(fmt, "({value:?}")?,
            Bound::Unbounded => write!(fmt, "(-∞")?,
        }
        fmt.write_str(", ")?;
        match self.upper_bound() {
            Bound::Included(value) => write!(fmt, "{value:?}]"),
            Bound::Excluded(value) => write!(fmt, "{value:?})"),
            Bound::Unbounded => write!(fmt, "+∞)"),
        }
    }
}

impl<T> Interval<T> for IntervalBounds<T> {
    type LowerBound = Bound<T>;
    type UpperBound = Bound<T>;

    fn from_bounds(lower: Self::LowerBound, upper: Self::UpperBound) -> Self
    where
        T: PartialOrd,
    {
        match lower.cmp_upper(&upper) {
            Ordering::Less | Ordering::Equal => Self { lower, upper },
            Ordering::Greater => invalid_bounds(),
        }
    }

    fn lower_bound(&self) -> &Self::LowerBound {
        &self.lower
    }

    fn upper_bound(&self) -> &Self::UpperBound {
        &self.upper
    }

    fn into_bound(self) -> (Self::LowerBound, Self::UpperBound) {
        (self.lower, self.upper)
    }
}

impl<T: PartialOrd> Add for IntervalBounds<T> {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        let union = self.union(rhs);
        assert_eq!(union.len(), 1, "interval union result in disjoint spans");
        union.into_iter().next().unwrap()
    }
}

impl<T: PartialOrd> Sub for IntervalBounds<T> {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        let difference = self.difference(rhs);
        assert_eq!(
            difference.len(),
            1,
            "interval union result in disjoint spans"
        );
        difference.into_iter().next().unwrap()
    }
}

impl<T: PartialOrd> Mul for IntervalBounds<T> {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        self.intersect(rhs).expect("intervals do not overlap")
    }
}
