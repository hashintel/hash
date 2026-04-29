//! Finite-precision integer constants for the HashQL MIR.
//!
//! [`Int`] represents compile-time integer and boolean values with size tracking.
//! Values carry their bit-width: 1 bit for booleans, 128 bits for integers.
//! This allows serialization to distinguish `true`/`false` from `0`/`1` without
//! external type information — critical for round-tripping through formats like jsonb
//! that have distinct boolean and number representations.
//!
//! # Size Invariants
//!
//! Only two sizes are valid:
//! - **1 bit**: boolean values (`0` or `1`)
//! - **128 bits**: integer values (full [`i128`] range)
//!
//! # Arithmetic Promotion
//!
//! All arithmetic operations produce 128-bit results, even when both operands are booleans.
//! Bitwise boolean operations (`BitAnd`, `BitOr`, `BitXor`) preserve the 1-bit size when
//! both operands are booleans.

use core::{
    cmp, debug_assert_matches,
    error::Error,
    fmt::{self, Display},
    hash::{Hash, Hasher},
    hint,
    num::{NonZero, TryFromIntError},
    ops::{Add, BitAnd, BitAndAssign, BitOr, BitOrAssign, BitXor, BitXorAssign, Neg, Not, Sub},
};

use hashql_core::value::{Integer, Primitive};

use crate::{
    interpret::value::{Num, Numeric},
    macros::{forward_ref_binop, forward_ref_op_assign, forward_ref_unop},
};

/// Bit-width for boolean values.
const BOOL_BITS: NonZero<u8> = NonZero::new(1).unwrap();

/// Bit-width for integer values.
const INT_BITS: NonZero<u8> = NonZero::new(128).unwrap();

/// A finite-precision integer constant in the MIR.
///
/// Stores an [`i128`] value alongside its bit-width. The width distinguishes booleans
/// (1 bit, values `0` or `1`) from integers (128 bits, full [`i128`] range).
///
/// # Examples
///
/// ```
/// use hashql_mir::interpret::value::Int;
///
/// // Booleans are 1-bit integers
/// let t = Int::from(true);
/// assert_eq!(t.size(), 1);
/// assert_eq!(t.as_bool(), Some(true));
///
/// // Integers are 128-bit
/// let n = Int::from(42_i64);
/// assert_eq!(n.size(), 128);
/// assert_eq!(n.as_int(), 42);
///
/// // Bool provenance is preserved: from(true) ≠ from(1)
/// assert_ne!(Int::from(true), Int::from(1_i32));
/// ```
// Uses `#[repr(packed)]` to avoid alignment padding, which would duplicate size, same as
// rust-lang's ScalarInt.
#[derive(Copy, Clone)]
#[repr(Rust, packed)]
pub struct Int {
    /// The raw integer value.
    ///
    /// For booleans (size == 1), only `0` and `1` are valid.
    /// For integers (size == 128), any `i128` value is valid.
    value: i128,

    /// Bit-width of the value: `1` for booleans, `128` for integers.
    size: NonZero<u8>,
}

impl Int {
    /// Boolean constant `false`.
    pub const FALSE: Self = Self {
        value: 0,
        size: BOOL_BITS,
    };
    /// Integer constant `1`.
    pub const ONE: Self = Self {
        value: 1,
        size: INT_BITS,
    };
    /// Boolean constant `true`.
    pub const TRUE: Self = Self {
        value: 1,
        size: BOOL_BITS,
    };
    /// Integer constant `0`.
    pub const ZERO: Self = Self {
        value: 0,
        size: INT_BITS,
    };

    /// Creates a boolean `Int` from a `bool`.
    #[inline]
    const fn from_bool(value: bool) -> Self {
        Self {
            value: value as i128,
            size: BOOL_BITS,
        }
    }

    /// Creates a 128-bit integer `Int` from an `i128`.
    #[inline]
    const fn from_i128(value: i128) -> Self {
        Self {
            value,
            size: INT_BITS,
        }
    }

