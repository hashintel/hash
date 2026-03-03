use core::{
    fmt::{self, Display},
    str::FromStr as _,
};

use hash_codec::numeric::Real;
use lexical::{
    FromLexicalWithOptions as _, ParseIntegerOptions, ParseIntegerOptionsBuilder, format,
};

use super::float;
use crate::symbol::Symbol;

const PARSE: ParseIntegerOptions = match ParseIntegerOptionsBuilder::new().build() {
    Ok(options) => options,
    Err(_) => panic!("Failed to build ParseIntegerOptions"),
};

/// A literal representation of an integer number.
///
/// Represents an integer number exactly as it appears in the source code,
/// preserving the original string representation to avoid any potential loss
/// of precision. The value is stored as a string and can be converted to various
/// numeric types as needed.
///
/// Integer literals in HashQL can be positive or negative whole numbers.
/// The original string representation is maintained to support integers
/// of arbitrary size, beyond the limits of built-in numeric types.
///
/// # Examples
///
/// ```text
/// 42
/// -123
/// 0
/// 9223372036854775807  // Large integers are preserved exactly
/// ```
#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Integer<'heap> {
    value: Symbol<'heap>,
}

impl<'heap> Integer<'heap> {
    /// Creates a new integer literal without checking the value.
    ///
    /// The caller must ensure that the value is a valid integer literal.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    /// let integer = Integer::new_unchecked(heap.intern_symbol("42"));
    ///
    /// assert_eq!(integer.as_i32(), Some(42));
    /// ```
    #[must_use]
    pub const fn new_unchecked(value: Symbol<'heap>) -> Self {
        Self { value }
    }

