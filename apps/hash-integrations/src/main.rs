//! # HASH Integrations
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![forbid(unsafe_code)]
#![expect(
    unreachable_pub,
    reason = "This is a binary but as we want to document this crate as well this should be a \
              warning instead"
)]

mod args;
mod service;
mod subcommand;

use error_stack::Report;
use hash_telemetry::{
    init_tracing,
    traces::sentry::{init, release_name},
};

use self::{args::Args, subcommand::SubcommandError};

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() -> Result<(), Report<SubcommandError>> {
    let Args {
        subcommand,
        tracing_config,
    } = Args::parse_args();

    let _sentry_guard = init(&tracing_config.sentry, release_name!());

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime should be created")
        .block_on(async {
            let _telemetry_guard = init_tracing(tracing_config, "Integrations")
                .expect("telemetry should be initialized");

            subcommand.execute().await
        })
}
