//! The order a run's rows are sent in, and the batches they are cut into.
//!
//! Only [`Plan::new`] makes a [`Batch`], so every batch holds writes of one [`Op`], names an entity
//! at most once, and stays within the run's limits unless it holds a single body larger than
//! `max_bytes`. The rows, their bodies and the limits come from the sync table and `run.json`, so
//! every attempt of Send cuts the same batches, and a write's [`Position`] means the same on every
//! attempt.

#[cfg(test)]
mod tests;

use core::cmp::Ordering;
use std::collections::HashSet;

use error_stack::Report;
use serde_json::value::RawValue;
use type_system::knowledge::entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance};

use super::request::{self, RequestError};
use crate::{
    run::BatchLimits,
    sync_table::{Op, SyncRow, order_key},
};

/// Where a write is in the plan: its batch and its place in the batch, both counted from 0.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Position {
    pub batch: u32,
    pub index: u32,
}

/// The entity a write changes, and where the write is in the plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Target {
    pub entity_id: EntityId,
    pub position: Position,
}

/// A create, and the patch it falls back to when the entity exists.
#[derive(Debug)]
pub(super) struct CreateWrite {
    pub target: Target,
    pub create: Box<RawValue>,
    pub patch: Box<RawValue>,
}

/// An update, and the create it falls back to when the entity does not exist.
#[derive(Debug)]
pub(super) struct UpdateWrite {
    pub target: Target,
    pub patch: Box<RawValue>,
    pub create: Box<RawValue>,
}

#[derive(Debug)]
pub(super) struct ArchiveWrite {
    pub target: Target,
    pub archive: Box<RawValue>,
}

/// The writes of one batch, all of one kind.
#[derive(Debug)]
pub(super) enum Writes {
    Create(Vec<CreateWrite>),
    Update(Vec<UpdateWrite>),
    Archive(Vec<ArchiveWrite>),
}

impl Writes {
    pub(super) const fn len(&self) -> usize {
        match self {
            Self::Create(writes) => writes.len(),
            Self::Update(writes) => writes.len(),
            Self::Archive(writes) => writes.len(),
        }
    }
}

/// Writes of one [`Op`] that are sent as one bulk request.
#[derive(Debug)]
pub(super) struct Batch {
    number: u32,
    op: Op,
    writes: Writes,
}

impl Batch {
    pub(super) const fn number(&self) -> u32 {
        self.number
    }

    pub(super) const fn op(&self) -> Op {
        self.op
    }

    pub(super) const fn writes(&self) -> &Writes {
        &self.writes
    }
}

/// A run's writes in the order they are sent, cut into batches.
#[derive(Debug)]
pub(super) struct Plan {
    batches: Vec<Batch>,
    rows: u64,
}

impl Plan {
    /// Orders `rows` by their [`Op`], then by `seq`, then by entity, then by the bytes of their
    /// body, and cuts them into batches within `limits`. Each body carries `provenance`. A write
    /// the last batch does not admit starts a new one, so a body larger than `max_bytes` gets a
    /// batch of its own and is still sent.
    ///
    /// # Errors
    ///
    /// Returns [`RequestError`] if a body of a row cannot be built.
    pub(super) fn new(
        rows: &[SyncRow],
        provenance: &ProvidedEntityEditionProvenance,
        limits: BatchLimits,
    ) -> Result<Self, Report<RequestError>> {
        let row_count = rows.len() as u64;
        let mut pending = rows
            .iter()
            .map(|row| Pending::new(row, provenance))
            .collect::<Result<Vec<_>, _>>()?;
        pending.sort_by(Pending::order);

        let mut open: Vec<OpenBatch> = Vec::new();
        for write in pending {
            let rejected = match open.last_mut() {
                Some(batch) => batch.offer(write, limits),
                None => Err(write),
            };
            if let Err(write) = rejected {
                let number =
                    u32::try_from(open.len()).expect("a run should have fewer than 2^32 batches");
                open.push(OpenBatch::start(number, write));
            }
        }
        Ok(Self {
            batches: open.into_iter().map(|batch| batch.batch).collect(),
            rows: row_count,
        })
    }

    pub(super) fn batches(&self) -> &[Batch] {
        &self.batches
    }

    /// The number of rows the plan was made from, which is the number of its writes.
    pub(super) const fn rows(&self) -> u64 {
        self.rows
    }
}

/// The bodies of a row before it joins a batch.
#[derive(Debug)]
enum Bodies {
    Create {
        create: Box<RawValue>,
        patch: Box<RawValue>,
    },
    Update {
        patch: Box<RawValue>,
        create: Box<RawValue>,
    },
    Archive {
        archive: Box<RawValue>,
    },
}

