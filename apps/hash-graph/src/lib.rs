//! # HASH Graph
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![forbid(unsafe_code)]
#![expect(
    unreachable_pub,
    reason = "This is a binary but as we want to document this crate as well this should be a \
              warning instead"
)]
#![expect(
    exported_private_dependencies,
    reason = "Exported dependencies are only used inside the proxy of main.rs"
)]

extern crate alloc;

mod args;
mod error;
mod subcommand;

use hash_graph_postgres_store::load_env;
use hash_telemetry::traces::sentry::{init, release_name};

use self::args::Args;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Entrypoint for the HASH Graph binary.
///
/// # Errors
///
/// The process was unable to recover from an error.
// We erase the type here, so that the final `main.rs` does not depend on any external crate, beside
// `hash_graph`.
pub fn exec() -> Result<(), Box<dyn core::error::Error + Send + Sync>> {
    load_env(None);

    let Args {
        subcommand,
        tracing_config,
        worker_threads,
    } = Args::parse_args();

    if let Some(result) = subcommand.healthcheck() {
        return result.map_err(From::from);
    }

    let _sentry_guard = init(&tracing_config.sentry, release_name!());

    subcommand
        .execute(tracing_config, worker_threads)
        .map_err(From::from)
}
