//! This module contains code to access the columns in the batch.s

use arrow2::array::Array;

use super::super::record_batch::RecordBatch;
use crate::error::{Error, Result};

/// Finds the column in a given [`RecordBatch`] (provided that it exists) and returns a
/// reference ([`Box<dyn Array>`]) to the column (returns an error otherwise) with the same lifetime
/// as the [`RecordBatch`].
// this is necessary, because GrowableArrayData is implemented for Box<dyn Array> but not
// &dyn Array
#[allow(clippy::borrowed_box)]
pub fn column_with_name_from_record_batch<'a>(
    record_batch: &'a RecordBatch,
    name: &str,
) -> Result<&'a Box<dyn Array>> {
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
