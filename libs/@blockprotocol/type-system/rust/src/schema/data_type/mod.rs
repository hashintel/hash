mod constraint;
mod conversion;

pub use self::{
    closed::{ClosedDataType, DataTypeResolveData},
    constraint::{
        AnyOfConstraints, ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError,
        BooleanSchema, BooleanTypeTag, ConstraintError, ConstraintValidator, NullSchema,
        NullTypeTag, NumberConstraints, NumberSchema, NumberTypeTag, NumberValidationError,
        ObjectConstraints, ObjectSchema, ObjectTypeTag, ObjectValidationError,
        SingleValueConstraints, SingleValueSchema, StringConstraints, StringFormat,
        StringFormatError, StringSchema, StringTypeTag, StringValidationError, TupleConstraints,
    },
    conversion::{
        ConversionDefinition, ConversionExpression, ConversionValue, Conversions, Operator,
        Variable,
    },
    reference::DataTypeReference,
    validation::{DataTypeValidator, ValidateDataTypeError},
};

mod closed;

mod reference;
mod validation;

use alloc::collections::BTreeSet;
use core::fmt;

use serde::{Deserialize, Serialize};

use crate::{Value, schema::data_type::constraint::ValueConstraints, url::VersionedUrl};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum JsonSchemaValueType {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Object,
}

impl fmt::Display for JsonSchemaValueType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Null => fmt.write_str("null"),
            Self::Boolean => fmt.write_str("boolean"),
            Self::Number => fmt.write_str("number"),
            Self::String => fmt.write_str("string"),
            Self::Array => fmt.write_str("array"),
            Self::Object => fmt.write_str("object"),
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct ValueLabel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<String>,
}

impl ValueLabel {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.left.is_none() && self.right.is_none()
    }
}

impl From<&Value> for JsonSchemaValueType {
    fn from(value: &Value) -> Self {
        match value {
            Value::Null => Self::Null,
            Value::Bool(_) => Self::Boolean,
            Value::Number(_) => Self::Number,
            Value::String(_) => Self::String,
            Value::Array(_) => Self::Array,
            Value::Object(_) => Self::Object,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeTag {
    DataType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeSchemaTag {
    #[serde(rename = "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type")]
    V3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValueSchemaMetadata {
    pub description: String,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
}

mod raw {
    use alloc::collections::BTreeSet;

    use hash_codec::numeric::Real;
    use serde::{Deserialize, Serialize};

    use super::{DataTypeSchemaTag, DataTypeTag, ValueSchemaMetadata};
    use crate::{
        schema::{
            ArrayTypeTag, BooleanTypeTag, DataTypeReference, NullTypeTag, NumberTypeTag,
            ObjectTypeTag, StringTypeTag,
            data_type::constraint::{
                AnyOfConstraints, ArrayConstraints, ArraySchema, NumberConstraints, NumberSchema,
                SingleValueConstraints, StringConstraints, StringSchema, TupleConstraints,
                ValueConstraints,
            },
        },
        url::VersionedUrl,
    };

    #[derive(Serialize, Deserialize)]
    #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct DataTypeBase {
        #[serde(rename = "$schema")]
        schema: DataTypeSchemaTag,
        kind: DataTypeTag,
        #[serde(rename = "$id")]
        id: VersionedUrl,
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title_plural: Option<String>,
        #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
        all_of: BTreeSet<DataTypeReference>,

        #[serde(default)]
        r#abstract: bool,
    }

    #[derive(Serialize, Deserialize)]
    #[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
    pub enum DataType {
        Null {
            r#type: NullTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
        },
        Boolean {
            r#type: BooleanTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
        },
        Number {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: NumberConstraints,
        },
        NumberEnum {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#enum: Vec<Real>,
        },
        String {
            r#type: StringTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: StringConstraints,
        },
        StringEnum {
            r#type: StringTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#enum: Vec<String>,
        },
        Object {
            r#type: ObjectTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
        },
        Array {
            r#type: ArrayTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: ArrayConstraints,
        },
        Tuple {
            r#type: ArrayTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: TupleConstraints,
        },
        AnyOf {
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: AnyOfConstraints,
        },
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
        enum DataType {
            Schema {
                #[serde(flatten)]
                common: DataTypeBase,
                #[serde(flatten)]
                constraints: ValueConstraints,
                #[serde(flatten)]
                metadata: ValueSchemaMetadata,
            },
        }
    }

    impl From<DataType> for super::DataType {
        #[expect(
            clippy::too_many_lines,
            reason = "The conversion is only required to allow `deny_unknown_fields` in serde. \
                      The better option would be to manually implement the deserialization logic, \
                      however, this is quite straightforward and would be a lot of code for \
                      little benefit."
        )]
        fn from(value: DataType) -> Self {
            let (base, metadata, constraints) = match value {
                DataType::Null {
                    r#type: _,
                    base,
                    metadata,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Null)),
                ),
                DataType::Boolean {
                    r#type: _,
                    base,
                    metadata,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Boolean)),
                ),
                DataType::Number {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
                        NumberSchema::Constrained(constraints),
                    ))),
                ),
                DataType::NumberEnum {
                    r#type: _,
                    base,
                    metadata,
                    r#enum,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
                        NumberSchema::Enum { r#enum },
                    ))),
                ),
                DataType::String {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::String(
                        StringSchema::Constrained(constraints),
                    ))),
                ),
                DataType::StringEnum {
                    r#type: _,
                    base,
                    metadata,
                    r#enum,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::String(
                        StringSchema::Enum { r#enum },
                    ))),
                ),
                DataType::Object {
                    r#type: _,
                    base,
                    metadata,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Object)),
                ),
                DataType::Array {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Array(
                        ArraySchema::Constrained(Box::new(constraints)),
                    ))),
                ),
                DataType::Tuple {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(Box::new(SingleValueConstraints::Array(
                        ArraySchema::Tuple(constraints),
                    ))),
                ),
                DataType::AnyOf {
                    base,
                    metadata,
                    constraints: any_of,
                } => (base, metadata, ValueConstraints::AnyOf(any_of)),
            };

            Self {
                schema: base.schema,
                kind: base.kind,
                id: base.id,
                title: base.title,
                title_plural: base.title_plural,
                description: metadata.description,
                label: metadata.label,
                all_of: base.all_of,
                r#abstract: base.r#abstract,
                constraints,
            }
        }
    }
}

