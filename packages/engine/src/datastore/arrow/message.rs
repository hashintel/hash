use std::{any::Any, sync::Arc};

use arrow::{
    array::{self, Array, ArrayBuilder, ArrayData, ArrayRef, JsonEqual},
    datatypes::Schema,
    record_batch::RecordBatch,
};
use serde_json::Value;
use stateful::{
    agent::Agent,
    message::{self, Outbound, MESSAGE_ARROW_FIELDS, MESSAGE_COLUMN_NAME},
};

use crate::datastore::error::{Error, Result};

pub const FROM_COLUMN_INDEX: usize = 0;
pub const MESSAGE_COLUMN_INDEX: usize = 1;

pub enum FieldIndex {
    To = 0,
    Type = 1,
    Data = 2,
}

fn get_columns_from_struct_array(
    array: &array::StructArray,
) -> Result<(&array::ListArray, &array::StringArray, &array::StringArray)> {
    let columns = array.columns();
    if columns.len() != 3 {
        return Err(Error::UnexpectedVectorLength {
            len: columns.len(),
            expected: 3,
        });
    }
    let to_column = columns[0]
        .as_any()
        .downcast_ref::<array::ListArray>()
        .ok_or(Error::InvalidArrowDowncast { name: "to".into() })?;
    let type_column = columns[1]
        .as_any()
        .downcast_ref::<array::StringArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "type".into(),
        })?;
    let data_column = columns[2]
        .as_any()
        .downcast_ref::<array::StringArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "data".into(),
        })?;
    Ok((to_column, type_column, data_column))
}

pub fn get_generic(to: &[&str], r#type: &str, data_string: &str) -> Result<message::Outbound> {
    let to_clone = to.iter().map(|v| (*v).to_string()).collect();

    Ok(message::Outbound::new(message::payload::Generic {
        to: to_clone,
        r#type: r#type.to_string(),
        data: if data_string.is_empty() {
            None
        } else {
            Some(serde_json::Value::from(data_string))
        },
    }))
}

struct OutboundBuilder(array::StructBuilder);

impl OutboundBuilder {
    fn new() -> Self {
        Self(array::StructBuilder::new(
            MESSAGE_ARROW_FIELDS.clone(),
            vec![
                Box::new(array::ListBuilder::new(array::StringBuilder::new(64))),
                Box::new(array::StringBuilder::new(64)),
                Box::new(array::StringBuilder::new(512)),
            ],
        ))
    }

    fn new_list(capacity: usize) -> array::ListBuilder<Self> {
        array::ListBuilder::with_capacity(OutboundBuilder::new(), capacity)
    }

    fn append(&mut self, message: &Outbound) -> Result<()> {
        let (recipients, kind, data) = match message {
            message::Outbound::CreateAgent(outbound) => (
                &outbound.to,
                message::payload::OutboundCreateAgent::KIND,
                Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
            ),
            message::Outbound::RemoveAgent(outbound) => (
                &outbound.to,
                message::payload::OutboundRemoveAgent::KIND,
                Some(serde_json::to_string(&outbound.data).map_err(Error::from)?),
            ),
            message::Outbound::StopSim(outbound) => (
                &outbound.to,
                message::payload::OutboundStopSim::KIND,
                outbound.data.as_ref().map(|data| data.to_string()),
            ),
            message::Outbound::Generic(outbound) => (
                &outbound.to,
                outbound.r#type.as_str(),
                outbound.data.as_ref().map(|data| data.to_string()),
            ),
        };

        let to_builder = self
            .0
            .field_builder::<array::ListBuilder<array::StringBuilder>>(FieldIndex::To as usize)
            .unwrap();
        for to in recipients {
            to_builder.values().append_value(to)?;
        }
        to_builder.append(true)?;

        self.0
            .field_builder::<array::StringBuilder>(FieldIndex::Type as usize)
            .unwrap()
            .append_value(kind)?;

        if let Some(data) = data {
            self.0
                .field_builder::<array::StringBuilder>(FieldIndex::Data as usize)
                .unwrap()
                .append_value(&data)?;
        } else {
            self.0
                .field_builder::<array::StringBuilder>(FieldIndex::Data as usize)
                .unwrap()
                .append(false)?;
        }

        self.0.append(true)?;
        Ok(())
    }
}

