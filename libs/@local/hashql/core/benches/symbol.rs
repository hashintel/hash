//! Benchmarks for Symbol operations.
//!
//! These benchmarks measure the performance of symbol creation, comparison,
//! hashing, and string access operations.
#![expect(
    clippy::indexing_slicing,
    clippy::min_ident_chars,
    clippy::significant_drop_tightening
)]
use core::{
    hash::{Hash as _, Hasher as _},
    hint::black_box,
};
use std::collections::hash_map::DefaultHasher;

use codspeed_criterion_compat::{
    BenchmarkId, Criterion, Throughput, criterion_group, criterion_main,
};
use hashql_core::{
    heap::{Heap, ResetAllocator as _},
    symbol::{Symbol, sym},
};

// =============================================================================
// Test Data
// =============================================================================

/// Sample identifiers that simulate real source code tokens.
const IDENTIFIERS: &[&str] = &[
    // Common programming identifiers
    "x",
    "y",
    "i",
    "n",
    "foo",
    "bar",
    "baz",
    "count",
    "index",
    "value",
    "result",
    "data",
    "items",
    "length",
    "size",
    "name",
    "type",
    "id",
    "key",
    "user",
    "config",
    "options",
    "handler",
    "callback",
    "response",
    "request",
    "context",
    "state",
    "props",
    "children",
    // Longer identifiers
    "getUserById",
    "setConfiguration",
    "handleResponse",
    "processRequest",
    "validateInput",
    "transformData",
    "calculateTotal",
    "renderComponent",
    "initializeState",
    "updateMetadata",
];

/// Generate unique identifiers with a numeric suffix.
fn generate_unique_identifiers(count: usize) -> Vec<String> {
    (0..count).map(|i| format!("ident_{i}")).collect()
}

// =============================================================================
// Interning Benchmarks
// =============================================================================

fn interning(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("symbol/intern");

    // Benchmark: Intern unique strings (no dedup hits)
    for count in [100, 1000, 10000] {
        group.throughput(Throughput::Elements(count as u64));
        group.bench_with_input(
            BenchmarkId::new("unique", count),
            &count,
            |bencher, &count| {
                let identifiers = generate_unique_identifiers(count);
                let mut heap = Heap::new();

                bencher.iter(|| {
                    heap.reset();
                    for ident in &identifiers {
                        black_box(heap.intern_symbol(ident));
                    }
                });
            },
        );
    }

    // Benchmark: Intern repeated strings (dedup path)
    for count in [100, 1000, 10000] {
        group.throughput(Throughput::Elements(count));
        group.bench_with_input(
            BenchmarkId::new("repeated", count),
            &count,
            |bencher, &count| {
                let mut heap = Heap::new();

                bencher.iter(|| {
                    heap.reset();
                    for _ in 0..count {
                        for ident in IDENTIFIERS {
                            black_box(heap.intern_symbol(ident));
                        }
                    }
                });
            },
        );
    }

    // Benchmark: Mixed workload (realistic lexer simulation)
    group.bench_function("mixed_workload", |bencher| {
        let unique = generate_unique_identifiers(100);
        let mut heap = Heap::new();

        bencher.iter(|| {
            heap.reset();
            // Simulate lexing: mix of repeated keywords and unique identifiers
            for _ in 0..10 {
                // Keywords (repeated)
                for ident in IDENTIFIERS.iter().take(20) {
                    black_box(heap.intern_symbol(ident));
                }
                // Unique identifiers
                for ident in &unique {
                    black_box(heap.intern_symbol(ident));
                }
            }
        });
    });

    group.finish();
}

// =============================================================================
// Constant Symbol Access Benchmarks
// =============================================================================

