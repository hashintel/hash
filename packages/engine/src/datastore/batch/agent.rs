#![allow(
    clippy::too_many_lines,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]

use std::{borrow::Cow, sync::Arc};

use arrow::{
    array::{self, make_array, ArrayData, ArrayRef},
    datatypes::DataType,
    ipc::{
        reader::read_record_batch,
        writer::{IpcDataGenerator, IpcWriteOptions},
    },
};

use super::{
    boolean::Column as BooleanColumn, change::ArrayChange, flush::GrowableBatch, ArrowBatch,
    Batch as BatchRepr, DynamicBatch,
};
use crate::{
    datastore::{
        arrow::{
            batch_conversion::{col_to_json_vals, IntoRecordBatch},
            ipc::{record_batch_data_to_bytes_owned_unchecked, simulate_record_batch_to_bytes},
            meta_conversion::{get_dynamic_meta_flatbuffers, HashDynamicMeta, HashStaticMeta},
        },
        prelude::*,
        schema::{state::AgentSchema, FieldKey},
        POSITION_DIM, UUID_V4_LEN,
    },
    hash_types::state::AgentStateField,
    proto::ExperimentId,
    simulation::package::creator::PREVIOUS_INDEX_FIELD_KEY,
};

/// A Shared Batch containing a shared memory segment and the Arrow [`RecordBatch`] view into that
/// data.
#[allow(clippy::module_name_repetitions)]
pub struct AgentBatch {
    pub memory: Memory,
    /// Arrow `RecordBatch` with references to `self.memory`
    pub batch: RecordBatch,
    /// Metadata referring to positions, sizes, null counts
    /// and value counts of different Arrow buffers
    pub dynamic_meta: DynamicMeta,
    /// Map of which Arrow `Buffer`s and `FieldNode`s
    /// correspond to which column
    pub static_meta: Arc<StaticMeta>,
    /// When growable columns are modified, their Arrow intermediate
    /// column representations are kept here and wait for the
    /// `self.flush_changes()` call, which inserts them into
    /// `self.memory`
    pub changes: Vec<ArrayChange>,
    pub metaversion: Metaversion,
    /// Describes the worker the batch is distributed to if there are multiple workers
    pub worker_index: usize,
}

impl BatchRepr for AgentBatch {
    fn memory(&self) -> &Memory {
        &self.memory
    }

    fn memory_mut(&mut self) -> &mut Memory {
        &mut self.memory
    }

    fn metaversion(&self) -> &Metaversion {
        &self.metaversion
    }

    fn metaversion_mut(&mut self) -> &mut Metaversion {
        &mut self.metaversion
    }

    fn maybe_reload(&mut self, state: Metaversion) -> Result<()> {
        if self.metaversion.memory() != state.memory() {
            self.reload()?;
        } else if self.metaversion.batch() != state.batch() {
            self.reload_record_batch_and_dynamic_meta()?;
        }

        self.metaversion = state;
        Ok(())
    }

    /// Reload the memory (for when ftruncate has been called) and batch
    fn reload(&mut self) -> Result<()> {
        self.memory.reload()?;
        self.reload_record_batch_and_dynamic_meta()
    }
}

impl ArrowBatch for AgentBatch {
    fn record_batch(&self) -> &RecordBatch {
        &self.batch
    }

    fn record_batch_mut(&mut self) -> &mut RecordBatch {
        &mut self.batch
    }
}

impl DynamicBatch for AgentBatch {
    fn dynamic_meta(&self) -> &DynamicMeta {
        &self.dynamic_meta
    }

    fn dynamic_meta_mut(&mut self) -> &mut DynamicMeta {
        &mut self.dynamic_meta
    }

    /// Push an `ArrayChange` into pending list of changes
    /// NB: These changes are not written into memory if
    /// `self.flush_changes` is not called.
    fn push_change(&mut self, change: ArrayChange) -> Result<()> {
        self.changes.push(change);
        Ok(())
    }

