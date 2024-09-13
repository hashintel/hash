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
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::data_type::constraint::{extend_report, ConstraintError, StringFormat},
    url::VersionedUrl,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "kebab-case")]
pub enum JsonSchemaValueType {
    Null,
    Boolean,
    Number,
    Integer,
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
            Self::Integer => fmt.write_str("integer"),
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

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename = "DataType", rename_all = "camelCase", deny_unknown_fields)]
pub struct DataType {
    #[serde(rename = "$schema")]
    pub schema: DataTypeSchemaTag,
    pub kind: DataTypeTag,
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[DataTypeReference, ...DataTypeReference[]]")
    )]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub all_of: Vec<DataTypeReference>,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    // constraints for any types
    #[serde(rename = "type", with = "json_type")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "JsonSchemaValueType | JsonSchemaValueType[]")
    )]
    pub json_type: HashSet<JsonSchemaValueType>,
    #[serde(rename = "const", default, skip_serializing_if = "Option::is_none")]
    pub const_value: Option<JsonValue>,
    #[serde(rename = "enum", default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonValue, ...JsonValue[]]"))]
    pub enum_values: Vec<JsonValue>,

    // constraints for number types
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple_of: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_maximum: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_minimum: bool,

    // constraints for string types
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::regex::option"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "string"))]
    pub pattern: Option<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

mod json_type {
    use std::collections::HashSet;

    use serde::{Deserialize, Serialize};

    use crate::schema::JsonSchemaValueType;

    #[derive(Serialize, Deserialize)]
    #[serde(untagged)]
    enum MaybeSet {
        Value(JsonSchemaValueType),
        Set(HashSet<JsonSchemaValueType>),
    }

    pub(super) fn serialize<S>(
        types: &HashSet<JsonSchemaValueType>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        if types.len() == 1 {
            types
                .iter()
                .next()
                .expect("Set should have exactly one element")
                .serialize(serializer)
        } else {
            types.serialize(serializer)
        }
    }

