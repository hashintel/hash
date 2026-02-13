//! Benchmarks for the [`LinkedGraph`] data structure.
//!
//! This benchmark suite measures the performance of various graph operations using
//! instruction counting on Linux (via `perf_event`) with a fallback to wall-clock
//! time on other platforms.
//!
//! # Running benchmarks
//!
//! ```bash
//! # Run all linked graph benchmarks
//! cargo bench --package hashql-core --bench linked_graph
//!
//! # Run specific benchmark group
//! cargo bench --package hashql-core --bench linked_graph -- "node"
//! ```
//!
//! # Measurement modes
//!
//! On Linux, benchmarks use hardware instruction counting for deterministic results.
//! On other platforms, wall-clock time is used as a fallback.

use core::hint::black_box;

use criterion::{BatchSize, BenchmarkId, Criterion, Throughput};
#[cfg(not(target_os = "linux"))]
use criterion::measurement::WallTime;
use hashql_core::graph::{
    DirectedGraph, LinkedGraph, NodeId, Predecessors, Successors, Traverse,
};

// =============================================================================
// Instruction Counting Measurement (Linux only)
// =============================================================================

/// A measurement type that counts CPU instructions on Linux using perf_event,
/// falling back to wall-clock time on other platforms.
#[cfg(target_os = "linux")]
mod instruction_count {
    use core::{cell::RefCell, fmt};

    use criterion::measurement::{Measurement, ValueFormatter};
    use perf_event::{Builder, Counter, events::Hardware};

    /// Measures CPU instructions executed using Linux perf_event.
    ///
    /// Uses `RefCell` for interior mutability since criterion's `Measurement`
    /// trait requires `&self` methods.
    pub(crate) struct InstructionCount {
        counter: RefCell<Counter>,
    }

    impl InstructionCount {
        /// Creates a new instruction counter.
        ///
        /// # Panics
        ///
        /// Panics if the perf_event counter cannot be created (e.g., insufficient
        /// permissions or unsupported hardware).
        #[must_use]
        pub(crate) fn new() -> Self {
            let counter = Builder::new()
                .kind(Hardware::INSTRUCTIONS)
                .build()
                .expect(
                    "failed to create perf_event counter - ensure you have permissions \
                     (try: sudo sysctl -w kernel.perf_event_paranoid=0)",
                );
            Self {
                counter: RefCell::new(counter),
            }
        }
    }

    impl Default for InstructionCount {
        fn default() -> Self {
            Self::new()
        }
    }

    impl Measurement for InstructionCount {
        type Intermediate = u64;
        type Value = u64;

        fn start(&self) -> Self::Intermediate {
            let mut counter = self.counter.borrow_mut();
            counter.reset().expect("failed to reset counter");
            counter.enable().expect("failed to enable counter");
            0
        }

        fn end(&self, _intermediate: Self::Intermediate) -> Self::Value {
            let mut counter = self.counter.borrow_mut();
            counter.disable().expect("failed to disable counter");
            counter.read().expect("failed to read counter")
        }

        fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
            v1 + v2
        }

        fn zero(&self) -> Self::Value {
            0
        }

        fn to_f64(&self, value: &Self::Value) -> f64 {
            *value as f64
        }

        fn formatter(&self) -> &dyn ValueFormatter {
            &InstructionFormatter
        }
    }

    /// Formatter for instruction count values.
    struct InstructionFormatter;

    impl ValueFormatter for InstructionFormatter {
        fn scale_values(&self, _typical_value: f64, values: &mut [f64]) -> &'static str {
            // Find the appropriate scale
            let max = values.iter().copied().fold(0.0_f64, f64::max);

            let (divisor, unit) = if max >= 1_000_000_000.0 {
                (1_000_000_000.0, "Gi")
            } else if max >= 1_000_000.0 {
                (1_000_000.0, "Mi")
            } else if max >= 1_000.0 {
                (1_000.0, "Ki")
            } else {
                (1.0, "")
            };

            for value in values {
                *value /= divisor;
            }

            unit
        }

        fn scale_throughputs(
            &self,
            _typical_value: f64,
            throughput: &criterion::Throughput,
            values: &mut [f64],
        ) -> &'static str {
            match throughput {
                criterion::Throughput::Bytes(bytes)
                | criterion::Throughput::BytesDecimal(bytes) => {
                    for value in values {
                        *value = (*bytes as f64) / *value;
                    }
                    "inst/B"
                }
                criterion::Throughput::Elements(elements) => {
                    for value in values {
                        *value /= *elements as f64;
                    }
                    "inst/elem"
                }
                _ => {
                    // Handle any future throughput variants
                    "inst"
                }
            }
        }

        fn scale_for_machines(&self, values: &mut [f64]) -> &'static str {
            // No scaling needed for machine-readable output
            for value in values {
                *value = value.round();
            }
            "instructions"
        }
    }

    impl fmt::Debug for InstructionCount {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.debug_struct("InstructionCount").finish_non_exhaustive()
        }
    }
}

