use std::borrow::Cow;

use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    identifier::time::{
        TimespanBound, UnresolvedImage, UnresolvedKernel, UnresolvedProjection,
        UnresolvedTimeProjection,
    },
    knowledge::{EntityQueryPath, EntityUuid},
    store::{
        query::{Filter, FilterExpression, Parameter},
        EntityStore,
    },
    subgraph::{edges::GraphResolveDepths, query::StructuralQuery},
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
                    filter: Filter::All(vec![
                        Filter::Equal(
                            Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                            Some(FilterExpression::Parameter(Parameter::Uuid(
                                entity_uuid.as_uuid(),
                            ))),
                        ),
                        Filter::Equal(
                            Some(FilterExpression::Path(
                                EntityQueryPath::LowerTransactionTime,
                            )),
                            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                                "latest",
                            )))),
                        ),
                    ]),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                        kernel: UnresolvedKernel::new(None),
                        image: UnresolvedImage::new(
                            Some(TimespanBound::Unbounded),
                            Some(TimespanBound::Unbounded),
                        ),
                    }),
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
        let subgraph = store
            .get_entity(&StructuralQuery {
                filter: Filter::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::Properties(Some(
                        Cow::Borrowed("https://blockprotocol.org/@alice/types/property-type/name/"),
                    )))),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "Alice",
                    )))),
                ),
                graph_resolve_depths,
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimespanBound::Unbounded),
                        Some(TimespanBound::Unbounded),
                    ),
                }),
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
        let subgraph = store
            .get_entity(&StructuralQuery {
                filter: Filter::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::RightEntity(
                        Box::new(EntityQueryPath::Properties(Some(Cow::Borrowed(
                            "https://blockprotocol.org/@alice/types/property-type/name/",
                        )))),
                    ))),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "Alice",
                    )))),
                ),
                graph_resolve_depths,
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimespanBound::Unbounded),
                        Some(TimespanBound::Unbounded),
                    ),
                }),
            })
            .await
            .expect("failed to read entity from store");
        assert_eq!(subgraph.roots.len(), 100);
    });
}
