use criterion::{BatchSize::SmallInput, Bencher};
use graph::{
    knowledge::{EntityId, KnowledgeGraphQuery},
    store::{query::Expression, EntityStore},
};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;

use crate::util::Store;

/// Benchmark to measure the time taken to query the latest version of an entity by its ID.
///
/// Across runs, Criterion compares benchmarks that share the same ID. We'd like to be able to
/// track performance overtime, so we need to have consistent IDs. This means that if we're
/// auto-generating entity ID's, we can't use them as inputs to `bench_with_input`, as the
/// [`BenchmarkId`] will vary between runs and we won't get comparative analysis.
///
/// We also don't really want to measure how long it takes to query a sample of IDs (e.g. to make
/// 100 entity queries). As such, this function takes a list of [`EntityId`]s to sample from, and
/// uses `iter_batched` to do a per-iteration setup whereby each benchmark iteration picks a
/// random entity to sample. This should provide us with an idea of average performance for
/// _querying a single entity_ across the given sample.
///
/// [`BenchmarkId`]: criterion::BenchmarkId
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
