mod constraint;
mod conversion;

pub use self::{
    closed::{ClosedDataType, DataTypeResolveData, ResolvedDataType},
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
use serde_json::Value as JsonValue;

use crate::{schema::data_type::constraint::ValueConstraints, url::VersionedUrl};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
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

impl From<&JsonValue> for JsonSchemaValueType {
    fn from(value: &JsonValue) -> Self {
        match value {
            JsonValue::Null => Self::Null,
            JsonValue::Bool(_) => Self::Boolean,
            JsonValue::Number(_) => Self::Number,
            JsonValue::String(_) => Self::String,
            JsonValue::Array(_) => Self::Array,
            JsonValue::Object(_) => Self::Object,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
}

impl ValueSchemaMetadata {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.description.is_none() && self.label.is_empty()
    }
}

mod raw {
    use alloc::collections::BTreeSet;
    use std::collections::HashSet;

    use serde::{Deserialize, Serialize};

    use super::{DataTypeSchemaTag, DataTypeTag, ValueSchemaMetadata};
    use crate::{
        schema::{
            ArrayTypeTag, BooleanTypeTag, DataTypeReference, NullSchema, NullTypeTag,
            NumberTypeTag, ObjectTypeTag, StringTypeTag,
            data_type::constraint::{
                AnyOfConstraints, ArrayConstraints, ArraySchema, BooleanSchema, NumberConstraints,
                NumberSchema, ObjectConstraints, ObjectSchema, SingleValueConstraints,
                StringConstraints, StringSchema, TupleConstraints, ValueConstraints,
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
        NumberConst {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#const: f64,
        },
        NumberEnum {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#enum: Vec<f64>,
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
        StringConst {
            r#type: StringTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#const: String,
        },
        StringEnum {
            r#type: StringTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            r#enum: HashSet<String>,
        },
        Object {
            r#type: ObjectTypeTag,
            #[serde(flatten)]
            base: DataTypeBase,
            #[serde(flatten)]
            metadata: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: ObjectConstraints,
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
                    ValueConstraints::Typed(SingleValueConstraints::Null(NullSchema)),
                ),
                DataType::Boolean {
                    r#type: _,
                    base,
                    metadata,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Boolean(BooleanSchema)),
                ),
                DataType::Number {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Number(
                        NumberSchema::Constrained(constraints),
                    )),
                ),
                DataType::NumberConst {
                    r#type: _,
                    base,
                    metadata,
                    r#const,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Number(NumberSchema::Const {
                        r#const,
                    })),
                ),
                DataType::NumberEnum {
                    r#type: _,
                    base,
                    metadata,
                    r#enum,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Number(NumberSchema::Enum {
                        r#enum,
                    })),
                ),
                DataType::String {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::String(
                        StringSchema::Constrained(constraints),
                    )),
                ),
                DataType::StringConst {
                    r#type: _,
                    base,
                    metadata,
                    r#const,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::String(StringSchema::Const {
                        r#const,
                    })),
                ),
                DataType::StringEnum {
                    r#type: _,
                    base,
                    metadata,
                    r#enum,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::String(StringSchema::Enum {
                        r#enum,
                    })),
                ),
                DataType::Object {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Object(
                        ObjectSchema::Constrained(constraints),
                    )),
                ),
                DataType::Array {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Array(
                        ArraySchema::Constrained(constraints),
                    )),
                ),
                DataType::Tuple {
                    r#type: _,
                    base,
                    metadata,
                    constraints,
                } => (
                    base,
                    metadata,
                    ValueConstraints::Typed(SingleValueConstraints::Array(ArraySchema::Tuple(
                        constraints,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "raw::DataType")]
pub struct DataType {
    #[serde(rename = "$schema")]
    pub schema: DataTypeSchemaTag,
    pub kind: DataTypeTag,
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
    // Lexicographically ordered so we have a deterministic order for inheriting parent
    // schemas.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub all_of: BTreeSet<DataTypeReference>,

    pub r#abstract: bool,
    #[serde(flatten)]
    pub constraints: ValueConstraints,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DataTypeEdge {
    Inheritance,
}

impl DataType {
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
            graph_test_data::data_type::VALUE_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn text() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::TEXT_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn number() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::NUMBER_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn boolean() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::BOOLEAN_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn null() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::NULL_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn object() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::OBJECT_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[tokio::test]
    async fn list() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::LIST_V1,
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
