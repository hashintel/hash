#![feature(custom_test_frameworks)]
#![test_runner(criterion::runner)]
#![expect(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "This is a benchmark"
)]
#![expect(
    unreachable_pub,
    reason = "This is a benchmark but as we want to document this crate as well this should be a \
              warning instead"
)]

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

extern crate alloc;

#[path = "../util.rs"]
mod util;

mod knowledge;
mod ontology;

mod seed;

use core::str::FromStr;

use authorization::NoAuthorization;
use criterion::{BenchmarkId, Criterion, SamplingMode};
use criterion_macro::criterion;
use graph::subgraph::edges::{EdgeResolveDepths, GraphResolveDepths, OutgoingEdgeResolveDepth};
use graph_types::account::AccountId;
use uuid::Uuid;

use self::seed::setup_and_extract_samples;
use crate::util::{setup, setup_subscriber};

const DB_NAME: &str = "representative_read";

#[criterion]
fn bench_representative_read_entity(c: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_entity";
    let mut group = c.benchmark_group(group_id);
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false, account_id, NoAuthorization);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_uuids) in samples.entities {
        for (entity_type_id, entity_uuids) in type_ids_and_entity_uuids {
            let function_id = "entity_by_id";
            let parameter = format!("entity type ID: `{entity_type_id}`");
            group.bench_with_input(
                BenchmarkId::new(function_id, &parameter),
                &(account_id, entity_type_id, entity_uuids),
                |b, (_account_id, _entity_type_id, entity_uuids)| {
                    let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                    knowledge::entity::bench_get_entity_by_id(
                        b,
                        &runtime,
                        store,
                        account_id,
                        entity_uuids,
                    );
                },
            );
        }
    }
}