    pub(super) fn deserialize<'de, D>(
        deserializer: D,
    ) -> Result<HashSet<JsonSchemaValueType>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        MaybeSet::deserialize(deserializer).map(|value| match value {
            MaybeSet::Value(value) => HashSet::from([value]),
            MaybeSet::Set(set) => set,
        })
    }
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
        let mut result = Ok::<(), Report<ConstraintError>>(());

        if let Some(const_value) = &self.const_value {
            if value != const_value {
                extend_report!(
                    result,
                    ConstraintError::Const {
                        actual: value.clone(),
                        expected: const_value.clone()
                    }
                );
            }
        }
        if !self.enum_values.is_empty() && !self.enum_values.contains(value) {
            extend_report!(
                result,
                ConstraintError::Enum {
                    actual: value.clone(),
                    expected: self.enum_values.clone()
                }
            );
        }

        match value {
            JsonValue::Null => {
                constraint::check_null_constraints(self, &mut result);
            }
            JsonValue::Bool(boolean) => {
                constraint::check_boolean_constraints(*boolean, self, &mut result);
            }
            JsonValue::Number(number) => {
                if let Some(number) = number.as_f64() {
                    constraint::check_numeric_constraints(number, self, &mut result);
                } else {
                    extend_report!(
                        result,
                        ConstraintError::InsufficientPrecision {
                            actual: number.clone()
                        }
                    );
                }
            }
            JsonValue::String(string) => {
                constraint::check_string_constraints(string, self, &mut result);
            }
            JsonValue::Array(array) => {
                constraint::check_array_constraints(array, self, &mut result);
            }
            JsonValue::Object(object) => {
                constraint::check_object_constraints(object, self, &mut result);
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {

    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::*;
    use crate::{
        utils::tests::{
            ensure_failed_deserialization, ensure_failed_validation, ensure_validation,
            ensure_validation_from_str, JsonEqualityCheck,
        },
        Validator,
    };

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

    #[tokio::test]
    #[expect(clippy::too_many_lines, reason = "Test data is included in this test")]
    async fn inheritance() {
        let value = Arc::new(
            ensure_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
                  "title": "Value",
                  "description": "Any value",
                  "type": "string"
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes,
            )
            .await
            .into_inner(),
        );

        let number = Arc::new(
            ensure_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                  "allOf": [
                    { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1" }
                  ],
                  "title": "Number",
                  "description": "A number",
                  "type": "number"
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes,
            )
            .await
            .into_inner(),
        );

        let unsigned_number = Arc::new(ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/unsigned-number/v/1",
              "allOf": [
                { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
              ],
              "title": "Unsigned Number",
              "description": "A positive number",
              "type": "integer",
              "minimum": 0.0,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner());

        let integer = Arc::new(ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/integer/v/1",
              "allOf": [
                { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
              ],
              "title": "Integer",
              "description": "An integer",
              "type": "integer",
              "multipleOf": 1.0
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner());

        let unsigned_integer = Arc::new(ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/unsigned-integer/v/1",
              "allOf": [
                { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/unsigned-number/v/1" },
                { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/integer/v/1" },
              ],
              "title": "Unsigned Integer",
              "description": "A positive integer",
              "type": "integer"
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner());

        let mut resolver = OntologyTypeResolver::default();
        let err = resolver
            .resolve_data_type_metadata([Arc::clone(&unsigned_integer)])
            .expect_err("Resolved data type with unresolved references");
        let DataTypeResolveError::MissingSchemas {
            schemas: unresolved_schemas,
        } = err.current_context()
        else {
            panic!("Expected missing schemas error");
        };

        assert_eq!(
            *unresolved_schemas,
            HashSet::from([unsigned_number.id.clone(), integer.id.clone()])
        );

        let data_types = [
            Arc::clone(&value),
            Arc::clone(&number),
            Arc::clone(&integer),
            Arc::clone(&unsigned_number),
            Arc::clone(&unsigned_integer),
        ];
        let mut resolver = OntologyTypeResolver::default();
        let [
            closed_value_metadata,
            closed_number_metadata,
            closed_integer_metadata,
            closed_unsigned_number_metadata,
            closed_unsigned_integer_metadata,
        ]: [Arc<ClosedDataTypeMetadata>; 5] = resolver
            .resolve_data_type_metadata(data_types.iter().cloned())
            .expect("Failed to resolve data types")
            .try_into()
            .expect("Failed to convert to array");

        let closed_value = resolver
            .get_closed_data_type(&value.id)
            .expect("Failed to get closed data type");
        assert_eq!(closed_value_metadata.inheritance_depths, HashMap::new());
        assert_eq!(json!(closed_value.schema), json!(value));
        assert_eq!(json!(closed_value.definitions), json!({}));
        DataTypeValidator
            .validate_ref(&closed_value)
            .await
            .expect("Failed to validate closed data type");

        let closed_number = resolver
            .get_closed_data_type(&number.id)
            .expect("Failed to get closed data type");
        assert_eq!(
            closed_number_metadata.inheritance_depths,
            HashMap::from([(value.id.clone(), 0)])
        );
        assert_eq!(json!(closed_number.schema), json!(number));
        assert_eq!(
            json!(closed_number.definitions),
            json!({
                value.id.to_string(): value,
            })
        );
        DataTypeValidator
            .validate_ref(&closed_number)
            .await
            .expect("Failed to validate closed data type");

        let closed_integer = resolver
            .get_closed_data_type(&integer.id)
            .expect("Failed to get closed data type");
        assert_eq!(
            closed_integer_metadata.inheritance_depths,
            HashMap::from([(value.id.clone(), 1), (number.id.clone(), 0)])
        );
        assert_eq!(json!(closed_integer.schema), json!(integer));
        assert_eq!(
            json!(closed_integer.definitions),
            json!({
                value.id.to_string(): value,
                number.id.to_string(): number,
            })
        );
        DataTypeValidator
            .validate_ref(&closed_integer)
            .await
            .expect("Failed to validate closed data type");

        let closed_unsigned_number = resolver
            .get_closed_data_type(&unsigned_number.id)
            .expect("Failed to get closed data type");
        assert_eq!(
            closed_unsigned_number_metadata.inheritance_depths,
            HashMap::from([(value.id.clone(), 1), (number.id.clone(), 0)])
        );
        assert_eq!(json!(closed_unsigned_number.schema), json!(unsigned_number));
        assert_eq!(
            json!(closed_unsigned_number.definitions),
            json!({
                value.id.to_string(): value,
                number.id.to_string(): number,
            })
        );
        DataTypeValidator
            .validate_ref(&closed_unsigned_number)
            .await
            .expect("Failed to validate closed data type");

        let closed_unsigned_integer = resolver
            .get_closed_data_type(&unsigned_integer.id)
            .expect("Failed to get closed data type");
        assert_eq!(
            closed_unsigned_integer_metadata.inheritance_depths,
            HashMap::from([
                (value.id.clone(), 2),
                (number.id.clone(), 1),
                (unsigned_number.id.clone(), 0),
                (integer.id.clone(), 0)
            ])
        );
        assert_eq!(
            json!(closed_unsigned_integer.schema),
            json!(unsigned_integer)
        );
        assert_eq!(
            json!(closed_unsigned_integer.definitions),
            json!({
                value.id.to_string(): value,
                number.id.to_string(): number,
                unsigned_number.id.to_string(): unsigned_number,
                integer.id.to_string(): integer,
            })
        );
        DataTypeValidator
            .validate_ref(&closed_unsigned_integer)
            .await
            .expect("Failed to validate closed data type");

        let mut resolver = OntologyTypeResolver::default();
        resolver.add_closed(Arc::clone(&number), Arc::clone(&closed_number_metadata));
        resolver.add_closed(Arc::clone(&integer), Arc::clone(&closed_integer_metadata));
        assert_eq!(
            json!(closed_value),
            json!(value),
            "The value data type schema should be the same as the closed schema"
        );

        let resolved_a = resolver
            .resolve_data_type_metadata([
                Arc::clone(&unsigned_integer),
                Arc::clone(&unsigned_number),
            ])
            .expect("Failed to resolve data types");
        assert_eq!(
            json!(resolved_a),
            json!([
                closed_unsigned_integer_metadata,
                closed_unsigned_number_metadata
            ])
        );

        let mut resolver = OntologyTypeResolver::default();
        resolver.add_closed(
            Arc::clone(&unsigned_number),
            Arc::clone(&closed_unsigned_number_metadata),
        );
        let resolved_b = resolver
            .resolve_data_type_metadata([unsigned_integer, integer, number, value])
            .expect("Failed to resolve data types");
        assert_eq!(
            json!(resolved_b),
            json!([
                closed_unsigned_integer_metadata,
                closed_integer_metadata,
                closed_number_metadata,
                closed_value_metadata,
            ])
        );
    }

    #[tokio::test]
    async fn cyclic_inheritance() {
        let first = Arc::new(
            ensure_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/first/v/1",
                  "allOf": [
                    { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/second/v/1" }
                  ],
                  "title": "Type A",
                  "description": "First data type inheriting from B",
                  "type": "string"
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes,
            )
                .await
                .into_inner(),
        );
        let second = Arc::new(
            ensure_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/second/v/1",
                  "allOf": [
                    { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/first/v/1" }
                  ],
                  "title": "Type B",
                  "description": "First data type inheriting from A",
                  "type": "string"
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes,
            )
            .await
            .into_inner(),
        );

        let mut resolver = OntologyTypeResolver::default();
        let [first_metadata, second_metadata]: [_; 2] = resolver
            .resolve_data_type_metadata([Arc::clone(&first), Arc::clone(&second)])
            .expect("Resolved data type with unresolved references")
            .try_into()
            .expect("Failed to return metadata array");

        assert_eq!(
            first_metadata.inheritance_depths,
            HashMap::from([(second.id.clone(), 0)])
        );
        assert_eq!(
            second_metadata.inheritance_depths,
            HashMap::from([(first.id.clone(), 0)])
        );
    }

    #[tokio::test]
    async fn recursive_inheritance() {
        let value = Arc::new(
            ensure_validation::<DataType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
                  "allOf": [
                    { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1" }
                  ],
                  "title": "Value",
                  "description": "Any value",
                  "type": "string"
                }),
                DataTypeValidator,
                JsonEqualityCheck::Yes,
            )
            .await
            .into_inner(),
        );

        let mut resolver = OntologyTypeResolver::default();
        let [metadata]: [_; 1] = resolver
            .resolve_data_type_metadata([Arc::clone(&value)])
            .expect("Resolved data type with unresolved references")
            .try_into()
            .expect("Failed to return metadata array");

        assert!(metadata.inheritance_depths.is_empty());
    }

    #[tokio::test]
    async fn invalid_enum_values() {
        ensure_failed_validation::<DataType, _>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/small/v/1",
                  "title": "Small number",
                  "description": "A small number",
                  "type": "number",
                  "const": [0],
                  "enum": [0, 1, 2, 3]
                }
            ),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;
    }

    #[test]
    fn invalid_schema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";

        ensure_failed_deserialization::<DataType>(
            json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            &"unknown variant `https://blockprotocol.org/types/modules/graph/0.3/schema/foo`, expected `https://blockprotocol.org/types/modules/graph/0.3/schema/data-type`",
        );
    }

    #[test]
    fn invalid_id() {
        ensure_failed_deserialization::<DataType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1.5",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            &"additional end content: .5",
        );
    }
}
