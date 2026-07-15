//! Evaluation-only relation-condition ladders and canonical selection.
//!
//! A conditioned projector accepts one global scalar for the whole coordinate
//! field. Ladder coordinates measure how that lens changes the atlas; they are
//! not publication variants. Only a ladder member with measured monotonicity
//! and distinguishability plus bound semantic-fidelity and task-suite reports
//! can become a [`CanonicalCondition`]. Persistence is measured from the
//! resulting canonical analytic artifact before release.

mod canonical;
mod condition;
mod error;
mod measure;

pub(crate) use self::{
    canonical::{CanonicalField, CanonicalQuantization, QuantizedCanonicalField, canonical_field},
    condition::{CanonicalCondition, ConditionDomain, ConditionEvidence, ConditionLadder},
    error::EvaluationError,
    measure::{
        ConditionField, ConditionMeasurement, ConditionMeasurementConfig,
        ConditionMeasurementError, measure_condition_ladder, measure_persisted_relation_loss,
    },
};

#[cfg(test)]
mod tests;
