//! Request types for entity queries.
//!
//! Contains the deserialization structs for both simple entity queries and subgraph requests.
//! Some design choices may look odd due to serde/OpenAPI limitations we need to work around:
//!
//! - Uses proxy structs for deserialization because `RawValue` doesn't play nice with `untagged` +
//!   `deny_unknown_fields` (forces intermediate representation).
//! - Subgraph enum has 4 variants instead of nested structs because openapi-generator uses `&`
//!   instead of `|` for nested `oneOf` constraints.
//! - Outer enum instead of nested enum because utoipa generates `allOf` constraints (merges all
//!   fields into one type). With discriminator on the outer edge we get `oneOf` (proper union), but
//!   openapi-generator can't handle nested oneOf and merges them anyway - so we flatten everything
//! - Lots of boolean fields instead of option structs for the same reason
//!
//! When changing any of these types, make sure that the OpenAPI generator types do not degenerate
//! into any of these cases.
use alloc::sync::Arc;

use hash_graph_store::{
    entity::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        GetEntitiesParams, GetEntitySubgraphParams, QueryConversion,
    },
    entity_type::IncludeEntityTypeOption,
    filter::Filter,
    query::Ordering,
    subgraph::{
        edges::{GraphResolveDepths, SubgraphTraversalParams, TraversalPath},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use hashql_core::{
    collection::fast_hash_map, heap::Heap, module::ModuleRegistry, span::storage::SpanStorage,
    r#type::environment::Environment,
};
use hashql_eval::graph::read::FilterSlice;
use hashql_hir::visit::Visitor as _;
use serde::Deserialize;
use serde_json::value::RawValue;
use type_system::knowledge::Entity;
use utoipa::ToSchema;

#[tracing::instrument(level = "info", skip_all)]
fn generate_sorting_paths(
    paths: Option<Vec<EntityQuerySortingRecord<'_>>>,
    limit: Option<usize>,
    cursor: Option<EntityQueryCursor<'_>>,
    temporal_axes: &QueryTemporalAxesUnresolved,
) -> EntityQuerySorting<'static> {
    let temporal_axes_sorting_path = match temporal_axes {
        QueryTemporalAxesUnresolved::TransactionTime { .. } => &EntityQueryPath::TransactionTime,
        QueryTemporalAxesUnresolved::DecisionTime { .. } => &EntityQueryPath::DecisionTime,
    };

    let sorting = paths
        .map_or_else(
            || {
                if limit.is_some() || cursor.is_some() {
                    vec![
                        EntityQuerySortingRecord {
                            path: temporal_axes_sorting_path.clone(),
                            ordering: Ordering::Descending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::Uuid,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::WebId,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                    ]
                } else {
                    Vec::new()
                }
            },
            |mut paths| {
                let mut has_temporal_axis = false;
                let mut has_uuid = false;
                let mut has_web_id = false;

                for path in &paths {
                    if path.path == EntityQueryPath::TransactionTime
                        || path.path == EntityQueryPath::DecisionTime
                    {
                        has_temporal_axis = true;
                    }
                    if path.path == EntityQueryPath::Uuid {
                        has_uuid = true;
                    }
                    if path.path == EntityQueryPath::WebId {
                        has_web_id = true;
                    }
                }

                if !has_temporal_axis {
                    paths.push(EntityQuerySortingRecord {
                        path: temporal_axes_sorting_path.clone(),
                        ordering: Ordering::Descending,
                        nulls: None,
                    });
                }
                if !has_uuid {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::Uuid,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }
                if !has_web_id {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::WebId,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }

                paths
            },
        )
        .into_iter()
        .map(EntityQuerySortingRecord::into_owned)
        .collect();

    EntityQuerySorting {
        paths: sorting,
        cursor: cursor.map(EntityQueryCursor::into_owned),
    }
}

/// Internal deserialization proxy for `GetEntitiesRequest`.
///
/// This struct is necessary because [`RawValue`] cannot be used directly with `#[serde(untagged,
/// deny_unknown_fields)]` - these attributes force deserialization into an intermediate
/// representation, which cannot deserialize into a [`RawValue`] as it materializes the content.
///
/// See <https://github.com/serde-rs/json/issues/497> and <https://github.com/serde-rs/serde/issues/1183> for more details.
#[derive(Debug, Clone, Deserialize)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
#[serde(rename_all = "camelCase")]
struct FlatEntitiesRequestData<'q, 's, 'p> {
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

#[derive(Debug, Clone)]
#[expect(clippy::large_enum_variant)]
pub enum EntityQuery<'q> {
    Filter { filter: Filter<'q, Entity> },
    Query { query: &'q RawValue },
}

impl<'q> EntityQuery<'q> {
    #[expect(
        clippy::unnecessary_wraps,
        clippy::panic_in_result_fn,
        reason = "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
    )]
    fn compile_query<'h>(
        heap: &'h Heap,
        query: &serde_json::value::RawValue,
    ) -> Result<Filter<'h, Entity>, !> {
        let spans = Arc::new(SpanStorage::new());

        // Parse the query
        let parser = hashql_syntax_jexpr::Parser::new(heap, Arc::clone(&spans));
        let mut ast = parser.parse_expr(query.get().as_bytes()).expect(
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
        );

        let mut env = Environment::new(ast.span, heap);
        let modules = ModuleRegistry::new(&env);

        // Lower the AST
        let (types, diagnostics) =
            hashql_ast::lowering::lower(heap.intern_symbol("main"), &mut ast, &env, &modules);
        assert!(
            diagnostics.is_empty(),
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
        );

        let interner = hashql_hir::intern::Interner::new(heap);

        // Reify the HIR from the AST
        let (hir, diagnostics) = hashql_hir::node::Node::from_ast(ast, &env, &interner, &types);
        assert!(
            diagnostics.is_empty(),
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
        );
        let hir = hir.expect(
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
        );

        // Lower the HIR
        let hir = hashql_hir::lower::lower(hir, &types, &mut env, &modules, &interner).expect(
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
        );

        // Evaluate the HIR
        // TODO: https://linear.app/hash/issue/BE-41/hashql-expose-input-in-graph-api
        let inputs = fast_hash_map(0);
        let mut compiler = hashql_eval::graph::read::GraphReadCompiler::new(heap, &inputs);

        compiler.visit_node(&hir);

        let result = compiler.finish().expect(
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
        );

        let output = result.output.get(&hir.id).expect(
            "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
        );

        // Compile the Filter into one
        let filters = match output {
            FilterSlice::Entity { range } => result.filters.entity(range.clone()),
        };

        let filter = match filters {
            [] => Filter::All(Vec::new()),
            [filter] => filter.clone(),
            _ => Filter::All(filters.to_vec()),
        };

        Ok(filter)
    }

    /// Compiles a query into an executable entity filter.
    ///
    /// Transforms the query representation into a [`Filter`] that can be executed
    /// against the entity store. For already-compiled filter queries, this returns
    /// the filter directly. For raw HashQL queries, it parses and compiles them using
    /// the provided `heap` arena allocator.
    ///
    /// # Errors
    ///
    /// Returns an error if the HashQL query cannot be compiled.
    pub fn compile(self, heap: &'q Heap) -> Result<Filter<'q, Entity>, !> {
        match self {
            EntityQuery::Filter { filter } => Ok(filter),
            EntityQuery::Query { query } => Self::compile_query(heap, query),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
enum EntityQueryOptionsError {
    #[display(
        "Field '{field}' is only valid in subgraph requests. Use the subgraph endpoint instead."
    )]
    InvalidFieldForEntityQuery { field: &'static str },
    #[display(
        "Field '{field}' is only valid in entity and subgraph requests. Use the entity endpoint \
         instead."
    )]
    InvalidFieldForEntityOptions { field: &'static str },
}

impl core::error::Error for EntityQueryOptionsError {}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
pub struct EntityQueryOptions<'s, 'p> {
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

impl<'q, 's, 'p> TryFrom<FlatEntitiesRequestData<'q, 's, 'p>> for EntityQueryOptions<'s, 'p> {
    type Error = EntityQueryOptionsError;

    fn try_from(value: FlatEntitiesRequestData<'q, 's, 'p>) -> Result<Self, Self::Error> {
        let FlatEntitiesRequestData {
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

        if filter.is_some() {
            return Err(EntityQueryOptionsError::InvalidFieldForEntityOptions { field: "filter" });
        }

        if query.is_some() {
            return Err(EntityQueryOptionsError::InvalidFieldForEntityOptions { field: "query" });
        }

        if graph_resolve_depths.is_some() {
            return Err(EntityQueryOptionsError::InvalidFieldForEntityQuery {
                field: "graphResolveDepths",
            });
        }

        if traversal_paths.is_some() {
            return Err(EntityQueryOptionsError::InvalidFieldForEntityQuery {
                field: "traversalPaths",
            });
        }

        Ok(Self {
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

impl<'p> EntityQueryOptions<'_, 'p> {
    #[must_use]
    pub fn into_params<'f>(self, filter: Filter<'f, Entity>) -> GetEntitiesParams<'f>
    where
        'p: 'f,
    {
        GetEntitiesParams {
            filter,
            sorting: generate_sorting_paths(
                self.sorting_paths,
                self.limit,
                self.cursor,
                &self.temporal_axes,
            ),
            limit: self.limit,
            conversions: self.conversions,
            include_drafts: self.include_drafts,
            include_count: self.include_count,
            include_entity_types: self.include_entity_types,
            temporal_axes: self.temporal_axes,
            include_web_ids: self.include_web_ids,
            include_created_by_ids: self.include_created_by_ids,
            include_edition_created_by_ids: self.include_edition_created_by_ids,
            include_type_ids: self.include_type_ids,
            include_type_titles: self.include_type_titles,
        }
    }

    #[must_use]
    pub fn into_traversal_params<'q>(
        self,
        filter: Filter<'q, Entity>,
        traversal: SubgraphTraversalParams,
    ) -> GetEntitySubgraphParams<'q>
    where
        'p: 'q,
    {
        match traversal {
            SubgraphTraversalParams::ResolveDepths {
                graph_resolve_depths,
            } => GetEntitySubgraphParams::ResolveDepths {
                graph_resolve_depths,
                request: self.into_params(filter),
            },
            SubgraphTraversalParams::Paths { traversal_paths } => GetEntitySubgraphParams::Paths {
                traversal_paths,
                request: self.into_params(filter),
            },
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::From)]
enum GetEntitiesRequestError {
    #[from]
    RequestOptions(EntityQueryOptionsError),
    #[display("Missing required query parameter. Provide either 'filter' or 'query'.")]
    MissingQueryParameter,
    #[display("Conflicting query parameters. Provide either 'filter' or 'query', not both.")]
    ConflictingQueryParameters,
}

impl core::error::Error for GetEntitiesRequestError {}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, try_from = "FlatEntitiesRequestData", deny_unknown_fields)]
#[expect(clippy::large_enum_variant)]
pub enum GetEntitiesRequest<'q, 's, 'p> {
    #[serde(rename_all = "camelCase")]
    Query {
        #[serde(borrow)]
        #[schema(value_type = utoipa::openapi::schema::Value)]
        query: &'q RawValue,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    Filter {
        #[serde(borrow)]
        filter: Filter<'q, Entity>,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
}

impl<'q, 's, 'p> TryFrom<FlatEntitiesRequestData<'q, 's, 'p>> for GetEntitiesRequest<'q, 's, 'p> {
    type Error = GetEntitiesRequestError;

    fn try_from(mut value: FlatEntitiesRequestData<'q, 's, 'p>) -> Result<Self, Self::Error> {
        let filter = value.filter.take();
        let query = value.query.take();

        match (filter, query) {
            (None, None) => Err(GetEntitiesRequestError::MissingQueryParameter),
            (Some(_), Some(_)) => Err(GetEntitiesRequestError::ConflictingQueryParameters),
            (Some(filter), None) => Ok(Self::Filter {
                filter,
                options: value.try_into()?,
            }),
            (None, Some(query)) => Ok(Self::Query {
                query,
                options: value.try_into()?,
            }),
        }
    }
}

impl<'q, 's, 'p> GetEntitiesRequest<'q, 's, 'p> {
    #[must_use]
    pub fn from_parts(query: EntityQuery<'q>, options: EntityQueryOptions<'s, 'p>) -> Self {
        match query {
            EntityQuery::Filter { filter } => Self::Filter { filter, options },
            EntityQuery::Query { query } => Self::Query { query, options },
        }
    }

    #[must_use]
    pub fn into_parts(self) -> (EntityQuery<'q>, EntityQueryOptions<'s, 'p>) {
        match self {
            GetEntitiesRequest::Query { query, options } => (EntityQuery::Query { query }, options),
            GetEntitiesRequest::Filter { filter, options } => {
                (EntityQuery::Filter { filter }, options)
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::From)]
enum GetEntitySubgraphRequestError {
    #[from]
    GetEntityRequest(GetEntitiesRequestError),
    #[display(
        "Subgraph request missing traversal parameters. Specify either 'graphResolveDepths' or \
         'traversalPaths'."
    )]
    MissingSubgraphTraversal,
    #[display(
        "Subgraph request has conflicting traversal parameters. Specify only 'graphResolveDepths' \
         OR 'traversalPaths', not both."
    )]
    ConflictingSubgraphTraversal,
}

