use core::error::Error;
use std::path::{Path, PathBuf};

mod analyze;
mod upload;
use clap::Parser;
use error_stack::ResultExt;

fn target_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .and_then(Path::parent)
        .expect("could not find repository root directory")
        .join("target")
        .canonicalize()
        .expect("Could not open directory")
}

fn criterion_directory() -> PathBuf {
    target_directory()
        .join("criterion")
        .canonicalize()
        .expect("Could not open directory")
}

fn current_commit() -> Result<String, Box<dyn Error + Send + Sync>> {
    Ok(String::from_utf8(
        std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .attach_printable("Could not get current commit hash")?
            .stdout,
    )?
    .trim()
    .to_owned())
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
