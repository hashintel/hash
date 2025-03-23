use hql_span::SpanId;
use hql_symbol::Symbol;
use lexical::{
    FromLexicalWithOptions as _, ParseIntegerOptions, ParseIntegerOptionsBuilder, format,
};

use super::float;

const PARSE_LOSSLESS: ParseIntegerOptions = match ParseIntegerOptionsBuilder::new().build() {
    Ok(options) => options,
    Err(_) => panic!("Failed to build ParseIntegerOptions"),
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IntegerLiteral {
    pub span: SpanId,

    pub value: Symbol,
}

impl IntegerLiteral {
    #[must_use]
    pub fn as_u8(&self) -> Option<u8> {
        u8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_u16(&self) -> Option<u16> {
        u16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_u32(&self) -> Option<u32> {
        u32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_u64(&self) -> Option<u64> {
        u64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_u128(&self) -> Option<u128> {
        u128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_i8(&self) -> Option<i8> {
        i8::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_i16(&self) -> Option<i16> {
        i16::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_i32(&self) -> Option<i32> {
        i32::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_i64(&self) -> Option<i64> {
        i64::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    #[must_use]
    pub fn as_i128(&self) -> Option<i128> {
        i128::from_lexical_with_options::<{ format::JSON }>(self.value.as_bytes(), &PARSE_LOSSLESS)
            .ok()
    }

    // `f16` and `f128` are currently unsupported as they cannot be formatted or parsed from either
    // lexical or rust standard library

    #[must_use]
    pub fn as_f32(&self) -> Option<f32> {
        f32::from_lexical_with_options::<{ format::JSON }>(
            self.value.as_bytes(),
            &float::PARSE_LOSSLESS,
        )
        .ok()
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "the panic should never happen, in case a panic happens that means that the \
                  parser failed"
    )]
    #[must_use]
    pub fn as_f32_lossy(&self) -> f32 {
        f32::from_lexical_with_options::<{ format::JSON }>(
            self.value.as_bytes(),
            &float::PARSE_LOSSY,
        )
        .expect("integer literal should be formatted according to JSON specification")
    }

    #[must_use]
    pub fn as_f64(&self) -> Option<f64> {
        f64::from_lexical_with_options::<{ format::JSON }>(
            self.value.as_bytes(),
            &float::PARSE_LOSSLESS,
        )
        .ok()
    }

    #[expect(
        clippy::missing_panics_doc,
        reason = "the panic should never happen, in case a panic happens that means that the \
                  parser failed"
    )]
    #[must_use]
    pub fn as_f64_lossy(&self) -> f64 {
        f64::from_lexical_with_options::<{ format::JSON }>(
            self.value.as_bytes(),
            &float::PARSE_LOSSY,
        )
        .expect("integer literal should be formatted according to JSON specification")
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
    fn parse_unsigned_integers() {
        let literal = IntegerLiteral {
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
            span: span_id(),
            value: symbol("42"),
        };

        assert_eq!(positive.as_i8(), Some(42));
        assert_eq!(positive.as_i16(), Some(42));
        assert_eq!(positive.as_i32(), Some(42));
        assert_eq!(positive.as_i64(), Some(42));
        assert_eq!(positive.as_i128(), Some(42));

        let negative = IntegerLiteral {
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
            span: span_id(),
            value: symbol("256"),
        };
        assert_eq!(too_large_for_u8.as_u8(), None);
        assert_eq!(too_large_for_u8.as_u16(), Some(256));

        let max_u8 = IntegerLiteral {
            span: span_id(),
            value: symbol("255"),
        };
        assert_eq!(max_u8.as_u8(), Some(255));
    }

    #[test]
    fn signed_bounds() {
        let too_large_for_i8 = IntegerLiteral {
            span: span_id(),
            value: symbol("128"),
        };
        assert_eq!(too_large_for_i8.as_i8(), None);
        assert_eq!(too_large_for_i8.as_i16(), Some(128));

        let too_small_for_i8 = IntegerLiteral {
            span: span_id(),
            value: symbol("-129"),
        };
        assert_eq!(too_small_for_i8.as_i8(), None);
        assert_eq!(too_small_for_i8.as_i16(), Some(-129));
    }

    #[test]
    fn float_conversions() {
        let integer = IntegerLiteral {
            span: span_id(),
            value: symbol("42"),
        };

        assert_eq!(integer.as_f32(), Some(42.0));
        assert_eq!(integer.as_f32_lossy(), 42.0);
        assert_eq!(integer.as_f64(), Some(42.0));
        assert_eq!(integer.as_f64_lossy(), 42.0);
    }

    #[test]
    fn large_integer_to_float() {
        // A number that can't be exactly represented as `f32`
        let large = IntegerLiteral {
            span: span_id(),
            value: symbol("16777217"), /* 2^24 + 1, first integer that can't be exactly
                                        * represented in `f32` */
        };

        assert_eq!(large.as_f32(), None); // Should fail in lossless mode
        assert_ne!(large.as_f32_lossy(), 16_777_217.0); // Will be approximated in lossy mode
        assert_eq!(large.as_f64(), Some(16_777_217.0)); // But fits in `f64` exactly
    }

    #[test]
    fn invalid_formats() {
        let invalid = IntegerLiteral {
            span: span_id(),
            value: symbol("not_a_number"),
        };

        assert_eq!(invalid.as_u32(), None);
        assert_eq!(invalid.as_i32(), None);
        assert_eq!(invalid.as_f32(), None);
    }
}
