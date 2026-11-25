//! What the Graph did with a run's writes, counted into the `send` part of `run.json`.

use super::plan::Target;
use crate::run::{FailedEntity, SendPart};

/// A change the Graph applied for a write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Effect {
    Created,
    Updated,
    Archived,
    /// A create found the entity, so it was patched.
    CreateExisted,
    /// An update did not find the entity, so it was created.
    UpdateMissing,
}

/// A write the Graph refused, with its status and the start of its message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Refusal {
    pub status: u16,
    pub message: Box<str>,
}

/// What became of one write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Outcome {
    Applied(Effect),
    /// An archive did not find the entity.
    ArchiveMissing,
    Refused(Refusal),
}

/// The counts of a run's outcomes. Each write adds to exactly one of them.
#[derive(Debug, Default)]
pub(super) struct Tally {
    created: u64,
    updated: u64,
    archived: u64,
    create_existed: u64,
    update_missing: u64,
    archive_missing: u64,
    failed: Vec<FailedEntity>,
}

impl Tally {
    /// Counts the `outcome` of the write to `target`. A write the Graph refused, and one that
    /// found its entity other than its row expected, is logged with its entity id.
    pub(super) fn record(&mut self, target: &Target, outcome: Outcome) {
        let entity_id = target.entity_id;
        match outcome {
            Outcome::Applied(Effect::Created) => self.created += 1,
            Outcome::Applied(Effect::Updated) => self.updated += 1,
            Outcome::Applied(Effect::Archived) => self.archived += 1,
            Outcome::Applied(Effect::CreateExisted) => {
                tracing::warn!(%entity_id, "a create found the entity, which was patched");
                self.create_existed += 1;
            }
            Outcome::Applied(Effect::UpdateMissing) => {
                tracing::warn!(%entity_id, "an update did not find the entity, which was created");
                self.update_missing += 1;
            }
            Outcome::ArchiveMissing => {
                tracing::warn!(%entity_id, "an archive did not find the entity");
                self.archive_missing += 1;
            }
            Outcome::Refused(Refusal { status, message }) => {
                tracing::warn!(%entity_id, status, %message, "the Graph refused a write");
                self.failed.push(FailedEntity {
                    batch: target.position.batch,
                    index: target.position.index,
                    entity_id,
                    status,
                    message,
                });
            }
        }
    }

    /// The number of writes counted.
    pub(super) const fn rows(&self) -> u64 {
        self.created
            + self.updated
            + self.archived
            + self.create_existed
            + self.update_missing
            + self.archive_missing
            + self.failed.len() as u64
    }

    /// The `send` part. `created` and `updated` count what the Graph did, so an update that
    /// created its entity counts as created, and a create that patched it as updated.
    pub(super) fn into_part(self) -> SendPart {
        SendPart {
            created: self.created + self.update_missing,
            updated: self.updated + self.create_existed,
            archived: self.archived,
            create_existed: self.create_existed,
            update_missing: self.update_missing,
            archive_missing: self.archive_missing,
            failed: self.failed,
        }
    }
}