// =============================================================================
// Cross-Platform Measurement Selection
// =============================================================================

/// The measurement type used for benchmarking.
///
/// On Linux, this uses hardware instruction counting for deterministic results.
/// On other platforms, wall-clock time is used.
#[cfg(target_os = "linux")]
type BenchMeasurement = instruction_count::InstructionCount;

#[cfg(not(target_os = "linux"))]
type BenchMeasurement = WallTime;

/// Creates a new measurement instance appropriate for the current platform.
fn create_measurement() -> BenchMeasurement {
    #[cfg(target_os = "linux")]
    {
        instruction_count::InstructionCount::new()
    }

    #[cfg(not(target_os = "linux"))]
    {
        WallTime
    }
}

/// Creates a criterion instance configured with the appropriate measurement type.
fn create_criterion() -> Criterion<BenchMeasurement> {
    Criterion::default().with_measurement(create_measurement())
}

// =============================================================================
// Graph Fixtures
// =============================================================================

/// Creates a linear chain graph: 0 -> 1 -> 2 -> ... -> n-1
fn create_chain_graph(size: usize) -> LinkedGraph<usize, ()> {
    let mut graph = LinkedGraph::new();

    for i in 0..size {
        graph.add_node(i);
    }

    for i in 0..(size.saturating_sub(1)) {
        graph.add_edge(NodeId::new(i), NodeId::new(i + 1), ());
    }

    graph
}

/// Creates a complete graph where every node is connected to every other node.
fn create_complete_graph(size: usize) -> LinkedGraph<usize, ()> {
    let mut graph = LinkedGraph::new();

    for i in 0..size {
        graph.add_node(i);
    }

    for i in 0..size {
        for j in 0..size {
            if i != j {
                graph.add_edge(NodeId::new(i), NodeId::new(j), ());
            }
        }
    }

    graph
}

/// Creates a binary tree graph.
fn create_binary_tree(depth: usize) -> LinkedGraph<usize, ()> {
    let mut graph = LinkedGraph::new();
    let node_count = (1 << depth) - 1; // 2^depth - 1 nodes

    for i in 0..node_count {
        graph.add_node(i);
    }

    // Connect parent i to children 2i+1 and 2i+2
    for i in 0..(node_count / 2) {
        let left_child = 2 * i + 1;
        let right_child = 2 * i + 2;

        if left_child < node_count {
            graph.add_edge(NodeId::new(i), NodeId::new(left_child), ());
        }
        if right_child < node_count {
            graph.add_edge(NodeId::new(i), NodeId::new(right_child), ());
        }
    }

    graph
}

/// Creates a sparse random-like graph with a fixed number of edges per node.
fn create_sparse_graph(nodes: usize, edges_per_node: usize) -> LinkedGraph<usize, ()> {
    let mut graph = LinkedGraph::new();

    for i in 0..nodes {
        graph.add_node(i);
    }

    // Create deterministic "random" edges
    for i in 0..nodes {
        for j in 0..edges_per_node {
            let target = (i * 7 + j * 13 + 1) % nodes;
            if target != i {
                graph.add_edge(NodeId::new(i), NodeId::new(target), ());
            }
        }
    }

    graph
}

// =============================================================================
// Node Operation Benchmarks
// =============================================================================

