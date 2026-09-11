//! Metadata-last publication preserves complete generations across independent object writes.

use core::pin::pin;

use bytes::Bytes;
use tokio::io::AsyncReadExt as _;

use self::backend::GenerationUploadBackend;
use super::{Generation, GenerationId, GenerationRoot, remote::RemoteRoot};
use crate::{
    file::storage::{Revision, WriteCondition, error::StorageError, path::FilePath},
    integrity::{Sha256, Sha256Digest, Writer},
};

pub(crate) mod backend;
mod error;
#[cfg(test)]
mod tests;

pub(crate) use self::error::UploadError;

/// The destination's selected generation and the revision a promotion writes against.
struct Current {
    id: GenerationId,
    revision: Revision,
}

impl Current {
    /// Reads the pointer object, returning [`None`] when no object exists.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if opening the object, reading its body or parsing its identity
    /// fails.
    async fn read(
        backend: &impl GenerationUploadBackend,
        path: &FilePath,
    ) -> Result<Option<Self>, UploadError> {
        // read one byte beyond the hex identity to detect trailing data.
        const LIMIT: u64 = (Sha256Digest::BYTES * 2 + 1) as u64;

        let contents = match backend.get(path).await {
            Ok(output) => output,
            Err(error) if error.is_not_found() => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let (reader, revision) = contents.into_parts();

        let mut body = String::new();
        let mut reader = pin!(reader.take(LIMIT));
        reader.read_to_string(&mut body).await?;
        let id = body.parse()?;

        Ok(Some(Self { id, revision }))
    }
}

/// A confirmed current-pointer update and its advisory previous-pointer result.
#[derive(Debug)]
pub(crate) struct Promotion {
    pub id: GenerationId,
    pub previous_error: Option<StorageError>,
}

/// A generation publisher with the current-pointer precondition captured before fitting.
///
/// Repository prefixes retain every uploaded generation. Promotion completes an active prefix
/// before selecting it through the captured precondition. Writing the original metadata document
/// after its artifacts completes each prefix.
pub(crate) struct Upload<'path, B> {
    backend: B,
    root: &'path GenerationRoot,
    remote: &'path RemoteRoot,
    current: Option<Current>,
}

