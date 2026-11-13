//! Ordered counts and bounded rejection publication without request or response values.
use std::collections::HashSet;

use error_stack::Report;

use super::{SendCounts, SendOutput, delivery::Outcome, writes::Write};
use crate::{
    RunContext, StageError,
    graph::OperationKind,
    run::table::{BufferedFile, Cell, Column, ColumnKind},
};

const COLUMNS: [Column; 7] = [
    Column {
        name: "entity_id",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "operation",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "change",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "target",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "source_id",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "status",
        kind: ColumnKind::UInt16,
        nullable: true,
    },
    Column {
        name: "reason",
        kind: ColumnKind::Text,
        nullable: false,
    },
];

#[derive(Default)]
pub(super) struct Tally {
    counts: SendCounts,
    pub rejected: HashSet<Box<str>>,
    file: Option<BufferedFile>,
}

impl Tally {
    pub(super) async fn record(
        &mut self,
        context: &RunContext,
        write: &Write,
        outcome: Outcome,
    ) -> Result<(), Report<StageError>> {
        let (status, reason) = match outcome {
            Outcome::Created => {
                self.counts.created += 1;
                return Ok(());
            }
            Outcome::Patched => {
                self.counts.patched += 1;
                return Ok(());
            }
            Outcome::Archived => {
                self.counts.archived += 1;
                return Ok(());
            }
            Outcome::Absent => {
                self.counts.absent += 1;
                return Ok(());
            }
            Outcome::Rejected { status, reason } => (status, reason),
        };
        self.counts.rejected += 1;
        if self.file.is_none() {
            self.file = Some(BufferedFile::create(context, &COLUMNS).await?);
        }
        self.file
            .as_mut()
            .expect("should create the rejection writer")
            .push(Box::new([
                Cell::Text(write.entity_id.clone()),
                Cell::Text(write.operation.as_str().into()),
                Cell::Text(write.change.as_str().into()),
                Cell::Text(write.target.clone()),
                Cell::Text(write.source_id.clone()),
                status.map_or(Cell::Null, |status| Cell::UInt(u64::from(status))),
                Cell::Text(reason.as_str().into()),
            ]))
            .await?;
        if write.operation == OperationKind::UpsertEntity {
            self.rejected.insert(write.entity_id.clone());
        }
        tracing::warn!(entity_id = %write.entity_id, operation = write.operation.as_str(), status, reason = reason.as_str(), "Graph write rejected");
        Ok(())
    }

    pub(super) async fn finish(
        self,
        context: &RunContext,
    ) -> Result<SendOutput, Report<StageError>> {
        let rejected = match self.file {
            Some(file) => Some(file.store(context).await?),
            None => None,
        };
        Ok(SendOutput {
            rejected,
            counts: self.counts,
        })
    }
}
