use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};
use utoipa::{openapi, ToSchema};

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

/// Distance to explore when querying a rooted subgraph in the ontology.
///
/// Ontology records may have references to other records, e.g. a [`PropertyType`] may reference
/// other [`PropertyType`]s or [`DataType`]s. The depths provided alongside a query specify how many
/// steps to explore along a chain of references _of a certain kind of type_. Meaning, any chain of
/// property type references will be resolved up to the depth given for property types, and *each*
/// data type referenced in those property types will in turn start a 'new chain' whose exploration
/// depth is limited by the depth given for data types.
///
/// A depth of `0` means that no references are explored for that specific kind of type.
///
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
///
/// # Example
///
/// - `EntityType1` references \[`EntityType2`, `PropertyType1`]
/// - `EntityType2` references \[`PropertyType2`]
/// - `PropertyType1` references \[`DataType2`]
/// - `PropertyType2` references \[`PropertyType3`, `DataType1`]
/// - `PropertyType3` references \[`PropertyType4`, `DataType3`]
/// - `PropertyType4` references \[`DataType3`]
///
/// If a query on `EntityType1` is made with the following depths:
/// - `entity_type_query_depth: 1`
/// - `property_type_query_depth: 3`
/// - `data_type_query_depth: 1`
///
/// Then the returned subgraph will be:
/// - `referenced_entity_types`: \[`EntityType2`]
/// - `referenced_property_types`: \[`PropertyType1`, `PropertyType2`, `PropertyType3`]
/// - `referenced_data_types`: \[`DataType1`, `DataType2`]
///
/// ## The idea of "chains"
///
/// When `EntityType2` is explored its referenced property types get explored. The chain of
/// _property type_ references is then resolved to a depth of `property_type_query_depth`.
pub type OntologyQueryDepth = u8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GraphResolveDepths {
    #[schema(value_type = number)]
    pub data_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub property_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_type_resolve_depth: OntologyQueryDepth,
    // TODO: is this name accurate/satisfactory with the changes we've made?
    /// The number of entity elements to resolve along
    #[schema(value_type = number)]
    pub entity_resolve_depth: KnowledgeGraphQueryDepth,
}

impl GraphResolveDepths {
    #[must_use]
    pub const fn zeroed() -> Self {
        Self {
            data_type_resolve_depth: 0,
            property_type_resolve_depth: 0,
            entity_type_resolve_depth: 0,
            entity_resolve_depth: 0,
        }
    }
}
