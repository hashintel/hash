use alloc::borrow::Cow;

use authorization::AuthorizationApi;
use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::EntityQueryPath,
    store::{
        knowledge::{GetEntitiesParams, GetEntitySubgraphParams},
        query::{Filter, FilterExpression, JsonPath, Parameter, PathToken},
        EntityQuerySorting, EntityStore,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use graph_types::{account::AccountId, knowledge::entity::EntityUuid};
use rand::{prelude::IteratorRandom, thread_rng};
use temporal_versioning::TemporalBound;
use tokio::runtime::Runtime;

use crate::util::Store;

pub fn bench_get_entity_by_id<A: AuthorizationApi>(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    entity_uuids: &[EntityUuid],
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to query
            *entity_uuids
                .iter()
                .choose(&mut thread_rng())
                .expect("could not choose random entity")
        },
        |entity_uuid| async move {
            let response = store
                .get_entities(
                    actor_id,
                    GetEntitiesParams {
                        filter: Filter::Equal(
                            Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                            Some(FilterExpression::Parameter(Parameter::Uuid(
                                entity_uuid.into_uuid(),
                            ))),
                        ),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        sorting: EntityQuerySorting {
                            paths: Vec::new(),
                            cursor: None,
                        },
                        limit: None,
                        include_count: false,
                        include_drafts: false,
                    },
                )
                .await
                .expect("failed to read entity from store");
            assert_eq!(response.entities.len(), 1);
        },
        SmallInput,
    );
}

pub fn bench_get_entities_by_property<A: AuthorizationApi>(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    graph_resolve_depths: GraphResolveDepths,
) {
    b.to_async(runtime).iter(|| async move {
        let mut filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
                    "https://blockprotocol.org/@alice/types/property-type/name/",
                ))]),
            )))),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Alice",
            )))),
        );
        filter
            .convert_parameters()
            .expect("failed to convert parameters");
        let response = store
            .get_entity_subgraph(
                actor_id,
                GetEntitySubgraphParams {
                    filter,
                    graph_resolve_depths,
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: false,
                    include_drafts: false,
                },
            )
            .await
            .expect("failed to read entity from store");
        assert_eq!(response.subgraph.roots.len(), 100);
    });
}

pub fn bench_get_link_by_target_by_property<A: AuthorizationApi>(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    graph_resolve_depths: GraphResolveDepths,
) {
    b.to_async(runtime).iter(|| async move {
        let mut filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::Properties(Some(
                    JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
                        "https://blockprotocol.org/@alice/types/property-type/name/",
                    ))]),
                ))),
                direction: EdgeDirection::Outgoing,
            })),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Alice",
            )))),
        );
        filter
            .convert_parameters()
            .expect("failed to convert parameters");
        let response = store
            .get_entity_subgraph(
                actor_id,
                GetEntitySubgraphParams {
                    filter,
                    graph_resolve_depths,
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: false,
                    include_drafts: false,
                },
            )
            .await
            .expect("failed to read entity from store");
        assert_eq!(response.subgraph.roots.len(), 100);
    });
}