    /// Validates the internal invariants in debug builds.
    ///
    /// - `size` must be 1 or 128
    /// - If `size == 1`, value must be 0 or 1
    #[expect(
        clippy::inline_always,
        reason = "mirrors rustc's check_data pattern — cheap assertion, always inlined"
    )]
    #[inline(always)]
    fn check_data(self) {
        let value = self.value;
        let size = self.size.get();

        debug_assert_matches!(size, 1 | 128, "Int size must be 1 or 128, got {size}");
        debug_assert!(
            size == 128 || matches!(value, 0 | 1),
            "Bool Int must have value 0 or 1, got {value}"
        );
    }

    /// Returns the bit-width of this value: `1` for booleans, `128` for integers.
    #[inline]
    #[must_use]
    pub const fn size(self) -> u8 {
        self.size.get()
    }

    /// Returns `true` if this value has boolean width (1 bit).
    #[inline]
    #[must_use]
    pub const fn is_bool(self) -> bool {
        self.size.get() == 1
    }

    /// Converts this value to a `bool` if it has boolean width.
    ///
    /// Returns `None` for 128-bit integers, even if the value is 0 or 1.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::Int;
    ///
    /// assert_eq!(Int::from(true).as_bool(), Some(true));
    /// assert_eq!(Int::from(false).as_bool(), Some(false));
    ///
    /// // Integer 1 is NOT a bool — different size
    /// assert_eq!(Int::from(1_i32).as_bool(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_bool(self) -> Option<bool> {
        if !self.is_bool() {
            return None;
        }

        match self.value {
            0 => Some(false),
            1 => Some(true),
            _ => {
                // The check_data invariant guarantees boolean values are 0 or 1. This branch is
                // unreachable in valid programs.
                unreachable!()
            }
        }
    }

    /// Returns the value as a signed `i128`.
    ///
    /// For booleans, returns `0` or `1`. For integers, returns the raw value.
    /// This always succeeds regardless of the bit-width.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::Int;
    ///
    /// assert_eq!(Int::from(42_i64).as_int(), 42);
    /// assert_eq!(Int::from(-1_i128).as_int(), -1);
    /// assert_eq!(Int::from(true).as_int(), 1);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_int(self) -> i128 {
        self.value
    }

    /// Returns the value reinterpreted as unsigned `u128`.
    ///
    /// For booleans, returns `0` or `1`. For integers, performs a two's complement
    /// bit-cast (negative values wrap to large unsigned values).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::Int;
    ///
    /// assert_eq!(Int::from(42_i64).as_uint(), 42);
    /// assert_eq!(Int::from(true).as_uint(), 1);
    /// assert_eq!(Int::from(-1_i128).as_uint(), u128::MAX);
    /// ```
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_sign_loss,
        reason = "intentional two's complement reinterpretation"
    )]
    pub const fn as_uint(self) -> u128 {
        self.as_int() as u128
    }

    /// Checked integer addition. Returns `None` on overflow.
    ///
    /// Always produces a 128-bit result (arithmetic promotes booleans).
    #[inline]
    #[must_use]
    pub const fn checked_add(self, rhs: Self) -> Option<Self> {
        match self.as_int().checked_add(rhs.as_int()) {
            Some(result) => Some(Self::from_i128(result)),
            None => None,
        }
    }

    /// Checked integer subtraction. Returns `None` on overflow.
    ///
    /// Always produces a 128-bit result (arithmetic promotes booleans).
    #[inline]
    #[must_use]
    pub const fn checked_sub(self, rhs: Self) -> Option<Self> {
        match self.as_int().checked_sub(rhs.as_int()) {
            Some(result) => Some(Self::from_i128(result)),
            None => None,
        }
    }

    /// Converts this integer to [`f32`].
    ///
    /// This may lose precision for values that cannot be exactly represented
    /// as a 32-bit floating point number.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "intentional lossy conversion to float"
    )]
    pub const fn as_f32(self) -> f32 {
        self.as_int() as f32
    }

    /// Converts this integer to [`f64`].
    ///
    /// This may lose precision for values that cannot be exactly represented
    /// as a 64-bit floating point number.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "intentional lossy conversion to float"
    )]
    pub const fn as_f64(self) -> f64 {
        self.as_int() as f64
    }
}

impl fmt::Debug for Int {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let this = *self;
        this.check_data();

