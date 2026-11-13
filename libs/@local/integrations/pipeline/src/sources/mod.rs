//! Captures live sources as immutable artifacts and reuses each run's winning bindings.

mod fingerprint;
mod http;
mod postgres;
mod rest;
mod secrets;
#[cfg(test)]
pub(crate) mod tests;

use alloc::collections::BTreeMap;
use core::num::NonZero;
use std::path::{Component, Path, PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, Source, SourceKind, SourceName};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use self::fingerprint::fingerprint;
pub use self::secrets::{GraphVaultConfig, GraphVaultSecretStore, SecretStore, SecretValue};
use crate::{
    ArtifactRef, ArtifactStorage, ByteSize, Format, SourceCapture, Workspace,
    storage::{ArtifactKey, ArtifactNamespace, Bound},
};

/// Identifies the service involved in resolving a User Secret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum SecretService {
    Graph,
    Vault,
}

/// Reports why a live source could not be captured or restored.
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum SourceError {
    #[display("source configuration is invalid")]
    Configuration,
    #[display("source storage could not be read")]
    Read,
    #[display("source capture could not be published")]
    Write,
    #[display("source capture could not be loaded into the workspace")]
    Load,
    #[display("source query failed")]
    Query,
    #[display("User Secret is unavailable or invalid")]
    Secret,
    #[display("{service} secret request failed")]
    SecretRequest { service: SecretService },
    #[display("{service} secret request returned HTTP {status}; expected 200 OK")]
    SecretStatus { service: SecretService, status: u16 },
    #[display("{service} secret response could not be decoded")]
    SecretResponse { service: SecretService },
    #[display("Graph secret query returned {count} entities; expected exactly one")]
    SecretEntityCount { count: usize },
    #[display("User Secret entity has an unexpected identity, type, or archive state")]
    SecretEntity,
    #[display("User Secret expiry is missing or invalid")]
    SecretExpiry,
    #[display("User Secret has expired")]
    SecretExpired,
    #[display("User Secret Vault path is missing or invalid")]
    SecretPath,
    #[display("User Secret value is empty or invalid")]
    SecretValue,
    #[display("PostgreSQL source capture failed")]
    Postgres,
    #[display("REST destination must use HTTP or HTTPS and public addresses")]
    Destination,
    #[display("REST request failed")]
    Request,
    #[display("REST server returned HTTP {status}")]
    Status { status: u16 },
    #[display("REST response is invalid or exceeds 16 MiB")]
    Response,
    #[display("REST pagination is invalid or repeats a page")]
    Pagination,
}

/// Resource limits for the isolated database used by network connectors.
#[derive(Debug, Default, Clone, Copy)]
pub struct CaptureLimits {
    pub memory_limit: Option<ByteSize>,
    pub temp_directory_limit: Option<ByteSize>,
    pub threads: Option<NonZero<usize>>,
}

/// The owner and stable identity shared by retries and restores of a run.
#[derive(Debug, Clone, Copy)]
pub struct CaptureRun {
    pub web: Uuid,
    pub actor: Uuid,
    pub id: Uuid,
}

/// Local source files and durable captures, kept apart.
#[derive(Debug)]
pub struct CaptureStore {
    local: PathBuf,
    captures: ArtifactStorage,
}

impl CaptureStore {
    /// Opens a local source root and creates the local capture directory if needed.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Read`] if the local root cannot be opened,
    /// [`SourceError::Write`] if the capture directory cannot be created, or
    /// [`SourceError::Configuration`] if either is not a directory or one contains the other.
    pub fn new(local: &Path, captures: ArtifactStorage) -> Result<Self, Report<SourceError>> {
        let local = local.canonicalize().change_context(SourceError::Read)?;
        let directory = captures.directory().change_context(SourceError::Write)?;
        // A capture inside the local root could be read as a local source by any definition,
        // bypassing the web and run isolation of the capture store.
        if !local.is_dir()
            || !directory.is_dir()
            || local.starts_with(&directory)
            || directory.starts_with(&local)
        {
            return Err(Report::new(SourceError::Configuration));
        }
        Ok(Self { local, captures })
    }

