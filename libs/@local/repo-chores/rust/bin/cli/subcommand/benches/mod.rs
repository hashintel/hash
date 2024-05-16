use std::{
    error::Error,
    io,
    path::{Path, PathBuf},
};

mod analyze;
mod upload;
use clap::Parser;
use error_stack::{Report, ResultExt};

fn criterion_directory() -> Result<PathBuf, Report<io::Error>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .and_then(Path::parent)
        .expect("could not find repository root directory")
        .join("target")
        .join("criterion");
    path.canonicalize()
        .attach_printable_lazy(|| format!("Could not open directory `{}`", path.display()))
}

#[derive(Debug, clap::Subcommand)]
enum Subcommand {
    Analyze(analyze::Args),
    Upload(upload::Args),
}

#[derive(Debug, Parser)]
pub(crate) struct Args {
    #[command(subcommand)]
    subcommand: Subcommand,
}

pub(super) async fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    match args.subcommand {
        Subcommand::Analyze(args) => analyze::run(args).map_err(Into::into),
        Subcommand::Upload(args) => upload::run(args).await,
    }
}
