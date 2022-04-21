use std::borrow::Cow;

use arrow::{array::Array, datatypes::DataType, record_batch::RecordBatch, util::bit_util};
use memory::arrow::{col_to_json_vals, column_with_name, ColumnChange};

use crate::{
    agent::{arrow::boolean::BooleanColumn, AgentStateField},
    field::{POSITION_DIM, UUID_V4_LEN},
    Error, Result,
};

// TODO: Use in Rust runner, and look up column without using PREVIOUS_INDEX_COLUMN_INDEX
#[allow(unused, unreachable_code, clippy::diverging_sub_expression)]
pub(in crate) fn get_old_message_index(
    record_batch: &RecordBatch,
    row_index: usize,
) -> Result<Option<&[u32; 2]>> {
    let col = record_batch.column(todo!());
    let data_ref = col.data_ref();
    let nulls = data_ref.null_buffer();

    // TODO: If there are nulls in the column with old message locations, then `typed_data`
    //       might give a reference to uninitialized data, so `MaybeUninit<u32>` would be a
    //       better type.
    let child_data_buffer = unsafe { data_ref.child_data()[0].buffers()[0].typed_data::<u32>() };

    // SAFETY: The column with old message locations has two `u32` indices per row (i.e. each
    //         location is a tuple of two indices), so it must be viewable as a slice of
    //         `[u32; 2]`. (Space is allocated for a tuple even if a row is null.)
    // TODO: Use `TryInto` instead
    let data_as_tuples = unsafe { &*(child_data_buffer as *const [u32] as *const [[u32; 2]]) };
    let old_message_location = &data_as_tuples[row_index];

    if let Some(nulls) = nulls {
        // This column is nullable.
        let nulls = nulls.as_slice();
        if bit_util::get_bit(nulls, row_index) {
            // The null buffer contains a 1 for this row, so this row isn't null.
            Ok(Some(old_message_location))
        } else {
            // This row is null, so the data referenced by `old_message_location` is
            // actually invalid and shouldn't be returned.
            Ok(None)
        }
    } else {
        // This column is non-nullable, so this row can't be null.
        Ok(Some(old_message_location))
    }
}

// TODO: no set_id, but ID must have null bytes if too short
pub(crate) fn agent_id_iter(
    record_batch: &RecordBatch,
) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
    let column_name = AgentStateField::AgentId.name();
    let column = column_with_name(record_batch, column_name)?;
    // FixedSizeBinary has a single buffer (no offsets)
    let data = column.data_ref();
    let buffer = &data.buffers()[0];
    let mut bytes_ptr = buffer.as_ptr();
    // SAFETY: All ids have `UUID_V4_LEN` bytes, so we can iterate over them by moving the
    //         pointer forward by that amount after each agent.
    Ok((0..column.len()).map(move |_| unsafe {
        let id = &*(bytes_ptr as *const [u8; UUID_V4_LEN]);
        bytes_ptr = bytes_ptr.add(UUID_V4_LEN);
        id // one id per agent
    }))
}

pub(in crate) fn agent_name_iter(
    record_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Option<&str>>> {
    let column_name = AgentStateField::AgentName.name();
    str_iter(record_batch, column_name)
}

pub fn get_agent_name(record_batch: &RecordBatch) -> Result<Vec<Option<Cow<'_, str>>>> {
    let column_name = AgentStateField::AgentName.name();
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::StringArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    let mut result = Vec::with_capacity(row_count);
    for i in 0..row_count {
        if column.is_valid(i) {
            result.push(Some(Cow::Borrowed(column.value(i))));
        } else {
            result.push(None);
        }
    }
    Ok(result)
}

