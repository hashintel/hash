use hashql_core::{span::SpanId, symbol::Symbol};
use lexical::{
    FromLexicalWithOptions as _, ParseIntegerOptions, ParseIntegerOptionsBuilder, format,
};

use super::float;
use crate::node::id::NodeId;

const PARSE: ParseIntegerOptions = match ParseIntegerOptionsBuilder::new().build() {
    Ok(options) => options,
    Err(_) => panic!("Failed to build ParseIntegerOptions"),
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IntegerLiteral {
    pub id: NodeId,
    pub span: SpanId,

    pub value: Symbol,
}

impl IntegerLiteral {
    #[must_use]
    pub fn as_u8(&self) -> Option<u8> {
        u8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_u16(&self) -> Option<u16> {
        u16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_u32(&self) -> Option<u32> {
        u32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_u64(&self) -> Option<u64> {
        u64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_u128(&self) -> Option<u128> {
        u128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_i8(&self) -> Option<i8> {
        i8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_i16(&self) -> Option<i16> {
        i16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_i32(&self) -> Option<i32> {
        i32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_i64(&self) -> Option<i64> {
        i64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    #[must_use]
    pub fn as_i128(&self) -> Option<i128> {
        i128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE).ok()
    }

    // `f16` and `f128` are currently unsupported as they cannot be formatted or parsed from either
    // lexical or rust standard library
    #[expect(
        clippy::missing_panics_doc,
        reason = "only panics if the value hasn't been parsed correctly"
    )]
    #[must_use]
    pub fn as_f32(&self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "only panics if the value hasn't been parsed correctly"
    )]
    #[must_use]
    pub fn as_f64(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &float::PARSE)
            .expect("integer literal should be formatted according to JSON specification")
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
    fn parse_unsigned_integers() {
        let literal = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
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
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("42"),
        };

        assert_eq!(positive.as_i8(), Some(42));
        assert_eq!(positive.as_i16(), Some(42));
        assert_eq!(positive.as_i32(), Some(42));
        assert_eq!(positive.as_i64(), Some(42));
        assert_eq!(positive.as_i128(), Some(42));

        let negative = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
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
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("256"),
        };
        assert_eq!(too_large_for_u8.as_u8(), None);
        assert_eq!(too_large_for_u8.as_u16(), Some(256));

        let max_u8 = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("255"),
        };
        assert_eq!(max_u8.as_u8(), Some(255));
    }

    #[test]
    fn signed_bounds() {
        let too_large_for_i8 = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("128"),
        };
        assert_eq!(too_large_for_i8.as_i8(), None);
        assert_eq!(too_large_for_i8.as_i16(), Some(128));

        let too_small_for_i8 = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("-129"),
        };
        assert_eq!(too_small_for_i8.as_i8(), None);
        assert_eq!(too_small_for_i8.as_i16(), Some(-129));
    }

    #[test]
    #[expect(clippy::float_cmp)]
    fn float_conversions() {
        let integer = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("42"),
        };

        assert_eq!(integer.as_f32(), 42.0);
        assert_eq!(integer.as_f64(), 42.0);
    }

    #[test]
    fn invalid_formats() {
        let invalid = IntegerLiteral {
            id: NodeId::PLACEHOLDER,
            span: span_id(),
            value: symbol("not_a_number"),
        };

        assert_eq!(invalid.as_u32(), None);
        assert_eq!(invalid.as_i32(), None);
    }
}