impl ArrayBuilder for OutboundBuilder {
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
pub struct OutboundArray(array::ListArray);

impl OutboundArray {
    pub fn new(len: usize) -> Result<Self> {
        let mut builder = OutboundBuilder::new_list(len);
        for _ in 0..len {
            builder.append(true)?;
        }
        Ok(Self(builder.finish()))
    }

    pub fn from_array(array: &dyn Array) -> Result<&Self> {
        let list = array.as_any().downcast_ref::<array::ListArray>().ok_or(
            Error::InvalidArrowDowncast {
                name: MESSAGE_COLUMN_NAME.into(),
            },
        )?;
        // SAFETY: `OutboundArray` is marked as `#[repr(transparent)]`
        Ok(unsafe { &*(list as *const array::ListArray as *const Self) })
    }

    pub fn from_column(column: &[Vec<Outbound>]) -> Result<Self> {
        let mut builder = OutboundBuilder::new_list(column.len());
        for messages in column {
            let messages_builder = builder.values();
            for message in messages {
                messages_builder.append(message)?;
            }
            builder.append(true)?;
        }
        Ok(Self(builder.finish()))
    }

    pub fn from_json(column: Vec<serde_json::Value>) -> Result<Self> {
        let mut builder = OutboundBuilder::new_list(column.len());
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

impl JsonEqual for OutboundArray {
    fn equals_json(&self, json: &[&Value]) -> bool {
        self.0.equals_json(json)
    }
}

impl Array for OutboundArray {
    fn as_any(&self) -> &dyn Any {
        &self.0
    }

    fn data(&self) -> &ArrayData {
        self.0.data()
    }
}

pub fn get_column_from_list_array(array: &OutboundArray) -> Result<Vec<Vec<message::Outbound>>> {
    let mut result = Vec::with_capacity(array.0.len());
    let vals = array.0.values();
    let vals = vals
        .as_any()
        .downcast_ref()
        .ok_or(Error::InvalidArrowDowncast {
            name: MESSAGE_COLUMN_NAME.into(),
        })?;

    let (to_column, r#type_column, data_column) = get_columns_from_struct_array(vals)?;
    let _to_values = to_column.values();
    let to_values = _to_values
        .as_any()
        .downcast_ref::<array::StringArray>()
        .ok_or(Error::InvalidArrowDowncast { name: "to".into() })?;

    let mut offset = 0;
    let mut to_offset = 0;

    for i in 0..array.0.len() {
        let messages_len = array.0.value_length(i) as usize;
        let mut messages: Vec<message::Outbound> = Vec::with_capacity(messages_len);
        for j in 0..messages_len {
            let to_len = to_column.value_length(offset + j) as usize;
            let to: Vec<&str> = (0..to_len)
                .map(|j| to_values.value(to_offset + j))
                .collect();
            let r#type = r#type_column.value(offset + j);
            let data_string = data_column.value(offset + j);
            messages.push(get_generic(&to, r#type, data_string)?);
            to_offset += to_len;
        }
        result.push(messages);
        offset += messages_len;
    }
    Ok(result)
}

pub fn column_into_state(states: &mut [Agent], batch: &RecordBatch) -> Result<()> {
    let array = OutboundArray::from_array(batch.column(MESSAGE_COLUMN_INDEX))?;

    get_column_from_list_array(array)?
        .into_iter()
        .enumerate()
        .try_for_each(|(i, v)| states[i].set(MESSAGE_COLUMN_NAME, v))?;
    Ok(())
}

pub fn batch_from_json(
    schema: &Arc<Schema>,
    ids: Vec<&str>,
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(super::batch_conversion::get_agent_id_array(ids)?);

    let messages: Arc<dyn Array> = messages.map_or_else(
        || OutboundArray::new(agent_count).map(Arc::new),
        |values| OutboundArray::from_json(values).map(Arc::new),
    )?;

    RecordBatch::try_new(schema.clone(), vec![ids, messages]).map_err(Error::from)
}
