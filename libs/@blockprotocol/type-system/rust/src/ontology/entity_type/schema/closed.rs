use alloc::sync::Arc;
use core::cmp;
use std::collections::{HashMap, HashSet, hash_map::Entry};

use error_stack::{Report, bail, ensure};
use itertools::Itertools as _;
use thiserror::Error;

use super::{
    EntityConstraints, EntityType, EntityTypeDisplayMetadata, EntityTypeReference,
    EntityTypeToPropertyTypeEdge, InverseEntityTypeMetadata, extend_links,
};
use crate::ontology::{
    BaseUrl, InheritanceDepth, VersionedUrl, entity_type::EntityTypeUuid,
    property_type::PropertyTypeUuid,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityTypeMetadata {
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    pub description: String,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeDisplayMetadata, ...EntityTypeDisplayMetadata[]]")
    )]
    pub all_of: Vec<EntityTypeDisplayMetadata>,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    pub inverse: InverseEntityTypeMetadata,
}

impl ClosedEntityTypeMetadata {
    /// Determines if this entity type represents a link in the knowledge graph.
    ///
    /// Checks if any entity types in the `all_of` collection inherit from the
    /// BlockProtocol base Link entity type.
    #[must_use]
    pub fn is_link(&self) -> bool {
        self.all_of.iter().any(|entity_type| {
            entity_type.id.base_url.as_str()
                == "https://blockprotocol.org/@blockprotocol/types/entity-type/link/"
        })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityType {
    #[serde(rename = "$id")]
    pub id: VersionedUrl,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_plural: Option<String>,
    pub description: String,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeDisplayMetadata, ...EntityTypeDisplayMetadata[]]")
    )]
    pub all_of: Vec<EntityTypeDisplayMetadata>,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    pub inverse: InverseEntityTypeMetadata,
    #[serde(flatten)]
    pub constraints: EntityConstraints,
}

#[derive(Debug, Error)]
pub enum ResolveClosedEntityTypeError {
    #[error(
        "Resolving the entity type encountered unknown schemas in `allOf`: {}.",
        serde_json::json!(.0.iter().map(|reference| &reference.url).collect::<Vec<_>>()),
    )]
    UnknownSchemas(HashSet<EntityTypeReference>),
    #[error("Resolving the entity type encountered incompatible property: {0}.")]
    IncompatibleProperty(BaseUrl),
    #[error("The entity type has an empty schema")]
    EmptySchema,
    #[error("The entity type has an inheritance depth overflow")]
    InheritanceDepthOverflow,
}

impl ClosedEntityType {
    /// Creates a closed entity type from an entity type and its resolve data.
    ///
    /// A closed entity type is a fully resolved version that includes all inherited properties
    /// and constraints. This method takes a source `schema` entity type and the `resolve_data`
    /// containing inheritance relationships, resolving the entity type by recursively following
    /// its inheritance tree.
    ///
    /// # Errors
    ///
    /// - [`UnknownSchemas`] if the entity type references unknown schemas in `allOf`
    /// - [`InheritanceDepthOverflow`] if the inheritance hierarchy is too deep
    ///
    /// [`UnknownSchemas`]: ResolveClosedEntityTypeError::UnknownSchemas
    /// [`InheritanceDepthOverflow`]: ResolveClosedEntityTypeError::InheritanceDepthOverflow
    pub fn from_resolve_data(
        mut schema: EntityType,
        resolve_data: &EntityTypeResolveData,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut closed_schema = Self {
            id: schema.id.clone(),
            constraints: schema.constraints,
            title: schema.title,
            title_plural: schema.title_plural,
            description: schema.description,
            inverse: schema.inverse,
            all_of: vec![EntityTypeDisplayMetadata {
                id: schema.id,
                depth: 0,
                icon: schema.icon,
                label_property: schema.label_property,
            }],
        };

        for (depth, entity_type) in resolve_data.ordered_schemas() {
            schema.all_of.remove((&entity_type.id).into());
            closed_schema
                .constraints
                .properties
                .extend(entity_type.constraints.properties.clone());
            closed_schema
                .constraints
                .required
                .extend(entity_type.constraints.required.clone());
            extend_links(
                &mut closed_schema.constraints.links,
                entity_type.constraints.links.clone(),
            );

            closed_schema.all_of.push(EntityTypeDisplayMetadata {
                id: entity_type.id.clone(),
                depth: depth
                    .inner()
                    .checked_add(1)
                    .ok_or(ResolveClosedEntityTypeError::InheritanceDepthOverflow)?,
                label_property: entity_type.label_property.clone(),
                icon: entity_type.icon.clone(),
            });
        }

        ensure!(
            schema.all_of.is_empty(),
            ResolveClosedEntityTypeError::UnknownSchemas(schema.all_of)
        );

        Ok(closed_schema)
    }
}

