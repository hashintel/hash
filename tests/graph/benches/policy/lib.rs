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

//! Benchmarks to test the performance of policy resolution operations.

extern crate alloc;

mod benchmark_matrix;
mod seed;
#[path = "../util.rs"]
mod util;

use criterion::Criterion;
use criterion_macro::criterion;

use crate::benchmark_matrix::{BenchmarkMatrix, run_benchmark_matrix};

#[criterion]
fn bench_resolve_policies(crit: &mut Criterion) {
    run_benchmark_matrix(crit, &BenchmarkMatrix::full());
}
