mod constraint;
mod conversion;

pub use self::{
    closed::{ClosedDataType, ClosedDataTypeMetadata},
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
use core::{cmp, fmt, mem};
use std::collections::{hash_map::RawEntryMut, HashMap, HashSet};

use error_stack::{bail, Report};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::data_type::constraint::{ConstraintError, ValueConstraints},
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
pub struct DataTypeLabel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<String>,
}

impl DataTypeLabel {
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
    use serde::Deserialize;

    use super::{DataTypeSchemaTag, DataTypeTag};
    use crate::{
        schema::{
            data_type::constraint::{
                ArraySchema, BooleanSchema, NullSchema, NumberSchema, ObjectSchema, StringSchema,
                ValueConstraints,
            },
            DataTypeReference,
        },
        url::VersionedUrl,
    };

    #[derive(Deserialize)]
    #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct UnconstrainedDataType {
        #[serde(rename = "$schema")]
        schema: DataTypeSchemaTag,
        kind: DataTypeTag,
        #[serde(rename = "$id")]
        id: VersionedUrl,
        title: String,
        #[cfg_attr(
            target_arch = "wasm32",
            tsify(type = "[DataTypeReference, ...DataTypeReference[]]")
        )]
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        all_of: Vec<DataTypeReference>,

        #[serde(default)]
        r#abstract: bool,
    }

    #[derive(Deserialize)]
    #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
    #[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
    pub enum DataType {
        Null {
            #[serde(flatten)]
            schema: NullSchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
        Boolean {
            #[serde(flatten)]
            schema: BooleanSchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
        Number {
            #[serde(flatten)]
            schema: NumberSchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
        String {
            #[serde(flatten)]
            schema: StringSchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
        Array {
            #[serde(flatten)]
            schema: ArraySchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
        Object {
            #[serde(flatten)]
            schema: ObjectSchema,
            #[serde(flatten)]
            common: UnconstrainedDataType,
        },
    }

    impl From<DataType> for super::DataType {
        fn from(value: DataType) -> Self {
            let (common, constraints) = match value {
                DataType::Null { schema, common } => (common, ValueConstraints::Null(schema)),
                DataType::Boolean { schema, common } => (common, ValueConstraints::Boolean(schema)),
                DataType::Number { schema, common } => (common, ValueConstraints::Number(schema)),
                DataType::String { schema, common } => (common, ValueConstraints::String(schema)),
                DataType::Array { schema, common } => (common, ValueConstraints::Array(schema)),
                DataType::Object { schema, common } => (common, ValueConstraints::Object(schema)),
            };

            Self {
                schema: common.schema,
                kind: common.kind,
                id: common.id,
                title: common.title,
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
                (
                    data_type.id.clone(),
                    DataTypeCacheEntry {
                        data_type,
                        metadata: None,
                    },
                )
            });
    }

    pub fn add_closed(&mut self, data_type: Arc<DataType>, metadata: Arc<ClosedDataTypeMetadata>) {
        match self.data_types.raw_entry_mut().from_key(&data_type.id) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(
                    data_type.id.clone(),
                    DataTypeCacheEntry {
                        data_type,
                        metadata: Some(metadata),
                    },
                );
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
            .and_then(|entry| entry.metadata.replace(metadata))
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
        data_types: impl IntoIterator<Item = Arc<DataType>>,
    ) -> Result<Vec<Arc<ClosedDataTypeMetadata>>, Report<DataTypeResolveError>> {
        // We add all requested types to the cache to ensure that we can resolve all types. The
        // cache will be updated with the resolved metadata. We extract the IDs so that we can
        // resolve the metadata in the correct order.
        let data_types_to_resolve = data_types
            .into_iter()
            .map(|data_type| {
                let data_type_id = data_type.id.clone();
                self.add_open(data_type);
                data_type_id
            })
            .collect::<Vec<_>>();

        // We keep a list of all schemas that are missing from the cache. If we encounter a schema
        // that is not in the cache, we add it to this list. If we are unable to resolve all
        // schemas, we return an error with this list.
        let mut missing_schemas = HashSet::new();
        let mut processed_schemas = HashSet::new();

        let resolved_types = data_types_to_resolve
            .into_iter()
            .filter_map(|current_data_type_id| {
                // To avoid infinite loops, we keep track of all schemas that we already processed.
                processed_schemas.insert(current_data_type_id.clone());

                let Some(cache_entry) = self.get(&current_data_type_id) else {
                    // This should never happen as we previously inserted the data type
                    missing_schemas.insert(current_data_type_id);
                    return None;
                };

                // If the metadata is already resolved, we can return it immediately.
                if let Some(metadata) = &cache_entry.metadata {
                    return Some(Arc::clone(metadata));
                }

                // We create a list of all types that we need to find in order to resolve the
                // current data type.
                let mut data_types_to_find = cache_entry
                    .data_type
                    .data_type_references()
                    .filter(|(data_type_ref, _edge)| {
                        // To prevent infinite loops, we only add the parent if it is not the same
                        // as the current data type.
                        data_type_ref.url != cache_entry.data_type.id
                    })
                    .map(|(data_type_ref, edge)| (data_type_ref.clone(), edge))
                    .collect::<Vec<_>>();

                let mut current_depth = 0;
                // We keep track of the inheritance depth of each data type in the inheritance
                // chain. We start with the current data type at depth 0. It's worth noting that the
                // type itself is not included in the inheritance chain, even if it is referenced in
                // the `allOf` field.
                let mut inheritance_depths = data_types_to_find
                    .iter()
                    .filter(|(_, edge)| *edge == DataTypeEdge::Inheritance)
                    .map(|(data_type_ref, _)| (data_type_ref.url.clone(), current_depth))
                    .collect::<HashMap<_, _>>();

                while !data_types_to_find.is_empty() {
                    // We extend `data_types_to_find` with the parents recursively until we either
                    // find all types or encounter a schema we already resolved. For this reason, we
                    // don't consume the vector here but use `mem::take` to move the vector out of
                    // the loop.
                    for (data_type_ref, edge) in mem::take(&mut data_types_to_find) {
                        let Some(entry) = self.get(&data_type_ref.url) else {
                            // We ignore any missing schemas here and continue to resolve to find
                            // all missing schemas.
                            missing_schemas.insert(data_type_ref.url.clone());
                            continue;
                        };

                        if let Some(metadata) = &entry.metadata {
                            // If we already resolved the metadata for this schema, we update the
                            // inheritance depth of the current data type.
                            for (data_type_ref, depth) in &metadata.inheritance_depths {
                                if current_data_type_id != *data_type_ref {
                                    match inheritance_depths.raw_entry_mut().from_key(data_type_ref)
                                    {
                                        RawEntryMut::Occupied(mut entry) => {
                                            *entry.get_mut() =
                                                cmp::min(*depth + current_depth + 1, *entry.get());
                                        }
                                        RawEntryMut::Vacant(entry) => {
                                            entry.insert(
                                                data_type_ref.clone(),
                                                *depth + current_depth + 1,
                                            );
                                        }
                                    }
                                }
                            }
                        } else {
                            if current_data_type_id != entry.data_type.id
                                && edge == DataTypeEdge::Inheritance
                            {
                                inheritance_depths
                                    .insert(entry.data_type.id.clone(), current_depth);
                            }
                            // We encountered a schema that we haven't resolved yet. We add it to
                            // the list of schemas to find and update the inheritance depth of the
                            // current type.
                            data_types_to_find.extend(
                                entry
                                    .data_type
                                    .data_type_references()
                                    .filter(|(data_type_ref, _)| {
                                        // To prevent infinite loops, we only add references it was
                                        // not already processed.
                                        !processed_schemas.contains(&data_type_ref.url)
                                    })
                                    .map(|(data_type_ref, edge)| (data_type_ref.clone(), edge)),
                            );
                        }
                    }
                    // As we resolve all parents in the current depth, we increment the depth for
                    // the next iteration.
                    current_depth += 1;
                }

                // We create the resolved metadata for the current data type and update the cache
                // so that we don't need to resolve it again.
                let resolved = Arc::new(ClosedDataTypeMetadata { inheritance_depths });
                self.update_metadata(&current_data_type_id, Arc::clone(&resolved));
                Some(resolved)
            })
            .collect();

        missing_schemas
            .is_empty()
            .then_some(resolved_types)
            .ok_or_else(|| {
                Report::from(DataTypeResolveError::MissingSchemas {
                    schemas: missing_schemas,
                })
            })
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
        self.constraints.validate_value(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::tests::{ensure_validation_from_str, JsonEqualityCheck};

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
    async fn empty_list() {
        ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::EMPTY_LIST_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }
}
