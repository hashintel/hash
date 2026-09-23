//! Tests recovery with an in-memory journal and repeatable failures.
//!
//! Use [`derive_plan`] to generate a [`SchedulePlan`], then [`run_plan`] to check it against
//! the real command loop. A plan specifies actions, append outcomes, and a seed for journal
//! sequence gaps. Reusing the plan reproduces these inputs.
//!
//! [`ScheduleCoverage`] records the failure cases exercised across runs. [`crate::properties`]
//! defines the state and durability checks. For individual journal tests, use [`SimLogHandle`].
//!
//! Available with the `test-util` feature.

use alloc::{collections::VecDeque, sync::Arc};
use std::sync::Mutex;

use bytes::Bytes;

use crate::sequence::JournalSequence;

mod harness;
mod storage;

pub use harness::{
    DstCounters, DstDomain, DstEffect, DstEvent, PlannedAction, ScheduleCoverage, SchedulePlan,
    ScheduleReport, derive_plan, run_plan,
};
pub use storage::{SimPause, SimStream, SimulatedFailure};

/// Generates deterministic pseudo-random numbers for test schedules. Do not use it for
/// cryptography.
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

/// Identifies the journal key space an entry belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimKey {
    Events,
    Snapshots,
}

/// Describes the outcome the test schedule assigns to an append.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimAppendOutcome {
    /// Stores the record durably and acknowledges the append.
    AckDurable,
    /// Does not store the record. The caller can retry.
    DefinitelyNotCommitted,
    /// Stores the record but loses the acknowledgement. The caller must recover to determine
    /// whether it committed.
    CommitUnknownDurable,
    /// Loses the acknowledgement without storing the record. Recovery must establish that it is
    /// absent before retrying.
    CommitUnknownLost,
    /// Rejects this writer because a newer writer owns the journal.
    Fenced,
}

/// Weights out of 1000 for each append outcome. The five weights must sum to 1000.
#[derive(Debug, Clone, Copy)]
pub struct AppendOutcomeWeights {
    pub ack_durable: u16,
    pub definitely_not_committed: u16,
    pub commit_unknown_durable: u16,
    pub commit_unknown_lost: u16,
    pub fenced: u16,
}

impl AppendOutcomeWeights {
    /// Draws `AckDurable` for 76% of appends and gives every other outcome a nonzero weight.
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
    sequence: JournalSequence,
    key: SimKey,
    bytes: Bytes,
}

#[derive(Debug)]
struct SimLogState {
    entries: Vec<SimEntry>,
    next_sequence: JournalSequence,
    durable_end_exclusive: JournalSequence,
    /// The active writer’s epoch. Appends from older epochs are rejected.
    writer_epoch: u64,
    /// Generates sequence gaps independently of append outcomes.
    gap_rng: SplitMix64,
    /// One outcome per upcoming append. When it is empty, appends use `AckDurable`.
    pending: VecDeque<SimAppendOutcome>,
    /// Records append outcomes in order so tests can inspect those used by one command.
    outcome_log: Vec<SimAppendOutcome>,
    before_append: Option<Arc<SimPause>>,
    after_append: Option<Arc<SimPause>>,
}

/// Shares journal state between writers and the test driver.
#[derive(Debug, Clone)]
pub struct SimLogHandle {
    state: Arc<Mutex<SimLogState>>,
}

