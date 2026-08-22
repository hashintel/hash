//! The property-selection policy.
//!
//! Pure functions over hydrated property sets convert the store's property objects into
//! [`ScalarValue`] entries and apply the per-entity cap, which drops the label property last.
//!
//! The cap bounds size only. The sets reaching it hold no property the store's protection
//! withholds from the requesting actor, because the queries mask before any value crosses the
//! connection ([`client`](super::client)).

use type_system::ontology::id::BaseUrl;

use super::columns::ScalarValue;

/// Converts one entity's property object into its [`ScalarValue`] entries.
///
/// A key that is not a base URL and a nested value are store-contract violations: the write path
/// admits only base-URL keys and the query aggregates a filtered object. Either one skips its
/// entry with a warning rather than failing the read.
///
/// # Panics
///
/// This panics when the value is not a JSON object, which the store's aggregation rules out.
pub(crate) fn scalar_properties(value: serde_json::Value) -> Vec<(BaseUrl, ScalarValue)> {
    let serde_json::Value::Object(object) = value else {
        panic!("the store aggregates a JSON object")
    };

    object
        .into_iter()
        .filter_map(|(name, value)| {
            let name = match BaseUrl::new(name) {
                Ok(name) => name,
                Err(error) => {
                    tracing::warn!(
                        %error,
                        "the store should key properties by base URL, but a key does not parse \
                         as one"
                    );

                    return None;
                }
            };

            let value = match value {
                serde_json::Value::String(string) => ScalarValue::String(string),
                serde_json::Value::Number(number) => {
                    if let Some(integer) = number.as_i64() {
                        ScalarValue::Integer(integer)
                    } else if let Some(float) = number.as_f64() {
                        ScalarValue::Float(float)
                    } else {
                        tracing::warn!(
                            %number,
                            "query should have returned only scalar values, but included a \
                             number f64 cannot carry"
                        );

                        return None;
                    }
                }
                serde_json::Value::Bool(bool) => ScalarValue::Bool(bool),
                serde_json::Value::Null => ScalarValue::Null,
                value @ (serde_json::Value::Object(_) | serde_json::Value::Array(_)) => {
                    tracing::warn!(
                        ?value,
                        "query should have returned only scalar values, but included a JSON \
                         object or array"
                    );

                    return None;
                }
            };

            Some((name, value))
        })
        .collect()
}

/// Selects the surviving properties under the per-entity cap.
///
/// The drop order is reverse-lexicographic by base URL (bytewise), the label property drops last,
/// and survivors sort ascending by name, which is the wire's map-key order.
pub(crate) fn select_properties(
    mut entries: Vec<(BaseUrl, ScalarValue)>,
    label_property: Option<&BaseUrl>,
    cap: usize,
) -> Vec<(BaseUrl, ScalarValue)> {
    entries.sort_by(|(lhs_key, _), (rhs_key, _)| lhs_key.cmp(rhs_key));

    if entries.len() > cap && cap > 0 {
        // A label beyond the cap takes the last surviving slot. It compares greater than every
        // earlier survivor, so the list stays ascending through the swap.
        if let Some(offset) = label_property
            .and_then(|label| entries[cap..].iter().position(|(name, _)| name == label))
        {
            entries.swap(cap - 1, cap + offset);
        }
    }

    entries.truncate(cap);
    entries
}
