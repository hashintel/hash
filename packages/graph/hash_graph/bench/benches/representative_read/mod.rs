//! Benchmarks to check the performance of operations across a "representative" graph.
//!
//! There are some designs in this module which aren't immediately obvious. Across runs, Criterion
//! compares benchmarks that share the same ID. We'd like to be able to track performance as
//! development continues, so we need to have consistent IDs to benefit from the comparative
//! analysis. This means that if we're auto-generating entity type ID's, we can't use them as inputs
//! for `bench_with_input` as the [`BenchmarkId`] will vary between runs and we won't get
//! comparative analysis.
//!
//! For a lot of these queries we want to know the general performance across the graph. This means
//! that we'd like to query across a sample of elements, but we don't want to benchmark the time it
//! takes to query 100 (for example) entities, but instead are interested in the average performance
//! to query _one_ entity. As such a lot of functions take a list of elements to sample from, and
//! use `iter_batched` to do a per-iteration setup whereby each benchmark iteration picks a
//! random entity to sample. This should provide us with an idea of average performance for
//! _querying a single element_ across the given sample.
//!
//! [`BenchmarkId`]: criterion::BenchmarkId

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::subgraph::GraphResolveDepths;

use crate::{representative_read::seed::setup_and_extract_samples, util::setup};

mod knowledge;
mod ontology;

mod seed;

const DB_NAME: &str = "representative_read";

#[criterion]
fn bench_representative_read_single_entity(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read_single_entity");
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_ids) in samples.entities {
        for (entity_type_id, entity_ids) in type_ids_and_entity_ids {
            group.bench_with_input(
                BenchmarkId::new(
                    "entity_by_id",
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
fn bench_representative_read_multiple_entities(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read_multiple_entities");
    let (runtime, store_wrapper) = setup(DB_NAME, false, false);
    group.sample_size(10);

    let graph_resolve_depths = [
        GraphResolveDepths {
            data_type_resolve_depth: 0,
            property_type_resolve_depth: 0,
            entity_type_resolve_depth: 0,
            link_type_resolve_depth: 0,
            link_resolve_depth: 0,
            link_target_entity_resolve_depth: 0,
        },
        GraphResolveDepths {
            data_type_resolve_depth: 0,
            property_type_resolve_depth: 0,
            entity_type_resolve_depth: 2,
            link_type_resolve_depth: 2,
            link_resolve_depth: 0,
            link_target_entity_resolve_depth: 0,
        },
        GraphResolveDepths {
            data_type_resolve_depth: 0,
            property_type_resolve_depth: 2,
            entity_type_resolve_depth: 2,
            link_type_resolve_depth: 2,
            link_resolve_depth: 0,
            link_target_entity_resolve_depth: 0,
        },
        GraphResolveDepths {
            data_type_resolve_depth: 2,
            property_type_resolve_depth: 2,
            entity_type_resolve_depth: 2,
            link_type_resolve_depth: 2,
            link_resolve_depth: 0,
            link_target_entity_resolve_depth: 0,
        },
        GraphResolveDepths {
            data_type_resolve_depth: 2,
            property_type_resolve_depth: 2,
            entity_type_resolve_depth: 2,
            link_type_resolve_depth: 2,
            link_resolve_depth: 1,
            link_target_entity_resolve_depth: 1,
        },
        GraphResolveDepths {
            data_type_resolve_depth: 255,
            property_type_resolve_depth: 255,
            entity_type_resolve_depth: 255,
            link_type_resolve_depth: 255,
            link_resolve_depth: 255,
            link_target_entity_resolve_depth: 255,
        },
    ];

    for graph_resolve_depth in graph_resolve_depths {
        // The name unifies entity types/link types and entities/links to be comparable to
        // `dev/links`
        group.bench_with_input(
            BenchmarkId::new(
                "entity_by_property",
                format!(
                    "depths: DT={}, PT={}, ET={}, E={}",
                    graph_resolve_depth.data_type_resolve_depth,
                    graph_resolve_depth.property_type_resolve_depth,
                    graph_resolve_depth
                        .entity_type_resolve_depth
                        .max(graph_resolve_depth.link_type_resolve_depth),
                    graph_resolve_depth.link_resolve_depth
                        + graph_resolve_depth.link_target_entity_resolve_depth,
                ),
            ),
            &graph_resolve_depth,
            |b, graph_resolve_depth| {
                knowledge::entity::bench_get_entities_by_property(
                    b,
                    &runtime,
                    &store_wrapper.store,
                    *graph_resolve_depth,
                );
            },
        );
    }

    for graph_resolve_depth in graph_resolve_depths {
        // The name unifies entity types/link types and entities/links to be comparable to
        // `dev/links`
        group.bench_with_input(
            BenchmarkId::new(
                "link_by_source_by_property",
                format!(
                    "depths: DT={}, PT={}, ET={}, E={}",
                    graph_resolve_depth.data_type_resolve_depth,
                    graph_resolve_depth.property_type_resolve_depth,
                    graph_resolve_depth
                        .entity_type_resolve_depth
                        .max(graph_resolve_depth.link_type_resolve_depth),
                    graph_resolve_depth.link_resolve_depth
                        + graph_resolve_depth.link_target_entity_resolve_depth,
                ),
            ),
            &graph_resolve_depth,
            |b, graph_resolve_depth| {
                knowledge::entity::bench_get_link_by_target_by_property(
                    b,
                    &runtime,
                    &store_wrapper.store,
                    *graph_resolve_depth,
                );
            },
        );
    }
}

#[criterion]
fn bench_representative_read_entity_type(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read_entity_type");
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false);

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
