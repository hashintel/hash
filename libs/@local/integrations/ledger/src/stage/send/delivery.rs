//! Sends one batch to the Graph, and falls back to single writes when the Graph refuses it.

use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::provenance::ProvidedEntityEditionProvenance,
    principal::actor::ActorEntityUuid,
};

use super::{
    ROW_INVALID,
    batch::{Batch, Write},
    client::{GraphClient, Response},
    request,
};
use crate::{
    run::{FailedEntity, SendPart, Stage},
    stage::{
        StageError,
        failure::{permanent, retryable},
    },
    sync_table::Op,
};

/// What the Graph did with one write sent on its own.
#[derive(Debug)]
enum Outcome {
    Created,
    Updated,
    Archived,
    /// A create found the entity, so it was patched.
    CreateExisted,
    /// An update did not find the entity, so it was created.
    UpdateMissing,
    /// An archive did not find the entity.
    ArchiveMissing,
    Refused {
        status: u16,
        message: Box<str>,
    },
}

/// Sends a run's batches to the Graph, acting for the run's actor, with the run's provenance on
/// every body it builds.
#[derive(Debug)]
pub(super) struct Delivery<'run> {
    pub graph: &'run GraphClient,
    pub actor: ActorEntityUuid,
    pub provenance: &'run ProvidedEntityEditionProvenance,
}

impl Delivery<'_> {
    /// Sends `batch`, the batch numbered `number`, as one bulk request and counts it into `part`.
    /// The Graph applies or refuses a bulk request as a whole, so a refused batch is sent again
    /// one write at a time, each as an upsert. A write the Graph still refuses is recorded in
    /// `part`.
    ///
    /// # Errors
    ///
    /// - [`StageError::Retryable`] if the Graph is not available. Nothing is recorded.
    /// - [`StageError::Permanent`] with the code `send_row_invalid` if the body of a fallback
    ///   cannot be built
    pub(super) async fn deliver(
        &self,
        number: u32,
        batch: &Batch,
        part: &mut SendPart,
    ) -> Result<(), Report<StageError>> {
        let bodies = batch
            .writes
            .iter()
            .map(|write| &*write.body)
            .collect::<Vec<_>>();
        let response = match batch.op {
            Op::CreateEntity | Op::CreateLink => self.graph.create_bulk(self.actor, &bodies).await,
            Op::UpdateEntity | Op::UpdateLink | Op::ArchiveEntity | Op::ArchiveLink => {
                self.graph.patch_bulk(self.actor, &bodies).await
            }
        };
        match response {
            Response::Applied => {
                let count = batch.writes.len() as u64;
                match batch.op {
                    Op::CreateEntity | Op::CreateLink => part.created += count,
                    Op::UpdateEntity | Op::UpdateLink => part.updated += count,
                    Op::ArchiveEntity | Op::ArchiveLink => part.archived += count,
                }
            }
            Response::Unavailable => return Err(Report::new(retryable(Stage::Send))),
            Response::Refused { status, .. } => {
                tracing::warn!(
                    batch = number,
                    status,
                    "the Graph refused a batch, sending its entities one by one"
                );
                for (index, write) in (0_u32..).zip(&batch.writes) {
                    let outcome = self.upsert(write).await?;
                    count(part, number, index, write, outcome);
                }
            }
        }
        Ok(())
    }

    /// Sends `write` on its own. A create of an entity that exists patches it, and an update of
    /// an entity that does not exist creates it.
    ///
    /// The client does not say what a status means. A 409 means the entity exists only after a
    /// create, and a 404 means it is missing only after a patch. A 404 after a create is the
    /// Graph not knowing the entity type, and is a refusal like any other.
    async fn upsert(&self, write: &Write) -> Result<Outcome, Report<StageError>> {
        let row = &write.row;
        match row.op {
            Op::CreateEntity | Op::CreateLink => {
                match self.graph.create(self.actor, &write.body).await {
                    Response::Refused { status: 409, .. } => {
                        let patch = request::patch(row, self.provenance)
                            .change_context(permanent(Stage::Send, ROW_INVALID))?;
                        applied(
                            self.graph.patch(self.actor, &patch).await,
                            Outcome::CreateExisted,
                        )
                    }
                    response @ (Response::Applied
                    | Response::Unavailable
                    | Response::Refused { .. }) => applied(response, Outcome::Created),
                }
            }
            Op::UpdateEntity | Op::UpdateLink => {
                match self.graph.patch(self.actor, &write.body).await {
                    Response::Refused { status: 404, .. } => {
                        let create = request::create(row, self.provenance)
                            .change_context(permanent(Stage::Send, ROW_INVALID))?;
                        applied(
                            self.graph.create(self.actor, &create).await,
                            Outcome::UpdateMissing,
                        )
                    }
                    response @ (Response::Applied
                    | Response::Unavailable
                    | Response::Refused { .. }) => applied(response, Outcome::Updated),
                }
            }
            Op::ArchiveEntity | Op::ArchiveLink => {
                match self.graph.patch(self.actor, &write.body).await {
                    Response::Refused { status: 404, .. } => Ok(Outcome::ArchiveMissing),
                    response @ (Response::Applied
                    | Response::Unavailable
                    | Response::Refused { .. }) => applied(response, Outcome::Archived),
                }
            }
        }
    }
}

/// `outcome` if the Graph applied the write, the refusal if it refused it.
///
/// # Errors
///
/// Returns [`StageError::Retryable`] if the Graph is not available.
fn applied(response: Response, outcome: Outcome) -> Result<Outcome, Report<StageError>> {
    match response {
        Response::Applied => Ok(outcome),
        Response::Unavailable => Err(Report::new(retryable(Stage::Send))),
        Response::Refused { status, message } => Ok(Outcome::Refused { status, message }),
    }
}

/// Counts the `outcome` of `write`, the write at `index` in the batch `number`, into `part`. A
/// case in which the Graph did not hold the entity as the row expected is logged.
fn count(part: &mut SendPart, number: u32, index: u32, write: &Write, outcome: Outcome) {
    let entity_id = write.row.entity_id;
    match outcome {
        Outcome::Created => part.created += 1,
        Outcome::Updated => part.updated += 1,
        Outcome::Archived => part.archived += 1,
        Outcome::CreateExisted => {
            tracing::warn!(%entity_id, "a create found the entity, which was patched");
            part.updated += 1;
            part.create_existed += 1;
        }
        Outcome::UpdateMissing => {
            tracing::warn!(%entity_id, "an update did not find the entity, which was created");
            part.created += 1;
            part.update_missing += 1;
        }
        Outcome::ArchiveMissing => {
            tracing::warn!(%entity_id, "an archive did not find the entity");
            part.archive_missing += 1;
        }
        Outcome::Refused { status, message } => part.failed.push(FailedEntity {
            batch: number,
            index,
            entity_id,
            status,
            message,
        }),
    }
}
