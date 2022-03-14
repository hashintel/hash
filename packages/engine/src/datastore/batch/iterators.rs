use arrow::{array::ArrayRef, record_batch::RecordBatch};

use crate::datastore::{Error, Result};

pub mod agent {
    use arrow::datatypes::DataType;

    use crate::datastore::{prelude::*, POSITION_DIM, UUID_V4_LEN};

    pub fn agent_id_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = &'b [u8; UUID_V4_LEN]> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::agent_id_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_id_iter_ref<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = &'b [u8; UUID_V4_LEN]> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::agent_id_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn agent_name_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::agent_name_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_name_iter_ref<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::agent_name_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_value_iter_cols<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
        data_type: &DataType,
    ) -> Result<Box<dyn Iterator<Item = serde_json::Value> + Send + Sync + 'a>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::json_values(
                agent_batch.record_batch()?,
                field_name,
                data_type,
            )?;
            iterables.push(iterable.into_iter());
        }
        Ok(Box::new(iterables.into_iter().flatten()))
    }

    /// Get the index of an agent in Context Batch
    pub fn index_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> impl Iterator<Item = AgentIndex> + 'a {
        agent_pool.iter().enumerate().flat_map(|(i, g)| {
            let num_agents = g.num_agents() as u32;
            let group_index = i as u32;
            (0..num_agents).map(move |j| (group_index, j))
        })
    }

    pub fn position_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = Option<&'b [f64; POSITION_DIM]>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::position_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }

        Ok(iterables.into_iter().flatten())
    }

    pub fn search_radius_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::search_radius_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn f64_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::f64_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn exists_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
    ) -> Result<impl Iterator<Item = bool> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable =
                super::record_batch::exists_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn str_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::str_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn bool_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::record_batch::bool_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_serialized_value_iter<'b: 'a, 'a>(
        agent_pool: &'a [&'b AgentBatch],
        field_name: &str,
    ) -> Result<impl Iterator<Item = serde_json::Value> + Send + Sync + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let record_batch = agent_batch.record_batch()?;
            let iterable =
                super::record_batch::json_deserialize_str_value_iter(record_batch, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }
}

pub fn column_with_name<'a>(record_batch: &'a RecordBatch, name: &str) -> Result<&'a ArrayRef> {
    let (index, _) = record_batch
        .schema()
        .column_with_name(name)
        .ok_or_else(|| Error::ColumnNotFound(name.into()))?;

    Ok(record_batch.column(index))
}

// Special-case columns getters and setters
pub mod record_batch {
    use std::borrow::Cow;

    use arrow::{array::Array, datatypes::DataType, record_batch::RecordBatch};

    use super::column_with_name;
    use crate::{
        datastore::{
            arrow::batch_conversion::col_to_json_vals,
            batch::{boolean::Column as BooleanColumn, change::ColumnChange},
            prelude::arrow_bit_util,
            Error, Result, POSITION_DIM, UUID_V4_LEN,
        },
        hash_types::state::AgentStateField,
    };

