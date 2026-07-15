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

pub(crate) use self::{
    artifact::VerifiedArtifact,
    error::{ArtifactVerificationError, ManifestError, ManifestLoadError, ManifestPublishError},
    model::*,
    publish::{PublishedManifest, load_verified_manifest_with_artifacts, publish_manifest},
};

#[cfg(test)]
pub(crate) mod tests;
#[cfg(test)]
pub(crate) use tests::{fixture_manifest, publish_fixture_artifacts};