#[allow(clippy::option_if_let_else)]
pub fn agent_name_as_array(
    record_batch: &RecordBatch,
    column: &[Option<impl AsRef<str>>],
) -> Result<ColumnChange> {
    // Guess that the concatenated names of all agents in this record batch have at least 512
    // characters. This initial capacity guess only affects performance, so the exact value
    // isn't too important.

    // TODO: OPTIM: Maybe we can still improve performance though by adjusting this value or
    //       making it depend on the number of agents.
    let mut builder = arrow::array::StringBuilder::new(512);

    column.iter().try_for_each(|v| {
        if let Some(value) = v {
            builder.append_value(value)
        } else {
            builder.append_null()
        }
    })?;

    let column_name = AgentStateField::AgentName.name();
    let (index, _) = record_batch
        .schema()
        .column_with_name(column_name)
        .ok_or_else(|| Error::ColumnNotFound(column_name.into()))?;

    Ok(ColumnChange {
        data: builder.finish().data().clone(),
        index,
    })
}

pub(crate) fn topology_mut_iter(
    record_batch: &mut RecordBatch,
) -> Result<(
    impl Iterator<
        Item = (
            Option<&mut [f64; POSITION_DIM]>,
            Option<&mut [f64; POSITION_DIM]>,
        ),
    >,
    BooleanColumn,
)> {
    let row_count = record_batch.num_rows();
    // TODO: Remove the dependency on the `position_was_corrected` field
    let pwc_column = column_with_name(record_batch, "position_was_corrected")?;
    let pwc_column = BooleanColumn::new_non_nullable(pwc_column);

    let pos_column_name = AgentStateField::Position.name();
    let pos_column = column_with_name(record_batch, pos_column_name)?;

    let pos_column = pos_column
        .as_any()
        .downcast_ref::<arrow::array::FixedSizeListArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: pos_column_name.into(),
        })?;

    // SAFETY: The position column contains fixed sized lists of 3 floats. These are stored
    // consecutively in memory, i.e. as [first agent's first coordinate, first agent's second
    // coordinate, first agent's third coordinate, second agent's first coordinate, etc]. The
    // child data contains these consecutive floats as a flat slice.

    // column.data_ref() -> [[f64; 3]]
    // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
    let pos_child_data_buffer =
        unsafe { pos_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };
    debug_assert_eq!(
        row_count * POSITION_DIM,
        pos_child_data_buffer.len(),
        "Position column child data doesn't have expected number of coordinates per row"
    );

    let dir_column_name = AgentStateField::Direction.name();
    let dir_column = column_with_name(record_batch, dir_column_name)?;

    let dir_column = dir_column
        .as_any()
        .downcast_ref::<arrow::array::FixedSizeListArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: dir_column_name.into(),
        })?;

    // SAFETY: Same as position child data above
    let dir_child_data_buffer =
        unsafe { dir_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };
    debug_assert_eq!(
        row_count * POSITION_DIM, // Positions and directions have same dimensions.
        dir_child_data_buffer.len(),
        "Direction column child data doesn't have expected number of coordinates per row"
    );

    Ok((
        (0..row_count).map(move |i| {
            let pos = if pos_column.is_valid(i) {
                let start_index = i * POSITION_DIM;
                // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
                // TODO: UNSOUND: we are casting `&[f64]` to `&mut [f64;3];
                //   see https://app.asana.com/0/1199548034582004/1201971484219243/f
                Some(unsafe {
                    &mut *(pos_child_data_buffer[start_index..start_index + POSITION_DIM].as_ptr()
                        as *mut [f64; POSITION_DIM])
                })
            } else {
                None
            };

            let dir = if dir_column.is_valid(i) {
                let start_index = i * POSITION_DIM;
                // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
                // TODO: UNSOUND: we are casting `&[f64]` to `&mut [f64;3];
                //   see https://app.asana.com/0/1199548034582004/1201971484219243/f
                Some(unsafe {
                    &mut *(dir_child_data_buffer[start_index..start_index + POSITION_DIM].as_ptr()
                        as *mut [f64; POSITION_DIM])
                })
            } else {
                None
            };

            (pos, dir)
        }),
        pwc_column,
    ))
}

