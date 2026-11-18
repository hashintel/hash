//! Sends one batch to the Graph and retries it.

use error_stack::Report;
use serde_json::value::RawValue;

use crate::{
    graph::{Graph, RequestKind},
    run::{RunContext, RunInput, StageError},
};

/// What the Graph did with one write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Outcome {
    Created,
    Patched,
    Archived,
    /// The entity of an archive did not exist.
    Absent,
    /// The Graph refused the write with `status`.
    Rejected {
        status: Option<u16>,
    },
}

/// Sends `bodies` as one bulk request of `kind` and returns one [`Outcome`] per body.
///
/// A request that the Graph cannot take is sent again, with the waits of [`SendSettings`]. A
/// create that the Graph answers with a conflict is [`Outcome::Created`].
///
/// # Errors
///
/// - [`Code::GraphUnavailable`] if the Graph does not answer within the attempts of
///   [`SendSettings`]
///
/// [`SendSettings`]: super::SendSettings
/// [`Code::GraphUnavailable`]: crate::Code::GraphUnavailable
pub(super) async fn batch(
    context: &RunContext,
    input: &RunInput,
    graph: &impl Graph,
    kind: RequestKind,
    bodies: &[&RawValue],
) -> Result<Vec<Outcome>, Report<StageError>> {
    unimplemented!()
}
