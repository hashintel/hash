mod any_of;
mod array;
mod boolean;
mod error;
mod null;
mod number;
mod object;
mod string;

use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

pub use self::{
    any_of::AnyOfConstraints,
    array::{ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError, TupleConstraints},
    boolean::{BooleanSchema, BooleanTypeTag},
    error::ConstraintError,
    null::{NullSchema, NullTypeTag},
    number::{NumberConstraints, NumberSchema, NumberTypeTag, NumberValidationError},
    object::{ObjectConstraints, ObjectSchema, ObjectTypeTag, ObjectValidationError},
    string::{
        StringConstraints, StringFormat, StringFormatError, StringSchema, StringTypeTag,
        StringValidationError,
    },
};
use crate::schema::{ValueLabel, data_type::closed::ResolveClosedDataTypeError};

pub trait Constraint: Sized {
    /// Combines the current constraints with the provided one.
    ///
    /// If the constraints cannot be combined completely, the method will return the remaining
    /// constraints that could not be combined, otherwise `None`.
    ///
    /// # Errors
    ///
    /// If the constraints exclude each other, an error is returned.
    fn combine(&mut self, other: Self) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>>;
}

pub trait ConstraintValidator<V: ?Sized>: Constraint {
    type Error: ?Sized;

    /// Checks if the provided value is valid against this constraint.
    ///
    /// In comparison to [`validate_value`], this method does not return the specific error that
    /// occurred, but only if the value is valid or not. This can be used to check if a value is
    /// valid without needing to handle the specific error. This method is faster than
    /// [`validate_value`] as it does not need to construct a [`Report`].
    ///
    /// [`validate_value`]: Self::validate_value
    #[must_use]
    fn is_valid(&self, value: &V) -> bool;

    /// Validates the provided value against this schema.
    ///
    /// If you only need to check if a value is valid without needing to handle the specific error,
    /// you should use [`is_valid`] instead.
    ///
    /// [`is_valid`]: Self::is_valid
    ///
    /// # Errors
    ///
    /// Returns an error if the value is not valid against the schema.
    fn validate_value(&self, value: &V) -> Result<(), Report<Self::Error>>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
pub enum ValueConstraints {
    Typed(SingleValueConstraints),
    AnyOf(AnyOfConstraints),
}

impl ValueConstraints {
    pub fn fold_intersections(
        schemas: impl IntoIterator<Item = Self>,
    ) -> Result<Vec<Self>, Report<ResolveClosedDataTypeError>> {
        schemas
            .into_iter()
            .try_fold(vec![], |mut acc, constraints| {
                if acc.is_empty() {
                    acc.push(constraints);
                    return Ok(acc);
                }

                let mut remainder = Some(constraints);
                for current in &mut acc {
                    let Some(new) = remainder.take() else { break };
                    remainder = current.combine(new)?;
                }
                if let Some(remainder) = remainder {
                    acc.push(remainder);
                }
                Ok::<_, Report<ResolveClosedDataTypeError>>(acc)
            })
    }
}

impl Constraint for ValueConstraints {
    fn combine(&mut self, other: Self) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Typed(lhs), Self::Typed(rhs)) => lhs.combine(rhs)?.map(Self::Typed),
            (Self::AnyOf(_), Self::Typed(typed)) => {
                // TODO: Implement folding for anyOf constraints
                //   see https://linear.app/hash/issue/H-3430/implement-folding-for-anyof-constraints
                Some(Self::Typed(typed))
            }
            (Self::Typed(_), Self::AnyOf(any_of)) => {
                // TODO: Implement folding for anyOf constraints
                //   see https://linear.app/hash/issue/H-3430/implement-folding-for-anyof-constraints
                Some(Self::AnyOf(any_of))
            }
            (Self::AnyOf(lhs), Self::AnyOf(rhs)) => lhs.combine(rhs)?.map(Self::AnyOf),
        })
    }
}

