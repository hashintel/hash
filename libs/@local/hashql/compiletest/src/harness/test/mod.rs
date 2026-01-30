mod discover;

use std::path::PathBuf;

use guppy::graph::{PackageGraph, PackageMetadata};

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
pub(crate) struct Spec {
    pub suite: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EntryPoint<'graph> {
    pub path: PathBuf,
    pub metadata: PackageMetadata<'graph>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TestCase {
    pub spec: Spec,
    pub path: PathBuf,
    pub namespace: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TestGroup<'graph> {
    pub entry: EntryPoint<'graph>,
    pub cases: Vec<TestCase>,
}

pub(crate) struct TestCorpus<'graph> {
    pub groups: Vec<TestGroup<'graph>>,
}

impl<'graph> TestCorpus<'graph> {
    pub fn discover(graph: &'graph PackageGraph) -> Self {
        let groups = discover::find_tests(graph);
        Self { groups }
    }

    pub fn len(&self) -> usize {
        self.groups.len()
    }

    pub fn cases(&self) -> usize {
        self.groups.iter().map(|group| group.cases.len()).sum()
    }
}
