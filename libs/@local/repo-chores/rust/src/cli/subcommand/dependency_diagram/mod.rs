use std::{fs, io::Write as _, path::PathBuf};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use tracing::{debug, info, instrument};

use crate::dependency_diagram::{
    DependencyDiagramConfig, DependencyDiagramError, LinkMode, generate_dependency_diagram,
};

/// Arguments for the diagram subcommand.
///
/// This struct defines all available options for the diagram generation tool.
/// The tool can generate Mermaid diagrams of Rust crate dependencies within a workspace.
#[derive(Debug, Parser)]
#[expect(clippy::struct_excessive_bools, reason = "This is a CLI tool")]
pub(crate) struct Args {
    /// Output file path for the mermaid diagram.
    ///
    /// When specified, writes the diagram to this file path.
    /// When not specified, outputs to stdout.
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Include only crates matching these patterns.
    ///
    /// Supports glob patterns like "*-graph*" to filter which crates are included.
    /// When multiple patterns are provided, crates matching any pattern are included.
    #[arg(short, long)]
    include: Vec<String>,

    /// Crates to exclude from the diagram.
    ///
    /// Supports glob patterns like "*-test*" to filter which crates are excluded.
    /// When multiple patterns are provided, crates matching any pattern are excluded.
    #[arg(short, long)]
    exclude: Vec<String>,

    /// The root crate to highlight with a thicker border (if any).
    ///
    /// When specified, this crate will be highlighted in the diagram with thicker borders.
    #[arg(short, long)]
    root: Option<String>,

    /// Show only dependencies of the root crate.
    ///
    /// When enabled, the diagram will only include the root crate and its
    /// dependencies (direct and transitive). Requires the `--root` option.
    #[arg(long, requires = "root", conflicts_with = "root_deps_and_dependents")]
    root_deps_only: bool,

    /// Show both dependencies and dependents of the root crate.
    ///
    /// When enabled, the diagram will include crates that depend on the root crate
    /// as well as the root crate's dependencies. Requires the `--root` option.
    #[arg(long, requires = "root", conflicts_with = "root_deps_only")]
    root_deps_and_dependents: bool,

    /// Link generation mode.
    ///
    /// Controls how documentation links are generated in the diagram.
    #[arg(long, value_enum)]
    link_mode: Option<LinkMode>,

    /// Do not deduplicate transitive dependencies.
    ///
    /// By default, the diagram deduplicates transitive dependencies for clarity.
    /// Enable this flag to show all dependencies even if they're transitive.
    #[arg(short, long)]
    no_dedup_transitive: bool,

    /// Include dev dependencies (used for tests and examples).
    ///
    /// When enabled, includes dev dependencies in the diagram with dotted arrow style.
    #[arg(short = 't', long)]
    include_dev_deps: bool,

    /// Include build dependencies (used for build scripts).
    ///
    /// When enabled, includes build dependencies in the diagram with dashed arrow style.
    #[arg(short = 'b', long)]
    include_build_deps: bool,

    /// Only include workspace dependencies.
    ///
    /// When enabled, only includes dependencies that are part of the workspace.
    #[arg(short = 'w', long, default_value_t = true)]
    workspace_only: bool,
}

/// Writes the diagram to an output file or stdout.
///
/// Takes a Mermaid diagram as a string and either writes it to the provided file path
/// or outputs it to stdout if no path is provided.
///
/// # Errors
///
/// - [`DependencyDiagramError::FileWrite`] if writing to the output file fails
#[instrument(level = "debug", skip(diagram))]
fn output_diagram(
    diagram: &str,
    output_path: Option<&PathBuf>,
) -> Result<(), Report<DependencyDiagramError>> {
    // Output to stdout if no output file is specified
    let Some(output_path) = output_path else {
        // Output the diagram to stdout
        debug!(
            diagram_lines = diagram.lines().count(),
            diagram_size = diagram.len(),
            "Outputting diagram to stdout"
        );
        // Using write_all on stdout instead of println to avoid the lint warning
        std::io::stdout()
            .write_all(diagram.as_bytes())
            .change_context(DependencyDiagramError::FileWrite)?;
        return Ok(());
    };

    debug!(
        path = %output_path.display(),
        diagram_lines = diagram.lines().count(),
        diagram_size = diagram.len(),
        "Writing diagram to file"
    );

    fs::File::create(output_path)
        .change_context(DependencyDiagramError::FileWrite)
        .attach_with(|| output_path.display().to_string())?
        .write_all(diagram.as_bytes())
        .change_context(DependencyDiagramError::FileWrite)?;

    info!(path = %output_path.display(), "Mermaid diagram written successfully");

    Ok(())
}

/// Runs the diagram generation process based on provided arguments.
///
/// This is the main entry point for the diagram subcommand. It orchestrates the entire
/// process of generating a Mermaid dependency diagram:
///
///  1. Converts CLI arguments to a diagram configuration
///  2. Generates the diagram using the library function
///  3. Outputs the diagram to stdout or a file
///
/// # Errors
///
/// - [`CargoMetadata`] if gathering cargo metadata fails
/// - [`GlobPattern`] if creating glob patterns fails
/// - [`FileWrite`] if writing the output file fails
///
/// [`CargoMetadata`]: DependencyDiagramError::CargoMetadata
/// [`GlobPattern`]: DependencyDiagramError::GlobPattern
/// [`FileWrite`]: DependencyDiagramError::FileWrite
#[instrument(level = "debug")]
pub(super) fn run(args: Args) -> Result<(), Report<DependencyDiagramError>> {
    info!(
        root_crate = ?args.root,
        include_patterns = ?args.include,
        exclude_patterns = ?args.exclude,
        root_deps_only = args.root_deps_only,
        root_deps_and_dependents = args.root_deps_and_dependents,
        dedup_transitive = !args.no_dedup_transitive,
        include_dev_deps = args.include_dev_deps,
        include_build_deps = args.include_build_deps,
        link_mode = ?args.link_mode,
        output_mode = if args.output.is_some() { "file" } else { "stdout" },
        output_file = ?args.output.as_ref().map(|path| path.display().to_string()),
        "Generating dependency diagram"
    );

    let config = DependencyDiagramConfig {
        root: args.root,
        root_deps_only: args.root_deps_only,
        root_deps_and_dependents: args.root_deps_and_dependents,
        include: args.include,
        no_dedup_transitive: args.no_dedup_transitive,
        include_dev_deps: args.include_dev_deps,
        include_build_deps: args.include_build_deps,
        exclude: args.exclude,
        link_mode: args.link_mode.unwrap_or_default(),
        workspace_only: args.workspace_only,
    };

    let diagram = generate_dependency_diagram(&config)?;
    output_diagram(&diagram, args.output.as_ref())?;

    Ok(())
}
