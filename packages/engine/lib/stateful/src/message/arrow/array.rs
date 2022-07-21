//! Module for converting the Arrow representation of [`Message`]

use arrow::array::{Array, ListArray, MutableListArray, MutableUtf8Array, TryPush};
use memory::arrow::record_batch::RecordBatch;

use super::MESSAGE_LIST_ARROW_FIELD;
use crate::{
    message::{arrow::MESSAGE_COLUMN_NAME, payload, Message},
    Error, Result,
};

/// The indices for each field in the [`RecordBatch`] which stores the messages.
pub enum FieldIndex {
    To = 0,
    Type = 1,
    Data = 2,
}

/// The "from" column contains the identifiers
/// ([UUID's](https://en.wikipedia.org/wiki/Universally_unique_identifier)) of the agents who sent
/// each message.
pub const FROM_COLUMN_INDEX: usize = 0;
/// The "message" column contains the actual data.
pub const MESSAGE_COLUMN_INDEX: usize = 1;

#[derive(Debug)]
#[repr(transparent)]
/// note: this struct is `#[repr(transparent)]`, as this is required for us to be able to
/// convert `&ListArray` to `&OutboundArray`
///
/// The structure of the `MessageArray` is
/// ```ignore
/// ListArray(
///   StructArray (to: ListArray(Utf8), type: Utf8, data: Utf8)
/// )
/// ```
pub(crate) struct MessageArray(pub ListArray<i32>);

impl Array for MessageArray {
    fn as_any(&self) -> &dyn std::any::Any {
        self.0.as_any()
    }

    fn len(&self) -> usize {
        self.0.len()
    }

    fn data_type(&self) -> &arrow::datatypes::DataType {
        self.0.data_type()
    }

    fn validity(&self) -> Option<&arrow::bitmap::Bitmap> {
        self.0.validity()
    }

    fn slice(&self, offset: usize, length: usize) -> Box<dyn Array> {
        Array::slice(&self.0, offset, length)
    }

    unsafe fn slice_unchecked(&self, offset: usize, length: usize) -> Box<dyn Array> {
        Array::slice_unchecked(&self.0, offset, length)
    }

    fn with_validity(&self, validity: Option<arrow::bitmap::Bitmap>) -> Box<dyn Array> {
        Array::with_validity(&self.0, validity)
    }

    fn to_boxed(&self) -> Box<dyn Array> {
        Array::to_boxed(&self.0)
    }
}

impl MessageArray {
    /// Creates a new (empty) [`MessageArray`].
    pub fn new(len: usize) -> Result<Self> {
        Ok(Self(ListArray::new_null(
            MESSAGE_LIST_ARROW_FIELD.data_type().clone(),
            len,
        )))
    }

    pub fn from_record_batch(batch: &RecordBatch) -> Result<&Self> {
        let list = batch
            .column(MESSAGE_COLUMN_INDEX)
            .as_any()
            .downcast_ref::<ListArray<i32>>()
            .ok_or(Error::InvalidArrowDowncast {
                name: MESSAGE_COLUMN_NAME.into(),
            })?;
        // SAFETY: `OutboundArray` is marked as `#[repr(transparent)]`
        Ok(unsafe { &*(list as *const ListArray<i32> as *const Self) })
    }

    pub fn from_json(column: Vec<serde_json::Value>) -> Result<Self> {
        let mut to_builder: MutableListArray<i32, MutableUtf8Array<i32>> = MutableListArray::new();
        let mut type_builder: MutableUtf8Array<i32> = MutableUtf8Array::new();
        let mut data_builder: MutableUtf8Array<i32> = MutableUtf8Array::new();

        for messages in column {
            for message in serde_json::from_value::<Vec<Message>>(messages)? {
                let (recipients, kind, data) = match &message {
                    Message::CreateAgent(outbound) => (
                        &outbound.to,
                        payload::CreateAgent::KIND,
                        Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
                    ),
                    Message::RemoveAgent(outbound) => (
                        &outbound.to,
                        payload::RemoveAgent::KIND,
                        Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
                    ),
                    Message::StopSim(outbound) => (
                        &outbound.to,
                        payload::StopSim::KIND,
                        outbound.data.as_ref().map(|data| data.to_string()),
                    ),
                    Message::Generic(outbound) => (
                        &outbound.to,
                        outbound.r#type.as_str(),
                        outbound.data.as_ref().map(|data| data.to_string()),
                    ),
                };
                to_builder.try_push(Some(recipients.into_iter().map(Some)))?;
                type_builder.try_push(Some(kind))?;
                data_builder.try_push(data)?;
            }
        }

        todo!()
    }
}