/// Entities can have multiple types, each of which can inherit from multiple other types.
///
/// We refer to the act of resolving all information about a given type (including inherited
/// information) as 'Closing' it. Therefore, a `ClosedMultiEntityType` is the result of closing
/// multiple types together to provide a single schema, which represents the shape of the entity
/// with those types (e.g. valid properties, links, etc).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedMultiEntityType {
    /// The merged constraints for all the types in this type.
    #[serde(flatten)]
    pub constraints: EntityConstraints,

    /// Each entry in `allOf` represents the metadata for each of the types in this type.
    ///
    /// Some attributes such as type `title` and `icon` cannot be meaningfully combined, so they
    /// are provided for each type. The un-mergeable information on each type's parents is
    /// nested within each entry.
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[ClosedEntityTypeMetadata, ...ClosedEntityTypeMetadata[]]")
    )]
    pub all_of: Vec<ClosedEntityTypeMetadata>,
}

impl ClosedMultiEntityType {
    /// Creates a new multi-entity type from a single closed entity type.
    ///
    /// Initializes a new [`ClosedMultiEntityType`] containing a single entity type's metadata
    /// and constraints.
    #[must_use]
    pub fn from_closed_schema(closed_schemas: ClosedEntityType) -> Self {
        Self {
            all_of: vec![ClosedEntityTypeMetadata {
                id: closed_schemas.id.clone(),
                title: closed_schemas.title.clone(),
                title_plural: closed_schemas.title_plural.clone(),
                description: closed_schemas.description.clone(),
                inverse: closed_schemas.inverse.clone(),
                all_of: closed_schemas.all_of,
            }],
            constraints: closed_schemas.constraints,
        }
    }

    /// Creates a closed multi-entity type from multiple closed entity types.
    ///
    /// Combines multiple closed entity types into a single entity by merging their properties,
    /// constraints, and link definitions. Takes an iterator of closed entity types and builds
    /// a composite type that satisfies all input types simultaneously.
    ///
    /// # Errors
    ///
    /// - [`EmptySchema`] if no schemas are provided in the iterator
    /// - [`IncompatibleProperty`] if entity types have conflicting property definitions
    ///
    /// [`EmptySchema`]: ResolveClosedEntityTypeError::EmptySchema
    /// [`IncompatibleProperty`]: ResolveClosedEntityTypeError::IncompatibleProperty
    pub fn from_multi_type_closed_schema(
        closed_schemas: impl IntoIterator<Item = ClosedEntityType>,
    ) -> Result<Self, Report<ResolveClosedEntityTypeError>> {
        let mut closed_schemas = closed_schemas.into_iter();
        let Some(mut closed_schema) = closed_schemas.next().map(Self::from_closed_schema) else {
            bail!(ResolveClosedEntityTypeError::EmptySchema);
        };

        for schema in closed_schemas {
            closed_schema.add_closed_entity_type(schema)?;
        }

        Ok(closed_schema)
    }

