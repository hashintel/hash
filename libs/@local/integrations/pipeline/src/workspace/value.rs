//! Shared text rendering for source identity and property conversion.

use duckdb::types::{TimeUnit, Value};
use hash_codec::numeric::Real;
use time::{
    Date, Duration, OffsetDateTime, Time, format_description::well_known::Rfc3339,
    macros::format_description,
};

const UNIX_EPOCH_JULIAN_DAY: i32 = 2_440_588;

/// Whether a cell is null or contains only whitespace, including a union's active value.
pub(crate) fn is_blank(value: &Value) -> bool {
    matches!(value, Value::Null)
        || matches!(value, Value::Text(text) | Value::Enum(text) if text.trim().is_empty())
        || matches!(value, Value::Union(value) if is_blank(value))
}

/// Renders a scalar cell without trimming text, returning no representation for null or
/// unsupported compound values. Numeric scale padding is removed and dates use ISO 8601.
pub(crate) fn text(value: &Value) -> Option<String> {
    Some(match value {
        Value::Text(text) | Value::Enum(text) => text.clone(),
        Value::Boolean(flag) => flag.to_string(),
        Value::TinyInt(number) => number.to_string(),
        Value::SmallInt(number) => number.to_string(),
        Value::Int(number) => number.to_string(),
        Value::BigInt(number) => number.to_string(),
        Value::HugeInt(number) => number.to_string(),
        Value::UTinyInt(number) => number.to_string(),
        Value::USmallInt(number) => number.to_string(),
        Value::UInt(number) => number.to_string(),
        Value::UBigInt(number) => number.to_string(),
        Value::UHugeInt(number) => number.to_string(),
        Value::Float(number) => float_text(f64::from(*number))?,
        Value::Double(number) => float_text(*number)?,
        Value::Decimal(number) => number.to_string().parse::<Real>().ok()?.to_string(),
        Value::Date32(days) => Date::from_julian_day(days.checked_add(UNIX_EPOCH_JULIAN_DAY)?)
            .ok()?
            .to_string(),
        Value::Timestamp(unit, value) => OffsetDateTime::from_unix_timestamp_nanos(
            i128::from(checked_micros(*unit, *value)?) * 1_000,
        )
        .ok()?
        .format(&Rfc3339)
        .ok()?,
        Value::Time64(unit, value) => time_of_day(*unit, *value)?,
        Value::Union(value) => return text(value),
        Value::Null
        | Value::Blob(_)
        | Value::Geometry(_)
        | Value::Interval { .. }
        | Value::List(_)
        | Value::Struct(_)
        | Value::Array(_)
        | Value::Map(_)
        | _ => return None,
    })
}

fn float_text(number: f64) -> Option<String> {
    number.is_finite().then(|| number.to_string())
}

fn time_of_day(unit: TimeUnit, value: i64) -> Option<String> {
    let micros = checked_micros(unit, value)?;
    if !(0..86_400_000_000).contains(&micros) {
        return None;
    }
    clock(Time::MIDNIGHT + Duration::microseconds(micros))
}

const fn checked_micros(unit: TimeUnit, value: i64) -> Option<i64> {
    match unit {
        TimeUnit::Second => value.checked_mul(1_000_000),
        TimeUnit::Millisecond => value.checked_mul(1_000),
        TimeUnit::Microsecond => Some(value),
        TimeUnit::Nanosecond => value.checked_div(1_000),
    }
}

/// Renders a time as `HH:MM:SS`, retaining a fractional component only when nonzero.
pub(crate) fn clock(time: Time) -> Option<String> {
    let format = if time.nanosecond() == 0 {
        format_description!("[hour]:[minute]:[second]")
    } else {
        format_description!("[hour]:[minute]:[second].[subsecond digits:1+]")
    };
    time.format(format).ok()
}

#[cfg(test)]
mod tests {
    use duckdb::types::{Decimal, TimeUnit, Value};
    use rstest::rstest;
    use similar_asserts::assert_eq;

    use crate::entity_id::source_id;

    #[rstest]
    #[case::fraction(Value::Double(1.5), Some("1.5"))]
    #[case::float_widened(Value::Float(1.2), Some("1.2000000476837158"))]
    #[case::integral_float(Value::Double(1.0), Some("1"))]
    #[case::decimal_scale(
        Value::Decimal(Decimal::new(10, 2, 803_000).expect("should construct a decimal")),
        Some("8030")
    )]
    #[case::timestamp(
        Value::Timestamp(TimeUnit::Microsecond, 1_794_220_200_000_000),
        Some("2026-11-09T10:30:00Z")
    )]
    #[case::date(Value::Date32(0), Some("1970-01-01"))]
    #[case::time(
        Value::Time64(TimeUnit::Microsecond, 3_661_250_000),
        Some("01:01:01.25")
    )]
    #[case::boolean(Value::Boolean(true), Some("true"))]
    #[case::timestamp_out_of_range(Value::Timestamp(TimeUnit::Second, i64::MAX), None)]
    #[case::time_out_of_range(Value::Time64(TimeUnit::Millisecond, i64::MAX), None)]
    #[case::whitespace(Value::Text(" SE-XXX ".into()), Some(" SE-XXX "))]
    #[case::blank_union(Value::Union(Box::new(Value::Enum(" \n".into()))), None)]
    #[case::null(Value::Null, None)]
    #[case::infinite(Value::Double(f64::INFINITY), None)]
    #[case::nan(Value::Float(f32::NAN), None)]
    #[case::list(Value::List(vec![Value::Int(1)]), None)]
    fn source_id_scalar_forms(#[case] input: Value, #[case] expected: Option<&str>) {
        assert_eq!(source_id(&input).as_deref(), expected);
    }
}
