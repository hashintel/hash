//! Range types for size estimation bounds.
//!
//! This module provides range types that represent min/max bounds on sizes:
//!
//! - [`InformationRange`]: Bounds on information content (in [`InformationUnit`]s)
//! - [`Cardinality`]: Bounds on element count (in [`Cardinal`]s)
//!
//! Both support unbounded upper limits (`Bound::Unbounded`) to represent collections
//! of unknown size. The analysis prefers underestimation, so unbounded upper limits
//! are common for dynamically-sized types.

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

/// Compares two upper bounds, treating `Unbounded` as greater than any finite bound.
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

/// Adds two upper bounds (may panic on overflow).
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

/// Adds two upper bounds with saturation (clamps at `u32::MAX` instead of overflowing).
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
            pub const fn value(value: $inner) -> Self {
                Self::new(value, Bound::Included(value))
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

        impl fmt::Display for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                <Self as Debug>::fmt(self, fmt)
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

range!(
    /// A range of possible information content values.
    ///
    /// Represents `[min, max]` bounds on how much information a value contains.
    /// The max bound may be `Unbounded` for dynamically-sized types.
    pub struct InformationRange(InformationUnit)
);

range!(
    /// A range of possible cardinality (element count) values.
    ///
    /// Represents `[min, max]` bounds on how many elements a value contains.
    /// Scalars always have cardinality `1..=1`.
    pub struct Cardinality(Cardinal)
);

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

/// Multiplication that saturates at the type's maximum value instead of overflowing.
pub(crate) trait SaturatingMul<R> {
    type Output;

    fn saturating_mul(self, rhs: R) -> Self::Output;
}

#[cfg(test)]
mod tests {
    use core::ops::Bound;

    use super::{Cardinality, InformationRange, SaturatingMul as _};
    use crate::pass::analysis::{
        dataflow::lattice::{
            SaturatingSemiring,
            laws::{
                assert_additive_monoid, assert_bounded_join_semilattice,
                assert_is_bottom_consistent,
            },
        },
        size_estimation::unit::{Cardinal, InformationUnit},
    };

    #[test]
    fn empty_range_semantics() {
        assert!(InformationRange::empty().is_empty());

        let invalid_info = InformationRange {
            min: InformationUnit::new(5),
            max: Bound::Included(InformationUnit::new(3)),
        };
        assert!(invalid_info.is_empty());

        assert!(Cardinality::empty().is_empty());

        let invalid_card = Cardinality {
            min: Cardinal::new(5),
            max: Bound::Included(Cardinal::new(3)),
        };
        assert!(invalid_card.is_empty());
    }

    #[test]
    fn cover_is_smallest_containing_range() {
        let range1 = InformationRange::new(
            InformationUnit::new(2),
            Bound::Included(InformationUnit::new(5)),
        );
        let range2 = InformationRange::new(
            InformationUnit::new(3),
            Bound::Included(InformationUnit::new(7)),
        );

        let covered = range1.cover(range2);

        let expected = InformationRange::new(
            InformationUnit::new(2),
            Bound::Included(InformationUnit::new(7)),
        );
        assert_eq!(covered, expected);
    }

    #[test]
    fn intersect_is_largest_contained_range() {
        let range1 = InformationRange::new(
            InformationUnit::new(2),
            Bound::Included(InformationUnit::new(7)),
        );
        let range2 = InformationRange::new(
            InformationUnit::new(5),
            Bound::Included(InformationUnit::new(10)),
        );

        let intersected = range1.intersect(range2);

        let expected = InformationRange::new(
            InformationUnit::new(5),
            Bound::Included(InformationUnit::new(7)),
        );
        assert_eq!(intersected, expected);
    }

    #[test]
    fn intersect_disjoint_is_empty() {
        let range1 = InformationRange::new(
            InformationUnit::new(1),
            Bound::Included(InformationUnit::new(3)),
        );
        let range2 = InformationRange::new(
            InformationUnit::new(5),
            Bound::Included(InformationUnit::new(7)),
        );

        let intersected = range1.intersect(range2);

        assert!(intersected.is_empty());
    }

    #[test]
    fn add_sums_bounds_correctly() {
        let range1 = InformationRange::new(
            InformationUnit::new(1),
            Bound::Included(InformationUnit::new(2)),
        );
        let range2 = InformationRange::new(
            InformationUnit::new(3),
            Bound::Included(InformationUnit::new(4)),
        );

        let sum = range1 + range2;

        let expected = InformationRange::new(
            InformationUnit::new(4),
            Bound::Included(InformationUnit::new(6)),
        );
        assert_eq!(sum, expected);
    }

    #[test]
    fn unbounded_propagates_through_add() {
        let full = InformationRange::full();
        let finite = InformationRange::new(
            InformationUnit::new(5),
            Bound::Included(InformationUnit::new(10)),
        );

        let sum = full + finite;

        let expected = InformationRange::new(InformationUnit::new(5), Bound::Unbounded);
        assert_eq!(sum, expected);
    }

    #[test]
    fn saturating_mul_prevents_overflow() {
        let large = InformationRange::new(
            InformationUnit::new(u32::MAX),
            Bound::Included(InformationUnit::new(u32::MAX)),
        );

        let result = large.saturating_mul(2);

        let expected = InformationRange::new(
            InformationUnit::new(u32::MAX),
            Bound::Included(InformationUnit::new(u32::MAX)),
        );
        assert_eq!(result, expected);
    }

    #[test]
    fn laws() {
        let semiring = SaturatingSemiring;

        let info_a = InformationRange::new(
            InformationUnit::new(1),
            Bound::Included(InformationUnit::new(5)),
        );
        let info_b = InformationRange::new(
            InformationUnit::new(2),
            Bound::Included(InformationUnit::new(8)),
        );
        let info_c = InformationRange::new(
            InformationUnit::new(3),
            Bound::Included(InformationUnit::new(10)),
        );

        assert_additive_monoid(&semiring, info_a, info_b, info_c);
        assert_bounded_join_semilattice(&semiring, info_a, info_b, info_c);

        let card_a = Cardinality::new(Cardinal::new(1), Bound::Included(Cardinal::new(5)));
        let card_b = Cardinality::new(Cardinal::new(2), Bound::Included(Cardinal::new(8)));
        let card_c = Cardinality::new(Cardinal::new(3), Bound::Included(Cardinal::new(10)));

        assert_additive_monoid(&semiring, card_a, card_b, card_c);
        assert_bounded_join_semilattice(&semiring, card_a, card_b, card_c);

        assert_is_bottom_consistent::<SaturatingSemiring, InformationRange>(&semiring);
        assert_is_bottom_consistent::<SaturatingSemiring, Cardinality>(&semiring);
    }
}
