use alloc::sync::Arc;
use core::{
    fmt::{self, Write as _},
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use std::{
    io::{self, IsTerminal as _, Write as _, stderr},
    sync::Mutex,
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

#[derive(Debug)]
#[expect(dead_code, reason = "used during tracing output")]
pub(crate) struct TimingStatistics {
    pub total: Duration,
    pub average: Duration,
    pub min: Duration,
    pub max: Duration,
    pub std_dev: Duration,
}

#[derive(Debug)]
struct DurationStatisticsInner {
    total: Duration,

    min: Option<Duration>,
    max: Duration,

    variance_sum: u128,
}

impl DurationStatisticsInner {
    const fn new() -> Self {
        Self {
            total: Duration::ZERO,

            min: None,
            max: Duration::ZERO,

            variance_sum: 0,
        }
    }

    fn add(&mut self, duration: Duration) {
        self.total += duration;
        self.max = self.max.max(duration);
        self.min = Some(self.min.map_or(duration, |min| min.min(duration)));

        let nanos = duration.as_nanos();
        self.variance_sum = self.variance_sum.saturating_add(nanos.saturating_pow(2));
    }

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        clippy::cast_possible_truncation
    )]
    fn compile(&self, count: usize) -> TimingStatistics {
        TimingStatistics {
            total: self.total,

            average: if count > 0 {
                self.total / (count as u32)
            } else {
                Duration::ZERO
            },

            min: self.min.unwrap_or(Duration::ZERO),
            max: self.max,

            std_dev: if count > 1 {
                let mean_nanos = self.total.as_nanos() / (count as u128);

                // Sample variance formula: Σ(x²) - n*μ² / (n-1)
                let numerator = self
                    .variance_sum
                    .saturating_sub((count as u128).saturating_mul(mean_nanos.saturating_pow(2)));
                let variance = numerator / ((count - 1) as u128);

                Duration::from_nanos_u128(variance.isqrt())
            } else {
                Duration::ZERO
            },
        }
    }
}

#[derive(Debug)]
struct StatisticsInner {
    passed: AtomicUsize,
    failed: AtomicUsize,
}

impl StatisticsInner {
    pub(crate) fn snapshot(&self) -> (usize, usize) {
        let passed = self.passed.load(Ordering::Relaxed);
        let failed = self.failed.load(Ordering::Relaxed);

        (passed, failed)
    }
}

#[derive(Debug)]
pub(crate) struct Statistics {
    inner: Arc<StatisticsInner>,
    duration: Mutex<DurationStatisticsInner>,
}

impl Statistics {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(StatisticsInner {
                passed: AtomicUsize::new(0),
                failed: AtomicUsize::new(0),
            }),
            duration: Mutex::new(DurationStatisticsInner::new()),
        }
    }

    pub(crate) fn increase_passed(&self, duration: Duration) {
        self.inner.passed.fetch_add(1, Ordering::Relaxed); // This is just a counter, we don't care about the ordering here

        let mut lock = self
            .duration
            .lock()
            .expect("should be able to write to timings");

        lock.add(duration);
    }

    pub(crate) fn increase_failed(&self, duration: Duration) {
        self.inner.failed.fetch_add(1, Ordering::Relaxed); // This is just a counter, we don't care about the ordering here

        let mut lock = self
            .duration
            .lock()
            .expect("should be able to write to timings");

        lock.add(duration);
    }

    pub(crate) fn timings(&mut self) -> TimingStatistics {
        let (passed, failed) = self.inner.snapshot();

        self.duration
            .get_mut()
            .expect("should be able to read timings")
            .compile(passed + failed)
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct Summary {
    pub total: usize,
    pub ignored: usize,
}

pub(crate) fn create_progress_header_style(summary: Summary, state: &Statistics) -> ProgressStyle {
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
    let inner = Arc::clone(&state.inner);

    ProgressStyle::with_template(&header)
        .expect("progress style should be valid")
        .with_key("elapsed_subsec", elapsed_subsec)
        .with_key(
            "status",
            move |_: &ProgressState, writer: &mut dyn fmt::Write| {
                let (passed, failed) = inner.snapshot();

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
}
