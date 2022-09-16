mod entity;
mod link;

use type_system::uri::VersionedUri;

use crate::{
    knowledge::{EntityId, KnowledgeGraphQueryDepth, Link, PersistedEntity},
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType,
    },
    store::postgres::{DependencyMap, DependencySet},
};

pub struct KnowledgeDependencyContext<'a> {
    pub referenced_data_types:
        &'a mut DependencyMap<VersionedUri, PersistedDataType, OntologyQueryDepth>,
    pub referenced_property_types:
        &'a mut DependencyMap<VersionedUri, PersistedPropertyType, OntologyQueryDepth>,
    pub referenced_link_types:
        &'a mut DependencyMap<VersionedUri, PersistedLinkType, OntologyQueryDepth>,
    pub referenced_entity_types:
        &'a mut DependencyMap<VersionedUri, PersistedEntityType, OntologyQueryDepth>,
    pub linked_entities: &'a mut DependencyMap<EntityId, PersistedEntity, KnowledgeGraphQueryDepth>,
    pub links: &'a mut DependencySet<Link, KnowledgeGraphQueryDepth>,
    pub data_type_query_depth: OntologyQueryDepth,
    pub property_type_query_depth: OntologyQueryDepth,
    pub link_type_query_depth: OntologyQueryDepth,
    pub entity_type_query_depth: OntologyQueryDepth,
    pub link_query_depth: KnowledgeGraphQueryDepth,
    pub link_target_entity_query_depth: KnowledgeGraphQueryDepth,
}
