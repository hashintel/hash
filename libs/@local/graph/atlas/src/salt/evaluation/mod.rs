//! Evaluation-only relation-condition ladders and canonical selection.
//!
//! A conditioned projector accepts one global scalar for the whole coordinate
//! field. Ladder coordinates measure how that lens changes the atlas; they are
//! not publication variants. Only a ladder member with passing monotonicity,
//! distinguishability, semantic-fidelity, persistence, and task evidence can
//! become a [`CanonicalCondition`].

mod condition;
mod error;

pub(crate) use self::{
    condition::{
        CanonicalCondition, ConditionDomain, ConditionEvidence, ConditionLadder,
        EvaluatedCondition, RelationCondition,
    },
    error::EvaluationError,
};

#[cfg(test)]
mod tests;
