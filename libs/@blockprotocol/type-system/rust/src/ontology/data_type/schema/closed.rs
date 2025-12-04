use alloc::sync::Arc;
use core::{cmp, iter};
use std::collections::{HashMap, hash_map::Entry};

use error_stack::{Report, bail};
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

use super::{DataType, DataTypeEdge, ValueLabel};
use crate::{
    knowledge::PropertyValue,
    ontology::{
        InheritanceDepth, VersionedUrl, data_type::DataTypeUuid, json_schema::ValueConstraints,
    },
};

/// A fully resolved data type with all inherited constraints and metadata.
///
/// A closed data type combines its own constraints with those inherited from parent
/// data types (via `allOf` references). It represents the complete set of constraints
/// and metadata that apply to a particular data type after resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedDataType {
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub description: String,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,

    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[ValueConstraints, ...ValueConstraints[]]")
    )]
    pub all_of: Vec<ValueConstraints>,
    pub r#abstract: bool,
}

/// Errors that can occur when resolving a data type into a closed form.
///
/// These errors represent various issues that may arise during the resolution process,
/// such as ambiguous or missing metadata, incompatible or unsatisfiable constraints,
/// or constraint validation failures.
#[derive(Debug, Error)]
pub enum ResolveClosedDataTypeError {
    #[error(
        "The metadata (such as description or label) is ambiguous. This happens if the schema \
         itself does not specify metadata but two parents at the same inheritance depth do."
    )]
    AmbiguousMetadata,
    #[error("No description was found for the schema.")]
    MissingDescription,
    #[error("The data type constraints intersected to different types.")]
    IntersectedDifferentTypes,
    #[error("The value {} does not satisfy the constraint: {}", .0, json!(.1))]
    UnsatisfiedConstraint(PropertyValue, ValueConstraints),
    #[error("The value {0} does not satisfy the constraint")]
    UnsatisfiedEnumConstraintVariant(PropertyValue),
    #[error("No value satisfy the constraint: {}", json!(.0))]
    UnsatisfiedEnumConstraint(ValueConstraints),
    #[error("Conflicting const values: {0} and {1}")]
    ConflictingConstValues(PropertyValue, PropertyValue),
    #[error("Conflicting enum values, no common values found: {} and {}", json!(.0), json!(.1))]
    ConflictingEnumValues(Vec<PropertyValue>, Vec<PropertyValue>),
    #[error("The const value is not in the enum values: {} and {}", .0, json!(.1))]
    ConflictingConstEnumValue(PropertyValue, Vec<PropertyValue>),
    #[error("The constraint is unsatisfiable: {}", json!(.0))]
    UnsatisfiableConstraint(ValueConstraints),
    #[error("The constraints are incompatible: {} <=> {}", json!(.0), json!(.1))]
    IncompatibleConstraints(ValueConstraints, ValueConstraints),
    #[error("The combined constraints results in an empty `anyOf`")]
    EmptyAnyOf,
}

impl ClosedDataType {
    /// Creates a closed data type from a resolved data type.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The metadata (such as description or label) is ambiguous, e.g. when two parents at the
    ///   same inheritance depth specify different metadata.
    /// - No description was found for the schema or any parent schema.
    pub fn from_resolve_data(
        data_type: DataType,
        resolve_data: &DataTypeResolveData,
    ) -> Result<Self, Report<ResolveClosedDataTypeError>> {
        let metadata_schema = if data_type.label.is_empty() || data_type.icon.is_none() {
            resolve_data.find_metadata_schema()?
        } else {
            None
        };

        let label = if data_type.label.is_empty() {
            metadata_schema
                .map(|schema| schema.label.clone())
                .unwrap_or_default()
        } else {
            data_type.label
        };

        let icon = if data_type.icon.is_none() {
            metadata_schema
                .map(|schema| schema.icon.clone())
                .unwrap_or_default()
        } else {
            data_type.icon.clone()
        };

        Ok(Self {
            id: data_type.id.clone(),
            title: data_type.title.clone(),
            title_plural: data_type.title_plural.clone(),
            icon,
            description: data_type.description.clone(),
            label,
            all_of: ValueConstraints::fold_intersections(
                iter::once(data_type.constraints).chain(resolve_data.constraints().cloned()),
            )?,
            r#abstract: data_type.r#abstract,
        })
    }
}