    fn flush_changes(&mut self) -> Result<()> {
        let resized = GrowableBatch::flush_changes(self)?;

        // The current `self.batch` is invalid because offset have been changed.
        // need to reload, if we want to keep on using this shared batch instance
        self.reload_record_batch_and_dynamic_meta()?;
        // Update reload state (metaversion)
        if resized {
            self.metaversion.increment();
        } else {
            self.metaversion.increment_batch();
        }
        Ok(())
    }
}

/// Constructors for `Batch`
impl AgentBatch {
    /// Get a shared batch from the `AgentState` format.
    /// Need to specify which behaviors the shared batch
    /// should be run on.
    pub fn from_agent_states<K: IntoRecordBatch>(
        agents: K,
        schema: &Arc<AgentSchema>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let rb = agents.into_agent_batch(schema)?;
        Self::from_record_batch(&rb, schema, experiment_id)
    }

    pub fn set_dynamic_meta(&mut self, dynamic_meta: &DynamicMeta) -> Result<()> {
        self.dynamic_meta = dynamic_meta.clone();
        let meta_buffer = get_dynamic_meta_flatbuffers(dynamic_meta)?;
        self.memory.set_metadata(&meta_buffer)?;
        self.metaversion.increment_batch();
        Ok(())
    }

    pub fn duplicate_from(
        batch: &Self,
        schema: &AgentSchema,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let memory = Memory::duplicate_from(&batch.memory, experiment_id)?;
        Self::from_memory(memory, Some(schema), Some(batch.worker_index))
    }

    // Copy contents from RecordBatch and create a memory-backed Batch
    pub fn from_record_batch(
        record_batch: &RecordBatch,
        schema: &AgentSchema,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let ipc_data_generator = IpcDataGenerator::default();
        let schema_buffer =
            ipc_data_generator.schema_to_bytes(&schema.arrow, &IpcWriteOptions::default());

        let header_buffer = vec![]; // Nothing here

        let (ipc_message, data_len) = simulate_record_batch_to_bytes(record_batch);

        let mut memory = Memory::from_sizes(
            experiment_id,
            schema_buffer.ipc_message.len(),
            header_buffer.len(),
            ipc_message.len(),
            data_len,
            true,
        )?;

        memory.set_schema(&schema_buffer.ipc_message)?;
        memory.set_header(&header_buffer)?;
        memory.set_metadata(&ipc_message)?;

        let data_buffer = memory.get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(record_batch, data_buffer);

        Self::from_memory(memory, Some(schema), None)
    }

    pub fn from_memory(
        memory: Memory,
        schema: Option<&AgentSchema>,
        worker_index: Option<usize>,
    ) -> Result<Self> {
        let (schema_buffer, _header_buffer, meta_buffer, data_buffer) =
            memory.get_batch_buffers()?;
        let (schema, static_meta) = if let Some(s) = schema {
            (s.arrow.clone(), s.static_meta.clone())
        } else {
            let message = arrow_ipc::root_as_message(schema_buffer)?;
            let ipc_schema = match message.header_as_schema() {
                Some(s) => s,
                None => return Err(Error::ArrowSchemaRead),
            };
            let schema = Arc::new(arrow_ipc::convert::fb_to_schema(ipc_schema));
            let static_meta = Arc::new(schema.get_static_metadata());
            (schema, static_meta)
        };

        let batch_message = arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or_else(|| Error::ArrowBatch("Couldn't read message".into()))?;

        let dynamic_meta = batch_message.into_meta(data_buffer.len())?;

        let batch = read_record_batch(data_buffer, batch_message, schema, &[])?;

        Ok(Self {
            memory,
            batch,
            dynamic_meta,
            static_meta,
            changes: vec![],
            metaversion: Metaversion::default(),
            worker_index: worker_index.unwrap_or(0),
        })
    }

