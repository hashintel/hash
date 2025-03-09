//! Utilities for generating dependency diagrams.
//!
//! This module provides functionality for generating Mermaid diagrams of Rust crate
//! dependencies within a workspace.

use alloc::collections::{BTreeMap, BTreeSet, VecDeque};
use core::error::Error;

use cargo_metadata::{CargoOpt, DependencyKind, MetadataCommand, PackageId};
use error_stack::{Report, ResultExt as _};
use globset::{Glob, GlobSet, GlobSetBuilder};
use petgraph::{
    graph::{DiGraph, NodeIndex},
    visit::EdgeRef as _,
};
use tracing::{debug, info, instrument, trace, warn};

/// Errors that can occur during dependency diagram generation.
#[derive(Debug, derive_more::Display)]
pub enum DependencyDiagramError {
    /// Indicates a failure when running the cargo metadata command.
    #[display("Failed to execute cargo metadata: {_0}")]
    CargoMetadata(String),

    /// Indicates a failure when writing the output file.
    #[display("Failed to write output file")]
    FileWrite,

    /// Indicates a failure when creating a glob pattern.
    #[display("Failed to create glob pattern")]
    GlobPattern,

    /// Indicates that the specified root crate was not found in the dependency graph.
    #[display("Root crate '{_0}' not found in dependency graph")]
    RootCrateNotFound(String),
}

impl Error for DependencyDiagramError {}

/// A directed graph representing crate dependencies.
///
/// Nodes in the graph are crate names (as [`String`]), and edges represent
/// dependencies with the dependency type (normal, dev, build) as the edge weight.
/// Uses [`petgraph::graph::DiGraph`] as the underlying implementation.
type DependencyGraph = DiGraph<String, String>;

/// A mapping from crate names to their dependencies with type information.
///
/// Maps crate names to vectors of tuples containing dependency information.
/// Each tuple contains (`dependency_name`, `dependency_type`), where `dependency_type`
/// is one of `"normal"`, `"dev"`, or `"build"`.
///
/// Using [`BTreeMap`] for deterministic ordering during serialization and iteration.
#[derive(Debug, Default, Clone)]
pub struct CrateDependencyMap(BTreeMap<String, Vec<(String, String)>>);

impl CrateDependencyMap {
    /// Inserts a mapping from a crate to its dependencies.
    fn insert(&mut self, crate_name: String, dependencies: Vec<(String, String)>) {
        self.0.insert(crate_name, dependencies);
    }

    /// Returns an iterator over the entries in the map.
    fn iter(&self) -> impl Iterator<Item = (&String, &Vec<(String, String)>)> {
        self.0.iter()
    }

    /// Returns an iterator over the keys (crate names) in the map.
    fn keys(&self) -> impl Iterator<Item = &String> {
        self.0.keys()
    }
}

/// A set of workspace crate names for efficient lookups.
///
/// Stores crate names that are part of the current workspace for filtering
/// dependencies and determining which crates to include in the diagram.
///
/// Using [`BTreeSet`] to ensure consistent ordering for deterministic output.
#[derive(Debug, Default, Clone)]
pub struct WorkspaceCrateSet(BTreeSet<String>);

impl WorkspaceCrateSet {
    /// Inserts a crate name into the set.
    fn insert(&mut self, crate_name: String) {
        self.0.insert(crate_name);
    }

    /// Checks if the set contains a given crate name.
    fn contains(&self, crate_name: &str) -> bool {
        self.0.contains(crate_name)
    }

    /// Returns the number of crates in the set.
    fn len(&self) -> usize {
        self.0.len()
    }
}

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
}

/// Executes `cargo metadata` to gather dependency information for the workspace.
///
/// Runs the cargo metadata command with all features enabled and returns the metadata,
/// which includes information about packages, their dependencies, and workspace structure.
///
/// # Errors
///
/// - [`DependencyDiagramError::CargoMetadata`] if the cargo metadata command fails to execute
///
/// # Performance
///
/// This function calls an external command and may take several seconds to complete
/// depending on the size of the workspace and its dependencies.
#[instrument(level = "debug")]
fn get_cargo_metadata() -> Result<cargo_metadata::Metadata, Report<DependencyDiagramError>> {
    debug!("Running cargo metadata to gather dependency information");

    let metadata = MetadataCommand::new()
        .features(CargoOpt::AllFeatures)
        .exec()
        .map_err(|err| Report::new(DependencyDiagramError::CargoMetadata(err.to_string())))?;

    debug!(
        package_count = metadata.packages.len(),
        workspace_members = metadata.workspace_members.len(),
        "Completed cargo metadata command"
    );

    Ok(metadata)
}