/// A row's write before it joins a batch, with what orders and cuts it.
#[derive(Debug)]
struct Pending {
    op: Op,
    seq: i64,
    entity_id: EntityId,
    bodies: Bodies,
}

impl Pending {
    /// Builds every body of `row`, so that a row that cannot be sent stops Send before its first
    /// request.
    fn new(
        row: &SyncRow,
        provenance: &ProvidedEntityEditionProvenance,
    ) -> Result<Self, Report<RequestError>> {
        let bodies = match row.op {
            Op::CreateEntity | Op::CreateLink => Bodies::Create {
                create: request::create(row, provenance)?,
                patch: request::patch(row, provenance)?,
            },
            Op::UpdateEntity | Op::UpdateLink => Bodies::Update {
                patch: request::patch(row, provenance)?,
                create: request::create(row, provenance)?,
            },
            Op::ArchiveEntity | Op::ArchiveLink => Bodies::Archive {
                archive: request::archive(row, provenance)?,
            },
        };
        Ok(Self {
            op: row.op,
            seq: row.seq,
            entity_id: row.entity_id,
            bodies,
        })
    }

    /// The body a bulk request sends for this write.
    fn bulk_body(&self) -> &RawValue {
        match &self.bodies {
            Bodies::Create { create: body, .. }
            | Bodies::Update { patch: body, .. }
            | Bodies::Archive { archive: body } => body,
        }
    }

    /// The bytes the bulk body adds to the list of a bulk request: its own, and the comma or the
    /// closing bracket after it.
    fn listed_size(&self) -> u64 {
        self.bulk_body().get().len() as u64 + 1
    }

    /// The order writes are sent in. The bytes of the bulk body settle a tie of two rows of one
    /// entity with the same `seq`.
    fn order(&self, other: &Self) -> Ordering {
        (self.op, self.seq, order_key(&self.entity_id))
            .cmp(&(other.op, other.seq, order_key(&other.entity_id)))
            .then_with(|| self.bulk_body().get().cmp(other.bulk_body().get()))
    }
}

/// A batch that writes can still join, with what decides whether one can.
#[derive(Debug)]
struct OpenBatch {
    batch: Batch,
    /// The bytes of the batch's bodies as one list.
    size: u64,
    entities: HashSet<EntityId>,
}

impl OpenBatch {
    /// A batch numbered `number` that starts with `write`.
    fn start(number: u32, write: Pending) -> Self {
        // The opening bracket of the list, then the first body.
        let size = 1 + write.listed_size();
        let entities = HashSet::from([write.entity_id]);
        let target = Target {
            entity_id: write.entity_id,
            position: Position {
                batch: number,
                index: 0,
            },
        };
        let writes = match write.bodies {
            Bodies::Create { create, patch } => Writes::Create(vec![CreateWrite {
                target,
                create,
                patch,
            }]),
            Bodies::Update { patch, create } => Writes::Update(vec![UpdateWrite {
                target,
                patch,
                create,
            }]),
            Bodies::Archive { archive } => Writes::Archive(vec![ArchiveWrite { target, archive }]),
        };
        Self {
            batch: Batch {
                number,
                op: write.op,
                writes,
            },
            size,
            entities,
        }
    }

    /// Adds `write` if the batch has room for it within `limits`, does not name its entity yet,
    /// and holds writes of its [`Op`]. Otherwise hands `write` back.
    fn offer(&mut self, write: Pending, limits: BatchLimits) -> Result<(), Pending> {
        let size = self.size + write.listed_size();
        let count = self.batch.writes.len();
        if u32::try_from(count).map_or(true, |count| count >= limits.max_writes)
            || size > limits.max_bytes
            || self.entities.contains(&write.entity_id)
        {
            return Err(write);
        }
        let target = Target {
            entity_id: write.entity_id,
            position: Position {
                batch: self.batch.number,
                index: u32::try_from(count).expect("a batch should hold fewer than 2^32 writes"),
            },
        };
        let Pending {
            op,
            seq,
            entity_id,
            bodies,
        } = write;
        let same_op = op == self.batch.op;
        match (&mut self.batch.writes, bodies) {
            (Writes::Create(writes), Bodies::Create { create, patch }) if same_op => {
                writes.push(CreateWrite {
                    target,
                    create,
                    patch,
                });
            }
            (Writes::Update(writes), Bodies::Update { patch, create }) if same_op => {
                writes.push(UpdateWrite {
                    target,
                    patch,
                    create,
                });
            }
            (Writes::Archive(writes), Bodies::Archive { archive }) if same_op => {
                writes.push(ArchiveWrite { target, archive });
            }
            // A write of another op, which may be another kind of write.
            (_, bodies) => {
                return Err(Pending {
                    op,
                    seq,
                    entity_id,
                    bodies,
                });
            }
        }
        self.size = size;
        self.entities.insert(entity_id);
        Ok(())
    }
}
