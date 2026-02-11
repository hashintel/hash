//! Built-in semiring implementations for common numeric types.

use hashql_core::id::{
    Id,
    bit_vec::{BitRelations as _, ChunkedBitSet, DenseBitSet, MixedBitSet},
};

use super::{
    AdditiveMonoid, HasBottom, HasTop, JoinSemiLattice, MeetSemiLattice, MultiplicativeMonoid,
};

/// Semiring over numeric types using saturating arithmetic.
///
/// Operations clamp at the numeric bounds instead of overflowing:
/// - `plus` uses [`saturating_add`]
/// - `times` uses [`saturating_mul`]
///
/// [`saturating_add`]: u32::saturating_add
/// [`saturating_mul`]: u32::saturating_mul
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SaturatingSemiring;

/// Semiring over numeric types using wrapping arithmetic.
///
/// Operations wrap around on overflow:
/// - `plus` uses [`wrapping_add`]
/// - `times` uses [`wrapping_mul`]
///
/// [`wrapping_add`]: u32::wrapping_add
/// [`wrapping_mul`]: u32::wrapping_mul
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct WrappingSemiring;

macro_rules! impl_num {
    ($($num:ty),*) => {
        $(impl_num!(@impl $num);)*
    };
    (@impl $num:ty) => {
        impl HasBottom<$num> for SaturatingSemiring {
            #[inline]
            fn bottom(&self) -> $num {
                <$num>::MIN
            }

            #[inline]
            fn is_bottom(&self, value: &$num) -> bool {
                *value == <$num>::MIN
            }
        }

        impl HasTop<$num> for SaturatingSemiring {
            #[inline]
            fn top(&self) -> $num {
                <$num>::MAX
            }

            #[inline]
            fn is_top(&self, value: &$num) -> bool {
                *value == <$num>::MAX
            }
        }

        impl AdditiveMonoid<$num> for SaturatingSemiring {
            #[inline]
            fn zero(&self) -> $num {
                0
            }

            #[inline]
            fn plus(&self, lhs: &mut $num, rhs: &$num) -> bool {
                *lhs = lhs.saturating_add(*rhs);
                true // it is more expensive to check if lhs or rhs are 0 than to just always assume change for numbers
            }
        }

        impl AdditiveMonoid<$num> for WrappingSemiring {
            #[inline]
            fn zero(&self) -> $num {
                0
            }

            #[inline]
            fn plus(&self, lhs: &mut $num, rhs: &$num) -> bool {
                *lhs = lhs.wrapping_add(*rhs);
                true // it is more expensive to check if lhs or rhs are 0 than to just always assume change for numbers
            }
        }

        impl MultiplicativeMonoid<$num> for SaturatingSemiring {
            #[inline]
            fn one(&self) -> $num {
                1
            }

            #[inline]
            fn times(&self, lhs: &mut $num, rhs: &$num) -> bool {
                *lhs = lhs.saturating_mul(*rhs);
                true // it is more expensive to check if lhs or rhs are 0 than to just always assume change for numbers
            }
        }

        impl MultiplicativeMonoid<$num> for WrappingSemiring {
            #[inline]
            fn one(&self) -> $num {
                1
            }

            #[inline]
            fn times(&self, lhs: &mut $num, rhs: &$num) -> bool {
                *lhs = lhs.wrapping_mul(*rhs);
                true // it is more expensive to check if lhs or rhs are 0 than to just always assume change for numbers
            }
        }
    };
}

impl_num!(
    u8, i8, u16, i16, u32, i32, u64, i64, u128, i128, usize, isize
);

/// Lattice over set types using union as join and intersection as meet.
///
/// This is the standard powerset lattice where:
/// - [`join`] = union (`∪`)
/// - [`meet`] = intersection (`∩`)
/// - [`bottom`] = empty set (`∅`)
/// - [`top`] = universe (all elements in the domain)
///
/// The `domain_size` specifies the size of the universe, which determines
/// the capacity of the bitsets and what constitutes the [`top`] element.
///
/// [`join`]: JoinSemiLattice::join
/// [`meet`]: MeetSemiLattice::meet
/// [`bottom`]: HasBottom::bottom
/// [`top`]: HasTop::top
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PowersetLattice {
    domain_size: usize,
}

