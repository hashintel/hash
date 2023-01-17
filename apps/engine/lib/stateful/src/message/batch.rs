#![allow(clippy::cast_ptr_alignment, clippy::cast_sign_loss)]

use std::{fmt, sync::Arc};

use arrow2::{array::Array, chunk::Chunk, datatypes::Schema};
use arrow_format::ipc::{planus::ReadAsRoot, MessageHeaderRef, MessageRef};
use memory::{
    arrow::{
        column_with_name_from_record_batch,
        ipc::{self, calculate_ipc_header_data, write_record_batch_message_header},
        meta::DynamicMetadata,
        record_batch::RecordBatch,
        ArrowBatch,
    },
    shared_memory::{MemoryId, Metaversion, Segment},
};
use tracing::trace;

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

impl fmt::Debug for MessageBatch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // todo: improve debug representation
        f.debug_struct("MessageBatch")
            .field("batch", &"_")
            .field("arrow_schema", &self.arrow_schema)
            .finish()
    }
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
        tracing::trace!(
            "started resetting message batch with id {}",
            self.batch.segment().id()
        );

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
        let id_column = column_with_name_from_record_batch(agent_record_batch, column_name)?;
        let empty_message_column = Box::new(MessageArray::new(agent_count));

        let record_batch = RecordBatch::new(
            self.arrow_schema.clone(),
            Chunk::new(vec![id_column.clone(), empty_message_column]),
        );
        let write_metadata = ipc::calculate_ipc_header_data(&record_batch);

        // Perform some light bound checks
        // we can't release memory on mac because we can't resize the segment
        if cfg!(not(target_os = "macos")) && batch.segment().size > LOWER_BOUND {
            let upper_bound = agent_count * UPPER_MULTIPLIER;
            if batch.segment().size > upper_bound
                && batch
                    .segment()
                    .target_total_size_accommodates_data_size(upper_bound, write_metadata.body_len)
            {
                batch.segment_mut().resize(upper_bound)?;
                let change = batch
                    .segment_mut()
                    .set_data_length(write_metadata.body_len)?;
                debug_assert!(!change.resized() && !change.shifted());
                // Always increment when resizing
                metaversion_to_persist.increment();
            }
        }

        // check how many nodes + buffers we had on the old metadata
        #[cfg(debug_assertions)]
        let old_metadata = ipc::read_record_batch_message(batch.segment()).unwrap();
        #[cfg(debug_assertions)]
        let old_buffer_count = old_metadata.buffers().unwrap().unwrap().len();
        #[cfg(debug_assertions)]
        let old_node_count = old_metadata.nodes().unwrap().unwrap().len();

        // Write new metadata
        let mut metadata = vec![];
        ipc::write_record_batch_message_header(&mut metadata, &write_metadata)?;
        let change = batch.segment_mut().set_metadata(&metadata)?;
        debug_assert!(!change.resized() && !change.shifted());

        // check that nodes + buffer counts haven't changed
        #[cfg(debug_assertions)]
        {
            let new_metadata = ipc::read_record_batch_message(batch.segment()).unwrap();
            let new_buffer_count = new_metadata.buffers().unwrap().unwrap().len();
            let new_node_count = new_metadata.nodes().unwrap().unwrap().len();
            assert_eq!(old_buffer_count, new_buffer_count);
            assert_eq!(old_node_count, new_node_count);
        }

        // debug_assert_eq!(
        //     old_metadata_size,
        //     batch
        //         .segment()
        //         .get_metadata()
        //         .expect("Memory should have metadata, because we just set it")
        //         .len(),
        //     "Metadata size should not change, but for the batch with id {} it did",
        //     batch.segment().id()
        // );

        let cur_len = batch.segment().get_data_buffer_len()?;
        if cur_len < write_metadata.body_len
            && batch
                .segment_mut()
                .set_data_length(write_metadata.body_len)?
                .resized()
        {
            // This shouldn't happen very often unless the bounds above are very inaccurate.
            metaversion_to_persist.increment();
            tracing::info!(
                "Unexpected message batch memory resize. Was {}, should have been at least {}",
                cur_len,
                write_metadata.body_len
            );
        }

        let data_buffer = batch.segment_mut().get_mut_data_buffer()?;
        // Write new data
        ipc::write_record_batch_body(&record_batch, data_buffer, &write_metadata)?;

        metaversion_to_persist.increment_batch();
        batch
            .segment_mut()
            .persist_metaversion(metaversion_to_persist);
        batch.reload_record_batch_and_dynamic_meta()?;
        *batch.loaded_metaversion_mut() = metaversion_to_persist;

        trace!(
            "finished resetting batch with id {}",
            self.batch.segment().id()
        );

        Ok(())
    }

    pub fn empty_from_agent_batch(
        agent_batch: &AgentBatch,
        schema: &MessageSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        trace!(
            "writing an empty record batch with schema {:?} to shared memory segment {}",
            schema.arrow,
            memory_id
        );

        let agent_count = agent_batch.num_agents();
        let agent_record_batch = agent_batch.batch.record_batch()?;
        let column_name = AgentStateField::AgentId.name();
        let id_column = column_with_name_from_record_batch(agent_record_batch, column_name)?;
        let empty_message_column: Box<dyn Array> = Box::new(MessageArray::new(agent_count));

        debug_assert_eq!(id_column.len(), agent_count);
        debug_assert_eq!(empty_message_column.len(), agent_count);

        let record_batch = RecordBatch::new(
            Arc::clone(&schema.arrow),
            Chunk::new(vec![id_column.clone(), empty_message_column]),
        );

        let header = Metaversion::default().to_le_bytes();

        let header_data = ipc::calculate_ipc_header_data(&record_batch);

        let mut metadata = vec![];
        ipc::write_record_batch_message_header(&mut metadata, &header_data)?;

        let mut segment = Segment::from_sizes(
            memory_id,
            0,
            header.len(),
            metadata.len(),
            header_data.body_len,
            true,
        )?;
        let change = segment.set_metadata(&metadata)?;
        debug_assert!(!change.resized() && !change.shifted());

        let data_buffer = segment.get_mut_data_buffer()?;
        ipc::write_record_batch_body(&record_batch, data_buffer, &header_data)?;

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
        msg_schema: &MessageSchema,
        memory_id: MemoryId,
    ) -> Result<Self> {
        trace!(
            "writing record batch with schema {:?} to shared memory segment {}",
            msg_schema.arrow,
            memory_id
        );

        let header_data = calculate_ipc_header_data(record_batch);

        let mut metadata = vec![];
        write_record_batch_message_header(&mut metadata, &header_data)?;

        let mut body = vec![0; header_data.body_len];

        ipc::write_record_batch_body(record_batch, &mut body, &header_data)?;

        let segment = Segment::from_batch_buffers(
            memory_id,
            &[],
            &Metaversion::default().to_le_bytes(),
            &metadata,
            &body,
            true,
        )?;
        Self::from_segment(segment, msg_schema)
    }

    pub fn from_segment(segment: Segment, schema: &MessageSchema) -> Result<Self> {
        let buffers = segment.get_batch_buffers()?;

        let batch_message = match MessageRef::read_as_root(buffers.meta())?.header()? {
            Some(MessageHeaderRef::RecordBatch(r)) => r,
            _ => panic!("Unable to read IPC message as record batch"),
        };

        let data_length = buffers.data().len();
        let dynamic_meta = DynamicMetadata::from_record_batch(&batch_message, data_length)?;

        let record_batch = ipc::read_record_batch(&segment, Arc::clone(&schema.arrow))?;

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
