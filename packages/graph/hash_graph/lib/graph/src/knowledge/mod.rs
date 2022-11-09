//! TODO: DOC - This module will encapsulate logic for Entities and Links, it's a parallel to the
//!  `ontology` module, i.e you have Ontologies and Knowledge-Graphs

mod entity;

pub use self::entity::{
    Entity, EntityQueryPath, EntityQueryPathVisitor, EntityUuid, LinkEntityMetadata, LinkOrder,
    PersistedEntity, PersistedEntityMetadata,
};

// TODO: update this doc: https://app.asana.com/0/1200211978612931/1203250001255262/f
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
///
/// [`OntologyQueryDepth`]: crate::ontology::OntologyQueryDepth
pub type KnowledgeGraphQueryDepth = u8;
