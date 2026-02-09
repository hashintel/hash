mod closed;
mod constraints;
mod validation;

use core::{iter, ptr};
use std::collections::{HashMap, HashSet, hash_map::Entry};

pub use self::{
    closed::{
        ClosedEntityType, ClosedEntityTypeMetadata, ClosedMultiEntityType, EntityTypeResolveData,
        ResolveClosedEntityTypeError,
    },
    constraints::EntityConstraints,
    validation::{EntityTypeValidationError, EntityTypeValidator},
};
use super::EntityTypeMetadata;
use crate::ontology::{
    BaseUrl, OntologyTypeReference, OntologyTypeSchema, VersionedUrl,
    json_schema::{ObjectTypeTag, OneOfSchema},
    property_type::schema::{PropertyTypeReference, PropertyValueArray, ValueOrArray},
};

#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InverseEntityTypeMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
}

impl InverseEntityTypeMetadata {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.title.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeKindTag {
    EntityType,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeSchemaTag {
    #[serde(rename = "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type")]
    V3,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTypeSchemaMetadata {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    pub description: String,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    pub inverse: InverseEntityTypeMetadata,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTypeDisplayMetadata {
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub depth: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Defines the structure of entities with properties and links.
///
/// ## Core Concepts
///
/// An [`EntityType`] defines:
///
/// - A unique identifier (`$id`) as a [`VersionedUrl`]
/// - A title, optional plural title, and description
/// - Required and optional properties using [`PropertyType`] references
/// - Links to other entity types, defining the entity graph structure
/// - Inheritance from other entity types via `all_of` references
/// - Optional display metadata like `label_property` and `icon`
///
/// [`PropertyType`]: crate::ontology::property_type::PropertyType
///
/// ## Entity Type Structure
///
/// Entity types combine several key elements:
///
/// 1. **Properties** - References to property types that define the entity's data structure
/// 2. **Links** - References to other entity types that this entity can link to
/// 3. **Inheritance** - References to parent entity types whose structure is inherited
///
/// ## Inheritance and Composition
///
/// Entity types support inheritance through the `all_of` field, which allows an entity type
/// to extend one or more parent entity types. The resulting entity type includes:
///
/// - All properties from parent entity types
/// - All links from parent entity types
/// - Additional properties and links defined directly on the entity type
///
/// ## Resolution and Closure
///
/// Entity types can reference property types, data types, and other entity types, creating
/// a complex graph of dependencies. The [`ClosedEntityType`] represents an entity type with
/// all references resolved, ready for validation.
///
/// ## Validation Process
///
/// The [`EntityTypeValidator`] validates entities against entity types:
///
/// 1. It ensures all required properties are present
/// 2. It validates each property value against its property type
/// 3. It validates links against their link constraints
/// 4. It applies constraints inherited from parent entity types
///
/// ## Example
///
/// A Person entity type with properties and links:
///
/// ```
/// use serde_json::json;
/// use type_system::{
///     ontology::{
///         entity_type::schema::EntityType,
///         BaseUrl,
///     },
/// };
///
/// // Define a Person entity type with properties and links
/// let person_json = json!({
///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
///     "kind": "entityType",
///     "type": "object",
///     "$id": "https://example.com/types/entity-type/person/v/1",
///     "title": "Person",
///     "description": "A human being",
///     "properties": {
///         "https://example.com/types/property-type/name/": {
///             "$ref": "https://example.com/types/property-type/name/v/1"
///         },
///         "https://example.com/types/property-type/email/": {
///             "$ref": "https://example.com/types/property-type/email/v/1"
///         },
///         "https://example.com/types/property-type/age/": {
///             "$ref": "https://example.com/types/property-type/age/v/1"
///         }
///     },
///     "required": ["https://example.com/types/property-type/name/"],
///     "links": {
///         "https://example.com/types/entity-type/friend-of/v/1": {
///             "type": "array",
///             "items": {
///                 "oneOf": [
///                     { "$ref": "https://example.com/types/entity-type/person/v/1" }
///                 ]
///             }
///         }
///     }
/// });
///
/// // Parse the entity type
/// let person = serde_json::from_value::<EntityType>(person_json).expect("Failed to parse entity type");
///
/// // Check basic metadata
/// assert_eq!(person.id.to_string(), "https://example.com/types/entity-type/person/v/1");
/// assert_eq!(person.title, "Person");
///
/// // Examine properties
/// let properties = &person.constraints.properties;
/// assert_eq!(properties.len(), 3);
///
/// // Check if a specific property exists
/// let name_url = BaseUrl::new("https://example.com/types/property-type/name/".to_string())
///     .expect("Should create a valid BaseUrl");
/// assert!(properties.contains_key(&name_url), "Should contain the name property");
///
/// // Check required properties
/// let required = &person.constraints.required;
/// assert!(required.contains(&name_url), "Name property should be required");
///
/// // Check links
/// let links = &person.constraints.links;
/// assert_eq!(links.len(), 1, "Should have exactly one link type");
/// ```
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityType {
    #[serde(rename = "$schema")]
    pub schema: EntityTypeSchemaTag,
    pub kind: EntityTypeKindTag,
    pub r#type: ObjectTypeTag,
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    pub description: String,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    pub inverse: InverseEntityTypeMetadata,
    #[serde(flatten)]
    pub constraints: EntityConstraints,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeReference, ...EntityTypeReference[]]")
    )]
    pub all_of: HashSet<EntityTypeReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartialEntityType {
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    pub description: String,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    pub inverse: InverseEntityTypeMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

impl From<EntityType> for PartialEntityType {
    fn from(value: EntityType) -> Self {
        Self {
            id: value.id,
            title: value.title,
            title_plural: value.title_plural,
            description: value.description,
            inverse: value.inverse,
            label_property: value.label_property,
            icon: value.icon,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum EntityTypeToEntityTypeEdge {
    Inheritance,
    Link,
    LinkDestination,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum EntityTypeToPropertyTypeEdge {
    Property,
}

impl EntityType {
    /// Returns an iterator over all entity type references used by this entity type.
    ///
    /// This method collects all references to other entity types from:
    ///
    /// 1. Inheritance relationships via the `all_of` field (parent entity types)
    /// 2. Link relationships via the `links` field (link types)
    /// 3. Link destination constraints (allowed destination entity types for links)
    ///
    /// Each reference is paired with an [`EntityTypeToEntityTypeEdge`] value indicating
    /// the relationship type between this entity type and the referenced entity type.
    ///
    /// # Examples
    ///
    /// ```
    /// use type_system::ontology::entity_type::schema::{EntityType, EntityTypeToEntityTypeEdge};
    /// use serde_json::json;
    ///
    /// let entity_type_json = json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    ///     "kind": "entityType",
    ///     "type": "object",
    ///     "$id": "https://example.com/types/entity-type/person/v/1",
    ///     "title": "Person",
    ///     "description": "A human being",
    ///     "properties": {},
    ///     "links": {
    ///         "https://example.com/types/entity-type/friend-of/v/1": {
    ///             "type": "array",
    ///             "items": {
    ///                 "oneOf": [
    ///                     { "$ref": "https://example.com/types/entity-type/person/v/1" }
    ///                 ]
    ///             }
    ///         }
    ///     }
    /// });
    ///
    /// let entity_type = serde_json::from_value::<EntityType>(entity_type_json)
    ///     .expect("Failed to parse entity type");
    ///
    /// for (reference, edge_type) in entity_type.entity_type_references() {
    ///     // Process each reference based on its relationship type
    ///     match edge_type {
    ///         EntityTypeToEntityTypeEdge::Inheritance => {
    ///             // Handle inheritance reference
    ///         },
    ///         EntityTypeToEntityTypeEdge::Link => {
    ///             // Handle link type reference
    ///         },
    ///         EntityTypeToEntityTypeEdge::LinkDestination => {
    ///             // Handle link destination reference
    ///         }
    ///     }
    /// }
    /// ```
    pub fn entity_type_references(
        &self,
    ) -> impl Iterator<Item = (&EntityTypeReference, EntityTypeToEntityTypeEdge)> {
        self.all_of
            .iter()
            .map(|reference| (reference, EntityTypeToEntityTypeEdge::Inheritance))
            .chain(self.constraints.links.iter().flat_map(
                |(link_entity_type, destination_constraint_entity_types)| {
                    iter::once((link_entity_type.into(), EntityTypeToEntityTypeEdge::Link)).chain(
                        destination_constraint_entity_types
                            .items
                            .iter()
                            .flat_map(|items| {
                                items.possibilities.iter().map(|reference| {
                                    (reference, EntityTypeToEntityTypeEdge::LinkDestination)
                                })
                            }),
                    )
                },
            ))
    }

    /// Returns an iterator over all property type references used by this entity type.
    ///
    /// This method collects all references to property types from the `properties` field
    /// of the entity type's constraints. It handles both direct property references and
    /// array property references, returning each with an [`EntityTypeToPropertyTypeEdge::Property`]
    /// marker to indicate the relationship type.
    ///
    /// # Examples
    ///
    /// ```
    /// use type_system::ontology::entity_type::schema::{EntityType, EntityTypeToPropertyTypeEdge};
    /// use serde_json::json;
    ///
    /// let entity_type_json = json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    ///     "kind": "entityType",
    ///     "type": "object",
    ///     "$id": "https://example.com/types/entity-type/person/v/1",
    ///     "title": "Person",
    ///     "description": "A human being",
    ///     "properties": {
    ///         "https://example.com/types/property-type/name/": {
    ///             "$ref": "https://example.com/types/property-type/name/v/1"
    ///         }
    ///     }
    /// });
    ///
    /// let entity_type = serde_json::from_value::<EntityType>(entity_type_json)
    ///     .expect("Failed to parse entity type");
    ///
    /// for (reference, edge_type) in entity_type.property_type_references() {
    ///     assert!(matches!(edge_type, EntityTypeToPropertyTypeEdge::Property));
    ///     // Process each property type reference
    /// }
    /// ```
    pub fn property_type_references(
        &self,
    ) -> impl Iterator<Item = (&PropertyTypeReference, EntityTypeToPropertyTypeEdge)> {
        self.constraints.properties.values().map(|property_def| {
            (
                match property_def {
                    ValueOrArray::Value(url) => url,
                    ValueOrArray::Array(array) => &array.items,
                },
                EntityTypeToPropertyTypeEdge::Property,
            )
        })
    }

    /// Returns an iterator over link entity types and their allowed destination entity types.
    ///
    /// This method extracts the link structure from the entity type, mapping each link type
    /// to its allowed destination entity types. The returned iterator yields pairs where:
    ///
    /// - The first element is a reference to the link entity type
    /// - The second element is an optional slice of allowed destination entity types (None if there
    ///   are no constraints on destinations)
    ///
    /// This mapping is useful for understanding the graph structure defined by the entity type.
    ///
    /// # Examples
    ///
    /// ```
    /// use type_system::ontology::entity_type::schema::EntityType;
    /// use serde_json::json;
    ///
    /// let entity_type_json = json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    ///     "kind": "entityType",
    ///     "type": "object",
    ///     "$id": "https://example.com/types/entity-type/person/v/1",
    ///     "title": "Person",
    ///     "description": "A human being",
    ///     "properties": {},
    ///     "links": {
    ///         "https://example.com/types/entity-type/friend-of/v/1": {
    ///             "type": "array",
    ///             "items": {
    ///                 "oneOf": [
    ///                     { "$ref": "https://example.com/types/entity-type/person/v/1" }
    ///                 ]
    ///             }
    ///         }
    ///     }
    /// });
    ///
    /// let entity_type = serde_json::from_value::<EntityType>(entity_type_json)
    ///     .expect("Failed to parse entity type");
    ///
    /// for (link_type, destination_types) in entity_type.link_mappings() {
    ///     // Process each link type and its destination constraints
    ///     println!("Link type: {}", link_type.url);
    ///     if let Some(destinations) = destination_types {
    ///         println!("Allowed destinations: {}", destinations.len());
    ///     } else {
    ///         println!("No destination constraints");
    ///     }
    /// }
    /// ```
    pub fn link_mappings(
        &self,
    ) -> impl Iterator<Item = (&EntityTypeReference, Option<&[EntityTypeReference]>)> {
        self.constraints.links.iter().map(
            |(link_entity_type, destination_constraint_entity_types)| {
                (
                    <&EntityTypeReference>::from(link_entity_type),
                    destination_constraint_entity_types
                        .items
                        .as_ref()
                        .map(|one_of| one_of.possibilities.as_slice()),
                )
            },
        )
    }
}

impl OntologyTypeSchema for EntityType {
    type Metadata = EntityTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        &self.id
    }

    fn references(&self) -> Vec<OntologyTypeReference<'_>> {
        self.entity_type_references()
            .map(|(reference, _)| OntologyTypeReference::EntityTypeReference(reference))
            .chain(
                self.property_type_references()
                    .map(|(reference, _)| OntologyTypeReference::PropertyTypeReference(reference)),
            )
            .collect()
    }
}

impl OntologyTypeSchema for ClosedEntityType {
    type Metadata = EntityTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        &self.id
    }

    fn references(&self) -> Vec<OntologyTypeReference<'_>> {
        let inheritance = self
            .all_of
            .iter()
            .map(|reference| OntologyTypeReference::EntityTypeReference((&reference.id).into()));
        let links = self.constraints.links.iter().flat_map(
            |(link_entity_type, destination_constraint_entity_types)| {
                iter::once(OntologyTypeReference::EntityTypeReference(
                    link_entity_type.into(),
                ))
                .chain(destination_constraint_entity_types.items.iter().flat_map(
                    |items| {
                        items
                            .possibilities
                            .iter()
                            .map(OntologyTypeReference::EntityTypeReference)
                    },
                ))
            },
        );
        let properties =
            self.constraints
                .properties
                .values()
                .map(|property_def| match property_def {
                    ValueOrArray::Value(url) => OntologyTypeReference::PropertyTypeReference(url),
                    ValueOrArray::Array(array) => {
                        OntologyTypeReference::PropertyTypeReference(&array.items)
                    }
                });

        inheritance.chain(links).chain(properties).collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(deny_unknown_fields)]
#[repr(transparent)]
pub struct EntityTypeReference {
    #[serde(rename = "$ref")]
    pub url: VersionedUrl,
}

impl From<&VersionedUrl> for &EntityTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<EntityTypeReference>() }
    }
}

fn extend_links(
    current: &mut HashMap<
        VersionedUrl,
        PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>,
    >,
    iter: impl IntoIterator<
        Item = (
            VersionedUrl,
            PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>,
        ),
    >,
) {
    for (id, new_destinations) in iter {
        match current.entry(id) {
            Entry::Vacant(entry) => {
                entry.insert(new_destinations);
            }
            Entry::Occupied(mut entry) => {
                let entry = entry.get_mut();
                let existing_destination_items = &mut entry.items;
                let new_destination_items = new_destinations.items;

                match (
                    new_destination_items.as_ref(),
                    existing_destination_items.as_mut(),
                ) {
                    (Some(destinations), Some(existing_destinations)) => {
                        existing_destinations
                            .possibilities
                            .retain(|existing_destination| {
                                destinations.possibilities.contains(existing_destination)
                            });
                    }
                    (Some(_), None) => {
                        *existing_destination_items = new_destination_items;
                    }
                    (None, _) => {}
                }

                match (new_destinations.min_items, entry.min_items) {
                    (Some(min_items), Some(existing_min_items)) => {
                        entry.min_items = Some(existing_min_items.max(min_items));
                    }
                    (Some(_), None) => {
                        entry.min_items = new_destinations.min_items;
                    }
                    (None, _) => {}
                }
                match (new_destinations.max_items, entry.max_items) {
                    (Some(max_items), Some(existing_max_items)) => {
                        entry.max_items = Some(existing_max_items.min(max_items));
                    }
                    (Some(_), None) => {
                        entry.max_items = new_destinations.max_items;
                    }
                    (None, _) => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        JsonEqualityCheck, ensure_failed_validation, ensure_validation_from_str,
    };

    fn test_property_type_references(
        entity_type: &EntityType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let property_type_references = entity_type
            .property_type_references()
            .map(
                |(property_type_ref, EntityTypeToPropertyTypeEdge::Property)| {
                    property_type_ref.url.clone()
                },
            )
            .collect::<HashSet<_>>();

        assert_eq!(property_type_references, expected_property_type_references);
    }

    fn test_link_mappings(
        entity_type: &EntityType,
        links: impl IntoIterator<Item = (&'static str, Vec<&'static str>)>,
    ) {
        let expected_link_entity_type_references = links
            .into_iter()
            .map(|(link_entity_type_url, entity_type_urls)| {
                (
                    VersionedUrl::from_str(link_entity_type_url).expect("invalid URL"),
                    entity_type_urls
                        .into_iter()
                        .map(|entity_type_url| {
                            VersionedUrl::from_str(entity_type_url).expect("invalid URL")
                        })
                        .collect::<Vec<_>>(),
                )
            })
            .collect::<HashMap<_, _>>();

        let link_entity_type_references = entity_type
            .link_mappings()
            .map(|(link_entity_type_url, entity_type_ref)| {
                (
                    link_entity_type_url.url.clone(),
                    entity_type_ref.map_or(vec![], |inner| {
                        inner
                            .iter()
                            .map(|reference| reference.url.clone())
                            .collect()
                    }),
                )
            })
            .collect::<HashMap<_, _>>();

        assert_eq!(
            link_entity_type_references,
            expected_link_entity_type_references
        );
    }

    #[tokio::test]
    async fn book() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::BOOK_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/name/v/1",
                "https://blockprotocol.org/@alice/types/property-type/blurb/v/1",
                "https://blockprotocol.org/@alice/types/property-type/published-on/v/1",
            ],
        );

        test_link_mappings(
            &entity_type,
            [(
                "https://blockprotocol.org/@alice/types/entity-type/written-by/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
            )],
        );
    }

    #[tokio::test]
    async fn address() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::UK_ADDRESS_V1,
            EntityTypeValidator,
            JsonEqualityCheck::No,
        )
        .await;

