#![feature(lint_reasons)]
#![forbid(unsafe_code)]

mod args;
mod error;
mod subcommand;

use std::sync::Arc;

use error_stack::Result;

use self::{args::Args, error::GraphError, subcommand::Subcommand};

fn main() -> Result<(), GraphError> {
    let args = Args::parse_args();

    let _sentry = sentry::init(sentry::ClientOptions {
        dsn: args.sentry_dsn.clone(),
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

    args.subcommand.execute()
}
