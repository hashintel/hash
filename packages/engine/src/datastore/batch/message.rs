#![allow(clippy::cast_ptr_alignment, clippy::cast_sign_loss)]

use std::sync::Arc;

use arrow::array;
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use super::{
    change::ArrayChange, flush::GrowableBatch, ArrowBatch, Batch as BatchRepr, DynamicBatch,
};
use crate::{
    datastore::{
        arrow::{
            ipc::{
                read_record_batch, record_batch_data_to_bytes_owned_unchecked,
                record_batch_to_bytes, simulate_record_batch_to_bytes,
            },
            message::{
                self, get_column_from_list_array, MESSAGE_COLUMN_INDEX, MESSAGE_COLUMN_NAME,
            },
        },
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
    pub(crate) memory: Memory,
    pub(crate) batch: RecordBatch,
    arrow_schema: Arc<ArrowSchema>,
    static_meta: Arc<StaticMeta>,
    dynamic_meta: DynamicMeta,
    pub changes: Vec<ArrayChange>,
    metaversion: Metaversion,
}

impl BatchRepr for MessageBatch {
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
            self.reload_record_batch()?;
        }

        self.metaversion = state;
        Ok(())
    }

    /// Reload the memory (for when ftruncate has been called) and batch
    fn reload(&mut self) -> Result<()> {
        self.memory.reload()?;
        self.reload_record_batch()
    }
}

impl ArrowBatch for MessageBatch {
    fn record_batch(&self) -> &RecordBatch {
        &self.batch
    }

    fn record_batch_mut(&mut self) -> &mut RecordBatch {
        &mut self.batch
    }
}

