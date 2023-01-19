use arrow2::array::FixedSizeBinaryArray;

use super::arrow::array::FieldIndex;
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
    to_bufs: Vec<&'a [i32]>,
    to: &'a str,
    typ_bufs: Vec<&'a [i32]>,
    typ: &'a str,
    data_bufs: Vec<&'a [i32]>,
    data: &'a str,
}

impl<'a> MessageLoader<'a> {
    pub fn from_batch(message_batch: &'a MessageBatch) -> Result<Self> {
        let record_batch = message_batch.batch.record_batch()?;

        let column = record_batch
            .column(FROM_COLUMN_INDEX)
            .as_any()
            .downcast_ref::<FixedSizeBinaryArray>()
            .unwrap();
        let from = column.values().as_slice();

        let (to_bufs, to) = get_message_field(record_batch, FieldIndex::To);
        debug_assert_eq!(to_bufs.len(), 3);
        let (typ_bufs, typ) = get_message_field(record_batch, FieldIndex::Type);
        debug_assert_eq!(typ_bufs.len(), 2);
        let (data_bufs, data) = get_message_field(record_batch, FieldIndex::Data);
        debug_assert_eq!(data_bufs.len(), 2);

        Ok(Self {
            from,
            to_bufs,
            to,
            typ_bufs,
            typ,
            data_bufs,
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
        let list_index = self.typ_bufs[0][agent_index] as usize + message_index;
        let type_start = self.typ_bufs[1][list_index] as usize;
        let next_type_start = self.typ_bufs[1][list_index + 1] as usize;
        &self.typ[type_start..next_type_start]
    }

    pub(crate) fn get_data(&self, agent_index: usize, message_index: usize) -> &str {
        let list_index = self.data_bufs[0][agent_index] as usize + message_index;
        let content_start = self.data_bufs[1][list_index] as usize;
        let next_content_start = self.data_bufs[1][list_index + 1] as usize;
        &self.data[content_start..next_content_start]
    }

    #[allow(dead_code)]
    pub(crate) fn get_recipients(&self, agent_index: usize, message_index: usize) -> Vec<&'a str> {
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

    pub fn get_raw_message(&'a self, agent_index: usize, message_index: usize) -> RawMessage<'a> {
        RawMessage {
            from: self.get_from(agent_index),
            data: self.get_data(agent_index, message_index),
        }
    }
}
