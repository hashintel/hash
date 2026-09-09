use alloc::vec;

use type_system::ontology::id::BaseUrl;

/// One scalar property value.
///
/// A hydrated property value takes no other shape. The store filters out nested objects and arrays,
/// so they never cross the connection.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ScalarValue {
    /// A text scalar.
    String(String),
    /// A number the store renders integral, within `i64`.
    Integer(i64),
    /// Any other number.
    ///
    /// Store scalars are doubles on the wire.
    Float(f64),
    /// A boolean scalar.
    Bool(bool),
    /// An explicit null the entity carries.
    Null,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ScalarProperties(Vec<(BaseUrl, ScalarValue)>);

impl ScalarProperties {
    pub(crate) const EMPTY: Self = Self::empty();

    pub(crate) const fn empty() -> Self {
        Self(vec![])
    }

    pub(crate) const fn len(&self) -> usize {
        self.0.len()
    }

    pub(crate) fn new(
        value: serde_json::Value,
        label_property: Option<&BaseUrl>,
        maximum: usize,
    ) -> (Self, bool) {
        let serde_json::Value::Object(mut object) = value else {
            panic!("the store aggregates a JSON object")
        };
        object.sort_keys();

        let mut entries: Vec<_> = object.into_iter().filter_map(|(name, value)| {
            let name = match BaseUrl::new(name) {
                Ok(name) => name,
                Err(error) => {
                    tracing::warn!(
                        %error,
                        "expected the key to be well-formed according to semtype, and be a base URL"
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
                            "query returned too large a number"
                        );

                        return None;
                    }
                }
                serde_json::Value::Bool(bool) => ScalarValue::Bool(bool),
                serde_json::Value::Null => ScalarValue::Null,
                value @ (serde_json::Value::Object(_) | serde_json::Value::Array(_)) => {
                    tracing::warn!(
                        ?value,
                        "query should have returned only scalar values, but included a JSON object or \
                         array"
                    );

                    return None;
                }
            };

            Some((name, value))
        }).collect();

        if entries.len() <= maximum {
            return (Self(entries), false);
        }

        // `object.sort_keys` ensures the entries are in ascending order.
        if maximum > 0 {
            // reweigh the label property to the end of the truncated capacity
            if let Some(offset) = label_property.and_then(|label| {
                entries[maximum..]
                    .iter()
                    .position(|(name, _)| name == label)
            }) {
                entries.swap(maximum - 1, maximum + offset);
            }
        }

        entries.truncate(maximum);
        (Self(entries), true)
    }
}

impl IntoIterator for ScalarProperties {
    type IntoIter = vec::IntoIter<Self::Item>;
    type Item = (BaseUrl, ScalarValue);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}