fn bench_node_operations(c: &mut Criterion<BenchMeasurement>) {
    let mut group = c.benchmark_group("node");

    // Benchmark adding nodes
    for size in [10, 100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("add", size), &size, |b, &size| {
            b.iter_batched(
                LinkedGraph::<usize, ()>::new,
                |mut graph| {
                    for i in 0..size {
                        black_box(graph.add_node(i));
                    }
                    graph
                },
                BatchSize::SmallInput,
            );
        });
    }

    // Benchmark node lookup
    for size in [100, 1_000, 10_000] {
        group.bench_with_input(BenchmarkId::new("lookup", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            let mid = NodeId::new(size / 2);
            b.iter(|| black_box(graph.node(mid)));
        });
    }

    // Benchmark node iteration
    for size in [100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("iter", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            b.iter(|| {
                let mut count = 0;
                for node in graph.iter_nodes() {
                    black_box(node);
                    count += 1;
                }
                count
            });
        });
    }

    group.finish();
}

// =============================================================================
// Edge Operation Benchmarks
// =============================================================================

fn bench_edge_operations(c: &mut Criterion<BenchMeasurement>) {
    let mut group = c.benchmark_group("edge");

    // Benchmark adding edges to an existing graph
    for size in [10, 100, 500] {
        let edge_count = size * (size - 1);
        group.throughput(Throughput::Elements(edge_count as u64));

        group.bench_with_input(BenchmarkId::new("add_complete", size), &size, |b, &size| {
            b.iter_batched(
                || {
                    let mut graph = LinkedGraph::<usize, ()>::new();
                    for i in 0..size {
                        graph.add_node(i);
                    }
                    graph
                },
                |mut graph| {
                    for i in 0..size {
                        for j in 0..size {
                            if i != j {
                                black_box(graph.add_edge(NodeId::new(i), NodeId::new(j), ()));
                            }
                        }
                    }
                    graph
                },
                BatchSize::SmallInput,
            );
        });
    }

    // Benchmark edge lookup
    for size in [100, 1_000] {
        group.bench_with_input(BenchmarkId::new("lookup", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            let mid_edge = hashql_core::graph::EdgeId::new(size / 2);
            b.iter(|| black_box(graph.edge(mid_edge)));
        });
    }

    // Benchmark edge iteration
    for size in [100, 1_000, 10_000] {
        group.throughput(Throughput::Elements((size - 1) as u64));

        group.bench_with_input(BenchmarkId::new("iter", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            b.iter(|| {
                let mut count = 0;
                for edge in graph.iter_edges() {
                    black_box(edge);
                    count += 1;
                }
                count
            });
        });
    }

    group.finish();
}

// =============================================================================
// Adjacency Iteration Benchmarks
// =============================================================================

fn bench_adjacency_iteration(c: &mut Criterion<BenchMeasurement>) {
    let mut group = c.benchmark_group("adjacency");

    // Benchmark successors iteration on different graph topologies
    group.bench_function("successors/chain", |b| {
        let graph = create_chain_graph(1_000);
        let mid = NodeId::new(500);
        b.iter(|| {
            let count: usize = graph.successors(mid).count();
            black_box(count)
        });
    });

    group.bench_function("successors/complete_10", |b| {
        let graph = create_complete_graph(10);
        let mid = NodeId::new(5);
        b.iter(|| {
            let count: usize = graph.successors(mid).count();
            black_box(count)
        });
    });

    group.bench_function("successors/complete_50", |b| {
        let graph = create_complete_graph(50);
        let mid = NodeId::new(25);
        b.iter(|| {
            let count: usize = graph.successors(mid).count();
            black_box(count)
        });
    });

    // Benchmark predecessors iteration
    group.bench_function("predecessors/chain", |b| {
        let graph = create_chain_graph(1_000);
        let mid = NodeId::new(500);
        b.iter(|| {
            let count: usize = graph.predecessors(mid).count();
            black_box(count)
        });
    });

    group.bench_function("predecessors/complete_50", |b| {
        let graph = create_complete_graph(50);
        let mid = NodeId::new(25);
        b.iter(|| {
            let count: usize = graph.predecessors(mid).count();
            black_box(count)
        });
    });

    // Benchmark incident edges (both directions)
    group.bench_function("incident_edges/sparse_out", |b| {
        let graph = create_sparse_graph(1_000, 5);
        let mid = NodeId::new(500);
        b.iter(|| {
            let count: usize = graph.outgoing_edges(mid).count();
            black_box(count)
        });
    });

    group.bench_function("incident_edges/sparse_in", |b| {
        let graph = create_sparse_graph(1_000, 5);
        let mid = NodeId::new(500);
        b.iter(|| {
            let count: usize = graph.incoming_edges(mid).count();
            black_box(count)
        });
    });

    group.finish();
}

