use core::{
    cmp, fmt,
    fmt::Debug,
    ops::{Add, AddAssign, Bound},
};

use super::unit::{Cardinal, InformationUnit};
use crate::macros::{forward_ref_binop, forward_ref_op_assign};

fn compare_max(lhs: &Bound<u32>, rhs: &Bound<u32>) -> cmp::Ordering {
    match (lhs, rhs) {
        (Bound::Included(a), Bound::Included(b)) => a.cmp(b),

        (Bound::Included(_), Bound::Excluded(0)) => cmp::Ordering::Greater,
        (Bound::Included(a), Bound::Excluded(b)) => a.cmp(&(b - 1)),

        (Bound::Excluded(0), Bound::Included(_)) => cmp::Ordering::Less,
        (Bound::Excluded(a), Bound::Included(b)) => (a - 1).cmp(&b),
        (Bound::Excluded(a), Bound::Excluded(b)) => a.cmp(b),

        (Bound::Unbounded, Bound::Unbounded) => cmp::Ordering::Equal,
        (_, Bound::Unbounded) => cmp::Ordering::Less,
        (Bound::Unbounded, _) => cmp::Ordering::Greater,
    }
}

fn add_bound(lhs: &Bound<u32>, rhs: &Bound<u32>) -> Bound<u32> {
    match (lhs, rhs) {
        (Bound::Included(a), Bound::Included(b)) => Bound::Included(a + b),
        (&Bound::Included(a), Bound::Excluded(0)) => Bound::Included(a),
        (Bound::Included(a), Bound::Excluded(b)) => Bound::Included(a + (b - 1)),

        (Bound::Excluded(0), &Bound::Included(b)) => Bound::Included(b),
        (Bound::Excluded(a), Bound::Included(b)) => Bound::Included((a - 1) + b),
        (Bound::Excluded(a), Bound::Excluded(b)) => Bound::Excluded(a + b),

        (Bound::Unbounded, _) => Bound::Unbounded,
        (_, Bound::Unbounded) => Bound::Unbounded,
    }
}

macro_rules! range {
    ($(#[$meta:meta])* $vis:vis struct $name:ident($inner:ty)) => {
        $(#[$meta])*
        #[derive(Copy, Clone, PartialEq, Eq, Hash)]
        $vis struct $name {
            min: $inner,
            max: Bound<$inner>
        }

        impl $name {
            #[inline]
            pub const fn new(min: $inner, max: Bound<$inner>) -> Self {
                match max {
                    Bound::Included(max) => assert!(min.raw <= max.raw),
                    Bound::Excluded(max) => assert!(min.raw < max.raw),
                    Bound::Unbounded => {},
                }

                Self { min, max }
            }

            #[inline]
            pub const fn empty() -> Self {
                let zero = <$inner>::new(0);
                Self { min: zero, max: Bound::Excluded(zero) }
            }

            #[inline]
            pub const fn full() -> Self {
                let zero = <$inner>::new(0);
                Self { min: zero, max: Bound::Unbounded }
            }

            #[inline]
            pub const fn is_empty(&self) -> bool {
                match self.max {
                    Bound::Included(max) => self.min.raw > max.raw,
                    Bound::Excluded(max) => self.min.raw >= max.raw,
                    Bound::Unbounded => false,
                }
            }

            #[inline]
            pub fn cover(self, other: Self) -> Self {
                if self.is_empty() {
                    return other;
                }
                if other.is_empty() {
                    return self;
                }

                let min = cmp::min(self.min, other.min);

                let self_max = self.max.map(|value| value.raw);
                let other_max = other.max.map(|value| value.raw);
                let max = cmp::max_by(self_max, other_max, compare_max);

                Self { min, max: max.map(<$inner>::new) }
            }

            #[inline]
            pub fn intersect(self, other: Self) -> Self {
                if self.is_empty() { return self; }
                if other.is_empty() { return other; }

                let min = cmp::max(self.min, other.min);

                let self_max = self.max.map(|value| value.raw);
                let other_max = other.max.map(|value| value.raw);
                let max = cmp::min_by(self_max, other_max, compare_max);

                // Could become empty if min > max (no overlap)
                Self { min, max: max.map(<$inner>::new) }
            }
        }

        impl Debug for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self.max {
                    Bound::Included(max) => write!(fmt, "{}..={}", self.min.raw, max.raw),
                    Bound::Excluded(max) => write!(fmt, "{}..{}", self.min.raw, max.raw),
                    Bound::Unbounded => write!(fmt, "{}..", self.min.raw),
                }
            }
        }

        impl Add<Self> for $name {
            type Output = Self;

            #[inline]
            fn add(self, other: Self) -> Self {
                let min = self.min + other.min;
                let max = add_bound(&self.max.map(|value| value.raw), &other.max.map(|value| value.raw));

                Self { min, max: max.map(<$inner>::new) }
            }
        }

        impl AddAssign<Self> for $name {
            #[inline]
            fn add_assign(&mut self, other: Self) {
                *self = *self + other;
            }
        }

        impl From<$inner> for $name {
            fn from(value: $inner) -> Self {
                Self::new(value, Bound::Included(value))
            }
        }

        forward_ref_binop!(impl Add<Self>::add for $name);
        forward_ref_op_assign!(impl AddAssign<Self>::add_assign for $name);
    };
}

range!(pub struct InformationRange(InformationUnit));
range!(pub struct Cardinality(Cardinal));