    pub fn get_prepared_memory_for_data(
        schema: &Arc<AgentSchema>,
        dynamic_meta: &DynamicMeta,
        experiment_id: &ExperimentId,
    ) -> Result<Memory> {
        let ipc_data_generator = IpcDataGenerator::default();
        let schema_buffer =
            ipc_data_generator.schema_to_bytes(&schema.arrow, &IpcWriteOptions::default());
        let header_buffer = vec![];
        let meta_buffer = get_dynamic_meta_flatbuffers(dynamic_meta)?;

        let mut memory = Memory::from_sizes(
            experiment_id,
            schema_buffer.ipc_message.len(),
            header_buffer.len(),
            meta_buffer.len(),
            dynamic_meta.data_length,
            true,
        )?;

        if memory.set_header(&header_buffer)?.resized()
            || memory.set_metadata(&meta_buffer)?.resized()
        {
            return Err(Error::UnexpectedAgentBatchMemoryResize);
        }

        Ok(memory)
    }

    pub fn num_agents(&self) -> usize {
        self.batch.num_rows()
    }

    pub fn get_buffer(&self, buffer_index: usize) -> Result<&[u8]> {
        let data_buffer = self.memory.get_data_buffer()?;
        let meta_data = &self.dynamic_meta.buffers[buffer_index];
        Ok(&data_buffer[meta_data.offset..meta_data.offset + meta_data.length])
    }
}

impl GrowableBatch<ArrayChange, ArrayData> for AgentBatch {
    fn take_changes(&mut self) -> Vec<ArrayChange> {
        std::mem::take(&mut self.changes)
    }

    fn static_meta(&self) -> &StaticMeta {
        &self.static_meta
    }

    fn dynamic_meta(&self) -> &DynamicMeta {
        &self.dynamic_meta
    }

    fn mut_dynamic_meta(&mut self) -> &mut DynamicMeta {
        &mut self.dynamic_meta
    }

    fn memory(&self) -> &Memory {
        &self.memory
    }

    fn mut_memory(&mut self) -> &mut Memory {
        &mut self.memory
    }
}

impl AgentBatch {
    /// This agent index column contains the indices of the agents *before* agent migration
    /// was performed. This is important so an agent can access its neighbor's outbox
    // TODO: UNUSED: Needs triage
    pub fn write_agent_indices(&mut self, batch_index: usize) -> Result<()> {
        let batch_index = batch_index as u32;

        let column_name = PREVIOUS_INDEX_FIELD_KEY;
        let column = self.get_arrow_column(column_name)?;

        let data = column.data_ref();

        // Unsafe: Cannot fail
        let data_buffer = unsafe { data.child_data()[0].buffers()[0].typed_data::<u32>() };
        let num_agents = self.num_agents() as u32;

        let mut ptr = data_buffer.as_ptr() as *mut u32;

        // Unsafe: Cannot fail if `debug_assert_eq` does not fail
        debug_assert_eq!(data_buffer.len(), num_agents as usize * 2);
        (0..num_agents).for_each(|i| unsafe {
            *ptr = batch_index;
            ptr = ptr.add(1);
            *ptr = i;
            ptr = ptr.add(1);
        });

        Ok(())
    }
}

impl AgentBatch {
    // TODO: UNUSED: Needs triage
    pub fn from_shmem_os_id(os_id: &str) -> Result<Box<Self>> {
        let memory = Memory::shmem_os_id(os_id, true, true)?;
        Ok(Box::new(Self::from_memory(memory, None, None)?))
    }

    pub fn set_worker_index(&mut self, worker_index: usize) {
        self.worker_index = worker_index;
    }

    pub(in crate::datastore) fn get_arrow_column(
        &self,
        name: &str,
    ) -> Result<&Arc<dyn ArrowArray>> {
        let (id, _) = self
            .batch
            .schema()
            .column_with_name(name)
            .ok_or_else(|| Error::ColumnNotFound(name.into()))?;

        Ok(self.batch.column(id))
    }
}

