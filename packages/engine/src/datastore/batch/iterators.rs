use arrow::{array::ArrayRef, record_batch::RecordBatch};

use crate::datastore::{Error, Result};

pub mod agent {
    use std::ops::Deref;

    use arrow::datatypes::DataType;

    use crate::datastore::{prelude::*, POSITION_DIM, UUID_V4_LEN};

    pub fn agent_id_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::agent_id_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_id_iter_ref<'b: 'a, 'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [&'b B],
    ) -> Result<impl Iterator<Item = &'b [u8; UUID_V4_LEN]> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::agent_id_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn agent_name_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<&str>>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::agent_name_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_name_iter_ref<'b: 'a, 'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [&'b B],
    ) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::agent_name_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_value_iter_cols<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
        data_type: &DataType,
    ) -> Result<Box<dyn Iterator<Item = serde_json::Value> + Send + Sync + 'a>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable =
                super::rb::json_values(agent_batch.record_batch()?, field_name, data_type)?;
            iterables.push(iterable.into_iter());
        }
        Ok(Box::new(iterables.into_iter().flatten()))
    }

    /// Get the index of an agent in Context Batch
    pub fn index_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> impl Iterator<Item = AgentIndex> + '_ {
        agent_pool.iter().enumerate().flat_map(|(i, g)| {
            let num_agents = g.num_agents() as u32;
            let group_index = i as u32;
            (0..num_agents).map(move |j| (group_index, j))
        })
    }

    pub fn position_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::position_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }

        Ok(iterables.into_iter().flatten())
    }

    pub fn search_radius_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::search_radius_iter(agent_batch.record_batch()?)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn f64_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::f64_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn exists_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = bool> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::exists_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn str_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<&'a str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::str_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn bool_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = super::rb::bool_iter(agent_batch.record_batch()?, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_serialized_value_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = serde_json::Value> + Send + Sync + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let rb = agent_batch.record_batch()?;
            let iterable = super::rb::json_deserialize_str_value_iter(rb, field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }
}

pub fn column_with_name<'a>(rb: &'a RecordBatch, name: &str) -> Result<&'a ArrayRef> {
    let (index, _) = rb
        .schema()
        .column_with_name(name)
        .ok_or_else(|| Error::ColumnNotFound(name.into()))?;

    Ok(rb.column(index))
}

// Special-case columns getters and setters
pub mod rb {
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
    pub fn get_old_message_index(rb: &RecordBatch, row_index: usize) -> Result<Option<&[u32; 2]>> {
        let col = rb.column(todo!());
        let data_ref = col.data_ref();
        let nulls = data_ref.null_buffer();

        let child_data_buffer =
            unsafe { data_ref.child_data()[0].buffers()[0].typed_data::<u32>() };

        const IND_N: usize = 2;
        let start_index = row_index * IND_N;
        // SAFETY: safe because we keep the same `IND_N` constant
        let res = unsafe {
            &*(&child_data_buffer[start_index..start_index + IND_N][0] as *const u32
                as *const [u32; IND_N])
        };
        if let Some(nulls) = nulls {
            let nulls = nulls.as_slice();
            if arrow_bit_util::get_bit(nulls, row_index) {
                Ok(Some(res))
            } else {
                Ok(None)
            }
        } else {
            Ok(Some(res))
        }
    }

