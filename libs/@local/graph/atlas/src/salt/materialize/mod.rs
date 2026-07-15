//! Canonical coordinate indexes and immutable base artifacts.

mod base;
mod canonical;
mod error;
mod importance;
mod morton;

#[allow(
    unused_imports,
    reason = "materialization diagnostics and ranking form the generation adapter surface"
)]
pub(crate) use self::{
    base::{CanonicalProvenance, publish_base_artifact},
    canonical::{MaterializedBase, materialize_base_revision},
    error::{BaseArtifactError, ImportanceError},
    importance::{
        CoordinateBounds, ImportanceConfig, ImportanceInput, RankedPoint, rank_importance,
    },
    morton::MortonKey,
};
#[cfg(test)]
pub(crate) use crate::salt::format::BASE_ARTIFACT_FORMAT;

#[cfg(test)]
mod tests;