impl DynamicBatch for MessageBatch {
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

impl GrowableBatch<ArrayChange, Arc<array::ArrayData>> for MessageBatch {
    fn take_changes(&mut self) -> Vec<ArrayChange> {
        std::mem::replace(&mut self.changes, Vec::with_capacity(3))
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

impl MessageBatch {
    /// Clears the message column, resizing as necessary.
    ///
    /// Uses the passed in `agents` for the `AgentId`s and the group sizes.
    pub fn reset(&mut self, agents: &AgentBatch) -> Result<()> {
        tracing::trace!("Resetting batch");
        let agent_count = agents.batch.num_rows();
        let column_name = AgentStateField::AgentId.name();
        let id_column = agents.get_arrow_column(column_name)?;
        let empty_message_column = message::empty_messages_column(agent_count).map(Arc::new)?;

        let batch = RecordBatch::try_new(self.arrow_schema.clone(), vec![
            id_column.clone(),
            empty_message_column,
        ])?;

        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&batch);

        // Perform some light bound checks
        // we can't release memory on mac because we can't resize the segment
        if cfg!(not(target_os = "macos")) && self.memory.size > LOWER_BOUND {
            let upper_bound = agent_count * UPPER_MULTIPLIER;
            if self.memory.size > upper_bound
                && self
                    .memory
                    .target_total_size_accommodates_data_size(upper_bound, data_len)
            {
                self.memory.resize(upper_bound)?;
                self.memory.set_data_length(data_len)?;
                // Always increment when resizing
                self.metaversion.increment();
            }
        }

        // Metadata size should not change!
        // Write new metadata
        self.memory.set_metadata(&meta_buffer)?;

        let cur_len = self.memory.get_data_buffer_len()?;

        if cur_len < data_len && self.memory.set_data_length(data_len)?.resized() {
            // This shouldn't happen very often unless the bounds above are very inaccurate
            self.metaversion.increment();
            tracing::info!(
                "Unexpected message batch memory resize. Was {}, should have been at least {}",
                cur_len,
                data_len
            );
        }

        let data_buffer = self.memory.get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(&batch, data_buffer);

        // TODO: reloading batch could be faster if we persisted
        // fbb and WIPOffset<Message> from `simulate_record_batch_to_bytes`
        self.metaversion.increment_batch();
        self.reload_record_batch_and_dynamic_meta()?;
        Ok(())
    }

    pub fn empty_from_agent_batch(
        agent_batch: &AgentBatch,
        schema: &Arc<ArrowSchema>,
        meta: Arc<StaticMeta>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let agent_count = agent_batch.batch.num_rows();
        let column_name = AgentStateField::AgentId.name();
        let id_column = agent_batch.get_arrow_column(column_name)?;
        let empty_message_column: Arc<dyn ArrowArray> =
            message::empty_messages_column(agent_count).map(Arc::new)?;

        let batch = RecordBatch::try_new(schema.clone(), vec![
            id_column.clone(),
            empty_message_column,
        ])?;

        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(&batch);
        let mut memory =
            Memory::from_sizes(experiment_id, 0, 0, meta_buffer.len(), data_len, true)?;
        memory.set_metadata(&meta_buffer)?;

        let data_buffer = memory.get_mut_data_buffer()?;
        record_batch_data_to_bytes_owned_unchecked(&batch, data_buffer);
        Self::from_memory(memory, schema.clone(), meta)
    }

    // TODO: UNUSED: Needs triage
    pub fn empty(
        agents: &[&AgentState],
        schema: &Arc<ArrowSchema>,
        meta: Arc<StaticMeta>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let arrow_batch = agents.into_empty_message_batch(schema)?;
        Self::from_record_batch(&arrow_batch, schema.clone(), meta, experiment_id)
    }

    pub fn from_agent_states<K: IntoRecordBatch>(
        agents: K,
        schema: &Arc<MessageSchema>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let arrow_batch = agents.into_message_batch(&schema.arrow)?;
        Self::from_record_batch(
            &arrow_batch,
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
        let (meta_buffer, data_buffer) = record_batch_to_bytes(record_batch);

        let memory = Memory::from_batch_buffers(
            experiment_id,
            &[],
            &[],
            meta_buffer.as_ref(),
            &data_buffer,
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

        let batch_message = arrow_ipc::get_root_as_message(meta_buffer)
            .header_as_record_batch()
            .expect("Unable to read IPC message as record batch");

        let memory_len = data_buffer.len();
        let dynamic_meta = batch_message.into_meta(memory_len)?;

        let batch = match read_record_batch(data_buffer, &batch_message, schema.clone(), &[]) {
            Ok(rb) => rb.unwrap(),
            Err(e) => return Err(Error::from(e)),
        };

        Ok(Self {
            memory,
            batch,
            metaversion: Metaversion::default(),
            arrow_schema: schema,
            static_meta,
            dynamic_meta,
            changes: Vec::with_capacity(3),
        })
    }
}

#[derive(Debug)]
pub struct Raw<'a> {
    pub from: &'a [u8; UUID_V4_LEN],
    pub to: Vec<&'a str>,
    // TODO: UNUSED: Needs triage
    pub r#type: &'a str,
    // TODO: UNUSED: Needs triage
    pub data: &'a str,
}

// Iterators and getters
impl MessageBatch {
    // TODO: UNUSED: Needs triage
    pub fn get_native_messages(&self) -> Result<Vec<Vec<OutboundMessage>>> {
        let reference = self
            .batch
            .column(MESSAGE_COLUMN_INDEX)
            .as_any()
            .downcast_ref::<array::ListArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: MESSAGE_COLUMN_NAME.into(),
            })?;
        get_column_from_list_array(reference)
    }

    pub fn message_loader(&self) -> MessageLoader<'_> {
        let column = self.batch.column(message::FROM_COLUMN_INDEX);
        let data = column.data_ref();
        let from = unsafe { data.buffers()[0].typed_data::<u8>() };

        let (to_bufs, to) = self.get_message_field(message::FieldIndex::To);
        debug_assert_eq!(to_bufs.len(), 3);
        let (typ_bufs, typ) = self.get_message_field(message::FieldIndex::Type);
        debug_assert_eq!(typ_bufs.len(), 2);
        let (data_bufs, data) = self.get_message_field(message::FieldIndex::Data);
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

