use arrow2::array::Utf8Array;

use super::arrow::{array::FieldIndex, record_batch::MessageField};
use crate::{
    field::UUID_V4_LEN,
    message::{
        arrow::{array::FROM_COLUMN_INDEX, record_batch::get_message_field},
        MessageBatch,
    },
    Result,
};

/// A record only containing the origin and the data of a message.
#[derive(Debug)]
pub struct RawMessage<'a> {
    pub from: &'a [u8; UUID_V4_LEN],
    pub data: &'a str,
}

/// Loads messages from a [`MessageBatch`].
pub struct MessageLoader<'a> {
    from: &'a [u8],

    // todo: do we need this field?
    // to: MessageField,
    typ: MessageField,
    data: MessageField,
}

impl<'a> MessageLoader<'a> {
    pub fn from_batch(message_batch: &'a MessageBatch) -> Result<Self> {
        let record_batch = message_batch.batch.record_batch()?;
        let column = record_batch.column(FROM_COLUMN_INDEX);
        let data = column.as_any().downcast_ref::<Utf8Array<i32>>().unwrap();
        let from = data.values().as_slice();

        // let to = get_message_field(record_batch, FieldIndex::To);
        let typ = get_message_field(record_batch, FieldIndex::Type);
        let data = get_message_field(record_batch, FieldIndex::Data);

        Ok(Self {
            from,
            // to,
            typ,
            data,
        })
    }

    pub(crate) fn get_from(&self, agent_index: usize) -> &'a [u8; UUID_V4_LEN] {
        let content_start = agent_index * UUID_V4_LEN;
        unsafe {
            let ptr = &self.from[content_start] as *const u8;
            &*(ptr as *const [u8; UUID_V4_LEN])
        }
    }

    pub(crate) fn get_type(&self, agent_index: usize, message_index: usize) -> &str {
        let list_index = self.typ.list_of_fields.offsets()[agent_index] as usize + message_index;
        let type_start = self.typ.field.offsets()[list_index] as usize;
        let next_type_start = self.typ.field.offsets()[list_index + 1] as usize;
        std::str::from_utf8(&self.typ.field.values().as_slice()[type_start..next_type_start])
            .unwrap()
    }

    pub(crate) fn get_data(&self, agent_index: usize, message_index: usize) -> &str {
        let list_index = self.data.list_of_fields.offsets()[agent_index] as usize + message_index;
        let content_start = self.data.field.offsets()[list_index] as usize;
        let next_content_start = self.data.field.offsets()[list_index + 1] as usize;
        std::str::from_utf8(&self.data.field.values()[content_start..next_content_start]).unwrap()
    }

    pub fn get_raw_message(&'a self, agent_index: usize, message_index: usize) -> RawMessage<'a> {
        RawMessage {
            from: self.get_from(agent_index),
            data: self.get_data(agent_index, message_index),
        }
    }
}