/// Extracts workspace crate information from cargo metadata.
///
/// Processes the cargo metadata to identify which packages are part of the
/// workspace. This is used later to filter dependencies to only include
/// workspace crates (excluding external dependencies).
///
/// Returns a [`WorkspaceCrateSet`] containing all crate names in the workspace
/// for efficient lookup during dependency processing.
///
/// # Performance
///
/// This function has O(n) complexity where n is the number of packages
/// in the entire dependency tree (including non-workspace packages).
#[instrument(level = "debug", skip(metadata))]
fn extract_workspace_crates(metadata: &cargo_metadata::Metadata) -> WorkspaceCrateSet {
    debug!("Processing workspace members and packages...");

    // Convert workspace member IDs to a set for faster lookups
    let workspace_member_ids: BTreeSet<_> = metadata.workspace_members.iter().collect();
    debug!(
        count = workspace_member_ids.len(),
        "Found workspace members"
    );

    // Create a set of workspace crate names for filtering dependencies
    let mut workspace_crates = WorkspaceCrateSet::default();
    for package in &metadata.packages {
        if workspace_member_ids.contains(&package.id) {
            workspace_crates.insert(package.name.clone());
        }
    }
    debug!(count = workspace_crates.len(), "Found workspace crates");

    workspace_crates
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
#[instrument(level = "debug", skip(patterns))]
fn create_glob_set(
    patterns: &[String],
    is_include: bool,
) -> Result<Option<GlobSet>, Report<DependencyDiagramError>> {
    if patterns.is_empty() {
        debug!(
            "No {} patterns specified",
            if is_include { "include" } else { "exclude" }
        );
        return Ok(None);
    }

    debug!(
        patterns = ?patterns,
        "Creating {} glob set",
        if is_include { "include" } else { "exclude" }
    );

    let mut builder = GlobSetBuilder::new();

    for pattern in patterns {
        debug!(
            pattern,
            "Adding {} pattern",
            if is_include { "include" } else { "exclude" }
        );
        let glob = Glob::new(pattern).change_context(DependencyDiagramError::GlobPattern)?;
        builder.add(glob);
    }

    let globset = builder
        .build()
        .change_context(DependencyDiagramError::GlobPattern)?;
    debug!(
        "{} glob set created successfully",
        if is_include { "Include" } else { "Exclude" }
    );

    Ok(Some(globset))
}

/// Processes workspace packages to extract their dependencies.
///
/// Analyzes the cargo metadata to extract dependencies between workspace crates.
/// Only includes dependencies that are part of the workspace (excludes external crates).
/// Filters crates based on the provided include patterns and categorizes
/// dependencies by their type (normal, dev, build).
///
/// Returns a [`CrateDependencyMap`] mapping crate names to their dependencies,
/// where each dependency is a tuple of (dependency_name, dependency_type).
///
/// # Arguments
///
/// * `metadata` - Cargo metadata containing package information
/// * `workspace_crates` - Set of crate names that are part of the workspace
/// * `workspace_member_ids` - Set of package IDs that are workspace members
/// * `include_globset` - Optional glob set for filtering included crates
/// * `include_dev_deps` - Whether to include dev dependencies
/// * `include_build_deps` - Whether to include build dependencies
///
/// # Performance
///
/// This function has O(n * m) complexity where n is the number of packages
/// in the workspace and m is the average number of dependencies per package.
#[instrument(level = "debug", skip(metadata, workspace_crates, include_globset))]
fn process_dependencies(
    metadata: &cargo_metadata::Metadata,
    workspace_crates: &WorkspaceCrateSet,
    workspace_member_ids: &BTreeSet<&PackageId>,
    include_globset: Option<&GlobSet>,
    include_dev_deps: bool,
    include_build_deps: bool,
) -> CrateDependencyMap {
    trace!(count = metadata.packages.len(), "Processing packages");

    // Create a mapping of crate names to their dependencies with type information
    // Using BTreeMap to ensure consistent ordering for deterministic output
    let mut crate_deps = CrateDependencyMap::default();

    for package in &metadata.packages {
        // Only process workspace packages
        if !workspace_member_ids.contains(&package.id) {
            continue;
        }

        let name = &package.name;

        // Filter for included crates if specified
        if let Some(include_set) = include_globset {
            if !include_set.is_match(name) {
                debug!(crate_name = %name, "Excluding crate (not matched by include patterns)");
                continue;
            }
            debug!(crate_name = %name, "Crate matched include pattern");
        }

        trace!(name = %name, "Processing crate");

        // Store dependencies categorized by type
        let mut normal_deps = Vec::new();
        let mut dev_deps = Vec::new();
        let mut build_deps = Vec::new();

        trace!(count = package.dependencies.len(), "Found dependencies");

        for dep in &package.dependencies {
            let dep_name = &dep.name;

            // Process dependency based on its kind
            match dep.kind {
                DependencyKind::Development if !include_dev_deps => {
                    trace!(dependency = %dep_name, "Skipping dev dependency");
                    continue;
                }
                DependencyKind::Build if !include_build_deps => {
                    trace!(dependency = %dep_name, "Skipping build dependency");
                    continue;
                }
                _ => {}
            }

            // Only include workspace dependencies (excluding external crates)
            if workspace_crates.contains(dep_name) {
                debug!(dependency = %dep_name, kind = ?dep.kind, "Adding workspace dependency");
                match dep.kind {
                    DependencyKind::Development => dev_deps.push(dep_name.clone()),
                    DependencyKind::Build => build_deps.push(dep_name.clone()),
                    _ => normal_deps.push(dep_name.clone()),
                }
            }
        }

        // Combine all dependencies with their type information
        let total_deps = normal_deps.len() + dev_deps.len() + build_deps.len();
        let mut dependencies = Vec::with_capacity(total_deps);

        // Add each type of dependency with its type label
        dependencies.extend(
            normal_deps
                .into_iter()
                .map(|dep| (dep, "normal".to_owned())),
        );
        dependencies.extend(dev_deps.into_iter().map(|dep| (dep, "dev".to_owned())));
        dependencies.extend(build_deps.into_iter().map(|dep| (dep, "build".to_owned())));

        if dependencies.is_empty() {
            trace!(crate_name = %name, "No dependencies found");
        } else {
            trace!(crate_name = %name, dependency_count = dependencies.len(), "Adding crate with dependencies");
        }

        // Add the crate to the dependency map (with or without dependencies)
        crate_deps.insert(name.clone(), dependencies);
    }

    crate_deps
}

/// Builds a dependency graph from the crate dependency map.
///
/// Creates a directed graph where nodes are crates and edges represent dependencies,
/// with edge weights indicating the dependency type (normal, dev, or build).
/// Applies exclude filters to omit crates that match the exclude patterns.
///
/// Returns a tuple containing:
/// - The [`DependencyGraph`] with crate names as nodes and dependency types as edge weights
/// - A mapping of crate names to their node indices for easy lookup
///
/// # Arguments
///
/// * `crate_deps` - Mapping of crate names to their dependencies
/// * `exclude_globset` - Optional glob set for filtering excluded crates
///
/// # Performance
///
/// This function has O(n + e) complexity, where n is the number of crates and
/// e is the number of dependencies between them.
#[instrument(level = "debug", skip(crate_deps, exclude_globset))]
fn build_dependency_graph(
    crate_deps: &CrateDependencyMap,
    exclude_globset: Option<&GlobSet>,
) -> (DependencyGraph, BTreeMap<String, NodeIndex>) {
    let mut graph = DependencyGraph::new();
    // Using BTreeMap for deterministic indexing
    let mut node_indices = BTreeMap::new();

    // First, add all crates as nodes (except excluded ones)
    debug!("Adding nodes to dependency graph");
    let mut included_count = 0;
    let mut excluded_count = 0;

    for crate_name in crate_deps.keys() {
        // Skip excluded crates
        if let Some(exclude_set) = exclude_globset {
            if exclude_set.is_match(crate_name) {
                debug!(
                    crate_name,
                    "Skipping excluded crate (matched exclude pattern)"
                );
                excluded_count += 1;
                continue;
            }
        }

        debug!(crate_name, "Adding crate to graph");
        let node_idx = graph.add_node(crate_name.to_owned());
        node_indices.insert(crate_name.to_owned(), node_idx);
        included_count += 1;
    }

    debug!(
        included_count,
        excluded_count,
        total = included_count + excluded_count,
        "Added nodes to dependency graph"
    );

    // Then, add all dependencies as edges with dependency type info
    debug!("Adding edges to dependency graph");
    let mut edge_count = 0;
    let mut skipped_edges = 0;

    for (crate_name, deps) in crate_deps.iter() {
        // Skip if the source crate is excluded
        if let Some(exclude_set) = exclude_globset {
            if exclude_set.is_match(crate_name) {
                debug!(crate_name, "Skipping edges from excluded crate");
                skipped_edges += deps.len();
                continue;
            }
        }

        if let Some(&from_idx) = node_indices.get(crate_name) {
            for (dep, dep_type) in deps {
                // Skip if the dependency is excluded
                if let Some(exclude_set) = exclude_globset {
                    if exclude_set.is_match(dep) {
                        debug!(from = %crate_name, to = %dep, "Skipping edge to excluded crate");
                        skipped_edges += 1;
                        continue;
                    }
                }

                if let Some(&to_idx) = node_indices.get(dep) {
                    // Add an edge from the crate to its dependency with type information
                    // (note: in petgraph, edges point from parent to child)
                    debug!(
                        from = %crate_name,
                        to = %dep,
                        dep_type,
                        "Adding dependency edge"
                    );
                    graph.add_edge(from_idx, to_idx, dep_type.clone());
                    edge_count += 1;
                } else {
                    debug!(
                        from = %crate_name,
                        to = %dep,
                        "Skipping edge - target crate not found in graph"
                    );
                    skipped_edges += 1;
                }
            }
        } else {
            debug!(
                crate_name,
                "Skipping edges - source crate not found in graph"
            );
            skipped_edges += deps.len();
        }
    }

    debug!(
        edge_count,
        skipped_edges,
        total = edge_count + skipped_edges,
        "Added edges to dependency graph"
    );

    (graph, node_indices)
}

/// Filters the graph to show only dependencies of a specific root crate.
///
/// Uses breadth-first search to find all transitive dependencies of the root crate
/// and creates a new filtered graph containing only those dependencies. The resulting
/// graph includes the root crate and all its direct and indirect dependencies.
///
/// If the root crate is not found in the graph, returns a clone of the original graph
/// and logs a warning.
///
/// # Arguments
///
/// * `graph` - The full dependency graph to filter
/// * `node_indices` - Mapping of crate names to their node indices in the graph
/// * `root_crate` - The name of the root crate to filter dependencies for
///
/// # Returns
///
/// A new [`DependencyGraph`] containing only the root crate and its dependencies.
/// If the root crate is not found, returns a clone of the original graph.
///
/// # Performance
///
/// This function performs a breadth-first traversal with O(n + e) complexity,
/// where n is the number of nodes and e is the number of edges in the graph.
#[instrument(level = "debug", skip(graph, node_indices))]
fn filter_to_root_dependencies(
    graph: &DependencyGraph,
    node_indices: &BTreeMap<String, NodeIndex>,
    root_crate: &str,
) -> Result<DependencyGraph, Report<DependencyDiagramError>> {
    debug!(
        root_crate,
        "Filtering to show only dependencies of root crate"
    );

    // Find the node index for the root crate
    if let Some(&root_idx) = node_indices.get(root_crate) {
        // Create a new graph for the filtered result
        let mut filtered = DependencyGraph::new();
        let mut filtered_indices = BTreeMap::new();

        // First add the root crate
        let root_node_name = graph
            .node_weight(root_idx)
            .expect("should exist in graph")
            .clone();
        let new_root_idx = filtered.add_node(root_node_name);
        filtered_indices.insert(root_idx, new_root_idx);

        // Breadth-first traversal to find all dependencies
        let mut visited = BTreeSet::new();
        let mut queue = VecDeque::new();

        // Start with the root crate
        queue.push_back(root_idx);
        visited.insert(root_idx);

        debug!("Starting breadth-first traversal from root crate");
        let mut nodes_added = 1; // Root node already added
        let mut edges_added = 0;

        while let Some(current_idx) = queue.pop_front() {
            let current_name = graph
                .node_weight(current_idx)
                .expect("should exist in graph");
            debug!(crate_name = %current_name, "Processing dependencies");

            // Get all outgoing edges (dependencies)
            for edge in graph.edges(current_idx) {
                let dep_idx = edge.target();
                let dep_name = graph
                    .node_weight(dep_idx)
                    .expect("should exist in graph")
                    .clone();

                // Add the dependency node to the filtered graph if not already added
                let dep_filtered_idx = if let Some(&idx) = filtered_indices.get(&dep_idx) {
                    debug!(crate_name = %dep_name, "Dependency already in filtered graph");
                    idx
                } else {
                    debug!(crate_name = %dep_name, "Adding dependency to filtered graph");
                    let new_idx = filtered.add_node(dep_name.clone());
                    filtered_indices.insert(dep_idx, new_idx);
                    nodes_added += 1;
                    new_idx
                };

                // Add the edge to the filtered graph
                if let Some(&from_idx) = filtered_indices.get(&current_idx) {
                    let edge_weight = edge.weight().clone();
                    debug!(
                        from = %current_name,
                        to = %dep_name,
                        dep_type = %edge_weight,
                        "Adding edge to filtered graph"
                    );
                    filtered.add_edge(from_idx, dep_filtered_idx, edge_weight);
                    edges_added += 1;
                }

                // Add to queue if not visited
                if visited.insert(dep_idx) {
                    debug!(crate_name = %dep_name, "Adding dependency to BFS queue");
                    queue.push_back(dep_idx);
                }
            }
        }

        debug!(
            nodes_added,
            edges_added, "Finished filtering graph to root crate dependencies"
        );
        Ok(filtered)
    } else {
        Err(Report::new(DependencyDiagramError::RootCrateNotFound(
            root_crate.to_owned(),
        )))
    }
}

/// Filters the graph to show dependencies and dependents of a specific root crate.
///
/// Uses breadth-first search to find:
/// 1. All transitive dependencies of the root crate (crates that the root depends on)
/// 2. All transitive dependents of the root crate (crates that depend on the root)
///
/// The resulting graph includes the root crate, all its dependencies, and all crates
/// that depend on it (directly or indirectly).
///
/// If the root crate is not found in the graph, returns a clone of the original graph
/// and logs a warning.
///
/// # Arguments
///
/// * `graph` - The full dependency graph to filter
/// * `node_indices` - Mapping of crate names to their node indices in the graph
/// * `root_crate` - The name of the root crate to filter dependencies for
///
/// # Returns
///
/// A new [`DependencyGraph`] containing the root crate, its dependencies, and its dependents.
/// If the root crate is not found, returns a clone of the original graph.
///
/// # Performance
///
/// This function performs two breadth-first traversals with O(n + e) complexity each,
/// where n is the number of nodes and e is the number of edges in the graph.
#[instrument(level = "debug", skip(graph, node_indices))]
fn filter_to_root_dependencies_and_dependents(
    graph: &DependencyGraph,
    node_indices: &BTreeMap<String, NodeIndex>,
    root_crate: &str,
) -> Result<DependencyGraph, Report<DependencyDiagramError>> {
    debug!(
        root_crate,
        "Filtering to show dependencies and dependents of root crate"
    );

    // Find the node index for the root crate
    if let Some(&root_idx) = node_indices.get(root_crate) {
        // Create a new graph for the filtered result
        let mut filtered = DependencyGraph::new();
        let mut filtered_indices = BTreeMap::new();

        // First add the root crate
        let root_node_name = graph
            .node_weight(root_idx)
            .expect("should exist in graph")
            .clone();
        let new_root_idx = filtered.add_node(root_node_name);
        filtered_indices.insert(root_idx, new_root_idx);

        // Set up for breadth-first traversal
        let mut visited = BTreeSet::new();
        let mut queue = VecDeque::new();

        // Start with the root crate
        queue.push_back(root_idx);
        visited.insert(root_idx);

        debug!("Starting breadth-first traversal for dependencies of root crate");
        let mut nodes_added = 1; // Root node already added
        let mut edges_added = 0;

        // BFS to find all dependencies (outgoing edges from root)
        while let Some(current_idx) = queue.pop_front() {
            let current_name = graph
                .node_weight(current_idx)
                .expect("should exist in graph");
            debug!(crate_name = %current_name, "Processing dependencies");

            // Process all outgoing edges (dependencies)
            for edge in graph.edges(current_idx) {
                let dep_idx = edge.target();
                let dep_name = graph
                    .node_weight(dep_idx)
                    .expect("should exist in graph")
                    .clone();

                // Add the dependency node to the filtered graph if not already added
                let dep_filtered_idx = if let Some(&idx) = filtered_indices.get(&dep_idx) {
                    debug!(crate_name = %dep_name, "Dependency already in filtered graph");
                    idx
                } else {
                    debug!(crate_name = %dep_name, "Adding dependency to filtered graph");
                    let new_idx = filtered.add_node(dep_name.clone());
                    filtered_indices.insert(dep_idx, new_idx);
                    nodes_added += 1;
                    new_idx
                };

                // Add the edge to the filtered graph
                if let Some(&from_idx) = filtered_indices.get(&current_idx) {
                    let edge_weight = edge.weight().clone();
                    debug!(
                        from = %current_name,
                        to = %dep_name,
                        dep_type = %edge_weight,
                        "Adding edge to filtered graph"
                    );
                    filtered.add_edge(from_idx, dep_filtered_idx, edge_weight);
                    edges_added += 1;
                }

                // Add to queue if not visited
                if visited.insert(dep_idx) {
                    debug!(crate_name = %dep_name, "Adding dependency to BFS queue");
                    queue.push_back(dep_idx);
                }
            }
        }

        // BFS to find all dependents (crates that depend on the root - incoming edges)
        // Reset visited set and queue for the second traversal
        visited.clear();
        queue.clear();
        queue.push_back(root_idx);
        visited.insert(root_idx);

        debug!("Starting breadth-first traversal for dependents of root crate");

        // This second BFS is to find all dependents (crates that depend on the root)
        while let Some(current_idx) = queue.pop_front() {
            let current_name = graph
                .node_weight(current_idx)
                .expect("should exist in graph");
            debug!(crate_name = %current_name, "Processing dependents");

            // Find all incoming edges to the current node (crates that depend on it)
            // We need to iterate over all edges to find ones that target the current node
            for edge in graph.edge_references() {
                let from_idx = edge.source();
                let to_idx = edge.target();

                // Skip if this edge doesn't point to the current node
                if to_idx != current_idx {
                    continue;
                }

                let from_name = graph
                    .node_weight(from_idx)
                    .expect("should exist in graph")
                    .clone();

                // Add the dependent node to the filtered graph if not already added
                let from_filtered_idx = if let Some(&idx) = filtered_indices.get(&from_idx) {
                    debug!(crate_name = %from_name, "Dependent already in filtered graph");
                    idx
                } else {
                    debug!(crate_name = %from_name, "Adding dependent to filtered graph");
                    let new_idx = filtered.add_node(from_name.clone());
                    filtered_indices.insert(from_idx, new_idx);
                    nodes_added += 1;
                    new_idx
                };

                // Add the edge to the filtered graph (from the dependent to the current node)
                if let Some(&to_idx) = filtered_indices.get(&current_idx) {
                    let edge_weight = edge.weight().clone();
                    debug!(
                        from = %from_name,
                        to = %current_name,
                        dep_type = %edge_weight,
                        "Adding incoming edge to filtered graph"
                    );
                    filtered.add_edge(from_filtered_idx, to_idx, edge_weight);
                    edges_added += 1;
                }

                // Add to queue if not visited
                if visited.insert(from_idx) {
                    debug!(crate_name = %from_name, "Adding dependent to BFS queue");
                    queue.push_back(from_idx);
                }
            }
        }

        debug!(
            nodes_added,
            edges_added, "Finished filtering graph to root crate dependencies and dependents"
        );
        Ok(filtered)
    } else {
        Err(Report::new(DependencyDiagramError::RootCrateNotFound(
            root_crate.to_owned(),
        )))
    }
}

/// Converts a dependency graph to a Mermaid diagram format.
///
/// Takes a dependency graph and generates Mermaid diagram syntax for visualization.
/// The diagram represents crate dependencies with different arrow styles based on
/// dependency type and highlights the root crate with a thicker border.
///
/// The diagram uses:
/// - Normal dependencies: solid arrow (`-->`)
/// - Dev dependencies: dotted arrow (`-.->`)
/// - Build dependencies: dashed arrow (`--->`),
/// - Root crate dependencies and dependents: bold arrow (`==>`)
///
/// Root crates are highlighted with a thicker border (3px vs 1px for normal crates)
/// and displayed without a documentation link. Both dependencies of the root crate
/// (outgoing arrows) and dependents of the root crate (incoming arrows) are shown
/// with bold arrows for better visibility.
///
/// # Arguments
///
/// * `graph` - The dependency graph where nodes are crate names and edges represent dependency
///   relationships
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
/// This function performs multiple passes over the graph to generate the diagram:
/// - One pass to create node representations - O(n) where n is the number of nodes
/// - One pass to identify transitive edges (if `dedup_transitive` is `true`) - O(n³) in the worst
///   case where n is the number of nodes
/// - One pass to create edge representations - O(e) where e is the number of edges
///
/// For large graphs with many nodes, deduplication of transitive edges can become
/// computationally expensive. Consider disabling it for very large graphs.
#[instrument(level = "debug", skip(graph))]
fn graph_to_mermaid(
    graph: &DependencyGraph,
    root_crate: Option<&str>,
    dedup_transitive: bool,
    link_mode: LinkMode,
) -> String {
    debug!(
        node_count = graph.node_count(),
        edge_count = graph.edge_count(),
        root_crate = ?root_crate,
        dedup_transitive,
        link_mode = ?link_mode,
        "Generating Mermaid diagram"
    );
    let mut mermaid = vec![
        "graph TD".to_owned(),
        "    linkStyle default stroke-width:1.5px".to_owned(),
        "    classDef default stroke-width:1px".to_owned(),
        "    classDef root stroke-width:3px".to_owned(),
        "    classDef dev stroke-width:1px".to_owned(),
        "    classDef build stroke-width:1px".to_owned(),
        "    %% Legend".to_owned(),
        "    %% --> : Normal dependency".to_owned(),
        "    %% -.-> : Dev dependency".to_owned(),
        "    %% ---> : Build dependency".to_owned(),
    ];

    // First, create a mapping of node indices to sanitized IDs for Mermaid
    // Using BTreeMap for stable ordering
    let mut node_to_id = BTreeMap::new();
    for node_idx in graph.node_indices() {
        let _crate_name = graph
            .node_weight(node_idx)
            .expect("node should have a weight (crate name)");
        // Use the node index as a simple, unique ID for the node in the diagram
        node_to_id.insert(node_idx, node_idx.index());
    }

    // Create nodes for all crates in the graph
    for node_idx in graph.node_indices() {
        let crate_name = graph
            .node_weight(node_idx)
            .expect("node should have a weight (crate name)");
        let node_id = node_to_id[&node_idx];

        let is_root = Some(crate_name.as_str()) == root_crate;
        let create_link = match link_mode {
            LinkMode::All => true,
            LinkMode::NonRoots => !is_root,
            LinkMode::None => false,
        };

        if create_link {
            // Create a documentation link
            let doc_path = format!("../{}/index.html", crate_name.replace('-', "_"));
            mermaid.push(format!(
                "    {node_id}[<a href=\"{doc_path}\">{crate_name}</a>]"
            ));
        } else {
            // Just display the name without a link
            mermaid.push(format!("    {node_id}[{crate_name}]"));
        }

        // Apply the root class if this is the root crate
        if is_root {
            mermaid.push(format!("    class {node_id} root"));
        }
    }

    // Find and mark transitive dependencies if deduplication is enabled
    // Using BTreeSet for stable ordering of edge processing
    let mut transitive_edges = BTreeSet::new();
    if dedup_transitive {
        // Identify transitive edges to skip
        for node_idx in graph.node_indices() {
            // For each node, find paths of length 2 (i.e., A->B->C means A->C is transitive)
            for neighbor_idx in graph.neighbors(node_idx) {
                for transitive_idx in graph.neighbors(neighbor_idx) {
                    // If there's a direct edge from node_idx to transitive_idx, it's transitive
                    if graph.contains_edge(node_idx, transitive_idx) {
                        transitive_edges.insert((node_idx, transitive_idx));
                        debug!(
                            from = %graph.node_weight(node_idx)
                                .expect("node should have a weight (crate name)"),
                            to = %graph.node_weight(transitive_idx)
                                .expect("node should have a weight (crate name)"),
                            via = %graph.node_weight(neighbor_idx)
                                .expect("node should have a weight (crate name)"),
                            "Identified transitive edge"
                        );
                    }
                }
            }
        }
    }

    // Add edges (dependencies)
    for edge in graph.edge_references() {
        let from_idx = edge.source();
        let to_idx = edge.target();

        // Skip transitive edges if deduplication is enabled
        if dedup_transitive && transitive_edges.contains(&(from_idx, to_idx)) {
            debug!(
                from = %graph.node_weight(from_idx)
                    .expect("node should have a weight (crate name)"),
                to = %graph.node_weight(to_idx)
                    .expect("node should have a weight (crate name)"),
                "Skipping transitive edge"
            );
            continue;
        }

        let from_id = node_to_id[&from_idx];
        let to_id = node_to_id[&to_idx];
        let to_name = graph
            .node_weight(to_idx)
            .expect("node should have a weight (crate name)");
        let from_name = graph
            .node_weight(from_idx)
            .expect("node should have a weight (crate name)");

        debug!(from = %from_name, to = %to_name, "Adding edge");

        // Get the dependency type from the edge
        let edge_type = edge.weight();

        // Determine the arrow style based on dependency type
        let arrow_style = match edge_type.as_str() {
            "dev" => "-.->",   // Dotted line for dev dependencies
            "build" => "--->", // Dashed line for build dependencies
            _ => "-->",        // Standard arrow for normal dependencies
        };

        // Add the edge with the appropriate arrow style
        mermaid.push(format!("    {from_id} {arrow_style} {to_id}"));
    }

    mermaid.join("\n")
}

/// Generates a Mermaid diagram for crate dependencies in the workspace.
///
/// This is the main entry point for the diagram generation functionality. It orchestrates
/// the entire process of generating a Mermaid dependency diagram:
/// 1. Gathers metadata from cargo
/// 2. Processes workspace crates and their dependencies
/// 3. Builds and filters the dependency graph
/// 4. Generates the Mermaid diagram
///
/// # Errors
///
/// - [`DependencyDiagramError::CargoMetadata`] if gathering cargo metadata fails
/// - [`DependencyDiagramError::GlobPattern`] if creating glob patterns fails
/// - [`DependencyDiagramError::RootCrateNotFound`] if the specified root crate is not found in the
///   dependency graph
#[instrument(
    level = "debug",
    skip(config),
    fields(
        root = ?config.root,
        include = ?config.include,
        exclude = ?config.exclude,
        root_deps_only = config.root_deps_only,
        root_deps_and_dependents = config.root_deps_and_dependents,
        include_dev_deps = config.include_dev_deps,
        include_build_deps = config.include_build_deps,
        link_mode = ?config.link_mode
    )
)]
pub fn generate_dependency_diagram(
    config: &DependencyDiagramConfig,
) -> Result<String, Report<DependencyDiagramError>> {
    info!(
        root_crate = ?config.root,
        include_patterns = ?config.include,
        exclude_patterns = ?config.exclude,
        root_deps_only = config.root_deps_only,
        root_deps_and_dependents = config.root_deps_and_dependents,
        dedup_transitive = !config.no_dedup_transitive,
        include_dev_deps = config.include_dev_deps,
        include_build_deps = config.include_build_deps,
        link_mode = ?config.link_mode,
        "Generating dependency diagram"
    );

    // Get cargo metadata
    let metadata = get_cargo_metadata()?;

    // Extract workspace crate information
    let workspace_member_ids: BTreeSet<_> = metadata.workspace_members.iter().collect();
    let workspace_crates = extract_workspace_crates(&metadata);

    // Create glob sets for filtering
    let include_globset = create_glob_set(&config.include, true)?;
    let exclude_globset = create_glob_set(&config.exclude, false)?;

    // Process dependencies
    let crate_deps = process_dependencies(
        &metadata,
        &workspace_crates,
        &workspace_member_ids,
        include_globset.as_ref(),
        config.include_dev_deps,
        config.include_build_deps,
    );

    // Build dependency graph
    let (graph, node_indices) = build_dependency_graph(&crate_deps, exclude_globset.as_ref());

    // Check if the root crate exists when specified
    if let Some(root) = &config.root {
        if !node_indices.contains_key(root) {
            return Err(Report::new(DependencyDiagramError::RootCrateNotFound(
                root.clone(),
            )));
        }
    }

    // Filter graph if needed based on the selected mode
    let filtered_graph = if config.root_deps_only {
        // Filter to show only dependencies of the root crate
        // Safe because root_deps_only requires root to be set and we checked existence above
        let root_crate = config
            .root
            .as_ref()
            .expect("should have a root crate when root_deps_only is true");

        filter_to_root_dependencies(&graph, &node_indices, root_crate)?
    } else if config.root_deps_and_dependents {
        // Filter to show both dependencies and dependents of the root crate
        // Safe because root_deps_and_dependents requires root to be set and we checked existence
        // above
        let root_crate = config
            .root
            .as_ref()
            .expect("should have a root crate when root_deps_and_dependents is true");

        filter_to_root_dependencies_and_dependents(&graph, &node_indices, root_crate)?
    } else {
        debug!("Using complete dependency graph (no filtering)");
        graph
    };

    // Convert the graph to a mermaid diagram
    let diagram = graph_to_mermaid(
        &filtered_graph,
        config.root.as_deref(),
        !config.no_dedup_transitive,
        config.link_mode,
    );

    Ok(diagram)
}
