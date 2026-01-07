use core::{
    error::Error,
    fmt::{self, Display},
    num::TryFromIntError,
    ops::{BitAnd, BitAndAssign, BitOr, BitOrAssign, BitXor, BitXorAssign, Neg, Not},
};

use hashql_core::value::{Integer, Primitive};

use crate::macros::{forward_ref_binop, forward_ref_op_assign, forward_ref_unop};

/// A finite-precision integer constant in the MIR.
///
/// Unlike Rust, HashQL cannot differentiate between signed and unsigned integers at the type
/// level, so all values are stored as signed [`i128`].
///
/// # Conversion Methods
///
/// **Range-checked conversions** (`as_i8`, `as_u8`, `as_i16`, etc.) return [`Some`] only if
/// the value fits in the target type's range.
///
/// **Unchecked conversions** (`as_int`, `as_uint`) return the raw value without range checks.
///
/// # Examples
///
/// ```
/// use hashql_mir::body::constant::Int;
///
/// // Values that fit in the target range succeed
/// let small = Int::from(42_i64);
/// assert_eq!(small.as_i8(), Some(42));
/// assert_eq!(small.as_i16(), Some(42));
///
/// // Values outside the target range return None
/// let large = Int::from(1000_i64);
/// assert_eq!(large.as_i8(), None); // 1000 > i8::MAX
/// assert_eq!(large.as_i16(), Some(1000));
///
/// // Unsigned conversions require non-negative values
/// let negative = Int::from(-1_i8);
/// assert_eq!(negative.as_i8(), Some(-1));
/// assert_eq!(negative.as_u8(), None);
///
/// // Raw value access always succeeds
/// assert_eq!(large.as_int(), 1000);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Int {
    value: i128,
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]
impl Int {
    #[inline]
    const fn from_value_unchecked(value: i128) -> Self {
        Self { value }
    }

