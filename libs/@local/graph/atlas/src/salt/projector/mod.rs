//! Relation-conditioned parametric projection.
//!
//! The projector maps a normalized 512-component representation, optional
//! closed-type context, and learned entity-role embedding to two coordinates.
//! A single global relation condition modulates every residual block through
//! FiLM. Relation classifier outputs remain in the loss and never become model
//! conditions.

mod error;
mod model;
mod objective;
mod scale;

pub(crate) use self::{
    error::{ObjectiveError, ProjectorError},
    model::{
        ConditionedProjector, EntityRole, PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig,
        ProjectorInput,
    },
    objective::{ClippedGradient, GradientBudget, RelationEnergy, SemanticAffinity},
    scale::local_scales,
};

#[cfg(test)]
mod tests;
