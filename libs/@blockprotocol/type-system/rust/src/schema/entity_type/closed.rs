use alloc::sync::Arc;
use core::cmp;
use std::collections::{HashMap, HashSet, hash_map::Entry};

use error_stack::{Report, ensure};
use itertools::Itertools as _;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::json;
use thiserror::Error;

use super::raw;
use crate::{
    schema::{
        EntityType, EntityTypeReference, EntityTypeToPropertyTypeEdge, EntityTypeUuid,
        InheritanceDepth, PropertyTypeReference, PropertyTypeUuid, PropertyValueArray,
        ValueOrArray,
        entity_type::{InverseEntityTypeMetadata, extend_links},
        one_of::OneOfSchema,
    },
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "raw::ClosedEntityType")]
pub struct ClosedEntityType {
    pub id: VersionedUrl,
    pub title: String,
    pub title_plural: Option<String>,
    pub description: Option<String>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    pub required: HashSet<BaseUrl>,
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
    pub inverse: InverseEntityTypeMetadata,
}

impl Serialize for ClosedEntityType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::ClosedEntityType::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(from = "raw::EntityTypeSchemaMetadata")]
pub struct EntityTypeSchemaMetadata {
    pub id: VersionedUrl,
    pub title: String,
    pub title_plural: Option<String>,
    pub description: Option<String>,
    pub inverse: InverseEntityTypeMetadata,
}

impl Serialize for EntityTypeSchemaMetadata {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::EntityTypeSchemaMetadata::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(from = "raw::ClosedMultiEntityType")]
pub struct ClosedMultiEntityType {
    pub all_of: Vec<EntityTypeSchemaMetadata>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    pub required: HashSet<BaseUrl>,
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
}

impl Serialize for ClosedMultiEntityType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::ClosedMultiEntityType::from(self).serialize(serializer)
    }
}

#[derive(Debug, Error)]
pub enum ResolveClosedEntityTypeError {
    #[error(
        "Resolving the entity type encountered unknown schemas in `allOf`: {}.",
        json!(.0.iter().map(|reference| &reference.url).collect::<Vec<_>>()),
    )]
    UnknownSchemas(HashSet<EntityTypeReference>),
    #[error("Resolving the entity type encountered incompatible property: {0}.")]
    IncompatibleProperty(BaseUrl),
    #[error("The entity type has an empty schema")]
    EmptySchema,
}

impl ClosedEntityType {
    /// Create a closed entity type from an entity type and its resolve data.
    ///
    /// # Errors
    ///
    /// Returns an error if the entity type references unknown schemas in `allOf`.
    pub fn from_resolve_data(
        mut schema: EntityType,
        resolve_data: &EntityTypeResolveData,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut closed_schema = Self {
            id: schema.id,
            title: schema.title,
            title_plural: schema.title_plural,
            description: schema.description,
            properties: schema.properties,
            required: schema.required,
            links: schema.links,
            inverse: schema.inverse,
        };

        for entity_type in resolve_data.ordered_schemas() {
            schema.all_of.remove((&entity_type.id).into());
            closed_schema
                .properties
                .extend(entity_type.properties.clone());
            closed_schema.required.extend(entity_type.required.clone());
            extend_links(&mut closed_schema.links, entity_type.links.clone());
        }

        ensure!(
            schema.all_of.is_empty(),
            ResolveClosedEntityTypeError::UnknownSchemas(schema.all_of)
        );

        Ok(closed_schema)
    }
}

impl ClosedMultiEntityType {
    /// Creates a closed entity type from multiple closed entity types.
    ///
    /// This results in a closed entity type which is used for entities with multiple types.
    ///
    /// # Errors
    ///
    /// Returns an error if the entity types have incompatible properties.
    pub fn from_multi_type_closed_schema(
        closed_schemas: impl IntoIterator<Item = ClosedEntityType>,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut properties = HashMap::new();
        let mut required = HashSet::new();
        let mut links = HashMap::new();
        let mut all_of = Vec::new();

        for schema in closed_schemas {
            for (base_url, property) in schema.properties {
                match properties.entry(base_url) {
                    Entry::Occupied(entry) => {
                        ensure!(
                            property == *entry.get(),
                            ResolveClosedEntityTypeError::IncompatibleProperty(entry.key().clone())
                        );
                    }
                    Entry::Vacant(entry) => {
                        entry.insert(property);
                    }
                }
            }
            all_of.push(EntityTypeSchemaMetadata {
                id: schema.id,
                title: schema.title,
                title_plural: schema.title_plural,
                description: schema.description,
                inverse: schema.inverse,
            });
            required.extend(schema.required);
            extend_links(&mut links, schema.links);
        }

        ensure!(
            !all_of.is_empty(),
            ResolveClosedEntityTypeError::EmptySchema
        );

        Ok(Self {
            all_of,
            properties,
            required,
            links,
        })
    }
}

#[derive(Debug, Default, Clone)]
pub struct EntityTypeResolveData {
    inheritance_depths: HashMap<EntityTypeUuid, (InheritanceDepth, Arc<EntityType>)>,
    // We currently don't need to store the actual target entity types and property types, except
    // for inheritance, so we only store the depth.
    links: HashMap<EntityTypeUuid, InheritanceDepth>,
    link_destinations: HashMap<EntityTypeUuid, InheritanceDepth>,
    properties: HashMap<PropertyTypeUuid, InheritanceDepth>,
}

