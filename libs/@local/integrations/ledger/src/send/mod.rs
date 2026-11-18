//! Stage 3: builds the Graph requests of a run from the sync table and sends them in batches.

mod batch;
mod delivery;
mod request;

use core::time::Duration;

use error_stack::Report;
use serde::{Deserialize, Serialize};

use crate::{
    graph::Graph,
    run::{RunContext, RunId, StageError},
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

/// Sends the changes of the run `run` to the Graph and completes the run.
///
/// Reads `run.json` for the input, the batch settings, the capture part, the prepare part and
/// the send progress of the run. The capture part holds the capture time every request carries,
/// and the prepare part holds the number of rows to read.
///
/// Reads the rows of the run from the sync table in send order, encodes each row as a request
/// and cuts the requests into batches. The same rows and the same batch settings give the same
/// batches, so Send starts at the batch after the send progress and skips the confirmed ones.
/// After each confirmed batch the new batch count and counts are written to `run.json` as send
/// progress. After the last batch the send part is written to `run.json`, and the run is set as
/// the last completed run in `current.json`.
///
/// A create that the Graph answers with a conflict counts as done.
///
/// A run whose send part is present sends nothing and is still set as the last completed run, so
/// a Send that stopped between its last two writes is repaired by running it again. The first
/// progress write of an attempt removes the failure part.
///
/// # Errors
///
/// - [`Code::RunNotReady`] if the run has no `run.json`, or its capture part or prepare part is
///   missing
/// - [`Code::RowInvalid`] if the sync table holds a different number of rows than the prepare part
/// - [`Code::UnencodableRequest`] if a row cannot be encoded as a request
/// - [`Code::GraphUnavailable`] if the Graph does not confirm a batch within the attempts of
///   [`SendSettings`]
/// - [`Code::StorageUnavailable`] if `run.json` or the sync table cannot be read, or `run.json` or
///   `current.json` cannot be written
///
/// [`Code::RunNotReady`]: crate::Code::RunNotReady
/// [`Code::RowInvalid`]: crate::Code::RowInvalid
/// [`Code::UnencodableRequest`]: crate::Code::UnencodableRequest
/// [`Code::GraphUnavailable`]: crate::Code::GraphUnavailable
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
#[tracing::instrument(level = "info", skip_all, fields(run_id = %run))]
pub async fn send(
    context: &RunContext,
    run: RunId,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    unimplemented!()
}
