use core::error::Error;

mod benches;
mod completions;
mod dependency_graph;

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub(super) enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(completions::Args),
    /// Tooling around benchmarks for the repository.
    Benches(benches::Args),
    /// Tool to create a dependency graph for a package.
    DependencyGraph(dependency_graph::Args),
}

impl Subcommand {
    pub(super) async fn run(self) -> Result<(), Box<dyn Error + Send + Sync>> {
        match self {
            Self::Completions(args) => {
                completions::run(&args);
                Ok(())
            }
            Self::Benches(args) => benches::run(args).await,
            Self::DependencyGraph(args) => dependency_graph::run(args),
        }
    }
}
