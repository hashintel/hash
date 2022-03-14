#![allow(clippy::cast_ptr_alignment, clippy::cast_sign_loss)]

use std::{
    ops::{Deref, DerefMut},
    sync::Arc,
};

use arrow::{
    array::ArrayData,
    ipc::{
        reader::read_record_batch,
        writer::{DictionaryTracker, IpcDataGenerator, IpcWriteOptions},
    },
};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use crate::{
    datastore::{
        arrow::{
            ipc::{record_batch_data_to_bytes_owned_unchecked, simulate_record_batch_to_bytes},
            message::{self, MESSAGE_COLUMN_INDEX},
        },
        batch::{flush::GrowableBatch, ArrowBatch, Segment},
        prelude::*,
        schema::state::MessageSchema,
        table::references::AgentMessageReference,
        UUID_V4_LEN,
    },
    hash_types::state::AgentStateField,
    proto::ExperimentId,
};

// 1000 bytes per agent i.e. 10 MB for 10000 agents
/// Soft upper bound for how many bytes per agent in the shared memory.
/// This is NOT the maximum number of bytes per agent, rather, it is
/// the size per agent which shared memory is downscaled to
/// IF there is enough space to do so.
const UPPER_MULTIPLIER: usize = 1000;
/// Size of shared memory above which the soft upper bound is checked
const LOWER_BOUND: usize = 10000;

pub struct MessageBatch {
    batch: ArrowBatch,
    /// Arrow schema with message batch fields
    arrow_schema: Arc<ArrowSchema>,
}

impl Deref for MessageBatch {
    type Target = ArrowBatch;

    fn deref(&self) -> &Self::Target {
        &self.batch
    }
}

impl DerefMut for MessageBatch {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.batch
    }
}

impl MessageBatch {
    /// Clears the message batch, resizing as necessary.
    ///
    /// Uses the passed in `agents` for the `AgentId`s and the group
    /// size. `agents` must have equal loaded and persisted metaversions.
    ///
    /// The whole message batch is overwritten, so its loaded batch
    /// version can be older than the persisted one, but there can't
    /// be any queued changes.
    ///
    /// The persisted metaversion is updated after clearing the column
    /// and the loaded metaversion is set equal to the persisted one
    /// after loading the cleared column.
    pub fn reset(&mut self, agents: &AgentBatch) -> Result<()> {
        tracing::trace!("Resetting batch");

        let mut to_persist = self.persisted_metaversion();

        if to_persist.memory() != self.loaded_metaversion().memory() {
            return Err(Error::from(format!(
                "Can't reset message batch when latest persisted memory isn't loaded: {:?}, {:?}",
                to_persist,
                self.loaded_metaversion(),
            )));
        }
        if self.has_queued_changes() {
            return Err(Error::from(
                "Can't reset message batch when there are queued changes",
            ));
        }

        let agent_count = agents.num_agents();
        let agent_rb = agents.record_batch()?; // Agent batch must be up to date
        let column_name = AgentStateField::AgentId.name();
        let id_column = super::iterators::column_with_name(agent_rb, column_name)?;
        let empty_message_column = message::empty_messages_column(agent_count).map(Arc::new)?;

        let rb = RecordBatch::try_new(self.arrow_schema.clone(), vec![
            Arc::clone(id_column),
            empty_message_column,
        ])?;
        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&rb);

        // Perform some light bound checks
        // we can't release memory on mac because we can't resize the segment
        if cfg!(not(target_os = "macos")) && self.memory().size > LOWER_BOUND {
            let upper_bound = agent_count * UPPER_MULTIPLIER;
            if self.memory().size > upper_bound
                && self
                    .memory()
                    .target_total_size_accommodates_data_size(upper_bound, data_len)
            {
                self.memory_mut().resize(upper_bound)?;
                self.memory_mut().set_data_length(data_len)?;
                // Always increment when resizing
                to_persist.increment();
            }
        }

        // Metadata size should not change!
        // Write new metadata
        self.memory_mut().set_metadata(&meta_buffer)?;

        let cur_len = self.memory().get_data_buffer_len()?;
        if cur_len < data_len && self.memory_mut().set_data_length(data_len)?.resized() {
            // This shouldn't happen very often unless the bounds above are very inaccurate.
            to_persist.increment();
            tracing::info!(
                "Unexpected message batch memory resize. Was {}, should have been at least {}",
                cur_len,
                data_len
            );
        }

