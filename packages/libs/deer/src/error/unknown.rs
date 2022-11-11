use alloc::{string::String, vec::Vec};
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    fold_field, macros::impl_error, Error, ErrorProperties, ErrorProperty, Id, Location, Namespace,
    NAMESPACE,
};
use crate::id;

#[derive(serde::Serialize)]
pub struct ExpectedField(&'static str);

impl ErrorProperty for ExpectedField {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.collect()
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedField(String);

impl ErrorProperty for ReceivedField {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.collect()
    }
}

#[derive(Debug)]
pub struct UnknownFieldError;

impl Error for UnknownFieldError {
    type Properties = (Location, ExpectedField, ReceivedField);

    const ID: Id = id!["unknown", "field"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        let (_, expected, received) = properties;

        let has_expected = !expected.is_empty();
        let has_received = !received.is_empty();

        let expected = expected.iter().map(|ExpectedField(inner)| *inner);
        let received = received.iter().map(|ReceivedField(inner)| inner.as_str());

        if has_received {
            let received = fold_field(received);

            fmt.write_fmt(format_args!("received extra fields ({received})"))?;
        }

        if has_received && has_expected {
            fmt.write_str(", ")?;
        }

        if has_expected {
            let expected = fold_field(expected);

            fmt.write_fmt(format_args!("only expected {expected}"))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for UnknownFieldError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("extra unknown fields have been received")
    }
}

impl_error!(UnknownFieldError);

#[derive(serde::Serialize)]
pub struct ExpectedVariant(&'static str);

impl ErrorProperty for ExpectedVariant {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.collect()
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedVariant(String);

impl ErrorProperty for ReceivedVariant {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(Debug)]
pub struct UnknownVariantError;

impl Error for UnknownVariantError {
    type Properties = (Location, ExpectedVariant, ReceivedVariant);

    const ID: Id = id!["unknown", "value"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        // received unknown enum variant "{received}", expected enum variants "{expected}",
        let (_, expected, received) = properties;

        let has_received = received.is_some();
        let has_expected = !expected.is_empty();

        if let Some(ReceivedVariant(received)) = received {
            fmt.write_fmt(format_args!(
                r#"received unknown enum variant "{received}""#
            ))?;
        }

        if has_received && has_expected {
            fmt.write_str(", ")?;
        }

        if has_expected {
            let expected = fold_field(expected.iter().map(|ExpectedVariant(inner)| *inner));

            fmt.write_fmt(format_args!("expected enum variants {expected}"))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for UnknownVariantError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("tried to decode unknown enum variant")
    }
}

impl_error!(UnknownVariantError);