    /// Adds a new closed entity type to this multi-entity type.
    ///
    /// Extends the current multi-entity type by incorporating another closed entity type,
    /// merging properties, required fields, and link definitions while maintaining compatibility.
    ///
    /// # Errors
    ///
    /// - [`IncompatibleProperty`] if there are property definition conflicts
    ///
    /// [`IncompatibleProperty`]: ResolveClosedEntityTypeError::IncompatibleProperty
    pub fn add_closed_entity_type(
        &mut self,
        schema: ClosedEntityType,
    ) -> Result<(), Report<ResolveClosedEntityTypeError>> {
        for (base_url, property) in schema.constraints.properties {
            match self.constraints.properties.entry(base_url) {
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
        self.constraints
            .required
            .extend(schema.constraints.required);
        extend_links(&mut self.constraints.links, schema.constraints.links);
        self.all_of.push(ClosedEntityTypeMetadata {
            id: schema.id,
            title: schema.title,
            title_plural: schema.title_plural,
            description: schema.description,
            inverse: schema.inverse,
            all_of: schema.all_of,
        });

        Ok(())
    }

    /// Determines if this multi-entity type represents a link in the knowledge graph.
    ///
    /// Delegates to [`ClosedEntityTypeMetadata::is_link`] to check each entity type in the
    /// `all_of` collection.
    pub fn is_link(&self) -> bool {
        self.all_of.iter().any(ClosedEntityTypeMetadata::is_link)
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
    /// Adds an inheritance edge from this entity type to a target entity type.
    ///
    /// Inheritance edges represent "is-a" relationships between entity types. When added,
    /// this method stores the target entity type reference and its inheritance depth,
    /// using the minimum depth value if an edge to the same target already exists.
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

    /// Adds a link edge from this entity type to a target entity type.
    ///
    /// Link edges represent relationships where this entity type can link to instances
    /// of the target entity type. This method stores the target entity type ID and its
    /// depth, using the minimum depth value if an edge to the same target already exists.
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

    /// Adds a link destination edge from this entity type to a target entity type.
    ///
    /// Link destination edges indicate that this entity type can be the destination of
    /// links from the target entity type. This method stores the target entity type ID
    /// and its depth, using the minimum depth value if an edge to the same target already exists.
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

    /// Adds a property type edge from this entity type to a property type.
    ///
    /// Property type edges connect entity types to their property definitions. This method
    /// stores the property type ID and its depth, using the minimum depth value if an edge
    /// to the same property already exists.
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

    /// Extends this resolve data with edges from another resolve data instance.
    ///
    /// Used during inheritance resolution, this method adds all edges from the `other`
    /// instance to this one, offsetting depths by the specified amount. For duplicate
    /// edges, the minimum depth is preserved.
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

    /// Returns an iterator over all inheritance relationships with their depths.
    pub fn inheritance_depths(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.inheritance_depths
            .iter()
            .map(|(id, (depth, _))| (*id, *depth))
    }

    /// Returns an iterator over all link relationships with their depths.
    pub fn links(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.links.iter().map(|(id, depth)| (*id, *depth))
    }

    /// Returns an iterator over all link destination relationships with their depths.
    pub fn link_destinations(&self) -> impl Iterator<Item = (EntityTypeUuid, InheritanceDepth)> {
        self.link_destinations
            .iter()
            .map(|(id, depth)| (*id, *depth))
    }

    /// Returns an iterator over all property relationships with their depths.
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

    use super::*;
    use crate::{
        ontology::{BaseUrl, json_schema::OntologyTypeResolver},
        utils::tests::{JsonEqualityCheck, ensure_serialization_from_str},
    };

    #[test]
    fn merge_entity_type() {
        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let building = ensure_serialization_from_str::<EntityType>(
            hash_graph_test_data::entity_type::BUILDING_V1,
            JsonEqualityCheck::Yes,
        );
        ontology_type_resolver
            .add_unresolved_entity_type(EntityTypeUuid::from_url(&building.id), Arc::new(building));

        let church: EntityType = ensure_serialization_from_str::<EntityType>(
            hash_graph_test_data::entity_type::CHURCH_V1,
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
            closed_church.constraints.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/built-at/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(
            closed_church.constraints.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/number-bells/".to_owned()
                )
                .expect("invalid url")
            )
        );
    }
}
