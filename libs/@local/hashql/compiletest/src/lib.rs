//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    pattern,
    assert_matches,
    file_buffered,
    if_let_guard,
    decl_macro,
    lock_value_accessors
)]
extern crate alloc;

use std::{io::stdout, path::PathBuf, process::exit};

use guppy::{
    MetadataCommand,
    graph::{PackageGraph, PackageMetadata},
};

use self::{
    annotation::file::FileAnnotations,
    executor::{TrialContext, TrialSet},
    reporter::{Reporter, Statistics, Summary, setup_progress_header},
    suite::Suite,
};

mod annotation;
mod executor;
mod find;
mod reporter;
mod styles;
mod suite;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
struct Spec {
    suite: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TestCase {
    pub spec: Spec,
    pub path: PathBuf,
    pub namespace: Vec<String>,
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

pub enum Command {
    Run { bless: bool },
    List,
}

pub struct Options {
    pub filter: Option<String>,
    pub command: Command,
}

impl Options {
    /// Runs the specified command with the given options.
    ///
    /// # Panics
    ///
    /// - Failed to load package graph
    /// - Unable to write to stdout or stderr
    /// - Unable to report errors
    pub fn run(self) {
        let reporter = Reporter::install();

        let mut command = MetadataCommand::new();
        let graph = PackageGraph::from_command(&mut command).expect("failed to load package graph");

        let tests = find::find_tests(&graph);
        let statistics = Statistics::new();

        let mut trials = TrialSet::from_test(tests, &statistics);

        if let Some(filter) = self.filter {
            trials.filter(filter, &graph);
        }

        match self.command {
            Command::Run { bless } => {
                let total = trials.len();
                let ignored = trials.ignored();

                setup_progress_header!(reporter, Summary { total, ignored }, statistics);

                let reports = trials.run(&TrialContext { bless });
                let failures = reports.len();

                tracing::info!(
                    success = total - failures,
                    failures = failures,
                    "finished trial execution"
                );

                Reporter::report_errors(reports).expect("should be able to report errors");

                if failures > 0 {
                    exit(1);
                }
            }
            Command::List => {
                trials
                    .list(&stdout())
                    .expect("should be able to write to stdout");
            }
        }
    }
}
