use std::sync::Arc;

use arrow2::{
    array::{Array, ListArray, StructArray, Utf8Array},
    chunk::Chunk,
    datatypes::{DataType, Field, Schema},
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
    record_batch: &'_ RecordBatch,
) -> impl IndexedParallelIterator<Item = impl ParallelIterator<Item = Vec<String>> + '_> + '_ {
    let num_agents = record_batch.num_rows();

    (0..num_agents).into_par_iter().map(move |j| {
        let message_fields = get_message_field(record_batch, FieldIndex::To);

        let (list_of_fields, list_of_strings, message_fields) = (
            message_fields.list_of_fields,
            message_fields
                .list_of_strings
                .expect("the to field should always contain a list of strings"),
            message_fields.field,
        );

        let row_index = list_of_fields.offsets()[j] as usize;
        let next_row_index = list_of_fields.offsets()[j + 1] as usize;
        let num_messages = next_row_index - row_index;

        let to_list_indices = list_of_strings.offsets()[row_index..=next_row_index].to_vec();

        (0..num_messages).into_par_iter().map(move |k| {
            let to_list_index = to_list_indices[k] as usize;
            let next_to_list_index = to_list_indices[k + 1] as usize;

            let recipient_count = next_to_list_index - to_list_index;

            let recipient_indices = &list_of_strings.offsets()[to_list_index..=next_to_list_index];

            let mut recipients: Vec<String> = Vec::with_capacity(recipient_count);
            for l in 0..recipient_count {
                let recipient_index = recipient_indices[l] as usize;
                let next_recipient_index = recipient_indices[l + 1] as usize;
                let recipient_value = &std::str::from_utf8(message_fields.values()).unwrap()
                    [recipient_index..next_recipient_index];
                recipients.push(recipient_value.to_string());
            }

            recipients
        })
    })
}

pub struct MessageField {
    pub(crate) list_of_fields: ListArray<i32>,
    pub(crate) list_of_strings: Option<ListArray<i32>>,
    pub(crate) field: Utf8Array<i32>,
}

/// This function gets a message field. The message data's structure is
///
/// ```ignore
/// ListArray(StructArray {to: ListArray(Utf8Array), type: Utf8Array, data: Utf8Array})
/// ```
pub(crate) fn get_message_field(record_batch: &RecordBatch, index: FieldIndex) -> MessageField {
    // The "to" field is the 0th field in MESSAGE_ARROW_FIELDS
    // The "type" field is the 1st field in MESSAGE_ARROW_FIELDS
    // The "data" field is the 2nd field in MESSAGE_ARROW_FIELDS
    let is_nested_list = matches!(index, FieldIndex::To);
    let index_usize = index as usize;

    let list_of_fields: ListArray<i32> = record_batch
        .column(MESSAGE_COLUMN_INDEX)
        .as_any()
        .downcast_ref::<ListArray<i32>>()
        .unwrap()
        .clone();

    let struct_level: StructArray = list_of_fields
        .value(0)
        .as_any()
        .downcast_ref::<StructArray>()
        .unwrap()
        .clone();

    // This is in the format of List<String> or String
    let list_of_strings;

    let field_field_node = if is_nested_list {
        let list_field_node = struct_level.values()[index_usize]
            .as_any()
            .downcast_ref::<ListArray<i32>>()
            .unwrap();

        debug_assert_eq!(
            list_field_node.data_type(),
            &DataType::List(Box::new(Field::new("item", DataType::Utf8, true)))
        );

        list_of_strings = Some(list_field_node.clone());

        // List<String>
        list_field_node.values()
    } else {
        list_of_strings = None;
        // String
        &struct_level.values()[index_usize]
    };

    let field = field_field_node
        .as_any()
        .downcast_ref::<Utf8Array<i32>>()
        .unwrap()
        .clone();

    MessageField {
        list_of_fields,
        list_of_strings,
        field,
    }
}

pub fn from_json(
    schema: Arc<Schema>,
    ids: &[AgentId],
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(get_agent_id_array(ids)?);

    let messages: Arc<dyn Array> = messages.map_or_else(
        || Ok(Arc::new(MessageArray::new(agent_count))),
        |values| MessageArray::from_json(values).map(Arc::new),
    )?;

    Ok(RecordBatch::new(schema, Chunk::new(vec![ids, messages])))
}