        match this.as_bool() {
            Some(value) => f.debug_tuple("Bool").field(&value).finish(),
            None => f.debug_tuple("Int").field(&this.as_int()).finish(),
        }
    }
}

impl Display for Int {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let this = *self;
        this.check_data();

        match this.as_bool() {
            Some(value) => Display::fmt(&value, f),
            None => Display::fmt(&this.as_int(), f),
        }
    }
}

impl PartialEq for Int {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.as_int() == other.as_int() && self.size() == other.size()
    }
}

impl Eq for Int {}

impl PartialOrd for Int {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Int {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        (self.size(), self.as_int()).cmp(&(other.size(), other.as_int()))
    }
}

impl Hash for Int {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_int().hash(state);
        self.size().hash(state);
    }
}

impl const From<bool> for Int {
    #[inline]
    fn from(value: bool) -> Self {
        Self::from_bool(value)
    }
}

macro_rules! impl_from_int {
    ($($ty:ty),*) => {
        $(
            impl const From<$ty> for Int {
                #[inline]
                fn from(value: $ty) -> Self {
                    Self::from_i128(i128::from(value))
                }
            }
        )*
    };
}

impl_from_int!(u8, u16, u32, u64, i8, i16, i32, i64, i128);

impl const From<usize> for Int {
    #[inline]
    fn from(value: usize) -> Self {
        Self::from_i128(value as i128)
    }
}

impl const From<isize> for Int {
    #[inline]
    fn from(value: isize) -> Self {
        Self::from_i128(value as i128)
    }
}

impl const TryFrom<u128> for Int {
    type Error = TryFromIntError;

    #[inline]
    fn try_from(value: u128) -> Result<Self, Self::Error> {
        match i128::try_from(value) {
            Ok(value) => Ok(Self::from_i128(value)),
            Err(error) => Err(error),
        }
    }
}

/// Error returned when converting an [`Integer`] to [`Int`] fails.
///
/// This error occurs when the [`Integer`] value exceeds the range of [`i128`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TryFromIntegerError(());

impl fmt::Display for TryFromIntegerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("integer value is out of range")
    }
}

impl Error for TryFromIntegerError {}

impl TryFrom<Integer<'_>> for Int {
    type Error = TryFromIntegerError;

    #[inline]
    fn try_from(value: Integer<'_>) -> Result<Self, Self::Error> {
        value
            .as_i128()
            .map(Self::from_i128)
            .ok_or(TryFromIntegerError(()))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum TryFromPrimitiveErrorKind {
    OutOfRange,
    InvalidType,
}

/// Error returned when converting a [`Primitive`] to [`Int`] fails.
///
/// This error occurs in two scenarios:
/// - **Out of range**: The primitive is an integer but exceeds [`i128`] range
/// - **Invalid type**: The primitive is not a boolean or integer (e.g., float, null, string)
///
/// Use [`is_out_of_range`](Self::is_out_of_range) and [`is_invalid_type`](Self::is_invalid_type)
/// to determine the cause. The original [`Primitive`] value is preserved in the
/// [`value`](Self::value) field.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TryFromPrimitiveError<'heap> {
    kind: TryFromPrimitiveErrorKind,
    /// The original primitive value that could not be converted.
    pub value: Primitive<'heap>,
}

impl TryFromPrimitiveError<'_> {
    /// Returns `true` if the error was caused by an out-of-range integer.
    #[must_use]
    pub const fn is_out_of_range(&self) -> bool {
        matches!(self.kind, TryFromPrimitiveErrorKind::OutOfRange)
    }

    /// Returns `true` if the error was caused by an invalid type.
    #[must_use]
    pub const fn is_invalid_type(&self) -> bool {
        matches!(self.kind, TryFromPrimitiveErrorKind::InvalidType)
    }
}

impl fmt::Display for TryFromPrimitiveError<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.kind {
            TryFromPrimitiveErrorKind::OutOfRange => f.write_str("integer value is out of range"),
            TryFromPrimitiveErrorKind::InvalidType => f.write_str("invalid type"),
        }
    }
}

impl Error for TryFromPrimitiveError<'_> {}

