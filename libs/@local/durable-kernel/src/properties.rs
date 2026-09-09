//! Safety and coverage checks for kernel tests.
//!
//! Safety properties must hold each time they are checked. Coverage properties identify failure
//! cases that must occur at least once across a set of schedules. Property-based tests check
//! safety and shrink failing schedules. Seeded tests also check coverage.
//!
//! Keep property IDs stable so recorded failures remain useful.
//! Retire an ID rather than rename it.
//!
//! [`CATALOG`] lists the checks. Use [`check`] for safety conditions and [`covered`] to record
//! exercised failure cases through a [`CoverageSink`].

use core::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyClass {
    /// Must hold at every evaluation point.
    Safety,
    /// Must occur at least once across the schedules.
    Coverage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Property {
    pub id: &'static str,
    pub class: PropertyClass,
    /// The condition that must hold, or the failure case the schedules must exercise.
    pub statement: &'static str,
}

pub const ACK_IMPLIES_DURABLE: Property = Property {
    id: "KRN-A1-ACK-IMPLIES-DURABLE",
    class: PropertyClass::Safety,
    statement: "every event acknowledged Applied is in the durable prefix",
};

pub const DURABLE_END_MONOTONIC: Property = Property {
    id: "KRN-A2-DURABLE-END-MONOTONIC",
    class: PropertyClass::Safety,
    statement: "the last durable journal position never decreases",
};

pub const PROJECTION_IS_FOLD_OF_DURABLE_PREFIX: Property = Property {
    id: "KRN-A3-PROJECTION-REFOLD",
    class: PropertyClass::Safety,
    statement: "the current state matches state rebuilt from stored events, applying each event \
                ID once",
};

pub const ACKED_EVENT_SURVIVES_RECOVERY: Property = Property {
    id: "KRN-A4-ACK-SURVIVES-RECOVERY",
    class: PropertyClass::Safety,
    statement: "recovery never loses or changes an acknowledged event",
};

pub const EVENT_ACKED_APPLIED_ONCE: Property = Property {
    id: "KRN-A5-APPLIED-ONCE",
    class: PropertyClass::Safety,
    statement: "one event identity is acknowledged Applied at most once",
};

pub const REJECTED_NEVER_DURABLE: Property = Property {
    id: "KRN-A6-REJECTED-NEVER-DURABLE",
    class: PropertyClass::Safety,
    statement: "a rejected event never appears in the stored journal",
};

pub const EFFECT_REPLAYS_ARE_IDENTICAL: Property = Property {
    id: "KRN-A7-EFFECT-REPLAY-IDENTICAL",
    class: PropertyClass::Safety,
    statement: "repeated executions of an effect use the same payload bytes",
};

pub const DURABLE_COMPLETION_IMPLIES_EXECUTED: Property = Property {
    id: "KRN-A8-COMPLETION-IMPLIES-EXECUTED",
    class: PropertyClass::Safety,
    statement: "every effect with a stored completion event was executed at least once",
};

pub const PENDING_EFFECTS_COMPLETE: Property = Property {
    id: "KRN-A9-PLAN-FIXPOINT",
    class: PropertyClass::Safety,
    statement: "pending effects finish within the execution limit after their completion events \
                are applied",
};

pub const DURABLE_EVENTS_WERE_PROPOSED: Property = Property {
    id: "KRN-A10-DURABLE-HAS-PROVENANCE",
    class: PropertyClass::Safety,
    statement: "every event in the durable prefix was proposed by a client of the loop",
};

pub const RECOVERY_FINDS_UNACKNOWLEDGED_APPEND: Property = Property {
    id: "KRN-S1-AMBIGUOUS-DURABLE-ADOPTED",
    class: PropertyClass::Coverage,
    statement: "recovery finds a stored append whose acknowledgement was lost and returns \
                AlreadyDurable",
};

pub const RECOVERY_RETRIES_MISSING_APPEND: Property = Property {
    id: "KRN-S2-AMBIGUOUS-LOST-RETRIED",
    class: PropertyClass::Coverage,
    statement: "recovery confirms that an append is missing, retries it, and returns Applied",
};

pub const WRITER_FENCED: Property = Property {
    id: "KRN-S3-WRITER-FENCED",
    class: PropertyClass::Coverage,
    statement: "a replacement writer invalidates the old writer, causing its command loop to stop",
};

pub const CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT: Property = Property {
    id: "KRN-S4-CRASH-UNACKED-DURABLE",
    class: PropertyClass::Coverage,
    statement: "a crash happens while the durable prefix holds an event no caller saw acknowledged",
};

pub const DUPLICATE_SUBMISSION_DETECTED: Property = Property {
    id: "KRN-S5-DUPLICATE-ABSORBED",
    class: PropertyClass::Coverage,
    statement: "a byte-identical resubmission is acknowledged AlreadyDurable without a new append",
};

pub const RECOVERY_REPLAYED_NONEMPTY_PREFIX: Property = Property {
    id: "KRN-S6-RECOVERY-NONEMPTY",
    class: PropertyClass::Coverage,
    statement: "recovery replays a non-empty durable prefix into a projection",
};

pub const RECOVERY_BOUNDED_BY_SNAPSHOT: Property = Property {
    id: "KRN-S7-SNAPSHOT-BOUNDED-RECOVERY",
    class: PropertyClass::Coverage,
    statement: "recovery loads a saved snapshot and replays the events after it",
};

pub const CORRUPT_SNAPSHOT_FELL_BACK: Property = Property {
    id: "KRN-S8-SNAPSHOT-CORRUPTION-FALLBACK",
    class: PropertyClass::Coverage,
    statement: "recovery skips a corrupt snapshot and uses an older snapshot or replays the full \
                journal",
};

pub const EFFECT_EXECUTED_MORE_THAN_ONCE: Property = Property {
    id: "KRN-S9-EFFECT-REEXECUTED",
    class: PropertyClass::Coverage,
    statement: "one effect identity executes more than once because its completion was lost",
};

/// Every catalogued property, for exhaustive coverage accounting.
pub const CATALOG: &[Property] = &[
    ACK_IMPLIES_DURABLE,
    DURABLE_END_MONOTONIC,
    PROJECTION_IS_FOLD_OF_DURABLE_PREFIX,
    ACKED_EVENT_SURVIVES_RECOVERY,
    EVENT_ACKED_APPLIED_ONCE,
    REJECTED_NEVER_DURABLE,
    EFFECT_REPLAYS_ARE_IDENTICAL,
    DURABLE_COMPLETION_IMPLIES_EXECUTED,
    PENDING_EFFECTS_COMPLETE,
    DURABLE_EVENTS_WERE_PROPOSED,
    RECOVERY_FINDS_UNACKNOWLEDGED_APPEND,
    RECOVERY_RETRIES_MISSING_APPEND,
    WRITER_FENCED,
    CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT,
    DUPLICATE_SUBMISSION_DETECTED,
    RECOVERY_REPLAYED_NONEMPTY_PREFIX,
    RECOVERY_BOUNDED_BY_SNAPSHOT,
    CORRUPT_SNAPSHOT_FELL_BACK,
    EFFECT_EXECUTED_MORE_THAN_ONCE,
];

/// Collects coverage observations across schedules. Check the results against [`CATALOG`] at
/// the end of the test.
pub trait CoverageSink {
    fn observe(&mut self, property: &Property);
}

/// Checks a safety property. Failures include the property ID, statement, and supplied detail.
///
/// # Panics
///
/// Panics when `condition` is false.
#[track_caller]
pub fn check(property: &Property, condition: bool, detail: impl fmt::Display) {
    debug_assert_eq!(property.class, PropertyClass::Safety);
    assert!(
        condition,
        "property {} violated: {} — {detail}",
        property.id, property.statement
    );
}

/// Records a coverage observation. The test checks for missing observations after all schedules
/// finish.
pub fn covered(sink: &mut dyn CoverageSink, property: &Property, condition: bool) {
    debug_assert_eq!(property.class, PropertyClass::Coverage);
    if condition {
        sink.observe(property);
    }
}
