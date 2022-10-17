use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::EntityId,
    store::{query::Expression, EntityStore},
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
            store
                .get_entity(&StructuralQuery {
                    expression: Expression::for_latest_entity_id(entity_id),
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
        },
        SmallInput,
    );
}
