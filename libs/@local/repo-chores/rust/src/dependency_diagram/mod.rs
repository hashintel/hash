//! Utilities for generating dependency diagrams.
//!
//! This module provides functionality for generating Mermaid diagrams of Rust crate
//! dependencies within a workspace.

use alloc::collections::{BTreeMap, BTreeSet, VecDeque};
use core::{error::Error, fmt::Write as _, iter};
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use globset::{Glob, GlobSet, GlobSetBuilder};
use guppy::{
    MetadataCommand, PackageId,
    graph::{
        DependencyDirection, PackageGraph, PackageLink, PackageMetadata, PackageQuery,
        PackageResolver, PackageSet,
    },
};

/// Errors that can occur during dependency diagram generation.
#[derive(Debug, derive_more::Display)]
pub(crate) enum DependencyDiagramError {
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
pub(crate) enum LinkMode {
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
pub(crate) struct DependencyDiagramConfig {
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

/// Checks if removing an edge would break connectivity between two nodes.
///
/// This function determines whether removing the edge from `from` to `to` would
/// make it impossible to reach `to` from `from` through other paths in the graph.
/// It uses a breadth-first search algorithm to check if an alternative path exists.
///
/// # Arguments
///
/// * `edges` - A map of edges in the graph, where keys are (from, to) tuples and values are the
///   corresponding edge data
/// * `from` - The source node of the edge being considered for removal
/// * `to` - The target node of the edge being considered for removal
///
/// # Returns
///
/// * `true` if removing the edge would break connectivity (i.e., no alternative path exists)
/// * `false` if removing the edge would preserve connectivity (i.e., an alternative path exists)
///
/// # Performance
///
/// This function performs a breadth-first search with time complexity O(V + E),
/// where V is the number of nodes and E is the number of edges in the graph.
/// In the worst case, it might visit all nodes and edges in the graph.
fn would_break_connectivity(
    edges: &BTreeMap<(usize, usize), PackageLink>,
    from: usize,
    to: usize,
) -> bool {
    let mut queue = VecDeque::new();
    let mut visited = BTreeSet::new();

    queue.push_back(from);
    visited.insert(from);

    while let Some(current) = queue.pop_front() {
        if current == to {
            return false;
        }

        for &(from, to) in edges.keys() {
            if from == current && !visited.contains(&to) {
                visited.insert(to);
                queue.push_back(to);
            }
        }
    }

    true
}

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
/// * `link_mode` - Controls how documentation links are generated (`All`, `NonRoots`, or `None`)
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
    set: &PackageSet,
    root_crate: Option<&str>,
    dedup_transitive: bool,
    link_mode: LinkMode,
) -> String {
    tracing::debug!("Generating Mermaid diagram");

    let mut mermaid = GRAPH_PRELUDE.to_owned();

    // Collect all package IDs from the set and sort them for deterministic output
    let mut packages: Vec<_> = set.packages(DependencyDirection::Forward).collect();

    packages.sort_by_key(PackageMetadata::id);

    tracing::debug!(packages = packages.len(), "Processing packages",);

    for (index, metadata) in packages.iter().copied().enumerate() {
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
                "    {index}[<a href=\"{path}/index.html\">{}</a>]",
                metadata.name()
            );
        } else {
            let _ = writeln!(mermaid, "    {index}[{}]", metadata.name());
        }

        if is_root {
            let _ = writeln!(mermaid, "    class {index} root");
        }
    }

    // Map the package id to a numerical one, as mermaid does not support package IDs directly
    let package_id_lookup: HashMap<&PackageId, usize> = packages
        .into_iter()
        .enumerate()
        .map(|(index, metadata)| (metadata.id(), index))
        .collect();

    let mut edges = BTreeMap::new();

    for link in set.links(DependencyDirection::Forward) {
        let from = *package_id_lookup
            .get(link.from().id())
            .expect("package should exist");
        let to = *package_id_lookup
            .get(link.to().id())
            .expect("package should exist");
        edges.insert((from, to), link);
    }

    tracing::debug!(edges = edges.len(), "Processing links between packages");

    if dedup_transitive {
        let mut transitive_edges = 0_usize;
        let mut potential_transitive = BTreeSet::new();
        tracing::debug!("Identifying transitive edges for deduplication");

        // First pass: identify potentially transitive edges
        // An edge A→C is potentially transitive if there exists a path A→B→C
        for &node in package_id_lookup.values() {
            for (&(_, neighbour), _) in edges.range((node, usize::MIN)..=(node, usize::MAX)) {
                if node == neighbour {
                    // self-loops should be preserved
                    continue;
                }

                for (&(_, transitive), _) in
                    edges.range((neighbour, usize::MIN)..=(neighbour, usize::MAX))
                {
                    if node == transitive || neighbour == transitive {
                        // self-loops should be preserved
                        continue;
                    }

                    // If there's a direct edge from node to transitive, it's potentially transitive
                    // The edge could still break connectivity, the second pass verifies if that is
                    // the case.
                    if edges.contains_key(&(node, transitive)) {
                        potential_transitive.insert((node, transitive));
                    }
                }
            }
        }

        // Second pass: verify each potentially transitive edge
        // Only mark an edge as truly transitive if removing it doesn't break connectivity
        for (from, to) in potential_transitive {
            let link = edges.remove(&(from, to)).expect("edge should exist");

            if would_break_connectivity(&edges, from, to) {
                edges.insert((from, to), link);
            } else {
                tracing::trace!(
                    from = link.from().name(),
                    to = link.to().name(),
                    "Identified transitive edge"
                );

                transitive_edges += 1;
            }
        }

        tracing::debug!(
            edges = edges.len(),
            transitive_edges,
            "Identified transitive edges",
        );
    }

