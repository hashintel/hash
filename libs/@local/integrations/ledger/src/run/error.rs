//! Stable failure codes and their retry classification.

use core::mem;

use error_stack::Report;
use serde::{Deserialize, Serialize};

/// Whether retrying the same stage input can succeed.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    derive_more::Display,
    derive_more::Error,
)]
#[serde(rename_all = "lowercase")]
pub enum StageError {
    #[display("the stage failed and another attempt can succeed")]
    Retryable,
    #[display("the stage failed and no attempt with this input can succeed")]
    Permanent,
}

/// A stable diagnostic code attached to a [`StageError`] report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, derive_more::Display)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    #[display("invalid_definition")]
    InvalidDefinition,
    #[display("target_missing")]
    TargetMissing,
    #[display("nothing_committed")]
    NothingCommitted,
    #[display("duplicate_entity_id")]
    DuplicateEntityId,
    #[display("archive_limit")]
    ArchiveLimit,
    #[display("base_moved")]
    BaseMoved,
    #[display("superseded")]
    Superseded,
    #[display("request_mismatch")]
    RequestMismatch,
    #[display("integration_mismatch")]
    IntegrationMismatch,
    #[display("reserved_column")]
    ReservedColumn,
    #[display("marker_missing")]
    MarkerMissing,
    #[display("storage_unavailable")]
    StorageUnavailable,
    #[display("storage_mismatch")]
    StorageMismatch,
    #[display("stored_json_invalid")]
    StoredJsonInvalid,
    #[display("scratch_unavailable")]
    ScratchUnavailable,
    #[display("workspace_unavailable")]
    WorkspaceUnavailable,
    #[display("query_invalid")]
    QueryInvalid,
    #[display("data_invalid")]
    DataInvalid,
    #[display("row_invalid")]
    RowInvalid,
    #[display("source_configuration")]
    SourceConfiguration,
    #[display("source_credentials")]
    SourceCredentials,
    #[display("source_response")]
    SourceResponse,
    #[display("source_unavailable")]
    SourceUnavailable,
    #[display("secret_unavailable")]
    SecretUnavailable,
    #[display("capture_missing")]
    CaptureMissing,
    #[display("row_key")]
    RowKey,
    #[display("invalid_checkpoint")]
    InvalidCheckpoint,
    #[display("unencodable_request")]
    UnencodableRequest,
    #[display("plan_too_large")]
    PlanTooLarge,
    #[display("graph_unavailable")]
    GraphUnavailable,
    #[display("invalid_writes")]
    InvalidWrites,
    #[display("reader_stopped")]
    ReaderStopped,
}

impl Code {
    /// All shared codes, in declaration order.
    pub const ALL: [Self; mem::variant_count::<Self>()] = [
        Self::InvalidDefinition,
        Self::TargetMissing,
        Self::NothingCommitted,
        Self::DuplicateEntityId,
        Self::ArchiveLimit,
        Self::BaseMoved,
        Self::Superseded,
        Self::RequestMismatch,
        Self::IntegrationMismatch,
        Self::ReservedColumn,
        Self::MarkerMissing,
        Self::StorageUnavailable,
        Self::StorageMismatch,
        Self::StoredJsonInvalid,
        Self::ScratchUnavailable,
        Self::WorkspaceUnavailable,
        Self::QueryInvalid,
        Self::DataInvalid,
        Self::RowInvalid,
        Self::SourceConfiguration,
        Self::SourceCredentials,
        Self::SourceResponse,
        Self::SourceUnavailable,
        Self::SecretUnavailable,
        Self::CaptureMissing,
        Self::RowKey,
        Self::InvalidCheckpoint,
        Self::UnencodableRequest,
        Self::PlanTooLarge,
        Self::GraphUnavailable,
        Self::InvalidWrites,
        Self::ReaderStopped,
    ];

    /// The persisted diagnostic text.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidDefinition => "invalid_definition",
            Self::TargetMissing => "target_missing",
            Self::NothingCommitted => "nothing_committed",
            Self::DuplicateEntityId => "duplicate_entity_id",
            Self::ArchiveLimit => "archive_limit",
            Self::BaseMoved => "base_moved",
            Self::Superseded => "superseded",
            Self::RequestMismatch => "request_mismatch",
            Self::IntegrationMismatch => "integration_mismatch",
            Self::ReservedColumn => "reserved_column",
            Self::MarkerMissing => "marker_missing",
            Self::StorageUnavailable => "storage_unavailable",
            Self::StorageMismatch => "storage_mismatch",
            Self::StoredJsonInvalid => "stored_json_invalid",
            Self::ScratchUnavailable => "scratch_unavailable",
            Self::WorkspaceUnavailable => "workspace_unavailable",
            Self::QueryInvalid => "query_invalid",
            Self::DataInvalid => "data_invalid",
            Self::RowInvalid => "row_invalid",
            Self::SourceConfiguration => "source_configuration",
            Self::SourceCredentials => "source_credentials",
            Self::SourceResponse => "source_response",
            Self::SourceUnavailable => "source_unavailable",
            Self::SecretUnavailable => "secret_unavailable",
            Self::CaptureMissing => "capture_missing",
            Self::RowKey => "row_key",
            Self::InvalidCheckpoint => "invalid_checkpoint",
            Self::UnencodableRequest => "unencodable_request",
            Self::PlanTooLarge => "plan_too_large",
            Self::GraphUnavailable => "graph_unavailable",
            Self::InvalidWrites => "invalid_writes",
            Self::ReaderStopped => "reader_stopped",
        }
    }

    /// The retry classification of this code.
    #[must_use]
    pub const fn kind(self) -> StageError {
        match self {
            Self::StorageUnavailable
            | Self::ScratchUnavailable
            | Self::WorkspaceUnavailable
            | Self::SourceUnavailable
            | Self::SecretUnavailable
            | Self::GraphUnavailable
            | Self::ReaderStopped => StageError::Retryable,
            Self::InvalidDefinition
            | Self::TargetMissing
            | Self::NothingCommitted
            | Self::DuplicateEntityId
            | Self::ArchiveLimit
            | Self::BaseMoved
            | Self::Superseded
            | Self::RequestMismatch
            | Self::IntegrationMismatch
            | Self::ReservedColumn
            | Self::MarkerMissing
            | Self::StorageMismatch
            | Self::StoredJsonInvalid
            | Self::QueryInvalid
            | Self::DataInvalid
            | Self::RowInvalid
            | Self::SourceConfiguration
            | Self::SourceCredentials
            | Self::SourceResponse
            | Self::CaptureMissing
            | Self::RowKey
            | Self::InvalidCheckpoint
            | Self::UnencodableRequest
            | Self::PlanTooLarge
            | Self::InvalidWrites => StageError::Permanent,
        }
    }

    /// Creates a report carrying the code and its retry classification.
    pub fn report(self) -> Report<StageError> {
        Report::new(self.kind()).attach(self)
    }

    /// Preserves the cause while adding the stage classification.
    pub fn wrap<C>(self, report: Report<C>) -> Report<StageError> {
        report.change_context(self.kind()).attach(self)
    }

    /// Finds the newest code on a classified report.
    #[must_use]
    pub fn of(report: &Report<StageError>) -> Option<Self> {
        report.downcast_ref::<Self>().copied()
    }
}