#[derive(Debug, Default, Clone)]
pub struct DataTypeResolveData {
    inheritance_depths: HashMap<DataTypeUuid, (InheritanceDepth, Arc<DataType>)>,
}

impl DataTypeResolveData {
    /// Adds an edge from this data type to a target data type.
    ///
    /// Records an inheritance relationship between this data type and the target,
    /// storing both the target reference and the inheritance depth. If an edge to
    /// the same target already exists, the minimum depth is kept.
    pub fn add_edge(
        &mut self,
        edge: DataTypeEdge,
        target: Arc<DataType>,
        target_id: DataTypeUuid,
        depth: u16,
    ) {
        let depth = InheritanceDepth::new(depth);
        match edge {
            DataTypeEdge::Inheritance => match self.inheritance_depths.entry(target_id) {
                Entry::Occupied(mut entry) => {
                    entry.get_mut().0 = cmp::min(depth, entry.get().0);
                }
                Entry::Vacant(entry) => {
                    entry.insert((depth, target));
                }
            },
        }
    }

    /// Extends this resolve data with edges from another resolve data instance.
    ///
    /// Merges inheritance relationships from the other instance into this one,
    /// offsetting the depths by the specified amount. For duplicate edges, the
    /// minimum depth is preserved.
    pub fn extend_edges(&mut self, depth_offset: u16, other: &Self) {
        for (target_id, (relative_depth, schema)) in &other.inheritance_depths {
            let absolut_depth = InheritanceDepth::new(relative_depth.inner() + depth_offset);
            match self.inheritance_depths.entry(*target_id) {
                Entry::Occupied(mut entry) => {
                    entry.get_mut().0 = cmp::min(absolut_depth, entry.get().0);
                }
                Entry::Vacant(entry) => {
                    entry.insert((absolut_depth, Arc::clone(schema)));
                }
            }
        }
    }

    /// Returns an iterator over all inheritance relationships with their depths.
    ///
    /// The iterator yields pairs of ([`DataTypeUuid`], [`InheritanceDepth`]) for all
    /// data types that this data type inherits from.
    pub fn inheritance_depths(&self) -> impl Iterator<Item = (DataTypeUuid, InheritanceDepth)> {
        self.inheritance_depths
            .iter()
            .map(|(id, (depth, _))| (*id, *depth))
    }

    /// Returns an iterator over the schemas ordered by inheritance depth and data type id.
    fn ordered_schemas(&self) -> impl Iterator<Item = (InheritanceDepth, &DataType)> {
        // TODO: Construct the sorted list on the fly when constructing this struct
        self.inheritance_depths
            .iter()
            .sorted_by_key(|(data_type_id, (depth, _))| (*depth, data_type_id.into_uuid()))
            .map(|(_, (depth, schema))| (*depth, &**schema))
    }

    /// Resolves the metadata schema for the data type.
    ///
    /// # Errors
    ///
    /// Returns an error if the metadata is ambiguous. This is the case if two schemas at the same
    /// inheritance depth specify different metadata.
    pub fn find_metadata_schema(
        &self,
    ) -> Result<Option<&DataType>, Report<ResolveClosedDataTypeError>> {
        let mut found_schema_data = None::<(InheritanceDepth, &DataType)>;
        for (depth, stored_schema) in self.ordered_schemas() {
            if !stored_schema.label.is_empty() {
                if let Some((found_depth, found_schema)) = found_schema_data {
                    match depth.cmp(&found_depth) {
                        cmp::Ordering::Less => {
                            found_schema_data = Some((depth, found_schema));
                        }
                        cmp::Ordering::Equal => {
                            if stored_schema.description != found_schema.description
                                || stored_schema.label != found_schema.label
                                || stored_schema.icon != found_schema.icon
                            {
                                bail!(ResolveClosedDataTypeError::AmbiguousMetadata);
                            }
                        }
                        cmp::Ordering::Greater => {
                            // We have covered all schemas with an inheritance depth less than the
                            // current schema, so we can break early
                            break;
                        }
                    }
                } else {
                    found_schema_data = Some((depth, stored_schema));
                }
            }
        }

        Ok(found_schema_data.map(|(_, schema)| schema))
    }

