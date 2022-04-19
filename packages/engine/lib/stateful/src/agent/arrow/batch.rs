#![allow(clippy::cast_possible_wrap, clippy::cast_sign_loss)]

use std::{borrow::Cow, sync::Arc};

use arrow::{
    array::Array,
    ipc::{
        self,
        reader::read_record_batch,
        writer::{IpcDataGenerator, IpcWriteOptions},
    },
    record_batch::RecordBatch,
};
use memory::{
    arrow::{
        flush::GrowableBatch,
        ipc::{record_batch_data_to_bytes_owned_unchecked, simulate_record_batch_to_bytes},
        meta::{
            self,
            conversion::{get_dynamic_meta_flatbuffers, HashDynamicMeta, HashStaticMeta},
        },
        ArrowBatch, ColumnChange,
    },
    shared_memory::{BufferChange, MemoryId, Metaversion, Segment},
};

use crate::{
    agent::{
        arrow::{
            array::IntoRecordBatch, boolean::BooleanColumn, record_batch, PREVIOUS_INDEX_FIELD_KEY,
        },
        AgentSchema,
    },
    error::{Error, Result},
    field::{POSITION_DIM, UUID_V4_LEN},
};

/// A list of [`Agent`] fields.
///
/// Internally, this is backed by an [`ArrowBatch`], which is organizing the agent fields as a
/// struct of arrays.
pub struct AgentBatch {
    /// The underlying batch containing the stored agent fields.
    pub batch: ArrowBatch,
    /// Describes the worker the batch is distributed to if there are multiple workers
    pub worker_index: usize,
}

/// Constructors for `Batch`
impl AgentBatch {
    /// Get a shared batch from the `AgentState` format.
    /// Need to specify which behaviors the shared batch
    /// should be run on.
    pub fn from_agent_states<K: IntoRecordBatch>(
        agents: K,
        schema: &AgentSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        let record_batch = agents.to_agent_batch(schema)?;
        Self::from_record_batch(&record_batch, schema, memory_id)
    }

    pub fn duplicate_from(
        agent_batch: &Self,
        schema: &AgentSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        if agent_batch.batch.loaded_metaversion().memory()
            != agent_batch
                .batch
                .segment()
                .read_persisted_metaversion()
                .memory()
        {
            return Err(Error::from(format!(
                "Can't duplicate agent batch with loaded memory older than latest persisted: \
                 {:?}, {:?}",
                agent_batch.batch.loaded_metaversion(),
                agent_batch.batch.segment().read_persisted_metaversion(),
            )));
        }

        let segment = Segment::duplicate(agent_batch.batch.segment(), memory_id)?;
        Self::from_segment(segment, Some(schema), Some(agent_batch.worker_index))
    }

    /// Copy contents from RecordBatch and create a memory-backed Batch
    pub(crate) fn from_record_batch(
        record_batch: &RecordBatch,
        schema: &AgentSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        let ipc_data_generator = IpcDataGenerator::default();
        let schema_buffer =
            ipc_data_generator.schema_to_bytes(&schema.arrow, &IpcWriteOptions::default());
        let header_buffer = Metaversion::default().to_le_bytes();
        let (ipc_message, data_len) = simulate_record_batch_to_bytes(record_batch);

        let mut segment = Segment::from_sizes(
            memory_id,
            schema_buffer.ipc_message.len(),
            header_buffer.len(),
            ipc_message.len(),
            data_len,
            true,
        )?;

        // Memory needs to be loaded after creating regardless of metaverion, so we can ignore, if
        // the memory changed.
        let _ = segment.set_schema(&schema_buffer.ipc_message)?;
        let _ = segment.set_header(&header_buffer)?;
        let _ = segment.set_metadata(&ipc_message)?;

        let data_buffer = segment.get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(record_batch, data_buffer);

        Self::from_segment(segment, Some(schema), None)
    }

    pub fn from_segment(
        segment: Segment,
        schema: Option<&AgentSchema>,
        worker_index: Option<usize>,
    ) -> Result<Self> {
        let persisted = segment.try_read_persisted_metaversion()?;
        let buffers = segment.get_batch_buffers()?;
        let (schema, static_meta) = if let Some(s) = schema {
            (s.arrow.clone(), s.static_meta.clone())
        } else {
            let message = ipc::root_as_message(buffers.schema())?;
            let ipc_schema = match message.header_as_schema() {
                Some(s) => s,
                None => return Err(Error::ArrowSchemaRead),
            };
            let schema = Arc::new(ipc::convert::fb_to_schema(ipc_schema));
            let static_meta = Arc::new(schema.get_static_metadata());
            (schema, static_meta)
        };

        let batch_message = ipc::root_as_message(buffers.meta())?
            .header_as_record_batch()
            .ok_or_else(|| Error::ArrowBatch("Couldn't read message".into()))?;

        let dynamic_meta = batch_message.into_meta(buffers.data().len())?;

        let record_batch = read_record_batch(buffers.data(), batch_message, schema, &[])?;

        Ok(Self {
            batch: ArrowBatch::new(
                segment,
                record_batch,
                dynamic_meta,
                static_meta,
                vec![],
                persisted,
            ),
            worker_index: worker_index.unwrap_or(0),
        })
    }

