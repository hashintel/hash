use std::borrow::Cow;

use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::{EntityId, EntityQueryPath, LinkQueryPath},
    store::{
        query::{Filter, FilterExpression, Parameter},
        EntityStore, LinkStore,
    },
    subgraph::{GraphResolveDepths, StructuralQuery},
};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;

use crate::util::Store;

pub fn bench_get_entity_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    entity_ids: &[EntityId],
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to query
            *entity_ids.iter().choose(&mut thread_rng()).unwrap()
        },
        |entity_id| async move {
            let subgraph = store
                .get_entity(&StructuralQuery {
                    filter: Filter::for_latest_entity_by_entity_id(entity_id),
                    graph_resolve_depths: GraphResolveDepths {
                        data_type_resolve_depth: 0,
                        property_type_resolve_depth: 0,
                        entity_type_resolve_depth: 0,
                        link_type_resolve_depth: 0,
                        link_resolve_depth: 0,
                        link_target_entity_resolve_depth: 0,
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
            .get_links(&StructuralQuery {
                filter: Filter::Equal(
                    Some(FilterExpression::Path(LinkQueryPath::Target(Some(
                        EntityQueryPath::Properties(Some(Cow::Borrowed(
                            "https://blockprotocol.org/@alice/types/property-type/name/",
                        ))),
                    )))),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "Alice",
                    )))),
                ),
                graph_resolve_depths,
            })
            .await
            .expect("failed to read entity from store");
        assert_eq!(subgraph.len(), 100);
    });
}
