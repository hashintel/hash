//! Utilities for generating dependency diagrams.
//!
//! This module provides functionality for generating Mermaid diagrams of Rust crate
//! dependencies within a workspace.

use alloc::collections::{BTreeMap, BTreeSet};
use core::{error::Error, fmt::Write as _};
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use globset::{Glob, GlobSet, GlobSetBuilder};
use guppy::{
    MetadataCommand, PackageId,
    graph::{DependencyDirection, PackageGraph, PackageSet},
};

/// Errors that can occur during dependency diagram generation.
#[derive(Debug, derive_more::Display)]
pub enum DependencyDiagramError {
    /// Indicates a failure when running the cargo metadata command.
    #[display("Failed to execute cargo metadata")]
    CargoMetadata,

    /// Indicates a failure when writing to a file.
    #[display("Failed to write to file")]
    FileWrite,

    /// Indicates a failure when creating a glob pattern.
    #[display("Failed to create glob pattern")]
    GlobPattern,

    /// Indicates that the specified root crate was not found in the dependency graph.
    #[display("Root crate '{_0}' not found in dependency graph")]
    RootCrateNotFound(String),
}

impl Error for DependencyDiagramError {}

/// Link generation mode for crates in the diagram.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, clap::ValueEnum)]
#[clap(rename_all = "kebab-case")]
pub enum LinkMode {
    /// Create documentation links for all crates
    All,

    /// Create documentation links for all crates except the root
    NonRoots,

    /// Don't create documentation links for any crates
    #[default]
    None,
}

/// Configuration for generating dependency diagrams.
#[derive(Debug, Clone, Default)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct"
)]
pub struct DependencyDiagramConfig {
    /// The root crate to highlight with a thicker border (if any)
    pub root: Option<String>,

    /// Show only dependencies of the root crate
    pub root_deps_only: bool,

    /// Show both dependencies and dependents of the root crate
    ///
    /// When true, the diagram will include crates that depend on the root crate
    /// (reverse dependencies) as well as the root crate's dependencies.
    pub root_deps_and_dependents: bool,

    /// Include only crates matching these patterns
    pub include: Vec<String>,

    /// Do not deduplicate transitive dependencies
    pub no_dedup_transitive: bool,

    /// Include dev dependencies (used for tests and examples)
    pub include_dev_deps: bool,

    /// Include build dependencies (used for build scripts)
    pub include_build_deps: bool,

    /// Crates to exclude from the diagram
    pub exclude: Vec<String>,

    /// Link generation mode
    ///
    /// Controls how documentation links are generated in the diagram:
    /// - `All`: Create links for all crates
    /// - `NonRoots`: Create links for all crates except the root
    /// - `None`: Don't create links for any crates (default)
    pub link_mode: LinkMode,

    /// Include only crates within the workspace
    pub workspace_only: bool,
}

/// Creates a glob set from patterns for filtering crates.
///
/// This function is used for both include and exclude patterns to determine
/// which crates should be included in or excluded from the diagram. It converts
/// a list of glob patterns into a compiled [`globset::GlobSet`] for efficient matching.
///
/// Returns `None` if the patterns list is empty, otherwise returns a compiled
/// glob set that can be used for matching crate names.
///
/// # Errors
///
/// - [`DependencyDiagramError::GlobPattern`] if any of the glob patterns is invalid
///
/// # Performance
///
/// This function compiles all glob patterns into a single optimized matcher,
/// which provides O(1) matching time regardless of the number of patterns.
#[tracing::instrument(level = "debug")]
fn compile_patterns(
    patterns: &[String],
) -> Result<Option<GlobSet>, Report<DependencyDiagramError>> {
    if patterns.is_empty() {
        tracing::debug!("no patterns specified");
        return Ok(None);
    }

    tracing::debug!("creating glob set");

    let mut builder = GlobSetBuilder::new();

    for pattern in patterns {
        tracing::debug!(pattern, "adding pattern");
        let glob = Glob::new(pattern).change_context(DependencyDiagramError::GlobPattern)?;
        builder.add(glob);
    }

    let globset = builder
        .build()
        .change_context(DependencyDiagramError::GlobPattern)?;

    tracing::debug!(patterns = patterns.len(), "glob set created successfully");

    Ok(Some(globset))
}

const GRAPH_PRELUDE: &str = "graph TD
    linkStyle default stroke-width:1.5px
    classDef default stroke-width:1px
    classDef root stroke-width:3px
    classDef dev stroke-width:1px
    classDef build stroke-width:1px
    %% Legend
    %% --> : Normal dependency
    %% -.-> : Dev dependency
    %% ---> : Build dependency
";

const ARROW_STYLE_NORMAL: &str = "-->";
const ARROW_STYLE_DEV: &str = "-.->";
const ARROW_STYLE_BUILD: &str = "--->";

