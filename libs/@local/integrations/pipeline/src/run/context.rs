use core::{fmt, time::Duration};
use std::path::{Path, PathBuf};

use error_stack::Report;
use hash_integrations_definition::{ConnectorId, Variables};
use time::OffsetDateTime;
use type_system::principal::actor_group::WebId;

use super::{StageError, error};
use crate::{ArtifactNamespace, ArtifactRef, ArtifactStorage, Format, Workspace, WorkspaceConfig};

/// Supplies the capture time without tying a stage to wall-clock time.
pub trait Clock: Send + Sync {
    fn now(&self) -> OffsetDateTime;
}
/// Reads UTC time from the operating system.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> OffsetDateTime {
        OffsetDateTime::now_utc()
    }
}
/// Supplies a reproducible capture time.
#[derive(Debug, Clone, Copy)]
pub struct FixedClock(pub OffsetDateTime);
impl Clock for FixedClock {
    fn now(&self) -> OffsetDateTime {
        self.0
    }
}

/// Bounds attempts and exponential waits for one Graph request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SendSettings {
    pub max_attempts: u32,
    pub first_wait: Duration,
    pub longest_wait: Duration,
}
impl Default for SendSettings {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            first_wait: Duration::from_millis(500),
            longest_wait: Duration::from_secs(30),
        }
    }
}

/// Run-local resources; stages exchange persisted references, never workspace files.
pub struct RunContext {
    pub storage: ArtifactStorage,
    pub namespace: ArtifactNamespace,
    pub scratch: PathBuf,
    pub workspace: WorkspaceConfig,
    pub send: SendSettings,
    pub clock: Box<dyn Clock>,
}
impl fmt::Debug for RunContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("RunContext")
            .field("storage", &self.storage)
            .field("namespace", &self.namespace)
            .field("scratch", &self.scratch)
            .field("workspace", &self.workspace)
            .field("send", &self.send)
            .finish_non_exhaustive()
    }
}
impl RunContext {
    /// Creates resources scoped to one web and connector.
    #[must_use]
    pub fn new(
        storage: ArtifactStorage,
        web: WebId,
        connector: &ConnectorId,
        scratch: PathBuf,
        workspace: WorkspaceConfig,
        send: SendSettings,
        clock: Box<dyn Clock>,
    ) -> Self {
        Self {
            storage,
            namespace: ArtifactNamespace::new(web.into(), connector),
            scratch,
            workspace,
            send,
            clock,
        }
    }

    pub(crate) fn scratch_file(&self, format: Format) -> PathBuf {
        ArtifactStorage::staging_file(&self.scratch, format)
    }

    pub(crate) async fn publish(
        &self,
        path: &Path,
        format: Format,
    ) -> Result<ArtifactRef, Report<StageError>> {
        let result = self
            .storage
            .publish(&self.namespace.artifacts(), path, format)
            .await
            .map_err(error::artifact);
        let _: Result<(), std::io::Error> = tokio::fs::remove_file(path).await;
        result
    }

    pub(crate) async fn fetch(
        &self,
        artifact: &ArtifactRef,
    ) -> Result<PathBuf, Report<StageError>> {
        self.storage
            .materialize(artifact, &self.scratch)
            .await
            .map_err(error::artifact)
    }

    pub(crate) async fn open_workspace(
        &self,
        variables: Variables,
    ) -> Result<Workspace, Report<StageError>> {
        Workspace::open(
            self.scratch_file(Format::DuckDb),
            WorkspaceConfig {
                variables,
                ..self.workspace.clone()
            },
        )
        .await
        .map_err(error::open)
    }
}
