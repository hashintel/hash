use core::{
    cmp, fmt,
    fmt::Debug,
    ops::{Add, AddAssign, Bound},
};

use super::unit::{Cardinal, InformationUnit};
use crate::{
    macros::{forward_ref_binop, forward_ref_op_assign},
    pass::analysis::dataflow::lattice::{
        AdditiveMonoid, HasBottom, JoinSemiLattice, SaturatingSemiring,
    },
};

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "used as cmp that requires ref"
)]
fn compare_max(lhs: &Bound<u32>, rhs: &Bound<u32>) -> cmp::Ordering {
    match (lhs, rhs) {
        (Bound::Included(lhs), Bound::Included(rhs))
        | (Bound::Excluded(lhs), Bound::Excluded(rhs)) => lhs.cmp(rhs),

        (Bound::Included(_), Bound::Excluded(0)) => cmp::Ordering::Greater,
        (Bound::Included(lhs), Bound::Excluded(rhs)) => lhs.cmp(&(rhs - 1)),

        (Bound::Excluded(0), Bound::Included(_)) => cmp::Ordering::Less,
        (Bound::Excluded(lhs), Bound::Included(rhs)) => (lhs - 1).cmp(rhs),

        (Bound::Unbounded, Bound::Unbounded) => cmp::Ordering::Equal,
        (_, Bound::Unbounded) => cmp::Ordering::Less,
        (Bound::Unbounded, _) => cmp::Ordering::Greater,
    }
}

const fn add_bound(lhs: Bound<u32>, rhs: Bound<u32>) -> Bound<u32> {
    match (lhs, rhs) {
        (Bound::Included(lhs), Bound::Included(rhs)) => Bound::Included(lhs + rhs),
        (Bound::Included(lhs), Bound::Excluded(0)) => Bound::Included(lhs),
        (Bound::Included(lhs), Bound::Excluded(rhs)) => Bound::Included(lhs + (rhs - 1)),

        (Bound::Excluded(0), Bound::Included(rhs)) => Bound::Included(rhs),
        (Bound::Excluded(lhs), Bound::Included(rhs)) => Bound::Included((lhs - 1) + rhs),
        (Bound::Excluded(lhs), Bound::Excluded(rhs)) => Bound::Excluded(lhs + rhs),

        (Bound::Unbounded, _) | (_, Bound::Unbounded) => Bound::Unbounded,
    }
}

const fn saturating_add_bound(lhs: Bound<u32>, rhs: Bound<u32>) -> Bound<u32> {
    match (lhs, rhs) {
        (Bound::Included(lhs), Bound::Included(rhs)) => Bound::Included(lhs.saturating_add(rhs)),
        (Bound::Included(lhs), Bound::Excluded(0)) => Bound::Included(lhs),
        (Bound::Included(lhs), Bound::Excluded(rhs)) => {
            Bound::Included(lhs.saturating_add(rhs - 1))
        }

        (Bound::Excluded(0), Bound::Included(rhs)) => Bound::Included(rhs),
        (Bound::Excluded(lhs), Bound::Included(rhs)) => {
            Bound::Included((lhs - 1).saturating_add(rhs))
        }
        (Bound::Excluded(lhs), Bound::Excluded(rhs)) => Bound::Excluded(lhs.saturating_add(rhs)),

        (Bound::Unbounded, _) | (_, Bound::Unbounded) => Bound::Unbounded,
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
            pub const fn one() -> Self {
                let one = <$inner>::new(1);
                Self { min: one, max: Bound::Included(one) }
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
            #[must_use]
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
            #[must_use]
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

        impl HasBottom<$name> for SaturatingSemiring {
            #[inline]
            fn bottom(&self) -> $name {
                $name::empty()
            }

            #[inline]
            fn is_bottom(&self, value: &$name) -> bool {
                value.is_empty()
            }
        }

        impl Add<Self> for $name {
            type Output = Self;

            #[inline]
            fn add(self, other: Self) -> Self {
                let min = self.min + other.min;
                let max = add_bound(self.max.map(|value| value.raw), other.max.map(|value| value.raw));

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
            #[inline]
            fn from(value: $inner) -> Self {
                Self::new(value, Bound::Included(value))
            }
        }

        forward_ref_binop!(impl Add<Self>::add for $name);
        forward_ref_op_assign!(impl AddAssign<Self>::add_assign for $name);


        impl SaturatingMul<u16> for $name {
            type Output = Self;

            #[inline]
            fn saturating_mul(self, rhs: u16) -> Self::Output {
                let min = <$inner>::new(self.min.raw.saturating_mul(u32::from(rhs)));
                let max = self
                    .max
                    .map(|max| <$inner>::new(max.raw.saturating_mul(u32::from(rhs))));

                Self {
                    min,
                    max,
                }
            }
        }

        forward_ref_binop!(impl SaturatingMul<u16>::saturating_mul for $name);
    };
}

range!(pub struct InformationRange(InformationUnit));
range!(pub struct Cardinality(Cardinal));

impl AdditiveMonoid<InformationRange> for SaturatingSemiring {
    fn zero(&self) -> InformationRange {
        InformationRange::empty()
    }

    fn plus(&self, lhs: &mut InformationRange, rhs: &InformationRange) -> bool {
        let prev = *lhs;

        lhs.min = lhs.min.saturating_add(rhs.min);
        lhs.max = saturating_add_bound(
            lhs.max.map(|value| value.raw),
            rhs.max.map(|value| value.raw),
        )
        .map(InformationUnit::new);

        *lhs != prev
    }
}

impl JoinSemiLattice<InformationRange> for SaturatingSemiring {
    fn join(&self, lhs: &mut InformationRange, rhs: &InformationRange) -> bool {
        let prev = *lhs;
        *lhs = lhs.cover(*rhs);

        *lhs != prev
    }
}

impl AdditiveMonoid<Cardinality> for SaturatingSemiring {
    fn zero(&self) -> Cardinality {
        Cardinality::empty()
    }

    fn plus(&self, lhs: &mut Cardinality, rhs: &Cardinality) -> bool {
        let prev = *lhs;

        lhs.min = lhs.min.saturating_add(rhs.min);
        lhs.max = saturating_add_bound(
            lhs.max.map(|value| value.raw),
            rhs.max.map(|value| value.raw),
        )
        .map(Cardinal::new);

        *lhs != prev
    }
}

impl JoinSemiLattice<Cardinality> for SaturatingSemiring {
    fn join(&self, lhs: &mut Cardinality, rhs: &Cardinality) -> bool {
        let prev = *lhs;
        *lhs = lhs.cover(*rhs);

        *lhs != prev
    }
}

pub(crate) trait SaturatingMul<R> {
    type Output;

    fn saturating_mul(self, rhs: R) -> Self::Output;
}
