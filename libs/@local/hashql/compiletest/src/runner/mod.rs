use core::sync::atomic::{AtomicBool, Ordering};
use std::{
    backtrace::Backtrace,
    io,
    panic::{self, PanicHookInfo},
    time::Instant,
};

use guppy::{MetadataCommand, graph::PackageGraph};

use self::{reporter::report_errors, ui::tui::Tui};
use crate::{
    OutputFormat,
    harness::{
        test::TestCorpus,
        trial::{TrialContext, TrialCorpus},
    },
};

pub(crate) mod reporter;
pub(crate) mod ui;

static PANICKED: AtomicBool = AtomicBool::new(false);

fn panic_hook(panic_info: &PanicHookInfo) {
    let message = panic_info
        .payload_as_str()
        .map_or_else(|| "Box<dyn Any>".to_owned(), ToOwned::to_owned);

    let location = panic_info.location().map(ToString::to_string);

    let backtrace = Backtrace::force_capture();

    tracing::error!(message, location, %backtrace, "encountered panic");
    PANICKED.store(true, Ordering::SeqCst);
}

pub struct Run {
    pub format: OutputFormat,
    pub bless: bool,
}

pub struct List {
    pub format: OutputFormat,
}

pub struct Suites {
    pub format: OutputFormat,
}

pub enum Command {
    Run(Run),
    List(List),
    Suites(Suites),
}

pub struct Runner {
    pub filter: Option<String>,
    pub quick_filter: bool,
}

impl Runner {
    fn package_graph(&self) -> PackageGraph {
        let mut command = MetadataCommand::new();
        if self.quick_filter {
            // speeds up tests from >600ms to ~40ms
            command.no_deps();
        }

        PackageGraph::from_command(&mut command).expect("failed to load package graph")
    }

    fn test_corpus<'graph>(&self, graph: &'graph PackageGraph) -> TestCorpus<'graph> {
        let now = Instant::now();
        let corpus = TestCorpus::discover(&graph);

        tracing::info!(
            groups = corpus.len(),
            cases = corpus.cases(),
            elapsed = ?now.elapsed(),
            "found {} test groups with {} test cases, in {:?}",
            corpus.len(),
            corpus.cases(),
            now.elapsed()
        );

        corpus
    }

    fn trial_corpus<'graph>(&self, graph: &'graph PackageGraph) -> TrialCorpus<'graph> {
        let corpus = self.test_corpus(graph);

        let corpus_len = corpus.len();
        let corpus_cases = corpus.cases();

        let now = Instant::now();
        let mut corpus = TrialCorpus::from_test(corpus);

        tracing::info!(
            groups = corpus.len(),
            cases = corpus.cases(),
            elapsed = ?now.elapsed(),
            "converted {} ({}) test groups into {} ({}) trial groups, in {:?}",
            corpus_len,
            corpus_cases,
            corpus.len(),
            corpus.cases(),
            now.elapsed()
        );

        if let Some(filter) = self.filter.clone() {
            corpus.filter(filter, graph);
        }

        corpus
    }

    fn execute_run(self, Run { format, bless }: Run) -> io::Result<()> {
        panic::set_hook(Box::new(panic_hook));

        let graph = self.package_graph();
        let context = TrialContext { bless };

        match format {
            OutputFormat::Interactive => {
                let tui = Tui::init();
                let corpus = self.trial_corpus(&graph);
                let total = corpus.cases();

                let reports = tui.run(corpus.to_set(), &context);
                report_errors(reports, total)
            }
            OutputFormat::Human => {
                unimplemented!()
            }
            OutputFormat::Json => {
                unimplemented!()
            }
        }
    }

    fn execute_list(self, List { format }: List) -> io::Result<()> {
        todo!()
    }

    fn execute_suites(self, Suites { format }: Suites) -> io::Result<()> {
        todo!()
    }

    pub fn execute(self, command: Command) -> io::Result<()> {
        match command {
            Command::Run(run) => self.execute_run(run),
            Command::List(list) => self.execute_list(list),
            Command::Suites(suites) => self.execute_suites(suites),
        }
    }
}
