//! Built-in semiring implementations for common numeric types.

use super::{AdditiveMonoid, MultiplicativeMonoid};

/// Semiring over numeric types using saturating arithmetic.
///
/// Operations clamp at the numeric bounds instead of overflowing:
/// - `plus` uses [`saturating_add`]
/// - `times` uses [`saturating_mul`]
///
/// [`saturating_add`]: u32::saturating_add
/// [`saturating_mul`]: u32::saturating_mul
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct SaturatingSemiring;

/// Semiring over numeric types using wrapping arithmetic.
///
/// Operations wrap around on overflow:
/// - `plus` uses [`wrapping_add`]
/// - `times` uses [`wrapping_mul`]
///
/// [`wrapping_add`]: u32::wrapping_add
/// [`wrapping_mul`]: u32::wrapping_mul
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct WrappingSemiring;

macro_rules! impl_num {
    ($($num:ty),*) => {
        $(impl_num!(@impl $num);)*
    };
    (@impl $num:ty) => {
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

#[cfg(test)]
mod tests {
    use super::{SaturatingSemiring, WrappingSemiring};
    use crate::pass::analysis::dataflow::lattice::laws::assert_semiring;

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
}
