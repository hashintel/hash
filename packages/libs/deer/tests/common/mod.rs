use std::iter::zip;

use serde_json::{to_value, Value};

#[derive(Debug, serde::Serialize)]
pub struct Error {
    namespace: &'static str,
    id: &'static [&'static str],
    properties: Value,
}

impl Error {
    pub fn new(namespace: &'static str, id: &'static [&'static str], properties: Value) -> Self {
        Self {
            namespace,
            id,
            properties,
        }
    }
}

impl From<(&'static str, &'static [&'static str], Value)> for Error {
    fn from((namespace, id, properties): (&'static str, &'static [&'static str], Value)) -> Self {
        Self {
            namespace,
            id,
            properties,
        }
    }
}

impl PartialEq<Value> for Error {
    fn eq(&self, other: &Value) -> bool {
        match other {
            Value::Object(other) => {
                let namespace = other
                    .get("namespace")
                    .map_or(false, |other| other == self.namespace);
                let id = other.get("id").map_or(false, |other| {
                    other == &to_value(self.id).expect("should be valid JSON")
                });
                let properties = other
                    .get("properties")
                    .map_or(false, |other| other == &self.properties);

                // we do not check if we contain all keys, because the previous statements will
                // evaluate to false if that is the case
                other.len() == 4 && other.contains_key("message") && namespace && id && properties
            }
            _ => false,
        }
    }
}

impl PartialEq<Error> for Value {
    fn eq(&self, other: &Error) -> bool {
        other.eq(self)
    }
}

#[derive(Debug, serde::Serialize)]
pub struct Errors(Vec<Error>);

impl Errors {
    pub fn new<T: Into<Error>>(errors: impl IntoIterator<Item = T>) -> Self {
        Self(errors.into_iter().map(Into::into).collect())
    }
}

impl PartialEq<Value> for Errors {
    fn eq(&self, other: &Value) -> bool {
        match other {
            Value::Array(other) => {
                other.len() == self.0.len() && zip(other, &self.0).all(|(a, b)| a == b)
            }
            _ => false,
        }
    }
}

impl PartialEq<Errors> for Value {
    fn eq(&self, other: &Errors) -> bool {
        other.eq(self)
    }
}

#[macro_export]
macro_rules! error {
    ([$($tt:tt),*]) => {
        common::Errors::new([$(error!(@internal $tt)),*])
    };
    {
        ns: $namespace:literal,
        id: [$($id:literal),*],
        properties: $($properties:tt)*
    } => {
        error!([{ns: $namespace, id: [$($id),*], properties: $($properties)*}])
    };
    (@internal {
        ns: $namespace:literal,
        id: [$($id:literal),*],
        properties: $($properties:tt)*
    }) => {
        common::Error::new($namespace, &[$($id),*], json!($($properties)*))
    }
}
