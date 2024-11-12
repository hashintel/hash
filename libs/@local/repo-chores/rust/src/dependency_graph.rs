use std::collections::{HashMap, HashSet};

use cargo_metadata::{DepKindInfo, Dependency, DependencyKind, Metadata, Package};
use petgraph::{
    Direction, algo::all_simple_paths, stable_graph::StableDiGraph, visit::EdgeRef as _,
};

pub struct Package2<'p> {
    pub name: &'p str,
}

pub struct Dependency2 {
    pub kind: DependencyKind,
}

#[derive(Debug)]
pub struct DependencyGraph<'m> {
    metadata: &'m Metadata,
    dependencies: StableDiGraph<&'m Package, &'m Dependency>,
}

impl<'m> DependencyGraph<'m> {
    /// Create a new dependency graph from the given metadata.
    ///
    /// # Panics
    ///
    /// If the metadata was not resolved
    #[must_use]
    pub fn from_metadata(metadata: &'m Metadata) -> Self {
        let mut dependencies = StableDiGraph::<&Package, &Dependency>::new();

        let packages = metadata
            .packages
            .iter()
            .map(|package| {
                let node_idx = dependencies.add_node(&package);
                (&package.name, node_idx)
            })
            .collect::<HashMap<_, _>>();

        for package in metadata.packages.iter() {
            let source_idx = &packages[&package.name];

            for dependency in package.dependencies.iter() {
                let Some(target_idx) = packages.get(&dependency.name) else {
                    continue;
                };
                dependencies.add_edge(*source_idx, *target_idx, dependency);
            }
        }

        Self {
            metadata,
            dependencies,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&Package, &Package, &Dependency)> {
        self.dependencies.node_indices().flat_map(move |idx| {
            let source = self.dependencies.node_weight(idx);
            self.dependencies
                .neighbors_directed(idx, Direction::Outgoing)
                .filter_map(move |target_idx| {
                    let target = *self.dependencies.node_weight(target_idx)?;
                    let edge = self.dependencies.find_edge(idx, target_idx)?;

                    Some((*source?, target, *self.dependencies.edge_weight(edge)?))
                })
        })
    }

    pub fn filter_workspace(&mut self) {
        let workspace_members = self
            .metadata
            .workspace_packages()
            .iter()
            .map(|package| package.name.as_str())
            .collect::<HashSet<_>>();

        self.dependencies.retain_nodes(|graph, node| {
            let Some(&package) = graph.node_weight(node) else {
                return false;
            };

            workspace_members.contains(package.name.as_str())
        });
    }

    pub fn remove_transitive_dependencies(&mut self) {
        // TODO: Use `dag_transitive_reduction_closure`
        #[expect(clippy::needless_collect, reason = "We modify the graph in the loop")]
        for idx in self.dependencies.node_indices().collect::<Vec<_>>() {
            if !self.dependencies.contains_node(idx) {
                continue;
            }

            let mut outgoing = self
                .dependencies
                .neighbors_directed(idx, Direction::Outgoing)
                .detach();
            while let Some((edge_idx, node_idx)) = outgoing.next(&self.dependencies) {
                // Check if there are any paths from the source to the target with at least one
                // intermediate node.
                let any_paths =
                    all_simple_paths::<Vec<_>, _>(&self.dependencies, idx, node_idx, 1, None)
                        .next()
                        .is_some();

                if any_paths {
                    self.dependencies.remove_edge(edge_idx);
                }
            }
        }
    }

    #[must_use]
    pub fn to_mermaid(&self) -> String {
        let mut mermaid = "graph TD;\n".to_owned();

        for node in self.dependencies.node_indices() {
            let package = self.dependencies.node_weight(node).unwrap();
            let package_name = package.name.replace("-", "_");
            mermaid.push_str(&format!("    {}[\"{}\"];\n", package_name, package_name));
        }

        for (source, target, dependency) in self.iter() {
            let source = source.name.replace("-", "_");
            let target = target.name.replace("-", "_");

            // let label = match dependency.kind {
            //     DepKindInfo::Normal => "normal",
            //     DepKindInfo::Build => "build",
            //     DepKindInfo::Development => "development",
            // };

            let style = if dependency.optional {
                "dotted"
            } else {
                "solid"
            };

            mermaid.push_str(&format!("    {} --> {};\n", source, target));
        }

        mermaid
    }
}

impl<'m> IntoIterator for &'m DependencyGraph<'m> {
    type Item = (&'m Package, &'m Package, &'m Dependency);

    type IntoIter = impl Iterator<Item = Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
