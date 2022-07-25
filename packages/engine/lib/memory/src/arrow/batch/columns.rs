//! This module contains code to access the columns in the batch.s

use arrow::array::ArrayRef;

use super::super::record_batch::RecordBatch;
use crate::error::{Error, Result};

/// Finds the column in a given [`RecordBatch`] (provided that it exists) and returns a
/// reference ([`ArrayRef`]) to the column (returns an error otherwise).
// one might think we can remove the lifetime here (we can), but we use this in functions which
// are passed references to the [`RecordBatch`] and return data which references its columns. If
// the columns do not have the same lifetime as the record batch (i.e. if they are cloned)
// they are dropped when these functions return, which means that we cannot return useful
// things (like iterators).
pub fn column_with_name_from_record_batch<'a>(
    record_batch: &'a RecordBatch,
    name: &str,
) -> Result<&'a ArrayRef> {
    let index = record_batch
        .schema()
        .fields
        .iter()
        .enumerate()
        .find_map(|(index, field)| (field.name == name).then_some(Some(index)))
        .flatten()
        .ok_or_else(|| Error::ColumnNotFound(name.into()))?;

    Ok(record_batch.column(index))
}
