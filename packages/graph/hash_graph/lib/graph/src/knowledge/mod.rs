//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;
mod link;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use self::{
    entity::{
        Entity, EntityId, PersistedEntity, PersistedEntityIdentifier, PersistedEntityMetadata,
    },
    link::{Link, PersistedLink},
};
use crate::{
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType,
    },
    store::query::Expression,
};

/// Distance to explore when querying a rooted subgraph on entities and links.
///
/// Entities may link to other entities through links. The depths provided alongside a query specify
/// how many steps to explore along a chain of entities/links. Meaning, any chain of entities and
/// links will be resolved up to the given depth. These can be composed with [`OntologyQueryDepth`]
/// to explore ontology types.
///
/// A `link_target_entity_query_depth`/`link_query_depth` of `0` means that no entities/links are
/// explored respectively.
///
/// **Note**: The concept is the same as the [`OntologyQueryDepth`] but it feels a little different
/// as entities and links are chained in an alternate way, between every entity there is a
/// link and vice versa.
///
/// # Example
///
/// - `Entity1` links to `Entity2` by `Link1`
/// - `Entity2` links to `Entity3` by `Link2`
///
/// If a query on `Entity1` is made with the following depths:
/// - `link_query_depth: 2`
/// - `link_target_entity_query_depth: 1`
///
/// the query will resolve up to two links, but only a single entity:
/// - `linkedEntities`: \[`Entity2`]
/// - `links`: \[`Link1`, `Link2`]
pub type KnowledgeGraphQueryDepth = u8;

/// Query to read [`Entities`] or [`Link`]s, which satisfy the [`Expression`].
///
/// [`Entities`]: Entity
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct KnowledgeGraphQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    #[schema(value_type = number)]
    pub data_type_query_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub property_type_query_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub link_type_query_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_type_query_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub link_target_entity_query_depth: KnowledgeGraphQueryDepth,
    #[schema(value_type = number)]
    pub link_query_depth: KnowledgeGraphQueryDepth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRootedSubgraph {
    pub entity: PersistedEntity,
    pub referenced_data_types: Vec<PersistedDataType>,
    pub referenced_property_types: Vec<PersistedPropertyType>,
    pub referenced_link_types: Vec<PersistedLinkType>,
    pub referenced_entity_types: Vec<PersistedEntityType>,
    pub linked_entities: Vec<PersistedEntity>,
    pub links: Vec<PersistedLink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkRootedSubgraph {
    pub link: PersistedLink,
    pub referenced_data_types: Vec<PersistedDataType>,
    pub referenced_property_types: Vec<PersistedPropertyType>,
    pub referenced_link_types: Vec<PersistedLinkType>,
    pub referenced_entity_types: Vec<PersistedEntityType>,
    pub linked_entities: Vec<PersistedEntity>,
    pub links: Vec<PersistedLink>,
}
