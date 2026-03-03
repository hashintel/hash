use core::str::FromStr as _;

use hash_codec::numeric::Real;
use lexical::{FromLexicalWithOptions as _, ParseFloatOptions, ParseFloatOptionsBuilder, format};

use super::Integer;
use crate::symbol::Symbol;

pub(crate) const PARSE: ParseFloatOptions = match ParseFloatOptionsBuilder::new().build() {
    Ok(options) => options,
    Err(_) => panic!("Failed to build ParseFloatOptions"),
};

/// A literal representation of a floating-point number.
///
/// Represents a floating-point number exactly as it appears in the source code,
/// preserving the original string representation to avoid precision loss.
/// The value is guaranteed to be formatted according to the [JSON specification (RFC 8259 Section
/// 6)].
///
/// Floating-point literals in HashQL can be written in standard decimal notation
/// (like `3.14`) or scientific notation (like `1.23e4`). The original string
/// representation is stored to maintain the exact value as written by the user.
///
/// # Examples
///
/// Standard decimal notation:
/// ```text
/// 3.14159
/// -0.5
/// 0.0
/// ```
///
/// Scientific notation:
/// ```text
/// 1.23e4     // 12300.0
/// -1.23e-2   // -0.0123
/// ```
///
/// [JSON specification (RFC 8259)]: https://datatracker.ietf.org/doc/html/rfc8259#section-6
#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Float<'heap> {
    value: Symbol<'heap>,
}

impl<'heap> Float<'heap> {
    /// Creates a new float literal without checking the value.
    ///
    /// The caller must ensure that the provided `value` is a valid float literal according to the
    /// JSON specification.
    ///
    /// # Examples
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    /// let heap = Heap::new();
    /// let float = Float::new_unchecked(heap.intern_symbol("42.0"));
    ///
    /// assert_eq!(float.as_f32(), 42.0);
    /// ```
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: Symbol<'heap>) -> Self {
        Self { value }
    }

    // `f16` and `f128` are currently unsupported as they cannot be formatted or parsed from either
    // lexical or rust standard library
    //
    // I'd like to have functions that are `_lossless` and `_lossy` that are lossless and lossy
    // respectively. But I haven't found a way to do so.
    // Note that this is also how Rust literals work, if the literal is too large it'll be lossily
    // converted.

    /// Converts the float literal to a 32-bit floating-point number.
    ///
    /// This method parses the string representation of the literal according to
    /// the JSON specification and returns the resulting [`f32`] value.
    ///
    /// Conversion is lossy, meaning that the resulting [`f32`] value may not be exactly equal to
    /// the original value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    ///
    /// let heap = Heap::new();
    ///
    /// let float = |value: &'static str| Float::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Standard decimal
    /// assert_eq!(float("123.456").as_f32(), 123.456);
    ///
    /// // Negative value
    /// assert_eq!(float("-0.5").as_f32(), -0.5);
    ///
    /// // Scientific notation
    /// assert_eq!(float("1.23e4").as_f32(), 12300.0);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted floating-point number.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f32(self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE)
            .expect("float literal should be formatted according to JSON specification")
    }

    /// Converts the float literal to a 64-bit floating-point number.
    ///
    /// This method parses the string representation of the literal according to
    /// the JSON specification and returns the resulting [`f64`] value.
    ///
    /// Conversion is lossy, meaning that the resulting [`f64`] value may not be exactly equal to
    /// the original value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    ///
    /// let heap = Heap::new();
    ///
    /// let float = |value: &'static str| Float::new_unchecked(heap.intern_symbol(value));
    ///
    /// // High precision decimal
    /// assert_eq!(float("123.456789012345").as_f64(), 123.456789012345);
    ///
    /// // Negative scientific notation
    /// assert!((float("-1.23e-2").as_f64() - (-0.0123)).abs() < f64::EPSILON);
    ///
    /// // Large scientific notation
    /// assert_eq!(float("1.23e4").as_f64(), 12300.0);
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted floating-point number.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f64(self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE)
            .expect("float literal should be formatted according to JSON specification")
    }

    /// Converts the float literal to an integer literal.
    ///
    /// Returns `Some` if the float literal represents a whole number (no decimal point,
    /// scientific notation, or exponent). Returns `None` otherwise.
    ///
    /// Conversion is lossless, meaning that the resulting [`Integer`] value will be exactly
    /// equal to the original value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    ///
    /// let heap = Heap::new();
    ///
    /// let float = |value: &'static str| Float::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Whole number (can convert)
    /// assert!(float("42").as_integer().is_some());
    /// assert_eq!(float("42").as_integer().unwrap().as_symbol().as_str(), "42");
    ///
    /// // Negative whole number
    /// assert!(float("-123").as_integer().is_some());
    ///
    /// // Decimal number (cannot convert)
    /// assert!(float("3.14").as_integer().is_none());
    ///
    /// // Scientific notation (cannot convert)
    /// assert!(float("1.23e4").as_integer().is_none());
    /// ```
    #[must_use]
    pub fn as_integer(self) -> Option<Integer<'heap>> {
        let is_integer = memchr::memchr3(b'.', b'e', b'E', self.value.as_bytes()).is_none();

        is_integer.then_some(Integer::new_unchecked(self.value))
    }

    /// Converts the float literal to a real literal.
    ///
    /// Conversion is lossy, meaning that the resulting [`Real`] value may not be exactly equal to
    /// the original value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    ///
    /// let heap = Heap::new();
    ///
    /// let float = |value: &'static str| Float::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Standard decimal
    /// let real = float("3.14159").as_real();
    /// assert_eq!(real.to_string(), "3.14159");
    ///
    /// // Negative value
    /// let real = float("-2.718").as_real();
    /// assert_eq!(real.to_string(), "-2.718");
    ///
    /// // Scientific notation
    /// let real = float("1.23e4").as_real();
    /// assert_eq!(real.to_string(), "12300");
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if the float literal is not a valid JSON-formatted floating-point number.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_real(self) -> Real {
        Real::from_str(self.value.as_str())
            .expect("float literal should be formatted according to JSON specification")
    }

    /// Returns the raw representation of the float literal.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, value::Float};
    ///
    /// let heap = Heap::new();
    ///
    /// let float = |value: &'static str| Float::new_unchecked(heap.intern_symbol(value));
    ///
    /// // Standard decimal
    /// let symbol = float("3.14159").as_symbol();
    /// assert_eq!(symbol.as_str(), "3.14159");
    ///
    /// // Negative value
    /// let symbol = float("-2.718").as_symbol();
    /// assert_eq!(symbol.as_str(), "-2.718");
    ///
    /// // Scientific notation
    /// let symbol = float("1.23e4").as_symbol();
    /// assert_eq!(symbol.as_str(), "1.23e4");
    /// ```
    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'heap> {
        self.value
    }
}

#[cfg(test)]
mod tests {
    use super::Float;
    use crate::heap::Heap;

    #[test]
    #[should_panic(expected = "float literal should be formatted according to JSON specification")]
    fn invalid_float() {
        let heap = Heap::new();

        let literal = Float {
            value: heap.intern_symbol("not-a-number"),
        };

        let _value = literal.as_f64();
    }
}
