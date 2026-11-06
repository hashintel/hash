mod fingerprint;
mod http;
mod postgres;
mod rest;
mod secrets;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use core::num::NonZero;
use std::path::{Component, Path, PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, SourceKind, SourceName};
use uuid::Uuid;

use self::fingerprint::fingerprint;
pub use self::secrets::{GraphVaultConfig, GraphVaultSecretStore, SecretStore, SecretValue};
use crate::{
    ByteSize, ParquetStorage, SourceCapture, TableAssertions, Workspace,
    sql::Identifier,
    storage::{ArtifactNamespace, Stored},
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
    #[display("another attempt of the run already stored a capture of this source")]
    Conflict,
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
    captures: ParquetStorage,
}

impl CaptureStore {
    /// Opens a local source root and creates the local capture directory if needed.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Read`] if the local root cannot be opened,
    /// [`SourceError::Write`] if the capture directory cannot be created, or
    /// [`SourceError::Configuration`] if either is not a directory or one contains the other.
    pub fn new(local: &Path, captures: ParquetStorage) -> Result<Self, Report<SourceError>> {
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
    /// captured again. Checkpoint sources are produced by the pipelines. Retries and restores must
    /// keep the run ID and capture directory. Existing captures are checked before resolving
    /// credentials.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError`] for invalid configuration, unreadable captures, inaccessible
    /// secrets, failed network requests, or a failed publication. Partial files are removed.
    #[tracing::instrument(level = "debug", skip_all, fields(web_id = %run.web, run_id = %run.id))]
    pub async fn capture_sources(
        &self,
        workspace: &Workspace,
        definition: &Definition,
        run: CaptureRun,
        resolver: &impl SecretStore,
    ) -> Result<BTreeMap<SourceName, SourceCapture>, Report<SourceError>> {
        let namespace = ArtifactNamespace::new(run.web, definition.connector());
        let mut captures = BTreeMap::new();
        for (name, source) in definition.sources() {
            if source.checkpoint().is_some() {
                continue;
            }
            let storage = &self.store.captures;
            let key = namespace.capture(run.id, name, &fingerprint(source));
            if let Some(capture) = storage.load(&key).await.change_context(SourceError::Read)? {
                captures.insert(name.clone(), capture);
                continue;
            }
            let target = storage.staging(&key).change_context(SourceError::Write)?;
            let capture = match &source.kind {
                SourceKind::Sql { query, .. } => workspace
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
            }?;
            match storage
                .store(&key, &capture)
                .await
                .change_context(SourceError::Write)?
            {
                Stored::Created => {}
                // TODO: Another attempt of this run stored its capture first. Whether this
                //   attempt should continue from that capture or fail is open for discussion with
                //   the team, so it fails for now.
                Stored::Exists => return Err(Report::new(SourceError::Conflict)),
            }
            captures.insert(name.clone(), capture);
        }
        Ok(captures)
    }

    /// Loads captures and adds the snapshot metadata consumed by pipeline preparation.
    ///
    /// Returns a source-to-staging-table mapping for [`Workspace::prepare_pipeline`].
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Load`] for a missing capture, invalid primary-key columns,
    /// invalid Parquet data, a workspace limit failure, or a cancelled request.
    #[tracing::instrument(level = "debug", skip_all)]
    pub async fn stage_sources(
        workspace: &Workspace,
        definition: &Definition,
        captures: &BTreeMap<SourceName, SourceCapture>,
    ) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>> {
        let mut tables = BTreeMap::new();
        for (name, source) in definition.sources() {
            let Some(primary_key) = source.primary_key() else {
                continue;
            };
            let capture = captures
                .get(name)
                .ok_or_else(|| Report::new(SourceError::Load))?;
            let raw = format!("_capture/{name}");
            let staged = format!("_source/{name}");
            workspace
                .load_capture(capture.clone(), raw.clone().into_boxed_str())
                .await
                .change_context(SourceError::Load)?;
            workspace
                .stage_table(
                    staged.clone().into_boxed_str(),
                    format!("SELECT * FROM {}", Identifier::new(&raw)).into_boxed_str(),
                    primary_key.clone(),
                    TableAssertions::default(),
                )
                .await
                .change_context(SourceError::Load)?;
            tables.insert(name.clone(), staged.into_boxed_str());
        }
        Ok(tables)
    }
}
