//! Stable failure codes and one policy for lower-level error frames.

use core::{error::Error, mem};

use error_stack::Report;

use crate::{ArtifactError, CaptureError, CloseError, OpenError, PreparationError, StatementError};

/// Whether retrying the same stage input can succeed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum StageError {
    #[display("the stage failed and another attempt can succeed")]
    Retryable,
    #[display("the stage failed and no attempt with this input can succeed")]
    Permanent,
}

/// A stable diagnostic code attached to a [`StageError`] report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, derive_more::Display)]
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
            | Self::SecretUnavailable => StageError::Retryable,
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
            | Self::SourceResponse => StageError::Permanent,
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

pub(crate) const fn artifact_code(error: ArtifactError) -> Code {
    match error {
        ArtifactError::Mismatch => Code::StorageMismatch,
        ArtifactError::Read | ArtifactError::Write => Code::StorageUnavailable,
    }
}
pub(crate) fn artifact(report: Report<ArtifactError>) -> Report<StageError> {
    artifact_code(*report.current_context()).wrap(report)
}
pub(crate) const fn statement_code(error: &StatementError) -> Code {
    match error {
        StatementError::NotSelect { .. }
        | StatementError::StatementCount { .. }
        | StatementError::TableFunction { .. }
        | StatementError::UnknownParameter { .. }
        | StatementError::UnsupportedType { .. }
        | StatementError::InvalidQuery { .. } => Code::QueryInvalid,
        StatementError::InvalidData { .. } => Code::DataInvalid,
        StatementError::Failed
        | StatementError::DiskLimit { .. }
        | StatementError::DiskUsage
        | StatementError::Stopped => Code::WorkspaceUnavailable,
    }
}
pub(crate) fn statement(report: Report<StatementError>) -> Report<StageError> {
    statement_code(report.current_context()).wrap(report)
}

/// Classifies a capture frame without discarding lower statement causes.
pub(crate) fn capture_code<C>(error: &CaptureError, report: &Report<C>) -> Code {
    match error {
        CaptureError::InvalidData => Code::DataInvalid,
        CaptureError::Query => report
            .downcast_ref::<StatementError>()
            .map_or(Code::WorkspaceUnavailable, statement_code),
        CaptureError::Read
        | CaptureError::Write
        | CaptureError::SyncDirectory { .. }
        | CaptureError::Exists { .. }
        | CaptureError::WorkspaceFile { .. } => Code::ScratchUnavailable,
        CaptureError::DiskUsage | CaptureError::Cancelled | CaptureError::Stopped => {
            Code::WorkspaceUnavailable
        }
    }
}
pub(crate) fn capture(report: Report<CaptureError>) -> Report<StageError> {
    capture_code(report.current_context(), &report).wrap(report)
}

pub(crate) fn preparation(report: Report<PreparationError>) -> Report<StageError> {
    let cause = report
        .frames()
        .filter_map(|frame| frame.downcast_ref::<PreparationError>())
        .find(|error| !matches!(error, PreparationError::Step { .. }));
    let code = match cause {
        Some(PreparationError::ReservedColumn { .. }) => Code::ReservedColumn,
        Some(
            PreparationError::MissingColumn { .. }
            | PreparationError::Metadata { .. }
            | PreparationError::MissingCheckpoint { .. }
            | PreparationError::LinkInputs,
        ) => Code::QueryInvalid,
        Some(PreparationError::Assertions { .. }) => Code::DataInvalid,
        Some(PreparationError::Cancelled | PreparationError::Stopped) => Code::WorkspaceUnavailable,
        Some(PreparationError::Statement | PreparationError::Step { .. }) | None => report
            .downcast_ref::<StatementError>()
            .map_or(Code::QueryInvalid, statement_code),
    };
    code.wrap(report)
}
pub(crate) fn open(report: Report<OpenError>) -> Report<StageError> {
    Code::WorkspaceUnavailable.wrap(report)
}
pub(crate) fn close(report: Report<CloseError>) -> Report<StageError> {
    Code::WorkspaceUnavailable.wrap(report)
}
pub(crate) fn scratch<E: Error + Send + Sync + 'static>(error: E) -> Report<StageError> {
    Code::ScratchUnavailable.wrap(Report::new(error))
}
pub(crate) fn stored_json(error: serde_json::Error) -> Report<StageError> {
    Code::StoredJsonInvalid.wrap(Report::new(error))
}
