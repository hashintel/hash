//! The order a run's rows are sent in, and the batches they are cut into.

use error_stack::Report;
use serde_json::value::RawValue;
use type_system::knowledge::entity::provenance::ProvidedEntityEditionProvenance;

use super::request::{self, RequestError};
use crate::{
    run::BatchLimits,
    sync_table::{Op, SyncRow, order_key},
};

/// A row of the sync table and the body for its own kind of change.
#[derive(Debug)]
pub(super) struct Write {
    pub row: SyncRow,
    pub body: Box<RawValue>,
}

impl Write {
    /// Builds the body of `row` with `provenance`: a create, a patch or an archive.
    ///
    /// # Errors
    ///
    /// Returns [`RequestError`] if the body cannot be built.
    pub(super) fn new(
        row: SyncRow,
        provenance: &ProvidedEntityEditionProvenance,
    ) -> Result<Self, Report<RequestError>> {
        let body = match row.op {
            Op::CreateEntity | Op::CreateLink => request::create(&row, provenance)?,
            Op::UpdateEntity | Op::UpdateLink => request::patch(&row, provenance)?,
            Op::ArchiveEntity | Op::ArchiveLink => request::archive(&row, provenance)?,
        };
        Ok(Self { row, body })
    }
}

/// Writes of one kind of change that are sent as one bulk request.
#[derive(Debug)]
pub(super) struct Batch {
    pub op: Op,
    pub writes: Vec<Write>,
}

impl Batch {
    /// Sorts `writes` by kind of change, then by `seq`, then by entity, and cuts them into batches.
    ///
    /// A new batch starts when the kind of change differs, the batch has `max_writes` writes, the
    /// body would take the batch over `max_bytes`, or the entity already has a write in the batch.
    /// A list of n bodies takes the bytes of the bodies plus n + 1. A body larger than `max_bytes`
    /// goes into a batch of its own.
    pub(super) fn cut(mut writes: Vec<Write>, limits: BatchLimits) -> Vec<Self> {
        writes.sort_by_key(|write| (write.row.op, write.row.seq, order_key(&write.row.entity_id)));

        let mut batches: Vec<Self> = Vec::new();
        // The bytes of the last batch's bodies as one list.
        let mut size = 0_u64;
        for write in writes {
            let listed = write.body.get().len() as u64 + 1;
            let full = batches.last().is_none_or(|batch| {
                batch.op != write.row.op
                    || batch.writes.len() as u64 >= u64::from(limits.max_writes)
                    || size + listed > limits.max_bytes
                    || batch
                        .writes
                        .iter()
                        .any(|other| other.row.entity_id == write.row.entity_id)
            });
            if full {
                batches.push(Self {
                    op: write.row.op,
                    writes: Vec::new(),
                });
                // The opening bracket of the list.
                size = 1;
            }
            size += listed;
            batches
                .last_mut()
                .expect("a batch should have been added")
                .writes
                .push(write);
        }
        batches
    }
}
