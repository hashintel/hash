use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::EntityUuid,
    store::{query::Filter, EntityStore},
    subgraph::{GraphResolveDepths, StructuralQuery},
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
            *entity_uuids.iter().choose(&mut thread_rng()).unwrap()
        },
        |entity_uuid| async move {
            store
                .get_entity(&StructuralQuery {
                    filter: Filter::for_latest_entity_by_entity_uuid(entity_uuid),
                    graph_resolve_depths: GraphResolveDepths {
                        data_type_resolve_depth: 0,
                        property_type_resolve_depth: 0,
                        entity_type_resolve_depth: 0,
                        link_resolve_depth: 0,
                        link_target_entity_resolve_depth: 0,
                    },
                })
                .await
                .expect("failed to read entity from store");
        },
        SmallInput,
    );
}
