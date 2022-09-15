//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;
mod link;

use serde::{Deserialize, Serialize};
use utoipa::Component;

pub use self::{
    entity::{Entity, EntityId, PersistedEntity, PersistedEntityIdentifier},
    link::Link,
};
use crate::{
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedLinkType, PersistedPropertyType,
        QueryDepth,
    },
    store::query::Expression,
};

/// Query to read [`Entities`], which satisfy the [`Expression`].
///
/// [`Entities`]: Entity
#[derive(Debug, Deserialize, Component)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    #[component(value_type = number)]
    pub data_type_query_depth: QueryDepth,
    #[component(value_type = number)]
    pub property_type_query_depth: QueryDepth,
    #[component(value_type = number)]
    pub link_type_query_depth: QueryDepth,
    #[component(value_type = number)]
    pub entity_type_query_depth: QueryDepth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct EntityRootedSubgraph {
    pub entity: PersistedEntity,
    pub referenced_data_types: Vec<PersistedDataType>,
    pub referenced_property_types: Vec<PersistedPropertyType>,
    pub referenced_link_types: Vec<PersistedLinkType>,
    pub referenced_entity_types: Vec<PersistedEntityType>,
}
