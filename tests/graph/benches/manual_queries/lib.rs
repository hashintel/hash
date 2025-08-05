#![feature(
    // Language Features
    custom_test_frameworks,
)]
#![test_runner(criterion::runner)]

#[path = "../util.rs"]
#[expect(unreachable_pub, reason = "this module is shared between benches")]
mod util;

mod entity_queries;
