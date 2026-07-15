//! Evaluation-only relation-condition ladders and canonical selection.
//!
//! A conditioned projector accepts one global scalar for the whole coordinate
//! field. Ladder coordinates measure how that lens changes the atlas; they are
//! not publication variants. Only a ladder member with passing monotonicity,
//! distinguishability, semantic-fidelity, persistence, and task evidence can
//! become a [`CanonicalCondition`].

mod canonical;
mod condition;
mod error;
mod measure;

pub(crate) use self::{
    canonical::{CanonicalField, canonical_field},
    condition::{CanonicalCondition, ConditionDomain, ConditionEvidence, ConditionLadder},
    error::EvaluationError,
    measure::{
        ConditionField, ConditionMeasurement, ConditionMeasurementConfig,
        ConditionMeasurementError, measure_condition_ladder,
    },
};

#[cfg(test)]
mod tests;
