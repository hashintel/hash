mod constraint;
mod conversion;

pub use self::{
    closed::{ClosedDataType, DataTypeResolveData, InheritanceDepth, ResolvedDataType},
    constraint::{
        AnyOfConstraints, ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError,
        BooleanSchema, BooleanTypeTag, Constraint, ConstraintError, NullSchema, NullTypeTag,
        NumberConstraints, NumberSchema, NumberTypeTag, NumberValidationError, ObjectConstraints,
        ObjectSchema, ObjectTypeTag, ObjectValidationError, SingleValueConstraints,
        SingleValueSchema, StringConstraints, StringFormat, StringFormatError, StringSchema,
        StringTypeTag, StringValidationError, TupleConstraints,
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

use alloc::{collections::BTreeSet, sync::Arc};
use core::{fmt, mem};
use std::collections::{HashMap, HashSet};

use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::{DataTypeUuid, data_type::constraint::ValueConstraints},
    url::VersionedUrl,
};

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

#[derive(Debug, Error)]
pub enum DataTypeResolveError {
    #[error("The data type ID is unknown")]
    UnknownDataTypeId,
    #[error("The data types have unresolved references: {}", serde_json::json!(schemas))]
    MissingSchemas { schemas: HashSet<VersionedUrl> },
    #[error("The closed data type metadata is missing")]
    MissingClosedDataType,
    #[error("Not all schemas are contained in the resolver")]
    MissingDataTypes,
}

#[derive(Debug)]
struct DataTypeCacheEntry {
    data_type: Arc<DataType>,
    resolve_data: Option<Arc<DataTypeResolveData>>,
}

#[derive(Debug, Default)]
pub struct OntologyTypeResolver {
    data_types: HashMap<DataTypeUuid, DataTypeCacheEntry>,
}

impl OntologyTypeResolver {
    pub fn add_unresolved(&mut self, data_type_id: DataTypeUuid, data_type: Arc<DataType>) {
        debug_assert_eq!(
            data_type_id,
            DataTypeUuid::from_url(&data_type.id),
            "The data type ID must match the URL"
        );
        self.data_types
            .entry(data_type_id)
            .or_insert(DataTypeCacheEntry {
                data_type,
                resolve_data: None,
            });
    }

    pub fn add_closed(
        &mut self,
        data_type_id: DataTypeUuid,
        data_type: Arc<DataType>,
        metadata: Arc<DataTypeResolveData>,
    ) {
        self.data_types.insert(data_type_id, DataTypeCacheEntry {
            data_type,
            resolve_data: Some(metadata),
        });
    }

    fn close(
        &mut self,
        data_type_id: DataTypeUuid,
        metadata: Arc<DataTypeResolveData>,
    ) -> Result<(), DataTypeResolveError> {
        let data_type_entry = self
            .data_types
            .get_mut(&data_type_id)
            .ok_or(DataTypeResolveError::UnknownDataTypeId)?;
        data_type_entry.resolve_data = Some(metadata);
        Ok(())
    }

    /// Resolves the metadata for the given data types.
    ///
    /// This method resolves the metadata for the given data types and all their parents. It returns
    /// the resolved metadata for all data types.
    ///
    /// # Errors
    ///
    /// Returns an error if the metadata for any of the data types could not be resolved.
    pub fn resolve_data_type_metadata(
        &mut self,
        data_type_id: DataTypeUuid,
    ) -> Result<Arc<DataTypeResolveData>, Report<DataTypeResolveError>> {
        let Some(data_type_entry) = self.data_types.get(&data_type_id) else {
            bail!(DataTypeResolveError::UnknownDataTypeId);
        };

        let data_type = Arc::clone(&data_type_entry.data_type);

        // We add all requested types to the cache to ensure that we can resolve all types. The
        // cache will be updated with the resolved metadata. We extract the IDs so that we can
        // resolve the metadata in the correct order.
        // Double buffering is used to avoid unnecessary allocations.
        let mut data_types_to_resolve = Vec::new();
        let mut next_data_types_to_resolve = vec![data_type];

        // We keep a list of all schemas that are missing from the cache. If we encounter a schema
        // that is not in the cache, we add it to this list. If we are unable to resolve all
        // schemas, we return an error with this list.
        let mut missing_schemas = HashSet::new();

        // The currently closed schema being resolved. This can be used later to resolve
        let mut in_progress_schema = DataTypeResolveData::default();

        let mut current_depth = 0;
        while !next_data_types_to_resolve.is_empty() {
            mem::swap(&mut data_types_to_resolve, &mut next_data_types_to_resolve);
            #[expect(
                clippy::iter_with_drain,
                reason = "False positive, we re-use the iterator to avoid unnecessary allocations.\
                          See https://github.com/rust-lang/rust-clippy/issues/8539"
            )]
            for data_type in data_types_to_resolve.drain(..) {
                for (data_type_reference, edge) in data_type.data_type_references() {
                    let data_type_reference_id = DataTypeUuid::from_url(&data_type_reference.url);

                    let Some(data_type_entry) = self.data_types.get(&data_type_reference_id) else {
                        // If the data type is not in the cache, we add it to the list of missing
                        // schemas.
                        missing_schemas.insert(data_type_reference.url.clone());
                        continue;
                    };

                    in_progress_schema.add_edge(
                        edge,
                        Arc::clone(&data_type_entry.data_type),
                        data_type_reference_id,
                        current_depth,
                    );

                    if let Some(resolve_data) = &data_type_entry.resolve_data {
                        in_progress_schema.extend_edges(current_depth + 1, resolve_data);
                    } else {
                        next_data_types_to_resolve.push(Arc::clone(&data_type_entry.data_type));
                    }
                }
            }

            current_depth += 1;
        }

        if missing_schemas.is_empty() {
            // We create the resolved metadata for the current data type and update the cache so
            // that we don't need to resolve it again.
            let in_progress_schema = Arc::new(in_progress_schema);
            self.close(data_type_id, Arc::clone(&in_progress_schema))?;
            Ok(in_progress_schema)
        } else {
            Err(Report::from(DataTypeResolveError::MissingSchemas {
                schemas: missing_schemas,
            }))
        }
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
