use hashql_core::symbol::Symbol;
use lexical::{FromLexicalWithOptions as _, ParseFloatOptions, ParseFloatOptionsBuilder, format};

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
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FloatLiteral<'heap> {
    pub value: Symbol<'heap>,
}

impl FloatLiteral<'_> {
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
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted floating-point number.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f32(&self) -> f32 {
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
    /// # Panics
    ///
    /// Panics if the stored value is not a valid JSON-formatted floating-point number.
    /// This should never happen for properly constructed AST nodes.
    #[must_use]
    pub fn as_f64(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE)
            .expect("float literal should be formatted according to JSON specification")
    }
}

#[cfg(test)]
mod tests {
    use hashql_core::heap::Heap;

    use crate::node::expr::literal::FloatLiteral;

    #[test]
    #[expect(clippy::float_cmp)]
    fn valid_json_f32() {
        let heap = Heap::new();

        let literal = FloatLiteral {
            value: heap.intern_symbol("123.456"),
        };

        assert_eq!(literal.as_f32(), 123.456);
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn valid_json_f64() {
        let heap = Heap::new();

        let literal = FloatLiteral {
            value: heap.intern_symbol("123.456789012345"),
        };

        assert_eq!(literal.as_f64(), 123.456_789_012_345);
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn scientific_notation() {
        let heap = Heap::new();

        let literal = FloatLiteral {
            value: heap.intern_symbol("1.23e4"),
        };

        assert_eq!(literal.as_f32(), 12300.0);
        assert_eq!(literal.as_f64(), 12300.0);
    }

    #[test]
    fn negative_scientific_notation() {
        let heap = Heap::new();

        let literal = FloatLiteral {
            value: heap.intern_symbol("-1.23e-2"),
        };

        assert!((literal.as_f32() - (-0.0123)).abs() < f32::EPSILON);
        assert!((literal.as_f64() - (-0.0123)).abs() < f64::EPSILON);
    }

    #[test]
    #[should_panic(expected = "float literal should be formatted according to JSON specification")]
    fn invalid_float() {
        let heap = Heap::new();

        let literal = FloatLiteral {
            value: heap.intern_symbol("not-a-number"),
        };

        let _value = literal.as_f64();
    }
}
