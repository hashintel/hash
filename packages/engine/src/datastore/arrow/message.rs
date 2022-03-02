use std::sync::Arc;

use lazy_static::lazy_static;

use super::prelude::*;
use crate::{
    datastore::{prelude::*, schema::PresetFieldType},
    hash_types::message::{
        CreateAgent, GenericPayload, Outbound, OutboundCreateAgentPayload,
        OutboundRemoveAgentPayload, OutboundStopSimPayload, RemoveAgent, StopSim,
    },
};

// Built in message types:
// TODO: UNUSED: Needs triage
pub const CREATE_AGENT: &str = OutboundCreateAgentPayload::KIND;
// TODO: UNUSED: Needs triage
pub const REMOVE_AGENT: &str = OutboundRemoveAgentPayload::KIND;
// TODO: UNUSED: Needs triage
pub const STOP_SIM: &str = OutboundStopSimPayload::KIND;

// System-message recipient
// TODO: UNUSED: Needs triage
pub const SYSTEM_MESSAGE: &str = "hash";

pub const MESSAGE_COLUMN_NAME: &str = "messages";

pub const FROM_COLUMN_INDEX: usize = 0;
pub const MESSAGE_COLUMN_INDEX: usize = 1;

pub enum FieldIndex {
    To = 0,
    Type = 1,
    Data = 2,
}

lazy_static! {
    pub static ref SENDER_ARROW_FIELD: ArrowField = ArrowField::new(
        "from",
        PresetFieldType::Id.get_arrow_data_type(),
        false
    );
    pub static ref MESSAGE_ARROW_FIELDS: Vec<ArrowField> = vec![
        ArrowField::new(
            "to",
            ArrowDataType::List(Box::new(ArrowField::new("item", ArrowDataType::Utf8, true))),
            false
        ),
        ArrowField::new("type", ArrowDataType::Utf8, false),
        ArrowField::new("data", ArrowDataType::Utf8, true),
    ];
    pub static ref MESSAGE_ARROW_TYPE: ArrowDataType =
        ArrowDataType::Struct(MESSAGE_ARROW_FIELDS.clone());
    pub static ref MESSAGE_LIST_ARROW_FIELD: ArrowField = ArrowField::new(
        MESSAGE_COLUMN_NAME,
        ArrowDataType::List(Box::new(ArrowField::new("item", MESSAGE_ARROW_TYPE.clone(), true))),
        false
    );
    // It is important to keep this order unchanged. If changed
    // then the consts above must be updated
    pub static ref MESSAGE_BATCH_SCHEMA: ArrowSchema = ArrowSchema::new(vec![
        SENDER_ARROW_FIELD.clone(),
        MESSAGE_LIST_ARROW_FIELD.clone()
    ]);
}

#[must_use]
pub fn get_message_arrow_builder() -> array::ListBuilder<array::StructBuilder> {
    let to_builder = array::StringBuilder::new(64);
    let message_builder = array::StructBuilder::new(MESSAGE_ARROW_FIELDS.clone(), vec![
        Box::new(array::ListBuilder::new(to_builder)),
        Box::new(array::StringBuilder::new(64)),
        Box::new(array::StringBuilder::new(512)),
    ]);
    array::ListBuilder::new(message_builder)
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

pub fn get_generic(to: &[&str], r#type: &str, data_string: &str) -> Result<Outbound> {
    let to_clone = to.iter().map(|v| (*v).to_string()).collect();

    Ok(Outbound::new(GenericPayload {
        to: to_clone,
        r#type: r#type.to_string(),
        data: if data_string.is_empty() {
            None
        } else {
            Some(serde_json::Value::from(data_string))
        },
    }))
}

// TODO: UNUSED: Needs triage
pub fn get_system(to: &[&str], r#type: &str, data_string: &str) -> Result<Outbound> {
    let to_clone = to.iter().map(|v| (*v).to_string()).collect();

    if to.len() != 1 && to[0].to_lowercase() == SYSTEM_MESSAGE {
        return Err(Error::InvalidSystemMessage {
            to: to_clone,
            message_type: r#type.to_string(),
            data: data_string.to_string(),
        });
    }

    match r#type {
        CREATE_AGENT => {
            let message = OutboundCreateAgentPayload {
                r#type: CreateAgent::Type,
                to: vec!["hash".into()],
                data: serde_json::from_str(data_string).map_err(Error::from)?,
            };
            Ok(Outbound::CreateAgent(message))
        }
        REMOVE_AGENT => {
            let message = OutboundRemoveAgentPayload {
                r#type: RemoveAgent::Type,
                to: vec!["hash".into()],
                data: serde_json::from_str(data_string).map_err(Error::from)?,
            };
            Ok(Outbound::RemoveAgent(message))
        }
        STOP_SIM => {
            let message = OutboundStopSimPayload {
                r#type: StopSim::Type,
                to: vec!["hash".into()],
                data: serde_json::from_str(data_string).map_err(Error::from)?,
            };
            Ok(Outbound::StopSim(message))
        }
        _ => Err(Error::InvalidSystemMessage {
            to: to_clone,
            message_type: r#type.to_string(),
            data: data_string.to_string(),
        }),
    }
}