impl<'heap> TryFrom<Primitive<'heap>> for Int {
    type Error = TryFromPrimitiveError<'heap>;

    fn try_from(value: Primitive<'heap>) -> Result<Self, Self::Error> {
        match value {
            Primitive::Boolean(bool) => Ok(Self::from_bool(bool)),
            Primitive::Integer(integer) => {
                integer.try_into().map_err(|_err| TryFromPrimitiveError {
                    kind: TryFromPrimitiveErrorKind::OutOfRange,
                    value,
                })
            }
            Primitive::Float(_) | Primitive::Null | Primitive::String(_) => {
                Err(TryFromPrimitiveError {
                    kind: TryFromPrimitiveErrorKind::InvalidType,
                    value,
                })
            }
        }
    }
}

impl Not for Int {
    type Output = Self;

    /// Boolean NOT for 1-bit values, bitwise NOT for 128-bit values.
    ///
    /// For booleans: `!true == false`, `!false == true`.
    /// For integers: flips all 128 bits (two's complement: `!x == -(x + 1)`).
    #[inline]
    fn not(self) -> Self::Output {
        if self.is_bool() {
            // Boolean NOT: flip the single bit
            Self::from_bool(self.as_int() == 0)
        } else {
            // Bitwise NOT on full 128-bit value
            Self::from_i128(!self.as_int())
        }
    }
}

impl Neg for Int {
    type Output = Numeric;

    #[expect(clippy::cast_precision_loss, clippy::float_arithmetic)]
    fn neg(self) -> Self::Output {
        let value = self.as_int();
        let (result, overflow) = value.overflowing_neg();

        if hint::unlikely(overflow) {
            // Only i128::MIN overflows: return i128::MAX + 1 as float.
            Numeric::Num(Num::from((i128::MAX as f64) + 1.0))
        } else {
            Numeric::Int(Self::from_i128(result))
        }
    }
}

impl Add for Int {
    type Output = Numeric;

    #[expect(clippy::float_arithmetic)]
    fn add(self, rhs: Self) -> Self::Output {
        let (lhs, rhs_val) = (self.as_int(), rhs.as_int());
        let (result, overflow) = lhs.overflowing_add(rhs_val);

        if hint::unlikely(overflow) {
            Numeric::Num(Num::from(self.as_f64() + rhs.as_f64()))
        } else {
            Numeric::Int(Self::from_i128(result))
        }
    }
}

impl Add<Num> for Int {
    type Output = Num;

    #[inline]
    #[expect(clippy::float_arithmetic)]
    fn add(self, rhs: Num) -> Self::Output {
        Num::from(self.as_f64() + rhs.as_f64())
    }
}

impl Sub for Int {
    type Output = Numeric;

    #[expect(clippy::float_arithmetic)]
    fn sub(self, rhs: Self) -> Self::Output {
        let (lhs, rhs_val) = (self.as_int(), rhs.as_int());
        let (result, overflow) = lhs.overflowing_sub(rhs_val);

        if hint::unlikely(overflow) {
            Numeric::Num(Num::from(self.as_f64() - rhs.as_f64()))
        } else {
            Numeric::Int(Self::from_i128(result))
        }
    }
}

impl Sub<Num> for Int {
    type Output = Num;

    #[inline]
    #[expect(clippy::float_arithmetic)]
    fn sub(self, rhs: Num) -> Self::Output {
        Num::from(self.as_f64() - rhs.as_f64())
    }
}

/// Returns `BOOL_BITS` if both operands are bools, `INT_BITS` otherwise.
#[inline]
const fn bitwise_result_size(lhs: Int, rhs: Int) -> NonZero<u8> {
    if lhs.is_bool() && rhs.is_bool() {
        BOOL_BITS
    } else {
        INT_BITS
    }
}

impl BitOr for Int {
    type Output = Self;

    #[inline]
    fn bitor(self, rhs: Self) -> Self::Output {
        Self {
            value: self.as_int() | rhs.as_int(),
            size: bitwise_result_size(self, rhs),
        }
    }
}

impl BitOrAssign for Int {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        *self = *self | rhs;
    }
}

impl BitAnd for Int {
    type Output = Self;