    fn local_file(&self, key: &str) -> Result<PathBuf, Report<SourceError>> {
        if key.is_empty()
            || Path::new(key)
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Err(Report::new(SourceError::Configuration));
        }
        let file = self
            .local
            .join(key)
            .canonicalize()
            .change_context(SourceError::Read)?;
        if !file.starts_with(&self.local) || !file.is_file() {
            return Err(Report::new(SourceError::Read));
        }
        Ok(file)
    }

    /// Restores the winning immutable capture and reads its row count from the Parquet footer.
    async fn restore(
        &self,
        key: &ArtifactKey,
        staging: &Path,
    ) -> Result<Option<CapturedSource>, Report<SourceError>> {
        let Some(file) = self
            .captures
            .bound(key)
            .await
            .change_context(SourceError::Read)?
        else {
            return Ok(None);
        };
        let path = self
            .captures
            .materialize(&file, staging)
            .await
            .change_context(SourceError::Read)?;
        let capture = tokio::task::spawn_blocking(move || SourceCapture::open(path))
            .await
            .change_context(SourceError::Read)?
            .change_context(SourceError::Read)?;
        Ok(Some(CapturedSource {
            file,
            rows: capture.rows(),
        }))
    }

    /// Publishes before binding; a losing attempt adopts the winning file and its row count.
    async fn store(
        &self,
        namespace: &ArtifactNamespace,
        key: &ArtifactKey,
        capture: &SourceCapture,
        staging: &Path,
    ) -> Result<CapturedSource, Report<SourceError>> {
        let file = self
            .captures
            .publish(&namespace.artifacts(), capture.path(), Format::Parquet)
            .await
            .change_context(SourceError::Write)?;
        match self
            .captures
            .bind(key, &file)
            .await
            .change_context(SourceError::Write)?
        {
            Bound::Created => Ok(CapturedSource {
                file,
                rows: capture.rows(),
            }),
            Bound::Exists => self
                .restore(key, staging)
                .await?
                .ok_or_else(|| Report::new(SourceError::Read)),
        }
    }
}

/// An immutable source capture and its row count before staging.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapturedSource {
    pub file: ArtifactRef,
    pub rows: u64,
}

/// Captures all live sources of a run before its pipelines execute.
#[derive(Debug)]
pub struct SourceReader {
    store: CaptureStore,
    limits: CaptureLimits,
}

impl SourceReader {
    #[must_use]
    pub const fn new(store: CaptureStore, limits: CaptureLimits) -> Self {
        Self { store, limits }
    }

    /// Captures every live source or reuses the capture already bound to this run and source.
    ///
    /// A capture is reused only while the source's definition is unchanged; a changed source is
    /// captured again. If another attempt of the run stores its capture of a source first, that
    /// capture is used. Checkpoint sources are produced by the pipelines. Retries and restores
    /// must keep the run ID and capture directory. Existing captures are checked before resolving
    /// credentials.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError`] for invalid configuration, unreadable captures, inaccessible
    /// secrets, failed network requests, or a failed publication. Partial files are removed.
    #[tracing::instrument(level = "debug", skip_all, fields(web_id = %run.web, run_id = %run.id))]
    pub async fn capture_sources(
        &self,
        workspace: Option<&Workspace>,
        definition: &Definition,
        namespace: &ArtifactNamespace,
        run: CaptureRun,
        resolver: &impl SecretStore,
    ) -> Result<BTreeMap<SourceName, CapturedSource>, Report<SourceError>> {
        let staging = self
            .store
            .captures
            .stage()
            .change_context(SourceError::Write)?;
        let mut output = BTreeMap::new();
        for (name, source) in definition.sources() {
            if source.checkpoint().is_some() {
                continue;
            }
            let key = namespace.capture(run.id, name, &fingerprint(source));
            let stored = if let Some(stored) = self.store.restore(&key, staging.path()).await? {
                stored
            } else {
                let target = ArtifactStorage::staging_file(staging.path(), Format::Parquet);
                let capture = self
                    .read_source(workspace, source, run, resolver, target)
                    .await?;
                self.store
                    .store(namespace, &key, &capture, staging.path())
                    .await?
            };
            output.insert(name.clone(), stored);
        }
        Ok(output)
    }

    async fn read_source(
        &self,
        workspace: Option<&Workspace>,
        source: &Source,
        run: CaptureRun,
        resolver: &impl SecretStore,
        target: PathBuf,
    ) -> Result<SourceCapture, Report<SourceError>> {
        match &source.kind {
            SourceKind::Sql { query, .. } => workspace
                .ok_or_else(|| Report::new(SourceError::Configuration))?
                .capture(query.as_ref().into(), target)
                .await
                .change_context(SourceError::Query),
            SourceKind::Local { key, .. } => {
                let input = self.store.local_file(key)?;
                tokio::task::spawn_blocking(move || SourceCapture::copy_from(&input, &target))
                    .await
                    .change_context(SourceError::Read)?
                    .change_context(SourceError::Write)
            }
            SourceKind::Postgres { source, .. } => {
                let secret = resolver
                    .read(run.web, run.actor, source.credentials)
                    .await?;
                postgres::capture(source, &secret, target, self.limits).await
            }
            SourceKind::Rest {
                endpoint,
                primary_key,
            } => {
                let secret = if let Some(auth) = &endpoint.auth {
                    Some(resolver.read(run.web, run.actor, auth.reference()).await?)
                } else {
                    None
                };
                rest::capture(endpoint, primary_key, secret.as_deref(), target).await
            }
            SourceKind::Checkpoint { .. } => {
                unreachable!("checkpoint sources are skipped before capture")
            }
        }
    }
}
