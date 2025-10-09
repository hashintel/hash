#![feature(
    // Language Features
    custom_test_frameworks,
)]
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

use core::{iter, str::FromStr as _};

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use hash_graph_store::subgraph::edges::{
    EntityTraversalEdge, EntityTraversalEdgeDirection, EntityTraversalPath, GraphResolveDepths,
    SubgraphTraversalParams,
};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use self::seed::setup_and_extract_samples;
use crate::util::{setup, setup_subscriber};

const DB_NAME: &str = "representative_read";

#[criterion]
fn bench_representative_read_entity(crit: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = ActorEntityUuid::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_entity";
    let mut group = crit.benchmark_group(group_id);
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false, account_id);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper, account_id));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_uuids) in samples.entities {
        for (entity_type_id, entity_uuids) in type_ids_and_entity_uuids {
            let function_id = "entity_by_id";
            let parameter = format!("entity type ID: `{entity_type_id}`");
            group.bench_with_input(
                BenchmarkId::new(function_id, &parameter),
                &(account_id, entity_type_id, entity_uuids),
                |bencher, (_account_id, _entity_type_id, entity_uuids)| {
                    let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                    knowledge::entity::bench_get_entity_by_id(
                        bencher,
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
fn bench_representative_read_multiple_entities(crit: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = ActorEntityUuid::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_multiple_entities";
    let mut group = crit.benchmark_group(group_id);
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false, account_id);
    let _samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper, account_id));

    let traversal_params = [
        SubgraphTraversalParams::Paths {
            traversal_paths: Vec::new(),
        },
        SubgraphTraversalParams::ResolveDepths {
            graph_resolve_depths: GraphResolveDepths::default(),
            traversal_paths: vec![EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EntityTraversalEdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EntityTraversalEdgeDirection::Outgoing,
                    },
                ],
            }],
        },
        SubgraphTraversalParams::ResolveDepths {
            graph_resolve_depths: GraphResolveDepths {
                constrains_links_on: 1,
                is_of_type: true,
                ..GraphResolveDepths::default()
            },
            traversal_paths: vec![EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EntityTraversalEdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EntityTraversalEdgeDirection::Outgoing,
                    },
                ],
            }],
        },
        SubgraphTraversalParams::ResolveDepths {
            graph_resolve_depths: GraphResolveDepths {
                constrains_properties_on: 2,
                constrains_links_on: 1,
                is_of_type: true,
                ..GraphResolveDepths::default()
            },
            traversal_paths: vec![EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EntityTraversalEdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EntityTraversalEdgeDirection::Outgoing,
                    },
                ],
            }],
        },
        SubgraphTraversalParams::ResolveDepths {
            graph_resolve_depths: GraphResolveDepths {
                constrains_values_on: 2,
                constrains_properties_on: 2,
                constrains_links_on: 1,
                is_of_type: true,
                ..GraphResolveDepths::default()
            },
            traversal_paths: vec![EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EntityTraversalEdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EntityTraversalEdgeDirection::Outgoing,
                    },
                ],
            }],
        },
        SubgraphTraversalParams::ResolveDepths {
            graph_resolve_depths: GraphResolveDepths {
                inherits_from: 1,
                constrains_values_on: 255,
                constrains_properties_on: 255,
                constrains_links_on: 127,
                constrains_link_destinations_on: 126,
                is_of_type: true,
            },
            traversal_paths: vec![EntityTraversalPath {
                edges: iter::repeat([
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EntityTraversalEdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EntityTraversalEdgeDirection::Outgoing,
                    },
                ])
                .flatten()
                .take(255)
                .collect(),
            }],
        },
    ];

    let parameter_strings = traversal_params
        .iter()
        .map(|params| match params {
            SubgraphTraversalParams::Paths { traversal_paths } => format!(
                "traversal_paths={}|{}",
                traversal_paths
                    .iter()
                    .map(|path| path.edges.len())
                    .sum::<usize>(),
                traversal_paths.len(),
            ),
            SubgraphTraversalParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths: depths,
            } => format!(
                "traversal_paths={}|{},resolve_depths=inherit:{};values:{};properties:{};links:{};\
                 link_dests:{};type:{}",
                traversal_paths
                    .iter()
                    .map(|path| path.edges.len())
                    .sum::<usize>(),
                traversal_paths.len(),
                depths.inherits_from,
                depths.constrains_values_on,
                depths.constrains_properties_on,
                depths.constrains_links_on,
                depths.constrains_link_destinations_on,
                depths.is_of_type,
            ),
        })
        .collect::<Vec<_>>();

    for (traversal_params, parameter_string) in traversal_params.iter().zip(&parameter_strings) {
        let function_id = "entity_by_property";
        group.bench_with_input(
            BenchmarkId::new(function_id, parameter_string),
            traversal_params,
            |bencher, traversal_params| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(parameter_string));
                knowledge::entity::bench_query_entities_by_property(
                    bencher,
                    &runtime,
                    &store_wrapper.store,
                    store_wrapper.account_id,
                    traversal_params,
                );
            },
        );
    }

    for (traversal_params, parameter_string) in traversal_params.into_iter().zip(&parameter_strings)
    {
        let function_id = "link_by_source_by_property";
        group.bench_with_input(
            BenchmarkId::new(function_id, parameter_string),
            &traversal_params,
            |bencher, traversal_params| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(parameter_string));
                knowledge::entity::bench_get_link_by_target_by_property(
                    bencher,
                    &runtime,
                    &store_wrapper.store,
                    store_wrapper.account_id,
                    traversal_params,
                );
            },
        );
    }
}

#[criterion]
fn bench_representative_read_entity_type(crit: &mut Criterion) {
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = ActorEntityUuid::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    let group_id = "representative_read_entity_type";
    let mut group = crit.benchmark_group(group_id);
    let (runtime, mut store_wrapper) = setup(DB_NAME, false, false, account_id);

    let samples = runtime.block_on(setup_and_extract_samples(&mut store_wrapper, account_id));
    let store = &store_wrapper.store;

    for (account_id, entity_type_ids) in samples.entity_types {
        let function_id = "get_entity_type_by_id";
        let parameter = format!("Account ID: `{account_id}`");
        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &(account_id, entity_type_ids),
            |bencher, (_account_id, entity_type_ids)| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                ontology::entity_type::bench_get_entity_type_by_id(
                    bencher,
                    &runtime,
                    store,
                    account_id,
                    entity_type_ids,
                );
            },
        );
    }
}
