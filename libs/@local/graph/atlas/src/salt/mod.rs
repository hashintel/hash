//! The SALT pipeline: fitting and serving atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a
//! published atlas generation: a 2D map over the graph's entities,
//! artifacts on disk under `crate::file`'s formats, and the spatial
//! indexes serving reads from them. The stages land here as they are
//! built; `PLAN.md` at the crate root tracks the order.

pub(crate) use self::{
    embedding::{CardEmbeddingStats, EmbedderFingerprint},
    fit::{FitConfig, FitConfigDef, prepare::norm::NormSpotCheck},
    importance::RankingConfig,
    knn::recall::RecallSpotCheck,
    lod::{quad::QuadEvidence, stage::LodEvidence},
    relation::BuildEvidence,
};
#[cfg(test)]
pub(crate) use self::{
    fit::PolicyOptions,
    fit::prepare::norm::RepresentationDefect,
    landmark::select::SelectionOptions,
    policy::{PolicyOverride, PolicySource, Posterior},
};

// The previous pipeline generation is parked uncompiled at
// `src/salt-BAK` as reference semantics for the port.
mod adjacency;
mod embedding;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod fit;
mod importance;
mod knn;
mod ladder;
mod landmark;
mod lod;
mod policy;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod projector;
pub(crate) mod quality;
pub(crate) mod relation;
mod semantic;
