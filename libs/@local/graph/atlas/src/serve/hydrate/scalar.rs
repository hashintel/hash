use alloc::vec;

use type_system::ontology::id::BaseUrl;

/// One scalar property value.
///
/// A hydrated property value takes no other shape. The store filters out nested objects and
/// arrays. They never cross the connection.
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

    /// Converts a property object to at most `maximum` scalar entries.
    ///
    /// Returns the entries and whether the cap truncated them. Conversion skips invalid property
    /// URLs, nested values and unrepresentable numbers before applying the cap. A nonzero cap
    /// preserves `label_property` if it has a scalar entry, selecting the remaining entries in key
    /// order.
    ///
    /// # Panics
    ///
    /// Panics if `value` is not a JSON object.
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
                        tracing::warn!("query returned too large a number");

                        return None;
                    }
                }
                serde_json::Value::Bool(bool) => ScalarValue::Bool(bool),
                serde_json::Value::Null => ScalarValue::Null,
                serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                    tracing::warn!(
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

#[cfg(test)]
mod tests {
    use alloc::{collections::BTreeMap, sync::Arc};
    use core::fmt;
    use std::sync::Mutex;

    use tracing::{
        Event, Level, Subscriber,
        field::{Field, Visit},
    };
    use tracing_subscriber::{
        Layer, Registry,
        layer::{Context, SubscriberExt as _},
    };
    use type_system::ontology::id::BaseUrl;

    use super::{ScalarProperties, ScalarValue};

    #[derive(Default)]
    struct Fields(BTreeMap<String, String>);

    impl Visit for Fields {
        fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
            self.0.insert(field.name().to_owned(), format!("{value:?}"));
        }
    }

    struct Warnings(Arc<Mutex<Vec<Fields>>>);

    impl<S: Subscriber> Layer<S> for Warnings {
        fn on_event(&self, event: &Event<'_>, _: Context<'_, S>) {
            assert_eq!(*event.metadata().level(), Level::WARN);
            let mut fields = Fields::default();
            event.record(&mut fields);
            self.0
                .lock()
                .expect("should lock the warning list")
                .push(fields);
        }
    }

    /// Skips nested values with warnings that omit their contents and property names.
    #[test]
    fn values_nested() {
        let warnings = Arc::new(Mutex::new(Vec::new()));
        let subscriber = Registry::default().with(Warnings(Arc::clone(&warnings)));
        let input = serde_json::json!({
            "https://example.com/private-object-key/": {"private-field": "private-object-value"},
            "https://example.com/private-array-key/": ["private-array-value"],
            "https://example.com/scalar/": "retained-scalar-value",
        });
        let (properties, truncated) = tracing::subscriber::with_default(subscriber, || {
            ScalarProperties::new(input, None, 10)
        });

        assert!(!truncated);
        assert_eq!(
            properties.into_iter().collect::<Vec<_>>(),
            [(
                BaseUrl::new("https://example.com/scalar/".to_owned())
                    .expect("should parse the scalar key"),
                ScalarValue::String("retained-scalar-value".to_owned())
            )]
        );

        let warnings = warnings.lock().expect("should lock the warning list");
        assert_eq!(warnings.len(), 2, "should warn for both nested values");
        for fields in warnings.iter() {
            assert_eq!(
                fields.0,
                BTreeMap::from([(
                    "message".to_owned(),
                    "query should have returned only scalar values, but included a JSON object or \
                     array"
                        .to_owned()
                )]),
                "should record only the fixed diagnostic, without a property key or value"
            );
        }
    }
}
