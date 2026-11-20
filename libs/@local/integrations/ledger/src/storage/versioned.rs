use error_stack::{Report, ResultExt as _};
use object_store::{
    ObjectMeta, PutMode, PutOptions, PutPayload, UpdateVersion, path::Path as Location,
};

use super::{Storage, StorageError};

/// The largest versioned file that is read or written, in bytes.
pub(super) const MAX_VERSIONED_BYTES: usize = 16 * 1024 * 1024;

// Origin: `CasVersionV1` in labs `pocs/integrations_rs/src/blob.rs`.
/// The version of a file read by [`Storage::read_versioned`], which [`Storage::replace_if`]
/// compares before it writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CasVersion {
    /// The object's entity tag.
    pub e_tag: Option<String>,
    /// The object's version, on a bucket that keeps versions.
    pub provider_version: Option<String>,
}

impl Storage {
    // Origin: `get_cas_document_bounded` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Returns the bytes at `key` and their version, or `None` if the key is missing.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Read`] if the file cannot be read or is larger than
    /// [`MAX_VERSIONED_BYTES`]. A larger file is refused before its bytes are downloaded.
    pub(crate) async fn read_versioned(
        &self,
        key: &str,
    ) -> Result<Option<(Vec<u8>, CasVersion)>, Report<StorageError>> {
        let result = match self.store.get(&Location::from(key)).await {
            Ok(result) => result,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(error) => return Err(Report::new(error).change_context(StorageError::Read)),
        };
        if result.meta.size > MAX_VERSIONED_BYTES as u64 {
            return Err(Report::new(StorageError::Read));
        }
        let version = cas_version(&result.meta);
        let bytes = result.bytes().await.change_context(StorageError::Read)?;
        Ok(Some((Vec::from(bytes), version)))
    }

    // Origin: `put_cas_document` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Writes `bytes` to `key` if the file there still has the version `expected`, or if the key
    /// is missing when `expected` is `None`.
    ///
    /// Returns `false` if the file has another version and nothing was written. The check and the
    /// write are one step, also across processes.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Write`] if `bytes` are larger than [`MAX_VERSIONED_BYTES`] or the
    /// write fails.
    pub(crate) async fn replace_if(
        &self,
        key: &str,
        expected: Option<&CasVersion>,
        bytes: Vec<u8>,
    ) -> Result<bool, Report<StorageError>> {
        if bytes.len() > MAX_VERSIONED_BYTES {
            return Err(Report::new(StorageError::Write));
        }
        let mode = expected.map_or(PutMode::Create, |expected| {
            PutMode::Update(UpdateVersion {
                e_tag: expected.e_tag.clone(),
                version: expected.provider_version.clone(),
            })
        });
        let options = PutOptions {
            mode,
            ..PutOptions::default()
        };
        match self
            .store
            .put_opts(&Location::from(key), PutPayload::from(bytes), options)
            .await
        {
            Ok(_) => Ok(true),
            Err(
                object_store::Error::AlreadyExists { .. }
                | object_store::Error::Precondition { .. },
            ) => Ok(false),
            Err(error) => Err(Report::new(error).change_context(StorageError::Write)),
        }
    }
}

// Origin: `cas_version` in labs `pocs/integrations_rs/src/blob.rs`.
fn cas_version(meta: &ObjectMeta) -> CasVersion {
    CasVersion {
        e_tag: meta.e_tag.clone(),
        provider_version: meta.version.clone(),
    }
}
