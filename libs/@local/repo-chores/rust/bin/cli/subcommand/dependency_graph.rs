use core::error::Error;

use clap::Parser;
use hash_repo_chores::dependency_graph;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    #[clap(long)]
    workspace_only: bool,
    #[clap(long)]
    no_transitive_dependencies: bool,
    #[clap(long)]
    all_features: bool,
    #[clap(long)]
    manifest_path: Option<String>,
}

pub(super) fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    let mut command = cargo_metadata::MetadataCommand::new();
    if args.all_features {
        command.features(cargo_metadata::CargoOpt::AllFeatures);
    }
    if let Some(manifest_path) = args.manifest_path {
        command.manifest_path(manifest_path);
    }
    let metadata = command.exec()?;

    let mut dependency_graph = dependency_graph::DependencyGraph::from_metadata(&metadata);
    if args.workspace_only {
        dependency_graph.filter_workspace();
    }
    if args.no_transitive_dependencies {
        dependency_graph.remove_transitive_dependencies();
    }

    println!("{}", dependency_graph.to_mermaid());

    Ok(())
}