    /// Attempts to convert the integer literal to an unsigned 8-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u8`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("42").as_u8(), Some(42));
    ///
    /// // Negative value
    /// assert_eq!(integer("-5").as_u8(), None);
    ///
    /// // Out of bounds
    /// assert_eq!(integer("300").as_u8(), None);
    /// ```
    #[must_use]
    pub fn as_u8(self) -> Option<u8> {
        u8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 16-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u16`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("1000").as_u16(), Some(1000));
    ///
    /// // Negative value
    /// assert_eq!(integer("-100").as_u16(), None);
    ///
    /// // Out of bounds
    /// assert_eq!(integer("70000").as_u16(), None);
    /// ```
    #[must_use]
    pub fn as_u16(self) -> Option<u16> {
        u16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 32-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u32`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("100000").as_u32(), Some(100000));
    ///
    /// // Negative value
    /// assert_eq!(integer("-1000").as_u32(), None);
    ///
    /// // Out of bounds
    /// assert_eq!(integer("5000000000").as_u32(), None);
    /// ```
    #[must_use]
    pub fn as_u32(self) -> Option<u32> {
        u32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 64-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u64`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("1234567890").as_u64(), Some(1234567890));
    ///
    /// // Negative value
    /// assert_eq!(integer("-123456").as_u64(), None);
    ///
    /// // Out of bounds
    /// assert_eq!(integer("99999999999999999999999").as_u64(), None);
    /// ```
    #[must_use]
    pub fn as_u64(self) -> Option<u64> {
        u64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 128-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u128`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(
    ///     integer("123456789012345678901234567890").as_u128(),
    ///     Some(123456789012345678901234567890)
    /// );
    ///
    /// // Negative value
    /// assert_eq!(integer("-999").as_u128(), None);
    ///
    /// // Out of bounds
    /// assert_eq!(
    ///     integer("999999999999999999999999999999999999999999").as_u128(),
    ///     None
    /// );
    /// ```
    #[must_use]
    pub fn as_u128(self) -> Option<u128> {
        u128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned pointer-sized integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`usize`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("12345").as_usize(), Some(12345));
    ///
    /// // Negative value
    /// assert_eq!(integer("-42").as_usize(), None);
    ///
    /// // Out of bounds (platform dependent)
    /// assert_eq!(integer("99999999999999999999999").as_usize(), None);
    /// ```
    #[must_use]
    pub fn as_usize(self) -> Option<usize> {
        usize::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 8-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i8`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("100").as_i8(), Some(100));
    ///
    /// // Negative value
    /// assert_eq!(integer("-100").as_i8(), Some(-100));
    ///
    /// // Out of bounds
    /// assert_eq!(integer("200").as_i8(), None);
    /// ```
    #[must_use]
    pub fn as_i8(self) -> Option<i8> {
        i8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 16-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i16`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("5000").as_i16(), Some(5000));
    ///
    /// // Negative value
    /// assert_eq!(integer("-5000").as_i16(), Some(-5000));
    ///
    /// // Out of bounds
    /// assert_eq!(integer("50000").as_i16(), None);
    /// ```
    #[must_use]
    pub fn as_i16(self) -> Option<i16> {
        i16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 32-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i32`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("42").as_i32(), Some(42));
    ///
    /// // Negative value
    /// assert_eq!(integer("-123").as_i32(), Some(-123));
    ///
    /// // Out of bounds
    /// assert_eq!(integer("3000000000").as_i32(), None);
    /// ```
    #[must_use]
    pub fn as_i32(self) -> Option<i32> {
        i32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 64-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i64`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("9876543210").as_i64(), Some(9876543210));
    ///
    /// // Negative value
    /// assert_eq!(integer("-9876543210").as_i64(), Some(-9876543210));
    ///
    /// // Out of bounds
    /// assert_eq!(integer("999999999999999999999").as_i64(), None);
    /// ```
    #[must_use]
    pub fn as_i64(self) -> Option<i64> {
        i64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 128-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i128`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(
    ///     integer("12345678901234567890123456789").as_i128(),
    ///     Some(12345678901234567890123456789)
    /// );
    ///
    /// // Negative value
    /// assert_eq!(
    ///     integer("-12345678901234567890123456789").as_i128(),
    ///     Some(-12345678901234567890123456789)
    /// );
    ///
    /// // Out of bounds
    /// assert_eq!(
    ///     integer("999999999999999999999999999999999999999999").as_i128(),
    ///     None
    /// );
    /// ```
    #[must_use]
    pub fn as_i128(self) -> Option<i128> {
        i128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed pointer-sized integer.
    ///
    /// Returns `None` if the value exceeds the range of [`isize`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("54321").as_isize(), Some(54321));
    ///
    /// // Negative value
    /// assert_eq!(integer("-54321").as_isize(), Some(-54321));
    ///
    /// // Out of bounds (platform dependent)
    /// assert_eq!(integer("99999999999999999999").as_isize(), None);
    /// ```
    #[must_use]
    pub fn as_isize(self) -> Option<isize> {
        isize::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Converts the integer literal to a 32-bit floating-point number.
    ///
    /// This conversion is always successful for valid integer literals. In case the value exceeds
    /// the safe range of [`f32`], the value will be converted lossily.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("42").as_f32(), 42.0);
    ///
    /// // Negative value
    /// assert_eq!(integer("-123").as_f32(), -123.0);
    ///
    /// // Large value (may lose precision)
    /// assert_eq!(integer("123456789012345").as_f32(), 123456789012345.0);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted integer.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f32(self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
    }

    /// Converts the integer literal to a 64-bit floating-point number.
    ///
    /// This conversion is always successful for valid integer literals. In case the value exceeds
    /// the safe range of [`f64`], the value will be converted lossily.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// assert_eq!(integer("123").as_f64(), 123.0);
    ///
    /// // Negative value
    /// assert_eq!(integer("-456").as_f64(), -456.0);
    ///
    /// // Large value
    /// assert_eq!(integer("123456789012345").as_f64(), 123456789012345.0);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted integer.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f64(self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
    }

    /// Converts the integer literal to a real number.
    ///
    /// This conversion is always successful for valid integer literals.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// let real = integer("9999").as_real();
    /// assert_eq!(real.to_string(), "9999");
    ///
    /// // Negative value
    /// let real = integer("-1234").as_real();
    /// assert_eq!(real.to_string(), "-1234");
    ///
    /// // Large value
    /// let real = integer("123456789012345678901234567890").as_real();
    /// assert_eq!(real.to_string(), "123456789012345678901234567890");
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted integer.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_real(self) -> Real {
        Real::from_str(self.value.as_str())
            .expect("integer literal should be formatted according to JSON specification")
    }

    /// Returns the raw representation of the integer literal.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Integer};
    ///
    /// let heap = Heap::new();
    ///
    /// let integer = |value: &'static str| Integer::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Positive value
    /// let symbol = integer("9999").as_symbol();
    /// assert_eq!(symbol.as_str(), "9999");
    ///
    /// // Negative value
    /// let symbol = integer("-1234").as_symbol();
    /// assert_eq!(symbol.as_str(), "-1234");
    ///
    /// // Large value
    /// let symbol = integer("123456789012345678901234567890").as_symbol();
    /// assert_eq!(symbol.as_str(), "123456789012345678901234567890");
    /// ```
    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'heap> {
        self.value
    }
}

impl Display for Integer<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.value, fmt)
    }
}

#[cfg(test)]
mod tests {
    use crate::{heap::Heap, value::primitive::Integer};

    #[test]
    fn invalid_formats() {
        let heap = Heap::new();

        let invalid = Integer {
            value: heap.intern_symbol("not_a_number"),
        };

        assert_eq!(invalid.as_u32(), None);
        assert_eq!(invalid.as_i32(), None);
    }
}