    /// Converts this integer to a boolean if the value is 0 or 1.
    ///
    /// Returns `Some(false)` for 0, `Some(true)` for 1, or [`None`] for any other value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(true).as_bool(), Some(true));
    /// assert_eq!(Int::from(false).as_bool(), Some(false));
    /// assert_eq!(Int::from(1_i32).as_bool(), Some(true));
    /// assert_eq!(Int::from(0_i64).as_bool(), Some(false));
    ///
    /// // Values other than 0 or 1 return None
    /// assert_eq!(Int::from(2_i8).as_bool(), None);
    /// assert_eq!(Int::from(-1_i8).as_bool(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_bool(self) -> Option<bool> {
        match self.value {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        }
    }

    /// Converts this integer to [`i8`] if the value fits in the range `-128..=127`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_i8).as_i8(), Some(42));
    /// assert_eq!(Int::from(42_i64).as_i8(), Some(42));
    /// assert_eq!(Int::from(-128_i32).as_i8(), Some(-128));
    /// assert_eq!(Int::from(127_u8).as_i8(), Some(127));
    ///
    /// // Value out of i8 range returns None
    /// assert_eq!(Int::from(128_i32).as_i8(), None);
    /// assert_eq!(Int::from(-129_i32).as_i8(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_i8(self) -> Option<i8> {
        if self.value >= i8::MIN as i128 && self.value <= i8::MAX as i128 {
            Some(self.value as i8)
        } else {
            None
        }
    }

    /// Converts this integer to [`u8`] if the value fits in the range `0..=255`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_i8).as_u8(), Some(42));
    /// assert_eq!(Int::from(255_u8).as_u8(), Some(255));
    /// assert_eq!(Int::from(200_i64).as_u8(), Some(200));
    ///
    /// // Negative or too large values return None
    /// assert_eq!(Int::from(-1_i8).as_u8(), None);
    /// assert_eq!(Int::from(256_i32).as_u8(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_u8(self) -> Option<u8> {
        if self.value >= 0 && self.value <= u8::MAX as i128 {
            Some(self.value as u8)
        } else {
            None
        }
    }

    /// Converts this integer to [`i16`] if the value fits in the range `-32768..=32767`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(1000_i16).as_i16(), Some(1000));
    /// assert_eq!(Int::from(1000_i64).as_i16(), Some(1000));
    /// assert_eq!(Int::from(-1000_i32).as_i16(), Some(-1000));
    ///
    /// // Value out of i16 range returns None
    /// assert_eq!(Int::from(40000_i64).as_i16(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_i16(self) -> Option<i16> {
        if self.value >= i16::MIN as i128 && self.value <= i16::MAX as i128 {
            Some(self.value as i16)
        } else {
            None
        }
    }

    /// Converts this integer to [`u16`] if the value fits in the range `0..=65535`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(1000_i16).as_u16(), Some(1000));
    /// assert_eq!(Int::from(65535_u16).as_u16(), Some(65535));
    /// assert_eq!(Int::from(50000_i64).as_u16(), Some(50000));
    ///
    /// // Negative or too large values return None
    /// assert_eq!(Int::from(-1_i16).as_u16(), None);
    /// assert_eq!(Int::from(70000_i64).as_u16(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_u16(self) -> Option<u16> {
        if self.value >= 0 && self.value <= u16::MAX as i128 {
            Some(self.value as u16)
        } else {
            None
        }
    }

    /// Converts this integer to [`i32`] if the value fits in the [`i32`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(100_000_i32).as_i32(), Some(100_000));
    /// assert_eq!(Int::from(100_000_i64).as_i32(), Some(100_000));
    /// assert_eq!(Int::from(-100_000_i64).as_i32(), Some(-100_000));
    ///
    /// // Value out of i32 range returns None
    /// assert_eq!(Int::from(3_000_000_000_i64).as_i32(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_i32(self) -> Option<i32> {
        if self.value >= i32::MIN as i128 && self.value <= i32::MAX as i128 {
            Some(self.value as i32)
        } else {
            None
        }
    }

    /// Converts this integer to [`u32`] if the value fits in the [`u32`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(100_000_i32).as_u32(), Some(100_000));
    /// assert_eq!(Int::from(3_000_000_000_u32).as_u32(), Some(3_000_000_000));
    /// assert_eq!(Int::from(100_000_i64).as_u32(), Some(100_000));
    ///
    /// // Negative or too large values return None
    /// assert_eq!(Int::from(-1_i32).as_u32(), None);
    /// assert_eq!(Int::from(5_000_000_000_i64).as_u32(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_u32(self) -> Option<u32> {
        if self.value >= 0 && self.value <= u32::MAX as i128 {
            Some(self.value as u32)
        } else {
            None
        }
    }

    /// Converts this integer to [`i64`] if the value fits in the [`i64`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(10_000_000_000_i64).as_i64(), Some(10_000_000_000));
    /// assert_eq!(
    ///     Int::from(-10_000_000_000_i64).as_i64(),
    ///     Some(-10_000_000_000)
    /// );
    /// assert_eq!(Int::from(100_i32).as_i64(), Some(100));
    ///
    /// // Value out of i64 range returns None
    /// assert_eq!(Int::from(10_000_000_000_000_000_000_u64).as_i64(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_i64(self) -> Option<i64> {
        if self.value >= i64::MIN as i128 && self.value <= i64::MAX as i128 {
            Some(self.value as i64)
        } else {
            None
        }
    }

    /// Converts this integer to [`u64`] if the value fits in the [`u64`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(10_000_000_000_i64).as_u64(), Some(10_000_000_000));
    /// assert_eq!(Int::from(100_i32).as_u64(), Some(100));
    ///
    /// // Negative or too large values return None
    /// assert_eq!(Int::from(-1_i64).as_u64(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_u64(self) -> Option<u64> {
        if self.value >= 0 && self.value <= u64::MAX as i128 {
            Some(self.value as u64)
        } else {
            None
        }
    }

    /// Returns the value as [`i128`].
    ///
    /// This always succeeds since the internal representation is [`i128`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(i128::MAX).as_i128(), i128::MAX);
    /// assert_eq!(Int::from(i128::MIN).as_i128(), i128::MIN);
    /// assert_eq!(Int::from(42_i8).as_i128(), 42);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_i128(self) -> i128 {
        self.value
    }

    /// Converts this integer to [`u128`] if the value is non-negative.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(i128::MAX).as_u128(), Some(i128::MAX as u128));
    /// assert_eq!(Int::from(42_i8).as_u128(), Some(42));
    ///
    /// // Negative values return None
    /// assert_eq!(Int::from(-1_i128).as_u128(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_u128(self) -> Option<u128> {
        if self.value >= 0 {
            Some(self.value as u128)
        } else {
            None
        }
    }

    /// Converts this integer to [`isize`] if the value fits in the platform's [`isize`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_isize).as_isize(), Some(42));
    /// assert_eq!(Int::from(-42_i32).as_isize(), Some(-42));
    /// assert_eq!(Int::from(1000_i64).as_isize(), Some(1000));
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_isize(self) -> Option<isize> {
        if self.value >= isize::MIN as i128 && self.value <= isize::MAX as i128 {
            Some(self.value as isize)
        } else {
            None
        }
    }

    /// Converts this integer to [`usize`] if the value fits in the platform's [`usize`] range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_usize).as_usize(), Some(42));
    /// assert_eq!(Int::from(1000_i64).as_usize(), Some(1000));
    ///
    /// // Negative values return None
    /// assert_eq!(Int::from(-1_isize).as_usize(), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> Option<usize> {
        if self.value >= 0 && self.value <= usize::MAX as i128 {
            Some(self.value as usize)
        } else {
            None
        }
    }

    /// Returns the raw signed value.
    ///
    /// This always succeeds and returns the internal [`i128`] representation directly.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_i8).as_int(), 42);
    /// assert_eq!(Int::from(-1_i64).as_int(), -1);
    /// assert_eq!(Int::from(i128::MAX).as_int(), i128::MAX);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_int(self) -> i128 {
        self.value
    }

    /// Returns the raw value reinterpreted as unsigned.
    ///
    /// This performs a direct bit-cast from [`i128`] to [`u128`], preserving the
    /// two's complement representation. For negative values, this produces the
    /// corresponding unsigned value with the sign bit set.
    ///
    /// This is primarily useful for operations like [`SwitchInt`] that work with
    /// unsigned discriminant values.
    ///
    /// [`SwitchInt`]: crate::body::terminator::SwitchInt
    ///
    /// # Sign Overflow Behavior
    ///
    /// Negative signed values wrap around to large unsigned values:
    /// - `-1_i8` becomes `u128::MAX` (all bits set)
    /// - `-128_i8` becomes `u128::MAX - 127`
    ///
    /// This is intentional and matches Rust's `as` cast semantics for signed-to-unsigned
    /// conversions.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// // Positive values convert directly
    /// assert_eq!(Int::from(42_i8).as_uint(), 42);
    ///
    /// // Negative values wrap (two's complement)
    /// assert_eq!(Int::from(-1_i8).as_uint(), u128::MAX);
    /// assert_eq!(Int::from(-1_i128).as_uint(), u128::MAX);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_uint(self) -> u128 {
        self.value as u128
    }

    /// Converts this integer to [`f32`].
    ///
    /// This may lose precision for values that cannot be exactly represented
    /// as a 32-bit floating point number.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_i32).as_f32(), 42.0_f32);
    /// assert_eq!(Int::from(-1_i8).as_f32(), -1.0_f32);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_f32(self) -> f32 {
        self.as_int() as f32
    }

    /// Converts this integer to [`f64`].
    ///
    /// This may lose precision for values that cannot be exactly represented
    /// as a 64-bit floating point number.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::body::constant::Int;
    ///
    /// assert_eq!(Int::from(42_i64).as_f64(), 42.0_f64);
    /// assert_eq!(Int::from(-1_i8).as_f64(), -1.0_f64);
    /// ```
    #[inline]
    #[must_use]
    pub const fn as_f64(self) -> f64 {
        self.as_int() as f64
    }
}

