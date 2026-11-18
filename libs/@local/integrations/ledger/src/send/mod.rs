//! Stage 3: builds the Graph requests of a run from the sync table and sends them in batches.

mod batch;
mod delivery;
mod request;

use core::time::Duration;

use error_stack::Report;
use serde::{Deserialize, Serialize};

use crate::{
    capture::CaptureOutput,
    graph::Graph,
    prepare::PrepareOutput,
    run::{BatchSettings, RunContext, RunInput, StageError},
};

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

/// The result of every write.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendCounts {
    pub created: u64,
    pub patched: u64,
    pub archived: u64,
    pub absent: u64,
    pub rejected: u64,
}

/// How far Send has come, written to `run.json` after each confirmed batch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendProgress {
    /// The number of batches the Graph has confirmed. Send resumes at the batch with this
    /// index.
    pub confirmed_batches: u32,
    /// The counts of the confirmed batches.
    pub counts: SendCounts,
}

/// The result of Send, written to `run.json` as the send part after the last batch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendOutput {
    pub counts: SendCounts,
}

/// Sends the changes of the run to the Graph and completes the run.
///
/// Reads the rows of the run from the sync table in send order, encodes each row as a request
/// and cuts the requests into batches. The same rows and the same `batch` settings give the
/// same batches, so Send starts at the batch after `progress` and skips the confirmed ones.
/// After each confirmed batch the new batch count and counts are written to `run.json` as send
/// progress. After the last batch the send part is written to `run.json`, and the run is set as
/// the last completed run in `current.json`.
///
/// A create that the Graph answers with a conflict counts as done.
///
/// # Arguments
///
/// * `batch` - The limits of one batch, pinned in `run.json`
/// * `capture` - The capture part of the run, which holds the capture time every request carries
/// * `prepare` - The prepare part of the run, which holds the number of rows to read
/// * `progress` - The send progress of an earlier attempt, if `run.json` has one
/// * `graph` - The Graph the requests are sent to
///
/// # Errors
///
/// - [`Code::RowInvalid`] if the sync table holds a different number of rows than `prepare`
/// - [`Code::UnencodableRequest`] if a row cannot be encoded as a request
/// - [`Code::GraphUnavailable`] if the Graph does not confirm a batch within the attempts of
///   [`SendSettings`]
/// - [`Code::StorageUnavailable`] if the sync table cannot be read, or `run.json` or `current.json`
///   cannot be written
///
/// [`Code::RowInvalid`]: crate::Code::RowInvalid
/// [`Code::UnencodableRequest`]: crate::Code::UnencodableRequest
/// [`Code::GraphUnavailable`]: crate::Code::GraphUnavailable
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
#[tracing::instrument(level = "info", skip_all, fields(run_id = %input.run))]
pub async fn send(
    context: &RunContext,
    input: &RunInput,
    batch: BatchSettings,
    capture: &CaptureOutput,
    prepare: &PrepareOutput,
    progress: Option<&SendProgress>,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    unimplemented!()
}
