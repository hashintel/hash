use hashql_core::symbol::InternedSymbol;
use lexical::{
    FromLexicalWithOptions as _, ParseIntegerOptions, ParseIntegerOptionsBuilder, format,
};

use super::float;

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
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntegerLiteral<'heap> {
    pub value: InternedSymbol<'heap>,
}

impl<'heap> IntegerLiteral<'heap> {
    /// Attempts to convert the integer literal to an unsigned 8-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u8`].
    #[must_use]
    pub fn as_u8(&self) -> Option<u8> {
        u8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 16-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u16`].
    #[must_use]
    pub fn as_u16(&self) -> Option<u16> {
        u16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 32-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u32`].
    #[must_use]
    pub fn as_u32(&self) -> Option<u32> {
        u32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 64-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u64`].
    #[must_use]
    pub fn as_u64(&self) -> Option<u64> {
        u64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to an unsigned 128-bit integer.
    ///
    /// Returns `None` if the value is negative or exceeds the range of [`u128`].
    #[must_use]
    pub fn as_u128(&self) -> Option<u128> {
        u128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 8-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i8`].
    #[must_use]
    pub fn as_i8(&self) -> Option<i8> {
        i8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 16-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i16`].
    #[must_use]
    pub fn as_i16(&self) -> Option<i16> {
        i16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 32-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i32`].
    #[must_use]
    pub fn as_i32(&self) -> Option<i32> {
        i32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 64-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i64`].
    #[must_use]
    pub fn as_i64(&self) -> Option<i64> {
        i64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Attempts to convert the integer literal to a signed 128-bit integer.
    ///
    /// Returns `None` if the value exceeds the range of [`i128`].
    #[must_use]
    pub fn as_i128(&self) -> Option<i128> {
        i128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    /// Converts the integer literal to a 32-bit floating-point number.
    ///
    /// This conversion is always successful for valid integer literals. In case the value exceeds
    /// the safe range of [`f32`], the value will be converted lossily.
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted integer.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f32(&self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
    }

    /// Converts the integer literal to a 64-bit floating-point number.
    ///
    /// This conversion is always successful for valid integer literals. In case the value exceeds
    /// the safe range of [`f64`], the value will be converted lossily.
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted integer.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f64(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn symbol(value: &str) -> Symbol {
        Symbol::new(value)
    }

    #[test]
    fn parse_unsigned_integers() {
        let literal = IntegerLiteral {
            value: symbol("123"),
        };

        assert_eq!(literal.as_u8(), Some(123));
        assert_eq!(literal.as_u16(), Some(123));
        assert_eq!(literal.as_u32(), Some(123));
        assert_eq!(literal.as_u64(), Some(123));
        assert_eq!(literal.as_u128(), Some(123));
    }

    #[test]
    fn parse_signed_integers() {
        let positive = IntegerLiteral {
            value: symbol("42"),
        };

        assert_eq!(positive.as_i8(), Some(42));
        assert_eq!(positive.as_i16(), Some(42));
        assert_eq!(positive.as_i32(), Some(42));
        assert_eq!(positive.as_i64(), Some(42));
        assert_eq!(positive.as_i128(), Some(42));

        let negative = IntegerLiteral {
            value: symbol("-42"),
        };

        assert_eq!(negative.as_i8(), Some(-42));
        assert_eq!(negative.as_i16(), Some(-42));
        assert_eq!(negative.as_i32(), Some(-42));
        assert_eq!(negative.as_i64(), Some(-42));
        assert_eq!(negative.as_i128(), Some(-42));
    }

    #[test]
    fn unsigned_bounds() {
        let too_large_for_u8 = IntegerLiteral {
            value: symbol("256"),
        };
        assert_eq!(too_large_for_u8.as_u8(), None);
        assert_eq!(too_large_for_u8.as_u16(), Some(256));

        let max_u8 = IntegerLiteral {
            value: symbol("255"),
        };
        assert_eq!(max_u8.as_u8(), Some(255));
    }

    #[test]
    fn signed_bounds() {
        let too_large_for_i8 = IntegerLiteral {
            value: symbol("128"),
        };
        assert_eq!(too_large_for_i8.as_i8(), None);
        assert_eq!(too_large_for_i8.as_i16(), Some(128));

        let too_small_for_i8 = IntegerLiteral {
            value: symbol("-129"),
        };
        assert_eq!(too_small_for_i8.as_i8(), None);
        assert_eq!(too_small_for_i8.as_i16(), Some(-129));
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn float_conversions() {
        let integer = IntegerLiteral {
            value: symbol("42"),
        };

        assert_eq!(integer.as_f32(), 42.0);
        assert_eq!(integer.as_f64(), 42.0);
    }

    #[test]
    fn invalid_formats() {
        let invalid = IntegerLiteral {
            value: symbol("not_a_number"),
        };

        assert_eq!(invalid.as_u32(), None);
        assert_eq!(invalid.as_i32(), None);
    }
}