    // TODO: no set_id, but ID must have null bytes if too short
    pub fn agent_id_iter(rb: &RecordBatch) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        let column_name = AgentStateField::AgentId.name();
        let column = column_with_name(rb, column_name)?;
        // FixedSizeBinary has a single buffer (no offsets)
        let data = column.data_ref();
        let buffer = &data.buffers()[0];
        let mut ptr = buffer.as_ptr();
        Ok((0..column.len()).map(move |_| unsafe {
            let slice = &*(ptr as *const [u8; UUID_V4_LEN]);
            ptr = ptr.add(UUID_V4_LEN);
            slice
        }))
    }

    pub fn agent_name_iter(rb: &RecordBatch) -> Result<impl Iterator<Item = Option<&str>>> {
        let column_name = AgentStateField::AgentName.name();
        str_iter(rb, column_name)
    }

    pub fn get_agent_name(rb: &RecordBatch) -> Result<Vec<Option<Cow<'_, str>>>> {
        let column_name = AgentStateField::AgentName.name();
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

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
        rb: &RecordBatch,
        column: Vec<Option<Cow<'_, str>>>,
    ) -> Result<ColumnChange> {
        let column_name = AgentStateField::AgentName.name();
        let mut builder = arrow::array::StringBuilder::new(512);
        column.into_iter().try_for_each(|v| {
            if let Some(value) = v {
                builder.append_value(value.as_ref())
            } else {
                builder.append_null()
            }
        })?;
        let (index, _) = rb
            .schema()
            .column_with_name(column_name)
            .ok_or_else(|| Error::ColumnNotFound(column_name.into()))?;

        Ok(ColumnChange {
            data: builder.finish(),
            index,
        })
    }

    pub fn topology_mut_iter(
        rb: &mut RecordBatch,
    ) -> Result<(
        impl Iterator<
            Item = (
                Option<&mut [f64; POSITION_DIM]>,
                Option<&mut [f64; POSITION_DIM]>,
            ),
        >,
        BooleanColumn,
    )> {
        let row_count = rb.num_rows();
        // TODO: Remove the dependency on the `position_was_corrected` field
        let pwc_column = column_with_name(rb, "position_was_corrected")?;
        let pwc_column = BooleanColumn::new_non_nullable(pwc_column);

        let pos_column_name = AgentStateField::Position.name();
        let pos_column = column_with_name(rb, pos_column_name)?;

        let pos_column = pos_column
            .as_any()
            .downcast_ref::<arrow::array::FixedSizeListArray>()
            .ok_or_else(|| Error::InvalidArrowDowncast {
                name: pos_column_name.into(),
            })?;

        // column.data_ref()                                                  -> [[f64; 3]]
        // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
        let pos_child_data_buffer =
            unsafe { pos_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

        let dir_column_name = AgentStateField::Direction.name();
        let dir_column = column_with_name(rb, dir_column_name)?;

        let dir_column = dir_column
            .as_any()
            .downcast_ref::<arrow::array::FixedSizeListArray>()
            .ok_or_else(|| Error::InvalidArrowDowncast {
                name: dir_column_name.into(),
            })?;

        // column.data_ref()                                                  -> [[f64; 3]]
        // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
        let dir_child_data_buffer =
            unsafe { dir_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

        Ok((
            (0..row_count).map(move |i| {
                let pos = if pos_column.is_valid(i) {
                    let start_index = i * POSITION_DIM;
                    // Does not fail
                    Some(unsafe {
                        &mut *(pos_child_data_buffer[start_index..start_index + POSITION_DIM]
                            .as_ptr() as *mut [f64; POSITION_DIM])
                    })
                } else {
                    None
                };

                let dir = if dir_column.is_valid(i) {
                    let start_index = i * POSITION_DIM;
                    // Does not fail
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
        rb: &RecordBatch,
    ) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let column_name = AgentStateField::Position.name();
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<arrow::array::FixedSizeListArray>()
            .ok_or_else(|| Error::InvalidArrowDowncast {
                name: column_name.into(),
            })?;

        // column.data_ref()                                                  -> [[f64; 3]]
        // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
        let child_data_buffer =
            unsafe { column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

        Ok((0..row_count).map(move |i| {
            if column.is_valid(i) {
                let start_index = i * POSITION_DIM;
                // Does not fail
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
        rb: &RecordBatch,
    ) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let column_name = AgentStateField::Direction.name();
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<arrow::array::FixedSizeListArray>()
            .ok_or_else(|| Error::InvalidArrowDowncast {
                name: column_name.into(),
            })?;

        // column.data_ref()                                                  -> [[f64; 3]]
        // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
        let child_data_buffer =
            unsafe { column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

        Ok((0..row_count).map(move |i| {
            if column.is_valid(i) {
                let start_index = i * POSITION_DIM;
                // Does not fail
                Some(unsafe {
                    &*(child_data_buffer[start_index..start_index + POSITION_DIM].as_ptr()
                        as *const [f64; POSITION_DIM])
                })
            } else {
                None
            }
        }))
    }

    pub fn search_radius_iter(rb: &RecordBatch) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        // TODO[1] remove dependency on neighbors package
        let column_name = "search_radius";
        f64_iter(rb, column_name)
    }

    pub fn f64_iter<'a>(
        rb: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

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
        rb: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = bool> + 'a> {
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

        Ok((0..row_count).map(move |i| column.is_valid(i)))
    }

    pub fn str_iter<'a>(
        rb: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<&'a str>>> {
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

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
        rb: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
        let row_count = rb.num_rows();
        let column = column_with_name(rb, column_name)?;

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
        rb: &'a RecordBatch,
        column_name: &str,
    ) -> Result<impl Iterator<Item = serde_json::Value> + 'a> {
        let iterator = str_iter(rb, column_name)?.map(|a| {
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
        rb: &RecordBatch,
        column_name: &str,
        data_type: &DataType,
    ) -> Result<Vec<serde_json::Value>> {
        let column = column_with_name(rb, column_name)?;
        col_to_json_vals(column, data_type)
    }
}

// TODO: add unit tests
