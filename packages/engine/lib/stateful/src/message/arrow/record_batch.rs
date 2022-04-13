use std::sync::Arc;

use arrow::{array::Array, datatypes::Schema, record_batch::RecordBatch};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use crate::{
    agent::arrow::array::get_agent_id_array,
    message::arrow::array::{FieldIndex, MessageArray, MESSAGE_COLUMN_INDEX},
    state::MessageReference,
    Error, Result,
};

pub(in crate) fn message_usize_index_iter(
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

pub(in crate) fn message_recipients_iter(
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

pub(crate) fn get_message_field(
    record_batch: &RecordBatch,
    index: FieldIndex,
) -> (Vec<&[i32]>, &str) {
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
    schema: Arc<Schema>,
    ids: Vec<&str>,
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(get_agent_id_array(ids)?);

    let messages: Arc<dyn Array> = messages.map_or_else(
        || MessageArray::new(agent_count).map(Arc::new),
        |values| MessageArray::from_json(values).map(Arc::new),
    )?;

    RecordBatch::try_new(schema, vec![ids, messages]).map_err(Error::from)
}
