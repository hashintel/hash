#[cfg(test)]
mod tests;

use core::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use std::time::Instant;

use tracing::Span;

const REPORT_INTERVAL: Duration = Duration::from_secs(10);

/// Tracks an operation's observed work and reports it through structured tracing events.
///
/// Share it between tasks to accumulate completed work. Periodic reports are emitted by
/// [`advance`](Self::advance); call [`report`](Self::report) for a final observation. Events
/// belong to the tracing span in which the operation started.
#[derive(Debug)]
pub struct Progress {
    operation: Box<str>,
    total: Option<u64>,
    completed: AtomicU64,
    started: Instant,
    last_report_ms: AtomicU64,
    span: Span,
}

/// The observed work and elapsed time of an operation at the time of a report.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProgressSnapshot {
    /// The number of work items observed so far.
    pub completed: u64,
    /// The expected number of work items, if known when the operation started.
    pub total: Option<u64>,
    /// The time since the operation started.
    pub elapsed: Duration,
}

impl Progress {
    /// Starts tracking an operation, with an optional expected work count.
    #[must_use]
    pub fn start(operation: impl Into<Box<str>>, total: Option<u64>) -> Self {
        Self {
            operation: operation.into(),
            total,
            completed: AtomicU64::new(0),
            started: Instant::now(),
            last_report_ms: AtomicU64::new(0),
            span: Span::current(),
        }
    }

    /// Adds observed work, saturating at the counter's maximum, and reports at most every 10
    /// seconds.
    pub fn advance(&self, count: u64) {
        self.completed
            .update(Ordering::Relaxed, Ordering::Relaxed, |completed| {
                completed.saturating_add(count)
            });
        if self.claim_report(self.started.elapsed()) {
            self.report();
        }
    }

    /// Reads the observed work count and elapsed time.
    #[must_use]
    pub fn snapshot(&self) -> ProgressSnapshot {
        ProgressSnapshot {
            completed: self.completed.load(Ordering::Relaxed),
            total: self.total,
            elapsed: self.started.elapsed(),
        }
    }

    /// Emits the observed progress immediately, including operations shorter than the report
    /// interval.
    pub fn report(&self) {
        let snapshot = self.snapshot();
        tracing::info!(
            parent: &self.span,
            operation = %self.operation,
            completed = snapshot.completed,
            total = snapshot.total,
            elapsed_seconds = snapshot.elapsed.as_secs_f64(),
            "integration progress"
        );
    }

    /// Reserves a periodic report when its interval has elapsed.
    fn claim_report(&self, elapsed: Duration) -> bool {
        let elapsed_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);
        self.last_report_ms
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |last| {
                (Duration::from_millis(elapsed_ms.saturating_sub(last)) >= REPORT_INTERVAL)
                    .then_some(elapsed_ms)
            })
            .is_ok()
    }
}