    /// Returns an iterator over all constraints from inherited data types.
    ///
    /// The iterator yields constraints in order of inheritance depth, with
    /// shallower inheritance (lower depth values) coming first.
    pub fn constraints(&self) -> impl Iterator<Item = &ValueConstraints> {
        self.ordered_schemas()
            .map(|(_, schema)| &schema.constraints)
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use itertools::Itertools as _;
    use serde_json::json;

    use super::ClosedDataType;
    use crate::{
        ontology::{
            data_type::{DataType, DataTypeUuid, schema::DataTypeValidator},
            json_schema::OntologyTypeResolver,
        },
        utils::tests::{JsonEqualityCheck, ensure_validation, ensure_validation_from_str},
    };

    struct DataTypeDefinitions {
        value: DataType,
        number: DataType,
        integer: DataType,
        unsigned: DataType,
        unsigned_int: DataType,
        small: DataType,
        unsigned_small_int: DataType,
    }

    #[expect(clippy::too_many_lines, reason = "Test seeding")]
    async fn seed() -> DataTypeDefinitions {
        let value = ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::VALUE_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        let mut number = ensure_validation_from_str::<DataType, _>(
            hash_graph_test_data::data_type::NUMBER_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();
        number.label.right = Some("f64".to_owned());
        number.icon = Some("\u{1f522}".to_owned());

        let integer = ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://example.com/data-type/integer/v/1",
              "title": "Integer",
              "description": "A signed integer.",
              "allOf": [{ "$ref": number.id }],
              "type": "number",
              "abstract": false,
              "multipleOf": 1.0,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        let unsigned = ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://example.com/data-type/unsigned/v/1",
              "title": "Unsigned",
              "description": "An unsigned number.",
              "allOf": [{ "$ref": number.id }],
              "type": "number",
              "abstract": false,
              "minimum": 0.0,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        let unsigned_int = ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://example.com/data-type/unsigned-int/v/1",
              "title": "Unsigned Integer",
              "description": "An unsigned integer.",
              "allOf": [{ "$ref": integer.id }, { "$ref": unsigned.id }],
              "type": "number",
              "maximum": 4_294_967_295.0,
              "abstract": false,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        let small = ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://example.com/data-type/very-small/v/1",
              "title": "Small number",
              "description": "A small number",
              "label": { "right": "i8" },
              "icon": "\u{1f539}",
              "allOf": [{ "$ref": number.id }],
              "type": "number",
              "maximum": 255.0,
              "abstract": false,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        let unsigned_small_int = ensure_validation::<DataType, _>(
            json!({
              "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
              "kind": "dataType",
              "$id": "https://example.com/data-type/unsigned-small-int/v/1",
              "title": "Unsigned Integer",
              "description": "An unsigned integer.",
              "allOf": [{ "$ref": unsigned_int.id }, { "$ref": small.id }],
              "type": "number",
              "maximum": 100.0,
              "abstract": false,
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await
        .into_inner();

        DataTypeDefinitions {
            value,
            number,
            integer,
            unsigned,
            unsigned_int,
            small,
            unsigned_small_int,
        }
    }

    fn check_closed_value(value: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(value.id, defs.value.id);
        assert_eq!(value.title, defs.value.title);
        assert_eq!(value.title_plural, defs.value.title_plural);
        assert_eq!(value.description, defs.value.description);
        assert_eq!(value.label, defs.value.label);
        assert_eq!(value.icon, defs.value.icon);
        assert_eq!(value.r#abstract, defs.value.r#abstract);
        assert_eq!(json!(value.all_of), json!([defs.value.constraints]));
    }

    fn check_closed_number(number: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(number.id, defs.number.id);
        assert_eq!(number.title, defs.number.title);
        assert_eq!(number.title_plural, defs.number.title_plural);
        assert_eq!(number.description, defs.number.description);
        assert_eq!(number.label, defs.number.label);
        assert_eq!(number.icon, defs.number.icon);
        assert_eq!(number.r#abstract, defs.number.r#abstract);
        assert_eq!(json!(number.all_of), json!([defs.number.constraints]));
    }

    fn check_closed_integer(integer: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(integer.id, defs.integer.id);
        assert_eq!(integer.title, defs.integer.title);
        assert_eq!(integer.title_plural, defs.integer.title_plural);
        assert_eq!(integer.description, defs.integer.description);
        assert_eq!(integer.label, defs.number.label);
        assert_eq!(integer.icon, defs.number.icon);
        assert_eq!(integer.r#abstract, defs.integer.r#abstract);
        assert_eq!(json!(integer.all_of), json!([defs.integer.constraints]));
    }

    fn check_closed_unsigned(unsigned: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(unsigned.id, defs.unsigned.id);
        assert_eq!(unsigned.title, defs.unsigned.title);
        assert_eq!(unsigned.title_plural, defs.unsigned.title_plural);
        assert_eq!(unsigned.description, defs.unsigned.description);
        assert_eq!(unsigned.label, defs.number.label);
        assert_eq!(unsigned.icon, defs.number.icon);
        assert_eq!(unsigned.r#abstract, defs.unsigned.r#abstract);
        assert_eq!(json!(unsigned.all_of), json!([defs.unsigned.constraints]));
    }

    fn check_closed_unsigned_int(unsigned_int: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(unsigned_int.id, defs.unsigned_int.id);
        assert_eq!(unsigned_int.title, defs.unsigned_int.title);
        assert_eq!(unsigned_int.title_plural, defs.unsigned_int.title_plural);
        assert_eq!(unsigned_int.description, defs.unsigned_int.description);
        assert_eq!(unsigned_int.label, defs.number.label);
        assert_eq!(unsigned_int.icon, defs.number.icon);
        assert_eq!(unsigned_int.r#abstract, defs.unsigned_int.r#abstract);
        assert_eq!(
            json!(unsigned_int.all_of),
            json!([
                {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 4_294_967_295.0,
                    "multipleOf": 1.0,
                }
            ])
        );
    }

    fn check_closed_small(small: &ClosedDataType, defs: &DataTypeDefinitions) {
        assert_eq!(small.id, defs.small.id);
        assert_eq!(small.title, defs.small.title);
        assert_eq!(small.title_plural, defs.small.title_plural);
        assert_eq!(small.description, defs.small.description);
        assert_eq!(small.label, defs.small.label);
        assert_eq!(small.icon, defs.small.icon);
        assert_eq!(small.r#abstract, defs.small.r#abstract);
        assert_eq!(json!(small.all_of), json!([defs.small.constraints]));
    }

    fn check_closed_unsigned_small_int(
        unsigned_small_int: &ClosedDataType,
        defs: &DataTypeDefinitions,
    ) {
        assert_eq!(unsigned_small_int.id, defs.unsigned_small_int.id);
        assert_eq!(unsigned_small_int.title, defs.unsigned_small_int.title);
        assert_eq!(
            unsigned_small_int.title_plural,
            defs.unsigned_small_int.title_plural
        );
        assert_eq!(
            unsigned_small_int.description,
            defs.unsigned_small_int.description
        );
        assert_eq!(unsigned_small_int.label, defs.small.label);
        assert_eq!(unsigned_small_int.icon, defs.small.icon);
        assert_eq!(
            unsigned_small_int.r#abstract,
            defs.unsigned_small_int.r#abstract
        );
        assert_eq!(
            json!(unsigned_small_int.all_of),
            json!([
                {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 100.0,
                    "multipleOf": 1.0,
                }
            ])
        );
    }

    #[tokio::test]
    async fn resolve() {
        let defs = seed().await;

        let permutations = [
            (
                defs.value.clone(),
                check_closed_value as fn(&ClosedDataType, &DataTypeDefinitions),
            ),
            (defs.number.clone(), check_closed_number),
            (defs.integer.clone(), check_closed_integer),
            (defs.unsigned.clone(), check_closed_unsigned),
            (defs.unsigned_int.clone(), check_closed_unsigned_int),
            (defs.small.clone(), check_closed_small),
            (
                defs.unsigned_small_int.clone(),
                check_closed_unsigned_small_int,
            ),
        ];

        for definitions in permutations.iter().permutations(permutations.len()) {
            let mut resolver = OntologyTypeResolver::default();
            for definition in &definitions {
                resolver.add_unresolved_data_type(
                    DataTypeUuid::from_url(&definition.0.id),
                    Arc::new(definition.0.clone()),
                );
            }

            for (data_type, check) in definitions {
                let closed = ClosedDataType::from_resolve_data(
                    data_type.clone(),
                    &resolver
                        .resolve_data_type_metadata(DataTypeUuid::from_url(&data_type.id))
                        .unwrap_or_else(|error| {
                            panic!("Failed to resolve {}: {error:?}", data_type.id)
                        }),
                )
                .unwrap_or_else(|error| {
                    panic!(
                        "Failed to create closed data type for {}: {error:?}",
                        data_type.id
                    )
                });
                check(&closed, &defs);
            }
        }
    }
}
