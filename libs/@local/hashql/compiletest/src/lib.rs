#![feature(pattern, assert_matches, file_buffered, if_let_guard, decl_macro)]
extern crate alloc;

use std::path::PathBuf;

use guppy::graph::PackageMetadata;

use self::{annotation::file::FileAnnotations, suite::Suite};

mod annotation;
mod executor;
mod find;
mod suite;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
struct Spec {
    suite: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TestCase {
    pub spec: Spec,
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TestGroup<'graph> {
    pub entry: EntryPoint<'graph>,
    pub cases: Vec<TestCase>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EntryPoint<'graph> {
    pub path: PathBuf,
    pub metadata: PackageMetadata<'graph>,
}
