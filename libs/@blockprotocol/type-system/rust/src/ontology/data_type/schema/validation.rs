use core::str::FromStr as _;
use std::{collections::HashSet, sync::LazyLock};

use thiserror::Error;

use super::{ClosedDataType, DataType, DataTypeReference};
use crate::{Valid, Validator, ontology::VersionedUrl};

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

    /// Only primitive data types can inherit from the `value` data type.
    ///
    /// The primitive data types are: null, boolean, number, text, list, and object.
    /// Custom data types should inherit from one of these primitives, not directly from `value`.
    #[error("Only primitive data types can inherit from the value data type")]
    NonPrimitiveValueInheritance,
}

/// Validator for data type definitions.
///
/// The [`DataTypeValidator`] ensures data types conform to the Block Protocol specification by:
///
/// 1. Verifying proper inheritance - all data types (except the base 'value' type) must have at
///    least one parent type specified in `allOf`
/// 2. Enforcing inheritance rules - only primitive data types can inherit directly from the 'value'
///    data type
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
static VALUE_DATA_TYPE_ID: LazyLock<DataTypeReference> = LazyLock::new(|| DataTypeReference {
    url: VersionedUrl::from_str(
        "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
    )
    .expect("should contain a valid URL"),
});

/// Set of primitive data type IDs in the Block Protocol.
///
/// These are the fundamental data types that can directly inherit from the value data type.
/// All custom data types should inherit from one of these primitive types.
static PRIMITIVE_DATA_TYPE_IDS: LazyLock<HashSet<VersionedUrl>> = LazyLock::new(|| {
    HashSet::from([
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1")
            .expect("should contain a valid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
        )
        .expect("should contain a valid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        )
        .expect("should contain a valid URL"),
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1")
            .expect("should contain a valid URL"),
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1")
            .expect("should contain a valid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        )
        .expect("should contain a valid URL"),
    ])
});

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;

    /// Validates a data type definition against Block Protocol rules.
    ///
    /// # Errors
    ///
    /// - [`ValidateDataTypeError::MissingParent`] if the data type doesn't inherit from any parent
    ///   (unless it's the base value data type)
    /// - [`ValidateDataTypeError::NonPrimitiveValueInheritance`] if a non-primitive data type
    ///   directly inherits from the value data type
    fn validate_ref<'v>(&self, value: &'v DataType) -> Result<&'v Valid<DataType>, Self::Error> {
        if value.all_of.is_empty() && value.id != VALUE_DATA_TYPE_ID.url {
            Err(ValidateDataTypeError::MissingParent)
        } else if value.all_of.contains(&*VALUE_DATA_TYPE_ID)
            && !PRIMITIVE_DATA_TYPE_IDS.contains(&value.id)
        {
            Err(ValidateDataTypeError::NonPrimitiveValueInheritance)
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
