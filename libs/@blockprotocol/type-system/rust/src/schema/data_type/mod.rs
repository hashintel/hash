mod constraint;
mod conversion;

pub use self::{
    closed::{ClosedDataType, ClosedDataTypeMetadata},
    constraint::{
        AnyOfConstraints, ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError,
        BooleanTypeTag, ConstraintError, NullTypeTag, NumberConstraints, NumberSchema,
        NumberTypeTag, NumberValidationError, ObjectTypeTag, SingleValueConstraints,
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

use alloc::sync::Arc;
use core::{fmt, mem};
use std::collections::{HashMap, HashSet, hash_map::RawEntryMut};

use error_stack::{Report, bail};
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{schema::data_type::constraint::ValueConstraints, url::VersionedUrl};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[repr(transparent)]
pub struct DataTypeId(Uuid);

impl DataTypeId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub fn from_url(url: &VersionedUrl) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            url.to_string().as_bytes(),
        ))
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

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

mod raw {
    use std::collections::HashSet;

    use serde::{Deserialize, Serialize};

    use super::{DataTypeSchemaTag, DataTypeTag};
    use crate::{
        schema::{
            ArrayTypeTag, BooleanTypeTag, DataTypeReference, NullTypeTag, NumberTypeTag,
            ObjectTypeTag, StringTypeTag, ValueLabel,
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
    pub struct ValueSchemaMetadata {
        #[serde(rename = "$schema")]
        schema: DataTypeSchemaTag,
        kind: DataTypeTag,
        #[serde(rename = "$id")]
        id: VersionedUrl,
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title_plural: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
        label: ValueLabel,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        all_of: Vec<DataTypeReference>,

        #[serde(default)]
        r#abstract: bool,
    }

    #[derive(Serialize, Deserialize)]
    #[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
    pub enum DataType {
        Null {
            r#type: NullTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
        },
        Boolean {
            r#type: BooleanTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
        },
        Number {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: NumberConstraints,
        },
        NumberConst {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            r#const: f64,
        },
        NumberEnum {
            r#type: NumberTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            r#enum: Vec<f64>,
        },
        String {
            r#type: StringTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: StringConstraints,
        },
        StringConst {
            r#type: StringTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            r#const: String,
        },
        StringEnum {
            r#type: StringTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            r#enum: HashSet<String>,
        },
        Object {
            r#type: ObjectTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
        },
        Array {
            r#type: ArrayTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: ArrayConstraints,
        },
        Tuple {
            r#type: ArrayTypeTag,
            #[serde(flatten)]
            common: ValueSchemaMetadata,
            #[serde(flatten)]
            constraints: TupleConstraints,
        },
        AnyOf {
            #[serde(flatten)]
            common: ValueSchemaMetadata,
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
                common: ValueSchemaMetadata,
                #[serde(flatten)]
                constraints: ValueConstraints,
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
            let (common, constraints) = match value {
                DataType::Null { r#type: _, common } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Null),
                ),
                DataType::Boolean { r#type: _, common } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Boolean),
                ),
                DataType::Number {
                    r#type: _,
                    common,
                    constraints,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Number(
                        NumberSchema::Constrained(constraints),
                    )),
                ),
                DataType::NumberConst {
                    r#type: _,
                    common,
                    r#const,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Number(NumberSchema::Const {
                        r#const,
                    })),
                ),
                DataType::NumberEnum {
                    r#type: _,
                    common,
                    r#enum,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Number(NumberSchema::Enum {
                        r#enum,
                    })),
                ),
                DataType::String {
                    r#type: _,
                    common,
                    constraints,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::String(
                        StringSchema::Constrained(constraints),
                    )),
                ),
                DataType::StringConst {
                    r#type: _,
                    common,
                    r#const,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::String(StringSchema::Const {
                        r#const,
                    })),
                ),
                DataType::StringEnum {
                    r#type: _,
                    common,
                    r#enum,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::String(StringSchema::Enum {
                        r#enum,
                    })),
                ),
                DataType::Object { r#type: _, common } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Object),
                ),
                DataType::Array {
                    r#type: _,
                    common,
                    constraints,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Array(
                        ArraySchema::Constrained(constraints),
                    )),
                ),
                DataType::Tuple {
                    r#type: _,
                    common,
                    constraints,
                } => (
                    common,
                    ValueConstraints::Typed(SingleValueConstraints::Array(ArraySchema::Tuple(
                        constraints,
                    ))),
                ),
                DataType::AnyOf {
                    common,
                    constraints: any_of,
                } => (common, ValueConstraints::AnyOf(any_of)),
            };

            Self {
                schema: common.schema,
                kind: common.kind,
                id: common.id,
                title: common.title,
                title_plural: common.title_plural,
                description: common.description,
                label: common.label,
                all_of: common.all_of,
                r#abstract: common.r#abstract,
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub all_of: Vec<DataTypeReference>,

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
    #[error("The data types have unresolved references: {}", serde_json::json!(schemas))]
    MissingSchemas { schemas: HashSet<VersionedUrl> },
    #[error("The closed data type metadata for `{id}` is missing")]
    MissingClosedDataType { id: VersionedUrl },
}

