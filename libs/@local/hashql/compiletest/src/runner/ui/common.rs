use alloc::collections::BinaryHeap;
use core::{cmp, time::Duration};
use std::time::Instant;

use crate::harness::trial::{Trial, TrialGroup, TrialStatistics};

pub(crate) mod styles {
    use hashql_diagnostics::color::{AnsiColor, Color, Style};

    pub(crate) const CYAN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan)));
    pub(crate) const BLUE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue)));
    pub(crate) const RED: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Red)));
    pub(crate) const GREEN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Green)));
    pub(crate) const YELLOW: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Yellow)));
    pub(crate) const MAGENTA: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Magenta)));
    pub(crate) const GRAY: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)));

    pub(crate) const BOLD: Style = Style::new().bold();
    pub(crate) const DIM: Style = Style::new().dimmed();
}

#[derive(Debug, Clone)]
pub(crate) enum TrialState {
    Pending,
    Running,
    Success(TrialStatistics),
    Failure(TrialStatistics),
}

pub(crate) struct TrialCounts {
    pub pending: usize,
    pub running: usize,
    pub success: usize,
    pub failure: usize,
}

impl TrialCounts {
    pub(crate) fn from_results(results: &[TrialState]) -> Self {
        let mut counts = Self {
            pending: 0,
            running: 0,
            success: 0,
            failure: 0,
        };
        for result in results {
            match result {
                TrialState::Pending => counts.pending += 1,
                TrialState::Running => counts.running += 1,
                TrialState::Success(_) => counts.success += 1,
                TrialState::Failure(_) => counts.failure += 1,
            }
        }
        counts
    }

    pub(crate) const fn completed(&self) -> usize {
        self.success + self.failure
    }

    pub(crate) const fn total(&self) -> usize {
        self.pending + self.running + self.success + self.failure
    }
}

pub(crate) struct TrialByTotal<'trial, 'graph> {
    pub group: &'trial TrialGroup<'graph>,
    pub trial: &'trial Trial,
    pub total: Duration,
}

impl PartialEq for TrialByTotal<'_, '_> {
    fn eq(&self, other: &Self) -> bool {
        self.total == other.total
    }
}

impl Eq for TrialByTotal<'_, '_> {}

impl PartialOrd for TrialByTotal<'_, '_> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TrialByTotal<'_, '_> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.total.cmp(&other.total)
    }
}

pub(crate) struct AggregatedStats<'trial, 'graph> {
    pub totals: TrialStatistics,
    pub finished: usize,
    pub fastest: Vec<TrialByTotal<'trial, 'graph>>,
    pub elapsed: Duration,
}

impl<'trial, 'graph> AggregatedStats<'trial, 'graph> {
    pub(crate) fn compute(
        results: &[TrialState],
        trials: &[(&'trial TrialGroup<'graph>, &'trial Trial)],
        start_time: Instant,
    ) -> Self {
        let mut slowest = BinaryHeap::new();
        let mut totals = TrialStatistics::default();
        let mut finished = 0_usize;

        for (index, trial_state) in results.iter().enumerate() {
            let (TrialState::Success(trial_stats) | TrialState::Failure(trial_stats)) = trial_state
            else {
                continue;
            };

            finished += 1;
            totals.plus(trial_stats);

            let (group, trial) = trials[index];
            slowest.push(TrialByTotal {
                group,
                trial,
                total: trial_stats.total,
            });
        }

        Self {
            totals,
            finished,
            fastest: slowest.into_sorted_vec(),
            elapsed: start_time.elapsed(),
        }
    }

    #[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
    pub(crate) fn throughput(&self) -> f64 {
        if self.elapsed.as_secs_f64() > 0.0 {
            self.finished as f64 / self.elapsed.as_secs_f64()
        } else {
            0.0
        }
    }
}

pub(crate) fn format_duration(duration: Duration) -> String {
    format!("{duration:.2?}")
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
pub(crate) fn format_bytes(bytes: usize) -> String {
    const KB: usize = 1024;
    const MB: usize = KB * 1024;

    if bytes >= MB {
        let value = bytes as f64 / MB as f64;
        format!("{value:.1} MiB")
    } else if bytes >= KB {
        let value = bytes as f64 / KB as f64;
        format!("{value:.1} KiB")
    } else {
        format!("{bytes} B")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_bytes_values() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1024), "1.0 KiB");
        assert_eq!(format_bytes(1536), "1.5 KiB");
        assert_eq!(format_bytes(1024 * 1024), "1.0 MiB");
        assert_eq!(format_bytes(1024 * 1024 + 512 * 1024), "1.5 MiB");
    }
}
