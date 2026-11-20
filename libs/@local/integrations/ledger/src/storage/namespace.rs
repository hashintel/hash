use hash_crypto::digest::Sha256Digest;
use hash_integrations_definition::ConnectorId;
use uuid::Uuid;

// Origin: `ArtifactNamespace` of hashintel/hash#10392, which comes from `BlobNamespace::v1` in
// labs `pocs/integrations_rs/src/blob.rs`, with its root from `Keyspace::integration_root` and
// the integration path of `routing::route`.
/// Where the state of one integration is stored in the bucket:
/// `tenants/{web}/integrations/{sha256("{web}:{connector}")}`.
///
/// The connector is the one the definition names. The layout is a storage format, so it must
/// stay stable across releases.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntegrationNamespace {
    root: Box<str>,
}

impl IntegrationNamespace {
    #[must_use]
    pub fn new(web: Uuid, connector: &ConnectorId) -> Self {
        let integration = Sha256Digest::of(format!("{web}:{connector}").as_bytes()).to_bytes();
        Self {
            root: format!("tenants/{web}/integrations/{}", hex::encode(integration)).into(),
        }
    }

    pub(super) fn root(&self) -> &str {
        &self.root
    }
}
