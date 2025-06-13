use alloc::sync::Arc;
use core::fmt::{self, Write as _};
use std::{
    io::{self, IsTerminal as _, Write as _, stderr},
    sync::RwLock,
};

use error_stack::Report;
use indicatif::ProgressState;
use tracing::info_span;
use tracing_indicatif::{IndicatifLayer, span_ext::IndicatifSpanExt as _, style::ProgressStyle};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use crate::{
    executor::{TrialDescription, TrialError},
    styles::{BLUE, BOLD, CYAN, GREEN, MAGENTA, RED, YELLOW},
};

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

#[derive(Debug, Copy, Clone)]
struct StatisticsInner {
    passed: usize,
    failed: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct Statistics {
    inner: Arc<RwLock<StatisticsInner>>,
}

impl Statistics {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(StatisticsInner {
                passed: 0,
                failed: 0,
            })),
        }
    }

    pub(crate) fn increase_passed(&self) {
        self.inner
            .write()
            .expect("should be able to write to statistics")
            .passed += 1;
    }

    pub(crate) fn increase_failed(&self) {
        self.inner
            .write()
            .expect("should be able to write to statistics")
            .failed += 1;
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct Summary {
    pub total: usize,
    pub ignored: usize,
}

pub(crate) fn create_progress_header_style(summary: Summary, state: Statistics) -> ProgressStyle {
    let Summary { total, ignored } = summary;

    let mut header = String::new();
    let _ = write!(
        header,
        "{GREEN}Running{GREEN:#} {BOLD}{total}{BOLD:#} tests"
    );

    if ignored > 0 {
        let _ = write!(header, " {YELLOW}({ignored} ignored){YELLOW:#}");
    }

    header.push_str(" -- {status} {wide_msg} {elapsed_subsec}\n{wide_bar}");

    ProgressStyle::with_template(&header)
        .expect("progress style should be valid")
        .with_key("elapsed_subsec", elapsed_subsec)
        .with_key(
            "status",
            move |_: &ProgressState, writer: &mut dyn fmt::Write| {
                let StatisticsInner { passed, failed } =
                    state.inner.get_cloned().expect("should not be poisoned");
                let _ = write!(
                    writer,
                    "{BOLD}{passed}{BOLD:#} {GREEN}passed{GREEN:#} {BOLD}{failed}{BOLD:#} \
                     {RED}failed{RED:#}"
                );
            },
        )
        .progress_chars("---")
}

pub(crate) macro setup_progress_header($reporter:expr, $summary:expr, $statistics:expr) {
    let header_span = info_span!("header");

    if $reporter.is_terminal {
        header_span.pb_set_style(&create_progress_header_style($summary, $statistics));
        header_span.pb_start();

        // Bit of a hack to show a full "-----" line underneath the header.
        header_span.pb_set_length(1);
        header_span.pb_set_position(1);
    }
}

pub(crate) struct Reporter {
    pub is_terminal: bool,
}

impl Reporter {
    pub(crate) fn install() -> Self {
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

    pub(crate) fn report_errors(reports: Vec<Report<[TrialError]>>) -> io::Result<()> {
        let mut stderr = stderr();

        let length = reports.len();
        for (index, report) in reports.into_iter().enumerate() {
            let mut delimiter = String::new();
            let _ = write!(delimiter, "--- {RED}ERROR:{RED:#} ");

            let description = report.request_ref::<TrialDescription>().next();

            if let Some(TrialDescription {
                package,
                namespace,
                name,
            }) = description
            {
                let _ = write!(
                    delimiter,
                    "{MAGENTA}{}{MAGENTA:#} {CYAN}{}{CYAN:#}::{BLUE}{}{BLUE:#}",
                    package,
                    namespace.join("::"),
                    name
                );
            } else {
                let _ = write!(delimiter, "{RED}unknown{RED:#}");
            }

            write!(stderr, "{delimiter} ---")?;
            write!(stderr, "\n\n")?;
            #[expect(clippy::use_debug)]
            write!(stderr, "{report:?}")?;
            write!(stderr, "\n\n")?;
            write!(stderr, "{delimiter} ---")?;

            if index < length - 1 {
                write!(stderr, "\n\n\n\n")?;
            }

            stderr.flush()?;
        }

        Ok(())
    }
}
