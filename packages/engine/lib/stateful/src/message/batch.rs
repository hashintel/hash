#![allow(clippy::cast_ptr_alignment, clippy::cast_sign_loss)]

use std::sync::Arc;

use arrow::{
    datatypes::Schema,
    ipc::{
        self,
        reader::read_record_batch,
        writer::{DictionaryTracker, IpcDataGenerator, IpcWriteOptions},
    },
    record_batch::RecordBatch,
};
use memory::{
    arrow::{
        column_with_name,
        ipc::{record_batch_data_to_bytes_owned_unchecked, simulate_record_batch_to_bytes},
        meta::conversion::HashDynamicMeta,
        ArrowBatch,
    },
    shared_memory::{MemoryId, Metaversion, Segment},
};

use crate::{
    agent::{arrow::array::IntoRecordBatch, AgentBatch, AgentStateField},
    message::{arrow::array::MessageArray, MessageSchema},
    Error, Result,
};

// 1000 bytes per agent i.e. 10 MB for 10000 agents
/// Soft upper bound for how many bytes per agent in the shared memory.
/// This is NOT the maximum number of bytes per agent, rather, it is
/// the size per agent which shared memory is downscaled to
/// IF there is enough space to do so.
const UPPER_MULTIPLIER: usize = 1000;
/// Size of shared memory above which the soft upper bound is checked
const LOWER_BOUND: usize = 10000;

/// A collection of [`Message`]s.
///
/// Internally, this is backed by an [`ArrowBatch`], which lays the messages out in memory as a
/// struct of arrays.
///
/// [`Message`]: crate::message::Message
pub struct MessageBatch {
    /// The underlying batch containing the stored messages.
    pub batch: ArrowBatch,
    /// Arrow schema with message batch fields.
    arrow_schema: Arc<Schema>,
}

impl MessageBatch {
    /// Clears the message batch and resizes it as necessary.
    ///
    /// Uses the passed in `agent_batch` for the `AgentId`s and the batch size. `agent_batch` must
    /// have equal loaded and persisted metaversions.
    ///
    /// The whole message batch is overwritten, so its loaded batch version can be older than the
    /// persisted one, but there can't be any queued changes.
    ///
    /// The persisted metaversion is updated after clearing the column and the loaded metaversion is
    /// set equal to the persisted one after loading the cleared column.
    pub fn reset(&mut self, agent_batch: &AgentBatch) -> Result<()> {
        tracing::trace!("Resetting batch");

        let batch = &mut self.batch;
        let mut metaversion_to_persist = batch.segment().read_persisted_metaversion();

        if metaversion_to_persist.memory() != batch.loaded_metaversion().memory() {
            return Err(Error::from(format!(
                "Can't reset message batch when latest persisted memory isn't loaded: {:?}, {:?}",
                metaversion_to_persist,
                batch.loaded_metaversion(),
            )));
        }
        if batch.has_queued_changes() {
            return Err(Error::from(
                "Can't reset message batch when there are queued changes",
            ));
        }

        let agent_count = agent_batch.num_agents();
        let agent_record_batch = agent_batch.batch.record_batch()?; // Agent batch must be up to date
        let column_name = AgentStateField::AgentId.name();
        let id_column = column_with_name(agent_record_batch, column_name)?;
        let empty_message_column = MessageArray::new(agent_count).map(Arc::new)?;

        let record_batch = RecordBatch::try_new(self.arrow_schema.clone(), vec![
            Arc::clone(id_column),
            empty_message_column,
        ])?;
        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&record_batch);

        // Perform some light bound checks
        // we can't release memory on mac because we can't resize the segment
        if cfg!(not(target_os = "macos")) && batch.segment().size > LOWER_BOUND {
            let upper_bound = agent_count * UPPER_MULTIPLIER;
            if batch.segment().size > upper_bound
                && batch
                    .segment()
                    .target_total_size_accommodates_data_size(upper_bound, data_len)
            {
                batch.segment_mut().resize(upper_bound)?;
                let change = batch.segment_mut().set_data_length(data_len)?;
                debug_assert!(!change.resized() && !change.shifted());
                // Always increment when resizing
                metaversion_to_persist.increment();
            }
        }

