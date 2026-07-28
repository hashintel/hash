//! The SALT pipeline: fitting and serving atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a published atlas generation: a
//! 2D map over the graph's entities, artifacts on disk under `crate::file`'s formats, and the
//! spatial indexes serving reads from them.

// The relaxation rank surfaces in evidence assertions; production
// code reaches it through the evidence struct.
#[cfg(test)]
pub(crate) use self::policy::annotation::assembly::Relaxation;
#[cfg(test)]
pub(crate) use self::{
    embedding::CardEmbedder,
    fit::PolicyOptions,
    fit::prepare::norm::RepresentationDefect,
    landmark::select::SelectionOptions,
    policy::{
        PolicyOverride, PolicySource, Posterior,
        classifier::{
            FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet, fit as fit_classifier,
        },
    },
};
pub(crate) use self::{
    embedding::{CardEmbeddingStats, EmbedderFingerprint},
    fit::{FitConfig, FitConfigDef, prepare::norm::NormSpotCheck},
    importance::RankingConfig,
    knn::recall::RecallSpotCheck,
    lod::{quad::QuadMeasurements, stage::LodMeasurements},
    policy::{
        GeometryClass,
        annotation::{HoldoutClass, assembly::AssemblyEvidence},
    },
    postings::build::PostingsMeasurements,
    relation::BuildMeasurements,
};

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
// Crate-visible for the root `bench` facade's re-exports.
#[cfg(feature = "bench")]
pub use self::policy::classifier::bench as classifier_bench;
// Crate-visible for the root `progress` facade's re-exports.
pub use self::policy::classifier::{
    CandidateOutcome, CgTag, CurvatureDiagnostic, OuterOutcome, OuterReceipt, WorkCounters,
};
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
