//! Immutable generation manifests and canonical content identities.
//!
//! A manifest binds every input, learned artifact, numerical contract, and
//! serving companion needed to reproduce one generation. Activation state and
//! release evidence are separate content-addressed records: including either
//! inside the manifest would create a hash cycle or make an immutable
//! generation change when it becomes active.

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
