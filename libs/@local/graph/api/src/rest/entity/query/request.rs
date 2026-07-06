use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        QueryConversion, QueryEntitiesParams, QueryEntitySubgraphParams,
    },
    entity_type::IncludeEntityTypeOption,
    filter::Filter,
    query::Ordering,
    subgraph::{
        edges::{
            EntityTraversalPath, GraphResolveDepths, MAX_TRAVERSAL_PATHS, SubgraphTraversalParams,
            TraversalDepthError, TraversalPath,
        },
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use type_system::knowledge::Entity;

use crate::rest::{ApiConfig, LimitExceededError, resolve_limit};

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
pub enum QueryEntitySubgraphError {
    #[display("Query limit exceeded")]
    Limit,
    #[display("Traversal depth exceeded")]
    TraversalDepth,
    #[display("Resolve depth exceeded")]
    ResolveDepth,
}

impl core::error::Error for QueryEntitySubgraphError {}

fn validate_traversal(
    params: &SubgraphTraversalParams,
) -> Result<(), Report<QueryEntitySubgraphError>> {
    match params {
        SubgraphTraversalParams::Paths { traversal_paths } => {
            if traversal_paths.len() > MAX_TRAVERSAL_PATHS {
                return Err(Report::new(TraversalDepthError::TooManyPaths {
                    actual: traversal_paths.len(),
                    max: MAX_TRAVERSAL_PATHS,
                })
                .change_context(QueryEntitySubgraphError::TraversalDepth));
            }
            for path in traversal_paths {
                path.validate()
                    .change_context(QueryEntitySubgraphError::TraversalDepth)?;
            }
        }
        SubgraphTraversalParams::ResolveDepths {
            traversal_paths,
            graph_resolve_depths,
        } => {
            if traversal_paths.len() > MAX_TRAVERSAL_PATHS {
                return Err(Report::new(TraversalDepthError::TooManyPaths {
                    actual: traversal_paths.len(),
                    max: MAX_TRAVERSAL_PATHS,
                })
                .change_context(QueryEntitySubgraphError::TraversalDepth));
            }
            for path in traversal_paths {
                path.validate()
                    .change_context(QueryEntitySubgraphError::TraversalDepth)?;
            }
            graph_resolve_depths
                .validate()
                .change_context(QueryEntitySubgraphError::ResolveDepth)?;
        }
    }
    Ok(())
}

#[tracing::instrument(level = "info", skip_all)]
fn generate_sorting_paths(
    paths: Option<Vec<EntityQuerySortingRecord<'_>>>,
    temporal_axes: &QueryTemporalAxesUnresolved,
) -> Vec<EntityQuerySortingRecord<'static>> {
    let temporal_axes_sorting_path = match temporal_axes {
        QueryTemporalAxesUnresolved::TransactionTime { .. } => &EntityQueryPath::TransactionTime,
        QueryTemporalAxesUnresolved::DecisionTime { .. } => &EntityQueryPath::DecisionTime,
    };

    paths
        .map_or_else(
            || {
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
        .collect()
}

#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesRequest<'q, 's, 'p> {
    #[serde(borrow)]
    pub filter: Filter<'q, Entity>,

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
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    pub include_permissions: bool,
}

impl<'q, 'p> QueryEntitiesRequest<'q, '_, 'p> {
    /// Convert this request into [`QueryEntitiesParams`] with the given [`ApiConfig`] and resolved
    /// limit.
    ///
    /// Does not validate that the resolved limit does not exceed [`ApiConfig::query_entity_limit`].
    pub fn into_params_unchecked(
        self,
        config: ApiConfig,
        limit: Option<usize>,
    ) -> QueryEntitiesParams<'q>
    where
        'p: 'q,
    {
        let limit = limit.or(self.limit).unwrap_or(config.query_entity_limit);

        QueryEntitiesParams {
            filter: self.filter,
            sorting: EntityQuerySorting {
                paths: generate_sorting_paths(self.sorting_paths, &self.temporal_axes),
                cursor: self.cursor.map(EntityQueryCursor::into_owned),
            },
            limit,
            conversions: self.conversions,
            include_drafts: self.include_drafts,
            include_entity_types: self.include_entity_types,
            temporal_axes: self.temporal_axes,
            include_permissions: self.include_permissions,
        }
    }

    /// Convert this request into [`QueryEntitiesParams`] with the given [`ApiConfig`] and resolved
    /// limit.
    ///
    /// # Errors
    ///
    /// Returns [`LimitExceededError`] if the requested limit exceeds the configured maximum in
    /// [`ApiConfig::query_entity_limit`].
    pub fn into_params(
        self,
        config: ApiConfig,
    ) -> Result<QueryEntitiesParams<'q>, Report<LimitExceededError>>
    where
        'p: 'q,
    {
        let limit = resolve_limit(self.limit, config.query_entity_limit)?;

        Ok(self.into_params_unchecked(config, Some(limit)))
    }
}

