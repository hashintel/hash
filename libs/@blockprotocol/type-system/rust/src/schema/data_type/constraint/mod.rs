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
    /// It returns the combination of the two constraints. If they can fully be merged, the second
    /// value is returned as `None`. If the constraints exclude each other, an error is returned.
    ///
    /// # Errors
    ///
    /// If the constraints exclude each other, an error is returned.
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>>;
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
    /// Folds multiple constraints into fewer constraints.
    ///
    /// This function attempts to combine as many constraints as possible. If two constraints
    /// cannot be fully merged, they are kept separate.
    ///
    /// The algorithm works as follows:
    /// - It iterates over all constraints
    /// - for each constraint, it tries to merge them with the constraints that have already been
    ///   merged from the previous iterations from left to right
    /// - if a constraint cannot be fully merged, it is either combined with the next constraint or
    ///   added to the list of constraints that have already been merged.
    ///
    /// # Errors
    ///
    /// If two constraints exclude each other, an error is returned.
    pub fn fold_intersections(
        schemas: impl IntoIterator<Item = Self>,
    ) -> Result<Vec<Self>, Report<ResolveClosedDataTypeError>> {
        schemas
            .into_iter()
            .map(Some)
            .try_fold(Vec::<Self>::new(), |mut folded, mut constraints| {
                folded = folded
                    .into_iter()
                    .map(|existing| {
                        if let Some(to_combine) = constraints.take() {
                            let (combined, remainder) = existing.intersection(to_combine)?;
                            // The remainder is used for the next iteration
                            constraints = remainder;
                            Ok::<_, Report<_>>(combined)
                        } else {
                            Ok(existing)
                        }
                    })
                    .collect::<Result<Vec<_>, _>>()?;

                if let Some(remainder) = constraints {
                    folded.push(remainder);
                }

                Ok(folded)
            })
    }
}

impl Constraint for ValueConstraints {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        match (self, other) {
            (Self::Typed(lhs), Self::Typed(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Typed(lhs), rhs.map(Self::Typed))),
            (Self::AnyOf(lhs), Self::Typed(rhs)) => {
                // TODO: Implement folding for anyOf constraints
                //   see https://linear.app/hash/issue/H-3430/implement-folding-for-anyof-constraints
                Ok((Self::AnyOf(lhs), Some(Self::Typed(rhs))))
            }
            (Self::Typed(lhs), Self::AnyOf(rhs)) => {
                // TODO: Implement folding for anyOf constraints
                //   see https://linear.app/hash/issue/H-3430/implement-folding-for-anyof-constraints
                Ok((Self::Typed(lhs), Some(Self::AnyOf(rhs))))
            }
            (Self::AnyOf(lhs), Self::AnyOf(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::AnyOf(lhs), rhs.map(Self::AnyOf))),
        }
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
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        match (self, other) {
            (Self::Null(lhs), Self::Null(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Null(lhs), rhs.map(Self::Null))),
            (Self::Boolean(lhs), Self::Boolean(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Boolean(lhs), rhs.map(Self::Boolean))),
            (Self::Number(lhs), Self::Number(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Number(lhs), rhs.map(Self::Number))),
            (Self::String(lhs), Self::String(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::String(lhs), rhs.map(Self::String))),
            (Self::Array(lhs), Self::Array(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Array(lhs), rhs.map(Self::Array))),
            (Self::Object(lhs), Self::Object(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Object(lhs), rhs.map(Self::Object))),
            _ => bail!(ResolveClosedDataTypeError::IntersectedDifferentTypes),
        }
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
