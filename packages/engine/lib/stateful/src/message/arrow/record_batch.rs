use std::sync::Arc;

use arrow2::{
    array::{Array, ListArray, StructArray, Utf8Array},
    chunk::Chunk,
    datatypes::Schema,
};
use memory::arrow::record_batch::RecordBatch;
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use crate::{
    agent::{arrow::array::get_agent_id_array, AgentId},
    message::arrow::array::{FieldIndex, MessageArray, MESSAGE_COLUMN_INDEX},
    state::MessageReference,
    Result,
};

pub(crate) fn message_usize_index_iter(
    record_batch: &RecordBatch,
    batch_index: usize,
) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = MessageReference>> + '_ {
    let num_agents = record_batch.num_rows();
    let column = record_batch.column(MESSAGE_COLUMN_INDEX);
    // This is the offset buffer for message objects.
    // offset_buffers[1] - offset_buffers[0] = number of messages from the 1st agent

    // todo (arrow2): is listarray the right type to downcast to?
    let offsets = &column
        .as_any()
        .downcast_ref::<ListArray<i32>>()
        .unwrap()
        .offsets();
    // Markers are stored in i32 in the Arrow format
    // There are n + 1 offsets always in Offset buffers in the Arrow format
    let i32_offsets = offsets.as_slice();
    (0..num_agents).into_par_iter().map(move |i_agent| {
        let num_messages = i32_offsets[i_agent + 1] - i32_offsets[i_agent];
        (0..num_messages)
            .into_par_iter()
            .map(move |i_msg| MessageReference::new(batch_index, i_agent, i_msg as usize))
    })
}

pub(crate) fn message_recipients_iter(
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

/// This function gets a message field.
///
/// todo: DOC
pub(crate) fn get_message_field(
    record_batch: &RecordBatch,
    index: FieldIndex,
) -> (Vec<&[i32]>, &str) {
    // The "to" field is the 0th field in MESSAGE_ARROW_FIELDS
    // The "type" field is the 1st field in MESSAGE_ARROW_FIELDS
    // The "data" field is the 2nd field in MESSAGE_ARROW_FIELDS
    let is_nested_list = matches!(index, FieldIndex::To);
    let index_usize = index as usize;

    let mut buffers = vec![];

    let column = &record_batch.column(MESSAGE_COLUMN_INDEX);

    let list_of_fields: &ListArray<i32> = column.as_any().downcast_ref::<ListArray<i32>>().unwrap();

    buffers.push(list_of_fields.offsets().as_slice());

    let struct_level: &StructArray = list_of_fields
        .values()
        .as_any()
        .downcast_ref::<StructArray>()
        .unwrap();

    // This is in the format of List<String> or String
    let field_field_node = if is_nested_list {
        let list_field_node = struct_level.values()[index_usize]
            .as_any()
            .downcast_ref::<ListArray<i32>>()
            .unwrap();

        buffers.push(list_field_node.offsets().as_slice());

        // List<String>
        list_field_node.values()
    } else {
        // String
        &struct_level.values()[index_usize]
    };

    let field_field_node = field_field_node
        .as_any()
        .downcast_ref::<Utf8Array<i32>>()
        .unwrap();

    let field_offsets = &field_field_node.offsets().as_slice();
    buffers.push(field_offsets);

    let field_data = field_field_node.values().as_slice();
    let field = std::str::from_utf8(field_data).unwrap();
    (buffers, field)
}

pub fn from_json(
    schema: Arc<Schema>,
    ids: &[AgentId],
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = get_agent_id_array(ids)?;

    let messages: Box<dyn Array> = messages.map_or_else(
        || Ok(Box::new(MessageArray::new(agent_count))),
        |values| MessageArray::from_json(values).map(Box::new),
    )?;

    Ok(RecordBatch::new(
        schema,
        Chunk::new(vec![ids.boxed(), messages]),
    ))
}
