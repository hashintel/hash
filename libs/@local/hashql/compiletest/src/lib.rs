#![feature(pattern, assert_matches, file_buffered, if_let_guard, decl_macro)]
extern crate alloc;

use std::{
    io::{Write as _, stderr, stdout},
    path::PathBuf,
};

use anstyle::{AnsiColor, Color, Style};
use guppy::{
    MetadataCommand,
    graph::{PackageGraph, PackageMetadata},
};
use indicatif::ProgressStyle;
use prodash::Root as _;
use tracing::info_span;
use tracing_indicatif::span_ext::IndicatifSpanExt as _;

use self::{
    annotation::file::FileAnnotations,
    executor::{TrialContext, TrialSet},
    reporter::{Reporter, header},
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
    pub fn run(self) {
        let reporter = Reporter::install();

        let mut command = MetadataCommand::new();
        let graph = PackageGraph::from_command(&mut command).expect("failed to load package graph");

        let tests = find::find_tests(&graph);

        let mut trials = TrialSet::from_test(tests);

        if let Some(filter) = self.filter {
            trials.filter(filter, &graph);
        }

        match self.command {
            Command::Run { bless } => {
                let length = trials.len();
                let ignored = trials.ignored();

                header!({reporter: reporter, length: length, ignored: ignored});

                let result = trials.run(&TrialContext { bless });

                todo!("we need to actually report the errors")
            }
            Command::List => {
                trials
                    .list(&stdout())
                    .expect("should be able to write to stdout");
            }
        }
    }
}
