use core::time::Duration;
use std::{io, io::Write as _, sync::mpsc, time::Instant};

use error_stack::Report;
use rayon::iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use super::common::{AggregatedStats, TrialCounts, TrialState};
use crate::{
    harness::trial::{Trial, TrialContext, TrialError, TrialGroup, TrialSet, TrialStatistics},
    runner::output::escape_json,
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

fn format_duration_secs(duration: Duration) -> String {
    format!("{:.6}", duration.as_secs_f64())
}

fn write_trial_event<W: io::Write>(
    mut writer: W,
    group: &TrialGroup,
    trial: &Trial,
    stats: &TrialStatistics,
    success: bool,
) -> io::Result<()> {
    let rendered_status = if success { "pass" } else { "fail" };

    write!(writer, "{{")?;
    write!(writer, "\"event\":\"test\",")?;
    write!(writer, "\"name\":\"")?;
    escape_json(&mut writer, &trial.name(group).to_string())?;
    write!(writer, "\",")?;
    write!(writer, "\"status\":\"{rendered_status}\",")?;
    write!(
        writer,
        "\"duration_secs\":{}",
        format_duration_secs(stats.total)
    )?;
    writeln!(writer, "}}")?;

    Ok(())
}

const MAX_SLOWEST: usize = 5;

#[expect(clippy::too_many_lines)]
fn write_summary<W: io::Write>(mut writer: W, state: &RenderState) -> io::Result<()> {
    let counts = TrialCounts::from_results(&state.results);
    let aggregate = AggregatedStats::compute(&state.results, &state.set.trials, state.start_time);

    write!(writer, "{{")?;
    write!(writer, "\"event\":\"summary\",")?;

    // Counts
    write!(writer, "\"counts\":{{")?;
    write!(writer, "\"total\":{},", counts.total())?;
    write!(writer, "\"passed\":{},", counts.success)?;
    write!(writer, "\"failed\":{}", counts.failure)?;
    write!(writer, "}},")?;

    // Timing
    write!(writer, "\"timing\":{{")?;
    write!(
        writer,
        "\"elapsed_secs\":{},",
        format_duration_secs(aggregate.elapsed)
    )?;
    write!(writer, "\"throughput\":{:.2}", aggregate.throughput())?;
    write!(writer, "}},")?;

    // I/O
    write!(writer, "\"io\":{{")?;
    write!(writer, "\"files_read\":{},", aggregate.totals.files_read)?;
    write!(writer, "\"bytes_read\":{},", aggregate.totals.bytes_read)?;
    write!(
        writer,
        "\"files_written\":{},",
        aggregate.totals.files_written
    )?;
    write!(
        writer,
        "\"bytes_written\":{},",
        aggregate.totals.bytes_written
    )?;
    write!(
        writer,
        "\"files_removed\":{}",
        aggregate.totals.files_removed
    )?;
    write!(writer, "}},")?;

    // Phase totals (in seconds)
    write!(writer, "\"phases\":{{")?;
    write!(
        writer,
        "\"run_secs\":{},",
        format_duration_secs(aggregate.totals.run)
    )?;
    write!(
        writer,
        "\"parse_secs\":{},",
        format_duration_secs(aggregate.totals.parse)
    )?;
    write!(
        writer,
        "\"read_source_secs\":{},",
        format_duration_secs(aggregate.totals.read_source)
    )?;
    write!(
        writer,
        "\"verify_secs\":{},",
        format_duration_secs(aggregate.totals.verify)
    )?;
    write!(
        writer,
        "\"assert_secs\":{},",
        format_duration_secs(aggregate.totals.assert)
    )?;
    write!(
        writer,
        "\"render_stderr_secs\":{}",
        format_duration_secs(aggregate.totals.render_stderr)
    )?;
    write!(writer, "}},")?;

    // Failed tests list
    write!(writer, "\"failed_tests\":[")?;
    let mut first = true;
    for (trial_state, (group, trial)) in state.results.iter().zip(state.set.trials.iter()) {
        if matches!(trial_state, TrialState::Failure(_)) {
            if !first {
                write!(writer, ",")?;
            }
            first = false;
            write!(writer, "\"")?;
            escape_json(&mut writer, &trial.name(group).to_string())?;
            write!(writer, "\"")?;
        }
    }
    write!(writer, "],")?;

    // Slowest tests
    write!(writer, "\"slowest_tests\":[")?;

    for (idx, entry) in aggregate.fastest.iter().rev().take(MAX_SLOWEST).enumerate() {
        if idx > 0 {
            write!(writer, ",")?;
        }
        write!(writer, "{{")?;
        write!(writer, "\"name\":\"")?;
        escape_json(&mut writer, &entry.trial.name(entry.group).to_string())?;
        write!(writer, "\",")?;
        write!(
            writer,
            "\"duration_secs\":{}",
            format_duration_secs(entry.total)
        )?;
        write!(writer, "}}")?;
    }
    write!(writer, "]")?;
    writeln!(writer, "}}")?;

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

pub(crate) struct Json;

impl Json {
    pub(crate) fn init() -> Self {
        tracing_subscriber::registry()
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_writer(io::stderr),
            )
            .init();

        Self
    }

    #[expect(clippy::unused_self, reason = "parity with out impl")]
    pub(crate) fn run(self, set: TrialSet, context: &TrialContext) -> Vec<Report<[TrialError]>> {
        let (tx, rx) = mpsc::channel();
        let mut state = RenderState::new(&set);

        let reports = run_trials(set, context, tx);

        let mut stdout = io::stdout().lock();

        for event in rx {
            let Event::TrialFinished(index, success, trial_stats) = event;

            let (group, trial) = state.set.trials[index];
            write_trial_event(&mut stdout, group, trial, &trial_stats, success)
                .expect("should be able to write to stdout");

            state.results[index] = if success {
                TrialState::Success(trial_stats)
            } else {
                TrialState::Failure(trial_stats)
            };
        }

        write_summary(&mut stdout, &state).expect("should be able to write to stdout");
        stdout.flush().expect("should be able to write to stdout");

        reports
    }
}
