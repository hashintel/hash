#![forbid(unsafe_code)]
#![expect(
    unreachable_pub,
    reason = "This is a binary but as we want to document this crate as well this should be a \
              warning instead"
)]

extern crate alloc;
extern crate core;

mod args;
mod error;
mod subcommand;

use error_stack::Result;
use graph::load_env;
use hash_tracing::sentry::{init, release_name};

use self::{args::Args, error::GraphError};

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() -> Result<(), GraphError> {
    load_env(None);
    validation::error::install_error_stack_hooks();

    let Args {
        subcommand,
        tracing_config,
    } = Args::parse_args();

    let _sentry_guard = init(&tracing_config.sentry, release_name!());

    subcommand.execute(tracing_config)
}
