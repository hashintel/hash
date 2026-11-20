use alloc::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{
    knowledge::entity::id::EntityId,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::RunId;

/// What a run works with and what each of its stages finished, stored as `runs/{run}/run.json`.
///
/// A part that is set means its stage has finished. Every stage reads the record first and saves
/// it as its last write.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RunRecord {
    pub input: Input,
    pub batch: BatchLimits,
    pub capture: Option<CapturePart>,
    pub prepare: Option<PreparePart>,
    pub send: Option<SendPart>,
    pub failure: Option<Failure>,
}

/// What the run works with, written by Start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Input {
    pub run: RunId,
    pub web: WebId,
    /// The connector the definition names.
    pub connector: Box<str>,
    pub actor: ActorEntityUuid,
    /// The definition as written, in YAML.
    pub definition: Box<str>,
    /// The namespace every entity id of the run is derived in.
    pub id_namespace: Box<str>,
    #[serde(with = "time::serde::rfc3339")]
    pub submitted_at: OffsetDateTime,
}

/// The limits of one batch of Graph requests, written by Start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BatchLimits {
    pub max_writes: u32,
    pub max_bytes: u64,
}

impl Default for BatchLimits {
    fn default() -> Self {
        Self {
            max_writes: 128,
            max_bytes: 1_500_000,
        }
    }
}

/// The capture files, one per table of the definition, by the table's name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct CapturePart {
    pub sources: BTreeMap<Box<str>, CapturedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct CapturedFile {
    pub key: Box<str>,
    pub size: u64,
    pub rows: u64,
}

/// The number of entity changes, and the issues file if Prepare noted anything.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct PreparePart {
    pub rows: u64,
    pub issues: Option<Box<str>>,
    pub issue_count: u64,
}

/// What the Graph did with the run's changes, and the entities it refused.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct SendPart {
    pub created: u64,
    pub updated: u64,
    pub archived: u64,
    pub create_existed: u64,
    pub update_missing: u64,
    pub archive_missing: u64,
    pub failed: Vec<FailedEntity>,
}

/// An entity the Graph refused, by its batch and its place in the batch, both counted from 0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct FailedEntity {
    pub batch: u32,
    pub index: u32,
    pub entity_id: EntityId,
    pub status: u16,
    pub message: Box<str>,
}

/// Why a stage stopped for good. Running it again cannot help.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Failure {
    pub stage: Stage,
    pub code: Box<str>,
    /// The error's text, cut to 1,024 characters.
    pub message: Box<str>,
}

/// A stage of the pipeline, as the `failure` part names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Stage {
    Capture,
    Prepare,
    Send,
}
