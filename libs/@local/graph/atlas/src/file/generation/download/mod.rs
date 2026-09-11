//! Verified remote generations for local activation.
//!
//! [`Download`] acquires publications into a [`GenerationRoot`] and updates its current pointer.
//! Runtime maintenance can consume that pointer through the same path as a local fit. Acquisition
//! preserves the received metadata bytes because their digest is the generation identity.

use core::{pin::pin, time::Duration};
use std::fs;

use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    time::MissedTickBehavior,
};

use self::backend::GenerationDownloadBackend;
use super::{
    ActivateError, GenerationDocument, GenerationId, GenerationRoot, SealError, StagedGeneration,
    remote::RemoteRoot,
};
use crate::{
    file::{repository::RepositoryFile, storage::path::FilePath},
    integrity::{Sha256, Sha256Digest, Writer},
};

pub(crate) mod backend;
mod error;
#[cfg(test)]
mod tests;

pub(crate) use self::error::DownloadError;

pub(crate) struct DownloadOptions {
    pub poll_interval: Duration = Duration::from_secs(1),
}

/// A remote generation source synchronized into a local root.
///
/// Completed downloads preserve the original metadata encoding. Local reuse verifies the complete
/// publication before activation. After successful synchronization, an unchanged remote identity
/// needs only a local pointer and directory check. Published contents must remain immutable.
pub(crate) struct Download<B> {
    backend: B,
    root: GenerationRoot,
    source: FilePath,
    synchronized: Option<GenerationId>,
}

