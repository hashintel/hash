//! Concrete current-snapshot fitting for HASH Graph Atlas.
//!
//! This façade keeps SALT's numerical and evidence internals private. The
//! first operational profile is explicitly [`FitAssuranceMode::M0LocalAttestation`]:
//! it performs direct PostgreSQL extraction and local gate signing while
//! documenting that authorization linearization and store-issued snapshot
//! attestation are deferred.

#[path = "config.rs"]
mod configuration;
mod error;
mod evidence;
mod input;
mod postgres;
mod profile;
#[path = "quality.rs"]
mod quality_evaluation;
mod runner;
mod schema;

pub use self::{
    error::FitConfigurationError,
    runner::ProductionAtlasTrainer,
    schema::{
        FIT_SCHEMA_VERSION, FitAssuranceMode, FitAuthoritiesV1, FitEmbeddingContractV1,
        FitExternalAuthorityV1, FitInputBundleV1, FitInputReferenceV1, FitManifestContractV1,
        FitNumericalProfile, FitPostgresConfigurationV1, FitRelationContractV1, FitRequestV1,
        FitResourceLimitsV1, FitSampleV1, FitServingContractV1, FitSigningAuthorityV1,
        FitWorkerConfigurationV1, MAXIMUM_FIT_CPU_THREADS, MAXIMUM_FIT_ENTITIES,
        MAXIMUM_FIT_LABEL_BYTES, MAXIMUM_FIT_LINKS, MAXIMUM_FIT_RELATION_TYPES,
        MAXIMUM_FIT_REQUIRED_TYPES_PER_LINK, MAXIMUM_FIT_WEB_IDS, MINIMUM_FIT_ENTITIES,
    },
};
pub use crate::cli::{
    FIT_RECEIPT_SCHEMA_VERSION, FitActivation, FitGate, FitGateAssurance, FitGateAssuranceClass,
    FitReceipt, FitTiming,
};
