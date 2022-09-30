//! Benchmarks to
//!
//! Across runs, Criterion compares benchmarks that share the same ID. We'd like to be able to
//! track performance overtime, so we need to have consistent IDs. This means that if we're
//! auto-generating entity type ID's, we can't use them as inputs to `bench_with_input`, as the
//! [`BenchmarkId`] will vary between runs and we won't get comparative analysis.
//!
//! We also don't really want to measure how long it takes to query a sample of IDs (e.g. to make
//! 100 entity type queries). As such, this function takes a list of [`EntityId`]s to sample from,
//! and uses `iter_batched` to do a per-iteration setup whereby each benchmark iteration picks a
//! random entity to sample. This should provide us with an idea of average performance for
//! _querying a single entity type_ across the given sample.
//!
//! [`BenchmarkId`]: criterion::BenchmarkId

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;

use crate::{representative_read::seed::setup_and_extract_samples, util::setup};

mod knowledge;
mod ontology;

mod seed;

const DB_NAME: &str = "representative_read";

#[criterion]
fn bench_representative_read_entity(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read_entity");
    let (runtime, mut store_wrapper) = setup(DB_NAME, false);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_ids) in samples.entities {
        for (entity_type_id, entity_ids) in type_ids_and_entity_ids {
            group.bench_with_input(
                BenchmarkId::new(
                    "get_entity_by_id",
                    format!(
                        "Account ID: `{}`, Entity Type ID: `{}`",
                        account_id, entity_type_id
                    ),
                ),
                &(account_id, entity_type_id, entity_ids),
                |b, (_account_id, _entity_type_id, entity_ids)| {
                    knowledge::entity::bench_get_entity_by_id(b, &runtime, store, entity_ids);
                },
            );
        }
    }
}

#[criterion]
fn bench_representative_read_entity_type(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read_entity_type");
    let (runtime, mut store_wrapper) = setup(DB_NAME, false);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, entity_type_ids) in samples.entity_types {
        group.bench_with_input(
            BenchmarkId::new(
                "get_entity_type_by_id",
                format!("Account ID: `{}`", account_id),
            ),
            &(account_id, entity_type_ids),
            |b, (_account_id, entity_type_ids)| {
                ontology::entity_type::bench_get_entity_type_by_id(
                    b,
                    &runtime,
                    store,
                    entity_type_ids,
                );
            },
        );
    }
}
