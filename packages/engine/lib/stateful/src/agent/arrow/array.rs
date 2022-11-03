use std::sync::Arc;

use arrow2::{
    array::{
        Array, FixedSizeBinaryArray, FixedSizeListArray, MutableFixedSizeBinaryArray,
        PrimitiveArray,
    },
    chunk::Chunk,
    datatypes::{DataType, Schema},
};
use memory::arrow::{
    json_vals_to_any_type_col, json_vals_to_bool, json_vals_to_col, json_vals_to_primitive,
    json_vals_to_utf8, record_batch::RecordBatch,
};

use crate::{
    agent::{arrow::PREVIOUS_INDEX_FIELD_KEY, field::AgentId, Agent, AgentSchema, AgentStateField},
    field::{FieldTypeVariant, RootFieldKey, UUID_V4_LEN},
    message::{self, arrow::array::MessageArray},
    Error, Result,
};

/// Conversion into Arrow `RecordBatch`
pub trait IntoRecordBatch {
    fn to_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch>;
    fn to_empty_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch>;
    /// TODO: DOC describe, explain self is initialization data
    fn to_agent_batch(&self, schema: &AgentSchema) -> Result<RecordBatch>;
}

impl IntoRecordBatch for &[Agent] {
    fn to_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .to_message_batch(schema)
    }

    fn to_empty_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .to_empty_message_batch(schema)
    }

    fn to_agent_batch(&self, schema: &AgentSchema) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .to_agent_batch(schema)
    }
}

impl IntoRecordBatch for &[&Agent] {
    fn to_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id)
            .collect::<Vec<AgentId>>();
        let messages: Vec<serde_json::Value> = self
            .iter()
            .map(|agent| agent.get_as_json("messages"))
            .collect::<Result<_>>()?;

        message::arrow::record_batch::from_json(schema, &ids, Some(messages))
    }

    fn to_empty_message_batch(&self, schema: Arc<Schema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id)
            .collect::<Vec<AgentId>>();
        message::arrow::record_batch::from_json(schema, &ids, None)
    }

    fn to_agent_batch(&self, schema: &AgentSchema) -> Result<RecordBatch> {
        let mut cols = Vec::with_capacity(schema.arrow.fields.len());

        for field in &schema.arrow.fields {
            let name = field.name.as_str();

            let vals: Vec<serde_json::Value> = self
                .iter()
                .map(|agent: &&Agent| agent.get_as_json(name))
                .collect::<Result<_>>()?;

            // If use `match` instead of `if`, Rust infers that
            // `name` must have static lifetime, like `match` arms.
            // TODO: built-ins should take nullability from the schema
            let col = if name.eq(AgentStateField::AgentId.name()) {
                agents_to_id_col(self)?
            } else if name == AgentStateField::AgentName.name() {
                Box::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Messages.name() {
                Box::new(MessageArray::from_json(vals)?)
            } else if name == AgentStateField::Position.name() {
                Box::new(agents_to_position_col(self)?)
            } else if name == AgentStateField::Direction.name()
                || name == AgentStateField::Velocity.name()
            {
                Box::new(agents_to_direction_col(self)?)
            } else if name == AgentStateField::Shape.name() {
                Box::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Height.name() {
                Box::new(json_vals_to_primitive::<f64>(vals, true)?)
            } else if name == AgentStateField::Scale.name() {
                Box::new(agents_to_scale_col(self)?)
            } else if name == AgentStateField::Color.name() {
                Box::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Rgb.name() {
                Box::new(agents_to_rgb_col(self)?)
            } else if name == AgentStateField::Hidden.name() {
                Box::new(json_vals_to_bool(vals)?)
            } else if name == PREVIOUS_INDEX_FIELD_KEY {
                previous_index_to_empty_col(self.len(), field.data_type().clone())?
            } else if matches!(
                schema
                    .field_spec_map
                    .get_field_spec(&RootFieldKey::new(name.to_string()))?
                    .inner
                    .field_type
                    .variant,
                FieldTypeVariant::AnyType
            ) {
                // Any-type (JSON string) column
                json_vals_to_any_type_col(vals, field.data_type())?
            } else {
                json_vals_to_col(vals, field, field.is_nullable)?
            };
            cols.push(col);
        }
        // todo: implement RecordBatch::try_new
        Ok(RecordBatch::new(schema.arrow.clone(), Chunk::new(cols)))
    }
}

// `get_agent_id_array` is needed for public interface, but
// this function avoids copying ids to separate `Vec`.
fn agents_to_id_col(agents: &[&Agent]) -> Result<Box<dyn Array>> {
    let mut builder = MutableFixedSizeBinaryArray::with_capacity(UUID_V4_LEN, agents.len());
    for agent in agents {
        builder.push(Some(agent.agent_id.as_bytes()));
    }
    let array: FixedSizeBinaryArray = builder.into();
    debug_assert_eq!(array.len(), agents.len());
    Ok(array.boxed())
}

macro_rules! agents_to_vec_col_gen {
    ($field_name:ident, $function_name:ident) => {
        fn $function_name(agents: &[&Agent]) -> Result<FixedSizeListArray> {
            let mut flat: arrow2::array::MutableFixedSizeListArray<
                arrow2::array::MutablePrimitiveArray<f64>,
            > = arrow2::array::MutableFixedSizeListArray::new(
                arrow2::array::MutablePrimitiveArray::new(),
                3,
            );

            for agent in agents {
                if let Some(dir) = agent.$field_name {
                    arrow2::array::TryPush::try_push(
                        &mut flat,
                        Some([Some(dir.0), Some(dir.1), Some(dir.2)]),
                    )?;
                } else {
                    arrow2::array::TryPush::try_push(&mut flat, Option::<[Option<f64>; 3]>::None)?;
                }
            }

            Ok(flat.into())
        }
    };
}

agents_to_vec_col_gen!(direction, agents_to_direction_col);
agents_to_vec_col_gen!(position, agents_to_position_col);
agents_to_vec_col_gen!(scale, agents_to_scale_col);
agents_to_vec_col_gen!(rgb, agents_to_rgb_col);

fn previous_index_to_empty_col(num_agents: usize, dt: DataType) -> Result<Box<dyn Array>> {
    if let DataType::FixedSizeList(inner_field, inner_len) = dt.clone() {
        debug_assert!(matches!(inner_field.data_type(), DataType::UInt32));

        let primitive: PrimitiveArray<u32> =
            PrimitiveArray::new_null(DataType::UInt32, num_agents * inner_len);

        Ok(Box::new(arrow2::array::FixedSizeListArray::new(
            DataType::FixedSizeList(inner_field, inner_len),
            primitive.boxed(),
            None,
        )))
    } else {
        Err(Error::from(format!(
            "previous_index_to_empty_col was called on the wrong datatype: {:?}",
            dt
        )))
    }
}

pub(crate) fn get_agent_id_array(agent_ids: &[AgentId]) -> Result<FixedSizeBinaryArray> {
    let mut builder = MutableFixedSizeBinaryArray::with_capacity(UUID_V4_LEN, UUID_V4_LEN);
    for agent_id in agent_ids {
        builder.push(Some(agent_id.as_bytes()));
    }
    Ok(builder.into())
}