        let old_metadata_size = batch.segment().get_metadata()?.len();
        // Write new metadata
        let change = batch.segment_mut().set_metadata(&meta_buffer)?;
        debug_assert!(!change.resized() && !change.shifted());
        debug_assert_eq!(
            old_metadata_size,
            batch
                .segment()
                .get_metadata()
                .expect("Memory should have metadata, because we just set it")
                .len(),
            "Metadata size should not change"
        );

        let cur_len = batch.segment().get_data_buffer_len()?;
        if cur_len < data_len && batch.segment_mut().set_data_length(data_len)?.resized() {
            // This shouldn't happen very often unless the bounds above are very inaccurate.
            metaversion_to_persist.increment();
            tracing::info!(
                "Unexpected message batch memory resize. Was {}, should have been at least {}",
                cur_len,
                data_len
            );
        }

        let data_buffer = batch.segment_mut().get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(&record_batch, data_buffer);

        // TODO: reloading batch could be faster if we persisted
        //       fbb and WIPOffset<Message> from `simulate_record_batch_to_bytes`
        metaversion_to_persist.increment_batch();
        batch
            .segment_mut()
            .persist_metaversion(metaversion_to_persist);
        batch.reload_record_batch_and_dynamic_meta()?;
        *batch.loaded_metaversion_mut() = metaversion_to_persist;
        Ok(())
    }

    pub fn empty_from_agent_batch(
        agent_batch: &AgentBatch,
        schema: &MessageSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        let agent_count = agent_batch.num_agents();
        let agent_record_batch = agent_batch.batch.record_batch()?;
        let column_name = AgentStateField::AgentId.name();
        let id_column = column_with_name(agent_record_batch, column_name)?;
        let empty_message_column = MessageArray::new(agent_count).map(Arc::new)?;

        let record_batch = RecordBatch::try_new(Arc::clone(&schema.arrow), vec![
            id_column.clone(),
            empty_message_column,
        ])?;

        let header = Metaversion::default().to_le_bytes();
        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&record_batch);
        let mut segment = Segment::from_sizes(
            memory_id,
            0,
            header.len(),
            meta_buffer.len(),
            data_len,
            true,
        )?;
        let change = segment.set_metadata(&meta_buffer)?;
        debug_assert!(!change.resized() && !change.shifted());

        let data_buffer = segment.get_mut_data_buffer()?;
        record_batch_data_to_bytes_owned_unchecked(&record_batch, data_buffer);
        let change = segment.set_header(&header)?;
        debug_assert!(!change.resized() && !change.shifted());
        Self::from_segment(segment, schema)
    }

    pub fn from_agent_states<K: IntoRecordBatch>(
        agents: K,
        schema: &MessageSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        let record_batch = agents.to_message_batch(Arc::clone(&schema.arrow))?;
        Self::from_record_batch(&record_batch, schema, memory_id)
    }

    pub fn from_record_batch(
        record_batch: &RecordBatch,
        schema: &MessageSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        let ipc_data_generator = IpcDataGenerator::default();
        let mut dictionary_tracker = DictionaryTracker::new(true);
        let header = Metaversion::default().to_le_bytes();
        let (_, encoded_data) = ipc_data_generator.encoded_batch(
            record_batch,
            &mut dictionary_tracker,
            &IpcWriteOptions::default(),
        )?;

        let segment = Segment::from_batch_buffers(
            memory_id,
            &[],
            &header,
            &encoded_data.ipc_message,
            &encoded_data.arrow_data,
            true,
        )?;
        Self::from_segment(segment, schema)
    }

    pub fn from_segment(segment: Segment, schema: &MessageSchema) -> Result<Self> {
        let buffers = segment.get_batch_buffers()?;

        let batch_message = ipc::root_as_message(buffers.meta())?
            .header_as_record_batch()
            .expect("Unable to read IPC message as record batch");

        let data_length = buffers.data().len();
        let dynamic_meta = batch_message.into_meta(data_length)?;

        let record_batch = read_record_batch(
            buffers.data(),
            batch_message,
            Arc::clone(&schema.arrow),
            &[],
            None,
        )?;

        let persisted = segment.try_read_persisted_metaversion()?;
        Ok(Self {
            batch: ArrowBatch::new(
                segment,
                record_batch,
                dynamic_meta,
                Arc::clone(&schema.static_meta),
                Vec::with_capacity(3),
                persisted,
            ),
            arrow_schema: Arc::clone(&schema.arrow),
        })
    }
}