impl SimLogHandle {
    #[must_use]
    pub fn new(gap_seed: u64, outcomes: Vec<SimAppendOutcome>) -> Self {
        Self {
            state: Arc::new(Mutex::new(SimLogState {
                entries: Vec::new(),
                next_sequence: JournalSequence::new(0),
                durable_end_exclusive: JournalSequence::new(0),
                writer_epoch: 0,
                gap_rng: SplitMix64::new(gap_seed),
                pending: outcomes.into(),
                outcome_log: Vec::new(),
                before_append: None,
                after_append: None,
            })),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, SimLogState> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Opens a writer with a new epoch, invalidating all older writers.
    pub(crate) fn acquire_writer(&self) -> SimWriter {
        let mut state = self.lock();
        state.writer_epoch += 1;
        SimWriter {
            handle: self.clone(),
            epoch: state.writer_epoch,
        }
    }

    /// Applies these append outcomes before the remaining scheduled outcomes.
    pub fn force_outcomes(&self, outcomes: impl IntoIterator<Item = SimAppendOutcome>) {
        let mut state = self.lock();
        for outcome in outcomes.into_iter().collect::<Vec<_>>().into_iter().rev() {
            state.pending.push_front(outcome);
        }
    }

    /// Returns the stored journal sequences and bytes for `key` in sequence order, independently
    /// of the command loop’s state.
    #[must_use]
    pub fn durable_entries(&self, key: SimKey) -> Vec<(JournalSequence, Bytes)> {
        self.lock()
            .entries
            .iter()
            .filter(|entry| entry.key == key)
            .map(|entry| (entry.sequence, entry.bytes.clone()))
            .collect()
    }

    #[must_use]
    pub fn durable_end_exclusive(&self) -> JournalSequence {
        self.lock().durable_end_exclusive
    }

    /// Returns the number of append outcomes used. Pass it to [`Self::outcomes_since`] to get
    /// the outcomes used after this call.
    #[must_use]
    pub fn outcomes_drawn(&self) -> usize {
        self.lock().outcome_log.len()
    }

    /// Returns whether the newest stored snapshot holds the corruption marker.
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

    /// Returns the append outcomes used at or after `index`, in order.
    #[must_use]
    pub fn outcomes_since(&self, index: usize) -> Vec<SimAppendOutcome> {
        self.lock()
            .outcome_log
            .get(index..)
            .unwrap_or_default()
            .to_vec()
    }
}

/// Appends to a [`SimLogHandle`] under one writer epoch.
#[derive(Debug)]
pub struct SimWriter {
    handle: SimLogHandle,
    epoch: u64,
}

pub(crate) enum SimAppendResult {
    Acked(JournalSequence),
    DefinitelyNotCommitted,
    CommitUnknown,
    Fenced,
}

impl SimWriter {
    pub(crate) fn append_record(&self, key: SimKey, bytes: Vec<u8>) -> SimAppendResult {
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
}

impl SimLogState {
    fn store(&mut self, key: SimKey, bytes: Vec<u8>) -> JournalSequence {
        // Real journal sequences increase and can have gaps.
        let gap = self.gap_rng.between(1, 3);
        let sequence = self.next_sequence;
        self.next_sequence = JournalSequence::new(sequence.get() + gap);
        self.entries.push(SimEntry {
            sequence,
            key,
            bytes: Bytes::from(bytes),
        });
        let advanced = sequence.saturating_next();
        assert!(
            advanced >= self.durable_end_exclusive,
            "durable end should not decrease: {advanced} < {}",
            self.durable_end_exclusive
        );
        self.durable_end_exclusive = advanced;
        sequence
    }
}

#[cfg(test)]
mod tests {
    use super::{SimAppendOutcome, SimAppendResult, SimKey, SimLogHandle};

    #[test]
    fn fenced_writer_stays_fenced_and_new_epoch_appends() {
        let handle = SimLogHandle::new(1, Vec::new());
        let stale = handle.acquire_writer();
        let current = handle.acquire_writer();
        handle.force_outcomes([SimAppendOutcome::AckDurable]);
        assert!(matches!(
            stale.append_record(SimKey::Events, vec![1]),
            SimAppendResult::Fenced
        ));
        assert!(matches!(
            current.append_record(SimKey::Events, vec![2]),
            SimAppendResult::Acked(_)
        ));
        assert_eq!(handle.durable_entries(SimKey::Events).len(), 1);
    }

    #[test]
    fn commit_unknown_durable_stores_without_acking() {
        let handle = SimLogHandle::new(1, Vec::new());
        let writer = handle.acquire_writer();
        handle.force_outcomes([
            SimAppendOutcome::CommitUnknownDurable,
            SimAppendOutcome::CommitUnknownLost,
        ]);
        assert!(matches!(
            writer.append_record(SimKey::Events, vec![1]),
            SimAppendResult::CommitUnknown
        ));
        assert!(matches!(
            writer.append_record(SimKey::Events, vec![2]),
            SimAppendResult::CommitUnknown
        ));
        let stored = handle.durable_entries(SimKey::Events);
        assert_eq!(
            stored.len(),
            1,
            "only the append that reached storage should be present"
        );
        assert_eq!(stored[0].1.as_ref(), &[1]);
    }
}
