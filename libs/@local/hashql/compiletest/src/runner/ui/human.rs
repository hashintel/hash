use core::time::Duration;
use std::{io, io::Write as _, sync::mpsc, time::Instant};

use error_stack::Report;
use rayon::iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use super::common::{
    AggregatedStats, TrialCounts, TrialState, format_bytes, format_duration,
    styles::{BOLD, CYAN, DIM, GREEN, MAGENTA, RED, YELLOW},
};
use crate::harness::trial::{
    Trial, TrialContext, TrialError, TrialGroup, TrialSet, TrialStatistics,
};

enum Event {
    TrialFinished(usize, bool, TrialStatistics),
}

struct RenderState<'trial, 'graph> {
    set: TrialSet<'trial, 'graph>,
    results: Vec<TrialState>,
    start_time: Instant,
}

impl<'trial, 'graph> RenderState<'trial, 'graph> {
    fn new(set: &TrialSet<'trial, 'graph>) -> Self {
        Self {
            set: set.clone(),
            results: Vec::from_fn(set.len(), |_| TrialState::Pending),
            start_time: Instant::now(),
        }
    }
}

fn print_trial_result<W: io::Write>(
    writer: &mut W,
    group: &TrialGroup,
    trial: &Trial,
    success: bool,
) -> io::Result<()> {
    let (status, color) = if success {
        ("PASS", GREEN)
    } else {
        ("FAIL", RED)
    };

    writeln!(
        writer,
        "{color}{BOLD}[{status}]{BOLD:#} {}",
        trial.name(group)
    )
}

fn print_header<W: io::Write>(writer: &mut W) -> io::Result<()> {
    writeln!(writer)?;

    writeln!(
        writer,
        "{BOLD}{CYAN}{:═^80}{BOLD:#}{CYAN:#}",
        " Test Results Summary "
    )
}

fn print_counts<W: io::Write>(writer: &mut W, counts: &TrialCounts) -> io::Result<()> {
    writeln!(writer)?;
    writeln!(writer, "{BOLD}Results:{BOLD:#}")?;
    writeln!(
        writer,
        "  {GREEN}✓ Passed:{GREEN:#}  {BOLD}{}{BOLD:#}",
        counts.success
    )?;
    writeln!(
        writer,
        "  {RED}✗ Failed:{RED:#}  {BOLD}{}{BOLD:#}",
        counts.failure
    )?;
    writeln!(
        writer,
        "  {DIM}  Total:{DIM:#}   {BOLD}{}{BOLD:#}",
        counts.total()
    )
}

fn print_timing<W: io::Write>(
    writer: &mut W,
    stats: &AggregatedStats,
    counts: &TrialCounts,
) -> io::Result<()> {
    writeln!(writer)?;
    writeln!(writer, "{BOLD}Timing:{BOLD:#}")?;
    writeln!(
        writer,
        "  {DIM}Elapsed:{DIM:#}    {BOLD}{}{BOLD:#}",
        format_duration(stats.elapsed)
    )?;
    writeln!(
        writer,
        "  {DIM}Throughput:{DIM:#} {CYAN}{:.1}{CYAN:#} tests/sec",
        stats.throughput()
    )?;

    if counts.completed() > 0 {
        #[expect(clippy::cast_precision_loss, clippy::float_arithmetic)]
        let avg_per_test =
            Duration::from_secs_f64(stats.totals.total.as_secs_f64() / counts.completed() as f64);
        writeln!(
            writer,
            "  {DIM}Avg/test:{DIM:#}   {}",
            format_duration(avg_per_test)
        )?;
    }

    Ok(())
}

fn print_phase_breakdown<W: io::Write>(
    writer: &mut W,
    totals: &TrialStatistics,
    finished: usize,
) -> io::Result<()> {
    if finished == 0 {
        return Ok(());
    }

    writeln!(writer)?;
    writeln!(writer, "{BOLD}Phase Breakdown:{BOLD:#}")?;

    let phases = [
        ("Run", totals.run),
        ("Parse", totals.parse),
        ("Read", totals.read_source),
        ("Verify", totals.verify),
        ("Assert", totals.assert),
        ("Render", totals.render_stderr),
    ];

    let total_duration = totals.total;
    let max_label_width = phases
        .iter()
        .map(|(label, _)| label.len())
        .max()
        .unwrap_or(0);

    #[expect(clippy::cast_precision_loss, clippy::float_arithmetic)]
    for (label, duration) in phases {
        let avg = Duration::from_secs_f64(duration.as_secs_f64() / finished as f64);
        let pct = if total_duration.as_secs_f64() > 0.0 {
            (duration.as_secs_f64() / total_duration.as_secs_f64()) * 100.0
        } else {
            0.0
        };

        writeln!(
            writer,
            "  {DIM}{label:>width$}:{DIM:#} {MAGENTA}{:>8}{MAGENTA:#} avg  {DIM}({:>5.1}%){DIM:#}",
            format_duration(avg),
            pct,
            width = max_label_width
        )?;
    }

    Ok(())
}

