use arrow2::array::{ListArray, StructArray, Utf8Array};
use memory::arrow::record_batch::RecordBatch;

use crate::{
    agent::Agent,
    message::{
        arrow::{array::MessageArray, MESSAGE_COLUMN_NAME},
        Message,
    },
    Error, Result,
};

pub struct MessageColumn(pub Vec<Vec<Message>>);

impl MessageColumn {
    fn from_array(array: &MessageArray) -> Result<Self> {
        let mut result = Vec::with_capacity(array.0.len());

        let (to_column, r#type_column, data_column) = get_columns_from_struct_array(
            array
                .0
                .values()
                .as_any()
                .downcast_ref::<StructArray>()
                .unwrap(),
        )?;
        let _to_values = to_column.values();
        let to_values = _to_values
            .as_any()
            .downcast_ref::<Utf8Array<i32>>()
            .ok_or(Error::InvalidArrowDowncast { name: "to".into() })?;

        let mut offset = 0;
        let mut to_offset = 0;

        for i in 0..array.0.len() {
            let messages_len = array.0.values_iter().nth(i).unwrap().len();
            let mut messages: Vec<Message> = Vec::with_capacity(messages_len);
            for j in 0..messages_len {
                let to_len = to_column.value(offset + j).len();
                let to: Vec<&str> = (0..to_len)
                    .map(|j| to_values.value(to_offset + j))
                    .collect();
                let r#type = type_column.value(offset + j);
                let data_string = data_column.value(offset + j);
                messages.push(Message::new(&to, r#type, data_string)?);
                to_offset += to_len;
            }
            result.push(messages);
            offset += messages_len;
        }
        Ok(Self(result))
    }

    pub fn from_record_batch(batch: &RecordBatch) -> Result<Self> {
        MessageColumn::from_array(&MessageArray::from_record_batch(batch)?)
    }

    pub fn update_agents(&self, agents: &mut [Agent]) -> Result<()> {
        for (agent_index, outbounds) in self.0.iter().enumerate() {
            agents[agent_index].set(MESSAGE_COLUMN_NAME, outbounds)?;
        }
        Ok(())
    }
}

fn get_columns_from_struct_array(
    array: &StructArray,
) -> Result<(&ListArray<i32>, &Utf8Array<i32>, &Utf8Array<i32>)> {
    let columns = array.values();
    if columns.len() != 3 {
        return Err(Error::UnexpectedVectorLength {
            len: columns.len(),
            expected: 3,
        });
    }
    let to_column = columns[0]
        .as_any()
        .downcast_ref::<ListArray<i32>>()
        .ok_or(Error::InvalidArrowDowncast { name: "to".into() })?;
    let type_column = columns[1].as_any().downcast_ref::<Utf8Array<i32>>().ok_or(
        Error::InvalidArrowDowncast {
            name: "type".into(),
        },
    )?;
    let data_column = columns[2].as_any().downcast_ref::<Utf8Array<i32>>().ok_or(
        Error::InvalidArrowDowncast {
            name: "data".into(),
        },
    )?;
    Ok((to_column, type_column, data_column))
}