impl core::error::Error for GetEntitySubgraphRequestError {}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, try_from = "FlatEntitiesRequestData", deny_unknown_fields)]
pub enum GetEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(rename_all = "camelCase")]
    ResolveDepthsWithQuery {
        #[serde(borrow)]
        #[schema(value_type = utoipa::openapi::schema::Value)]
        query: &'q RawValue,
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    ResolveDepthsWithFilter {
        #[serde(borrow)]
        filter: Filter<'q, Entity>,
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    PathsWithQuery {
        #[serde(borrow)]
        #[schema(value_type = utoipa::openapi::schema::Value)]
        query: &'q RawValue,
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    PathsWithFilter {
        #[serde(borrow)]
        filter: Filter<'q, Entity>,
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        options: EntityQueryOptions<'s, 'p>,
    },
}

impl<'q, 's, 'p> TryFrom<FlatEntitiesRequestData<'q, 's, 'p>>
    for GetEntitySubgraphRequest<'q, 's, 'p>
{
    type Error = GetEntitySubgraphRequestError;

    fn try_from(mut value: FlatEntitiesRequestData<'q, 's, 'p>) -> Result<Self, Self::Error> {
        let graph_resolve_depths = value.graph_resolve_depths.take();
        let traversal_paths = value.traversal_paths.take();

        let request = value.try_into()?;

        match (graph_resolve_depths, traversal_paths, request) {
            (None, None, _) => Err(GetEntitySubgraphRequestError::MissingSubgraphTraversal),
            (Some(_), Some(_), _) => {
                Err(GetEntitySubgraphRequestError::ConflictingSubgraphTraversal)
            }
            (Some(graph_resolve_depths), None, GetEntitiesRequest::Filter { filter, options }) => {
                Ok(GetEntitySubgraphRequest::ResolveDepthsWithFilter {
                    graph_resolve_depths,
                    filter,
                    options,
                })
            }
            (Some(graph_resolve_depths), None, GetEntitiesRequest::Query { query, options }) => {
                Ok(GetEntitySubgraphRequest::ResolveDepthsWithQuery {
                    graph_resolve_depths,
                    query,
                    options,
                })
            }
            (None, Some(traversal_paths), GetEntitiesRequest::Filter { filter, options }) => {
                Ok(GetEntitySubgraphRequest::PathsWithFilter {
                    traversal_paths,
                    filter,
                    options,
                })
            }
            (None, Some(traversal_paths), GetEntitiesRequest::Query { query, options }) => {
                Ok(GetEntitySubgraphRequest::PathsWithQuery {
                    traversal_paths,
                    query,
                    options,
                })
            }
        }
    }
}

impl<'q, 's, 'p> GetEntitySubgraphRequest<'q, 's, 'p> {
    #[must_use]
    pub fn from_parts(
        query: EntityQuery<'q>,
        options: EntityQueryOptions<'s, 'p>,
        traversal_params: SubgraphTraversalParams,
    ) -> Self {
        match (query, traversal_params) {
            (
                EntityQuery::Filter { filter },
                SubgraphTraversalParams::Paths { traversal_paths },
            ) => Self::PathsWithFilter {
                filter,
                options,
                traversal_paths,
            },
            (EntityQuery::Query { query }, SubgraphTraversalParams::Paths { traversal_paths }) => {
                Self::PathsWithQuery {
                    query,
                    traversal_paths,
                    options,
                }
            }
            (
                EntityQuery::Filter { filter },
                SubgraphTraversalParams::ResolveDepths {
                    graph_resolve_depths,
                },
            ) => Self::ResolveDepthsWithFilter {
                filter,
                options,
                graph_resolve_depths,
            },
            (
                EntityQuery::Query { query },
                SubgraphTraversalParams::ResolveDepths {
                    graph_resolve_depths,
                },
            ) => Self::ResolveDepthsWithQuery {
                query,
                options,
                graph_resolve_depths,
            },
        }
    }

    #[must_use]
    pub fn into_parts(
        self,
    ) -> (
        EntityQuery<'q>,
        EntityQueryOptions<'s, 'p>,
        SubgraphTraversalParams,
    ) {
        match self {
            GetEntitySubgraphRequest::ResolveDepthsWithQuery {
                query,
                graph_resolve_depths,
                options,
            } => (
                EntityQuery::Query { query },
                options,
                SubgraphTraversalParams::ResolveDepths {
                    graph_resolve_depths,
                },
            ),
            GetEntitySubgraphRequest::ResolveDepthsWithFilter {
                filter,
                graph_resolve_depths,
                options,
            } => (
                EntityQuery::Filter { filter },
                options,
                SubgraphTraversalParams::ResolveDepths {
                    graph_resolve_depths,
                },
            ),
            GetEntitySubgraphRequest::PathsWithQuery {
                query,
                traversal_paths,
                options,
            } => (
                EntityQuery::Query { query },
                options,
                SubgraphTraversalParams::Paths { traversal_paths },
            ),
            GetEntitySubgraphRequest::PathsWithFilter {
                filter,
                traversal_paths,
                options,
            } => (
                EntityQuery::Filter { filter },
                options,
                SubgraphTraversalParams::Paths { traversal_paths },
            ),
        }
    }
}
