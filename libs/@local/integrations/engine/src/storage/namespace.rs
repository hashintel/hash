use hash_integrations_definition::SourceName;
use uuid::Uuid;

use super::ArtifactKey;

// Origin: `BlobNamespace` in labs `pocs/integrations_rs/src/blob.rs`, scoped to a web only.
/// Where the artifacts of a web are stored.
///
/// This is the one place that knows the storage layout: every [`ArtifactKey`] is built here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArtifactNamespace {
    web: Uuid,
}

impl ArtifactNamespace {
    #[must_use]
    pub const fn new(web: Uuid) -> Self {
        Self { web }
    }

    // Origin: the capture layout of `CaptureStore::path` in `sources/mod.rs`
    // (hashintel/hash#10133).
    /// The key of the capture of `source` in the run `run`.
    pub(crate) fn capture(&self, run: Uuid, source: &SourceName) -> ArtifactKey {
        ArtifactKey(format!("{}/{run}/{source}.parquet", self.web).into())
    }

    // Origin: the `artifacts/{kind}` prefix of `Keyspace::artifact_prefix` in the durable kernel
    // (`durable-kernel/src/keyspace.rs`), without its tenant namespace.
    /// The prefix artifacts of `kind` are published under.
    #[must_use]
    pub fn artifacts(&self, kind: &str) -> ArtifactKey {
        ArtifactKey(format!("{}/artifacts/{kind}", self.web).into())
    }
}
