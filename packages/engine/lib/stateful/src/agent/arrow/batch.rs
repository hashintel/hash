#![allow(clippy::cast_possible_wrap, clippy::cast_sign_loss)]

use std::{borrow::Cow, sync::Arc};

use arrow2::io::ipc::{
    read::deserialize_schema,
    write::{default_ipc_fields, schema_to_bytes},
};
use arrow_format::ipc::{planus::ReadAsRoot, MessageHeaderRef};
use memory::{
    arrow::{
        flush::GrowableBatch,
        ipc::{self, write_record_batch_to_segment},
        meta::{self, DynamicMetadata, StaticMetadata},
        record_batch::RecordBatch,
        ArrowBatch, ColumnChange,
    },
    shared_memory::{BufferChange, MemoryId, Metaversion, Segment},
};

use super::boolean::BooleanColumn;
use crate::{
    agent::{
        arrow::{array::IntoRecordBatch, record_batch},
        AgentSchema,
    },
    error::{Error, Result},
    field::{POSITION_DIM, UUID_V4_LEN},
};

/// A collection of agent fields.
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
        let segment = write_record_batch_to_segment(record_batch, &schema.arrow, memory_id)?;

        Self::from_segment(segment, Some(schema), None)
    }

    /// Loads an [`ArrowBatch`] from the provided shared memory segment. This
    /// will load the [`StaticMetadata`], [`DynamicMetadata`], and the
    /// underlying [`RecordBatch`].
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
            let schema_buffer = buffers.schema();
            let (schema, _) = deserialize_schema(schema_buffer)?;
            let schema = Arc::new(schema);

            let static_meta = Arc::new(StaticMetadata::from_schema(schema.clone()));
            (schema, static_meta)
        };

        let message = arrow_format::ipc::MessageRef::read_as_root(buffers.meta())?;
        let batch_message = match message.header() {
            Ok(Some(MessageHeaderRef::RecordBatch(r))) => r,
            _ => {
                return Err(Error::ArrowBatch(format!(
                    "Couldn't read message: {:#?}",
                    &message
                )));
            }
        };

        let dynamic_meta =
            DynamicMetadata::from_record_batch(&batch_message, buffers.data().len())?;

        let record_batch = ipc::read_record_batch(&segment, schema)?;

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
        dynamic_meta: &meta::DynamicMetadata,
        memory_id: MemoryId,
    ) -> Result<Segment> {
        let schema_buffer =
            schema_to_bytes(&schema.arrow, &default_ipc_fields(&schema.arrow.fields));
        let header_buffer = Metaversion::default().to_le_bytes();
        let meta_buffer = dynamic_meta.get_flatbuffers()?;

        let mut memory = Segment::from_sizes(
            memory_id,
            schema_buffer.len(),
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
        dynamic_meta: &meta::DynamicMetadata,
    ) -> Result<BufferChange> {
        *self.batch.dynamic_meta_mut() = dynamic_meta.clone();
        let meta_buffer = dynamic_meta.get_flatbuffers()?;
        Ok(self.batch.segment_mut().set_metadata(&meta_buffer)?)
    }

    pub fn get_buffer(&self, buffer_index: usize) -> Result<&[u8]> {
        let data_buffer = self.batch.segment().get_data_buffer()?;
        let metadata = &self.batch.dynamic_meta().buffers[buffer_index];
        Ok(&data_buffer[metadata.offset..metadata.offset + metadata.length])
    }

    pub fn from_shmem_os_id(os_id: &str) -> Result<Box<Self>> {
        let segment = Segment::open(os_id, true, true)?;
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
