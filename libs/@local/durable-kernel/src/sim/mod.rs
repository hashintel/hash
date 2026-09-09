//! An in-memory journal for deterministic tests of the command loop.
//!
//! A schedule supplies append outcomes. The real command loop handles retries, uncertain
//! commits, and recovery. Reusing the schedule and sequence seed reproduces the journal’s
//! responses.

use alloc::{collections::VecDeque, sync::Arc};
use std::sync::Mutex;

use bytes::Bytes;

mod harness;

pub use harness::{
    CoverageLedger, DstCounters, DstDomain, DstEffect, DstEvent, PlannedAction, SchedulePlan,
    ScheduleReport, derive_plan, run_plan,
};

/// A deterministic generator for test schedules. Unsuitable for cryptographic use.
#[derive(Debug, Clone)]
pub struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    #[must_use]
    pub const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub const fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut mixed = self.state;
        mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        mixed ^ (mixed >> 31)
    }

    /// Draws a value in `0..bound` by reducing the next generated integer modulo `bound`.
    ///
    /// # Panics
    ///
    /// Panics when `bound` is zero.
    pub const fn below(&mut self, bound: u64) -> u64 {
        self.next_u64()
            .checked_rem(bound)
            .expect("random draw bound should be nonzero")
    }

    /// Draws a value in `low..=high`.
    pub const fn between(&mut self, low: u64, high: u64) -> u64 {
        low + self.below(high - low + 1)
    }
}

/// The journal key spaces the writer distinguishes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimKey {
    Events,
    Snapshots,
}

/// The outcome assigned to an append by the test schedule.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimAppendOutcome {
    /// The record is stored, durable, and acknowledged.
    AckDurable,
    /// The record was not stored, so the caller may safely retry.
    DefinitelyNotCommitted,
    /// Stores the record but loses the acknowledgement. The caller must recover to determine
    /// whether it committed.
    CommitUnknownDurable,
    /// Loses the acknowledgement without storing the record. Recovery must establish that it is
    /// absent before retrying.
    CommitUnknownLost,
    /// Rejects this writer because a newer writer owns the log.
    Fenced,
}

/// Weights out of 1000 for each append outcome. The five weights must sum to 1000.
#[derive(Debug, Clone, Copy)]
pub struct DispositionWeights {
    pub ack_durable: u16,
    pub definitely_not_committed: u16,
    pub commit_unknown_durable: u16,
    pub commit_unknown_lost: u16,
    pub fenced: u16,
}

impl DispositionWeights {
    /// Uses mostly successful appends, with a nonzero weight for every failure outcome.
    pub const DEFAULT: Self = Self {
        ack_durable: 760,
        definitely_not_committed: 100,
        commit_unknown_durable: 60,
        commit_unknown_lost: 60,
        fenced: 20,
    };

    pub(crate) fn draw(self, rng: &mut SplitMix64) -> SimAppendOutcome {
        debug_assert_eq!(
            1000,
            u64::from(self.ack_durable)
                + u64::from(self.definitely_not_committed)
                + u64::from(self.commit_unknown_durable)
                + u64::from(self.commit_unknown_lost)
                + u64::from(self.fenced),
        );
        let roll = rng.below(1000);
        let mut threshold = u64::from(self.ack_durable);
        if roll < threshold {
            return SimAppendOutcome::AckDurable;
        }
        threshold += u64::from(self.definitely_not_committed);
        if roll < threshold {
            return SimAppendOutcome::DefinitelyNotCommitted;
        }
        threshold += u64::from(self.commit_unknown_durable);
        if roll < threshold {
            return SimAppendOutcome::CommitUnknownDurable;
        }
        threshold += u64::from(self.commit_unknown_lost);
        if roll < threshold {
            return SimAppendOutcome::CommitUnknownLost;
        }
        SimAppendOutcome::Fenced
    }
}

const CORRUPTION_MARKER: &[u8] = b"corrupted-snapshot";

#[derive(Debug, Clone)]
struct SimEntry {
    sequence: u64,
    key: SimKey,
    bytes: Bytes,
}

