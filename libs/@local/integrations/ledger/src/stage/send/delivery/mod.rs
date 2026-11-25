//! Sends a run's batches to the Graph as the run's actor, and falls back to single writes for a
//! batch the Graph refuses.

#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _};
use reqwest::StatusCode;
use serde_json::value::RawValue;
use type_system::principal::actor::ActorEntityUuid;

use super::{
    client::{GraphClient, Response},
    plan::{ArchiveWrite, Batch, CreateWrite, Plan, Target, UpdateWrite, Writes},
    tally::{Effect, Outcome, Refusal, Tally},
};
use crate::run::SendPart;

/// The Graph did not answer, or answered with a status that says to try again later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the Graph is not available")]
pub(super) struct Unavailable;

/// What the Graph did with a request it answered.
#[derive(Debug, PartialEq, Eq)]
enum Reply {
    Applied,
    Refused(Refusal),
}

impl Reply {
    /// The reply of `response`, or [`Unavailable`] if the Graph did not answer.
    fn of(response: Response) -> Result<Self, Report<Unavailable>> {
        match response {
            Response::Applied => Ok(Self::Applied),
            Response::Unavailable => Err(Report::new(Unavailable)),
            Response::Refused { status, message } => Ok(Self::Refused(Refusal { status, message })),
        }
    }

    /// The outcome of a write the Graph answered with this reply: `applied` if the Graph applied
    /// it.
    fn outcome(self, applied: Effect) -> Outcome {
        match self {
            Self::Applied => Outcome::Applied(applied),
            Self::Refused(refusal) => Outcome::Refused(refusal),
        }
    }

    /// Whether the Graph refused the request with `status`.
    const fn refused_with(&self, status: StatusCode) -> bool {
        matches!(self, Self::Refused(refusal) if refusal.status == status.as_u16())
    }
}

/// A write that can be sent on its own when the Graph refuses its batch.
///
/// A status means something only for the request that got it: 409 after a create means the
/// entity exists, and 404 after a patch means it does not. A 404 after a create means the Graph
/// does not know the entity type, and is a refusal like any other.
trait Upsert: Sync {
    fn target(&self) -> &Target;

    /// Sends the write on its own, falling back to the other request when the Graph does not
    /// hold the entity as the row expected.
    ///
    /// # Errors
    ///
    /// Returns [`Unavailable`] if the Graph is not available.
    fn upsert(
        &self,
        delivery: &Delivery<'_>,
    ) -> impl Future<Output = Result<Outcome, Report<Unavailable>>> + Send;
}

impl Upsert for CreateWrite {
    fn target(&self) -> &Target {
        &self.target
    }

    async fn upsert(&self, delivery: &Delivery<'_>) -> Result<Outcome, Report<Unavailable>> {
        let reply = delivery.create(&self.create).await?;
        Ok(if reply.refused_with(StatusCode::CONFLICT) {
            delivery
                .patch(&self.patch)
                .await?
                .outcome(Effect::CreateExisted)
        } else {
            reply.outcome(Effect::Created)
        })
    }
}

impl Upsert for UpdateWrite {
    fn target(&self) -> &Target {
        &self.target
    }

    async fn upsert(&self, delivery: &Delivery<'_>) -> Result<Outcome, Report<Unavailable>> {
        let reply = delivery.patch(&self.patch).await?;
        Ok(if reply.refused_with(StatusCode::NOT_FOUND) {
            delivery
                .create(&self.create)
                .await?
                .outcome(Effect::UpdateMissing)
        } else {
            reply.outcome(Effect::Updated)
        })
    }
}

impl Upsert for ArchiveWrite {
    fn target(&self) -> &Target {
        &self.target
    }

    async fn upsert(&self, delivery: &Delivery<'_>) -> Result<Outcome, Report<Unavailable>> {
        let reply = delivery.patch(&self.archive).await?;
        Ok(if reply.refused_with(StatusCode::NOT_FOUND) {
            Outcome::ArchiveMissing
        } else {
            reply.outcome(Effect::Archived)
        })
    }
}

