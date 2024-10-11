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
    boolean::BooleanTypeTag,
    error::ConstraintError,
    null::NullTypeTag,
    number::{NumberConstraints, NumberSchema, NumberTypeTag, NumberValidationError},
    object::ObjectTypeTag,
    string::{
        StringConstraints, StringFormat, StringFormatError, StringSchema, StringTypeTag,
        StringValidationError,
    },
};
use crate::schema::{
    ValueLabel,
    data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::{
            array::validate_array_value, boolean::validate_boolean_value,
            null::validate_null_value, number::validate_number_value,
            object::validate_object_value, string::validate_string_value,
        },
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
pub enum ValueConstraints {
    Typed(SingleValueConstraints),
    AnyOf(AnyOfConstraints),
}

impl ValueConstraints {
    /// Forwards the value validation to the appropriate schema.
    ///
    /// # Errors
    ///
    /// - For [`Typed`] schemas, see [`SingleValueConstraints::validate_value`].
    /// - For [`AnyOf`] schemas, see [`AnyOfConstraints::validate_value`].
    ///
    /// [`Typed`]: Self::Typed
    /// [`AnyOf`]: Self::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Typed(constraints) => constraints.validate_value(value),
            Self::AnyOf(constraints) => constraints.validate_value(value),
        }
    }

    /// Combines the current constraints with the provided one.
    ///
    /// If the constraints cannot be combined completely, the method will return the remaining
    /// constraints that could not be combined, otherwise `None`.
    ///
    /// # Errors
    ///
    /// If the constraints exclude each other, an error is returned.
    pub fn combine(
        &mut self,
        other: Self,
    ) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Typed(lhs), Self::Typed(rhs)) => lhs.combine(rhs)?.map(Self::Typed),
            (Self::AnyOf(_), Self::Typed(typed)) => Some(Self::Typed(typed)),
            (Self::Typed(_), Self::AnyOf(any_of)) => Some(Self::AnyOf(any_of)),
            (Self::AnyOf(_), Self::AnyOf(rhs)) => Some(Self::AnyOf(rhs)),
        })
    }

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SingleValueConstraints {
    Null,
    Boolean,
    Number(NumberSchema),
    String(StringSchema),
    Array(ArraySchema),
    Object,
}

impl SingleValueConstraints {
    /// Validates the provided value against the constraints.
    ///
    /// # Errors
    ///
    /// - [`InvalidType`] if the value does not match the expected type.
    /// - [`ValueConstraint`] if the value does not match the expected constraints.
    /// - [`AnyOf`] if the value does not match any of the expected schemas.
    ///
    /// [`InvalidType`]: ConstraintError::InvalidType
    /// [`ValueConstraint`]: ConstraintError::ValueConstraint
    /// [`AnyOf`]: ConstraintError::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Null => validate_null_value(value),
            Self::Boolean => validate_boolean_value(value),
            Self::Number(schema) => validate_number_value(value, schema),
            Self::String(schema) => validate_string_value(value, schema),
            Self::Array(array) => validate_array_value(value, array),
            Self::Object => validate_object_value(value),
        }
    }

    /// Combines the current constraints with the provided one.
    ///
    /// If the constraints cannot be combined completely, the method will return the remaining
    /// constraints that could not be combined, otherwise `None`.
    ///
    /// # Errors
    ///
    /// If the constraints exclude each other, an error is returned.
    pub fn combine(
        &mut self,
        other: Self,
    ) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Null, Self::Null)
            | (Self::Boolean, Self::Boolean)
            | (Self::Object, Self::Object) => None,
            (Self::Number(lhs), Self::Number(rhs)) => lhs.combine(rhs)?.map(Self::Number),
            (Self::String(lhs), Self::String(rhs)) => lhs.combine(rhs)?.map(Self::String),
            (Self::Array(lhs), Self::Array(rhs)) => lhs.combine(rhs)?.map(Self::Array),
            _ => bail!(ResolveClosedDataTypeError::IntersectedDifferentTypes),
        })
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

    use error_stack::{Frame, Report};
    use serde_json::Value as JsonValue;

    use crate::schema::data_type::{
        closed::ResolveClosedDataTypeError, constraint::ValueConstraints,
    };

    pub(crate) fn read_schema(schema: &JsonValue) -> ValueConstraints {
        let parsed = serde_json::from_value(schema.clone()).expect("Failed to parse schema");
        assert_eq!(
            serde_json::to_value(&parsed).expect("Could not serialize schema"),
            *schema
        );
        parsed
    }

    pub(crate) fn check_constraints(schema: &ValueConstraints, value: &JsonValue) {
        schema
            .validate_value(value)
            .expect("Failed to validate value");
    }

    pub(crate) fn check_constraints_error<E: Display + Send + Sync + 'static>(
        schema: &ValueConstraints,
        value: &JsonValue,
        expected_errors: impl IntoIterator<Item = E>,
    ) {
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

    pub(crate) fn intersect_schemas(
        schemas: impl IntoIterator<Item = JsonValue>,
    ) -> Result<Vec<JsonValue>, Report<ResolveClosedDataTypeError>> {
        let schemas = schemas
            .into_iter()
            .map(|schema| serde_json::from_value(schema).expect("Failed to parse schema"))
            .collect::<Vec<_>>();
        ValueConstraints::fold_intersections(schemas).map(|schemas| {
            schemas
                .into_iter()
                .map(|schema| serde_json::to_value(schema).expect("Failed to serialize schema"))
                .collect()
        })
    }

    pub(crate) fn check_schema_intersection(
        schemas: impl IntoIterator<Item = JsonValue>,
        expected: impl IntoIterator<Item = JsonValue>,
    ) {
        let intersection = intersect_schemas(schemas).expect("Failed to intersect schemas");
        assert_eq!(intersection, expected.into_iter().collect::<Vec<_>>());
    }

    pub(crate) fn check_schema_intersection_error<E: Display + Send + Sync + 'static>(
        schemas: impl IntoIterator<Item = JsonValue>,
        expected_errors: impl IntoIterator<Item = E>,
    ) {
        let err = intersect_schemas(schemas).expect_err("Intersected invalid schemas");
        println!("{:?}", err);
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
