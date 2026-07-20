//! The SALT pipeline: fitting and serving atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a
//! published atlas generation: a 2D map over the graph's entities,
//! artifacts on disk under `crate::file`'s formats, and the spatial
//! indexes serving reads from them. The stages land here as they are
//! built; `PLAN.md` at the crate root tracks the order.

#[cfg(test)]
pub(crate) use self::{
    embedding::CardEmbedder,
    fit::PolicyOptions,
    fit::prepare::norm::RepresentationDefect,
    landmark::select::SelectionOptions,
    policy::{
        PolicyOverride, PolicySource, Posterior,
        classifier::{
            Classifier, FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet,
            fit as fit_classifier,
        },
    },
};
pub(crate) use self::{
    embedding::{CardEmbeddingStats, EmbedderFingerprint},
    fit::{FitConfig, FitConfigDef, prepare::norm::NormSpotCheck},
    importance::RankingConfig,
    knn::recall::RecallSpotCheck,
    lod::{quad::QuadEvidence, stage::LodEvidence},
    postings::build::PostingsEvidence,
    relation::BuildEvidence,
};

// The previous pipeline generation is parked uncompiled at
// `src/salt-BAK` as reference semantics for the port.
pub(crate) mod adjacency;
mod embedding;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod fit;
mod importance;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod knn;
// Crate-visible for the metadata document's ladder evidence.
pub(crate) mod ladder;
pub(crate) mod landmark;
// Crate-visible for the serving surface's schedule reads.
pub(crate) mod lod;
mod policy;
// Crate-visible for the serving surface's TYPE_MASK reads.
pub(crate) mod postings;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod projector;
pub(crate) mod quality;
pub(crate) mod relation;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod runner;
mod semantic;
// Crate-visible for the serving surface's response assembly.
pub(crate) mod wire;
