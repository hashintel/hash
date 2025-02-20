use core::ops::{Bound, Range, RangeFrom, RangeFull, RangeInclusive, RangeTo, RangeToInclusive};

use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use proptest::prelude::*;
use serde_json::json;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn bound_included_ok(value in any::<u8>()) {
        assert_tokens(&Bound::Included(value), &[
            Token::Object { length: Some(2) },
            Token::Str("Included"),
            Token::Number(value.into()),
            Token::ObjectEnd
        ]);
    }

    #[test]
    fn bound_excluded_ok(value in any::<u8>()) {
        assert_tokens(&Bound::Excluded(value), &[
            Token::Object { length: Some(2) },
            Token::Str("Excluded"),
            Token::Number(value.into()),
            Token::ObjectEnd
        ]);
    }

    #[test]
    fn range_array_ok(value in any::<Range<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(2) },
            Token::Number(value.start.into()),
            Token::Number(value.end.into()),
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_object_ok(value in any::<Range<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(2) },
            Token::Str("start"),
            Token::Number(value.start.into()),
            Token::Str("end"),
            Token::Number(value.end.into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_inclusive_array_ok(value in any::<RangeInclusive<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(2) },
            Token::Number((*value.start()).into()),
            Token::Number((*value.end()).into()),
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_inclusive_object_ok(value in any::<RangeInclusive<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(2) },
            Token::Str("start"),
            Token::Number((*value.start()).into()),
            Token::Str("end"),
            Token::Number((*value.end()).into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_from_array_ok(value in any::<RangeFrom<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Number(value.start.into()),
            Token::Null,
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_from_array_missing_end_ok(value in any::<RangeFrom<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Number(value.start.into()),
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_from_object_ok(value in any::<RangeFrom<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Number(value.start.into()),
            Token::Str("end"),
            Token::Null,
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_from_object_missing_end_ok(value in any::<RangeFrom<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Number(value.start.into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_full_array_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Null,
            Token::Null,
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_full_missing_end_array_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Null,
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_full_empty_array_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(0) },
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_full_object_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::Str("end"),
            Token::Null,
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_full_missing_end_object_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_full_empty_object_ok(value in any::<RangeFull>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(0) },
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_to_array_ok(value in any::<RangeTo<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Null,
            Token::Number(value.end.into()),
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_to_object_ok(value in any::<RangeTo<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::Str("end"),
            Token::Number(value.end.into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_to_object_missing_start_ok(value in any::<RangeTo<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("end"),
            Token::Number(value.end.into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn range_to_inclusive_array_ok(value in any::<RangeToInclusive<u64>>()) {
        assert_tokens(&value, &[
            Token::Array { length: Some(1) },
            Token::Null,
            Token::Number(value.end.into()),
            Token::ArrayEnd,
        ]);
    }

    #[test]
    fn range_to_inclusive_object_ok(value in any::<RangeToInclusive<u64>>()) {
        assert_tokens(&value, &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::Str("end"),
            Token::Number(value.end.into()),
            Token::ObjectEnd,
        ]);
    }
}

#[test]
fn range_to_object_missing_end_err() {
    assert_tokens_error::<RangeTo<u64>>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "location": [{"type": "field", "value": "end"}],
                "expected": u64::reflection()
            }
        }]),
        &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn range_to_inclusive_object_missing_end_err() {
    assert_tokens_error::<RangeToInclusive<u64>>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "location": [{"type": "field", "value": "end"}],
                "expected": u64::reflection()
            }
        }]),
        &[
            Token::Object { length: Some(1) },
            Token::Str("start"),
            Token::Null,
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn bound_unbounded() {
    assert_tokens(&Bound::<()>::Unbounded, &[Token::Str("Unbounded")]);
    assert_tokens(
        &Bound::<()>::Unbounded,
        &[
            Token::Object { length: Some(1) },
            Token::Str("Unbounded"),
            Token::Null,
            Token::ObjectEnd,
        ],
    );
}
