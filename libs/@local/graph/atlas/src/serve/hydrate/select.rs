//! The property-selection policy.
//!
//! Pure functions over hydrated property sets: parsing the store's simple-value rendering and
//! applying the per-entity cap with its label protection.

use super::columns::SimpleValue;

/// Parses one entity's simple-property object off the store's text rendering.
///
/// # Panics
///
/// Panics when the text is not a JSON object of simple values - the query filters in the store, so
/// anything else is a query bug, never data.
pub(in crate::serve) fn simple_properties(json: &str) -> Vec<(String, SimpleValue)> {
    let object: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(json).expect("the store renders a JSON object");

    object
        .into_iter()
        .map(|(name, value)| {
            let value = match value {
                serde_json::Value::String(text) => SimpleValue::Text(text),
                serde_json::Value::Number(number) => number.as_i64().map_or_else(
                    || SimpleValue::Float(number.as_f64().expect("a JSON number reads as f64")),
                    SimpleValue::Integer,
                ),
                serde_json::Value::Bool(flag) => SimpleValue::Boolean(flag),
                serde_json::Value::Null => SimpleValue::Null,
                serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                    unreachable!("the query ships simple values only")
                }
            };

            (name, value)
        })
        .collect()
}

/// Selects the surviving properties under the per-entity cap.
///
/// The drop order is reverse-lexicographic by base URL (bytewise), the label property drops very
/// last, and survivors sort ascending by name - the wire's map-key order.
pub(in crate::serve) fn select_properties(
    mut entries: Vec<(String, SimpleValue)>,
    label_property: Option<&str>,
    cap: usize,
) -> Vec<(String, SimpleValue)> {
    if entries.len() > cap {
        // Ranking the label before every other name makes one
        // ascending sort the whole rule: the tail beyond the cap is
        // exactly the reverse-lexicographic drop set.
        entries.sort_by(|left, right| {
            let protected = |name: &str| Some(name) != label_property;
            protected(&left.0)
                .cmp(&protected(&right.0))
                .then_with(|| left.0.cmp(&right.0))
        });
        entries.truncate(cap);
    }

    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}
