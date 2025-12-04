//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
use clap::Parser as _;
use hashql_compiletest::Options;

/// A test harness for HashQL that executes tests in the `/tests/ui` directory structure.
///
/// Compiletest runs J-Expr test cases and verifies their outputs against expected
/// results, tracking diagnostics and assertions for each test case.
#[derive(Debug, clap::Parser)]
struct Cli {
    /// Filter pattern to run a subset of tests.
    ///
    /// Uses nextest-compatible filter patterns to select which tests to run or list.
    /// For example: `--filter "test(some_namespace::specific_test)"`
    /// or `--filter package(hashql-ast)`.
    #[clap(long, short)]
    filter: Option<String>,

    /// Enable quick filtering.
    ///
    /// Quick filtering will allow for faster test execution (reduction by 500ms), but won't allow
    /// for any dependency related filtering.
    #[clap(long, default_value_t = false)]
    quick_filter: bool,

    /// The operation to perform.
    #[clap(subcommand)]
    command: Command,
}

/// Operations that can be performed on the test suite.
#[derive(Debug, clap::Subcommand)]
enum Command {
    /// List all available tests without running them.
    ///
    /// Displays test names and their expected status (pass/fail/skip).
    List,

    /// Run the test suite.
    ///
    /// Executes tests, verifying outputs against expected results stored in
    /// `.stdout` and `.stderr` files. Tests are considered successful if their
    /// actual output matches the expected output.
    Run {
        /// Update expected output files with the actual test output.
        ///
        /// When specified, the tool will update any `.stdout` and `.stderr` files
        /// for each test with the actual output produced, instead of failing on
        /// discrepancies.
        #[clap(long, short, default_value_t = false)]
        bless: bool,
    },
}

impl From<Command> for hashql_compiletest::Command {
    fn from(value: Command) -> Self {
        match value {
            Command::List => Self::List,
            Command::Run { bless } => Self::Run { bless },
        }
    }
}

fn main() {
    let cli = Cli::parse();

    let options = Options {
        filter: cli.filter,
        quick_filter: cli.quick_filter,
        command: cli.command.into(),
    };

    options.run();
}
