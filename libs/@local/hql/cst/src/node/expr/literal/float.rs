use hql_span::SpanId;
use hql_symbol::Symbol;
use lexical::{FromLexicalWithOptions as _, ParseFloatOptions, ParseFloatOptionsBuilder, format};

pub(crate) const PARSE_LOSSLESS: ParseFloatOptions =
    match ParseFloatOptionsBuilder::new().lossy(false).build() {
        Ok(options) => options,
        Err(_) => panic!("Failed to build ParseFloatOptions"),
    };

pub(crate) const PARSE_LOSSY: ParseFloatOptions =
    match ParseFloatOptionsBuilder::new().lossy(true).build() {
        Ok(options) => options,
        Err(_) => panic!("Failed to build ParseFloatOptions"),
    };

/// A literal representation of a floating-point number.
///
/// The value is guaranteed to be formatted according to the JSON specification (RFC 8259).
/// According to [RFC 8259 Section 6](https://datatracker.ietf.org/doc/html/rfc8259#section-6).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FloatLiteral {
    pub span: SpanId,

    pub value: Symbol,
}

impl FloatLiteral {
    // `f16` and `f128` are currently unsupported as they cannot be formatted or parsed from either
    // lexical or rust standard library

    #[must_use]
    pub fn as_f32(&self) -> Option<f32> {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "the panic should never happen, in case a panic happens that means that the \
                  parser failed"
    )]
    #[must_use]
    pub fn as_f32_lossy(&self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSY)
            .expect("float literal should be formatted according to JSON specification")
    }

    #[must_use]
    pub fn as_f64(&self) -> Option<f64> {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "the panic should never happen, in case a panic happens that means that the \
                  parser failed"
    )]
    #[must_use]
    pub fn as_f64_lossy(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSY)
            .expect("float literal should be formatted according to JSON specification")
    }
}

#[cfg(test)]
mod tests {
    use hql_span::{Span, SpanId, storage::SpanStorage};
    use hql_symbol::Symbol;

    use super::*;

    struct DummySpan;

    impl Span for DummySpan {
        fn parent_id(&self) -> Option<SpanId> {
            None
        }
    }

    fn symbol(value: &str) -> Symbol {
        Symbol::new(value)
    }

    fn span_id() -> SpanId {
        let storage = SpanStorage::new();
        storage.insert(DummySpan)
    }

    #[test]
    fn float_literal_parses_valid_json_float() {
        let literal = FloatLiteral {
            span: span_id(),
            value: symbol("3.14159"),
        };

        assert_eq!(literal.as_f32(), Some(3.14159));
        assert_eq!(literal.as_f64(), Some(3.14159));
    }

    #[test]
    fn float_literal_handles_scientific_notation() {
        let literal = FloatLiteral {
            span: span_id(),
            value: symbol("6.022e23"),
        };

        assert!(literal.as_f32().is_some());
        assert!(literal.as_f64().is_some());
        assert!(literal.as_f64().unwrap() > 6.0e23);
    }

    #[test]
    fn float_literal_handles_negative_numbers() {
        let literal = FloatLiteral {
            span: span_id(),
            value: symbol("-273.15"),
        };

        assert_eq!(literal.as_f32(), Some(-273.15));
        assert_eq!(literal.as_f64(), Some(-273.15));
    }

    #[test]
    fn lossy_conversion_handles_precision_loss() {
        // A value that exceeds f32 precision but fits in f64
        let large_precise_number = "3.1415926535897932384626433832795028841971";
        let literal = FloatLiteral {
            span: span_id(),
            value: symbol(large_precise_number),
        };

        // The lossless conversion to f32 should fail due to precision loss
        assert!(literal.as_f32().is_none());

        // But the lossy conversion should work
        assert!(literal.as_f32_lossy() > 3.14);
        assert!(literal.as_f32_lossy() < 3.15);

        // The f64 lossless conversion should work
        assert!(literal.as_f64().is_some());
    }

    #[test]
    fn invalid_float_format_returns_none() {
        let invalid_literal = FloatLiteral {
            span: span_id(),
            value: symbol("not_a_number"),
        };

        assert_eq!(invalid_literal.as_f32(), None);
        assert_eq!(invalid_literal.as_f64(), None);
    }
}