impl<B> Download<B>
where
    B: GenerationDownloadBackend,
{
    /// Configures acquisition from the parent of the remote `generations/` namespace.
    pub(crate) const fn new(backend: B, root: GenerationRoot, source: FilePath) -> Self {
        Self {
            backend,
            root,
            source,
            synchronized: None,
        }
    }

    /// Reads the remote selection, returning [`None`] when its pointer is absent.
    ///
    /// # Errors
    ///
    /// Returns [`DownloadError`] if reading the pointer fails or its contents are not a canonical
    /// generation identity.
    async fn current(&self) -> Result<Option<GenerationId>, DownloadError> {
        // read one byte beyond the hex identity to detect trailing data.
        const LIMIT: u64 = (Sha256Digest::BYTES * 2 + 1) as u64;

        let path = RemoteRoot::from_ref(&self.source).current()?;
        let reader = match self.backend.read(&path).await {
            Ok(reader) => reader,
            Err(error) if error.is_not_found() => return Ok(None),
            Err(error) => return Err(error.into()),
        };

        let mut reader = pin!(reader.take(LIMIT));

        let mut body = String::new();
        reader.read_to_string(&mut body).await?;

        Ok(Some(body.parse()?))
    }

    /// Reads the metadata bytes bound to `id`.
    ///
    /// Buffers the complete document before identity verification and parsing. The resulting
    /// [`GenerationDocument`] retains its original encoding for publication.
    ///
    /// # Errors
    ///
    /// Returns [`DownloadError`] if reading or validating the metadata fails.
    async fn download_document(
        &self,
        id: GenerationId,
        active: &super::remote::RemoteGeneration,
    ) -> Result<GenerationDocument, DownloadError> {
        let path = active.metadata()?;
        let mut reader = pin!(self.backend.read(&path).await?);

        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;

        GenerationDocument::new(id, bytes).map_err(From::from)
    }

    /// Writes an artifact to staging while computing its digest.
    ///
    /// Pending writes finish before this returns, including after a read failure. The returned
    /// digest covers the received bytes without comparing them with the expected hash.
    ///
    /// # Errors
    ///
    /// Returns [`DownloadError`] if opening either file or transferring its contents fails. A read
    /// failure takes precedence over a later flush failure.
    async fn download_file(
        &self,
        staging: &StagedGeneration,
        file: &RepositoryFile,
        path: &FilePath,
    ) -> Result<Sha256Digest, DownloadError> {
        let mut reader = pin!(self.backend.read(path).await?);
        let output = tokio::fs::File::create(staging.path_of(&file.name)).await?;

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: output,
        };

        let result = tokio::io::copy_buf(&mut reader, &mut writer).await;

        // Tokio file writes can still be in progress after the source fails. Flush joins that work
        // before staging cleanup, while the source failure remains the primary error.
        let flushed = writer.flush().await;
        if let Err(error) = result {
            if let Err(flush_error) = flushed {
                tracing::warn!(?flush_error, "failed to flush an incomplete download");
            }

            return Err(error.into());
        }

        flushed?;
        Ok(writer.accumulator.finalize())
    }

    /// Downloads a complete publication and activates its verified local copy.
    ///
    /// Artifact checksums must match the received metadata before publication. If another
    /// acquisition publishes `id` first, activation verifies that publication under the root lock.
    ///
    /// # Errors
    ///
    /// Returns [`DownloadError`] if acquisition, publication or activation fails. Staging cleanup
    /// reports removal failures without replacing the acquisition error. A failure after replacing
    /// current can leave the generation selected.
    async fn acquire(&self, id: GenerationId) -> Result<(), DownloadError> {
        let active = RemoteRoot::from_ref(&self.source).active(id)?;

        let document = self.download_document(id, &active).await?;

        let root = self.root.clone();
        let staging = tokio::task::spawn_blocking(move || root.stage()).await??;

        for file in document.repository().files.files() {
            let path = active.artifact(&file.name)?;

            let actual = self.download_file(&staging, &file, &path).await?;
            if actual != file.hash {
                drop(staging);

                return Err(DownloadError::Checksum {
                    path,
                    expected: file.hash,
                    actual,
                });
            }
        }

        let root = self.root.clone();
        tokio::task::spawn_blocking(move || {
            match staging.import(&document) {
                Ok(_) | Err(SealError::AlreadyPublished(_)) => {}
                Err(error) => return Err(DownloadError::from(error)),
            }

            root.activate_verified(id)?;
            Ok(())
        })
        .await?
    }

    /// Acquires the remote current generation and selects its verified local publication.
    ///
    /// A missing remote pointer preserves local current and returns [`None`]. Existing local
    /// publications must pass verification before reuse. A corrupt publication remains untouched.
    /// Each call samples remote current once and uses that identity throughout acquisition. Retain
    /// this future until completion, including during graceful shutdown.
    ///
    /// # Errors
    ///
    /// Returns [`DownloadError`] for source, verification or local publication failures. Failures
    /// before pointer replacement preserve local current. A post-rename synchronization failure
    /// can leave the requested generation selected. Only successful activation records reuse for
    /// a later unchanged call.
    #[tracing::instrument(skip_all, err)]
    pub(crate) async fn synchronize(&mut self) -> Result<Option<GenerationId>, DownloadError> {
        let Some(id) = self.current().await? else {
            return Ok(None);
        };

        if self.synchronized == Some(id) {
            let root = self.root.clone();
            let unchanged = tokio::task::spawn_blocking(move || {
                // both the current-pointer read and directory lookup perform blocking filesystem
                // I/O.
                if root.current()? != Some(id) {
                    return Ok::<_, DownloadError>(false);
                }

                match fs::metadata(root.generation_path(id)) {
                    Ok(metadata) => Ok(metadata.is_dir()),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
                    Err(error) => Err(error.into()),
                }
            })
            .await??;

            if unchanged {
                return Ok(Some(id));
            }
        }

        let root = self.root.clone();
        match tokio::task::spawn_blocking(move || root.activate_verified(id)).await? {
            Ok(()) => {}
            Err(ActivateError::Unpublished(_)) => self.acquire(id).await?,
            Err(error) => return Err(error.into()),
        }

        self.synchronized = Some(id);
        Ok(Some(id))
    }

    /// Polls immediately, then at `poll_interval`, retaining each started synchronization.
    ///
    /// The loop reports failures and retries on a later poll. Shutdown stops new polls and waits
    /// for the active synchronization, including its filesystem work. Configure finite backend
    /// timeouts to bound shutdown while the source is unavailable.
    ///
    /// # Panics
    ///
    /// Panics if `poll_interval` is zero.
    pub(crate) async fn run(
        &mut self,
        DownloadOptions { poll_interval }: DownloadOptions,
        shutdown: impl Future<Output = ()>,
    ) {
        let mut shutdown = pin!(shutdown);
        let mut interval = tokio::time::interval(poll_interval);
        interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                biased;
                () = &mut shutdown => break,
                _tick = interval.tick() => {}
            }

            if let Err(error) = self.synchronize().await {
                tracing::warn!(?error, "failed to synchronize the remote generation");
            }
        }
    }

    pub(crate) const fn into_task(self, options: DownloadOptions) -> DownloadTask<B> {
        DownloadTask {
            download: self,
            options,
        }
    }
}

pub(crate) struct DownloadTask<B> {
    download: Download<B>,
    options: DownloadOptions,
}

impl<B> DownloadTask<B> {
    pub(crate) async fn run(mut self, shutdown: impl Future<Output = ()>)
    where
        B: GenerationDownloadBackend,
    {
        self.download.run(self.options, shutdown).await;
    }
}
