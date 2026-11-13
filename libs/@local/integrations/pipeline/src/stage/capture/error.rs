use error_stack::Report;

use crate::{
    ArtifactError, CaptureError, Code, SourceError, StageError, StatementError, run::error,
};

pub(super) fn source_error(report: Report<SourceError>) -> Report<StageError> {
    let code = source_code(&report);
    code.wrap(report)
}

fn source_code(report: &Report<SourceError>) -> Code {
    // Numeric validity is permanent even when network/capture wrappers are retryable.
    if report.frames().any(|frame| {
        matches!(
            frame.downcast_ref::<CaptureError>(),
            Some(CaptureError::InvalidData)
        )
    }) {
        return Code::DataInvalid;
    }
    match report.current_context() {
        SourceError::Configuration | SourceError::Destination => Code::SourceConfiguration,
        SourceError::Query => frame_code(report, Code::WorkspaceUnavailable),
        SourceError::SecretRequest { .. } => Code::SecretUnavailable,
        SourceError::SecretStatus { status, .. } if temporary(*status) => Code::SecretUnavailable,
        SourceError::SecretResponse { .. } if report.contains::<reqwest::Error>() => {
            Code::SecretUnavailable
        }
        SourceError::Secret
        | SourceError::SecretEntityCount { .. }
        | SourceError::SecretEntity
        | SourceError::SecretExpiry
        | SourceError::SecretExpired
        | SourceError::SecretPath
        | SourceError::SecretValue
        | SourceError::SecretStatus { .. }
        | SourceError::SecretResponse { .. }
        | SourceError::Status { status: 401 | 403 } => Code::SourceCredentials,
        SourceError::Postgres | SourceError::Request => Code::SourceUnavailable,
        SourceError::Status { status } if temporary(*status) => Code::SourceUnavailable,
        SourceError::Status { .. } | SourceError::Response | SourceError::Pagination => {
            Code::SourceResponse
        }
        SourceError::Read | SourceError::Write | SourceError::Load => {
            frame_code(report, Code::StorageUnavailable)
        }
    }
}

fn frame_code(report: &Report<SourceError>, fallback: Code) -> Code {
    if let Some(cause) = report.downcast_ref::<ArtifactError>() {
        return error::artifact_code(*cause);
    }
    if let Some(cause) = report.downcast_ref::<CaptureError>() {
        return error::capture_code(cause, report);
    }
    report
        .downcast_ref::<StatementError>()
        .map_or(fallback, error::statement_code)
}

const fn temporary(status: u16) -> bool {
    matches!(status, 408 | 429) || status >= 500
}
