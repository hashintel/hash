use std::borrow::Cow;

use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    identifier::time::TemporalBound,
    knowledge::{EntityQueryPath, EntityUuid},
    store::{
        query::{Filter, FilterExpression, JsonPath, Parameter, PathToken},
        EntityStore,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind},
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;

use crate::util::Store;

pub fn bench_get_entity_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
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
            let subgraph = store
                .get_entity(&StructuralQuery {
                    filter: Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            entity_uuid.as_uuid(),
                        ))),
                    ),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                })
                .await
                .expect("failed to read entity from store");
            assert_eq!(subgraph.roots.len(), 1);
        },
        SmallInput,
    );
}

pub fn bench_get_entities_by_property(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
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
        let subgraph = store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths,
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
            })
            .await
            .expect("failed to read entity from store");
        assert_eq!(subgraph.roots.len(), 100);
    });
}

pub fn bench_get_link_by_target_by_property(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
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
        let subgraph = store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths,
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
            })
            .await
            .expect("failed to read entity from store");
        assert_eq!(subgraph.roots.len(), 100);
    });
}
