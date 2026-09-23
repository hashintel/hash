use alloc::collections::BTreeSet;

use crate::{
    properties::{self, CoverageSink, Property, PropertyClass},
    sim::{AppendOutcomeWeights, SimAppendOutcome, SplitMix64},
};

/// Records which failure cases occurred across a set of schedules.
#[derive(Debug, Default)]
pub struct ScheduleCoverage {
    observed: BTreeSet<&'static str>,
}

impl ScheduleCoverage {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns coverage properties that have not occurred.
    #[must_use]
    pub fn missing(&self) -> Vec<&'static Property> {
        properties::CATALOG
            .iter()
            .filter(|property| {
                property.class == PropertyClass::Coverage && !self.observed.contains(property.id)
            })
            .collect()
    }
}

impl CoverageSink for ScheduleCoverage {
    fn observe(&mut self, property: &Property) {
        self.observed.insert(property.id);
    }
}

/// Describes one step of a schedule. Indices are reduced modulo the available items at execution
/// time, so removing earlier actions during shrinking keeps later indices valid.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlannedAction {
    SubmitFresh { counter: u8, amount: u64 },
    SubmitDuplicate { index: u8 },
    SubmitInvalid,
    EffectTurn,
    SnapshotCommit,
    CorruptLatestSnapshot,
    CrashAndRecover,
    CrashBeforeAppendReply { counter: u8, amount: u64 },
    FinishEffectsAndCheck,
}

/// Holds the actions, append outcomes, and journal sequence gap seed that reproduce a test run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchedulePlan {
    pub actions: Vec<PlannedAction>,
    pub outcomes: Vec<SimAppendOutcome>,
    pub gap_seed: u64,
}

/// Builds a schedule from a seed. Set `INTEGRATIONS_DST_SEED` to replay it.
///
/// # Panics
///
/// Panics if a generated action count or index cannot fit its destination type.
#[must_use]
pub fn derive_plan(seed: u64, weights: AppendOutcomeWeights) -> SchedulePlan {
    let mut rng = SplitMix64::new(seed);
    let step_count = rng.between(24, 64);
    let mut actions =
        Vec::with_capacity(usize::try_from(step_count).expect("step count should fit in usize"));

    for _step in 0..step_count {
        actions.push(match rng.below(100) {
            0..=34 => PlannedAction::SubmitFresh {
                counter: u8::try_from(rng.below(3))
                    .unwrap_or_else(|_err| unreachable!("a value below 3 should fit in u8")),
                amount: rng.between(1, 9),
            },
            35..=46 => PlannedAction::SubmitDuplicate {
                index: u8::try_from(rng.below(u64::from(u8::MAX)))
                    .unwrap_or_else(|_err| unreachable!("a value below u8::MAX should fit in u8")),
            },
            47..=53 => PlannedAction::SubmitInvalid,
            54..=68 => PlannedAction::EffectTurn,
            69..=76 => PlannedAction::SnapshotCommit,
            77..=80 => PlannedAction::CorruptLatestSnapshot,
            81..=88 => PlannedAction::CrashAndRecover,
            89..=92 => PlannedAction::CrashBeforeAppendReply {
                counter: u8::try_from(rng.below(3))
                    .unwrap_or_else(|_err| unreachable!("a value below 3 should fit in u8")),
                amount: rng.between(1, 9),
            },
            _ => PlannedAction::FinishEffectsAndCheck,
        });
    }

    // One action can append several times during retries or recovery. After the supplied
    // outcomes run out, further appends use `AckDurable`.
    let outcomes = core::iter::repeat_with(|| weights.draw(&mut rng))
        .take(actions.len() * 8)
        .collect();

    SchedulePlan {
        actions,
        outcomes,
        gap_seed: rng.next_u64(),
    }
}