        test_property_type_references(
            &entity_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/address-line-1/v/1",
                "https://blockprotocol.org/@alice/types/property-type/postcode/v/1",
                "https://blockprotocol.org/@alice/types/property-type/city/v/1",
            ],
        );

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn organization() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::ORGANIZATION_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            ["https://blockprotocol.org/@alice/types/property-type/name/v/1"],
        );

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn building() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::BUILDING_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            ["https://blockprotocol.org/@alice/types/property-type/built-at/v/1"],
        );

        test_link_mappings(
            &entity_type,
            [
                (
                    "https://blockprotocol.org/@alice/types/entity-type/located-at/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/uk-address/v/1"],
                ),
                (
                    "https://blockprotocol.org/@alice/types/entity-type/tenant/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
                ),
            ],
        );
    }

    #[tokio::test]
    async fn person() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::PERSON_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/name/v/1",
                "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                "https://blockprotocol.org/@alice/types/property-type/interests/v/1",
            ],
        );

        test_link_mappings(
            &entity_type,
            [
                (
                    "https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
                ),
                (
                    "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
                ),
            ],
        );
    }

    #[tokio::test]
    async fn playlist() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::PLAYLIST_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            ["https://blockprotocol.org/@alice/types/property-type/name/v/1"],
        );

        test_link_mappings(
            &entity_type,
            [(
                "https://blockprotocol.org/@alice/types/entity-type/contains/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/song/v/1"],
            )],
        );
    }

    #[tokio::test]
    async fn song() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::SONG_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            ["https://blockprotocol.org/@alice/types/property-type/name/v/1"],
        );

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn page() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            hash_graph_test_data::entity_type::PAGE_V2,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(
            &entity_type,
            ["https://blockprotocol.org/@alice/types/property-type/text/v/1"],
        );

        test_link_mappings(
            &entity_type,
            [
                (
                    "https://blockprotocol.org/@alice/types/entity-type/written-by/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
                ),
                (
                    "https://blockprotocol.org/@alice/types/entity-type/contains/v/1",
                    vec!["https://blockprotocol.org/@alice/types/entity-type/block/v/1"],
                ),
            ],
        );
    }

    #[tokio::test]
    async fn invalid_url() {
        assert!(matches!(
            ensure_failed_validation::<EntityType, _>(
                json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": "https://blockprotocol.org/@alice/types/entity-type/invalid/v/1",
                    "type": "object",
                    "title": "Invalid",
                    "description": "An invalid entity type",
                    "properties": {
                        "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_b/v/1" }
                    }
                }),
                EntityTypeValidator,
                JsonEqualityCheck::Yes,
            ).await,
            EntityTypeValidationError::InvalidPropertyReference {..}
        ));
    }
}
