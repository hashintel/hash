//! The state of one run, stored as `run.json`, and the resources a stage runs with.

pub(crate) mod current;
mod error;
pub(crate) mod serde;
pub(crate) mod store;

use core::{fmt, str::FromStr};
use std::path::PathBuf;

use ::serde::{Deserialize, Serialize};
use error_stack::Report;
use hash_integrations_definition::ConnectorId;
use hash_integrations_engine::{ArtifactNamespace, ArtifactStorage, WorkspaceConfig};
use time::OffsetDateTime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

pub use self::{
    current::Current,
    error::{Code, StageError},
};
use crate::{
    capture::CaptureOutput,
    prepare::PrepareOutput,
    send::{SendOutput, SendProgress, SendSettings},
};

/// Identifies one ingestion run using lowercase hyphenated UUID text.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    derive_more::Display,
    derive_more::From,
    derive_more::Into,
)]
#[serde(transparent)]
pub struct RunId(Uuid);

impl FromStr for RunId {
    type Err = uuid::Error;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        Uuid::try_parse(text).map(Self)
    }
}

/// The contents of `run.json`: the pinned input of a run and the part each stage has written.
///
/// A stage is complete when its part is present. [`send_progress`] is written while Send works,
/// so [`send`] is present only when Send is complete. [`failure`] is present while the run is
/// stopped by a stage error, and the stage that later succeeds removes it.
///
/// [`send_progress`]: Self::send_progress
/// [`send`]: Self::send
/// [`failure`]: Self::failure
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Run {
    pub input: RunInput,
    pub batch: BatchSettings,
    pub capture: Option<CaptureOutput>,
    pub prepare: Option<PrepareOutput>,
    pub send_progress: Option<SendProgress>,
    pub send: Option<SendOutput>,
    pub failure: Option<Failure>,
}

/// Immutable input read by every stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunInput {
    pub run: RunId,
    pub web: WebId,
    #[serde(
        serialize_with = "serde::serialize_connector",
        deserialize_with = "serde::deserialize_connector"
    )]
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub definition: Option<Box<str>>,
    pub namespace: Box<str>,
}

/// The limits of one batch of Graph writes.
///
/// The limits are pinned in `run.json` so that a retry cuts the same batches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchSettings {
    /// The most writes in one batch.
    pub max_writes: u32,
    /// The most bytes of request bodies in one batch.
    pub max_bytes: u64,
}

/// One of the three stages of a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Capture,
    Prepare,
    Send,
}

/// The error a stage returned, written to `run.json` by that stage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Failure {
    pub stage: Stage,
    /// Whether running the stage again can succeed.
    pub error: StageError,
    pub code: Code,
    /// The index of the batch that failed. Present when `stage` is [`Stage::Send`].
    pub batch: Option<u32>,
}

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

/// Starts a run: writes its first `run.json` and sets it as the active run of the integration.
///
/// The first `run.json` holds `input` and `batch` and no stage part. Starting is where the rule
/// "one run at a time" is enforced: a run starts only when no other run is active. Starting a
/// run again with the same `input` and `batch` returns its stored state.
///
/// # Errors
///
/// - [`Code::IntegrationMismatch`] if `context` belongs to another web or connector than `input`
/// - [`Code::InvalidDefinition`] if the definition in `input` cannot be parsed
/// - [`Code::RequestMismatch`] if the run already has a `run.json` with another input or batch
///   settings
/// - [`Code::RunActive`] if another run of the integration is active
/// - [`Code::StorageUnavailable`] if `run.json` or `current.json` cannot be read or written
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %input.run))]
pub async fn start(
    context: &RunContext,
    input: RunInput,
    batch: BatchSettings,
) -> Result<Run, Report<StageError>> {
    unimplemented!()
}

/// Run-local resources; stages exchange persisted references, never workspace files.
pub struct RunContext {
    pub storage: ArtifactStorage,
    pub namespace: ArtifactNamespace,
    pub scratch: PathBuf,
    /// The local folder that holds the Parquet files Capture stores.
    pub local: PathBuf,
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
            .field("local", &self.local)
            .field("workspace", &self.workspace)
            .field("send", &self.send)
            .finish_non_exhaustive()
    }
}
