#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::string::String;
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use crate::{
    error::{ErrorProperties, ErrorProperty, Id, Location, NAMESPACE, Namespace, Variant},
    id,
};

pub struct DuplicateField(&'static str);

impl DuplicateField {
    #[must_use]
    pub const fn new(name: &'static str) -> Self {
        Self(name)
    }
}

impl ErrorProperty for DuplicateField {
    type Value<'a>
        = Option<&'static str>
    where
        Self: 'a;

    fn key() -> &'static str {
        "field"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next().map(|field| field.0)
    }
}

#[derive(Debug)]
pub struct DuplicateFieldError;

impl Variant for DuplicateFieldError {
    type Properties = (Location, DuplicateField);

    const ID: Id = id!["duplicate", "field"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        let (_, field) = properties;

        if let Some(field) = field {
            write!(fmt, "duplicate field `{field}`")
        } else {
            Display::fmt(self, fmt)
        }
    }
}

impl Display for DuplicateFieldError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("duplicate field")
    }
}

pub struct DuplicateKey(String);

impl DuplicateKey {
    pub fn new(key: impl Into<String>) -> Self {
        Self(key.into())
    }
}

impl ErrorProperty for DuplicateKey {
    type Value<'a>
        = Option<&'a str>
    where
        Self: 'a;

    fn key() -> &'static str {
        "key"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next().map(|key| key.0.as_str())
    }
}

#[derive(Debug)]
pub struct DuplicateKeyError;

impl Variant for DuplicateKeyError {
    type Properties = (Location, DuplicateKey);

    const ID: Id = id!["duplicate", "key"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        let (_, key) = properties;

        if let Some(key) = key {
            write!(fmt, "duplicate key `{key}`")
        } else {
            Display::fmt(self, fmt)
        }
    }
}

impl Display for DuplicateKeyError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("duplicate key")
    }
}

// TODO: unit test
