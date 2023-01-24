#![feature(lint_reasons)]
#![forbid(unsafe_code)]

mod args;
mod error;
mod subcommands;

use error::GraphError;
use error_stack::Result;
use subcommands::{completions::completions, Subcommand};

use crate::{
    args::Args,
    subcommands::{migrate::migrate, server::server},
};

#[tokio::main]
async fn main() -> Result<(), GraphError> {
    let args = Args::parse_args();

    match args.subcommand {
        Subcommand::Server(args) => server(args).await,
        Subcommand::Migrate(args) => migrate(args).await,
        Subcommand::Completions(args) => completions(args),
    }
}