impl PowersetLattice {
    /// Creates a new powerset lattice with the given domain size.
    #[must_use]
    pub const fn new(domain_size: usize) -> Self {
        Self { domain_size }
    }
}

macro_rules! impl_bitset {
    ($($set:ident),*) => {
        $(impl_bitset!(@impl $set);)*
    };
    (@impl $set:ident) => {
        impl<I: Id> HasBottom<$set<I>> for PowersetLattice {
            #[inline]
            fn bottom(&self) -> $set<I> {
                $set::new_empty(self.domain_size)
            }

            #[inline]
            fn is_bottom(&self, value: &$set<I>) -> bool {
                value.is_empty()
            }
        }

        impl<I: Id> HasTop<$set<I>> for PowersetLattice {
            #[inline]
            fn top(&self) -> $set<I> {
                $set::new_filled(self.domain_size)
            }

            #[inline]
            fn is_top(&self, value: &$set<I>) -> bool {
                value.count() == value.domain_size()
            }
        }

        impl<I: Id> JoinSemiLattice<$set<I>> for PowersetLattice {
            #[inline]
            fn join(&self, lhs: &mut $set<I>, rhs: &$set<I>) -> bool {
                lhs.union(rhs)
            }
        }

        impl<I: Id> MeetSemiLattice<$set<I>> for PowersetLattice {
            #[inline]
            fn meet(&self, lhs: &mut $set<I>, rhs: &$set<I>) -> bool {
                lhs.intersect(rhs)
            }
        }
    };
}

impl_bitset!(DenseBitSet, ChunkedBitSet, MixedBitSet);

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use hashql_core::id::{self, Id as _, bit_vec::DenseBitSet};

    use super::{PowersetLattice, SaturatingSemiring, WrappingSemiring};
    use crate::pass::analysis::dataflow::lattice::laws::{assert_bounded_lattice, assert_semiring};

    #[test]
    fn saturating_semiring_u32() {
        assert_semiring(&SaturatingSemiring, 3_u32, 5_u32, 7_u32);
        assert_semiring(&SaturatingSemiring, 0_u32, 1_u32, u32::MAX);
    }

    #[test]
    fn wrapping_semiring_u32() {
        assert_semiring(&WrappingSemiring, 3_u32, 5_u32, 7_u32);
        assert_semiring(&WrappingSemiring, 0_u32, 1_u32, u32::MAX);
    }

    #[test]
    fn saturating_semiring_i32() {
        assert_semiring(&SaturatingSemiring, 3_i32, -5_i32, 7_i32);
        assert_semiring(&SaturatingSemiring, 0_i32, i32::MIN, i32::MAX);
    }

    #[test]
    fn wrapping_semiring_i32() {
        assert_semiring(&WrappingSemiring, 3_i32, -5_i32, 7_i32);
        assert_semiring(&WrappingSemiring, 0_i32, i32::MIN, i32::MAX);
    }

    #[test]
    fn powerset_lattice_dense_bitset() {
        id::newtype!(struct TestId(u32 is 0..=63));

        let lattice = PowersetLattice::new(64);

        // Create some test sets
        let mut a: DenseBitSet<TestId> = DenseBitSet::new_empty(64);
        let mut b: DenseBitSet<TestId> = DenseBitSet::new_empty(64);
        let mut c: DenseBitSet<TestId> = DenseBitSet::new_empty(64);

        // a = {0, 1, 2}
        a.insert(TestId::from_usize(0));
        a.insert(TestId::from_usize(1));
        a.insert(TestId::from_usize(2));

        // b = {2, 3, 4}
        b.insert(TestId::from_usize(2));
        b.insert(TestId::from_usize(3));
        b.insert(TestId::from_usize(4));

        // c = {4, 5, 6}
        c.insert(TestId::from_usize(4));
        c.insert(TestId::from_usize(5));
        c.insert(TestId::from_usize(6));

        assert_bounded_lattice(&lattice, a, b, c);
    }
}