fn constant_access(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("symbol/constant");

    // Benchmark: Access pre-defined constant symbols
    group.bench_function("access", |bencher| {
        bencher.iter(|| black_box(sym::r#let));
    });

    // Benchmark: Extract constant for pattern matching
    // group.bench_function("as_constant", |bencher| {
    //     let symbol = sym::r#let;
    //     bencher.iter(|| black_box(symbol).as_constant());
    // });

    group.finish();
}

// =============================================================================
// Equality Comparison Benchmarks
// =============================================================================

fn equality(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("symbol/equality");

    // Benchmark: Compare constant symbols (fast path - same pointer)
    group.bench_function("constant_equal", |bencher| {
        let a = sym::Integer;
        let b = sym::Integer;

        bencher.iter(|| black_box(a) == black_box(b));
    });

    // Benchmark: Compare constant symbols (different)
    group.bench_function("constant_not_equal", |bencher| {
        let a = sym::Integer;
        let b = sym::String;

        bencher.iter(|| black_box(a) == black_box(b));
    });

    // Benchmark: Compare runtime symbols (same interned string)
    group.bench_function("runtime_equal", |bencher| {
        let heap = Heap::new();
        let a = heap.intern_symbol("some_identifier");
        let b = heap.intern_symbol("some_identifier");

        bencher.iter(|| black_box(a) == black_box(b));
    });

    // Benchmark: Compare runtime symbols (different strings)
    group.bench_function("runtime_not_equal", |bencher| {
        let heap = Heap::new();
        let a = heap.intern_symbol("identifier_one");
        let b = heap.intern_symbol("identifier_two");

        bencher.iter(|| black_box(a) == black_box(b));
    });

    // Benchmark: Pattern matching on constants
    group.bench_function("pattern_match_constant", |bencher| {
        let symbol = sym::r#fn; // middle of the match arms

        bencher.iter(|| match black_box(symbol).as_constant() {
            Some(sym::r#let::CONST) => 1,
            Some(sym::r#if::CONST) => 2,
            Some(sym::r#else::CONST) => 3,
            Some(sym::r#fn::CONST) => 4,
            Some(sym::Integer::CONST) => 5,
            Some(sym::String::CONST) => 6,
            Some(sym::Boolean::CONST) => 7,
            _ => 0,
        });
    });

    group.finish();
}

// =============================================================================
// Hashing Benchmarks
// =============================================================================

fn hashing(criterion: &mut Criterion) {
    use codspeed_criterion_compat::BatchSize;

    let mut group = criterion.benchmark_group("symbol/hash");

    // Benchmark: Hash constant symbols
    group.bench_function("constant", |bencher| {
        let symbol = sym::r#let;

        bencher.iter_batched(
            DefaultHasher::new,
            |mut hasher| {
                symbol.hash(&mut hasher);
                hasher.finish()
            },
            BatchSize::SmallInput,
        );
    });

    // Benchmark: Hash runtime symbols
    group.bench_function("runtime", |bencher| {
        let heap = Heap::new();
        let symbol = heap.intern_symbol("some_identifier");

        bencher.iter_batched(
            DefaultHasher::new,
            |mut hasher| {
                symbol.hash(&mut hasher);
                hasher.finish()
            },
            BatchSize::SmallInput,
        );
    });

    group.finish();
}

// =============================================================================
// String Access Benchmarks
// =============================================================================

fn string_access(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("symbol/as_str");

    // Benchmark: Access string content of constant symbols
    group.bench_function("constant", |bencher| {
        let symbol = sym::r#let;
        bencher.iter(|| black_box(symbol.as_str()));
    });

    // Benchmark: Access string content of runtime symbols
    group.bench_function("runtime", |bencher| {
        let heap = Heap::new();
        let symbol = heap.intern_symbol("some_identifier");
        bencher.iter(|| black_box(symbol.as_str()));
    });

    group.finish();
}

// =============================================================================
// Realistic Workload Benchmarks
// =============================================================================
#[expect(clippy::integer_division_remainder_used)]
fn realistic(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("symbol/realistic");

    // Simulate a lexer: tokenize identifiers and compare against keywords
    group.bench_function("lexer_simulation", |bencher| {
        // Pre-generate "source code" tokens
        let source_tokens: Vec<&str> = (0..1000)
            .map(|index| IDENTIFIERS[index % IDENTIFIERS.len()])
            .collect();
        let mut heap = Heap::new();

        bencher.iter(|| {
            heap.reset();
            let mut keyword_count = 0;
            let mut ident_count = 0;

            for token in &source_tokens {
                let symbol = heap.intern_symbol(token);

                // Check if it's a keyword
                if matches!(
                    symbol.as_constant(),
                    Some(
                        sym::r#let::CONST
                            | sym::r#if::CONST
                            | sym::r#else::CONST
                            | sym::r#fn::CONST
                            | sym::r#type::CONST
                    )
                ) {
                    keyword_count += 1;
                } else {
                    ident_count += 1;
                }
            }

            black_box((keyword_count, ident_count));
        });
    });

    // Simulate type checker: lots of symbol comparisons
    group.bench_function("type_checker_simulation", |bencher| {
        let heap = Heap::new();
        let symbols: Vec<_> = IDENTIFIERS.iter().map(|s| heap.intern_symbol(s)).collect();

        bencher.iter(|| {
            let mut matches = 0;

            // Compare each symbol against a set of "expected" symbols
            for &symbol in &symbols {
                if matches!(
                    symbol.as_constant(),
                    Some(
                        sym::Integer::CONST
                            | sym::String::CONST
                            | sym::Boolean::CONST
                            | sym::List::CONST
                            | sym::Dict::CONST
                    )
                ) {
                    matches += 1;
                }
            }

            black_box(matches);
        });
    });

    group.finish();
}

// =============================================================================
// Entry Point
// =============================================================================

criterion_group!(
    benches,
    interning,
    constant_access,
    equality,
    hashing,
    string_access,
    realistic,
);
criterion_main!(benches);