// Special-case columns getter and setters
impl AgentBatch {
    // TODO: UNUSED: Needs triage
    pub fn get_arrow_column_ref(&self, key: &FieldKey) -> Result<&ArrayRef> {
        self.get_arrow_column(key.value())
    }

    // TODO: Use in Rust runner, and look up column without using PREVIOUS_INDEX_COLUMN_INDEX
    #[allow(unused, unreachable_code)]
    pub fn get_old_message_index(&self, row_index: usize) -> Result<Option<&[u32; 2]>> {
        let col = self.batch.column(todo!());
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
    pub fn agent_id_iter(&self) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        let column_name = AgentStateField::AgentId.name();
        let column = self.get_arrow_column(column_name)?;
        // FixedSizeBinary has a single buffer (no offsets)
        let data = column.data_ref();
        let buffer = &data.buffers()[0];
        let mut ptr = buffer.as_ptr();
        let offset = UUID_V4_LEN;
        Ok((0..column.len()).map(move |_| unsafe {
            let slice = &*(ptr as *const [u8; UUID_V4_LEN]);
            ptr = ptr.add(offset);
            slice
        }))
    }

    pub fn agent_name_iter(&self) -> Result<impl Iterator<Item = Option<&str>>> {
        let column_name = AgentStateField::AgentName.name();
        self.str_iter(column_name)
    }

    // TODO: UNUSED: Needs triage
    pub fn get_agent_name(&self) -> Result<Vec<Option<Cow<'_, str>>>> {
        let column_name = AgentStateField::AgentName.name();
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::StringArray>()
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

    // TODO: UNUSED: Needs triage
    #[allow(clippy::option_if_let_else)]
    pub fn agent_name_as_array(&self, column: Vec<Option<Cow<'_, str>>>) -> Result<ArrayChange> {
        let column_name = AgentStateField::AgentName.name();
        let mut builder = array::StringBuilder::new(512);
        column.into_iter().try_for_each(|v| {
            if let Some(value) = v {
                builder.append_value(value.as_ref())
            } else {
                builder.append_null()
            }
        })?;
        let (index, _) = self
            .batch
            .schema()
            .column_with_name(column_name)
            .ok_or_else(|| Error::ColumnNotFound(column_name.into()))?;

        Ok(ArrayChange {
            array: make_array(builder.finish().data().clone()).data().clone(),
            index,
        })
    }

    pub fn topology_mut_iter(
        &mut self,
    ) -> Result<(
        impl Iterator<
            Item = (
                Option<&mut [f64; POSITION_DIM]>,
                Option<&mut [f64; POSITION_DIM]>,
            ),
        >,
        BooleanColumn,
    )> {
        let row_count = self.batch.num_rows();
        // TODO[1] remove the dependency on this
        let pwc_column = self.get_arrow_column("position_was_corrected")?;
        let pwc_column = BooleanColumn::new_non_nullable(pwc_column);

        let pos_column_name = AgentStateField::Position.name();
        let pos_column = self.get_arrow_column(pos_column_name)?;

        let pos_column = pos_column
            .as_any()
            .downcast_ref::<array::FixedSizeListArray>()
            .ok_or_else(|| Error::InvalidArrowDowncast {
                name: pos_column_name.into(),
            })?;

        // column.data_ref()                                                  -> [[f64; 3]]
        // column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() -> [f64]
        let pos_child_data_buffer =
            unsafe { pos_column.data_ref().child_data()[0].buffers()[0].typed_data::<f64>() };

        let dir_column_name = AgentStateField::Direction.name();
        let dir_column = self.get_arrow_column(dir_column_name)?;

        let dir_column = dir_column
            .as_any()
            .downcast_ref::<array::FixedSizeListArray>()
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

    pub fn position_iter(&self) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let column_name = AgentStateField::Position.name();
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::FixedSizeListArray>()
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

    // TODO: UNUSED: Needs triage
    pub fn direction_iter(&self) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let column_name = AgentStateField::Direction.name();
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::FixedSizeListArray>()
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

    pub fn search_radius_iter(&self) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        // TODO[1] remove dependency on neighbors package
        let column_name = "search_radius";
        self.f64_iter(column_name)
    }

