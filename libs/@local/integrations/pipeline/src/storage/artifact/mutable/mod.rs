//! Conditional mutable objects; immutable artifacts use the ordinary publication path.

#[cfg(test)]
use core::sync::atomic::Ordering;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read as _, Write as _},
    path::Path,
};

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use futures_util::StreamExt as _;
use hash_crypto::digest::Sha256Digest;
use object_store::{PutMode, PutOptions, PutPayload, UpdateVersion, path::Path as Location};
use tempfile::NamedTempFile;

use super::ArtifactStorage;
use crate::storage::{ArtifactError, ArtifactKey};

#[cfg(test)]
mod tests;

const MAX_MUTABLE_BYTES: usize = 1024 * 1024;

#[derive(Debug)]
pub(crate) struct MutableObject {
    pub bytes: Bytes,
    pub version: MutableVersion,
}

#[derive(Debug, Clone)]
pub(crate) enum MutableVersion {
    Object(UpdateVersion),
    Local(Sha256Digest),
}

impl ArtifactStorage {
    /// Reads bytes and their conditional-update token in one operation.
    ///
    /// Only a missing key is absence. Reads larger than 1 MiB fail.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Read`] when locking or IO fails, the stored object exceeds
    /// the size bound, or remote storage supplies no usable conditional token.
    #[tracing::instrument(level = "debug", skip_all, fields(key = %key))]
    pub(crate) async fn read_versioned(
        &self,
        key: &ArtifactKey,
    ) -> Result<Option<MutableObject>, Report<ArtifactError>> {
        if let Some(root) = &self.local_root {
            let path = root.join(&*key.0);
            return tokio::task::spawn_blocking(move || {
                let _lock = lock(&path).change_context(ArtifactError::Read)?;
                read_local(&path).change_context(ArtifactError::Read)
            })
            .await
            .change_context(ArtifactError::Read)?;
        }

        let result = match self.store.get(&Location::from(&*key.0)).await {
            Ok(result) => result,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(error) => return Err(Report::new(error).change_context(ArtifactError::Read)),
        };
        if result.meta.size > MAX_MUTABLE_BYTES as u64 {
            return Err(Report::new(ArtifactError::Read).attach("mutable object exceeds 1 MiB"));
        }
        let version = UpdateVersion {
            e_tag: result.meta.e_tag.clone(),
            version: result.meta.version.clone(),
        };
        if !usable(&version) {
            return Err(Report::new(ArtifactError::Read)
                .attach("mutable object has no usable conditional-update token"));
        }
        let mut bytes = Vec::new();
        let mut stream = result.into_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.change_context(ArtifactError::Read)?;
            if chunk.len() > MAX_MUTABLE_BYTES - bytes.len() {
                return Err(Report::new(ArtifactError::Read).attach("mutable object exceeds 1 MiB"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(Some(MutableObject {
            bytes: Bytes::from(bytes),
            version: MutableVersion::Object(version),
        }))
    }

    /// Replaces a key only while its bytes match `expected`, or creates an absent key.
    ///
    /// Returns false exclusively for a conditional conflict. Unsupported conditional IO,
    /// a token for another backend, or a payload larger than 1 MiB fails closed.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Write`] when the payload or token is invalid, locking or
    /// IO fails, or the backend does not support the required conditional operation.
    #[tracing::instrument(level = "debug", skip_all, fields(key = %key))]
    pub(crate) async fn replace_if(
        &self,
        key: &ArtifactKey,
        expected: Option<&MutableVersion>,
        bytes: Bytes,
    ) -> Result<bool, Report<ArtifactError>> {
        if bytes.len() > MAX_MUTABLE_BYTES {
            return Err(Report::new(ArtifactError::Write).attach("mutable object exceeds 1 MiB"));
        }
        #[cfg(test)]
        if self
            .test_conflicts
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |remaining| {
                remaining.checked_sub(1)
            })
            .is_ok()
        {
            return Ok(false);
        }
        if let Some(root) = &self.local_root {
            let expected = match expected {
                None => None,
                Some(MutableVersion::Local(digest)) => Some(*digest),
                Some(MutableVersion::Object(_)) => {
                    return Err(Report::new(ArtifactError::Write)
                        .attach("conditional-update token belongs to another backend"));
                }
            };
            let path = root.join(&*key.0);
            return tokio::task::spawn_blocking(move || {
                replace_local(&path, expected, &bytes).change_context(ArtifactError::Write)
            })
            .await
            .change_context(ArtifactError::Write)?;
        }

        let mode = match expected {
            None => PutMode::Create,
            Some(MutableVersion::Object(version)) if usable(version) => {
                PutMode::Update(version.clone())
            }
            Some(_) => {
                return Err(Report::new(ArtifactError::Write)
                    .attach("invalid conditional-update token for object storage"));
            }
        };
        match self
            .store
            .put_opts(
                &Location::from(&*key.0),
                PutPayload::from(bytes),
                PutOptions {
                    mode,
                    ..PutOptions::default()
                },
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(
                object_store::Error::AlreadyExists { .. }
                | object_store::Error::Precondition { .. },
            ) => Ok(false),
            Err(error) => Err(Report::new(error).change_context(ArtifactError::Write)),
        }
    }
}

fn usable(version: &UpdateVersion) -> bool {
    // The S3 backend requires an ETag for If-Match, including for versioned buckets.
    version
        .e_tag
        .as_ref()
        .is_some_and(|value| !value.is_empty())
}

/// The sidecar is never renamed or deleted, so every process locks the same inode.
fn lock(path: &Path) -> io::Result<File> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("mutable key has no parent"))?;
    fs::create_dir_all(parent)?;
    let mut sidecar = path.as_os_str().to_owned();
    sidecar.push(".lock");
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(sidecar)?;
    file.lock()?;
    Ok(file)
}

/// Called only while the key's stable sidecar lock is held.
fn read_local(path: &Path) -> io::Result<Option<MutableObject>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    file.take(MAX_MUTABLE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_MUTABLE_BYTES {
        return Err(io::Error::other("mutable object exceeds 1 MiB"));
    }
    Ok(Some(MutableObject {
        version: MutableVersion::Local(Sha256Digest::of(&bytes)),
        bytes: Bytes::from(bytes),
    }))
}

fn replace_local(path: &Path, expected: Option<Sha256Digest>, bytes: &[u8]) -> io::Result<bool> {
    let _lock = lock(path)?;
    let current = read_local(path)?;
    let actual = current
        .as_ref()
        .map(|object| Sha256Digest::of(&object.bytes));
    if actual != expected {
        return Ok(false);
    }
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("mutable key has no parent"))?;
    let mut partial = NamedTempFile::new_in(parent)?;
    partial.write_all(bytes)?;
    partial.as_file().sync_all()?;
    #[cfg(test)]
    tests::crash_point("before_rename");
    partial.persist(path).map_err(|error| error.error)?;
    File::open(parent)?.sync_all()?;
    #[cfg(test)]
    tests::crash_point("after_rename");
    Ok(true)
}
