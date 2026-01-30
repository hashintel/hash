use core::sync::atomic::{AtomicBool, Ordering};
use std::{
    backtrace::Backtrace,
    io::{self, Write as _, stdout},
    panic::{self, PanicHookInfo},
    process::ExitCode,
    time::Instant,
};

use guppy::{MetadataCommand, graph::PackageGraph};

use self::{
    output::{OutputFormat, escape_json},
    reporter::report_errors,
    ui::{
        common::styles::{CYAN, GRAY},
        human::Human,
        json::Json,
        tui::Tui,
    },
};
use crate::{
    harness::{
        test::TestCorpus,
        trial::{ListTrials, TrialContext, TrialCorpus},
    },
    suite,
};

pub mod cli;
pub(crate) mod output;
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

pub(crate) struct Run {
    pub format: OutputFormat,
    pub bless: bool,
}

pub(crate) struct List {
    pub format: OutputFormat,
}

pub(crate) struct Suites {
    pub format: OutputFormat,
}

pub(crate) enum Command {
    Run(Run),
    List(List),
    Suites(Suites),
}

pub(crate) struct Runner {
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

    fn test_corpus(graph: &PackageGraph) -> TestCorpus<'_> {
        let now = Instant::now();
        let corpus = TestCorpus::discover(graph);

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
        let corpus = Self::test_corpus(graph);

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

    fn execute_run(self, Run { format, bless }: Run) -> io::Result<ExitCode> {
        panic::set_hook(Box::new(panic_hook));

        let graph = self.package_graph();
        let context = TrialContext { bless };

        match format {
            OutputFormat::Interactive => {
                let tui = Tui::init();
                let corpus = self.trial_corpus(&graph);
                let total = corpus.cases();

                let mut set = corpus.to_set();
                set.sort();

                let reports = tui.run(set, &context);
                report_errors(reports, total)
            }
            OutputFormat::Human => {
                let human = Human::init();
                let corpus = self.trial_corpus(&graph);
                let total = corpus.cases();

                let mut set = corpus.to_set();
                set.sort();

                let reports = human.run(set, &context);
                report_errors(reports, total)
            }
            OutputFormat::Json => {
                let json = Json::init();
                let corpus = self.trial_corpus(&graph);
                let total = corpus.cases();

                let mut set = corpus.to_set();
                set.sort();

                let reports = json.run(set, &context);
                report_errors(reports, total)
            }
        }
    }

    fn execute_list(self, List { format }: List) -> io::Result<()> {
        let graph = self.package_graph();

        match format {
            OutputFormat::Human | OutputFormat::Interactive => {
                let _human = Human::init();

                let corpus = self.trial_corpus(&graph);

                ListTrials::new(&stdout(), format).render(&corpus)
            }
            OutputFormat::Json => {
                let _json = Json::init();

                let corpus = self.trial_corpus(&graph);

                ListTrials::new(&stdout(), format).render(&corpus)
            }
        }
    }

    fn execute_suites(Suites { format }: Suites) -> io::Result<()> {
        let mut stdout = stdout();
        let suites = suite::iter();

        match format {
            OutputFormat::Human | OutputFormat::Interactive => {
                let _human = Human::init();

                for suite in suites {
                    writeln!(stdout, "  {CYAN}{}{CYAN:#}", suite.name())?;
                    writeln!(stdout, "      {GRAY}{}{GRAY:#}", suite.description())?;
                }

                Ok(())
            }
            OutputFormat::Json => {
                let _json = Json::init();

                for suite in suites {
                    write!(stdout, r#"{{"name":""#)?;
                    escape_json(&mut stdout, suite.name())?;
                    write!(stdout, r#"","description":""#)?;
                    escape_json(&mut stdout, suite.description())?;
                    writeln!(stdout, r#""}}"#)?;
                }

                Ok(())
            }
        }
    }

    pub(crate) fn execute(self, command: Command) -> io::Result<ExitCode> {
        match command {
            Command::Run(run) => self.execute_run(run),
            Command::List(list) => self.execute_list(list).map(|()| ExitCode::SUCCESS),
            Command::Suites(suites) => Self::execute_suites(suites).map(|()| ExitCode::SUCCESS),
        }
    }
}