pub fn outbound_messages_to_arrow_column(
    column: &[Vec<Outbound>],
    mut builder: array::ListBuilder<array::StructBuilder>,
) -> Result<array::ListArray> {
    for messages in column {
        let messages_builder = builder.values();
        for message in messages {
            match message {
                Outbound::CreateAgent(outbound) => {
                    let to_builder = messages_builder
                        .field_builder::<array::ListBuilder<array::StringBuilder>>(0)
                        .unwrap();
                    for to in &outbound.to {
                        to_builder.values().append_value(to)?;
                    }
                    to_builder.append(true)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(1)
                        .unwrap()
                        .append_value(OutboundCreateAgentPayload::KIND)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(2)
                        .unwrap()
                        .append_value(
                            &serde_json::to_string(&outbound.data).map_err(Error::from)?,
                        )?;
                    messages_builder.append(true)?;
                }
                Outbound::RemoveAgent(outbound) => {
                    let to_builder = messages_builder
                        .field_builder::<array::ListBuilder<array::StringBuilder>>(0)
                        .unwrap();
                    for to in &outbound.to {
                        to_builder.values().append_value(to)?;
                    }
                    to_builder.append(true)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(1)
                        .unwrap()
                        .append_value(OutboundRemoveAgentPayload::KIND)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(2)
                        .unwrap()
                        .append_value(
                            &serde_json::to_string(&outbound.data).map_err(Error::from)?,
                        )?;
                    messages_builder.append(true)?;
                }
                Outbound::StopSim(outbound) => {
                    let to_builder = messages_builder
                        .field_builder::<array::ListBuilder<array::StringBuilder>>(0)
                        .unwrap();
                    for to in &outbound.to {
                        to_builder.values().append_value(to)?;
                    }
                    to_builder.append(true)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(1)
                        .unwrap()
                        .append_value(OutboundStopSimPayload::KIND)?;
                    if let Some(data) = &outbound.data {
                        messages_builder
                            .field_builder::<array::StringBuilder>(2)
                            .unwrap()
                            .append_value(&data.to_string())?;
                    } else {
                        messages_builder
                            .field_builder::<array::StringBuilder>(2)
                            .unwrap()
                            .append(false)?;
                    }
                    messages_builder.append(true)?;
                }
                Outbound::Generic(outbound) => {
                    let to_builder = messages_builder
                        .field_builder::<array::ListBuilder<array::StringBuilder>>(0)
                        .unwrap();
                    for to in &outbound.to {
                        to_builder.values().append_value(to)?;
                    }
                    to_builder.append(true)?;
                    messages_builder
                        .field_builder::<array::StringBuilder>(1)
                        .unwrap()
                        .append_value(&outbound.r#type)?;
                    if let Some(data) = &outbound.data {
                        messages_builder
                            .field_builder::<array::StringBuilder>(2)
                            .unwrap()
                            .append_value(&data.to_string())?;
                    } else {
                        messages_builder
                            .field_builder::<array::StringBuilder>(2)
                            .unwrap()
                            .append(false)?;
                    }

                    messages_builder.append(true)?;
                }
            }
        }
        builder.append(true)?;
    }

    Ok(builder.finish())
}

pub fn empty_messages_column(len: usize) -> Result<array::ListArray> {
    let mut builder = get_message_arrow_builder();
    (0..len).try_for_each(|_| builder.append(true))?;
    Ok(builder.finish())
}

pub fn messages_column_from_serde_values(
    values: Vec<serde_json::Value>,
) -> Result<array::ListArray> {
    let builder = get_message_arrow_builder();
    let native_column: Vec<Vec<Outbound>> = values
        .into_iter()
        .map(|value| serde_json::from_value(value).map_err(Error::from))
        .collect::<Result<_>>()?;
    outbound_messages_to_arrow_column(&native_column, builder)
}

pub fn get_column_from_list_array(array: &array::ListArray) -> Result<Vec<Vec<Outbound>>> {
    let mut result = Vec::with_capacity(array.len());
    let vals = array.values();
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

    for i in 0..array.len() {
        let messages_len = array.value_length(i) as usize;
        let mut messages: Vec<Outbound> = Vec::with_capacity(messages_len);
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

pub fn column_into_state(
    states: &mut [AgentState],
    batch: &RecordBatch,
    index: usize,
) -> Result<()> {
    let reference = batch
        .column(index)
        .as_any()
        .downcast_ref::<array::ListArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: MESSAGE_COLUMN_NAME.into(),
        })?;

    let column = get_column_from_list_array(reference)?;
    column
        .into_iter()
        .enumerate()
        .try_for_each(|(i, v)| states[i].set(MESSAGE_COLUMN_NAME, v))?;
    Ok(())
}

// TODO: UNUSED: Needs triage
pub fn get_messages_column_from_batch(batch: &RecordBatch) -> Result<Vec<Vec<Outbound>>> {
    let (index, _) = batch
        .schema()
        .column_with_name(MESSAGE_COLUMN_NAME)
        .ok_or_else(|| Error::ColumnNotFound(MESSAGE_COLUMN_NAME.into()))?;

    let reference = batch
        .column(index)
        .as_any()
        .downcast_ref::<array::ListArray>()
        .ok_or_else(|| Error::InvalidArrowDowncast {
            name: MESSAGE_COLUMN_NAME.into(),
        })?;

    get_column_from_list_array(reference)
}

pub fn batch_from_json(
    schema: &Arc<ArrowSchema>,
    ids: Vec<&str>,
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(super::batch_conversion::get_agent_id_array(ids)?);

    let messages: Arc<dyn ArrowArray> = messages.map_or_else(
        || empty_messages_column(agent_count).map(Arc::new),
        |values| messages_column_from_serde_values(values).map(Arc::new),
    )?;

    RecordBatch::try_new(schema.clone(), vec![ids, messages]).map_err(Error::from)
}
