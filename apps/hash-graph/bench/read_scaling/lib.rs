#![feature(custom_test_frameworks, lint_reasons, associated_type_bounds)]
#![test_runner(criterion::runner)]
#![allow(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "This is a benchmark"
)]

//! TODO: Introduce benchmarks testing the differing performance of operations as the graph's scale
//!  changes

#[path = "../util.rs"]
mod util;

mod knowledge;
