#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;

use hash_integrations_definition::{Coercion, UnitMap};
use hash_integrations_engine::{coerce_measure, coerce_value};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};

#[test]
fn coercion_dates_and_times() {
    for (coercion, value, expected) in [
        (Coercion::Date, "2024-01-15T10:20:30Z", json!("2024-01-15")),
        (Coercion::Date, " 15.01.2024 ", json!("2024-01-15")),
        (Coercion::Date, "01/15/2024", json!("2024-15-01")),
        (Coercion::Date, "20240115", json!("2024-01-15")),
        (Coercion::Date, "00000000", Value::Null),
        (Coercion::Date, "15.01.0000", Value::Null),
        (Coercion::Date, "\u{1f4ab}\u{1f4ab}\u{1f4ab}", Value::Null),
        (Coercion::Time, "101530", json!("10:15:30+00:00")),
        (Coercion::Time, "10:15:30.5", json!("10:15:30.5+00:00")),
        (Coercion::Time, "10:15:30+02:00", json!("10:15:30+02:00")),
        (Coercion::Time, "000000", Value::Null),
        (Coercion::Time, "12:\u{1f4ab}", json!("12:\u{1f4ab}")),
    ] {
        assert_eq!(
            coerce_value(coercion, &json!(value)),
            expected,
            "{coercion:?} should apply to {value:?}"
        );
    }
}

#[test]
fn coercion_numbers() {
    for (coercion, value, expected) in [
        (Coercion::Number, json!("1.234,56"), json!(1234.56)),
        (Coercion::Number, json!("1,234.56"), Value::Null),
        (Coercion::Number, json!("-1.5e3"), json!(-1500.0)),
        (Coercion::Number, json!("+2"), json!(2.0)),
        (Coercion::Number, json!("0xff"), json!(255)),
        (Coercion::Number, json!("NaN"), Value::Null),
        (Coercion::Number, json!("Infinity"), Value::Null),
        (Coercion::Number, json!(" "), Value::Null),
        (Coercion::Number, json!(u64::MAX), json!(u64::MAX)),
        (Coercion::Integer, json!("-2.9"), json!(-2)),
        (Coercion::Year, json!(" 2024 "), json!(2024)),
        (Coercion::Year, json!("1,5"), Value::Null),
    ] {
        assert_eq!(
            coerce_value(coercion, &value),
            expected,
            "{coercion:?} should apply to {value}"
        );
    }
}

#[test]
fn coercion_boolean_and_trim() {
    for value in [json!("X"), json!(" yes "), json!(true), json!(1)] {
        assert_eq!(
            coerce_value(Coercion::Boolean, &value),
            json!(true),
            "the recognized value should be true"
        );
    }
    for value in [json!("0"), json!(false), json!(null), json!("unknown")] {
        assert_eq!(
            coerce_value(Coercion::Boolean, &value),
            json!(false),
            "the unrecognized value should be false"
        );
    }
    assert_eq!(
        coerce_value(Coercion::Trim, &json!("  a \n")),
        json!("a"),
        "trim should remove surrounding whitespace"
    );
    assert_eq!(
        coerce_value(Coercion::Trim, &json!(42)),
        json!(42),
        "trim should retain non-text values"
    );
}

#[test]
fn measure_unit_selection() {
    let kilogram = "https://example.com/types/data-type/kilogram/v/1"
        .parse()
        .expect("the type URL should be valid");
    let fallback = "https://example.com/types/data-type/mass/v/1"
        .parse()
        .expect("the type URL should be valid");
    let units = UnitMap::new(
        BTreeMap::from([(
            "KG".parse().expect("the unit code should be valid"),
            kilogram,
        )]),
        Some(fallback),
    )
    .expect("the unit map should be valid");
    let value = coerce_measure(&json!("1,5"), &json!(" KG "), &units)
        .expect("the quantity should be numeric");
    assert_eq!(
        value.value,
        serde_json::Number::from_f64(1.5).expect("the number should be finite"),
        "amounts should use numeric coercion"
    );
    assert_eq!(
        value.data_type.as_ref(),
        units.units().values().next(),
        "known units should select their configured data type"
    );
    let value = coerce_measure(&json!(2), &json!("unknown"), &units)
        .expect("the quantity should be numeric");
    assert_eq!(
        value.data_type.as_ref(),
        units.fallback(),
        "unknown units should select the fallback"
    );
    assert!(
        coerce_measure(&json!("invalid"), &json!("KG"), &units).is_none(),
        "invalid amounts should produce no quantity"
    );
}