    for ((from_id, to_id), link) in edges {
        let mut arrows = Vec::new();

        if link.dev().is_present() {
            arrows.push(ARROW_STYLE_DEV);
        }

        if link.build().is_present() {
            arrows.push(ARROW_STYLE_BUILD);
        }

        if link.normal().is_present() {
            arrows.push(ARROW_STYLE_NORMAL);
        }

        for arrow in arrows {
            let _ = writeln!(mermaid, "    {from_id} {arrow} {to_id}");
        }
    }

    tracing::debug!(size = mermaid.len(), "Mermaid diagram generated");
    mermaid
}

/// Requirements for filtering dependencies in the graph.
#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct"
)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct DependencyRequirement {
    /// Whether to exclude dev-only dependencies
    deny_dev: bool,

    /// Whether to exclude build-only dependencies
    deny_build: bool,

    /// Whether to exclude normal dependencies
    deny_normal: bool,

    /// Whether to include only workspace crates
    only_workspace: bool,
}

impl DependencyRequirement {
    /// Evaluates whether a package link meets the dependency requirements.
    fn eval(self, link: PackageLink) -> bool {
        if self.deny_dev && link.dev().is_present() {
            return false;
        }

        if self.deny_build && link.build().is_present() {
            return false;
        }

        if self.deny_normal && link.normal().is_present() {
            return false;
        }

        if self.only_workspace && (!link.from().in_workspace() || !link.to().in_workspace()) {
            return false;
        }

        true
    }
}

/// A resolver for filtering package dependencies based on defined criteria.
#[derive(Debug, Copy, Clone)]
struct PackageQueryResolver<'a> {
    /// Glob patterns for packages to include (if specified)
    include: Option<&'a GlobSet>,

    /// Glob patterns for packages to exclude (if specified)
    exclude: Option<&'a GlobSet>,

    /// Requirements for filtering dependencies by type and workspace membership
    dependency: DependencyRequirement,
}

impl<'graph> PackageResolver<'graph> for PackageQueryResolver<'_> {
    fn accept(&mut self, _: &PackageQuery<'graph>, link: PackageLink<'graph>) -> bool {
        if let Some(include) = &self.include
            && (!include.is_match(link.from().name()) || !include.is_match(link.to().name()))
        {
            return false;
        }

        if let Some(exclude) = &self.exclude
            && (exclude.is_match(link.from().name()) || exclude.is_match(link.to().name()))
        {
            return false;
        }

        if !self.dependency.eval(link) {
            return false;
        }

        true
    }
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
pub(crate) fn generate_dependency_diagram(
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

    if let Some(root_set) = &root_set
        && root_set.is_empty()
    {
        return Err(Report::new(DependencyDiagramError::RootCrateNotFound(
            root.clone().unwrap_or_else(|| unreachable!()),
        )));
    }

    let resolver = PackageQueryResolver {
        include: include_globset.as_ref(),
        exclude: exclude_globset.as_ref(),
        dependency: DependencyRequirement {
            deny_dev: !include_dev_deps,
            deny_build: !include_build_deps,
            deny_normal: false,
            only_workspace: *workspace_only,
        },
    };

    let mut set = graph
        .query_forward(iter::empty())
        .unwrap_or_else(|error| unreachable!("{error}"))
        .resolve();

    if let Some(root) = &root_set
        && (*root_deps_only || *root_deps_and_dependents)
    {
        tracing::debug!(
            root_deps_only,
            root_deps_and_dependents,
            "Applying root-based filtering",
        );

        set = set.union(
            &root
                .to_package_query(DependencyDirection::Forward)
                .resolve_with(resolver),
        );

        if *root_deps_and_dependents {
            set = set.union(
                &root
                    .to_package_query(DependencyDirection::Reverse)
                    .resolve_with(resolver),
            );
        }
    } else {
        set = set.union(&graph.query_workspace().resolve_with(resolver));
    }

    tracing::info!(packages = set.len(), "Graph has been filtered");

    // Convert the package set to a mermaid diagram
    let diagram = graph_to_mermaid(&set, root.as_deref(), !no_dedup_transitive, *link_mode);

    Ok(diagram)
}
