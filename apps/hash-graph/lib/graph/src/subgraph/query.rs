#![expect(
    clippy::let_underscore_untyped,
    reason = "Upstream issue of `derivative`"
)]

use std::fmt::Debug;

use derivative::Derivative;
use serde::Deserialize;
use utoipa::{
    openapi::{ObjectBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    store::{query::Filter, Record},
    subgraph::{edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};

/// Structural queries are the main entry point to read data from the Graph.
///
/// They are used to query the graph for a set of vertices and edges that match a set of filters.
/// Alongside the filters, the query can specify the depth of the query, which determines how many
/// edges the query will follow from the root vertices. The root vertices are determined by the
/// filters. For example, if the query is for all entities of a certain type, the root vertices will
/// be the entities of that type.
///
/// # Filters
///
/// [`Filter`]s are used to specify which root vertices to include in the query. They consist of a
/// variety of different types of filters, which are described in the [`Filter`] documentation. At
/// the leaf level, filters are composed of [`RecordPath`]s and [`Parameter`]s, which identify the
/// root vertices to include in the query.
///
/// Each [`RecordPath`] is a sequence of tokens, which are used to traverse the graph. For example,
/// a `StructuralQuery<Entity>` with the path `["type", "version"]` will traverse the graph from an
/// entity to its type to the version. When associating the above path with a [`Parameter`] with the
/// value `1` in an equality filter, the query will return all entities whose type has version `1`
/// as a root vertex.
///
/// Depending on the type of the [`StructuralQuery`], different [`RecordPath`]s are valid. Please
/// see the documentation on the implementation of [`Record::QueryPath`] for the valid paths for
/// each type.
///
/// # Depth
///
/// The depth of a query determines how many edges the query will follow from the root vertices. For
/// an in-depth explanation of the depth of a query, please see the documentation on
/// [`GraphResolveDepths`].
///
/// # Examples
///
/// Typically, a structural will be deserialized from a JSON request. The following examples assume,
/// that the type of the request body is `StructuralQuery<Entity>`.
///
/// This will return all entities with the latest version of the `foo` type:
///
/// ```json
/// {
///   "filter": {
///     "all": [
///       {
///         "equal": [
///           { "path": ["type", "baseUrl"] },
///           { "parameter": "foo" }
///         ]
///       },
///       {
///         "equal": [
///           { "path": ["type", "version"] },
///           { "parameter": "latest" }
///         ]
///       }
///     ]
///   },
///   "graphResolveDepths": {
///     "inheritsFrom": {
///       "outgoing": 0
///     },
///     "constrainsValuesOn": {
///       "outgoing": 0
///     },
///     "constrainsPropertiesOn": {
///       "outgoing": 0
///     },
///     "constrainsLinksOn": {
///       "outgoing": 0
///     },
///     "constrainsLinkDestinationsOn": {
///       "outgoing": 0
///     },
///     "isOfType": {
///       "outgoing": 0
///     },
///     "hasLeftEntity": {
///       "incoming": 2,
///       "outgoing": 2
///     },
///     "hasRightEntity": {
///       "incoming": 2,
///       "outgoing": 2
///     }
///   }
/// ```
///
/// This query will return any entity, which was either created by or is owned by the account
/// `12345678-90ab-cdef-1234-567890abcdef`:
///
/// ```json
/// {
///   "filter": {
///     "any": [
///       {
///         "equal": [
///           { "path": ["recordCreatedById"] },
///           { "parameter": "12345678-90ab-cdef-1234-567890abcdef" }
///         ]
///       },
///       {
///         "equal": [
///           { "path": ["ownedById"] },
///           { "parameter": "12345678-90ab-cdef-1234-567890abcdef" }
///         ]
///       }
///     ]
///   },
///   "graphResolveDepths": {
///     "inheritsFrom": {
///       "outgoing": 0
///     },
///     "constrainsValuesOn": {
///       "outgoing": 0
///     },
///     "constrainsPropertiesOn": {
///       "outgoing": 0
///     },
///     "constrainsLinksOn": {
///       "outgoing": 0
///     },
///     "constrainsLinkDestinationsOn": {
///       "outgoing": 0
///     },
///     "isOfType": {
///       "outgoing": 0
///     },
///     "hasLeftEntity": {
///       "incoming": 2,
///       "outgoing": 2
///     },
///     "hasRightEntity": {
///       "incoming": 2,
///       "outgoing": 2
///     }
///   }
/// }
/// ```
///
/// [`RecordPath`]: crate::store::query::QueryPath
/// [`Parameter`]: crate::store::query::Parameter
#[derive(Deserialize, Derivative)]
#[derivative(Debug(bound = "R::QueryPath<'p>: Debug"))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StructuralQuery<'p, R: Record> {
    #[serde(bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>")]
    pub filter: Filter<'p, R>,
    pub graph_resolve_depths: GraphResolveDepths,
    pub temporal_axes: QueryTemporalAxesUnresolved,
}

impl<'p, R: Record> StructuralQuery<'p, R> {
    fn generate_schema() -> RefOr<Schema> {
        ObjectBuilder::new()
            .property("filter", Ref::from_schema_name("Filter"))
            .required("filter")
            .property(
                "graphResolveDepths",
                Ref::from_schema_name(GraphResolveDepths::schema().0),
            )
            .required("graphResolveDepths")
            .property(
                "temporalAxes",
                Ref::from_schema_name(QueryTemporalAxesUnresolved::schema().0),
            )
            .required("temporalAxes")
            .into()
    }
}

pub type DataTypeStructuralQuery = StructuralQuery<'static, DataTypeWithMetadata>;
pub type PropertyTypeStructuralQuery = StructuralQuery<'static, PropertyTypeWithMetadata>;
pub type EntityTypeStructuralQuery = StructuralQuery<'static, EntityTypeWithMetadata>;
pub type EntityStructuralQuery = StructuralQuery<'static, Entity>;

impl<'p> ToSchema<'_> for StructuralQuery<'p, DataTypeWithMetadata> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "DataTypeStructuralQuery",
            StructuralQuery::<'p, DataTypeWithMetadata>::generate_schema(),
        )
    }
}

impl<'p> ToSchema<'_> for StructuralQuery<'p, PropertyTypeWithMetadata> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "PropertyTypeStructuralQuery",
            StructuralQuery::<'p, PropertyTypeWithMetadata>::generate_schema(),
        )
    }
}

impl<'p> ToSchema<'_> for StructuralQuery<'p, EntityTypeWithMetadata> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeStructuralQuery",
            StructuralQuery::<'p, EntityTypeWithMetadata>::generate_schema(),
        )
    }
}

impl<'p> ToSchema<'_> for StructuralQuery<'p, Entity> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityStructuralQuery",
            StructuralQuery::<'p, Entity>::generate_schema(),
        )
    }
}
