#![feature(lint_reasons)]
#![forbid(unsafe_code)]
#![expect(
    unreachable_pub,
    reason = "This is a binary but as we want to document this crate as well this should be a \
              warning instead"
)]

mod args;
mod error;
mod parser;
mod subcommand;

use std::{borrow::Cow, sync::Arc};

use error_stack::Result;
use graph::load_env;

use self::{args::Args, error::GraphError};

fn main() -> Result<(), GraphError> {
    load_env(None);
    validation::error::install_error_stack_hooks();

    let Args {
        sentry_dsn,
        sentry_environment,
        subcommand,
    } = Args::parse_args();

    // Initialize Sentry
    // When initializing Sentry, a `Drop` guard is returned, once dropped any remaining events are
    // flushed. This means we need to keep the guard around for the entire lifetime of the program.
    let _sentry = sentry::init(sentry::ClientOptions {
        dsn: sentry_dsn,
        release: sentry::release_name!(),
        session_mode: sentry::SessionMode::Request,
        traces_sampler: Some(Arc::new(|ctx| {
            if Some(true) == ctx.sampled() {
                1.0
            } else if ctx.operation() == "http.server" {
                0.1
            } else {
                1.0
            }
        })),
        environment: Some(Cow::Owned(sentry_environment.to_string())),

        ..Default::default()
    });

    subcommand.execute()
}
