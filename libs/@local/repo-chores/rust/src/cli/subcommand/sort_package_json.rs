use std::path::PathBuf;

use clap::Parser;
use error_stack::Report;

use crate::sort_package_json::{SortPackageJsonError, sort_package_json_files};

/// Arguments for the sort-package-json subcommand.
///
/// Sorts package.json files to ensure consistent key ordering.
/// If no files are provided, sorts all yarn workspace package.json files.
#[derive(Debug, Parser)]
pub(crate) struct Args {
    /// Check if files are sorted without modifying them.
    /// Exits with an error if any file is not sorted.
    #[arg(long)]
    check: bool,

    /// Paths to package.json files to sort.
    /// If not provided, sorts all yarn workspace package.json files.
    files: Vec<PathBuf>,
}

/// Runs the sort-package-json process on the provided files.
///
/// # Errors
///
/// Returns an error if sorting any file fails.
pub(super) async fn run(args: Args) -> Result<(), Report<[SortPackageJsonError]>> {
    let files = if args.files.is_empty() {
        None
    } else {
        Some(args.files)
    };

    sort_package_json_files(files, args.check).await
}
