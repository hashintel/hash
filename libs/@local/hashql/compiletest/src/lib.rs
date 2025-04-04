#![feature(pattern, assert_matches, file_buffered, if_let_guard)]
use std::path::PathBuf;

use self::{annotation::file::FileAnnotations, suite::Suite};

mod annotation;
mod executor;
mod find;
mod run;
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
struct TestGroup {
    pub entry: EntryPoint,
    pub cases: Vec<TestCase>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EntryPoint {
    pub path: PathBuf,
    pub krate: String,
}
