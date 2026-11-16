use core::str::FromStr as _;
use std::sync::LazyLock;

use thiserror::Error;

use super::{ClosedDataType, DataType, DataTypeReference};
use crate::{
    Valid, Validator,
    ontology::{VersionedUrl, json_schema::ValueConstraints},
};

/// Errors that can occur when validating a [`DataType`].
///
/// These errors specifically relate to the structure and inheritance rules of data types
/// in the Block Protocol type system.
#[derive(Debug, Error)]
pub enum ValidateDataTypeError {
    /// A data type must inherit from at least one parent type.
    ///
    /// Every data type (except the base `value` type) must have at least one parent specified
    /// in the `allOf` array.
    #[error("A data type requires a parent specified in `allOf`")]
    MissingParent,

    /// A concrete data type must state its `type`.
    ///
    /// Only an abstract data type can allow values of more than one type through `anyOf`.
    #[error("A concrete data type requires a `type`")]
    MissingType,
}

/// Validator for data type definitions.
///
/// The [`DataTypeValidator`] ensures data types conform to the Block Protocol specification by:
///
/// 1. Verifying proper inheritance - all data types (except the base 'value' type) must have at
///    least one parent type specified in `allOf`
/// 2. Requiring a `type` - every concrete data type (except the base 'value' type) must state its
///    `type`
///
/// # Examples
///
/// ```
/// use serde_json::json;
/// use type_system::{
///     ontology::data_type::schema::{DataType, DataTypeValidator},
///     Valid, Validator
/// };
///
/// // Create a validator
/// let validator = DataTypeValidator;
///
/// // Define a number data type
/// let number_type = serde_json::from_value::<DataType>(json!({
///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
///     "kind": "dataType",
///     "type": "number",
///     "$id": "https://example.com/types/data-type/positive-number/v/1",
///     "title": "Positive Number",
///     "description": "A number greater than zero",
///     "exclusiveMinimum": 0,
///     "allOf": [
///         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
///     ]
/// })).expect("Failed to parse data type");
///
/// // Validate the data type
/// let valid_number_type: Valid<DataType> = validator.validate(number_type)
///     .expect("Data type should be valid");
///
/// // Access the validated data type
/// assert_eq!(valid_number_type.title, "Positive Number");
/// ```
#[derive(Debug)]
pub struct DataTypeValidator;

/// Reference to the base value data type in the Block Protocol.
///
/// This is the root data type from which all other data types inherit.
pub(crate) static VALUE_DATA_TYPE_ID: LazyLock<DataTypeReference> =
    LazyLock::new(|| DataTypeReference {
        url: VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
        )
        .expect("should contain a valid URL"),
    });

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;

    /// Validates a data type definition against Block Protocol rules.
    ///
    /// # Errors
    ///
    /// - [`ValidateDataTypeError::MissingParent`] if the data type doesn't inherit from any parent
    ///   (unless it's the base value data type)
    /// - [`ValidateDataTypeError::MissingType`] if a concrete data type does not state its `type`
    ///   (unless it's the base value data type)
    fn validate_ref<'v>(&self, value: &'v DataType) -> Result<&'v Valid<DataType>, Self::Error> {
        let is_value = value.id == VALUE_DATA_TYPE_ID.url;

        if value.all_of.is_empty() && !is_value {
            Err(ValidateDataTypeError::MissingParent)
        } else if !value.r#abstract
            && !is_value
            && matches!(value.constraints, ValueConstraints::AnyOf(_))
        {
            Err(ValidateDataTypeError::MissingType)
        } else {
            // Unsatisfiable constraints will automatically be checked when attempting to close the
            // schema so it's not needed to check constraints here.
            Ok(Valid::new_ref_unchecked(value))
        }
    }
}

impl Validator<ClosedDataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;

    fn validate_ref<'v>(
        &self,
        value: &'v ClosedDataType,
    ) -> Result<&'v Valid<ClosedDataType>, Self::Error> {
        // Closed data types are validated on creation during the resolution process
        Ok(Valid::new_ref_unchecked(value))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{DataType, DataTypeValidator, ValidateDataTypeError};
    use crate::utils::tests::{JsonEqualityCheck, ensure_failed_validation};

    #[tokio::test]
    async fn concrete_any_of() {
        assert!(matches!(
            ensure_failed_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://example.com/data-type/web-color/v/1",
                  "title": "Web Color",
                  "description": "A color as used on the web.",
                  "allOf": [{ "$ref": "https://example.com/data-type/color/v/1" }],
                  "abstract": false,
                  "anyOf": [
                    { "type": "array" },
                    { "type": "string" },
                  ],
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            ValidateDataTypeError::MissingType
        ));
    }
}