#[derive(Debug, Serialize, Deserialize)]
struct DataTypeCacheEntry {
    pub data_type: Arc<DataType>,
    pub metadata: Option<Arc<ClosedDataTypeMetadata>>,
}

#[derive(Debug, Default)]
pub struct OntologyTypeResolver {
    data_types: HashMap<VersionedUrl, DataTypeCacheEntry>,
}

impl OntologyTypeResolver {
    pub fn add_open(&mut self, data_type: Arc<DataType>) {
        self.data_types
            .raw_entry_mut()
            .from_key(&data_type.id)
            .or_insert_with(|| {
                (data_type.id.clone(), DataTypeCacheEntry {
                    data_type,
                    metadata: None,
                })
            });
    }

    pub fn add_closed(&mut self, data_type: Arc<DataType>, metadata: Arc<ClosedDataTypeMetadata>) {
        match self.data_types.raw_entry_mut().from_key(&data_type.id) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(data_type.id.clone(), DataTypeCacheEntry {
                    data_type,
                    metadata: Some(metadata),
                });
            }
            RawEntryMut::Occupied(mut entry) => {
                entry.insert(DataTypeCacheEntry {
                    data_type,
                    metadata: Some(metadata),
                });
            }
        }
    }

    pub fn update_metadata(
        &mut self,
        data_type_id: &VersionedUrl,
        metadata: Arc<ClosedDataTypeMetadata>,
    ) -> Option<Arc<ClosedDataTypeMetadata>> {
        self.data_types
            .get_mut(data_type_id)
            .map(|entry| Arc::clone(entry.metadata.insert(metadata)))
    }

    fn get(&self, id: &VersionedUrl) -> Option<&DataTypeCacheEntry> {
        self.data_types.get(id)
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
        data_type_id: &VersionedUrl,
    ) -> Result<Arc<ClosedDataTypeMetadata>, Report<DataTypeResolveError>> {
        let Some(data_type_entry) = self.get(data_type_id) else {
            bail!(DataTypeResolveError::MissingSchemas {
                schemas: HashSet::from([data_type_id.clone()]),
            });
        };

        if let Some(metadata) = &data_type_entry.metadata {
            // If the metadata is already resolved, we can return it immediately.
            return Ok(Arc::clone(metadata));
        }

        // We add all requested types to the cache to ensure that we can resolve all types. The
        // cache will be updated with the resolved metadata. We extract the IDs so that we can
        // resolve the metadata in the correct order.
        // Double buffering is used to avoid unnecessary allocations.
        let mut data_types_to_resolve = Vec::new();
        let mut next_data_types_to_resolve = vec![Arc::clone(&data_type_entry.data_type)];

        // We keep a list of all schemas that are missing from the cache. If we encounter a schema
        // that is not in the cache, we add it to this list. If we are unable to resolve all
        // schemas, we return an error with this list.
        let mut missing_schemas = HashSet::new();

        // We also keep a list of all schemas that we already processed. This is used to prevent
        // infinite loops in the inheritance chain. New values are added to this list as we add new
        // schemas to resolve.
        let mut processed_schemas = HashSet::from([data_type_id.clone()]);

        // The currently closed schema being resolved. This can be used later to resolve
        let mut in_progress_schema = ClosedDataTypeMetadata {
            inheritance_depths: HashMap::new(),
        };

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
                    if processed_schemas.contains(&data_type_reference.url) {
                        // We ignore the already processed schemas to prevent infinite loops.
                        continue;
                    }

                    in_progress_schema.add_edge(edge, &data_type_reference.url, current_depth);
                    processed_schemas.insert(data_type_reference.url.clone());

                    let Some(data_type_entry) = self.data_types.get(&data_type_reference.url)
                    else {
                        // If the data type is not in the cache, we add it to the list of missing
                        // schemas.
                        missing_schemas.insert(data_type_reference.url.clone());
                        continue;
                    };

                    if let Some(metadata) = &data_type_entry.metadata {
                        // If the metadata is already resolved, we can reuse it.
                        for (data_type_ref, depth) in &metadata.inheritance_depths {
                            if data_type.id != *data_type_ref {
                                in_progress_schema.add_edge(
                                    edge,
                                    data_type_ref,
                                    *depth + current_depth + 1,
                                );
                            }
                        }
                    } else {
                        // We encountered a schema that we haven't resolved yet. We add it to the
                        // list of schemas to find and update the inheritance depth of the current
                        // type.
                        next_data_types_to_resolve.push(Arc::clone(&data_type_entry.data_type));
                    }
                }
            }

            current_depth += 1;
        }

        if missing_schemas.is_empty() {
            // We create the resolved metadata for the current data type and update the cache so
            // that we don't need to resolve it again.
            Ok(self
                .update_metadata(data_type_id, Arc::new(in_progress_schema))
                .unwrap_or_else(|| {
                    unreachable!(
                        "The data type was removed from the cache while resolving the metadata"
                    )
                }))
        } else {
            Err(Report::from(DataTypeResolveError::MissingSchemas {
                schemas: missing_schemas,
            }))
        }
    }

    /// Returns the closed data type for the given data type.
    ///
    /// This method returns the closed data type for the given data type. The closed data type
    /// includes the schema of the data type and all its parents.
    ///
    /// # Errors
    ///
    /// Returns an error if the closed data type could not be resolved.
    pub fn get_closed_data_type(
        &self,
        data_type_id: &VersionedUrl,
    ) -> Result<ClosedDataType, Report<DataTypeResolveError>> {
        let Some(entry) = self.get(data_type_id) else {
            bail!(DataTypeResolveError::MissingSchemas {
                schemas: HashSet::from([data_type_id.clone()]),
            });
        };

        let metadata =
            entry
                .metadata
                .as_ref()
                .ok_or_else(|| DataTypeResolveError::MissingClosedDataType {
                    id: data_type_id.clone(),
                })?;

        let mut missing_schemas = HashSet::new();

        let closed_type = ClosedDataType {
            schema: Arc::clone(&entry.data_type),
            definitions: metadata
                .inheritance_depths
                .keys()
                .cloned()
                .filter_map(|id| {
                    let Some(definition_entry) = self.get(&id) else {
                        missing_schemas.insert(id);
                        return None;
                    };
                    Some((id, Arc::clone(&definition_entry.data_type)))
                })
                .collect(),
        };

        missing_schemas
            .is_empty()
            .then_some(closed_type)
            .ok_or_else(|| {
                Report::from(DataTypeResolveError::MissingSchemas {
                    schemas: missing_schemas,
                })
            })
    }
}

impl DataType {
    /// Validates the given JSON value against the constraints of this data type.
    ///
    /// Returns a [`Report`] of any constraint errors found.
    ///
    /// # Errors
    ///
    /// Returns an error if the JSON value is not a valid instance of the data type.
    pub fn validate_constraints(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match &self.constraints {
            ValueConstraints::Typed(typed_schema) => typed_schema.validate_value(value),
            ValueConstraints::AnyOf(constraints) => constraints.validate_value(value),
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
