use std::error::Error;
mod analyze;
use clap::Parser;

#[derive(Debug, clap::Subcommand)]
enum Subcommand {
    Analyze(analyze::Args),
}

#[derive(Debug, Parser)]
pub(crate) struct Args {
    #[command(subcommand)]
    subcommand: Subcommand,
}

pub(super) fn run(args: Args) -> Result<(), Box<dyn Error>> {
    match args.subcommand {
        Subcommand::Analyze(args) => analyze::run(args).map_err(Into::into),
    }
}