pub(in crate) fn position_iter(
    record_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
    let column_name = AgentStateField::Position.name();
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::FixedSizeListArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    // SAFETY: The position column contains fixed sized lists of 3 floats. These are stored
    // consecutively in memory, i.e. as [first agent's first coordinate, first agent's second
    // coordinate, first agent's third coordinate, second agent's first coordinate, etc]. The
    // child data contains these consecutive floats as a flat slice.

    // column.data_ref() -> [[f64; 3]]
    // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
    let child_data_buffer =
        unsafe { column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };
    debug_assert_eq!(
        row_count * POSITION_DIM,
        child_data_buffer.len(),
        "Position column child data doesn't have expected number of coordinates per row"
    );

    Ok((0..row_count).map(move |i| {
        let _ = &child_data_buffer;
        if column.is_valid(i) {
            let start_index = i * POSITION_DIM;
            // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
            Some(
                child_data_buffer[start_index..start_index + POSITION_DIM]
                    .try_into()
                    .unwrap(),
            )
        } else {
            None
        }
    }))
}

#[allow(dead_code)]
pub(crate) fn direction_iter(
    record_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
    let column_name = AgentStateField::Direction.name();
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::FixedSizeListArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    // SAFETY: Same as in `position_iter` function above
    let child_data_buffer =
        unsafe { column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

    Ok((0..row_count).map(move |i| {
        if column.is_valid(i) {
            let start_index = i * POSITION_DIM;
            // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
            Some(
                child_data_buffer[start_index..start_index + POSITION_DIM]
                    .try_into()
                    .unwrap(),
            )
        } else {
            None
        }
    }))
}

pub(in crate) fn search_radius_iter(
    record_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Option<f64>> + '_> {
    // TODO[1] remove dependency on neighbors package
    let column_name = "search_radius";
    f64_iter(record_batch, column_name)
}

pub(in crate) fn f64_iter<'a>(
    record_batch: &'a RecordBatch,
    column_name: &str,
) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::Float64Array>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    Ok((0..row_count).map(move |i| {
        if column.is_valid(i) {
            Some(column.value(i))
        } else {
            None
        }
    }))
}

pub(in crate) fn exists_iter<'a>(
    record_batch: &'a RecordBatch,
    column_name: &str,
) -> Result<impl Iterator<Item = bool> + 'a> {
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    Ok((0..row_count).map(move |i| column.is_valid(i)))
}

pub(in crate) fn str_iter<'a>(
    record_batch: &'a RecordBatch,
    column_name: &str,
) -> Result<impl Iterator<Item = Option<&'a str>>> {
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::StringArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    Ok((0..row_count).map(move |i| {
        if column.is_valid(i) {
            Some(column.value(i))
        } else {
            None
        }
    }))
}

pub(in crate) fn bool_iter<'a>(
    record_batch: &'a RecordBatch,
    column_name: &str,
) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
    let row_count = record_batch.num_rows();
    let column = column_with_name(record_batch, column_name)?;

    let column = column
        .as_any()
        .downcast_ref::<arrow::array::BooleanArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: column_name.into(),
        })?;

    Ok((0..row_count).map(move |i| {
        if column.is_valid(i) {
            Some(column.value(i))
        } else {
            None
        }
    }))
}

// Iterate string fields and deserialize them into serde_json::Value objects
pub(in crate) fn json_deserialize_str_value_iter<'a>(
    record_batch: &'a RecordBatch,
    column_name: &str,
) -> Result<impl Iterator<Item = serde_json::Value> + 'a> {
    let iterator = str_iter(record_batch, column_name)?.map(|a| {
        a.map(|v| match serde_json::from_str(v) {
            Ok(v) => v,
            Err(_) => {
                tracing::warn!("Cannot deserialize value {}", v);
                serde_json::Value::Null
            }
        })
        .unwrap_or_else(|| serde_json::Value::Null)
    });

    Ok(iterator)
}

// Iterate over any non-serialized fields (like f64, array, struct, ...) and serialize them into
// serde_json::Value objects
pub(in crate) fn json_values(
    record_batch: &RecordBatch,
    column_name: &str,
    data_type: &DataType,
) -> Result<Vec<serde_json::Value>> {
    let column = column_with_name(record_batch, column_name)?;
    Ok(col_to_json_vals(column, data_type)?)
}
