#![forbid(unsafe_code)]
#![feature(async_closure)]
#![expect(
    unreachable_pub,
    reason = "This is a binary but as we want to document this crate as well this should be a \
              warning instead"
)]

extern crate alloc;

mod args;
mod error;
mod subcommand;

use error_stack::Report;
use hash_graph_postgres_store::load_env;
use hash_tracing::sentry::{init, release_name};

use self::{args::Args, error::GraphError};

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() -> Result<(), Report<GraphError>> {
    load_env(None);
    hash_graph_types::knowledge::property::error::install_error_stack_hooks();

    let Args {
        subcommand,
        tracing_config,
    } = Args::parse_args();

    let _sentry_guard = init(&tracing_config.sentry, release_name!());

    subcommand.execute(tracing_config)
}