        let data_buffer = self.memory_mut().get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(&rb, data_buffer);

        // TODO: reloading batch could be faster if we persisted
        //       fbb and WIPOffset<Message> from `simulate_record_batch_to_bytes`
        to_persist.increment_batch();
        self.set_persisted_metaversion(to_persist);
        self.reload_record_batch_and_dynamic_meta()?;
        self.loaded = to_persist;
        Ok(())
    }

    pub fn empty_from_agent_batch(
        agent_batch: &AgentBatch,
        schema: &Arc<ArrowSchema>,
        meta: Arc<StaticMeta>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let agent_count = agent_batch.num_agents();
        let agent_rb = agent_batch.record_batch()?;
        let column_name = AgentStateField::AgentId.name();
        let id_column = super::iterators::column_with_name(agent_rb, column_name)?;
        let empty_message_column = message::empty_messages_column(agent_count).map(Arc::new)?;

        let rb = RecordBatch::try_new(schema.clone(), vec![
            id_column.clone(),
            empty_message_column,
        ])?;

        let header = Metaversion::default().to_le_bytes();
        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&rb);
        let mut memory = Memory::from_sizes(
            experiment_id,
            0,
            header.len(),
            meta_buffer.len(),
            data_len,
            true,
        )?;
        memory.set_metadata(&meta_buffer)?;

        let data_buffer = memory.get_mut_data_buffer()?;
        record_batch_data_to_bytes_owned_unchecked(&rb, data_buffer);
        memory.set_header(&header)?;
        Self::from_memory(memory, schema.clone(), meta)
    }

    pub fn from_agent_states<K: IntoRecordBatch>(
        agents: K,
        schema: &Arc<MessageSchema>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let rb = agents.into_message_batch(&schema.arrow)?;
        Self::from_record_batch(
            &rb,
            schema.arrow.clone(),
            schema.static_meta.clone(),
            experiment_id,
        )
    }

    pub fn from_record_batch(
        record_batch: &RecordBatch,
        schema: Arc<ArrowSchema>,
        meta: Arc<StaticMeta>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let ipc_data_generator = IpcDataGenerator::default();
        let mut dictionary_tracker = DictionaryTracker::new(true);
        let header = Metaversion::default().to_le_bytes();
        let (_, encoded_data) = ipc_data_generator.encoded_batch(
            record_batch,
            &mut dictionary_tracker,
            &IpcWriteOptions::default(),
        )?;

        let memory = Memory::from_batch_buffers(
            experiment_id,
            &[],
            &header,
            &encoded_data.ipc_message,
            &encoded_data.arrow_data,
            true,
        )?;
        Self::from_memory(memory, schema, meta)
    }

    pub fn from_memory(
        memory: Memory,
        schema: Arc<ArrowSchema>,
        static_meta: Arc<StaticMeta>,
    ) -> Result<Self> {
        let (_, _, meta_buffer, data_buffer) = memory.get_batch_buffers()?;

        let batch_message = arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .expect("Unable to read IPC message as record batch");

        let memory_len = data_buffer.len();
        let dynamic_meta = batch_message.into_meta(memory_len)?;

        let rb = read_record_batch(data_buffer, batch_message, schema.clone(), &[])?;

        let persisted = memory.get_metaversion()?;
        Ok(Self {
            batch: ArrowBatch {
                segment: Segment(memory),
                rb,
                dynamic_meta,
                static_meta,
                changes: Vec::with_capacity(3),
                loaded: persisted,
            },
            arrow_schema: schema,
        })
    }
}

#[derive(Debug)]
pub struct Raw<'a> {
    pub from: &'a [u8; UUID_V4_LEN],
    pub data: &'a str,
}

// Iterators and getters
impl MessageBatch {
    pub fn message_loader(&self) -> MessageLoader<'_> {
        let column = self.batch.column(message::FROM_COLUMN_INDEX);
        let data = column.data_ref();
        let from = unsafe { data.buffers()[0].typed_data::<u8>() };

        let (to_bufs, to) = get_message_field(rb, message::FieldIndex::To);
        debug_assert_eq!(to_bufs.len(), 3);
        let (typ_bufs, typ) = get_message_field(rb, message::FieldIndex::Type);
        debug_assert_eq!(typ_bufs.len(), 2);
        let (data_bufs, data) = get_message_field(rb, message::FieldIndex::Data);
        debug_assert_eq!(data_bufs.len(), 2);

