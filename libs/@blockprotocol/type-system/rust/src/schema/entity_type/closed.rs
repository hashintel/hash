use alloc::sync::Arc;
use core::cmp;
use std::collections::{HashMap, HashSet, hash_map::Entry};

use error_stack::{Report, ensure};
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

use crate::{
    schema::{
        EntityType, EntityTypeReference, EntityTypeToPropertyTypeEdge, EntityTypeUuid,
        InheritanceDepth, PropertyTypeReference, PropertyTypeUuid, PropertyValueArray,
        ValueOrArray, entity_type::extend_links, one_of::OneOfSchema,
    },
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityTypeSchemaData {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityType {
    pub schemas: HashMap<VersionedUrl, (InheritanceDepth, ClosedEntityTypeSchemaData)>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub required: HashSet<BaseUrl>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
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
}

impl ClosedEntityType {
    /// Creates a closed entity type from multiple closed entity types.
    ///
    /// This results in a closed entity type which is used for entities with multiple types.
    ///
    /// # Errors
    ///
    /// Returns an error if the entity types have incompatible properties.
    pub fn from_multi_type_closed_schema(
        closed_schemas: impl IntoIterator<Item = Self>,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut properties = HashMap::new();
        let mut required = HashSet::new();
        let mut links = HashMap::new();
        let mut schemas = HashMap::new();

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
            required.extend(schema.required);
            extend_links(&mut links, schema.links);

            for (url, (depth, schema_data)) in schema.schemas {
                match schemas.entry(url) {
                    Entry::Occupied(mut entry) => {
                        let (existing_depth, _) = entry.get_mut();
                        *existing_depth = cmp::min(*existing_depth, depth);
                    }
                    Entry::Vacant(entry) => {
                        entry.insert((depth, schema_data));
                    }
                }
            }
        }

        Ok(Self {
            schemas,
            properties,
            required,
            links,
        })
    }

    /// Create a closed entity type from an entity type and its resolve data.
    ///
    /// # Errors
    ///
    /// Returns an error if the entity type references unknown schemas in `allOf`.
    pub fn from_resolve_data(
        entity_type: EntityType,
        resolve_data: &EntityTypeResolveData,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut all_of = entity_type.all_of;

        let mut closed_schema = Self {
            schemas: HashMap::from([(
                entity_type.id,
                (InheritanceDepth::new(0), ClosedEntityTypeSchemaData {
                    title: entity_type.title,
                    description: entity_type.description,
                }),
            )]),
            properties: entity_type.properties,
            required: entity_type.required,
            links: entity_type.links,
        };

        for (depth, entity_type) in resolve_data.ordered_schemas() {
            all_of.extend(entity_type.all_of.clone());
            closed_schema.schemas.insert(
                entity_type.id.clone(),
                (
                    InheritanceDepth::new(depth.inner() + 1),
                    ClosedEntityTypeSchemaData {
                        title: entity_type.title.clone(),
                        description: entity_type.description.clone(),
                    },
                ),
            );
            closed_schema
                .properties
                .extend(entity_type.properties.clone());
            closed_schema.required.extend(entity_type.required.clone());
            extend_links(&mut closed_schema.links, entity_type.links.clone());
            all_of.remove((&entity_type.id).into());
        }

        ensure!(
            all_of.is_empty(),
            ResolveClosedEntityTypeError::UnknownSchemas(all_of)
        );

        Ok(closed_schema)
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
    fn ordered_schemas(&self) -> impl Iterator<Item = (InheritanceDepth, &EntityType)> {
        // TODO: Construct the sorted list on the fly when constructing this struct
        self.inheritance_depths
            .iter()
            .sorted_by_key(|(data_type_id, (depth, _))| (*depth, data_type_id.into_uuid()))
            .map(|(_, (depth, schema))| (*depth, &**schema))
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use crate::{
        schema::{ClosedEntityType, EntityType, EntityTypeUuid, OntologyTypeResolver},
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