    #[inline]
    fn bitand(self, rhs: Self) -> Self::Output {
        Self {
            value: self.as_int() & rhs.as_int(),
            size: bitwise_result_size(self, rhs),
        }
    }
}

impl BitAndAssign for Int {
    #[inline]
    fn bitand_assign(&mut self, rhs: Self) {
        *self = *self & rhs;
    }
}

impl BitXor for Int {
    type Output = Self;

    #[inline]
    fn bitxor(self, rhs: Self) -> Self::Output {
        Self {
            value: self.as_int() ^ rhs.as_int(),
            size: bitwise_result_size(self, rhs),
        }
    }
}

impl BitXorAssign for Int {
    #[inline]
    fn bitxor_assign(&mut self, rhs: Self) {
        *self = *self ^ rhs;
    }
}

forward_ref_unop!(impl Not::not for Int);
forward_ref_unop!(impl Neg::neg for Int);
forward_ref_binop!(impl Add<Int>::add for Int);
forward_ref_binop!(impl Add<Num>::add for Int);
forward_ref_binop!(impl Sub<Int>::sub for Int);
forward_ref_binop!(impl Sub<Num>::sub for Int);
forward_ref_binop!(impl BitOr<Int>::bitor for Int);
forward_ref_binop!(impl BitAnd<Int>::bitand for Int);
forward_ref_binop!(impl BitXor<Int>::bitxor for Int);
forward_ref_op_assign!(impl BitOrAssign<Int>::bitor_assign for Int);
forward_ref_op_assign!(impl BitAndAssign<Int>::bitand_assign for Int);
forward_ref_op_assign!(impl BitXorAssign<Int>::bitxor_assign for Int);

