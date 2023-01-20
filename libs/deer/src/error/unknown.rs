use alloc::{string::String, vec::Vec};
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    fmt_fold_fields, ErrorProperties, ErrorProperty, Id, Location, Namespace, Variant, NAMESPACE,
};
use crate::id;

#[derive(serde::Serialize)]
pub struct ExpectedField(&'static str);

impl ExpectedField {
    #[must_use]
    pub const fn new(field: &'static str) -> Self {
        Self(field)
    }
}

impl ErrorProperty for ExpectedField {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        let mut stack: Vec<_> = stack.collect();
        stack.reverse();
        stack
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedField(String);

impl ReceivedField {
    #[must_use]
    pub fn new(field: impl Into<String>) -> Self {
        Self(field.into())
    }
}

impl ErrorProperty for ReceivedField {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        let mut stack: Vec<_> = stack.collect();
        stack.reverse();
        stack
    }
}

#[derive(Debug)]
pub struct UnknownFieldError;

impl Variant for UnknownFieldError {
    type Properties = (Location, ExpectedField, ReceivedField);

    const ID: Id = id!["unknown", "field"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        // expected fields "field1", "...", but received fields "field1", "..."
        let (_, expected, received) = properties;

        let has_expected = !expected.is_empty();
        let has_received = !received.is_empty();

        let expected = expected.iter().map(|ExpectedField(inner)| *inner);
        let received = received.iter().map(|ReceivedField(inner)| inner.as_str());

        if has_expected {
            fmt.write_str("expected fields ")?;
            fmt_fold_fields(fmt, expected)?;
        }

        if has_received && has_expected {
            fmt.write_str(", but ")?;
        }

        if has_received {
            fmt.write_str("received fields ")?;
            fmt_fold_fields(fmt, received)?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for UnknownFieldError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received unknown fields")
    }
}

#[derive(serde::Serialize)]
pub struct ExpectedVariant(&'static str);

impl ExpectedVariant {
    #[must_use]
    pub const fn new(variant: &'static str) -> Self {
        Self(variant)
    }
}

impl ErrorProperty for ExpectedVariant {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        let mut stack: Vec<_> = stack.collect();
        stack.reverse();
        stack
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedVariant(String);

impl ReceivedVariant {
    #[must_use]
    pub fn new(variant: impl Into<String>) -> Self {
        Self(variant.into())
    }
}

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

impl Variant for UnknownVariantError {
    type Properties = (Location, ExpectedVariant, ReceivedVariant);

    const ID: Id = id!["unknown", "value"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        // expected enum variants "{expected}, but received unknown enum variant "{received}"",
        let (_, expected, received) = properties;

        let has_received = received.is_some();
        let has_expected = !expected.is_empty();

        if has_expected {
            fmt.write_str("expected enum variants ")?;
            fmt_fold_fields(fmt, expected.iter().map(|ExpectedVariant(inner)| *inner))?;
        }

        if has_received && has_expected {
            fmt.write_str(", but ")?;
        }

        if let Some(ReceivedVariant(received)) = received {
            fmt.write_fmt(format_args!(
                r#"received unknown enum variant "{received}""#
            ))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for UnknownVariantError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received unknown enum variant")
    }
}

#[cfg(test)]
mod tests {
    use alloc::vec;

    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::test::{to_json, to_message};

    #[test]
    fn field() {
        // we try to parse:
        // [_, _, {field1: _, field2: _ <- here, field3: _, field4: _ <- here}] into:
        // struct Example { field1: _, field3: _ }

        let report = Report::new(UnknownFieldError.into_error())
            .attach(Location::Array(2))
            .attach(ExpectedField::new("field1"))
            .attach(ExpectedField::new("field3"))
            .attach(ReceivedField::new("field1"))
            .attach(ReceivedField::new("field2"))
            .attach(ReceivedField::new("field3"))
            .attach(ReceivedField::new("field4"));

        assert_eq!(
            to_json::<UnknownFieldError>(&report),
            json!({
                "location": [
                    {"type": "array", "value": 2}
                ],
                "expected": ["field1", "field3"],
                "received": ["field1", "field2", "field3", "field4"]
            })
        );
    }

    #[test]
    fn field_message() {
        assert_eq!(
            to_message::<UnknownFieldError>(&Report::new(UnknownFieldError.into_error())),
            "received unknown fields"
        );

        assert_eq!(
            to_message::<UnknownFieldError>(
                &Report::new(UnknownFieldError.into_error())
                    .attach(ExpectedField::new("field1"))
                    .attach(ExpectedField::new("field2"))
                    .attach(ExpectedField::new("field3"))
            ),
            r#"expected fields "field1", "field2", "field3""#
        );

        assert_eq!(
            to_message::<UnknownFieldError>(
                &Report::new(UnknownFieldError.into_error())
                    .attach(ReceivedField::new("field1"))
                    .attach(ReceivedField::new("field2"))
                    .attach(ReceivedField::new("field3"))
            ),
            r#"received fields "field1", "field2", "field3""#
        );

        assert_eq!(
            to_message::<UnknownFieldError>(
                &Report::new(UnknownFieldError.into_error())
                    .attach(ExpectedField::new("field1"))
                    .attach(ExpectedField::new("field2"))
                    .attach(ExpectedField::new("field3"))
                    .attach(ReceivedField::new("field1"))
                    .attach(ReceivedField::new("field2"))
                    .attach(ReceivedField::new("field3"))
                    .attach(ReceivedField::new("field4"))
            ),
            r#"expected fields "field1", "field2", "field3", but received fields "field1", "field2", "field3", "field4""#
        );
    }

    #[test]
    fn variant() {
        // we try to parse:
        // [{"C": {...}}, ...]
        // into enum { A: {}, B: {} }

        let error = Report::new(UnknownVariantError.into_error())
            .attach(Location::Array(0))
            .attach(ExpectedVariant::new("A"))
            .attach(ExpectedVariant::new("B"))
            .attach(ReceivedVariant::new("C"));

        assert_eq!(
            to_json::<UnknownVariantError>(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0}
                ],
                "expected": ["A", "B"],
                "received": "C"
            })
        );
    }

    #[test]
    fn variant_message() {
        assert_eq!(
            to_message::<UnknownVariantError>(&Report::new(UnknownVariantError.into_error())),
            "received unknown enum variant"
        );

        assert_eq!(
            to_message::<UnknownVariantError>(
                &Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("A"))
                    .attach(ExpectedVariant::new("B"))
            ),
            r#"expected enum variants "A", "B""#
        );

        assert_eq!(
            to_message::<UnknownVariantError>(
                &Report::new(UnknownVariantError.into_error()).attach(ReceivedVariant::new("C"))
            ),
            r#"received unknown enum variant "C""#
        );

        assert_eq!(
            to_message::<UnknownVariantError>(
                &Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("A"))
                    .attach(ExpectedVariant::new("B"))
                    .attach(ReceivedVariant::new("C"))
            ),
            r#"expected enum variants "A", "B", but received unknown enum variant "C""#
        );
    }
}
