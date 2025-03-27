use hashql_core::{span::SpanId, symbol::Symbol};
use lexical::{FromLexicalWithOptions as _, ParseFloatOptions, ParseFloatOptionsBuilder, format};

use crate::node::id::NodeId;

pub(crate) const PARSE: ParseFloatOptions = match ParseFloatOptionsBuilder::new().build() {
    Ok(options) => options,
    Err(_) => panic!("Failed to build ParseFloatOptions"),
};

/// A literal representation of a floating-point number.
///
/// The value is guaranteed to be formatted according to the JSON specification (RFC 8259).
/// According to [RFC 8259 Section 6](https://datatracker.ietf.org/doc/html/rfc8259#section-6).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FloatLiteral {
    pub id: NodeId,
    pub span: SpanId,

    pub value: Symbol,
}

impl FloatLiteral {
    // `f16` and `f128` are currently unsupported as they cannot be formatted or parsed from either
    // lexical or rust standard library
    //
    // I'd like to have functions that are `_lossless` and `_lossy` that are lossless and lossy
    // respectively. But I haven't found a way to do so.
    // Note that this is also how Rust literals work, if the literal is too large it'll be lossily
    // converted.

    #[expect(
        clippy::missing_panics_doc,
        reason = "only panics if the value hasn't been parsed correctly"
    )]
    #[must_use]
    pub fn as_f32(&self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE)
            .expect("float literal should be formatted according to JSON specification")
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "only panics if the value hasn't been parsed correctly"
    )]
    #[must_use]
    pub fn as_f64(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE)
            .expect("float literal should be formatted according to JSON specification")
    }
}

#[cfg(test)]
mod tests {

    use hashql_core::span::{Span, storage::SpanStorage};

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
    #[expect(clippy::float_cmp)]
    fn valid_json_f32() {
        let literal = FloatLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("123.456"),
        };

        assert_eq!(literal.as_f32(), 123.456);
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn valid_json_f64() {
        let literal = FloatLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("123.456789012345"),
        };

        assert_eq!(literal.as_f64(), 123.456_789_012_345);
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn scientific_notation() {
        let literal = FloatLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("1.23e4"),
        };

        assert_eq!(literal.as_f32(), 12300.0);
        assert_eq!(literal.as_f64(), 12300.0);
    }

    #[test]
    fn negative_scientific_notation() {
        let literal = FloatLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("-1.23e-2"),
        };

        assert!((literal.as_f32() - (-0.0123)).abs() < f32::EPSILON);
        assert!((literal.as_f64() - (-0.0123)).abs() < f64::EPSILON);
    }

    #[test]
    #[should_panic(expected = "float literal should be formatted according to JSON specification")]
    fn invalid_float() {
        let literal = FloatLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("not-a-number"),
        };

        let _value = literal.as_f64();
    }
}