#[criterion]
#[expect(clippy::too_many_lines)]
fn bench_representative_read_multiple_entities(c: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_multiple_entities";
    let mut group = c.benchmark_group(group_id);
    let (runtime, store_wrapper) = setup(DB_NAME, false, false, account_id, NoAuthorization);
    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    let graph_resolve_depths = [
        GraphResolveDepths::default(),
        GraphResolveDepths {
            inherits_from: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_values_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_properties_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_links_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            is_of_type: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            has_right_entity: EdgeResolveDepths {
                incoming: 0,
                outgoing: 1,
            },
            has_left_entity: EdgeResolveDepths {
                incoming: 1,
                outgoing: 0,
            },
        },
        GraphResolveDepths {
            inherits_from: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_values_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_properties_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_links_on: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            is_of_type: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            has_right_entity: EdgeResolveDepths {
                incoming: 0,
                outgoing: 1,
            },
            has_left_entity: EdgeResolveDepths {
                incoming: 1,
                outgoing: 0,
            },
        },
        GraphResolveDepths {
            inherits_from: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_values_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_properties_on: OutgoingEdgeResolveDepth {
                outgoing: 2,
                incoming: 0,
            },
            constrains_links_on: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            is_of_type: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            has_right_entity: EdgeResolveDepths {
                incoming: 0,
                outgoing: 1,
            },
            has_left_entity: EdgeResolveDepths {
                incoming: 1,
                outgoing: 0,
            },
        },
        GraphResolveDepths {
            inherits_from: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            constrains_values_on: OutgoingEdgeResolveDepth {
                outgoing: 2,
                incoming: 0,
            },
            constrains_properties_on: OutgoingEdgeResolveDepth {
                outgoing: 2,
                incoming: 0,
            },
            constrains_links_on: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                outgoing: 0,
                incoming: 0,
            },
            is_of_type: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            has_right_entity: EdgeResolveDepths {
                incoming: 0,
                outgoing: 1,
            },
            has_left_entity: EdgeResolveDepths {
                incoming: 1,
                outgoing: 0,
            },
        },
        GraphResolveDepths {
            inherits_from: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            constrains_values_on: OutgoingEdgeResolveDepth {
                outgoing: 255,
                incoming: 0,
            },
            constrains_properties_on: OutgoingEdgeResolveDepth {
                outgoing: 255,
                incoming: 0,
            },
            constrains_links_on: OutgoingEdgeResolveDepth {
                outgoing: 127,
                incoming: 0,
            },
            constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                outgoing: 126,
                incoming: 0,
            },
            is_of_type: OutgoingEdgeResolveDepth {
                outgoing: 1,
                incoming: 0,
            },
            has_right_entity: EdgeResolveDepths {
                incoming: 0,
                outgoing: 128,
            },
            has_left_entity: EdgeResolveDepths {
                incoming: 127,
                outgoing: 0,
            },
        },
    ];

    for graph_resolve_depth in graph_resolve_depths {
        let function_id = "entity_by_property";
        let parameter = format!(
            "depths: DT={}, PT={}, ET={}, E={}",
            [
                graph_resolve_depth.constrains_values_on.incoming,
                graph_resolve_depth.constrains_values_on.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.constrains_properties_on.incoming,
                graph_resolve_depth.constrains_properties_on.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.inherits_from.incoming,
                graph_resolve_depth.inherits_from.outgoing,
                graph_resolve_depth.constrains_links_on.incoming,
                graph_resolve_depth.constrains_links_on.outgoing,
                graph_resolve_depth.constrains_link_destinations_on.incoming,
                graph_resolve_depth.constrains_link_destinations_on.outgoing,
                graph_resolve_depth.is_of_type.incoming,
                graph_resolve_depth.is_of_type.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.has_right_entity.incoming,
                graph_resolve_depth.has_right_entity.outgoing,
                graph_resolve_depth.has_left_entity.incoming,
                graph_resolve_depth.has_left_entity.outgoing,
            ]
            .iter()
            .sum::<u8>(),
        );

        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &graph_resolve_depth,
            |b, graph_resolve_depth| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                knowledge::entity::bench_get_entities_by_property(
                    b,
                    &runtime,
                    &store_wrapper.store,
                    store_wrapper.account_id,
                    *graph_resolve_depth,
                );
            },
        );
    }

    for graph_resolve_depth in graph_resolve_depths {
        let function_id = "link_by_source_by_property";
        let parameter = format!(
            "depths: DT={}, PT={}, ET={}, E={}",
            [
                graph_resolve_depth.constrains_values_on.incoming,
                graph_resolve_depth.constrains_values_on.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.constrains_properties_on.incoming,
                graph_resolve_depth.constrains_properties_on.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.inherits_from.incoming,
                graph_resolve_depth.inherits_from.outgoing,
                graph_resolve_depth.constrains_links_on.incoming,
                graph_resolve_depth.constrains_links_on.outgoing,
                graph_resolve_depth.constrains_link_destinations_on.incoming,
                graph_resolve_depth.constrains_link_destinations_on.outgoing,
                graph_resolve_depth.is_of_type.incoming,
                graph_resolve_depth.is_of_type.outgoing,
            ]
            .iter()
            .sum::<u8>(),
            [
                graph_resolve_depth.has_right_entity.incoming,
                graph_resolve_depth.has_right_entity.outgoing,
                graph_resolve_depth.has_left_entity.incoming,
                graph_resolve_depth.has_left_entity.outgoing,
            ]
            .iter()
            .sum::<u8>(),
        );

        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &graph_resolve_depth,
            |b, graph_resolve_depth| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                knowledge::entity::bench_get_link_by_target_by_property(
                    b,
                    &runtime,
                    &store_wrapper.store,
                    store_wrapper.account_id,
                    *graph_resolve_depth,
                );
            },
        );
    }
}

#[criterion]
fn bench_representative_read_entity_type(c: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_entity_type";
    let mut group = c.benchmark_group(group_id);
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false, account_id, NoAuthorization);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, entity_type_ids) in samples.entity_types {
        let function_id = "get_entity_type_by_id";
        let parameter = format!("Account ID: `{account_id}`");
        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &(account_id, entity_type_ids),
            |b, (_account_id, entity_type_ids)| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                ontology::entity_type::bench_get_entity_type_by_id(
                    b,
                    &runtime,
                    store,
                    account_id,
                    entity_type_ids,
                );
            },
        );
    }
}
