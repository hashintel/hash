mod http;
mod postgres;
mod rest;
mod secrets;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use core::num::NonZero;
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, SourceKind, SourceName};
use uuid::Uuid;

pub use self::secrets::{GraphVaultConfig, GraphVaultSecretStore, SecretStore, SecretValue};
use crate::{ByteSize, SourceCapture, TableAssertions, Workspace, sql::Identifier};

/// Reports why a live source could not be captured or restored.
#[derive(Debug, derive_more::Display, derive_more::Error)]
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

/// Local source files and durable captures, in separate configured directories.
#[derive(Debug)]
pub struct CaptureStore {
    local: PathBuf,
    captures: PathBuf,
}

impl CaptureStore {
    /// Opens a local source root and creates the capture root if needed.
    ///
    /// # Errors
    ///
    /// Returns [`SourceError::Read`] if the local root cannot be opened or
    /// [`SourceError::Write`] if the capture root cannot be created.
    pub fn new(local: &Path, captures: &Path) -> Result<Self, Report<SourceError>> {
        let local = local.canonicalize().change_context(SourceError::Read)?;
        fs::create_dir_all(captures).change_context(SourceError::Write)?;
        let captures = captures.canonicalize().change_context(SourceError::Write)?;
        if !local.is_dir() || !captures.is_dir() {
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

    #[expect(
        clippy::create_dir,
        reason = "checks each run directory separately to reject symlink aliases and sync its \
                  parent"
    )]
    fn path(&self, run: CaptureRun, source: &SourceName) -> Result<PathBuf, Report<SourceError>> {
        let mut directory = self.captures.clone();
        for component in [run.web, run.id] {
            let parent = directory.clone();
            directory.push(component.to_string());
            match fs::create_dir(&directory) {
                Ok(()) => fs::File::open(&parent)
                    .and_then(|parent| parent.sync_all())
                    .change_context(SourceError::Write)?,
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    if !fs::symlink_metadata(&directory)
                        .change_context(SourceError::Read)?
                        .file_type()
                        .is_dir()
                    {
                        return Err(Report::new(SourceError::Read));
                    }
                }
                Err(error) => return Err(Report::new(error).change_context(SourceError::Write)),
            }
        }
        Ok(directory.join(format!("{source}.parquet")))
    }
}

#[expect(
    clippy::filetype_is_file,
    reason = "captures must be regular files rather than symlinks or special files"
)]
fn recovered(path: &Path) -> Result<Option<SourceCapture>, Report<SourceError>> {
    match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_file() => SourceCapture::open(path.to_owned())
            .map(Some)
            .change_context(SourceError::Read),
        Ok(_) => Err(Report::new(SourceError::Read)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Report::new(error).change_context(SourceError::Read)),
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
    /// Checkpoint sources are produced by the pipelines. Retries and restores must keep the run
    /// ID and capture directory. Existing captures are checked before resolving credentials.
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
        let mut captures = BTreeMap::new();
        for (name, source) in definition.sources() {
            if source.checkpoint().is_some() {
                continue;
            }
            let target = self.store.path(run, name)?;
            if let Some(capture) = recovered(&target)? {
                captures.insert(name.clone(), capture);
                continue;
            }
            let result = match &source.kind {
                SourceKind::Sql { query, .. } => workspace
                    .capture(query.as_ref().into(), target.clone())
                    .await
                    .change_context(SourceError::Query),
                SourceKind::Local { key, .. } => {
                    let input = self.store.local_file(key)?;
                    let target = target.clone();
                    tokio::task::spawn_blocking(move || SourceCapture::copy_from(&input, &target))
                        .await
                        .change_context(SourceError::Read)?
                        .change_context(SourceError::Write)
                }
                SourceKind::Postgres { source, .. } => {
                    let secret = resolver
                        .read(run.web, run.actor, source.credentials)
                        .await?;
                    postgres::capture(source, &secret, target.clone(), self.limits).await
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
                    rest::capture(endpoint, primary_key, secret.as_deref(), target.clone()).await
                }
                SourceKind::Checkpoint { .. } => continue,
            };
            let capture = match result {
                Ok(capture) => capture,
                Err(error) => recovered(&target)?.ok_or(error)?,
            };
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
