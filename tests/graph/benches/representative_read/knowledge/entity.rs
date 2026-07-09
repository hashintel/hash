use alloc::borrow::Cow;
use core::cell::RefCell;

use criterion::{BatchSize::SmallInput, Bencher};
use hash_graph_store::{
    entity::{
        EntityQueryPath, EntityQuerySorting, EntityStore as _, QueryEntitiesParams,
        QueryEntitySubgraphParams,
    },
    filter::{Filter, FilterExpression, JsonPath, Parameter, PathToken},
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, SubgraphTraversalParams},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use rand::{prelude::IteratorRandom as _, rng};
use tokio::runtime::Runtime;
use type_system::{knowledge::entity::id::EntityUuid, principal::actor::ActorEntityUuid};

use crate::util::Store;

#[expect(
    clippy::await_holding_refcell_ref,
    reason = "criterion drives one benchmark future at a time to completion on a single thread, \
              so the `RefCell` borrow is never contended"
)]
pub fn bench_get_entity_by_id(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &RefCell<&mut Store>,
    actor_id: ActorEntityUuid,
    entity_uuids: &[EntityUuid],
) {
    bencher.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to query
            *entity_uuids
                .iter()
                .choose(&mut rng())
                .expect("could not choose random entity")
        },
        |entity_uuid| async move {
            let response = store
                .borrow_mut()
                .query_entities(
                    actor_id,
                    QueryEntitiesParams {
                        filter: Filter::Equal(
                            FilterExpression::Path {
                                path: EntityQueryPath::Uuid,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid(entity_uuid.into()),
                                convert: None,
                            },
                        ),
                        temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                        sorting: EntityQuerySorting {
                            paths: Vec::new(),
                            cursor: None,
                        },
                        limit: 1000,
                        conversions: Vec::new(),
                        include_entity_types: None,
                        include_drafts: false,
                        include_permissions: false,
                    },
                )
                .await
                .expect("failed to read entity from store");
            assert_eq!(response.entities.len(), 1);
        },
        SmallInput,
    );
}

#[expect(
    clippy::await_holding_refcell_ref,
    reason = "criterion drives one benchmark future at a time to completion on a single thread, \
              so the `RefCell` borrow is never contended"
)]
pub fn bench_query_entities_by_property(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &RefCell<&mut Store>,
    actor_id: ActorEntityUuid,
    traversal_params: &SubgraphTraversalParams,
) {
    bencher.to_async(runtime).iter(|| {
        let traversal_params = traversal_params.clone();
        async move {
            let filter = Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![
                        PathToken::Field(Cow::Borrowed(
                            "https://blockprotocol.org/@alice/types/property-type/name/",
                        )),
                    ]))),
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("Alice")),
                    convert: None,
                },
            );
            let response = store
                .borrow_mut()
                .query_entity_subgraph(
                    actor_id,
                    QueryEntitySubgraphParams::from_parts(
                        QueryEntitiesParams {
                            filter,
                            temporal_axes: QueryTemporalAxesUnresolved::all(),
                            sorting: EntityQuerySorting {
                                paths: Vec::new(),
                                cursor: None,
                            },
                            limit: 1000,
                            conversions: Vec::new(),
                            include_entity_types: None,
                            include_drafts: false,
                            include_permissions: false,
                        },
                        traversal_params,
                    ),
                )
                .await
                .expect("failed to read entity from store");
            assert_eq!(response.subgraph.roots.len(), 100);
        }
    });
}

#[expect(
    clippy::await_holding_refcell_ref,
    reason = "criterion drives one benchmark future at a time to completion on a single thread, \
              so the `RefCell` borrow is never contended"
)]
pub fn bench_get_link_by_target_by_property(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &RefCell<&mut Store>,
    actor_id: ActorEntityUuid,
    traversal_params: &SubgraphTraversalParams,
) {
    bencher.to_async(runtime).iter(|| {
        let traversal_params = traversal_params.clone();
        async move {
            let filter = Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::EntityEdge {
                        edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                        path: Box::new(EntityQueryPath::Properties(Some(
                            JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
                                "https://blockprotocol.org/@alice/types/property-type/name/",
                            ))]),
                        ))),
                        direction: EdgeDirection::Outgoing,
                    },
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("Alice")),
                    convert: None,
                },
            );
            let response = store
                .borrow_mut()
                .query_entity_subgraph(
                    actor_id,
                    QueryEntitySubgraphParams::from_parts(
                        QueryEntitiesParams {
                            filter,
                            temporal_axes: QueryTemporalAxesUnresolved::all(),
                            sorting: EntityQuerySorting {
                                paths: Vec::new(),
                                cursor: None,
                            },
                            limit: 1000,
                            conversions: Vec::new(),
                            include_entity_types: None,
                            include_drafts: false,
                            include_permissions: false,
                        },
                        traversal_params,
                    ),
                )
                .await
                .expect("failed to read entity from store");
            assert_eq!(response.subgraph.roots.len(), 100);
        }
    });
}
