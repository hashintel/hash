#![feature(lint_reasons)]
#![forbid(unsafe_code)]

mod args;
mod error;
mod migrate_database;
mod start_server;

use args::CompletionsArgs;
use clap::{Args as _, Command};
use error::GraphError;
use error_stack::Result;

use crate::{args::Args, migrate_database::migrate_database, start_server::start_server};

#[tokio::main]
async fn main() -> Result<(), GraphError> {
    let args = Args::parse_args();

    match args.subcommand {
        args::Subcommand::Server(server_args) => start_server(server_args).await,
        args::Subcommand::Migrate(migrate_args) => migrate_database(migrate_args).await,
        args::Subcommand::Completions(CompletionsArgs { shell }) => {
            clap_complete::generate(
                shell,
                &mut Args::augment_args(Command::new(env!("CARGO_PKG_NAME"))),
                env!("CARGO_PKG_NAME"),
                &mut std::io::stdout(),
            );
            std::process::exit(0);
        }
    }
}