fn print_io_stats<W: io::Write>(writer: &mut W, totals: &TrialStatistics) -> io::Result<()> {
    writeln!(writer)?;
    writeln!(writer, "{BOLD}I/O Statistics:{BOLD:#}")?;
    writeln!(
        writer,
        "  {DIM}Files read:{DIM:#}    {} ({} total)",
        totals.files_read,
        format_bytes(totals.bytes_read)
    )?;
    writeln!(
        writer,
        "  {DIM}Files written:{DIM:#} {} ({} total)",
        totals.files_written,
        format_bytes(totals.bytes_written)
    )?;
    if totals.files_removed > 0 {
        writeln!(
            writer,
            "  {DIM}Files removed:{DIM:#} {}",
            totals.files_removed
        )?;
    }

    Ok(())
}

fn print_slowest<W: io::Write>(writer: &mut W, stats: &AggregatedStats) -> io::Result<()> {
    const MAX_SLOWEST: usize = 5;

    if stats.fastest.is_empty() {
        return Ok(());
    }

    writeln!(writer)?;
    writeln!(writer, "{BOLD}Slowest Tests:{BOLD:#}")?;

    for entry in stats.fastest.iter().rev().take(MAX_SLOWEST) {
        writeln!(
            writer,
            "  {YELLOW}{:>10}{YELLOW:#} {}",
            format_duration(entry.total),
            entry.trial.name(entry.group)
        )?;
    }

    Ok(())
}

fn print_failed_tests<W: io::Write>(
    writer: &mut W,
    results: &[TrialState],
    trials: &[(&TrialGroup, &Trial)],
) -> io::Result<()> {
    let failures: Vec<_> = results
        .iter()
        .zip(trials.iter())
        .filter_map(|(state, (group, trial))| {
            matches!(state, TrialState::Failure(_)).then_some((*group, *trial))
        })
        .collect();

    if failures.is_empty() {
        return Ok(());
    }

    writeln!(writer)?;
    writeln!(writer, "{BOLD}{RED}Failed Tests:{RED:#}{BOLD:#}")?;
    for (group, trial) in failures {
        writeln!(writer, "  {RED}✗{RED:#} {}", trial.name(group))?;
    }

    Ok(())
}

fn print_footer<W: io::Write>(writer: &mut W, counts: &TrialCounts) -> io::Result<()> {
    writeln!(writer)?;
    if counts.failure == 0 {
        writeln!(
            writer,
            "{GREEN}{BOLD}All {} tests passed!{GREEN:#}{BOLD:#}",
            counts.success
        )
    } else {
        writeln!(
            writer,
            "{RED}{BOLD}{} of {} tests failed.{RED:#}{BOLD:#}",
            counts.failure,
            counts.total()
        )
    }
}

fn print_summary<W: io::Write>(writer: &mut W, render_state: &RenderState) -> io::Result<()> {
    let counts = TrialCounts::from_results(&render_state.results);
    let stats = AggregatedStats::compute(
        &render_state.results,
        &render_state.set.trials,
        render_state.start_time,
    );

    print_header(writer)?;
    print_counts(writer, &counts)?;
    print_timing(writer, &stats, &counts)?;
    print_phase_breakdown(writer, &stats.totals, stats.finished)?;
    print_io_stats(writer, &stats.totals)?;
    print_slowest(writer, &stats)?;
    print_failed_tests(writer, &render_state.results, &render_state.set.trials)?;
    print_footer(writer, &counts)?;
    writeln!(writer)?;

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
fn run_trials(
    set: TrialSet,
    context: &TrialContext,
    sender: mpsc::Sender<Event>,
) -> Vec<Report<[TrialError]>> {
    set.trials
        .into_par_iter()
        .enumerate()
        .map(|(index, (group, trial))| {
            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, "running trial");
            let (stats, result) = trial.run_catch(&group.metadata, context);
            let _result = sender.send(Event::TrialFinished(index, result.is_ok(), stats));
            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, result = ?result, "finished trial");

            result
        })
        .filter_map(Result::err)
        .collect()
}

pub(crate) struct Human;

impl Human {
    pub(crate) fn init() -> Self {
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .init();

        Self
    }

    #[expect(clippy::unused_self)]
    pub(crate) fn run(self, set: TrialSet, context: &TrialContext) -> Vec<Report<[TrialError]>> {
        let (tx, rx) = mpsc::channel();
        let mut state = RenderState::new(&set);

        let reports = run_trials(set, context, tx);

        let mut writer = anstream::stdout();

        for event in rx {
            let Event::TrialFinished(index, success, trial_stats) = event;

            let (group, trial) = state.set.trials[index];
            print_trial_result(&mut writer, group, trial, success)
                .expect("should be able to write to stdout");

            state.results[index] = if success {
                TrialState::Success(trial_stats)
            } else {
                TrialState::Failure(trial_stats)
            };
        }

        print_summary(&mut writer, &state).expect("should be able to write to stdout");
        writer.flush().expect("should be able to write to stdout");

        reports
    }
}
