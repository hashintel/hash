use core::time::Duration;
use std::path::PathBuf;

use error_stack::Report;

use super::PINNED_FENCE_MESSAGE;
use crate::{DurableError, routing::Shard};

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
/// Determines whether an append can be retried or its writer must be replaced.
pub enum AppendFailureKind {
    /// Storage was not changed. Retrying the append is safe.
    #[display("record was not committed")]
    DefinitelyNotCommitted,
    /// The record may be stored. Recover before deciding whether to retry it.
    #[display("record commit status is unknown")]
    CommitUnknown,
    /// A replacement writer owns the journal. This writer must stop.
    #[display("a replacement writer owns the journal")]
    Fenced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("shard append failed: {kind}")]
/// Classifies an append failure returned in an [`error_stack::Report`].
pub struct ShardAppendError {
    pub kind: AppendFailureKind,
}

/// Reports invalid storage options or a failure to create the local storage directory.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum StorageConfigError {
    #[display("unsupported shard-log blob URL {url:?}")]
    UnsupportedUrl { url: String },
    #[display("blob URL has an empty S3 bucket")]
    EmptyS3Bucket,
    #[display("S3 bucket {bucket:?} requires an AWS region")]
    MissingAwsRegion { bucket: String },
    #[display("could not create local storage directory {}", path.display())]
    CreateLocalDirectory { path: PathBuf },
}

/// Reports a failure to open a journal. The report retains the storage or timeout error.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ShardLogOpenError {
    #[display("could not open writer for shard {}", shard.get())]
    Writer { shard: Shard },
    #[display("opening writer for shard {} timed out after {timeout:?}", shard.get())]
    WriterTimeout { shard: Shard, timeout: Duration },
    #[display("could not open reader for shard {}", shard.get())]
    Reader { shard: Shard },
    #[display("opening reader for shard {} timed out after {timeout:?}", shard.get())]
    ReaderTimeout { shard: Shard, timeout: Duration },
}

pub(super) fn post_invocation_source<E>(
    operation: DurableError,
    error: E,
) -> Report<ShardAppendError>
where
    E: core::error::Error + Send + Sync + 'static,
{
    let message = error.to_string();
    let kind = post_invocation_failure_kind(&message);
    Report::new(error)
        .change_context(operation)
        .change_context(ShardAppendError { kind })
}

pub(super) fn post_invocation_report(report: Report<DurableError>) -> Report<ShardAppendError> {
    let message = format!("{report:?}");
    report.change_context(ShardAppendError {
        kind: post_invocation_failure_kind(&message),
    })
}

fn post_invocation_failure_kind(message: &str) -> AppendFailureKind {
    if message.to_ascii_lowercase().contains(PINNED_FENCE_MESSAGE) {
        AppendFailureKind::Fenced
    } else {
        AppendFailureKind::CommitUnknown
    }
}
