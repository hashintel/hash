use hash_integrations_definition::{Coercion, UnitMap};
use serde_json::{Number, Value};
use type_system::ontology::VersionedUrl;

/// Converts a property value according to the definition's coercion, returning null for absent
/// values.
#[must_use]
pub fn coerce_value(coercion: Coercion, value: &Value) -> Value {
    match coercion {
        Coercion::Trim => match value {
            Value::String(text) => Value::String(text.trim().to_owned()),
            other @ (Value::Null
            | Value::Bool(_)
            | Value::Number(_)
            | Value::Array(_)
            | Value::Object(_)) => other.clone(),
        },
        Coercion::Boolean => Value::Bool(value.as_bool().unwrap_or_else(|| {
            scalar_text(value).is_some_and(|text| {
                matches!(
                    text.trim().to_ascii_uppercase().as_str(),
                    "X" | "TRUE" | "1" | "YES" | "Y"
                )
            })
        })),
        Coercion::Number => number(value).map_or(Value::Null, Value::Number),
        Coercion::Integer => number(value)
            .and_then(|number| {
                if number.is_i64() || number.is_u64() {
                    Some(number)
                } else {
                    number.as_f64()?.trunc().to_string().parse().ok()
                }
            })
            .map_or(Value::Null, Value::Number),
        Coercion::Year => scalar_text(value)
            .and_then(|text| parse_number(text.trim()))
            .map_or(Value::Null, Value::Number),
        Coercion::Date => scalar_text(value)
            .and_then(|text| date(text.trim()))
            .map_or(Value::Null, Value::String),
        Coercion::Time => scalar_text(value)
            .and_then(|text| time(text.trim()))
            .map_or(Value::Null, Value::String),
    }
}

/// A numeric property value and the data type selected by its unit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeasuredValue {
    pub value: Number,
    pub data_type: Option<VersionedUrl>,
}

/// Converts an amount and resolves its unit, using the map's fallback for unknown units.
#[must_use]
pub fn coerce_measure(amount: &Value, unit: &Value, unit_map: &UnitMap) -> Option<MeasuredValue> {
    let value = number(amount)?;
    let unit = scalar_text(unit).unwrap_or_default();
    let data_type = unit_map
        .units()
        .iter()
        .find(|(code, _)| code.as_ref() == unit.trim())
        .map(|(_, data_type)| data_type)
        .or_else(|| unit_map.fallback())
        .cloned();
    Some(MeasuredValue { value, data_type })
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Bool(_) | Value::Number(_) => Some(value.to_string()),
        Value::Null | Value::Array(_) | Value::Object(_) => None,
    }
}

fn parse_number(text: &str) -> Option<Number> {
    if text.is_empty() {
        return None;
    }
    if let Ok(number) = text.parse() {
        return Some(number);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0b", 2),
        ("0B", 2),
        ("0o", 8),
        ("0O", 8),
    ] {
        if let Some(digits) = text.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix).ok().map(Number::from);
        }
    }
    text.parse::<f64>().ok().and_then(Number::from_f64)
}

fn number(value: &Value) -> Option<Number> {
    if let Value::Number(number) = value {
        return Some(number.clone());
    }
    let text = scalar_text(value)?;
    let text = text.trim();
    if let Some(comma) = text.find(',')
        && text.rfind('.').is_none_or(|dot| comma > dot)
    {
        parse_number(&text.replace('.', "").replace(',', "."))
    } else {
        parse_number(text)
    }
}

fn digits(text: &str, length: usize) -> bool {
    text.len() == length && text.bytes().all(|byte| byte.is_ascii_digit())
}

fn date(text: &str) -> Option<String> {
    if let Some(prefix) = text.get(..10) {
        let parts: Vec<_> = prefix.split('-').collect();
        if let [year, month, day] = parts.as_slice()
            && digits(year, 4)
            && digits(month, 2)
            && digits(day, 2)
        {
            return Some(prefix.to_owned());
        }
    }
    for separator in ['.', '/'] {
        let parts: Vec<_> = text.split(separator).collect();
        if let [day, month, year] = parts.as_slice()
            && digits(day, 2)
            && digits(month, 2)
            && digits(year, 4)
            && *day != "00"
            && *month != "00"
            && *year != "0000"
        {
            return Some(format!("{year}-{month}-{day}"));
        }
    }
    if digits(text, 8) && text != "00000000" {
        Some(format!(
            "{}-{}-{}",
            text.get(..4)?,
            text.get(4..6)?,
            text.get(6..)?
        ))
    } else {
        None
    }
}

fn time(text: &str) -> Option<String> {
    if text.is_empty() || text == "000000" {
        return None;
    }
    let text = if digits(text, 6) {
        format!("{}:{}:{}", text.get(..2)?, text.get(2..4)?, text.get(4..)?)
    } else {
        text.to_owned()
    };
    let (clock, fraction) = text
        .split_once('.')
        .map_or((text.as_str(), None), |(clock, fraction)| {
            (clock, Some(fraction))
        });
    let parts: Vec<_> = clock.split(':').collect();
    let plain = parts.len() == 3
        && parts.iter().all(|part| digits(part, 2))
        && fraction.is_none_or(|fraction| {
            !fraction.is_empty() && fraction.bytes().all(|byte| byte.is_ascii_digit())
        });
    Some(if plain { format!("{text}+00:00") } else { text })
}
