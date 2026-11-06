use hash_crypto::digest::Sha256Digest;
use hash_integrations_definition::{ConnectorId, SourceName};
use uuid::Uuid;

use super::{ArtifactKey, hex};

// Origin: `BlobNamespace::v1` in labs `pocs/integrations_rs/src/blob.rs`, whose root comes from
// `Keyspace::integration_root` and the integration path of `routing::route`.
/// Where the artifacts of one integration are stored:
/// `tenants/{web}/integrations/{sha256("{web}:{connector}")}`.
///
/// This is the one place that knows the storage layout: every [`ArtifactKey`] is built here. The
/// layout is a storage format, so it must stay stable across releases. Its tenant root and the
/// integration digest match the durable kernel's keyspace and routing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactNamespace {
    root: Box<str>,
}

impl ArtifactNamespace {
    #[must_use]
    pub fn new(web: Uuid, connector: &ConnectorId) -> Self {
        let integration = Sha256Digest::of(format!("{web}:{connector}").as_bytes()).to_bytes();
        Self {
            root: format!("tenants/{web}/integrations/{}", hex(&integration)).into(),
        }
    }

    // Origin: the capture path of `CaptureStore::path` in `sources/mod.rs` (hashintel/hash#10133,
    // hashintel/hash#10383).
    /// The key the capture of `source` in the run `run` is bound to, named after the
    /// `fingerprint` of the source's definition so that a changed definition is captured again.
    pub(crate) fn capture(&self, run: Uuid, source: &SourceName, fingerprint: &str) -> ArtifactKey {
        ArtifactKey(format!("{}/captures/{run}/{source}.{fingerprint}.json", self.root).into())
    }

    // Origin: `Keyspace::artifact_prefix` in the durable kernel (`durable-kernel/src/keyspace.rs`),
    // below the integration root and without a kind.
    /// The prefix artifacts are published under.
    #[must_use]
    pub fn artifacts(&self) -> ArtifactKey {
        ArtifactKey(format!("{}/artifacts", self.root).into())
    }
}
