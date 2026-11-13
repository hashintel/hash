//! Send immutable planned requests, publish the result, and conditionally commit the run.
mod delivery;
mod tally;
#[cfg(test)]
mod tests;
mod writes;
use error_stack::Report;
use serde::{Deserialize, Serialize};

use self::{tally::Tally, writes::WriteReader};
use crate::{
    ArtifactRef, Code, RunContext, RunInput, StageError,
    graph::Graph,
    run::{
        current,
        marker::{finish, finished},
    },
    stage::{diff::DiffOutput, plan::PlanOutput},
};
/// Delivery completion; committing current state remains a separate conditional operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendOutput {
    pub rejected: Option<ArtifactRef>,
    pub counts: SendCounts,
}
/// The result of every planned write.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendCounts {
    pub created: u64,
    pub patched: u64,
    pub archived: u64,
    pub absent: u64,
    pub rejected: u64,
}

/// Delivers the planned checkpoint and commits only while this run retains authority.
///
/// # Errors
/// Returns classified checkpoint, storage, transport, supersession or base-movement errors.
/// A completed send marker suppresses delivery but never bypasses conditional commit checks.
#[tracing::instrument(level = "info", skip_all, fields(run = %input.run))]
pub async fn send(
    context: &RunContext,
    input: &RunInput,
    diff: &DiffOutput,
    plan: &PlanOutput,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    let key = context.namespace.send_output(input.run.into());
    let output = if let Some(output) = finished(context, &key).await? {
        output
    } else {
        current::mark_sending(context, input.run, diff.base, &diff.resent).await?;
        let guard = SendGuard {
            context,
            input,
            diff,
        };
        let output = deliver(&guard, plan, graph).await?;
        guard.check().await?;
        finish(context, &key, &output).await?
    };
    current::commit(context, input.run, diff.base, &diff.resent).await?;
    Ok(output)
}

struct SendGuard<'run> {
    context: &'run RunContext,
    input: &'run RunInput,
    diff: &'run DiffOutput,
}

impl SendGuard<'_> {
    async fn check(&self) -> Result<(), Report<StageError>> {
        current::check_sending(
            self.context,
            self.input.run,
            self.diff.base,
            &self.diff.resent,
        )
        .await
    }
}

async fn deliver(
    guard: &SendGuard<'_>,
    plan: &PlanOutput,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    let mut tally = Tally::default();
    let rows = plan
        .counts
        .values()
        .try_fold(0_u64, |sum, count| sum.checked_add(*count))
        .ok_or_else(|| Code::InvalidWrites.report())?;
    if (plan.batches == 0) != (rows == 0) {
        return Err(Code::InvalidWrites.report());
    }
    if plan.batches > 0 {
        let path = guard.context.fetch(&plan.writes).await?;
        let batches = plan.batches;
        let mut reader =
            tokio::task::spawn_blocking(move || WriteReader::open(&path, rows, batches))
                .await
                .map_err(|error| Code::ReaderStopped.wrap(Report::new(error)))??;
        loop {
            let (returned, batch) = tokio::task::spawn_blocking(move || {
                let batch = reader.next_batch()?;
                Ok::<_, Report<StageError>>((reader, batch))
            })
            .await
            .map_err(|error| Code::ReaderStopped.wrap(Report::new(error)))??;
            reader = returned;
            let Some(batch) = batch else { break };
            let outcomes = delivery::batch(guard, graph, &batch, &tally.rejected).await?;
            for (write, outcome) in batch.iter().zip(outcomes) {
                tally.record(guard.context, write, outcome).await?;
            }
        }
    }
    guard.check().await?;
    tally.finish(guard.context).await
}
