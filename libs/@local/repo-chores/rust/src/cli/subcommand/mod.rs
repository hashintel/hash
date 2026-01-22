use core::error::Error;

use error_stack::ResultExt as _;

use crate::{sort_package_json::SortPackageJsonError, sync_turborepo::SyncTurborepoError};

mod benches;
mod completions;
mod dependency_diagram;
mod lcov;
mod sort_package_json;
mod sync_turborepo;

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub(super) enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(completions::Args),
    /// Tooling around benchmarks for the repository.
    Benches(benches::Args),
    /// Generate a dependency diagram in Mermaid format.
    #[clap(name = "dependency-diagram")]
    DependencyDiagram(dependency_diagram::Args),
    /// Tooling around lcov reports for the repository.
    Lcov(lcov::Args),
    /// Sync Cargo.toml metadata to package.json for Turborepo integration.
    #[clap(name = "sync-turborepo")]
    SyncTurborepo(sync_turborepo::Args),
    /// Sort package.json files to ensure consistent key ordering.
    #[clap(name = "sort-package-json")]
    SortPackageJson(sort_package_json::Args),
}

impl Subcommand {
    pub(super) async fn run(self) -> Result<(), Box<dyn Error + Send + Sync>> {
        match self {
            Self::Completions(args) => {
                completions::run(&args);
                Ok(())
            }
            Self::Benches(args) => benches::run(args).await,
            Self::DependencyDiagram(args) => Ok(dependency_diagram::run(args)?),
            Self::Lcov(args) => args.run(),
            Self::SyncTurborepo(args) => Ok(sync_turborepo::run(args)
                .await
                .change_context(SyncTurborepoError::UnableToSync)?),
            Self::SortPackageJson(args) => Ok(sort_package_json::run(args)
                .await
                .change_context(SortPackageJsonError::UnableToSort)?),
        }
    }
}
