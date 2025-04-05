use core::{
    fmt::{self, Display, Write as _},
    time::Duration,
};
use std::{
    io::{self, IsTerminal as _, stderr},
    sync::mpsc,
};

use indicatif::ProgressState;
use tracing::info_span;
use tracing_indicatif::{IndicatifLayer, span_ext::IndicatifSpanExt as _, style::ProgressStyle};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use crate::styles::{BLUE, BOLD, CYAN, GREEN, MAGENTA, RED, YELLOW};

const PASS: &str = "PASS";
const FAIL: &str = "FAIL";
const SKIP: &str = "SKIP";

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum Condition {
    Pass,
    Fail,
    Skip,
}

impl Condition {
    fn style(&self) -> impl Display {
        let color = match self {
            Condition::Pass => GREEN,
            Condition::Fail => RED,
            Condition::Skip => YELLOW,
        };

        let value = match self {
            Condition::Pass => "PASS",
            Condition::Fail => "FAIL",
            Condition::Skip => "SKIP",
        };

        format!("{color}{value}{color:#}")
    }
}

// general format is:
//
//         [m/n] [condition] [elapsed] [module] [test]

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct TrialDescription {
    package: String,
    namespace: Vec<String>,
    name: String,
}

impl TrialDescription {
    fn style(&self) -> impl Display {
        format!(
            "{MAGENTA}{}{MAGENTA:#} {CYAN}{}::{CYAN:#}{BLUE}{}{BLUE:#}",
            self.package,
            self.namespace.join("::"),
            self.name,
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Event {
    RunStarted {
        length: usize,
        ignored: usize,
    },
    TestStarted {
        trial: TrialDescription,
    },
    TestFinished {
        trial: TrialDescription,

        elapsed: Duration,
        condition: Condition,
    },
}

struct ReportTask {
    queue: mpsc::Receiver<Event>,
    total: usize,
    current: usize,
}

impl ReportTask {
    fn write_event(&mut self, event: Event, mut writer: impl io::Write) -> io::Result<()> {
        match event {
            Event::RunStarted { length, ignored } => {
                self.total = length;

                let hbar = "-".repeat(12);

                writeln!(writer, "{hbar}")?;
                write!(writer, "{GREEN}{:>12}{GREEN:#} ", "Starting")?;
                write!(writer, "{BOLD}{length}{BOLD:#} tests")?;

                if ignored > 0 {
                    write!(
                        writer,
                        " ({BOLD}{ignored}{BOLD:#} tests {YELLOW}{BOLD}ignored{BOLD:#}{YELLOW:#})"
                    )?;
                }

                writeln!(writer)?;
            }
            Event::TestStarted { trial } => {
                writeln!(
                    writer,
                    "{GREEN}{:>12}{GREEN:#}             {}",
                    "START",
                    trial.style()
                )?;
            }
            Event::TestFinished {
                trial,
                elapsed,
                condition,
            } => writeln,
        }

        Ok(())
    }

    fn run(mut self) {
        while let Ok(event) = self.queue.recv() {
            match event {}
        }
    }
}

#[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
pub(crate) fn elapsed_subsec(state: &ProgressState, writer: &mut dyn fmt::Write) {
    let elapsed = state.elapsed();
    let seconds = elapsed.as_secs();
    let sub_seconds = elapsed.subsec_millis() / 100;

    let color = if seconds > 8 {
        RED
    } else if seconds > 4 {
        YELLOW
    } else {
        GREEN
    };

    writer
        .write_fmt(format_args!("{color}{seconds}.{sub_seconds}s{color:#}"))
        .expect("should be able to write to stdout");
}

pub(crate) struct Reporter {
    pub is_terminal: bool,
}

impl Reporter {
    pub fn install() -> Self {
        if stderr().is_terminal() {
            Self::install_interactive()
        } else {
            Self::install_non_interactive()
        }
    }

    fn install_non_interactive() -> Self {
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .init();

        Self { is_terminal: false }
    }

    fn install_interactive() -> Self {
        let indicatif_layer = IndicatifLayer::new()
            .with_progress_style(
                ProgressStyle::with_template(
                    "{span_child_prefix}{span_fields} -- {span_name} {wide_msg} {elapsed_subsec}",
                )
                .expect("progress style should be valid")
                .with_key("elapsed_subsec", elapsed_subsec),
            )
            .with_span_child_prefix_symbol("\u{21b3} ")
            .with_span_child_prefix_indent(" ");

        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer().with_writer(indicatif_layer.get_stderr_writer()))
            .with(indicatif_layer)
            .init();

        Self { is_terminal: true }
    }
}