// =============================================================================
// Traversal Benchmarks
// =============================================================================

fn bench_traversals(c: &mut Criterion<BenchMeasurement>) {
    let mut group = c.benchmark_group("traversal");

    // DFS on chain
    for size in [100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("dfs/chain", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            let start = NodeId::new(0);
            b.iter(|| {
                let count: usize = graph.depth_first_traversal([start]).count();
                black_box(count)
            });
        });
    }

    // DFS on binary tree
    for depth in [5, 8, 10] {
        let nodes = (1 << depth) - 1;
        group.throughput(Throughput::Elements(nodes as u64));

        group.bench_with_input(
            BenchmarkId::new("dfs/binary_tree", depth),
            &depth,
            |b, &depth| {
                let graph = create_binary_tree(depth);
                let root = NodeId::new(0);
                b.iter(|| {
                    let count: usize = graph.depth_first_traversal([root]).count();
                    black_box(count)
                });
            },
        );
    }

    // DFS post-order
    group.bench_function("dfs_postorder/binary_tree_8", |b| {
        let graph = create_binary_tree(8);
        let root = NodeId::new(0);
        b.iter(|| {
            let count: usize = graph.depth_first_traversal_post_order([root]).count();
            black_box(count)
        });
    });

    // BFS on chain
    for size in [100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("bfs/chain", size), &size, |b, &size| {
            let graph = create_chain_graph(size);
            let start = NodeId::new(0);
            b.iter(|| {
                let count: usize = graph.breadth_first_traversal([start]).count();
                black_box(count)
            });
        });
    }

    // BFS on binary tree
    group.bench_function("bfs/binary_tree_8", |b| {
        let graph = create_binary_tree(8);
        let root = NodeId::new(0);
        b.iter(|| {
            let count: usize = graph.breadth_first_traversal([root]).count();
            black_box(count)
        });
    });

    // Forest traversal (all nodes)
    group.bench_function("dfs_forest/sparse_1000", |b| {
        let graph = create_sparse_graph(1_000, 3);
        b.iter(|| {
            let count: usize = graph.depth_first_forest_post_order().count();
            black_box(count)
        });
    });

    group.finish();
}

// =============================================================================
// Mutation Benchmarks
// =============================================================================

fn bench_mutations(c: &mut Criterion<BenchMeasurement>) {
    let mut group = c.benchmark_group("mutation");

    // Benchmark clear_edges
    for size in [100, 1_000] {
        group.bench_with_input(BenchmarkId::new("clear_edges", size), &size, |b, &size| {
            b.iter_batched(
                || create_sparse_graph(size, 5),
                |mut graph| {
                    graph.clear_edges();
                    graph
                },
                BatchSize::SmallInput,
            );
        });
    }

    // Benchmark clear (full reset)
    for size in [100, 1_000] {
        group.bench_with_input(BenchmarkId::new("clear", size), &size, |b, &size| {
            b.iter_batched(
                || create_sparse_graph(size, 5),
                |mut graph| {
                    graph.clear();
                    graph
                },
                BatchSize::SmallInput,
            );
        });
    }

    // Benchmark derive (populate from domain)
    for size in [100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("derive", size), &size, |b, &size| {
            use hashql_core::id::IdVec;

            let mut source: IdVec<NodeId, usize> = IdVec::new();
            for i in 0..size {
                source.push(i);
            }

            b.iter_batched(
                || source.clone(),
                |source| {
                    let mut graph = LinkedGraph::<usize, ()>::new();
                    graph.derive(source.as_slice(), |_id, &value| value);
                    graph
                },
                BatchSize::SmallInput,
            );
        });
    }

    group.finish();
}

// =============================================================================
// Entry Point
// =============================================================================

fn main() {
    let mut criterion = create_criterion();

    bench_node_operations(&mut criterion);
    bench_edge_operations(&mut criterion);
    bench_adjacency_iteration(&mut criterion);
    bench_traversals(&mut criterion);
    bench_mutations(&mut criterion);

    criterion.final_summary();
}
