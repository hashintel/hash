//! Immutable generation manifests and canonical content identities.
//!
//! A manifest binds every input, learned artifact, numerical contract, and
//! serving companion needed to reproduce one generation. Activation state and
//! release evidence are separate content-addressed records: including either
//! inside the manifest would create a hash cycle or make an immutable
//! generation change when it becomes active.
//!
//! # Contract layers
//!
//! The manifest binds:
//!
//! - bitemporal input and authorization provenance;
//! - canonical and projector representation corpora and their audit;
//! - semantic graph backend, configuration, and exact-recall evidence;
//! - landmark selection, assignment, and reference topology;
//! - projector architecture, checkpoint, objective, and condition domain;
//! - factorized relation policy, attraction, and protection semantics;
//! - selected canonical field, quantization, revisions, and row encoding;
//! - every immutable artifact path, role, format, byte length, and hash; and
//! - serving wire, companion, source-revision, configuration, and seed pins.
//!
//! [`GenerationManifest::validate`] checks both local field constraints and
//! cross-section equality. Loading then hashes actual files, validates each
//! role-specific schema, and checks cross-artifact relationships before
//! returning [`VerifiedArtifact`] handles.
//!
//! # Canonical JSON
//!
//! Struct field order is fixed by the Rust model. Set-like vectors are sorted
//! before serialization, unknown JSON fields are denied, and decoding a
//! published manifest must round-trip to its exact stored bytes. The manifest
//! hash therefore identifies one canonical encoding rather than merely a
//! deserialized value.
//!
//! Release evidence hashes the completed manifest, while the candidate marker
//! and active pointer bind the release-report hash. Keeping those records
//! outside the manifest avoids the cycle
//! `manifest -> release report -> release head -> manifest`.

mod artifact;
mod error;
mod model;
mod publish;
mod schema;
mod validate;

#[cfg(test)]
pub(crate) use self::publish::publish_manifest;
pub(crate) use self::{
    artifact::VerifiedArtifact,
    error::{ArtifactVerificationError, ManifestError, ManifestLoadError, ManifestPublishError},
    model::*,
    publish::{
        PublishedManifest, load_verified_manifest, publish_manifest_with_artifacts,
        verify_loaded_manifest_artifacts,
    },
};
#[cfg(test)]
pub(crate) mod tests;
#[cfg(test)]
pub(crate) use tests::{fixture_manifest, publish_fixture_artifacts};
