#![feature(custom_test_frameworks)]
#![feature(lint_reasons)]
#![feature(associated_type_bounds)]
#![test_runner(criterion::runner)]
#![allow(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "This is a benchmark"
)]

mod read_scaling;
mod representative_read;
mod writes;

mod util;
