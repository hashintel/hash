//! Bounded decoding of persisted writes without reparsing request values.
use alloc::collections::VecDeque;
use std::{fs::File, path::Path};

use arrow_array::{Array, RecordBatch, StringArray, UInt32Array, UInt64Array};
use error_stack::Report;
use parquet::arrow::arrow_reader::{ParquetRecordBatchReader, ParquetRecordBatchReaderBuilder};
use serde_json::value::RawValue;

use super::delivery::Outcome;
use crate::{
    Change, Code, StageError,
    graph::{OperationKind, RequestKind},
    run::error,
};

pub(super) struct Write {
    pub batch: u32,
    pub operation: OperationKind,
    pub change: Change,
    pub entity_id: Box<str>,
    pub target: Box<str>,
    pub source_id: Box<str>,
    pub left: Option<Box<str>>,
    pub right: Option<Box<str>>,
    pub create: Option<Box<RawValue>>,
    pub patch: Box<RawValue>,
}

impl Write {
    pub(super) const fn first_kind(&self) -> RequestKind {
        if matches!(self.change, Change::Insert) {
            RequestKind::Create
        } else {
            RequestKind::Patch
        }
    }

    pub(super) fn first_body(&self) -> &RawValue {
        if self.change == Change::Insert {
            self.create
                .as_deref()
                .expect("should have validated insert create body")
        } else {
            &self.patch
        }
    }

    pub(super) const fn first_outcome(&self) -> Outcome {
        match self.change {
            Change::Insert => Outcome::Created,
            Change::Update | Change::Resend => Outcome::Patched,
            Change::Archive => Outcome::Archived,
        }
    }
}

pub(super) struct WriteReader {
    reader: ParquetRecordBatchReader,
    pending: VecDeque<Write>,
    next_seq: u64,
    next_batch: u32,
    expected_batches: u32,
}

impl WriteReader {
    pub(super) fn open(path: &Path, rows: u64, batches: u32) -> Result<Self, Report<StageError>> {
        let file = File::open(path).map_err(error::scratch)?;
        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|error| Code::InvalidWrites.wrap(Report::new(error)))?;
        if u64::try_from(builder.metadata().file_metadata().num_rows()).ok() != Some(rows) {
            return Err(Code::InvalidWrites.report());
        }
        Ok(Self {
            reader: builder
                .with_batch_size(128)
                .build()
                .map_err(|error| Code::InvalidWrites.wrap(Report::new(error)))?,
            pending: VecDeque::new(),
            next_seq: 0,
            next_batch: 0,
            expected_batches: batches,
        })
    }

    pub(super) fn next_batch(&mut self) -> Result<Option<Vec<Write>>, Report<StageError>> {
        let mut batch: Vec<Write> = Vec::new();
        let mut bytes = 0_usize;
        loop {
            if self.pending.is_empty() {
                let Some(record) = self.reader.next() else {
                    break;
                };
                let record =
                    record.map_err(|error| Code::InvalidWrites.wrap(Report::new(error)))?;
                self.pending = decode(&record, &mut self.next_seq)?;
            }
            let Some(next) = self.pending.front() else {
                continue;
            };
            if let Some(first) = batch.first() {
                if next.batch != first.batch {
                    break;
                }
                if batch.len() >= 128
                    || next.operation != first.operation
                    || next.first_kind() != first.first_kind()
                {
                    return Err(Code::InvalidWrites.report());
                }
            }
            bytes = bytes.saturating_add(next.first_body().get().len());
            if !batch.is_empty() && bytes > 1_500_000 {
                return Err(Code::InvalidWrites.report());
            }
            batch.extend(self.pending.pop_front());
        }
        let Some(first) = batch.first() else {
            if self.next_batch != self.expected_batches {
                return Err(Code::InvalidWrites.report());
            }
            return Ok(None);
        };
        if self.next_batch >= self.expected_batches {
            return Err(Code::InvalidWrites.report());
        }
        if first.batch != self.next_batch {
            return Err(Code::InvalidWrites.report());
        }
        self.next_batch += 1;
        Ok(Some(batch))
    }
}

fn column<'batch, T: Array + 'static>(
    batch: &'batch RecordBatch,
    name: &str,
) -> Result<&'batch T, Report<StageError>> {
    batch
        .column_by_name(name)
        .and_then(|array| array.as_any().downcast_ref())
        .ok_or_else(|| Code::InvalidWrites.report())
}

fn text(array: &StringArray, row: usize) -> Result<&str, Report<StageError>> {
    if array.is_null(row) {
        return Err(Code::InvalidWrites.report());
    }
    Ok(array.value(row))
}

fn optional_text(array: &StringArray, row: usize) -> Option<Box<str>> {
    (!array.is_null(row)).then(|| array.value(row).into())
}

fn raw(text: &str) -> Result<Box<RawValue>, Report<StageError>> {
    RawValue::from_string(text.to_owned()).map_err(|_error| Code::InvalidWrites.report())
}

fn decode(batch: &RecordBatch, next_seq: &mut u64) -> Result<VecDeque<Write>, Report<StageError>> {
    let seq = column::<UInt64Array>(batch, "seq")?;
    let numbers = column::<UInt32Array>(batch, "batch")?;
    let operation = column::<StringArray>(batch, "operation")?;
    let change = column::<StringArray>(batch, "change")?;
    let entity = column::<StringArray>(batch, "entity_id")?;
    let target = column::<StringArray>(batch, "target")?;
    let source = column::<StringArray>(batch, "source_id")?;
    let left = column::<StringArray>(batch, "left_entity_id")?;
    let right = column::<StringArray>(batch, "right_entity_id")?;
    let create = column::<StringArray>(batch, "create")?;
    let patch = column::<StringArray>(batch, "patch")?;
    let mut writes = VecDeque::with_capacity(batch.num_rows());
    for row in 0..batch.num_rows() {
        if seq.is_null(row) || numbers.is_null(row) || seq.value(row) != *next_seq {
            return Err(Code::InvalidWrites.report());
        }
        *next_seq += 1;
        let operation = OperationKind::from_stored(text(operation, row)?)
            .map_err(|_error| Code::InvalidWrites.report())?;
        let change: Change = text(change, row)?
            .parse()
            .map_err(|_error| Code::InvalidWrites.report())?;
        let archive = matches!(
            operation,
            OperationKind::ArchiveLink | OperationKind::ArchiveEntity
        );
        if archive != (change == Change::Archive) {
            return Err(Code::InvalidWrites.report());
        }
        let create = if archive {
            None
        } else {
            Some(raw(text(create, row)?)?)
        };
        let left = optional_text(left, row);
        let right = optional_text(right, row);
        if operation == OperationKind::UpsertLink && (left.is_none() || right.is_none()) {
            return Err(Code::InvalidWrites.report());
        }
        writes.push_back(Write {
            batch: numbers.value(row),
            operation,
            change,
            entity_id: text(entity, row)?.into(),
            target: text(target, row)?.into(),
            source_id: text(source, row)?.into(),
            left,
            right,
            create,
            patch: raw(text(patch, row)?)?,
        });
    }
    Ok(writes)
}
