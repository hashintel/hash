use hash_graph_store::{
    entity::{EntityQueryCursor, EntityQuerySortingRecord, QueryConversion},
    entity_type::IncludeEntityTypeOption,
    filter::Filter,
    subgraph::{
        edges::{GraphResolveDepths, TraversalPath},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use serde::Deserialize;
use serde_json::value::RawValue;
use type_system::knowledge::Entity;
use utoipa::ToSchema;

#[derive(Debug, Clone, Deserialize)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
#[serde(rename_all = "camelCase")]
struct GetEntitiesRequestData<'q, 's, 'p> {
    // `GetEntitiesQuery::Filter`
    #[serde(borrow)]
    filter: Option<Filter<'q, Entity>>,
    // `GetEntitiesQuery::Query`,
    #[serde(borrow)]
    query: Option<&'q RawValue>,

    // `GetEntitiesRequest`
    temporal_axes: QueryTemporalAxesUnresolved,
    include_drafts: bool,
    limit: Option<usize>,
    #[serde(borrow, default)]
    conversions: Vec<QueryConversion<'p>>,
    #[serde(borrow)]
    sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    include_count: bool,
    #[serde(default)]
    include_entity_types: Option<IncludeEntityTypeOption>,
    #[serde(default)]
    include_web_ids: bool,
    #[serde(default)]
    include_created_by_ids: bool,
    #[serde(default)]
    include_edition_created_by_ids: bool,
    #[serde(default)]
    include_type_ids: bool,
    #[serde(default)]
    include_type_titles: bool,

    // `GetEntitySubgraphRequest::ResolveDepths`
    graph_resolve_depths: Option<GraphResolveDepths>,
    // `GetEntitySubgraphRequest::Paths`
    traversal_paths: Option<Vec<TraversalPath>>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, deny_unknown_fields)]
#[expect(clippy::large_enum_variant)]
pub enum GetEntitiesQuery<'q> {
    Filter {
        #[serde(borrow)]
        filter: Filter<'q, Entity>,
    },
    Query {
        #[serde(borrow)]
        query: &'q RawValue,
    },
    /// Empty query
    ///
    /// Cannot be used directly, only used internally when removing the query from the request body.
    #[serde(skip)]
    #[doc(hidden)]
    Empty,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
enum GetEntitiesRequestError {
    #[display("unknown field `{_0}`, field can only be used in subgraph queries")]
    SubgraphRequestField(&'static str),
    #[display("Expected either a filter or query, but got neither")]
    ExpectedFilterOrQueryGotNeither,
    #[display("Expected either a filter or query, but both were provided")]
    ExpectedFilterOrQueryGotBoth,
}

impl core::error::Error for GetEntitiesRequestError {}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(
    rename_all = "camelCase",
    try_from = "GetEntitiesRequestData",
    deny_unknown_fields
)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
pub struct GetEntitiesRequest<'q, 's, 'p> {
    #[serde(flatten, borrow)]
    pub query: GetEntitiesQuery<'q>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    pub limit: Option<usize>,
    #[serde(borrow, default)]
    pub conversions: Vec<QueryConversion<'p>>,
    #[serde(borrow)]
    pub sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    pub cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_created_by_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
    #[serde(default)]
    pub include_type_ids: bool,
    #[serde(default)]
    pub include_type_titles: bool,
}

impl<'q, 's, 'p> TryFrom<GetEntitiesRequestData<'q, 's, 'p>> for GetEntitiesRequest<'q, 's, 'p> {
    type Error = GetEntitiesRequestError;

    fn try_from(value: GetEntitiesRequestData<'q, 's, 'p>) -> Result<Self, Self::Error> {
        let GetEntitiesRequestData {
            filter,
            query,
            temporal_axes,
            include_drafts,
            limit,
            conversions,
            sorting_paths,
            cursor,
            include_count,
            include_entity_types,
            include_web_ids,
            include_created_by_ids,
            include_edition_created_by_ids,
            include_type_ids,
            include_type_titles,
            graph_resolve_depths,
            traversal_paths,
        } = value;

        if graph_resolve_depths.is_some() {
            return Err(GetEntitiesRequestError::SubgraphRequestField(
                "graphResolveDepths",
            ));
        }

        if traversal_paths.is_some() {
            return Err(GetEntitiesRequestError::SubgraphRequestField(
                "traversalPaths",
            ));
        }

        let query = match (filter, query) {
            (None, None) => return Err(GetEntitiesRequestError::ExpectedFilterOrQueryGotNeither),
            (Some(_), Some(_)) => {
                return Err(GetEntitiesRequestError::ExpectedFilterOrQueryGotBoth);
            }
            (Some(filter), None) => GetEntitiesQuery::Filter { filter },
            (None, Some(query)) => GetEntitiesQuery::Query { query },
        };

        Ok(Self {
            query,
            temporal_axes,
            include_drafts,
            limit,
            conversions,
            sorting_paths,
            cursor,
            include_count,
            include_entity_types,
            include_web_ids,
            include_created_by_ids,
            include_edition_created_by_ids,
            include_type_ids,
            include_type_titles,
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::From)]
enum GetEntitySubgraphRequestError {
    #[from]
    GetEntityRequest(GetEntitiesRequestError),
    #[display("Expected either `graphResolveDepths` or `traversalPaths` but got neither")]
    NeitherGraphResolveDepthsNorTraversalPaths,
    #[display("Expected either `graphResolveDepths` or `traversalPaths` but got both")]
    BothGraphResolveDepthsAndTraversalPaths,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, try_from = "GetEntitiesRequestData", deny_unknown_fields)]
pub enum GetEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(rename_all = "camelCase")]
    ResolveDepths {
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        request: GetEntitiesRequest<'q, 's, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    Paths {
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        request: GetEntitiesRequest<'q, 's, 'p>,
    },
}

impl<'q, 's, 'p> TryFrom<GetEntitiesRequestData<'q, 's, 'p>>
    for GetEntitySubgraphRequest<'q, 's, 'p>
{
    type Error = GetEntitySubgraphRequestError;

    fn try_from(mut value: GetEntitiesRequestData<'q, 's, 'p>) -> Result<Self, Self::Error> {
        let graph_resolve_depths = value.graph_resolve_depths.take();
        let traversal_paths = value.traversal_paths.take();

        match (graph_resolve_depths, traversal_paths) {
            (None, None) => {
                Err(GetEntitySubgraphRequestError::NeitherGraphResolveDepthsNorTraversalPaths)
            }
            (Some(_), Some(_)) => {
                Err(GetEntitySubgraphRequestError::BothGraphResolveDepthsAndTraversalPaths)
            }
            (Some(graph_resolve_depths), None) => Ok(GetEntitySubgraphRequest::ResolveDepths {
                graph_resolve_depths,
                request: value.try_into()?,
            }),
            (None, Some(traversal_paths)) => Ok(GetEntitySubgraphRequest::Paths {
                traversal_paths,
                request: value.try_into()?,
            }),
        }
    }
}