impl EntityTypeResolveData {
    pub fn add_entity_type_inheritance_edge(
        &mut self,
        target: Arc<EntityType>,
        target_id: EntityTypeUuid,
        depth: u16,
    ) {
        let depth = InheritanceDepth::new(depth);
        match self.inheritance_depths.entry(target_id) {
            Entry::Occupied(mut entry) => {
                entry.get_mut().0 = cmp::min(depth, entry.get().0);
            }
            Entry::Vacant(entry) => {
                entry.insert((depth, target));
            }
        }
    }

    pub fn add_entity_type_link_edge(&mut self, target_id: EntityTypeUuid, depth: u16) {
        let depth = InheritanceDepth::new(depth);
        match self.links.entry(target_id) {
            Entry::Occupied(mut entry) => {
                *entry.get_mut() = cmp::min(depth, *entry.get());
            }
            Entry::Vacant(entry) => {
                entry.insert(depth);
            }
        }
    }

    pub fn add_entity_type_link_destination_edge(&mut self, target_id: EntityTypeUuid, depth: u16) {
        let depth = InheritanceDepth::new(depth);
        match self.link_destinations.entry(target_id) {
            Entry::Occupied(mut entry) => {
                *entry.get_mut() = cmp::min(depth, *entry.get());
            }
            Entry::Vacant(entry) => {
                entry.insert(depth);
            }
        }
    }

    pub fn add_property_type_edge(
        &mut self,
        edge: EntityTypeToPropertyTypeEdge,
        target_id: PropertyTypeUuid,
        depth: u16,
    ) {
        let depth = InheritanceDepth::new(depth);
        match edge {
            EntityTypeToPropertyTypeEdge::Property => match self.properties.entry(target_id) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = cmp::min(depth, *entry.get());
                }
                Entry::Vacant(entry) => {
                    entry.insert(depth);
                }
            },
        }
    }

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
        for (target_id, relative_depth) in &other.links {
            let absolut_depth = InheritanceDepth::new(relative_depth.inner() + depth_offset);
            match self.links.entry(*target_id) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = cmp::min(absolut_depth, *entry.get());
                }
                Entry::Vacant(entry) => {
                    entry.insert(absolut_depth);
                }
            }
        }
        for (target_id, relative_depth) in &other.link_destinations {
            let absolut_depth = InheritanceDepth::new(relative_depth.inner() + depth_offset);
            match self.link_destinations.entry(*target_id) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = cmp::min(absolut_depth, *entry.get());
                }
                Entry::Vacant(entry) => {
                    entry.insert(absolut_depth);
                }
            }
        }
        for (target_id, relative_depth) in &other.properties {
            let absolut_depth = InheritanceDepth::new(relative_depth.inner() + depth_offset);
            match self.properties.entry(*target_id) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = cmp::min(absolut_depth, *entry.get());
                }
                Entry::Vacant(entry) => {
                    entry.insert(absolut_depth);
                }
            }
        }
    }

    pub fn inheritance_depths(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.inheritance_depths
            .iter()
            .map(|(id, (depth, _))| (*id, *depth))
    }

    pub fn links(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.links.iter().map(|(id, depth)| (*id, *depth))
    }

    pub fn link_destinations(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.link_destinations
            .iter()
            .map(|(id, depth)| (*id, *depth))
    }

    pub fn properties(&self) -> impl Iterator<Item = (PropertyTypeUuid, InheritanceDepth)> {
        self.properties.iter().map(|(id, depth)| (*id, *depth))
    }

    /// Returns an iterator over the schemas ordered by inheritance depth and entity type id.
    fn ordered_schemas(&self) -> impl Iterator<Item = &EntityType> {
        // TODO: Construct the sorted list on the fly when constructing this struct
        self.inheritance_depths
            .iter()
            .sorted_by_key(|(data_type_id, (depth, _))| (*depth, data_type_id.into_uuid()))
            .map(|(_, (_, schema))| &**schema)
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use crate::{
        schema::{EntityType, EntityTypeUuid, OntologyTypeResolver, entity_type::ClosedEntityType},
        url::BaseUrl,
        utils::tests::{JsonEqualityCheck, ensure_serialization_from_str},
    };

    #[test]
    fn merge_entity_type() {
        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let building = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::BUILDING_V1,
            JsonEqualityCheck::Yes,
        );
        ontology_type_resolver
            .add_unresolved_entity_type(EntityTypeUuid::from_url(&building.id), Arc::new(building));

        let church: EntityType = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::CHURCH_V1,
            JsonEqualityCheck::Yes,
        );
        let church_id = EntityTypeUuid::from_url(&church.id);
        ontology_type_resolver.add_unresolved_entity_type(church_id, Arc::new(church.clone()));

        let resolved_church = ontology_type_resolver
            .resolve_entity_type_metadata(church_id)
            .expect("church not resolved");
        let closed_church = ClosedEntityType::from_resolve_data(church, &resolved_church)
            .expect("Could not close church");

        assert!(
            closed_church.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/built-at/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(
            closed_church.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/number-bells/".to_owned()
                )
                .expect("invalid url")
            )
        );
    }
}
