#![feature(custom_test_frameworks, lint_reasons)]
#![test_runner(criterion::runner)]
#![allow(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "This is a benchmark"
)]
#![expect(
    unreachable_pub,
    reason = "This is a benchmark but as we want to document this crate as well this should be a \
              warning instead"
)]

//! TODO: Introduce benchmarks testing the differing performance of operations as the graph's scale
//!  changes

#[path = "../util.rs"]
mod util;

mod knowledge;
