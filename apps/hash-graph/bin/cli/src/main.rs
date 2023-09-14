#![feature(lint_reasons)]
#![forbid(unsafe_code)]

mod args;
mod error;
mod parser;
mod subcommand;

use std::sync::Arc;

use error_stack::{ensure, Report, Result};
use graph::load_env;

use self::{args::Args, error::GraphError};
use crate::error::SentryError;

fn main() -> Result<(), GraphError> {
    load_env(None);

    let Args {
        sentry_dsn,
        subcommand,
    } = Args::parse_args();

    if let Some(dsn) = &sentry_dsn {
        let client = sentry::Client::from_config(dsn);

        ensure!(
            client.is_enabled(),
            Report::new(SentryError::InvalidDsn)
                .attach_printable(dsn.clone())
                .change_context(GraphError)
        );
    }

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
        ..Default::default()
    });

    subcommand.execute()
}
