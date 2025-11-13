use core::error::Error;

mod benches;
mod completions;
mod dependency_diagram;
mod lcov;

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
        }
    }
}
