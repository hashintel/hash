mod entity;
mod link;

use type_system::uri::VersionedUri;

use crate::{
    knowledge::{EntityId, Link, PersistedEntity},
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedLinkType, PersistedPropertyType,
        QueryDepth,
    },
    store::postgres::{DependencyMap, DependencySet},
};

pub struct KnowledgeDependencyContext<'a> {
    pub referenced_data_types: &'a mut DependencyMap<VersionedUri, PersistedDataType>,
    pub referenced_property_types: &'a mut DependencyMap<VersionedUri, PersistedPropertyType>,
    pub referenced_link_types: &'a mut DependencyMap<VersionedUri, PersistedLinkType>,
    pub referenced_entity_types: &'a mut DependencyMap<VersionedUri, PersistedEntityType>,
    pub linked_entities: &'a mut DependencyMap<EntityId, PersistedEntity>,
    pub links: &'a mut DependencySet<Link>,
    pub data_type_query_depth: QueryDepth,
    pub property_type_query_depth: QueryDepth,
    pub link_type_query_depth: QueryDepth,
    pub entity_type_query_depth: QueryDepth,
    pub link_query_depth: QueryDepth,
    pub link_target_entity_query_depth: QueryDepth,
}