    // TODO: Use in Rust runner, and look up column without using PREVIOUS_INDEX_COLUMN_INDEX
    #[allow(unused, unreachable_code)]
    pub fn get_old_message_index(
        record_batch: &RecordBatch,
        row_index: usize,
    ) -> Result<Option<&[u32; 2]>> {
        let col = record_batch.column(todo!());
        let data_ref = col.data_ref();
        let nulls = data_ref.null_buffer();

        // TODO: If there are nulls in the column with old message locations,
        //       then `typed_data` might give a reference to uninitialized data,
        //       so `MaybeUninit<u32>` would be a better type.
        let child_data_buffer =
            unsafe { data_ref.child_data()[0].buffers()[0].typed_data::<u32>() };

        // SAFETY: The column with old message locations has two `u32` indices per row
        // (i.e. each location is a tuple of two indices), so it must be viewable as a
        // slice of `[u32; 2]`. (Space is allocated for a tuple even if a row is null.)
        // TODO: Safer way to do this? (safe transmute crate?)
        let data_as_tuples = unsafe { &*(child_data_buffer as *const [u32] as *const [[u32; 2]]) };
        let old_message_location = &data_as_tuples[row_index];

        if let Some(nulls) = nulls {
            // This column is nullable.
            let nulls = nulls.as_slice();
            if arrow_bit_util::get_bit(nulls, row_index) {
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
    pub fn agent_id_iter(
        record_batch: &RecordBatch,
    ) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        let column_name = AgentStateField::AgentId.name();
        let column = column_with_name(record_batch, column_name)?;
        // FixedSizeBinary has a single buffer (no offsets)
        let data = column.data_ref();
        let buffer = &data.buffers()[0];
        let mut bytes_ptr = buffer.as_ptr();
        // SAFETY: All ids have `UUID_V4_LEN` bytes, so we can iterate
        // over them by moving the pointer forward by that amount after
        // each agent.
        Ok((0..column.len()).map(move |_| unsafe {
            let id = &*(bytes_ptr as *const [u8; UUID_V4_LEN]);
            bytes_ptr = bytes_ptr.add(UUID_V4_LEN);
            id // one id per agent
        }))
    }

    pub fn agent_name_iter(
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
        column: Vec<Option<Cow<'_, str>>>,
    ) -> Result<ColumnChange> {
        // Guess that the concatenated names of all agents in this record batch have at least 512
        // characters. This initial capacity guess only affects performance, so the exact value
        // isn't too important.

        // TODO: OPTIM: Maybe we can still improve performance though by adjusting this value or
        //       making it depend on the number of agents.
        let mut builder = arrow::array::StringBuilder::new(512);

        column.into_iter().try_for_each(|v| {
            if let Some(value) = v {
                builder.append_value(value.as_ref())
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

    pub fn topology_mut_iter(
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
            pos_child_data_buffer,
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
            dir_child_data_buffer,
            "Direction column child data doesn't have expected number of coordinates per row"
        );

        Ok((
            (0..row_count).map(move |i| {
                let pos = if pos_column.is_valid(i) {
                    let start_index = i * POSITION_DIM;
                    // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
                    Some(unsafe {
                        &mut *(pos_child_data_buffer[start_index..start_index + POSITION_DIM]
                            .as_ptr() as *mut [f64; POSITION_DIM])
                    })
                } else {
                    None
                };

                let dir = if dir_column.is_valid(i) {
                    let start_index = i * POSITION_DIM;
                    // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
                    Some(unsafe {
                        &mut *(dir_child_data_buffer[start_index..start_index + POSITION_DIM]
                            .as_ptr() as *mut [f64; POSITION_DIM])
                    })
                } else {
                    None
                };

                (pos, dir)
            }),
            pwc_column,
        ))
    }

    pub fn position_iter(
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
            unsafe { pos_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };
        debug_assert_eq!(
            row_count * POSITION_DIM,
            child_data_buffer,
            "Position column child data doesn't have expected number of coordinates per row"
        );

        Ok((0..row_count).map(move |i| {
            if column.is_valid(i) {
                let start_index = i * POSITION_DIM;
                // SAFETY: We checked that this buffer has `POSITION_DIM` values per row above.
                Some(unsafe {
                    &*(child_data_buffer[start_index..start_index + POSITION_DIM].as_ptr()
                        as *const [f64; POSITION_DIM])
                })
            } else {
                None
            }
        }))
    }

    pub fn direction_iter(
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
                // SAFETY: Same as in `position_iter` function above
                Some(unsafe {
                    &*(child_data_buffer[start_index..start_index + POSITION_DIM].as_ptr()
                        as *const [f64; POSITION_DIM])
                })
            } else {
                None
            }
        }))
    }

    pub fn search_radius_iter(
        record_batch: &RecordBatch,
    ) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        // TODO[1] remove dependency on neighbors package
        let column_name = "search_radius";
        f64_iter(record_batch, column_name)
    }

    pub fn f64_iter<'a>(
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

    pub fn exists_iter<'a>(
        record_batch: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = bool> + 'a> {
        let row_count = record_batch.num_rows();
        let column = column_with_name(record_batch, column_name)?;

        Ok((0..row_count).map(move |i| column.is_valid(i)))
    }

    pub fn str_iter<'a>(
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

    pub fn bool_iter<'a>(
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
    pub fn json_deserialize_str_value_iter<'a>(
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
    pub fn json_values(
        record_batch: &RecordBatch,
        column_name: &str,
        data_type: &DataType,
    ) -> Result<Vec<serde_json::Value>> {
        let column = column_with_name(record_batch, column_name)?;
        col_to_json_vals(column, data_type)
    }
}

// TODO: add unit tests