impl Display for Int {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.value, fmt)
    }
}

macro_rules! impl_from {
    ($($ty:ty),*) => {
        $(impl_from!(@impl $ty);)*
    };

    (@impl $ty:ty) => {
        impl From<$ty> for Int {
            #[inline]
            fn from(value: $ty) -> Self {
                Self::from_value_unchecked(i128::from(value))
            }
        }
    };
}

impl_from!(bool, u8, u16, u32, u64, i8, i16, i32, i64, i128);

// `usize` and `isize` cannot use the macro because `i128::from()` doesn't accept
// platform-dependent types.
impl From<usize> for Int {
    #[inline]
    fn from(value: usize) -> Self {
        Self::from_value_unchecked(value as i128)
    }
}

impl From<isize> for Int {
    #[inline]
    fn from(value: isize) -> Self {
        Self::from_value_unchecked(value as i128)
    }
}

impl TryFrom<u128> for Int {
    type Error = TryFromIntError;

    #[inline]
    fn try_from(value: u128) -> Result<Self, Self::Error> {
        Ok(Self::from_value_unchecked(i128::try_from(value)?))
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
            .map(From::from)
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
            Primitive::Boolean(bool) => Ok(bool.into()),
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

    #[inline]
    fn not(self) -> Self::Output {
        Self::from_value_unchecked(!self.as_int())
    }
}

impl Neg for Int {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self::Output {
        Self::from_value_unchecked(-self.as_int())
    }
}

impl BitOr for Int {
    type Output = Self;

    #[inline]
    fn bitor(self, rhs: Self) -> Self::Output {
        Self::from_value_unchecked(self.as_int() | rhs.as_int())
    }
}

impl BitOrAssign for Int {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        self.value |= rhs.value;
    }
}

impl BitAnd for Int {
    type Output = Self;

    #[inline]
    fn bitand(self, rhs: Self) -> Self::Output {
        Self::from_value_unchecked(self.as_int() & rhs.as_int())
    }
}

impl BitAndAssign for Int {
    #[inline]
    fn bitand_assign(&mut self, rhs: Self) {
        self.value &= rhs.value;
    }
}

impl BitXor for Int {
    type Output = Self;

    #[inline]
    fn bitxor(self, rhs: Self) -> Self::Output {
        Self::from_value_unchecked(self.as_int() ^ rhs.as_int())
    }
}

impl BitXorAssign for Int {
    #[inline]
    fn bitxor_assign(&mut self, rhs: Self) {
        self.value ^= rhs.value;
    }
}

forward_ref_unop!(impl Not::not for Int);
forward_ref_unop!(impl Neg::neg for Int);
forward_ref_binop!(impl BitOr<Int>::bitor for Int);
forward_ref_binop!(impl BitAnd<Int>::bitand for Int);
forward_ref_binop!(impl BitXor<Int>::bitxor for Int);
forward_ref_op_assign!(impl BitOrAssign<Int>::bitor_assign for Int);
forward_ref_op_assign!(impl BitAndAssign<Int>::bitand_assign for Int);
forward_ref_op_assign!(impl BitXorAssign<Int>::bitxor_assign for Int);