/// The foundation of the type system and represent primitive value types.
///
/// ## Core Concepts
///
/// A [`DataType`] defines:
///
/// - A unique identifier (`$id`) as a [`VersionedUrl`]
/// - The expected value type (string, number, boolean, null, array, object)
/// - Constraints that values must satisfy (min/max, pattern, format, etc.)
/// - Inheritance from other data types via `all_of` references
///
/// ## Data Type Variants
///
/// The system supports these primary data type variants:
///
/// - `Null` - Represents the absence of a value
/// - `Boolean` - True/false values
/// - `Number` - Numeric values with optional constraints
/// - `String` - Text values with optional constraints
/// - `Array` - Ordered collections with item constraints
/// - `Object` - Key-value structures
/// - `AnyOf` - Union types representing one of several possible types
///
/// ## Validation Process
///
/// The [`DataTypeValidator`] is responsible for validating values against data types:
///
/// 1. It checks that the value matches the expected type
/// 2. It verifies all constraints are satisfied
/// 3. It applies inherited constraints from referenced types
///
/// ## Type Resolution
///
/// Data types can reference other data types through `all_of`, creating a graph of dependencies.
/// The [`ClosedDataType`] represents a data type with all references resolved, ready for
/// validation.
///
/// ## Example
///
/// A data type with inheritance might be defined as:
///
/// ```
/// use serde_json::json;
/// use type_system::schema::DataType;
///
/// // Define a parent text data type
/// let text_type_json = json!({
///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
///     "kind": "dataType",
///     "type": "string",
///     "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
///     "title": "Text",
///     "description": "An ordered sequence of characters"
/// });
///
/// // Define an email type that inherits from text but adds constraints
/// let email_type_json = json!({
///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
///     "kind": "dataType",
///     "type": "string",
///     "$id": "https://example.com/types/data-type/email/v/1",
///     "title": "Email",
///     "description": "An email address",
///     "format": "email",
///     "allOf": [
///         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
///     ]
/// });
///
/// // Parse the data types
/// let text_type = serde_json::from_value::<DataType>(text_type_json).expect("Failed to parse text type");
/// let email_type = serde_json::from_value::<DataType>(email_type_json).expect("Failed to parse email type");
///
/// // Check the inheritance relationship
/// assert_eq!(text_type.id.to_string(), "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1");
/// assert_eq!(email_type.id.to_string(), "https://example.com/types/data-type/email/v/1");
///
/// // The email type inherits from the text type via allOf
/// assert_eq!(email_type.all_of.len(), 1);
/// let inherited_ref = email_type.all_of.iter().next().expect("Should have at least one inherited type");
/// assert_eq!(inherited_ref.url, text_type.id);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "raw::DataType")]
pub struct DataType {
    /// The schema URL identifying this as a data type.
    ///
    /// This field must be set to `"https://blockprotocol.org/types/modules/graph/0.3/schema/data-type"`.
    #[serde(rename = "$schema")]
    pub schema: DataTypeSchemaTag,

