use std::any::Any;

use arrow::{
    array::{
        Array, ArrayBuilder, ArrayData, ArrayRef, JsonEqual, ListArray, ListBuilder, StringBuilder,
        StructBuilder,
    },
    record_batch::RecordBatch,
};

use crate::{
    message::{
        arrow::{column::MessageColumn, MESSAGE_ARROW_FIELDS, MESSAGE_COLUMN_NAME},
        payload, Message,
    },
    Error, Result,
};

pub enum FieldIndex {
    To = 0,
    Type = 1,
    Data = 2,
}

pub const FROM_COLUMN_INDEX: usize = 0;
pub const MESSAGE_COLUMN_INDEX: usize = 1;

struct MessageBuilder(StructBuilder);

impl MessageBuilder {
    fn new() -> Self {
        Self(StructBuilder::new(MESSAGE_ARROW_FIELDS.clone(), vec![
            Box::new(ListBuilder::new(StringBuilder::new(64))),
            Box::new(StringBuilder::new(64)),
            Box::new(StringBuilder::new(512)),
        ]))
    }

    fn new_list(capacity: usize) -> ListBuilder<Self> {
        ListBuilder::with_capacity(MessageBuilder::new(), capacity)
    }

    fn append(&mut self, message: &Message) -> Result<()> {
        let (recipients, kind, data) = match message {
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

        let to_builder = self
            .0
            .field_builder::<ListBuilder<StringBuilder>>(FieldIndex::To as usize)
            .unwrap();
        for to in recipients {
            to_builder.values().append_value(to)?;
        }
        to_builder.append(true)?;

        self.0
            .field_builder::<StringBuilder>(FieldIndex::Type as usize)
            .unwrap()
            .append_value(kind)?;

        if let Some(data) = data {
            self.0
                .field_builder::<StringBuilder>(FieldIndex::Data as usize)
                .unwrap()
                .append_value(&data)?;
        } else {
            self.0
                .field_builder::<StringBuilder>(FieldIndex::Data as usize)
                .unwrap()
                .append(false)?;
        }

        self.0.append(true)?;
        Ok(())
    }
}

impl ArrayBuilder for MessageBuilder {
    fn len(&self) -> usize {
        self.0.len()
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn finish(&mut self) -> ArrayRef {
        ArrayBuilder::finish(&mut self.0)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }

    fn into_box_any(self: Box<Self>) -> Box<dyn Any> {
        self
    }
}

#[derive(Debug)]
#[repr(transparent)] // Required for `&ListArray -> &OutboundArray`
pub struct MessageArray(pub ListArray);

impl MessageArray {
    pub fn new(len: usize) -> Result<Self> {
        let mut builder = MessageBuilder::new_list(len);
        for _ in 0..len {
            builder.append(true)?;
        }
        Ok(Self(builder.finish()))
    }

    pub fn from_record_batch(batch: &RecordBatch) -> Result<&Self> {
        let list = batch
            .column(MESSAGE_COLUMN_INDEX)
            .as_any()
            .downcast_ref::<ListArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: MESSAGE_COLUMN_NAME.into(),
            })?;
        // SAFETY: `OutboundArray` is marked as `#[repr(transparent)]`
        Ok(unsafe { &*(list as *const ListArray as *const Self) })
    }

    pub fn from_column(column: &MessageColumn) -> Result<Self> {
        let mut builder = MessageBuilder::new_list(column.0.len());
        for messages in &column.0 {
            let messages_builder = builder.values();
            for message in messages {
                messages_builder.append(message)?;
            }
            builder.append(true)?;
        }
        Ok(Self(builder.finish()))
    }

    pub fn from_json(column: Vec<serde_json::Value>) -> Result<Self> {
        let mut builder = MessageBuilder::new_list(column.len());
        for messages in column {
            let messages_builder = builder.values();
            for message in serde_json::from_value::<Vec<_>>(messages)? {
                messages_builder.append(&message)?;
            }
            builder.append(true)?;
        }
        Ok(Self(builder.finish()))
    }
}

impl JsonEqual for MessageArray {
    fn equals_json(&self, json: &[&serde_json::Value]) -> bool {
        self.0.equals_json(json)
    }
}

impl Array for MessageArray {
    fn as_any(&self) -> &dyn Any {
        &self.0
    }

    fn data(&self) -> &ArrayData {
        self.0.data()
    }
}
