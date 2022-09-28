use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::{EntityId, KnowledgeGraphQuery},
    store::{query::Expression, EntityStore},
};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;

use crate::util::Store;

pub fn bench_get_entity_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    // TODO: DOC - a selection of entities to sample from. We don't want to pick a specific entity
    //  to sample, as we'd like to know the general case, and if we try bench_with_input then we
    //  won't get comparison analysis across runs
    entity_ids: &[EntityId],
) {
    b.to_async(runtime).iter_batched(
        || *entity_ids.iter().choose(&mut thread_rng()).unwrap(),
        |entity_id| async move {
            let _ = store
                .get_entity(&KnowledgeGraphQuery {
                    expression: Expression::for_latest_entity_id(entity_id),
                    data_type_query_depth: 0,
                    property_type_query_depth: 0,
                    link_type_query_depth: 0,
                    entity_type_query_depth: 0,
                    link_target_entity_query_depth: 0,
                    link_query_depth: 0,
                })
                .await
                .expect("failed to read entity from store");
        },
        SmallInput,
    );
}
