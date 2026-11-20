use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use object_store::{PutMode, PutOptions, PutPayload, path::Path as Location};

use super::{ArtifactRef, ArtifactStorage};
use crate::storage::{ArtifactError, ArtifactKey};

/// The largest binding that is read, in bytes. A binding holds one serialized reference.
const MAX_BINDING_BYTES: usize = 64 * 1024;

/// The outcome of binding a reference to a key.
#[must_use]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Bound {
    /// The reference is now bound to the key.
    Created,
    /// Another reference was already bound to the key and was kept.
    Exists,
}

impl ArtifactStorage {
    // Origin: `create_cas_document` in labs `pocs/integrations_rs/src/blob.rs`, storing the
    // reference that labs records in an `ArtifactPublished` journal event.
    /// Stores `artifact` at `key` unless a reference is already bound there.
    ///
    /// The write is a single conditional put, so of several attempts that bind one key, exactly
    /// one creates the binding, also across processes.
    pub(crate) async fn bind(
        &self,
        key: &ArtifactKey,
        artifact: &ArtifactRef,
    ) -> Result<Bound, Report<ArtifactError>> {
        let bytes = serde_json::to_vec(artifact).change_context(ArtifactError::Write)?;
        let options = PutOptions {
            mode: PutMode::Create,
            ..PutOptions::default()
        };
        match self
            .store
            .put_opts(&Location::from(&*key.0), PutPayload::from(bytes), options)
            .await
        {
            Ok(_) => Ok(Bound::Created),
            Err(object_store::Error::AlreadyExists { .. }) => Ok(Bound::Exists),
            Err(error) => Err(Report::new(error).change_context(ArtifactError::Write)),
        }
    }

    /// Returns the reference bound at `key`, if there is one.
    pub(crate) async fn bound(
        &self,
        key: &ArtifactKey,
    ) -> Result<Option<ArtifactRef>, Report<ArtifactError>> {
        let bytes: Bytes = match self.store.get(&Location::from(&*key.0)).await {
            Ok(result) => {
                if result.meta.size > MAX_BINDING_BYTES as u64 {
                    return Err(Report::new(ArtifactError::Read));
                }
                result.bytes().await.change_context(ArtifactError::Read)?
            }
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(error) => return Err(Report::new(error).change_context(ArtifactError::Read)),
        };
        serde_json::from_slice(&bytes)
            .map(Some)
            .change_context(ArtifactError::Read)
    }
}
