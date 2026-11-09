//! The conversions a definition can apply to a column, following the rules of the TypeScript
//! engine, except that dates and times are checked to be real ones.

use duckdb::types::Value;
use hash_codec::numeric::Real;
use hash_integrations_definition::Coercion;
use time::{Date, Month};
use type_system::knowledge::PropertyValue;

use super::value::{self, ColumnValue};

/// Converts a non-null `value` by `coercion`, or returns `None` if it cannot be converted.
pub(super) fn apply(coercion: Coercion, value: &Value) -> Option<PropertyValue> {
    match coercion {
        Coercion::Date => date(value).map(PropertyValue::String),
        Coercion::Time => time(value).map(PropertyValue::String),
        Coercion::Boolean => Some(PropertyValue::Bool(boolean(value))),
        Coercion::Number => number(value).map(PropertyValue::Number),
        Coercion::Integer => integer(value).map(PropertyValue::Number),
        Coercion::Year => {
            let text = value::text(value)?;
            parse_number(text.trim()).map(PropertyValue::Number)
        }
        Coercion::Trim => ColumnValue::try_from(value)
            .ok()
            .map(ColumnValue::into_trimmed),
    }
}

/// Reads a date in ISO 8601, `DD.MM.YYYY`, `DD/MM/YYYY` or `YYYYMMDD` form as `YYYY-MM-DD`.
///
/// A timestamp keeps only its date. All-zero dates, such as `00000000` or `00.00.0000`, mean no
/// date and are rejected, as are dates that do not exist.
fn date(value: &Value) -> Option<String> {
    let text = value::text(value)?;
    let (year, month, day) = match *text.trim().as_bytes() {
        [y0, y1, y2, y3, b'-', m0, m1, b'-', d0, d1, ..]
        | [d0, d1, b'.', m0, m1, b'.', y0, y1, y2, y3]
        | [d0, d1, b'/', m0, m1, b'/', y0, y1, y2, y3]
        | [y0, y1, y2, y3, m0, m1, d0, d1] => (
            digits([y0, y1, y2, y3])?,
            digits([m0, m1])?,
            digits([d0, d1])?,
        ),
        _ => return None,
    };
    let date = Date::from_calendar_date(
        i32::from(year),
        Month::try_from(u8::try_from(month).ok()?).ok()?,
        u8::try_from(day).ok()?,
    )
    .ok()?;
    (year > 0).then(|| date.to_string())
}

/// Reads a time in `HH:MM:SS`, `HH:MM:SS.fraction` or `HHMMSS` form, with an optional `Z` or
/// `±HH:MM` offset. A time without an offset is taken as UTC.
fn time(value: &Value) -> Option<String> {
    let text = value::text(value)?;
    let text = text.trim();
    let text = match *text.as_bytes() {
        [b'0', b'0', b'0', b'0', b'0', b'0'] => return None,
        [h0, h1, m0, m1, s0, s1] if [h0, h1, m0, m1, s0, s1].iter().all(u8::is_ascii_digit) => {
            String::from_utf8(vec![h0, h1, b':', m0, m1, b':', s0, s1]).ok()?
        }
        _ => text.to_owned(),
    };
    let (&[h0, h1, b':', m0, m1, b':', s0, s1], mut rest) = text.as_bytes().split_first_chunk()?
    else {
        return None;
    };
    if digits([h0, h1])? >= 24 || digits([m0, m1])? >= 60 || digits([s0, s1])? >= 60 {
        return None;
    }
    if let Some(fraction) = rest.strip_prefix(b".") {
        let length = fraction
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        rest = fraction.get(length..).filter(|_| length > 0)?;
    }
    match *rest {
        [] => Some(format!("{text}+00:00")),
        [b'Z' | b'z'] => Some(text),
        [b'+' | b'-', h0, h1, b':', m0, m1] if digits([h0, h1, m0, m1]).is_some() => Some(text),
        _ => None,
    }
}

/// Reads `X`, `TRUE`, `1`, `YES` or `Y` in any case as `true`, and anything else as `false`.
fn boolean(value: &Value) -> bool {
    if let Value::Boolean(flag) = value {
        return *flag;
    }
    value::text(value).is_some_and(|text| {
        matches!(
            text.trim().to_ascii_uppercase().as_str(),
            "X" | "TRUE" | "1" | "YES" | "Y"
        )
    })
}

/// Reads a number, accepting a decimal comma when it follows the last dot, as in `1.234,56`.
pub(super) fn number(value: &Value) -> Option<Real> {
    if let Some(number) = value::as_number(value) {
        return Some(number);
    }
    parse_number(&decimal_text(value)?)
}

/// Reads a number as [`number`] does and drops its fraction.
fn integer(value: &Value) -> Option<Real> {
    let text = if matches!(
        value,
        Value::Float(_) | Value::Double(_) | Value::Decimal(_)
    ) {
        value::text(value)?.into_owned()
    } else if let Some(integer) = value::as_number(value) {
        return Some(integer);
    } else {
        decimal_text(value)?
    };
    if let Ok(integer) = text.parse::<i64>() {
        return Some(Real::from(integer));
    }
    let float = text
        .parse::<f64>()
        .ok()
        .filter(|float| float.is_finite())?
        .trunc();
    // Beyond 2^53 a float no longer holds every integer, and such amounts are not whole numbers
    // that a source wrote.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "checked to lie within the range where every integer is exact"
    )]
    (float.abs() < 9_007_199_254_740_992.0).then(|| Real::from(float as i64))
}

/// The text of `value` with a decimal comma replaced by a dot.
fn decimal_text(value: &Value) -> Option<String> {
    let text = value::text(value)?;
    let text = text.trim();
    Some(match (text.find(','), text.rfind('.')) {
        (Some(comma), dot) if dot.is_none_or(|dot| comma > dot) => {
            text.replace('.', "").replace(',', ".")
        }
        _ => text.to_owned(),
    })
}

/// Parses a decimal or scientific number, rejecting infinities and `NaN`.
fn parse_number(text: &str) -> Option<Real> {
    if let Ok(integer) = text.parse::<i64>() {
        return Some(Real::from(integer));
    }
    let float = text.parse::<f64>().ok().filter(|float| float.is_finite())?;
    text.parse::<Real>()
        .ok()
        .or_else(|| Real::try_from(float).ok())
}

/// The value of `N` ASCII decimal digits, or `None` if one is not a digit.
fn digits<const N: usize>(digits: [u8; N]) -> Option<u16> {
    digits.iter().try_fold(0_u16, |value, &digit| {
        digit
            .is_ascii_digit()
            .then(|| value * 10 + u16::from(digit - b'0'))
    })
}