#[cfg(test)]
mod tests {
    #![allow(
        clippy::cast_precision_loss,
        clippy::float_arithmetic,
        clippy::float_cmp
    )]

    use crate::interpret::value::{Int, Numeric};

    #[test]
    fn layout() {
        assert_eq!(size_of::<Int>(), 17);
        assert_eq!(align_of::<Int>(), 1);
    }

    #[test]
    fn from_bool_preserves_size() {
        assert_eq!(Int::from(true).size(), 1);
        assert_eq!(Int::from(false).size(), 1);
    }

    #[test]
    fn from_integer_preserves_size() {
        assert_eq!(Int::from(0_i32).size(), 128);
        assert_eq!(Int::from(1_i32).size(), 128);
        assert_eq!(Int::from(42_i64).size(), 128);
        assert_eq!(Int::from(i128::MAX).size(), 128);
        assert_eq!(Int::from(i128::MIN).size(), 128);
    }

    #[test]
    fn bool_provenance_preserved() {
        // from(true) and from(1) have the same numeric value but different sizes
        assert_ne!(Int::from(true), Int::from(1_i32));
        assert_ne!(Int::from(false), Int::from(0_i32));
    }

    #[test]
    fn as_bool_only_for_bools() {
        assert_eq!(Int::from(true).as_bool(), Some(true));
        assert_eq!(Int::from(false).as_bool(), Some(false));

        // Integer 1 is NOT a bool
        assert_eq!(Int::from(1_i32).as_bool(), None);
        assert_eq!(Int::from(0_i32).as_bool(), None);
    }

    #[test]
    fn as_int_works_for_all() {
        assert_eq!(Int::from(42_i64).as_int(), 42);
        assert_eq!(Int::from(-1_i128).as_int(), -1);
        assert_eq!(Int::from(i128::MAX).as_int(), i128::MAX);
        assert_eq!(Int::from(true).as_int(), 1);
        assert_eq!(Int::from(false).as_int(), 0);
    }

    #[test]
    fn as_uint_works_for_all() {
        assert_eq!(Int::from(42_i64).as_uint(), 42);
        assert_eq!(Int::from(true).as_uint(), 1);
        assert_eq!(Int::from(-1_i128).as_uint(), u128::MAX);
    }

    #[test]
    fn display_bool() {
        assert_eq!(format!("{}", Int::from(true)), "true");
        assert_eq!(format!("{}", Int::from(false)), "false");
    }

    #[test]
    fn display_int() {
        assert_eq!(format!("{}", Int::from(42_i64)), "42");
        assert_eq!(format!("{}", Int::from(-1_i128)), "-1");
    }

    #[test]
    fn equality_is_size_aware() {
        assert_eq!(Int::from(true), Int::from(true));
        assert_eq!(Int::from(42_i64), Int::from(42_i64));
        assert_ne!(Int::from(true), Int::from(1_i64));
    }

    #[test]
    fn ordering_groups_by_size() {
        // Bools (size 1) sort before ints (size 128)
        assert!(Int::from(true) < Int::from(0_i32));
    }

    #[test]
    fn constants() {
        assert_eq!(Int::FALSE, Int::from(false));
        assert_eq!(Int::TRUE, Int::from(true));
        assert_eq!(Int::ZERO, Int::from(0_i32));
        assert_eq!(Int::ONE, Int::from(1_i32));

        // Constants have correct sizes
        assert!(Int::FALSE.is_bool());
        assert!(Int::TRUE.is_bool());
        assert!(!Int::ZERO.is_bool());
        assert!(!Int::ONE.is_bool());
    }

    #[test]
    fn add_ints() {
        let result = Int::from(2_i64) + Int::from(3_i64);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == 5 && int.size() == 128));
    }

    #[test]
    fn add_bools_promotes() {
        let result = Int::from(true) + Int::from(true);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == 2 && int.size() == 128));
    }

    #[test]
    fn sub_ints() {
        let result = Int::from(5_i64) - Int::from(3_i64);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == 2 && int.size() == 128));
    }

    #[test]
    fn neg_positive() {
        let result = -Int::from(42_i64);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == -42));
    }

    #[test]
    fn neg_negative() {
        let result = -Int::from(-100_i64);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == 100));
    }

    #[test]
    fn neg_zero() {
        let result = -Int::from(0_i64);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == 0));
    }

    #[test]
    fn neg_i128_max() {
        let result = -Int::from(i128::MAX);
        assert!(matches!(result, Numeric::Int(int) if int.as_int() == -i128::MAX));
    }

    #[test]
    fn neg_i128_min_overflows_to_float() {
        let result = -Int::from(i128::MIN);
        let Numeric::Num(num) = result else {
            panic!("expected Numeric::Num for -i128::MIN, got {result:?}");
        };
        let expected = -(i128::MIN as f64);
        assert_eq!(num.as_f64(), expected);
    }

    #[test]
    fn bitand_bools_stays_bool() {
        let result = Int::from(true) & Int::from(false);
        assert_eq!(result.size(), 1);
        assert_eq!(result.as_bool(), Some(false));
    }

    #[test]
    fn bitor_bools_stays_bool() {
        let result = Int::from(false) | Int::from(true);
        assert_eq!(result.size(), 1);
        assert_eq!(result.as_bool(), Some(true));
    }

    #[test]
    fn bitxor_bools_stays_bool() {
        let result = Int::from(true) ^ Int::from(true);
        assert_eq!(result.size(), 1);
        assert_eq!(result.as_bool(), Some(false));
    }

    #[test]
    fn bitand_mixed_promotes_to_int() {
        let result = Int::from(true) & Int::from(1_i32);
        assert_eq!(result.size(), 128);
        assert_eq!(result.as_int(), 1);
    }

    #[test]
    fn not_bool() {
        assert_eq!(!Int::from(true), Int::from(false));
        assert_eq!(!Int::from(false), Int::from(true));
    }

    #[test]
    fn try_from_primitive_bool() {
        use hashql_core::value::Primitive;

        let int = Int::try_from(Primitive::Boolean(true)).expect("should be able to convert bool");
        assert_eq!(int.size(), 1);
        assert_eq!(int.as_bool(), Some(true));
    }

    #[test]
    fn try_from_primitive_integer() {
        use hashql_core::{
            heap::Heap,
            value::{Integer, Primitive},
        };

        let heap = Heap::new();
        let integer = Integer::new_unchecked(heap.intern_symbol("42"));
        let int =
            Int::try_from(Primitive::Integer(integer)).expect("should be able to convert integer");
        assert_eq!(int.size(), 128);
        assert_eq!(int.as_int(), 42);
    }
}
