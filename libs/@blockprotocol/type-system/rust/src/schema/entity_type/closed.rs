use alloc::sync::Arc;
use core::{cmp, iter};
use std::collections::{HashMap, HashSet, hash_map::Entry};

use itertools::Itertools as _;
use serde::{Deserialize, Serialize};

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
    pub schemas: HashMap<VersionedUrl, ClosedEntityTypeSchemaData>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub required: HashSet<BaseUrl>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub all_of: HashSet<EntityTypeReference>,
}

impl ClosedEntityType {
    #[must_use]
    pub fn from_resolve_data(
        entity_type: EntityType,
        resolve_data: &EntityTypeResolveData,
    ) -> Self {
        iter::once(entity_type)
            .chain(
                resolve_data
                    .ordered_schemas()
                    .map(|(_, schema)| schema.clone()),
            )
            .collect()
    }
}

impl From<EntityType> for ClosedEntityType {
    fn from(entity_type: EntityType) -> Self {
        Self {
            schemas: HashMap::from([(entity_type.id, ClosedEntityTypeSchemaData {
                title: entity_type.title,
                description: entity_type.description,
            })]),
            properties: entity_type.properties,
            required: entity_type.required,
            links: entity_type.links,
            all_of: entity_type.all_of.into_iter().collect(),
        }
    }
}

impl FromIterator<EntityType> for ClosedEntityType {
    fn from_iter<T: IntoIterator<Item = EntityType>>(iter: T) -> Self {
        let mut entity_type = Self::default();
        entity_type.extend(iter);
        entity_type
    }
}

impl FromIterator<Self> for ClosedEntityType {
    fn from_iter<T: IntoIterator<Item = Self>>(iter: T) -> Self {
        let mut entity_type = Self::default();
        entity_type.extend(iter);
        entity_type
    }
}

impl Extend<Self> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for other in iter {
            self.all_of.extend(other.all_of);
            self.schemas.extend(other.schemas);
            self.properties.extend(other.properties);
            self.required.extend(other.required);
            extend_links(&mut self.links, other.links);
        }

        self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
    }
}

impl Extend<EntityType> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = EntityType>>(&mut self, iter: T) {
        for other in iter {
            self.all_of.extend(other.all_of);
            self.schemas.insert(other.id, ClosedEntityTypeSchemaData {
                title: other.title,
                description: other.description,
            });
            self.properties.extend(other.properties);
            self.required.extend(other.required);
            extend_links(&mut self.links, other.links);
        }

        self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
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
    use crate::{
        schema::{ClosedEntityType, EntityType},
        url::BaseUrl,
        utils::tests::{JsonEqualityCheck, ensure_serialization_from_str},
    };

    #[test]
    fn merge_entity_type() {
        let building = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::BUILDING_V1,
            JsonEqualityCheck::Yes,
        );
        let church: EntityType = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::CHURCH_V1,
            JsonEqualityCheck::Yes,
        );

        let closed_church: ClosedEntityType = [building, church].into_iter().collect();

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
        assert!(closed_church.all_of.is_empty());
    }
}