    pub fn get_prepared_memory_for_data(
        schema: &Arc<AgentSchema>,
        dynamic_meta: &meta::Dynamic,
        memory_id: MemoryId,
    ) -> Result<Segment> {
        let ipc_data_generator = IpcDataGenerator::default();
        let schema_buffer =
            ipc_data_generator.schema_to_bytes(&schema.arrow, &IpcWriteOptions::default());
        let header_buffer = Metaversion::default().to_le_bytes();
        let meta_buffer = get_dynamic_meta_flatbuffers(dynamic_meta)?;

        let mut memory = Segment::from_sizes(
            memory_id,
            schema_buffer.ipc_message.len(),
            header_buffer.len(),
            meta_buffer.len(),
            dynamic_meta.data_length,
            true,
        )?;

        if memory.set_header(&header_buffer)?.resized()
            || memory.set_metadata(&meta_buffer)?.resized()
        {
            // We set the sizes above to be exactly those of the header and metadata, so resizing
            // shouldn't be necessary.
            Err(Error::UnexpectedAgentBatchMemoryResize)
        } else {
            Ok(memory)
        }
    }

    pub fn num_agents(&self) -> usize {
        // TODO: Require `self.is_persisted()` (loaded metaversion equal to persisted one)? Just
        // warn if older? (Number of agents might have changed between loads, though there might be
        // a use case for checking the old number of agents before loading (`n_agents_unchecked`?).)
        self.batch.record_batch_unchecked().num_rows()
    }

    /// Set dynamic metadata and write it to memory (without checking or updating metaversions).
    pub fn flush_dynamic_meta_unchecked(
        &mut self,
        dynamic_meta: &meta::Dynamic,
    ) -> Result<BufferChange> {
        *self.batch.dynamic_meta_mut() = dynamic_meta.clone();
        let meta_buffer = get_dynamic_meta_flatbuffers(dynamic_meta)?;
        Ok(self.batch.segment_mut().set_metadata(&meta_buffer)?)
    }

    pub fn get_buffer(&self, buffer_index: usize) -> Result<&[u8]> {
        let data_buffer = self.batch.segment().get_data_buffer()?;
        let metadata = &self.batch.dynamic_meta().buffers[buffer_index];
        Ok(&data_buffer[metadata.offset..metadata.offset + metadata.length])
    }

    /// This agent index column contains the indices of the agents *before* agent migration
    /// was performed. This is important so an agent can access its neighbor's outbox.
    // TODO: UNUSED: Needs triage -Should it be removed or used in the Rust runner or elsewhere?
    // TODO: This doesn't check metaversions, so either it should be changed to check metaversions
    //       or not used outside the datastore.
    fn _write_agent_indices(&mut self, batch_index: usize) -> Result<()> {
        let batch_index = batch_index as u32;

        let column_name = PREVIOUS_INDEX_FIELD_KEY;
        let record_batch = self.batch.record_batch_unchecked();
        let (i_column, _) = record_batch
            .schema()
            .column_with_name(column_name)
            .ok_or_else(|| Error::ColumnNotFound(column_name.into()))?;
        let data = record_batch.column(i_column).data_ref();

        // SAFETY: A column with this datatype has this buffer.
        let data_buffer = unsafe { data.child_data()[0].buffers()[0].typed_data::<u32>() };
        let num_agents = self.num_agents() as u32;

        let mut ptr = data_buffer.as_ptr() as *mut u32;

        // SAFETY: The pointer can't go out of bounds if `debug_assert_eq` does not fail.
        debug_assert_eq!(data_buffer.len(), num_agents as usize * 2);
        (0..num_agents).for_each(|i| unsafe {
            *ptr = batch_index;
            ptr = ptr.add(1);
            *ptr = i;
            ptr = ptr.add(1);
        });

        Ok(())
    }

    pub fn from_shmem_os_id(os_id: &str) -> Result<Box<Self>> {
        let segment = Segment::from_shmem_os_id(os_id, true, true)?;
        Ok(Box::new(AgentBatch::from_segment(segment, None, None)?))
    }

    pub fn set_worker_index(&mut self, worker_index: usize) {
        self.worker_index = worker_index;
    }

    pub fn id_iter(&self) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        record_batch::agent_id_iter(self.batch.record_batch()?)
    }

    pub fn names(&self) -> Result<Vec<Option<Cow<'_, str>>>> {
        record_batch::get_agent_name(self.batch.record_batch()?)
    }

    pub fn name_changes<S: AsRef<str>>(&self, column: &[Option<S>]) -> Result<ColumnChange> {
        record_batch::agent_name_as_array(self.batch.record_batch()?, column)
    }

    pub fn search_radius_iter(&self) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        record_batch::search_radius_iter(self.batch.record_batch()?)
    }

    pub fn topology_iter_mut(
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
        record_batch::topology_mut_iter(self.batch.record_batch_mut()?)
    }
}