    pub fn f64_iter<'a>(
        &'a self,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::Float64Array>()
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

    pub fn exists_iter<'a>(&'a self, column_name: &str) -> Result<impl Iterator<Item = bool> + 'a> {
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        Ok((0..row_count).map(move |i| column.is_valid(i)))
    }

    pub fn str_iter<'a>(
        &'a self,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<&'a str>>> {
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::StringArray>()
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
        &'a self,
        column_name: &str,
    ) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
        let row_count = self.batch.num_rows();
        let column = self.get_arrow_column(column_name)?;

        let column = column
            .as_any()
            .downcast_ref::<array::BooleanArray>()
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
        &'a self,
        column_name: &str,
    ) -> Result<impl Iterator<Item = serde_json::Value> + 'a> {
        let iterator = self.str_iter(column_name)?.map(|a| {
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
        &self,
        column_name: &str,
        data_type: &DataType,
    ) -> Result<Vec<serde_json::Value>> {
        let column = self.get_arrow_column(column_name)?;
        col_to_json_vals(column, data_type)
    }

    pub fn behavior_list_bytes_iter(&self) -> Result<impl Iterator<Item = Vec<&[u8]>>> {
        behavior_list_bytes_iter(&self.batch)
    }
}

pub trait AgentList {
    fn record_batch(&self) -> &RecordBatch;
}

impl AgentList for RecordBatch {
    fn record_batch(&self) -> &RecordBatch {
        self
    }
}

impl AgentList for AgentBatch {
    fn record_batch(&self) -> &RecordBatch {
        &self.batch
    }
}

impl AsRef<AgentBatch> for AgentBatch {
    fn as_ref(&self) -> &Self {
        self
    }
}

pub fn behavior_list_bytes_iter<K: AgentList>(
    agent_list: &K,
) -> Result<impl Iterator<Item = Vec<&[u8]>>> {
    let record_batch = agent_list.record_batch();
    // TODO[1] remove dependency on behavior_execution
    let column_name = "behaviors";
    let row_count = record_batch.num_rows();
    let (column_id, _) = record_batch
        .schema()
        .column_with_name(column_name)
        .ok_or_else(|| Error::ColumnNotFound(column_name.into()))?;
    let column = record_batch.column(column_id);
    let col_data = column.data_ref();

    let list_indices = unsafe { col_data.buffers()[0].typed_data::<i32>() };
    let string_indices = unsafe { col_data.child_data()[0].buffers()[0].typed_data::<i32>() };
    let utf_8 = col_data.child_data()[0].buffers()[1].as_slice();

    Ok((0..row_count).map(move |i| {
        let list_from = list_indices[i] as usize;
        let list_to = list_indices[i + 1] as usize;
        let indices = &string_indices[list_from..=list_to];
        let mut next_index = indices[0] as usize;
        (0..list_to - list_from)
            .map(|j| {
                let new_index = indices[j + 1] as usize;
                let slice = &utf_8[next_index..new_index];
                next_index = new_index;
                slice
            })
            .collect()
    }))
}

#[cfg(test)]
mod tests {
    extern crate test;

    use test::Bencher;
    use uuid::Uuid;

    use super::*;
    use crate::datastore::test_utils::gen_schema_and_test_agents;

    #[bench]
    fn agent_batch_from_states(b: &mut Bencher) {
        let num_agents = 100;
        let (schema, agents) = gen_schema_and_test_agents(num_agents, 0).unwrap();
        let experiment_id = Uuid::new_v4();
        b.iter(|| {
            let _agent_batch =
                AgentBatch::from_agent_states(agents.as_slice(), &schema, &experiment_id).unwrap();
        });
    }
}