/// Converts a dependency graph to a Mermaid diagram format.
///
/// Takes a package set from guppy and generates Mermaid diagram syntax for visualization.
/// The diagram represents crate dependencies with different arrow styles based on
/// dependency type and highlights the root crate with a thicker border.
///
/// The diagram uses:
/// - Normal dependencies: solid arrow (`-->`)
/// - Dev dependencies: dotted arrow (`-.->`)
/// - Build dependencies: dashed arrow (`--->`),
///
/// Root crates are highlighted with a thicker border (3px vs 1px for normal crates).
///
/// # Arguments
///
/// * `set` - The package set containing nodes and links to include in the diagram
/// * `root_crate` - Optional crate to highlight as the root in the diagram with thicker borders
/// * `dedup_transitive` - Whether to deduplicate transitive dependencies (e.g., if A->B->C and
///   A->C, only show A->B->C)
/// * `link_mode` - Controls how documentation links are generated (All, NonRoots, or None)
///
/// # Returns
///
/// A [`String`] containing the Mermaid diagram syntax.
///
/// # Performance
///
/// This function performs multiple passes over the package graph to generate the diagram:
/// - One pass to create node representations - O(n) where n is the number of nodes
/// - One pass to identify transitive edges (if `dedup_transitive` is `true`) - O(n³) in the worst
///   case where n is the number of nodes
/// - One pass to create edge representations - O(e) where e is the number of edges
///
/// For large graphs with many nodes, deduplication of transitive edges can become
/// computationally expensive. Consider disabling it for very large graphs.
#[tracing::instrument(level = "debug", skip(set), fields(
    packages = set.len(),
))]
fn graph_to_mermaid(
    set: PackageSet,
    root_crate: Option<&str>,
    dedup_transitive: bool,
    link_mode: LinkMode,
) -> String {
    tracing::debug!("Generating Mermaid diagram");

    let mut mermaid = GRAPH_PRELUDE.to_owned();

    // Collect all package IDs from the set and sort them for deterministic output
    let mut package_ids: Vec<_> = set
        .packages(DependencyDirection::Forward)
        .map(|metadata| metadata.id())
        .collect();

    package_ids.sort();

    // Map the package id to a numerical one, as mermaid does not support package IDs directly
    let package_id_lookup: HashMap<&PackageId, usize> = package_ids
        .into_iter()
        .enumerate()
        .map(|(index, id)| (id, index))
        .collect();

    tracing::debug!(packages = package_id_lookup.len(), "Processing packages",);

    for metadata in set.packages(DependencyDirection::Forward) {
        let is_root = Some(metadata.name()) == root_crate;
        let create_link = match link_mode {
            LinkMode::All => true,
            LinkMode::NonRoots => !is_root,
            LinkMode::None => false,
        };

        if create_link {
            let path = format!("../{}", metadata.name().replace('-', "_"));
            let _ = writeln!(
                mermaid,
                "    {}[<a href=\"{path}\">{}</a>]",
                package_id_lookup[metadata.id()],
                metadata.name()
            );
        } else {
            let _ = writeln!(
                mermaid,
                "    {}[{}]",
                package_id_lookup[metadata.id()],
                metadata.name()
            );
        }

        if is_root {
            let _ = writeln!(
                mermaid,
                "    class {} root",
                package_id_lookup[metadata.id()]
            );
        }
    }

    let mut transitive_edges = BTreeSet::new();
    let mut edges = BTreeMap::new();

    for link in set.links(DependencyDirection::Forward) {
        let from = package_id_lookup[link.from().id()];
        let to = package_id_lookup[link.to().id()];
        edges.insert((from, to), link);
    }

    tracing::debug!(edges = edges.len(), "Processing links between packages");

    if dedup_transitive {
        tracing::debug!("Identifying transitive edges for deduplication");

        for &node in package_id_lookup.values() {
            // For each node, find paths of length 2 (i.e., A->B->C means A->C is transitive)
            for (&(_, neighbour), _) in edges.range((node, usize::MIN)..=(node, usize::MAX)) {
                for (&(_, transitive), _) in
                    edges.range((neighbour, usize::MIN)..=(neighbour, usize::MAX))
                {
                    // If there's a direct edge from node to transitive, it's transitive
                    if edges.contains_key(&(node, transitive)) {
                        tracing::trace!(
                            from = node,
                            to = transitive,
                            via = neighbour,
                            "Identified transitive edge"
                        );

                        transitive_edges.insert((node, transitive));
                    }
                }
            }
        }

        tracing::debug!(
            edges = edges.len(),
            transitive_edges = transitive_edges.len(),
            "Identified transitive edges",
        );
    }

    for ((from_id, to_id), link) in edges {
        if transitive_edges.contains(&(from_id, to_id)) {
            tracing::trace!(
                from = link.from().name(),
                to = link.to().name(),
                "Skipping transitive edge"
            );
            continue;
        }

        let is_build = link.build().is_present();
        let is_dev = link.dev().is_present();

        let arrow_style = if is_dev {
            ARROW_STYLE_DEV
        } else if is_build {
            ARROW_STYLE_BUILD
        } else {
            ARROW_STYLE_NORMAL
        };

        let _ = writeln!(mermaid, "    {from_id} {arrow_style} {to_id}");
    }

    tracing::debug!(size = mermaid.len(), "Mermaid diagram generated");
    mermaid
}

