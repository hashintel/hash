use std::io::IsTerminal as _;

use clap::{Args, Parser, Subcommand, ValueEnum};

use super::{Command as RunnerCommand, List, Run, Runner, Suites, output::OutputFormat};

#[derive(Debug, Parser)]
#[command(
    name = "hashql-compiletest",
    about = "A test harness for HashQL that executes tests in the /tests/ui directory structure.",
    verbatim_doc_comment
)]
struct Cli {
    /// Filter pattern to run a subset of tests.
    ///
    /// Uses nextest-compatible filter patterns to select which tests to run or list.
    /// For example: `--filter "test(some_namespace::specific_test)"`
    /// or `--filter package(hashql-ast)`.
    ///
    /// Examples:
    ///
    /// ```text
    /// --filter "test(hashql::parser::smoke)"
    /// --filter "package(hashql-core)"
    /// ```
    #[arg(long, short, global = true)]
    filter: Option<String>,

    /// Enable quick filtering.
    ///
    /// Quick filtering will allow for faster test execution (reduction by 500ms), but won't allow
    /// for any dependency related filtering.
    ///
    /// Use this when you only need to filter by test name or package and you do not need
    /// dependency graph filtering.
    #[arg(long, global = true)]
    quick_filter: bool,

    /// The operation to perform.
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Run the test suite.
    ///
    /// Executes tests, verifying outputs against expected results stored in
    /// `.stdout` and `.stderr` files. Tests are considered successful if their
    /// actual output matches the expected output.
    ///
    /// Exits with a non-zero status if any test fails.
    ///
    /// Examples:
    ///
    /// ```text
    /// hashql-compiletest run
    /// hashql-compiletest run --bless
    /// hashql-compiletest run --format json
    /// ```
    Run(RunCommand),

    /// List all available tests without running them.
    ///
    /// Displays test names and their expected status (pass/fail/skip).
    ///
    /// Examples:
    ///
    /// ```text
    /// hashql-compiletest list
    /// hashql-compiletest list --json
    /// ```
    List(ListCommand),

    /// List all available test suites and their descriptions.
    ///
    /// Examples:
    ///
    /// ```text
    /// hashql-compiletest suites
    /// hashql-compiletest suites --format json
    /// ```
    Suites(SuitesCommand),
}

#[derive(Debug, Args)]
struct RunCommand {
    /// Update expected output files with the actual test output.
    ///
    /// When specified, the tool will update any `.stdout` and `.stderr` files
    /// for each test with the actual output produced, instead of failing on
    /// discrepancies.
    #[arg(long, short)]
    bless: bool,

    #[command(flatten)]
    format: FormatArgs,
}

#[derive(Debug, Args)]
struct ListCommand {
    #[command(flatten)]
    format: FormatArgs,
}

#[derive(Debug, Args)]
struct SuitesCommand {
    #[command(flatten)]
    format: FormatArgs,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Format {
    Human,
    Interactive,
    Json,
}

impl Format {
    fn default_for_environment() -> Self {
        if std::io::stdout().is_terminal() {
            Self::Interactive
        } else {
            Self::Human
        }
    }
}

impl From<Format> for OutputFormat {
    fn from(value: Format) -> Self {
        match value {
            Format::Human => Self::Human,
            Format::Interactive => Self::Interactive,
            Format::Json => Self::Json,
        }
    }
}

#[derive(Debug, Args)]
struct FormatArgs {
    /// Output format.
    ///
    /// Defaults to `interactive` when stdout is a TTY, otherwise `human`.
    #[arg(long, value_enum)]
    format: Option<Format>,

    /// Output in JSON format for machine-readable consumption.
    ///
    /// This is equivalent to `--format json` and writes newline-delimited JSON
    /// events to stdout with tracing logs on stderr.
    #[arg(long, conflicts_with = "format")]
    json: bool,
}

impl FormatArgs {
    fn resolve(&self) -> OutputFormat {
        if self.json {
            OutputFormat::Json
        } else if let Some(format) = self.format {
            format.into()
        } else {
            Format::default_for_environment().into()
        }
    }
}

impl From<Command> for RunnerCommand {
    fn from(value: Command) -> Self {
        match value {
            Command::Run(run) => Self::Run(Run {
                format: run.format.resolve(),
                bless: run.bless,
            }),
            Command::List(list) => Self::List(List {
                format: list.format.resolve(),
            }),
            Command::Suites(suites) => Self::Suites(Suites {
                format: suites.format.resolve(),
            }),
        }
    }
}

#[expect(clippy::exit, clippy::print_stderr)]
pub fn run() {
    let cli = Cli::parse();

    let runner = Runner {
        filter: cli.filter,
        quick_filter: cli.quick_filter,
    };

    match runner.execute(cli.command.into()) {
        Ok(exit) => {
            exit.exit_process();
        }
        Err(error) => {
            eprintln!("error: {error}");
            std::process::exit(1);
        }
    }
}
