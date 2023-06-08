//! Module for converting the Arrow representation of [`Message`]

use arrow2::{
    array::{Array, ListArray},
    datatypes::DataType,
};
use arrow2_convert::{serialize::TryIntoArrow, ArrowField};
use memory::arrow::record_batch::RecordBatch;
use tracing::trace;

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

#[derive(Debug, Eq, PartialEq, ArrowField)]
pub struct AgentMessage {
    to: Vec<Option<String>>,
    r#type: String,
    r#data: Option<String>,
}

#[derive(Debug, Clone)]
#[repr(transparent)]
/// note: this struct is `#[repr(transparent)]`, as this is required for us to be able to
/// convert `&ListArray` to `&OutboundArray`
///
/// The structure of the `MessageArray` is
/// ```ignore
/// ListArray ( StructArray (to: ListArray(Utf8), type: Utf8, data: Utf8) )
/// ```
pub(crate) struct MessageArray(pub ListArray<i32>);

impl Array for MessageArray {
    fn as_any(&self) -> &dyn std::any::Any {
        self.0.as_any()
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        Array::as_any_mut(&mut self.0)
    }

    fn len(&self) -> usize {
        self.0.len()
    }

    fn data_type(&self) -> &arrow2::datatypes::DataType {
        self.0.data_type()
    }

    fn validity(&self) -> Option<&arrow2::bitmap::Bitmap> {
        self.0.validity()
    }

    fn slice(&self, offset: usize, length: usize) -> Box<dyn Array> {
        Array::slice(&self.0, offset, length)
    }

    unsafe fn slice_unchecked(&self, offset: usize, length: usize) -> Box<dyn Array> {
        Array::slice_unchecked(&self.0, offset, length)
    }

    fn with_validity(&self, validity: Option<arrow2::bitmap::Bitmap>) -> Box<dyn Array> {
        Array::with_validity(&self.0, validity)
    }

    fn to_boxed(&self) -> Box<dyn Array> {
        Array::to_boxed(&self.0)
    }
}

impl MessageArray {
    /// Creates a new (empty) [`MessageArray`].
    pub fn new(len: usize) -> Self {
        let ret = Self(ListArray::new_null(
            MESSAGE_LIST_ARROW_FIELD.data_type.clone(),
            len,
        ));
        debug_assert_eq!(ret.len(), len);
        ret
    }

    pub fn from_record_batch(batch: &RecordBatch) -> Result<Self> {
        trace!("loading MessageArray from RecordBatch");
        let list = batch
            .column(MESSAGE_COLUMN_INDEX)
            .as_any()
            .downcast_ref::<ListArray<i32>>()
            .ok_or(Error::InvalidArrowDowncast {
                name: MESSAGE_COLUMN_NAME.into(),
            })?;
        Ok(Self(list.clone()))
    }

    pub fn from_json(column: Vec<serde_json::Value>) -> Result<Self> {
        trace!("loading MessageArray from JSON");
        let mut result = Vec::with_capacity(column.len());

        for messages in column {
            let mut message_set = Vec::new();
            for message in serde_json::from_value::<Vec<Message>>(messages)? {
                let (recipients, kind, data) = match message {
                    Message::CreateAgent(outbound) => (
                        outbound.to,
                        payload::CreateAgent::KIND.to_string(),
                        Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
                    ),
                    Message::RemoveAgent(outbound) => (
                        outbound.to,
                        payload::RemoveAgent::KIND.to_string(),
                        Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
                    ),
                    Message::StopSim(outbound) => (
                        outbound.to,
                        payload::StopSim::KIND.to_string(),
                        outbound.data.as_ref().map(|data| data.to_string()),
                    ),
                    Message::Generic(outbound) => (
                        outbound.to,
                        outbound.r#type,
                        outbound.data.as_ref().map(|data| data.to_string()),
                    ),
                };

                message_set.push(Some(AgentMessage {
                    to: recipients.into_iter().map(Some).collect(),
                    r#type: kind,
                    data,
                }))
            }
            result.push(message_set)
        }

        let arrow: Box<dyn Array> = result.try_into_arrow().unwrap();
        let list_array = arrow
            .as_any()
            .downcast_ref::<ListArray<i32>>()
            .unwrap()
            .clone();
        debug_assert!(if let DataType::List(field) = list_array.data_type() {
            field.is_nullable
        } else {
            unreachable!()
        });
        Ok(Self(list_array))
    }
}
