//! The property-selection policy.
//!
//! Pure functions over hydrated property sets convert the store's property objects into
//! [`SimpleValue`] entries and apply the per-entity cap, which drops the label property last.
//!
//! The cap bounds size only. The sets reaching it hold no protected property, because the queries
//! remove those keys before any value crosses the connection ([`client`](super::client)).

use type_system::ontology::id::BaseUrl;

use super::columns::SimpleValue;

/// Converts one entity's property object into its [`SimpleValue`] entries.
///
/// # Panics
///
/// This panics when the value is not a JSON object of [`SimpleValue`] shapes, and when a key is
/// not a base URL. The store's query aggregates a filtered object and the store's write path
/// admits only base-URL keys, so any other shape is a store-contract violation.
pub(crate) fn simple_properties(value: serde_json::Value) -> Vec<(BaseUrl, SimpleValue)> {
    let serde_json::Value::Object(object) = value else {
        panic!("the store aggregates a JSON object")
    };

    object
        .into_iter()
        .map(|(name, value)| {
            let name = BaseUrl::new(name).expect("the store keys properties by base URL");
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
/// The drop order is reverse-lexicographic by base URL (bytewise), the label property drops last,
/// and survivors sort ascending by name, which is the wire's map-key order.
pub(crate) fn select_properties(
    mut entries: Vec<(BaseUrl, SimpleValue)>,
    label_property: Option<&BaseUrl>,
    cap: usize,
) -> Vec<(BaseUrl, SimpleValue)> {
    if entries.len() > cap {
        // Ranking the label before every other name makes one
        // ascending sort the whole rule: the tail beyond the cap is
        // exactly the reverse-lexicographic drop set.
        entries.sort_by(|left, right| {
            let ranks_after_label = |name: &BaseUrl| Some(name) != label_property;
            ranks_after_label(&left.0)
                .cmp(&ranks_after_label(&right.0))
                .then_with(|| left.0.cmp(&right.0))
        });
        entries.truncate(cap);
    }

    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}
