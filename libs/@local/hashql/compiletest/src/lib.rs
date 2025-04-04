use std::{fs, path::PathBuf, thread};

use radix_trie::Trie;
use snapbox::{dir::Walk, utils::current_dir};
use toml::Table;

mod find;
mod suite;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
struct Spec {
    suite: String,
}

struct TestCase {
    spec: Spec,
    path: PathBuf,
}

struct TestGroup {
    entry: EntryPoint,
    cases: Vec<TestCase>,
}

struct EntryPoint {
    path: PathBuf,
    krate: String,
}