    /// The kind of type, must be set to `"dataType"`.
    pub kind: DataTypeTag,

    /// The unique identifier for this data type.
    ///
    /// This should be a versioned URL in the format:
    /// `https://example.com/types/data-type/name/v/1`
    #[serde(rename = "$id")]
    pub id: VersionedUrl,

    /// The human-readable name of the data type.
    ///
    /// This should be concise and descriptive, e.g., "Positive Integer" or "Email Address".
    pub title: String,

    /// Optional plural form of the title.
    ///
    /// For data types representing collections, e.g., "Positive Integers".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,

    /// A detailed description of the data type's purpose and constraints.
    ///
    /// This should provide comprehensive information about what the data type represents
    /// and any specific rules or conventions that apply to values of this type.
    pub description: String,

    /// Optional display labels for UI rendering.
    ///
    /// This can specify labels to be shown on the left and/or right sides of
    /// values of this type in user interfaces.
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,

    /// References to parent data types from which this type inherits.
    ///
    /// All data types (except the core 'value' type) must inherit from at least
    /// one parent type. Types are processed in lexicographical order for
    /// deterministic inheritance behavior.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub all_of: BTreeSet<DataTypeReference>,

    /// Whether this data type is abstract.
    ///
    /// Abstract types cannot be directly instantiated but serve as base types
    /// for other data types to inherit from.
    pub r#abstract: bool,

    /// The constraints that apply to values of this data type.
    ///
    /// This includes type-specific constraints such as:
    /// - String constraints (pattern, minLength, format, etc.)
    /// - Number constraints (minimum, maximum, multipleOf, etc.)
    /// - Array constraints (minItems, maxItems, items, etc.)
    /// - Object constraints
    /// - Union type definitions (anyOf)
    #[serde(flatten)]
    pub constraints: ValueConstraints,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DataTypeEdge {
    Inheritance,
}

impl DataType {
    /// Returns an iterator over the data type's references to other data types.
    ///
    /// This method is useful for traversing the type hierarchy, such as when building
    /// a resolver or dependency graph of types.
    ///
    /// # Returns
    ///
    /// An iterator yielding pairs of references and their relationship to this type.
    /// Currently, all relationships are `DataTypeEdge::Inheritance` since data types
    /// can only reference other data types through inheritance.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// use type_system::schema::{DataType, DataTypeEdge};
    ///
    /// let data_type = serde_json::from_value::<DataType>(json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    ///     "kind": "dataType",
    ///     "$id": "https://example.com/types/data-type/my-text/v/1",
    ///     "title": "My Text",
    ///     "description": "A custom text type",
    ///     "type": "string",
    ///     "allOf": [
    ///         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
    ///     ]
    /// })).expect("Failed to parse data type");
    ///
    /// // Iterate through references
    /// for (reference, edge_type) in data_type.data_type_references() {
    ///     assert_eq!(reference.url.to_string(),
    ///                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1");
    ///     assert!(matches!(edge_type, DataTypeEdge::Inheritance));
    /// }
    /// ```
    pub fn data_type_references(&self) -> impl Iterator<Item = (&DataTypeReference, DataTypeEdge)> {
        self.all_of
            .iter()
            .map(|reference| (reference, DataTypeEdge::Inheritance))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        JsonEqualityCheck, ensure_failed_deserialization, ensure_validation,
        ensure_validation_from_str,
    };

    #[tokio::test]
    async fn value() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::VALUE_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn text() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::TEXT_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn number() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::NUMBER_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn boolean() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::BOOLEAN_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn null() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::NULL_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn object() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::OBJECT_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn list() {
        ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::LIST_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn tuple() {
        ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/two-numbers/v/1",
              "title": "Two Numbers",
              "description": "A tuple of two numbers",
              "allOf": [{ "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1" }],
              "type": "array",
              "abstract": false,
              "items": false,
              "prefixItems": [
                { "type": "number" },
                { "type": "number" }
              ]
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn array() {
        ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/array/v/1",
              "title": "Number List",
              "description": "A list of numbers",
              "allOf": [{ "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1" }],
              "type": "array",
              "abstract": false,
              "items": { "type": "number" },
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[test]
    fn additional_properties() {
        // The error is suboptimal, but most importantly, it does error.
        ensure_failed_deserialization::<DataType>(
            serde_json::json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "description": "A piece of data that can be used to convey information about an attribute, quality or state of something.",
              "title": "Value",
              "description": "A value that can be stored in a graph",
              "anyOf": [
                { "type": "null" },
                { "type": "boolean" },
                { "type": "number" },
                { "type": "string" },
                { "type": "array" },
                { "type": "object" }
              ],
              "additional": false
            }),
            &"data did not match any variant of untagged enum DataType",
        );
    }
}