#[derive(Debug)]
struct SimLogState {
    entries: Vec<SimEntry>,
    next_sequence: u64,
    durable_end_exclusive: u64,
    /// The active writer’s epoch. Older writers are rejected.
    writer_epoch: u64,
    /// Generates sequence gaps independently of append outcomes.
    gap_rng: SplitMix64,
    /// Consumes one outcome per append. Once exhausted, appends succeed with `AckDurable`.
    pending: VecDeque<SimAppendOutcome>,
    /// Records append outcomes in order so tests can inspect those used by one command.
    outcome_log: Vec<SimAppendOutcome>,
}

/// Shares journal state between writers and the test driver.
#[derive(Debug, Clone)]
pub struct SimLogHandle {
    state: Arc<Mutex<SimLogState>>,
}

impl SimLogHandle {
    #[must_use]
    pub fn new(gap_seed: u64, dispositions: Vec<SimAppendOutcome>) -> Self {
        Self {
            state: Arc::new(Mutex::new(SimLogState {
                entries: Vec::new(),
                next_sequence: 0,
                durable_end_exclusive: 0,
                writer_epoch: 0,
                gap_rng: SplitMix64::new(gap_seed),
                pending: dispositions.into(),
                outcome_log: Vec::new(),
            })),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, SimLogState> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Opens a writer with a new epoch, invalidating all older writers.
    pub(crate) fn open_writer(&self) -> SimWriter {
        let mut state = self.lock();
        state.writer_epoch += 1;
        SimWriter {
            handle: self.clone(),
            epoch: state.writer_epoch,
        }
    }

    /// Puts dispositions at the head of the stream, ahead of the plan.
    pub fn force_outcomes(&self, outcomes: impl IntoIterator<Item = SimAppendOutcome>) {
        let mut state = self.lock();
        for outcome in outcomes.into_iter().collect::<Vec<_>>().into_iter().rev() {
            state.pending.push_front(outcome);
        }
    }

    /// Returns stored sequences and bytes for `key` in sequence order, independently of the
    /// command loop’s state.
    #[must_use]
    pub fn durable_entries(&self, key: SimKey) -> Vec<(u64, Bytes)> {
        self.lock()
            .entries
            .iter()
            .filter(|entry| entry.key == key)
            .map(|entry| (entry.sequence, entry.bytes.clone()))
            .collect()
    }

    #[must_use]
    pub fn durable_end_exclusive(&self) -> u64 {
        self.lock().durable_end_exclusive
    }

    /// Count of dispositions served so far, which indexes into
    /// [`Self::outcomes_since`].
    #[must_use]
    pub fn outcomes_drawn(&self) -> usize {
        self.lock().outcome_log.len()
    }

    /// Checks the stored snapshot bytes for the corruption marker.
    #[must_use]
    pub fn latest_snapshot_is_corrupt(&self) -> bool {
        self.lock()
            .entries
            .iter()
            .rev()
            .find(|entry| entry.key == SimKey::Snapshots)
            .is_some_and(|entry| entry.bytes.as_ref() == CORRUPTION_MARKER)
    }

    /// Replaces the newest snapshot’s bytes with undecodable data.
    ///
    /// Recovery must then use an older snapshot or replay the full journal. Returns `false` if
    /// there is no snapshot.
    #[must_use]
    pub fn corrupt_latest_snapshot(&self) -> bool {
        let mut state = self.lock();
        match state
            .entries
            .iter_mut()
            .rev()
            .find(|entry| entry.key == SimKey::Snapshots)
        {
            Some(entry) => {
                entry.bytes = Bytes::from_static(CORRUPTION_MARKER);
                true
            }
            None => false,
        }
    }

    /// The dispositions served at or after `index`, in order.
    #[must_use]
    pub fn outcomes_since(&self, index: usize) -> Vec<SimAppendOutcome> {
        self.lock()
            .outcome_log
            .get(index..)
            .unwrap_or_default()
            .to_vec()
    }

    fn scan(&self, key: SimKey, start: u64, end_exclusive: u64) -> Vec<(u64, Bytes)> {
        self.lock()
            .entries
            .iter()
            .filter(|entry| {
                entry.key == key && entry.sequence >= start && entry.sequence < end_exclusive
            })
            .map(|entry| (entry.sequence, entry.bytes.clone()))
            .collect()
    }
}

/// One writer epoch over a [`SimLogHandle`].
#[derive(Debug)]
pub(crate) struct SimWriter {
    handle: SimLogHandle,
    epoch: u64,
}

pub(crate) enum SimAppendResult {
    Acked(u64),
    DefinitelyNotCommitted,
    CommitUnknown,
    Fenced,
}

impl SimWriter {
    /// The recovery window captured at open time.
    pub(crate) fn durable_end_exclusive(&self) -> u64 {
        self.handle.lock().durable_end_exclusive
    }

    pub(crate) fn append(&self, key: SimKey, bytes: Vec<u8>) -> SimAppendResult {
        let mut state = self.handle.lock();
        if state.writer_epoch != self.epoch {
            return SimAppendResult::Fenced;
        }
        let outcome = state
            .pending
            .pop_front()
            .unwrap_or(SimAppendOutcome::AckDurable);
        state.outcome_log.push(outcome);
        match outcome {
            SimAppendOutcome::AckDurable => {
                let sequence = state.store(key, bytes);
                SimAppendResult::Acked(sequence)
            }
            SimAppendOutcome::DefinitelyNotCommitted => SimAppendResult::DefinitelyNotCommitted,
            SimAppendOutcome::CommitUnknownDurable => {
                state.store(key, bytes);
                SimAppendResult::CommitUnknown
            }
            SimAppendOutcome::CommitUnknownLost => SimAppendResult::CommitUnknown,
            SimAppendOutcome::Fenced => {
                // Advancing the epoch models a competing writer taking ownership.
                state.writer_epoch += 1;
                SimAppendResult::Fenced
            }
        }
    }

    pub(crate) fn scan(&self, key: SimKey, start: u64, end_exclusive: u64) -> Vec<(u64, Bytes)> {
        self.handle.scan(key, start, end_exclusive)
    }
}

impl SimLogState {
    fn store(&mut self, key: SimKey, bytes: Vec<u8>) -> u64 {
        // Real log sequences are ordered and can have gaps.
        let gap = self.gap_rng.between(1, 3);
        let sequence = self.next_sequence;
        self.next_sequence += gap;
        self.entries.push(SimEntry {
            sequence,
            key,
            bytes: Bytes::from(bytes),
        });
        let advanced = sequence + 1;
        assert!(
            advanced >= self.durable_end_exclusive,
            "durable end regressed: {advanced} < {}",
            self.durable_end_exclusive
        );
        self.durable_end_exclusive = advanced;
        sequence
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix_is_deterministic_and_covers_bounds() {
        let mut first = SplitMix64::new(42);
        let mut second = SplitMix64::new(42);
        for _ in 0..1000 {
            assert_eq!(first.next_u64(), second.next_u64());
        }
        let mut rng = SplitMix64::new(7);
        for _ in 0..1000 {
            let draw = rng.between(3, 5);
            assert!((3..=5).contains(&draw));
        }
    }

    #[test]
    fn fenced_writer_stays_fenced_and_new_epoch_appends() {
        let handle = SimLogHandle::new(1, Vec::new());
        let stale = handle.open_writer();
        let current = handle.open_writer();
        handle.force_outcomes([SimAppendOutcome::AckDurable]);
        assert!(matches!(
            stale.append(SimKey::Events, vec![1]),
            SimAppendResult::Fenced
        ));
        assert!(matches!(
            current.append(SimKey::Events, vec![2]),
            SimAppendResult::Acked(_)
        ));
        assert_eq!(handle.durable_entries(SimKey::Events).len(), 1);
    }

    #[test]
    fn commit_unknown_durable_stores_without_acking() {
        let handle = SimLogHandle::new(1, Vec::new());
        let writer = handle.open_writer();
        handle.force_outcomes([
            SimAppendOutcome::CommitUnknownDurable,
            SimAppendOutcome::CommitUnknownLost,
        ]);
        assert!(matches!(
            writer.append(SimKey::Events, vec![1]),
            SimAppendResult::CommitUnknown
        ));
        assert!(matches!(
            writer.append(SimKey::Events, vec![2]),
            SimAppendResult::CommitUnknown
        ));
        let stored = handle.durable_entries(SimKey::Events);
        assert_eq!(stored.len(), 1, "only the durable ambiguity is stored");
        assert_eq!(stored[0].1.as_ref(), &[1]);
    }
}