impl ConstraintValidator<JsonValue> for ValueConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        match self {
            Self::Typed(constraints) => constraints.is_valid(value),
            Self::AnyOf(constraints) => constraints.is_valid(value),
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Typed(constraints) => constraints.validate_value(value),
            Self::AnyOf(constraints) => constraints.validate_value(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SingleValueConstraints {
    Null(NullSchema),
    Boolean(BooleanSchema),
    Number(NumberSchema),
    String(StringSchema),
    Array(ArraySchema),
    Object(ObjectSchema),
}

impl Constraint for SingleValueConstraints {
    fn combine(&mut self, other: Self) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Null(lhs), Self::Null(rhs)) => lhs.combine(rhs)?.map(Self::Null),
            (Self::Boolean(lhs), Self::Boolean(rhs)) => lhs.combine(rhs)?.map(Self::Boolean),
            (Self::Number(lhs), Self::Number(rhs)) => lhs.combine(rhs)?.map(Self::Number),
            (Self::String(lhs), Self::String(rhs)) => lhs.combine(rhs)?.map(Self::String),
            (Self::Array(lhs), Self::Array(rhs)) => lhs.combine(rhs)?.map(Self::Array),
            (Self::Object(lhs), Self::Object(rhs)) => lhs.combine(rhs)?.map(Self::Object),
            _ => bail!(ResolveClosedDataTypeError::IntersectedDifferentTypes),
        })
    }
}

impl ConstraintValidator<JsonValue> for SingleValueConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        match self {
            Self::Null(schema) => schema.is_valid(value),
            Self::Boolean(schema) => schema.is_valid(value),
            Self::Number(schema) => schema.is_valid(value),
            Self::String(schema) => schema.is_valid(value),
            Self::Array(schema) => schema.is_valid(value),
            Self::Object(schema) => schema.is_valid(value),
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Null(schema) => schema.validate_value(value),
            Self::Boolean(schema) => schema.validate_value(value),
            Self::Number(schema) => schema.validate_value(value),
            Self::String(schema) => schema.validate_value(value),
            Self::Array(schema) => schema.validate_value(value),
            Self::Object(schema) => schema.validate_value(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleValueSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
    #[serde(flatten)]
    pub constraints: SingleValueConstraints,
}

#[cfg(target_arch = "wasm32")]
#[expect(
    dead_code,
    reason = "Used to export type to TypeScript to prevent Tsify generating interfaces"
)]
mod wasm {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    enum SingleValueSchema {
        Schema {
            #[serde(default, skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(default)]
            label: ValueLabel,
            #[serde(flatten)]
            constraints: SingleValueConstraints,
        },
    }
}

#[cfg(test)]
mod tests {
    use core::fmt::Display;
    use std::collections::HashSet;

    use error_stack::Frame;
    use serde_json::Value as JsonValue;

    use crate::schema::data_type::constraint::{ConstraintValidator, ValueConstraints};

    pub(crate) fn read_schema(schema: &JsonValue) -> ValueConstraints {
        let parsed = serde_json::from_value(schema.clone()).expect("Failed to parse schema");
        assert_eq!(
            serde_json::to_value(&parsed).expect("Could not serialize schema"),
            *schema
        );
        parsed
    }

    pub(crate) fn check_constraints(schema: &ValueConstraints, value: &JsonValue) {
        assert!(schema.is_valid(value));
        schema
            .validate_value(value)
            .expect("Failed to validate value");
    }

    pub(crate) fn check_constraints_error<E: Display + Send + Sync + 'static>(
        schema: &ValueConstraints,
        value: &JsonValue,
        expected_errors: impl IntoIterator<Item = E>,
    ) {
        assert!(!schema.is_valid(value));
        let err = schema
            .validate_value(value)
            .expect_err("Expected validation error");
        let errors = expected_errors
            .into_iter()
            .map(|error| error.to_string())
            .collect::<HashSet<_>>();
        let actual_errors = err
            .frames()
            .filter_map(Frame::downcast_ref::<E>)
            .map(ToString::to_string)
            .collect::<HashSet<_>>();

        assert_eq!(errors, actual_errors);
    }
}