/// Sends the writes of one run to the Graph as the run's actor.
#[derive(Debug)]
pub(super) struct Delivery<'graph> {
    graph: &'graph GraphClient,
    actor: ActorEntityUuid,
}

impl<'graph> Delivery<'graph> {
    pub(super) const fn new(graph: &'graph GraphClient, actor: ActorEntityUuid) -> Self {
        Self { graph, actor }
    }

    /// Sends every batch of `plan` in order and counts what the Graph did. A write the Graph
    /// refuses is recorded, and the next one is sent.
    ///
    /// # Errors
    ///
    /// Returns [`Unavailable`] if the Graph is not available, with the batch it stopped in
    /// attached. Nothing counted before is returned.
    pub(super) async fn deliver(&self, plan: &Plan) -> Result<SendPart, Report<Unavailable>> {
        let mut tally = Tally::default();
        for batch in plan.batches() {
            self.batch(batch, &mut tally)
                .await
                .attach_with(|| format!("Send stopped in batch {}", batch.number()))?;
        }
        debug_assert_eq!(
            tally.rows(),
            plan.rows(),
            "the counts should add up to the rows of the run"
        );
        Ok(tally.into_part())
    }

    /// Sends `batch` as one bulk request.
    async fn batch(&self, batch: &Batch, tally: &mut Tally) -> Result<(), Report<Unavailable>> {
        match batch.writes() {
            Writes::Create(writes) => {
                let bodies = writes
                    .iter()
                    .map(|write| &*write.create)
                    .collect::<Vec<_>>();
                let reply = Reply::of(self.graph.create_bulk(self.actor, &bodies).await)?;
                self.settle(batch, writes, reply, Effect::Created, tally)
                    .await
            }
            Writes::Update(writes) => {
                let bodies = writes.iter().map(|write| &*write.patch).collect::<Vec<_>>();
                let reply = Reply::of(self.graph.patch_bulk(self.actor, &bodies).await)?;
                self.settle(batch, writes, reply, Effect::Updated, tally)
                    .await
            }
            Writes::Archive(writes) => {
                let bodies = writes
                    .iter()
                    .map(|write| &*write.archive)
                    .collect::<Vec<_>>();
                let reply = Reply::of(self.graph.patch_bulk(self.actor, &bodies).await)?;
                self.settle(batch, writes, reply, Effect::Archived, tally)
                    .await
            }
        }
    }

    /// Counts the `writes` of `batch` as `applied` if the Graph applied the batch. The Graph
    /// applies or refuses a bulk request as a whole, so a refused batch is sent again one write
    /// at a time.
    async fn settle(
        &self,
        batch: &Batch,
        writes: &[impl Upsert],
        reply: Reply,
        applied: Effect,
        tally: &mut Tally,
    ) -> Result<(), Report<Unavailable>> {
        match reply {
            Reply::Applied => {
                for write in writes {
                    tally.record(write.target(), Outcome::Applied(applied));
                }
            }
            Reply::Refused(refusal) => {
                tracing::warn!(
                    batch = batch.number(),
                    op = ?batch.op(),
                    writes = writes.len(),
                    status = refusal.status,
                    message = %refusal.message,
                    "the Graph refused a batch, sending its writes one at a time"
                );
                for write in writes {
                    let outcome = write
                        .upsert(self)
                        .await
                        .attach_with(|| format!("the write to `{}`", write.target().entity_id))?;
                    tally.record(write.target(), outcome);
                }
            }
        }
        Ok(())
    }

    /// Creates the entity of `body` on its own.
    async fn create(&self, body: &RawValue) -> Result<Reply, Report<Unavailable>> {
        Reply::of(self.graph.create(self.actor, body).await)
    }

    /// Patches the entity of `body` on its own.
    async fn patch(&self, body: &RawValue) -> Result<Reply, Report<Unavailable>> {
        Reply::of(self.graph.patch(self.actor, body).await)
    }
}