impl<'path, B> Upload<'path, B>
where
    B: GenerationUploadBackend,
{
    /// Captures the current-pointer value and its write precondition.
    ///
    /// `destination` is the parent path of the `generations/` namespace.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if constructing the pointer path, reading the object or parsing its
    /// identity fails. Only a missing object establishes an absent pointer.
    pub(crate) async fn prepare(
        backend: B,
        root: &'path GenerationRoot,
        destination: &'path FilePath,
    ) -> Result<Self, UploadError> {
        let mut this = Self {
            backend,
            root,
            remote: RemoteRoot::from_ref(destination),
            current: None,
        };

        this.current = Current::read(&this.backend, &this.remote.current()?).await?;

        Ok(this)
    }

    /// Opens the local publication `id` on a blocking worker.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if the worker fails to return its result or the generation does
    /// not open.
    async fn open(&self, id: GenerationId) -> Result<Generation, UploadError> {
        let root = self.root.clone();

        // I/O bound, not CPU bound
        tokio::task::spawn_blocking(move || root.open(id))
            .await?
            .map_err(From::from)
    }

    /// Confirms that the object at `path` hashes to `expected`.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if reading the object fails, and [`UploadError::Checksum`] when its
    /// bytes hash to another digest.
    async fn verify_destination(
        &self,
        path: FilePath,
        expected: Sha256Digest,
    ) -> Result<(), UploadError> {
        let actual = {
            let mut body = pin!(self.backend.read(&path).await?);
            let mut writer = Writer {
                accumulator: Sha256::new(),
                writer: tokio::io::sink(),
            };

            tokio::io::copy(&mut body, &mut writer).await?;
            writer.accumulator.finalize()
        };

        if actual != expected {
            return Err(UploadError::Checksum {
                path,
                expected,
                actual,
            });
        }

        Ok(())
    }

    /// Completes one object write, verifying an existing object when the precondition rejected it.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] for a failed write or a failed verification, and
    /// [`UploadError::Checksum`] when an existing object holds other bytes.
    async fn finish_object(
        &self,
        path: FilePath,
        expected: Sha256Digest,
        result: Result<(), StorageError>,
    ) -> Result<(), UploadError> {
        match result {
            Ok(()) => Ok(()),
            Err(error) if error.is_precondition_failed() => {
                // a failed precondition can mean the file already exists. verification decides
                // between the same content and a different file with the same name.
                self.verify_destination(path, expected).await
            }
            Err(error) => Err(error.into()),
        }
    }

    /// Completes the repository prefix, retaining the generation's original metadata bytes.
    ///
    /// A retry reuses an existing object only after its bytes match the expected digest. Each
    /// transfer verifies its local artifact first. Local artifacts must remain unchanged until
    /// transfer completes.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if opening, verification or transfer fails. A failed attempt can
    /// leave an incomplete prefix available for a later retry.
    #[tracing::instrument(skip_all, fields(%id), err)]
    pub(crate) async fn upload(&self, id: GenerationId) -> Result<(), UploadError> {
        let mut generation = self.open(id).await?;
        let repository = self.remote.repository(id)?;

        for file in generation.repository().files.files() {
            let destination = repository.artifact(&file.name)?;

            // spawning in tokio not rayon as it's primarily I/O bound
            let hash = file.hash;
            let (returned, path) = tokio::task::spawn_blocking(move || {
                file.verify(&generation).map(|path| (generation, path))
            })
            .await??;

            generation = returned;
            let result = self
                .backend
                .upload(&destination, path.as_ref(), WriteCondition::Absent)
                .await;

            self.finish_object(destination, hash, result).await?;
        }

        let destination = repository.metadata()?;

        let result = self
            .backend
            .put(
                &destination,
                generation.into_document().into_bytes(),
                WriteCondition::Absent,
            )
            .await;

        self.finish_object(destination, id.digest(), result).await
    }

    /// Completes an active prefix and selects it against the captured current pointer.
    ///
    /// A completed repository prefix supplies the copy sources. The current-pointer write makes one
    /// attempt. A successful [`Promotion`] retains any error from updating advisory previous.
    ///
    /// # Errors
    ///
    /// Returns [`UploadError`] if opening, copying or selection fails. [`UploadError::Conflict`]
    /// preserves a rejected precondition. Other failures retain their storage error, including
    /// transport failures with unknown write outcomes.
    #[tracing::instrument(skip_all, fields(%id), err)]
    pub(crate) async fn promote(self, id: GenerationId) -> Result<Promotion, UploadError> {
        let generation = self.open(id).await?;
        let repository = self.remote.repository(id)?;
        let active = self.remote.active(id)?;

        self.verify_destination(repository.metadata()?, id.digest())
            .await?;
        for file in generation.repository().files.files() {
            let source = repository.artifact(&file.name)?;
            let destination = active.artifact(&file.name)?;

            let result = self
                .backend
                .copy(&source, &destination, WriteCondition::Absent)
                .await;

            self.finish_object(destination, file.hash, result).await?;
        }

        let destination = active.metadata()?;

        let result = self
            .backend
            .put(
                &destination,
                generation.into_document().into_bytes(),
                WriteCondition::Absent,
            )
            .await;

        self.finish_object(destination, id.digest(), result).await?;

        let current = self.remote.current()?;
        let previous = self.remote.previous()?;

        let previous_id = self.current.as_ref().map(|current| current.id);
        let condition = self.current.map_or(WriteCondition::Absent, |current| {
            WriteCondition::Match(current.revision)
        });

        if let Err(error) = self
            .backend
            .put(&current, Bytes::from(id.to_string()), condition)
            .await
        {
            return Err(if error.is_precondition_failed() {
                UploadError::Conflict(error)
            } else {
                error.into()
            });
        }

        let previous_error = if let Some(id) = previous_id {
            self.backend
                .put(&previous, Bytes::from(id.to_string()), WriteCondition::Any)
                .await
                .err()
        } else {
            None
        };

        Ok(Promotion { id, previous_error })
    }
}