        MessageLoader {
            from,
            to_bufs,
            to,
            typ_bufs,
            typ,
            data_bufs,
            data,
        }
    }

    pub fn message_usize_index_iter(
        rb: &RecordBatch,
        i_batch: usize,
    ) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = AgentMessageReference>>
    {
        let num_agents = rb.num_rows();
        let column = rb.column(MESSAGE_COLUMN_INDEX);
        let data = column.data_ref();
        // This is the offset buffer for message objects.
        // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent
        let offsets = &data.buffers()[0];
        // Markers are stored in i32 in the Arrow format
        // There are n + 1 offsets always in Offset buffers in the Arrow format
        let i32_offsets =
            unsafe { std::slice::from_raw_parts(offsets.as_ptr() as *const i32, num_agents + 1) };
        (0..num_agents).into_par_iter().map(move |i_agent| {
            let num_messages = i32_offsets[i_agent + 1] - i32_offsets[i_agent];
            (0..num_messages)
                .into_par_iter()
                .map(move |i_msg| AgentMessageReference::new(i_batch, i_agent, i_msg as usize))
        })
    }

    pub fn message_recipients_par_iter(
        rb: &RecordBatch,
    ) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = Vec<&str>>> {
        let num_agents = rb.num_rows();
        let (bufs, to) = get_message_field(rb, message::FieldIndex::To);
        let (i32_offsets, to_list_i32_offsets, to_i32_offsets) = (bufs[0], bufs[1], bufs[2]);
        (0..num_agents).into_par_iter().map(move |j| {
            let row_index = i32_offsets[j] as usize;
            let next_row_index = i32_offsets[j + 1] as usize;
            let num_messages = next_row_index - row_index;

            let to_list_indices = &to_list_i32_offsets[row_index..=next_row_index];
            (0..num_messages).into_par_iter().map(move |k| {
                let to_list_index = to_list_indices[k] as usize;
                let next_to_list_index = to_list_indices[k + 1] as usize;

                let recipient_count = next_to_list_index - to_list_index;

                let recipient_indices = &to_i32_offsets[to_list_index..=next_to_list_index];

                let mut recipients = Vec::with_capacity(recipient_count);
                for l in 0..recipient_count {
                    let recipient_index = recipient_indices[l] as usize;
                    let next_recipient_index = recipient_indices[l + 1] as usize;
                    let recipient_value = &to[recipient_index..next_recipient_index];
                    recipients.push(recipient_value);
                }

                recipients
            })
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn message_recipients_iter(rb: &RecordBatch) -> impl Iterator<Item = Vec<&str>> {
        let num_agents = rb.num_rows();
        let (bufs, to) = get_message_field(rb, message::FieldIndex::To);
        let (i32_offsets, to_list_i32_offsets, to_i32_offsets) = (bufs[0], bufs[1], bufs[2]);
        (0..num_agents).flat_map(move |j| {
            let row_index = i32_offsets[j] as usize;
            let next_row_index = i32_offsets[j + 1] as usize;
            let num_messages = next_row_index - row_index;

            let to_list_indices = &to_list_i32_offsets[row_index..=next_row_index];
            (0..num_messages).map(move |k| {
                let to_list_index = to_list_indices[k] as usize;
                let next_to_list_index = to_list_indices[k + 1] as usize;

                let recipient_count = next_to_list_index - to_list_index;

                let recipient_indices = &to_i32_offsets[to_list_index..=next_to_list_index];

                let mut recipients = Vec::with_capacity(recipient_count);
                for l in 0..recipient_count {
                    let recipient_index = recipient_indices[l] as usize;
                    let next_recipient_index = recipient_indices[l + 1] as usize;
                    let recipient_value = &to[recipient_index..next_recipient_index];
                    recipients.push(recipient_value);
                }

                recipients
            })
        })
    }

    fn get_message_field(rb: &RecordBatch, index: message::FieldIndex) -> (Vec<&[i32]>, &str) {
        // The "to" field is the 0th field in MESSAGE_ARROW_FIELDS
        // The "type" field is the 1st field in MESSAGE_ARROW_FIELDS
        // The "data" field is the 2nd field in MESSAGE_ARROW_FIELDS
        let is_nested_list = matches!(index, message::FieldIndex::To);
        let index_usize = index as usize;
        let i32_byte_len = 4;
        let mut buffers = Vec::with_capacity(3);

        let num_agents = rb.num_rows();
        let column = rb.column(MESSAGE_COLUMN_INDEX);
        let data = column.data_ref();
        // This is the offset buffer for message objects.
        // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent
        let offsets = &data.buffers()[0];
        // Markers are stored in i32 in the Arrow format
        // There are n + 1 offsets always in Offset buffers in the Arrow format
        let i32_offsets =
            unsafe { std::slice::from_raw_parts(offsets.as_ptr() as *const i32, num_agents + 1) };
        buffers.push(i32_offsets);

        let struct_level = &data.child_data()[0];

        // This is in the format of List<String> or String

        let field_field_node = if is_nested_list {
            let list_field_node = &struct_level.child_data()[index_usize];

            // List<String>
            let field_list_offsets = &list_field_node.buffers()[0];

            let field_list_offsets_byte_len = field_list_offsets.len();

            let field_list_i32_offsets = unsafe {
                std::slice::from_raw_parts(
                    field_list_offsets.as_ptr() as *const i32,
                    field_list_offsets_byte_len / i32_byte_len + 1,
                )
            };
            buffers.push(field_list_i32_offsets);
            &list_field_node.child_data()[0]
        } else {
            // String
            &struct_level.child_data()[index_usize]
        };

        // This is the String node
        let field_offsets = &field_field_node.buffers()[0];

        let field_offsets_byte_len = field_offsets.len();

        let field_i32_offsets = unsafe {
            std::slice::from_raw_parts(
                field_offsets.as_ptr() as *const i32,
                field_offsets_byte_len / i32_byte_len,
            )
        };
        buffers.push(field_i32_offsets);

        let field_data = &field_field_node.buffers()[1];

        // This panics when we have messed up with indices.
        // Arrow string arrays hold utf-8 strings
        let field = std::str::from_utf8(field_data.as_slice()).unwrap();
        (buffers, field)
    }
}

pub struct MessageLoader<'a> {
    from: &'a [u8],
    to_bufs: Vec<&'a [i32]>,
    to: &'a str,
    typ_bufs: Vec<&'a [i32]>,
    typ: &'a str,
    data_bufs: Vec<&'a [i32]>,
    data: &'a str,
}

impl<'a> MessageLoader<'a> {
    pub fn get_from(&self, agent_index: usize) -> &'a [u8; UUID_V4_LEN] {
        let content_start = agent_index * UUID_V4_LEN;
        unsafe {
            let ptr = &self.from[content_start] as *const u8;
            &*(ptr as *const [u8; UUID_V4_LEN])
        }
    }

    pub fn get_recipients(&self, agent_index: usize, message_index: usize) -> Vec<&'a str> {
        let list_index = self.to_bufs[0][agent_index] as usize + message_index;
        let list_start = self.to_bufs[1][list_index] as usize;
        let list_end = self.to_bufs[1][list_index + 1] as usize;
        let list_length = list_end - list_start;
        (0..list_length)
            .map(|i| {
                let index = self.to_bufs[2][i + list_start] as usize;
                let next_index = self.to_bufs[2][i + list_start + 1] as usize;
                &self.to[index..next_index]
            })
            .collect()
    }

    pub fn get_type(&self, agent_index: usize, message_index: usize) -> &'a str {
        let list_index = self.typ_bufs[0][agent_index] as usize + message_index;
        let type_start = self.typ_bufs[1][list_index] as usize;
        let next_type_start = self.typ_bufs[1][list_index + 1] as usize;
        &self.typ[type_start..next_type_start]
    }

    pub fn get_data(&self, agent_index: usize, message_index: usize) -> &'a str {
        let list_index = self.data_bufs[0][agent_index] as usize + message_index;
        let content_start = self.data_bufs[1][list_index] as usize;
        let next_content_start = self.data_bufs[1][list_index + 1] as usize;
        &self.data[content_start..next_content_start]
    }

    pub fn get_raw_message(&self, agent_index: usize, message_index: usize) -> Raw<'a> {
        Raw {
            from: self.get_from(agent_index),
            data: self.get_data(agent_index, message_index),
        }
    }
}
