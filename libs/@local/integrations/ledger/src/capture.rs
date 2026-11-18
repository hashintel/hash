//! Stage 1: stores the changed rows of each source.

use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::SourceName;
use hash_integrations_engine::ArtifactRef;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::run::{RunContext, RunInput, StageError};

/// The capture files of a run, written to `run.json` as the capture part.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptureOutput {
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
    #[serde(with = "crate::run::serde::sources")]
    pub sources: BTreeMap<SourceName, CapturedSource>,
}

/// An immutable source capture and its row count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapturedSource {
    pub file: ArtifactRef,
    pub rows: u64,
}

/// Copies the local Parquet file of each source to storage and writes the capture part.
///
/// The definition in `input` names one local Parquet file of changed rows per source. Each file
/// is stored unchanged, and its row count is read from the Parquet footer. The capture part is
/// written to `run.json` once, after every file is stored. A run whose capture part is present
/// returns that part without reading a file.
///
/// # Errors
///
/// - [`Code::InvalidDefinition`] if the stored definition cannot be parsed
/// - [`Code::SourceConfiguration`] if a source does not name a readable local Parquet file
/// - [`Code::StorageUnavailable`] if a file or `run.json` cannot be written
///
/// [`Code::InvalidDefinition`]: crate::Code::InvalidDefinition
/// [`Code::SourceConfiguration`]: crate::Code::SourceConfiguration
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %input.run))]
pub async fn capture(
    context: &RunContext,
    input: &RunInput,
) -> Result<CaptureOutput, Report<StageError>> {
    unimplemented!()
}
