#![feature(lint_reasons)]
#![forbid(unsafe_code)]

mod args;
mod error;
mod subcommand;

use error_stack::Result;

use self::{args::Args, error::GraphError, subcommand::Subcommand};

#[tokio::main]
async fn main() -> Result<(), GraphError> {
    let args = Args::parse_args();

    match args.subcommand {
        Subcommand::Server(args) => subcommand::server(args).await,
        Subcommand::Migrate(args) => subcommand::migrate(args).await,
        #[cfg(feature = "type-fetcher")]
        Subcommand::TypeFetcher(args) => subcommand::type_fetcher(args).await,
        Subcommand::Completions(ref args) => {
            subcommand::completions(args);
            Ok(())
        }
        Subcommand::Snapshot(args) => subcommand::snapshot(args).await,
    }
}
