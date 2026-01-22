use clap::Parser;
use error_stack::{Report, ResultExt as _};
use globset::{Glob, GlobSetBuilder};

use crate::sync_turborepo::{SyncTurborepoConfig, SyncTurborepoError, sync_turborepo};

/// Arguments for the sync-turborepo subcommand.
///
/// Syncs Cargo.toml metadata to package.json files for Turborepo integration.
/// It reads Rust package metadata and generates corresponding package.json files with
/// the correct name, version, and dependencies.
#[derive(Debug, Parser)]
pub(crate) struct Args {
    /// Include only packages matching these glob patterns.
    ///
    /// Supports glob patterns like "*-graph*" to filter which packages are synced.
    /// When multiple patterns are provided, packages matching any pattern are included.
    #[arg(short, long)]
    include: Vec<String>,
}

/// Runs the sync-turborepo process based on provided arguments.
///
/// # Errors
///
/// Returns an error if syncing any package fails.
pub(super) async fn run(args: Args) -> Result<(), Report<[SyncTurborepoError]>> {
    let include = if args.include.is_empty() {
        None
    } else {
        let mut builder = GlobSetBuilder::new();
        for pattern in &args.include {
            let glob = Glob::new(pattern).change_context(SyncTurborepoError::MalformedGlob)?;
            builder.add(glob);
        }

        Some(
            builder
                .build()
                .change_context(SyncTurborepoError::MalformedGlob)?,
        )
    };

    let config = SyncTurborepoConfig { include };

    sync_turborepo(config).await
}