#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(untagged, deny_unknown_fields)]
pub enum QueryEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(rename_all = "camelCase")]
    ResolveDepths {
        traversal_paths: Vec<EntityTraversalPath>,
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        request: QueryEntitiesRequest<'q, 's, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    Paths {
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        request: QueryEntitiesRequest<'q, 's, 'p>,
    },
}

impl<'q, 's, 'p> QueryEntitySubgraphRequest<'q, 's, 'p> {
    #[must_use]
    pub fn into_parts(self) -> (QueryEntitiesRequest<'q, 's, 'p>, SubgraphTraversalParams) {
        match self {
            QueryEntitySubgraphRequest::Paths {
                traversal_paths,
                request: options,
            } => (options, SubgraphTraversalParams::Paths { traversal_paths }),
            QueryEntitySubgraphRequest::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                request: options,
            } => (
                options,
                SubgraphTraversalParams::ResolveDepths {
                    traversal_paths,
                    graph_resolve_depths,
                },
            ),
        }
    }

    #[must_use]
    pub fn from_parts(
        request: QueryEntitiesRequest<'q, 's, 'p>,
        params: SubgraphTraversalParams,
    ) -> Self {
        match params {
            SubgraphTraversalParams::Paths { traversal_paths } => {
                QueryEntitySubgraphRequest::Paths {
                    traversal_paths,
                    request,
                }
            }
            SubgraphTraversalParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
            } => QueryEntitySubgraphRequest::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                request,
            },
        }
    }

    /// Convert the request into traversal parameters. Skipping validation.
    #[must_use]
    pub fn into_traversal_params_unchecked(self, config: ApiConfig) -> QueryEntitySubgraphParams<'q>
    where
        'p: 'q,
    {
        let (request, params) = self.into_parts();
        let request = request.into_params_unchecked(config, None);

        match params {
            SubgraphTraversalParams::Paths { traversal_paths } => {
                QueryEntitySubgraphParams::Paths {
                    traversal_paths,
                    request,
                }
            }
            SubgraphTraversalParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
            } => QueryEntitySubgraphParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                request,
            },
        }
    }

    /// Convert the request into traversal parameters.
    ///
    /// # Errors
    ///
    /// Returns [`QueryEntitySubgraphError`] if:
    /// - The requested limit exceeds the configured maximum.
    /// - The number of traversal paths exceeds [`MAX_TRAVERSAL_PATHS`].
    /// - Any traversal path exceeds the maximum edge count.
    /// - Graph resolve depths exceed the allowed maximum.
    pub fn into_traversal_params(
        self,
        config: ApiConfig,
    ) -> Result<QueryEntitySubgraphParams<'q>, Report<QueryEntitySubgraphError>>
    where
        'p: 'q,
    {
        let (request, params) = self.into_parts();

        validate_traversal(&params)?;

        let request = request
            .into_params(config)
            .change_context(QueryEntitySubgraphError::Limit)?;

        match params {
            SubgraphTraversalParams::Paths { traversal_paths } => {
                Ok(QueryEntitySubgraphParams::Paths {
                    traversal_paths,
                    request,
                })
            }
            SubgraphTraversalParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
            } => Ok(QueryEntitySubgraphParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                request,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use serde_json::json;

    use super::*;

    /// Minimal valid temporal axes for test payloads.
    fn temporal_axes() -> serde_json::Value {
        json!({
            "pinned": {
                "axis": "transactionTime",
                "timestamp": null
            },
            "variable": {
                "axis": "decisionTime",
                "interval": {
                    "start": null,
                    "end": null
                }
            }
        })
    }

    /// Minimal valid request body shared across tests.
    fn base_request() -> String {
        json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string()
    }

    #[test]
    fn deserialize_minimal_entity_request() {
        let payload = base_request();
        assert_matches!(
            serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitiesRequest {
                include_drafts: false,
                include_permissions: false,
                limit: None,
                sorting_paths: None,
                cursor: None,
                include_entity_types: None,
                ..
            })
        );
    }

    #[test]
    fn deserialize_entity_request_with_all_fields() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": true,
            "includePermissions": true,
            "limit": 50,
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitiesRequest {
                include_drafts: true,
                include_permissions: true,
                limit: Some(50),
                ..
            })
        );
    }

    #[test]
    fn reject_entity_request_missing_filter() {
        let payload = json!({
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload)
            .expect_err("missing filter should fail")
            .to_string();
        assert!(err.starts_with("missing field `filter`"), "{err}");
    }

    #[test]
    fn reject_entity_request_missing_temporal_axes() {
        let payload = json!({
            "filter": { "all": [] },
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload)
            .expect_err("missing temporalAxes should fail")
            .to_string();
        assert!(err.starts_with("missing field `temporalAxes`"), "{err}");
    }

    #[test]
    fn reject_entity_request_missing_include_drafts() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includePermissions": false
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload)
            .expect_err("missing includeDrafts should fail")
            .to_string();
        assert!(err.starts_with("missing field `includeDrafts`"), "{err}");
    }

    #[test]
    fn reject_entity_request_missing_include_permissions() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload)
            .expect_err("missing includePermissions should fail")
            .to_string();
        assert!(
            err.starts_with("missing field `includePermissions`"),
            "{err}"
        );
    }

    #[test]
    fn deserialize_subgraph_paths_variant() {
        let payload = json!({
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "has-left-entity", "direction": "incoming" },
                        { "kind": "has-right-entity", "direction": "outgoing" }
                    ]
                }
            ],
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitySubgraphRequest::Paths {
                traversal_paths,
                request: QueryEntitiesRequest { include_drafts: false, .. },
            }) if traversal_paths.len() == 1 && traversal_paths[0].edges.len() == 2
        );
    }

    #[test]
    fn deserialize_subgraph_resolve_depths_variant() {
        let payload = json!({
            "traversalPaths": [],
            "graphResolveDepths": {
                "inheritsFrom": 0,
                "constrainsValuesOn": 0,
                "constrainsPropertiesOn": 0,
                "constrainsLinksOn": 0,
                "constrainsLinkDestinationsOn": 0,
                "isOfType": false
            },
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitySubgraphRequest::ResolveDepths {
                traversal_paths,
                graph_resolve_depths: GraphResolveDepths {
                    inherits_from: 0,
                    is_of_type: false,
                    ..
                },
                request: QueryEntitiesRequest { include_drafts: false, .. },
            }) if traversal_paths.is_empty()
        );
    }

    #[test]
    fn reject_subgraph_missing_traversal_paths() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload)
            .expect_err("missing traversalPaths should fail")
            .to_string();
        assert!(
            err.starts_with(
                "data did not match any variant of untagged enum QueryEntitySubgraphRequest"
            ),
            "{err}"
        );
    }

    #[test]
    fn deserialize_filter_request_with_limit() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "limit": 100,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitiesRequest {
                limit: Some(100),
                ..
            })
        );
    }

    #[test]
    fn deserialize_subgraph_resolve_depths_with_traversal() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "graphResolveDepths": {
                "inheritsFrom": 255,
                "constrainsValuesOn": 255,
                "constrainsPropertiesOn": 255,
                "constrainsLinksOn": 255,
                "constrainsLinkDestinationsOn": 255,
                "isOfType": true
            },
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "has-left-entity", "direction": "incoming" },
                        { "kind": "has-right-entity", "direction": "outgoing" }
                    ]
                }
            ],
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitySubgraphRequest::ResolveDepths {
                traversal_paths,
                graph_resolve_depths: GraphResolveDepths {
                    inherits_from: 255,
                    is_of_type: true,
                    ..
                },
                request: QueryEntitiesRequest { include_permissions: false, .. },
            }) if traversal_paths.len() == 1
        );
    }

    #[test]
    fn reject_resolve_depths_with_non_entity_edge() {
        // If traversalPaths contains an ontology edge (e.g. "is-of-type"), it can't
        // deserialize as EntityTraversalPath. The untagged enum must not silently
        // fall through to the Paths variant, dropping graphResolveDepths.
        let payload = json!({
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "is-of-type" }
                    ]
                }
            ],
            "graphResolveDepths": {
                "inheritsFrom": 255,
                "constrainsValuesOn": 255,
                "constrainsPropertiesOn": 255,
                "constrainsLinksOn": 255,
                "constrainsLinkDestinationsOn": 255,
                "isOfType": true
            },
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        let result = serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload);

        match result {
            Err(_) => {} // Correctly rejected
            Ok(QueryEntitySubgraphRequest::ResolveDepths { .. }) => {
                panic!("should not parse ontology edges as EntityTraversalPath");
            }
            Ok(QueryEntitySubgraphRequest::Paths { .. }) => {
                panic!("silently fell through to Paths variant, dropping graphResolveDepths");
            }
        }
    }

    #[test]
    fn deserialize_paths_with_ontology_edge() {
        // Ontology edges (like is-of-type) are valid in TraversalPath but not
        // EntityTraversalPath. Without graphResolveDepths, this should parse as Paths.
        let payload = json!({
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "has-left-entity", "direction": "incoming" },
                        { "kind": "is-of-type" }
                    ]
                }
            ],
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitySubgraphRequest::Paths {
                traversal_paths,
                ..
            }) if traversal_paths.len() == 1 && traversal_paths[0].edges.len() == 2
        );
    }

    #[test]
    fn reject_entity_request_unknown_field() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false,
            "bogusField": 42
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitiesRequest<'_, '_, '_>>(&payload)
            .expect_err("unknown field should be rejected")
            .to_string();
        assert!(err.contains("bogusField"), "{err}");
    }

    #[test]
    fn reject_subgraph_unknown_field_through_flatten() {
        // The subgraph enum uses `#[serde(flatten)]` on the inner request.
        // Verify that `deny_unknown_fields` still catches unknown keys that
        // would pass through the flattened struct boundary.
        let payload = json!({
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "has-left-entity", "direction": "incoming" }
                    ]
                }
            ],
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false,
            "bogusField": 42
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload)
            .expect_err("unknown field through flatten should be rejected")
            .to_string();
        // With untagged + flatten, serde reports "did not match any variant"
        // because both variants reject the unknown field.
        assert!(
            err.contains("bogusField") || err.contains("did not match any variant"),
            "{err}"
        );
    }

    #[test]
    fn reject_subgraph_resolve_depths_unknown_field_through_flatten() {
        let payload = json!({
            "traversalPaths": [],
            "graphResolveDepths": {
                "inheritsFrom": 0,
                "constrainsValuesOn": 0,
                "constrainsPropertiesOn": 0,
                "constrainsLinksOn": 0,
                "constrainsLinkDestinationsOn": 0,
                "isOfType": false
            },
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "includeDrafts": false,
            "includePermissions": false,
            "sneakyExtra": true
        })
        .to_string();
        let err = serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload)
            .expect_err("unknown field through flatten should be rejected")
            .to_string();
        assert!(
            err.contains("sneakyExtra") || err.contains("did not match any variant"),
            "{err}"
        );
    }

    #[test]
    fn deserialize_subgraph_paths_with_traversal() {
        let payload = json!({
            "filter": { "all": [] },
            "temporalAxes": temporal_axes(),
            "traversalPaths": [
                {
                    "edges": [
                        { "kind": "has-left-entity", "direction": "incoming" },
                        { "kind": "has-right-entity", "direction": "outgoing" }
                    ]
                }
            ],
            "includeDrafts": false,
            "includePermissions": false
        })
        .to_string();
        assert_matches!(
            serde_json::from_str::<QueryEntitySubgraphRequest<'_, '_, '_>>(&payload),
            Ok(QueryEntitySubgraphRequest::Paths {
                traversal_paths,
                request: QueryEntitiesRequest { include_permissions: false, .. },
            }) if traversal_paths.len() == 1 && traversal_paths[0].edges.len() == 2
        );
    }
}