/// Generates a Mermaid diagram for crate dependencies in the workspace.
///
/// This is the main entry point for the diagram generation functionality. It orchestrates
/// the entire process of generating a Mermaid dependency diagram:
/// 1. Gathers metadata from cargo using guppy
/// 2. Applies filtering based on configuration options
/// 3. Generates the Mermaid diagram representation
///
/// # Arguments
///
/// * Configuration options controlling which crates to include, how to filter dependencies, and how
///   to format the diagram
///
/// # Returns
///
/// A string containing the Mermaid diagram syntax.
///
/// # Errors
///
/// - [`DependencyDiagramError::CargoMetadata`] if gathering cargo metadata fails
/// - [`DependencyDiagramError::GlobPattern`] if creating glob patterns fails
/// - [`DependencyDiagramError::RootCrateNotFound`] if the specified root crate is not found
///
/// # Performance
///
/// This function uses guppy to efficiently analyze package dependencies. The most
/// computationally expensive operation is detecting and removing transitive dependencies,
/// which has O(n³) complexity in the worst case.
#[tracing::instrument(level = "debug")]
pub fn generate_dependency_diagram(
    DependencyDiagramConfig {
        root,
        root_deps_only,
        root_deps_and_dependents,
        include,
        no_dedup_transitive,
        include_dev_deps,
        include_build_deps,
        exclude,
        link_mode,
        workspace_only,
    }: &DependencyDiagramConfig,
) -> Result<String, Report<DependencyDiagramError>> {
    // Get package graph from cargo metadata
    tracing::debug!("Retrieving cargo metadata using guppy");
    let graph = PackageGraph::from_command(&mut MetadataCommand::new())
        .change_context(DependencyDiagramError::CargoMetadata)?;

    tracing::info!(packages = graph.package_count(), "Package graph loaded");

    // Create glob sets for filtering
    let include_globset = compile_patterns(include)?;
    let exclude_globset = compile_patterns(exclude)?;

    let root_set = root.as_ref().map(|root| graph.resolve_package_name(root));

    if let Some(root_set) = &root_set {
        if root_set.is_empty() {
            return Err(Report::new(DependencyDiagramError::RootCrateNotFound(
                root.clone().unwrap_or_else(|| unreachable!()),
            )));
        }
    }

    let query_root = root_set.as_ref().map_or_else(
        || {
            tracing::debug!("Using all workspace packages as query root");
            graph.query_workspace()
        },
        |root_set| {
            tracing::debug!("Using root package as query root");
            root_set.to_package_query(DependencyDirection::Forward)
        },
    );

    let query = query_root.resolve_with_fn(|_, link| {
        if let Some(include) = &include_globset {
            if !include.is_match(link.from().name()) || !include.is_match(link.to().name()) {
                return false;
            }
        }

        if let Some(exclude) = &exclude_globset {
            if exclude.is_match(link.from().name()) || exclude.is_match(link.to().name()) {
                return false;
            }
        }

        if !*include_dev_deps && link.dev_only() {
            return false;
        }

        if !*include_build_deps && !link.normal().is_present() && !link.dev().is_present() {
            return false;
        }

        if *workspace_only && (!link.from().in_workspace() || !link.to().in_workspace()) {
            return false;
        }

        if *root_deps_only && *root_deps_and_dependents {
            if let Some(root) = &root_set {
                return root
                    .contains(link.from().id())
                    .expect("package graph should know package id")
                    || root
                        .contains(link.to().id())
                        .expect("package graph should know package id");
            }
        } else if *root_deps_only {
            if let Some(root) = &root_set {
                return root
                    .contains(link.from().id())
                    .expect("package graph should know package id");
            }
        }

        true
    });

    tracing::info!(
        packages = query.packages(DependencyDirection::Forward).count(),
        "Graph has been filtered"
    );

    // Convert the package set to a mermaid diagram
    let diagram = graph_to_mermaid(query, root.as_deref(), !no_dedup_transitive, *link_mode);

    Ok(diagram)
}
