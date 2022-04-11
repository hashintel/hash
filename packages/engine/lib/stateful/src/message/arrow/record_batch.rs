use std::sync::Arc;

use arrow::{array::Array, datatypes::Schema, record_batch::RecordBatch};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use crate::{
    agent::{arrow::array::get_agent_id_array, MessageReference},
    field::UUID_V4_LEN,
    message::arrow::array::{FieldIndex, MessageArray, FROM_COLUMN_INDEX, MESSAGE_COLUMN_INDEX},
    Error, Result,
};

#[derive(Debug)]
pub struct Raw<'a> {
    pub from: &'a [u8; UUID_V4_LEN],
    pub data: &'a str,
}

pub fn message_loader(record_batch: &RecordBatch) -> MessageLoader<'_> {
    let column = record_batch.column(FROM_COLUMN_INDEX);
    let data = column.data_ref();
    let from = unsafe { data.buffers()[0].typed_data::<u8>() };

    let (to_bufs, to) = get_message_field(record_batch, FieldIndex::To);
    debug_assert_eq!(to_bufs.len(), 3);
    let (typ_bufs, typ) = get_message_field(record_batch, FieldIndex::Type);
    debug_assert_eq!(typ_bufs.len(), 2);
    let (data_bufs, data) = get_message_field(record_batch, FieldIndex::Data);
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
    record_batch: &RecordBatch,
    batch_index: usize,
) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = MessageReference>> {
    let num_agents = record_batch.num_rows();
    let column = record_batch.column(MESSAGE_COLUMN_INDEX);
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
            .map(move |i_msg| MessageReference::new(batch_index, i_agent, i_msg as usize))
    })
}

pub fn message_recipients_par_iter(
    record_batch: &RecordBatch,
) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = Vec<&str>>> {
    let num_agents = record_batch.num_rows();
    let (bufs, to) = get_message_field(record_batch, FieldIndex::To);
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
pub fn message_recipients_iter(record_batch: &RecordBatch) -> impl Iterator<Item = Vec<&str>> {
    let num_agents = record_batch.num_rows();
    let (bufs, to) = get_message_field(record_batch, FieldIndex::To);
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

fn get_message_field(record_batch: &RecordBatch, index: FieldIndex) -> (Vec<&[i32]>, &str) {
    // The "to" field is the 0th field in MESSAGE_ARROW_FIELDS
    // The "type" field is the 1st field in MESSAGE_ARROW_FIELDS
    // The "data" field is the 2nd field in MESSAGE_ARROW_FIELDS
    let is_nested_list = matches!(index, FieldIndex::To);
    let index_usize = index as usize;
    let i32_byte_len = 4;
    let mut buffers = Vec::with_capacity(3);

    let num_agents = record_batch.num_rows();
    let column = record_batch.column(MESSAGE_COLUMN_INDEX);
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

pub fn from_json(
    schema: &Arc<Schema>,
    ids: Vec<&str>,
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(get_agent_id_array(ids)?);

    let messages: Arc<dyn Array> = messages.map_or_else(
        || MessageArray::new(agent_count).map(Arc::new),
        |values| MessageArray::from_json(values).map(Arc::new),
    )?;

    RecordBatch::try_new(schema.clone(), vec![ids, messages]).map_err(Error::from)
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
