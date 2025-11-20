mod merge;

use core::error::Error;

use clap::Parser;

#[derive(Debug, clap::Subcommand)]
enum Subcommand {
    Merge(merge::Args),
}

#[derive(Debug, Parser)]
pub(crate) struct Args {
    #[command(subcommand)]
    subcommand: Subcommand,
}

impl Args {
    pub(crate) fn run(self) -> Result<(), Box<dyn Error + Send + Sync>> {
        match self.subcommand {
            Subcommand::Merge(args) => args.run(),
        }
    }
}
