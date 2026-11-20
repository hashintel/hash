use std::{
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{self, Write as _},
    path::Path,
};

use error_stack::{Report, ResultExt as _};
use hash_crypto::digest::Sha256Digest;
use object_store::{
    ObjectMeta, PutMode, PutOptions, PutPayload, UpdateVersion, path::Path as Location,
};
use uuid::Uuid;

use super::ArtifactStorage;
use crate::storage::{ArtifactError, ArtifactKey};

/// The largest versioned file that is read or written, in bytes.
const MAX_VERSIONED_BYTES: usize = 1024 * 1024;

// Origin: `CasVersionV1` in labs `pocs/integrations_rs/src/blob.rs`, without the versioned
// wrapper and serde.
/// The version of a file read by [`ArtifactStorage::read_versioned`], which
/// [`ArtifactStorage::replace_if`] compares before it writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CasVersion {
    /// The object's entity tag on S3.
    pub e_tag: Option<String>,
    /// The object's version on S3, or the SHA-256 of a local file as hex text.
    pub provider_version: Option<String>,
}

impl ArtifactStorage {
    // Origin: `get_cas_document_bounded` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Returns the bytes at `key` and their version, or `None` if the key is missing.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Read`] if the file cannot be read or is larger than 1 MiB. A
    /// larger file is refused before its bytes are downloaded.
    pub async fn read_versioned(
        &self,
        key: &ArtifactKey,
    ) -> Result<Option<(Vec<u8>, CasVersion)>, Report<ArtifactError>> {
        let result = match self.store.get(&Location::from(&*key.0)).await {
            Ok(result) => result,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(error) => return Err(Report::new(error).change_context(ArtifactError::Read)),
        };
        if result.meta.size > MAX_VERSIONED_BYTES as u64 {
            return Err(Report::new(ArtifactError::Read));
        }
        let meta = result.meta.clone();
        let bytes = result.bytes().await.change_context(ArtifactError::Read)?;
        let version = if self.local_root.is_some() {
            local_cas_version(&bytes)
        } else {
            cas_version(&meta)
        };
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
    /// Returns [`ArtifactError::Write`] if `bytes` are larger than 1 MiB or the write fails, or
    /// [`ArtifactError::Read`] if the local file to compare cannot be read.
    pub async fn replace_if(
        &self,
        key: &ArtifactKey,
        expected: Option<&CasVersion>,
        bytes: Vec<u8>,
    ) -> Result<bool, Report<ArtifactError>> {
        if bytes.len() > MAX_VERSIONED_BYTES {
            return Err(Report::new(ArtifactError::Write));
        }
        if let Some(root) = &self.local_root {
            let root = root.clone();
            let destination = root.join(&*key.0);
            let expected = expected.cloned();
            return tokio::task::spawn_blocking(move || {
                local_replace_if(&root, &destination, expected.as_ref(), &bytes)
            })
            .await
            .change_context(ArtifactError::Write)?;
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
            .put_opts(&Location::from(&*key.0), PutPayload::from(bytes), options)
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

// Origin: `cas_version` in labs `pocs/integrations_rs/src/blob.rs`.
fn cas_version(meta: &ObjectMeta) -> CasVersion {
    CasVersion {
        e_tag: meta.e_tag.clone(),
        provider_version: meta.version.clone(),
    }
}

// Origin: `local_cas_version` in labs `pocs/integrations_rs/src/blob.rs`.
fn local_cas_version(bytes: &[u8]) -> CasVersion {
    CasVersion {
        e_tag: None,
        provider_version: Some(hex::encode(Sha256Digest::of(bytes).to_bytes())),
    }
}

// Origin: `local_put_json` in labs `pocs/integrations_rs/src/blob.rs`, locking with the standard
// library instead of `fs4`.
/// Writes `bytes` to `destination` if its version is `expected`, comparing and replacing under a
/// lock file in `root`.
///
/// The local object store cannot update conditionally, so every handle and process that writes
/// under `root` takes the same lock.
fn local_replace_if(
    root: &Path,
    destination: &Path,
    expected: Option<&CasVersion>,
    bytes: &[u8],
) -> Result<bool, Report<ArtifactError>> {
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join(".integrations-cas.lock"))
        .change_context(ArtifactError::Write)?;
    lock.lock().change_context(ArtifactError::Write)?;

    let current = match fs::read(destination) {
        Ok(current) => Some(current),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(Report::new(error).change_context(ArtifactError::Read)),
    };
    if current.as_deref().map(local_cas_version).as_ref() != expected {
        return Ok(false);
    }

    let parent = destination
        .parent()
        .ok_or_else(|| Report::new(ArtifactError::Write))?;
    let filename = destination
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| Report::new(ArtifactError::Write))?;
    // Directories created for this file must be synced up to the root, so that the renamed file
    // survives a power loss.
    let synced = if parent.is_dir() { parent } else { root };
    fs::create_dir_all(parent).change_context(ArtifactError::Write)?;
    // Temporary files are created and removed only under the lock, so one found here was left by
    // a writer that crashed.
    if let Ok(entries) = fs::read_dir(parent) {
        let stale = cas_temp_prefix(filename);
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with(&stale))
            {
                let _removed = fs::remove_file(entry.path());
            }
        }
    }

    let temporary = parent.join(cas_temp_name(filename));
    let written = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .change_context(ArtifactError::Write)?;
        file.write_all(bytes).change_context(ArtifactError::Write)?;
        file.sync_all().change_context(ArtifactError::Write)?;
        drop(file);
        fs::rename(&temporary, destination).change_context(ArtifactError::Write)?;
        fsync_ancestors(parent, synced)
    })();
    if written.is_err() {
        let _removed = fs::remove_file(&temporary);
    }
    written.map(|()| true)
}

// Origin: `fsync_ancestors` in labs `pocs/integrations_rs/src/blob.rs`, ending at `to` instead of
// at the root.
/// Syncs the directory `from` and each of its ancestors up to `to` inclusive.
fn fsync_ancestors(from: &Path, to: &Path) -> Result<(), Report<ArtifactError>> {
    let mut directory = from;
    loop {
        File::open(directory)
            .and_then(|handle| handle.sync_all())
            .change_context(ArtifactError::Write)?;
        if directory == to {
            return Ok(());
        }
        directory = directory
            .parent()
            .ok_or_else(|| Report::new(ArtifactError::Write))?;
    }
}

// Origin: `cas_temp_name` in labs `pocs/integrations_rs/src/blob.rs`.
/// A new name for a temporary file that replaces `filename`.
fn cas_temp_name(filename: &str) -> String {
    format!("{}{}", cas_temp_prefix(filename), Uuid::new_v4())
}

// Origin: `cas_temp_prefix` in labs `pocs/integrations_rs/src/blob.rs`.
/// The start of the name of every temporary file that replaces `filename`.
fn cas_temp_prefix(filename: &str) -> String {
    format!(".{filename}.cas-")
}