    // TODO: UNUSED: Needs triage
    pub fn message_index_iter(&self, i: usize) -> impl Iterator<Item = MessageIndex> {
        let num_agents = self.batch.num_rows();
        let group_index = i as u32;
        let column = self.batch.column(MESSAGE_COLUMN_INDEX);
        let data = column.data_ref();
        // This is the offset buffer for message objects.
        // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent
        let offsets = &data.buffers()[0];
        // Markers are stored in i32 in the Arrow format
        // There are n + 1 offsets always in Offset buffers in the Arrow format
        let i32_offsets =
            unsafe { std::slice::from_raw_parts(offsets.raw_data() as *const i32, num_agents + 1) };
        (0..num_agents).flat_map(move |j| {
            let num_messages = i32_offsets[j + 1] - i32_offsets[j];
            let agent_index = j as u32;
            (0..num_messages).map(move |k| (group_index, agent_index, k as u32))
        })
    }

    pub fn message_usize_index_iter(
        &self,
        i: usize,
    ) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = AgentMessageReference>>
    {
        let num_agents = self.batch.num_rows();
        let column = self.batch.column(MESSAGE_COLUMN_INDEX);
        let data = column.data_ref();
        // This is the offset buffer for message objects.
        // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent
        let offsets = &data.buffers()[0];
        // Markers are stored in i32 in the Arrow format
        // There are n + 1 offsets always in Offset buffers in the Arrow format
        let i32_offsets =
            unsafe { std::slice::from_raw_parts(offsets.raw_data() as *const i32, num_agents + 1) };
        (0..num_agents).into_par_iter().map(move |j| {
            let num_messages = i32_offsets[j + 1] - i32_offsets[j];
            (0..num_messages)
                .into_par_iter()
                .map(move |k| AgentMessageReference::new(i, j, k as usize))
        })
    }

    pub fn message_recipients_par_iter(
        &self,
    ) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = Vec<&str>>> {
        let num_agents = self.batch.num_rows();
        let (bufs, to) = self.get_message_field(message::FieldIndex::To);
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
    pub fn message_recipients_iter(&self) -> impl Iterator<Item = Vec<&str>> {
        let num_agents = self.batch.num_rows();
        let (bufs, to) = self.get_message_field(message::FieldIndex::To);
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

    fn get_message_field(&self, index: message::FieldIndex) -> (Vec<&[i32]>, &str) {
        // The "to" field is the 0th field in MESSAGE_ARROW_FIELDS
        // The "type" field is the 1st field in MESSAGE_ARROW_FIELDS
        // The "data" field is the 2nd field in MESSAGE_ARROW_FIELDS
        let is_nested_list = matches!(index, message::FieldIndex::To);
        let index_usize = index as usize;
        let i32_byte_len = 4;
        let mut buffers = Vec::with_capacity(3);

        let num_agents = self.batch.num_rows();
        let column = self.batch.column(MESSAGE_COLUMN_INDEX);
        let data = column.data_ref();
        // This is the offset buffer for message objects.
        // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent
        let offsets = &data.buffers()[0];
        // Markers are stored in i32 in the Arrow format
        // There are n + 1 offsets always in Offset buffers in the Arrow format
        let i32_offsets =
            unsafe { std::slice::from_raw_parts(offsets.raw_data() as *const i32, num_agents + 1) };
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
                    field_list_offsets.raw_data() as *const i32,
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
                field_offsets.raw_data() as *const i32,
                field_offsets_byte_len / i32_byte_len,
            )
        };
        buffers.push(field_i32_offsets);

        let field_data = &field_field_node.buffers()[1];

        // This panics when we have messed up with indices.
        // Arrow string arrays hold utf-8 strings
        let field = std::str::from_utf8(field_data.data()).unwrap();
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
            to: self.get_recipients(agent_index, message_index),
            r#type: self.get_type(agent_index, message_index),
            data: self.get_data(agent_index, message_index),
        }
    }
}
