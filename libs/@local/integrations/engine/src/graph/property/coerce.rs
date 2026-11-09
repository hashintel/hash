//! The conversions a definition can apply to a column, following the rules of the TypeScript
//! engine, except that dates and times are checked to be real ones.

use duckdb::types::Value;
use hash_codec::numeric::Real;
use hash_integrations_definition::Coercion;
use time::{
    Date, Time, UtcOffset, format_description::BorrowedFormatItem, macros::format_description,
    parsing::Parsed,
};
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

/// An ISO 8601 date, which may be followed by a time, as in a timestamp.
const ISO_DATE: &[BorrowedFormatItem<'static>] = format_description!("[year]-[month]-[day]");

/// The other date forms a column may hold.
const DATES: [&[BorrowedFormatItem<'static>]; 3] = [
    format_description!("[day].[month].[year]"),
    format_description!("[day]/[month]/[year]"),
    format_description!("[year][month][day]"),
];

/// A time of day, with an optional fraction of a second.
const CLOCK: &[BorrowedFormatItem<'static>] =
    format_description!("[hour]:[minute]:[second][optional [.[subsecond]]]");

/// A time of day without separators.
const PACKED_CLOCK: &[BorrowedFormatItem<'static>] = format_description!("[hour][minute][second]");

/// A UTC offset, which times are written with.
const OFFSET: &[BorrowedFormatItem<'static>] =
    format_description!("[offset_hour sign:mandatory]:[offset_minute]");

/// A value read from the start of some text, and the text after it.
struct Prefix<'text, T> {
    value: T,
    rest: &'text [u8],
}

fn prefix<'text, T: TryFrom<Parsed>>(
    text: &'text [u8],
    format: &[BorrowedFormatItem<'_>],
) -> Option<Prefix<'text, T>> {
    let mut parsed = Parsed::new();
    let rest = parsed.parse_items(text, format).ok()?;
    Some(Prefix {
        value: T::try_from(parsed).ok()?,
        rest,
    })
}

/// Reads a date in ISO 8601, `DD.MM.YYYY`, `DD/MM/YYYY` or `YYYYMMDD` form as `YYYY-MM-DD`.
///
/// A timestamp keeps only its date. Dates that do not exist, such as `00.04.1946`, and the year 0
/// are rejected.
fn date(value: &Value) -> Option<String> {
    let text = value::text(value)?;
    let text = text.trim().as_bytes();
    let date = prefix::<Date>(text, ISO_DATE)
        .or_else(|| {
            DATES
                .iter()
                .find_map(|format| prefix(text, format).filter(|date| date.rest.is_empty()))
        })?
        .value;
    (date.year() > 0).then(|| date.to_string())
}

/// Reads a time in `HH:MM:SS`, `HH:MM:SS.fraction` or `HHMMSS` form, with an optional `Z` or
/// `±HH:MM` offset, as `HH:MM:SS[.fraction]±HH:MM`. A time without an offset is taken as UTC.
///
/// `000000` means no time and is rejected.
fn time(value: &Value) -> Option<String> {
    let text = value::text(value)?;
    let text = text.trim();
    if text == "000000" {
        return None;
    }
    let clock = [CLOCK, PACKED_CLOCK]
        .into_iter()
        .find_map(|format| prefix::<Time>(text.as_bytes(), format))?;
    let offset = match clock.rest {
        [] | [b'Z' | b'z'] => UtcOffset::UTC,
        rest => {
            prefix(rest, OFFSET)
                .filter(|offset| offset.rest.is_empty())?
                .value
        }
    };
    Some(format!(
        "{}{}",
        value::clock(clock.value)?,
        offset.format(OFFSET).ok()?
    ))
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

/// Reads a number as [`number`] does and drops its fraction, rounding toward zero.
fn integer(value: &Value) -> Option<Real> {
    // `Real` writes a plain decimal, never an exponent, so the whole part is the text before the
    // point, exactly at any size.
    let number = number(value)?.to_string();
    number.split('.').next()?.parse().ok()
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

/// Parses a decimal or scientific number that a property can hold.
fn parse_number(text: &str) -> Option<Real> {
    value::finite(text.parse().ok()?)
}
