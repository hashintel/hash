use std::sync::Arc;

use arrow::{
    array::{
        Array, ArrayData, ArrayDataBuilder, ArrayRef, FixedSizeBinaryArray, FixedSizeBinaryBuilder,
        FixedSizeListArray, Float64Array,
    },
    buffer::MutableBuffer,
    datatypes::{DataType, Field, Float64Type, Schema},
    record_batch::RecordBatch,
    util::bit_util,
};
use memory::arrow::{
    json_vals_to_any_type_col, json_vals_to_bool, json_vals_to_col, json_vals_to_primitive,
    json_vals_to_utf8, new_zero_bits,
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
        let mut cols = Vec::with_capacity(schema.arrow.fields().len());

        for field in schema.arrow.fields() {
            // If `name` isn't cloned, Rust wants schema to have longer lifetime.
            let name = field.name().clone();

            let vals: Vec<serde_json::Value> = self
                .iter()
                .map(|agent: &&Agent| agent.get_as_json(name.as_str()))
                .collect::<Result<_>>()?;

            // If use `match` instead of `if`, Rust infers that
            // `name` must have static lifetime, like `match` arms.
            // TODO: built-ins should take nullability from the schema
            let col = if name.eq(AgentStateField::AgentId.name()) {
                agents_to_id_col(*self)?
            } else if name == AgentStateField::AgentName.name() {
                Arc::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Messages.name() {
                Arc::new(MessageArray::from_json(vals)?)
            } else if name == AgentStateField::Position.name() {
                Arc::new(agents_to_position_col(*self)?)
            } else if name == AgentStateField::Direction.name()
                || name == AgentStateField::Velocity.name()
            {
                Arc::new(agents_to_direction_col(*self)?)
            } else if name == AgentStateField::Shape.name() {
                Arc::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Height.name() {
                Arc::new(json_vals_to_primitive::<Float64Type>(vals, true)?)
            } else if name == AgentStateField::Scale.name() {
                Arc::new(agents_to_scale_col(*self)?)
            } else if name == AgentStateField::Color.name() {
                Arc::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Rgb.name() {
                Arc::new(agents_to_rgb_col(*self)?)
            } else if name == AgentStateField::Hidden.name() {
                Arc::new(json_vals_to_bool(vals)?)
            } else if name == PREVIOUS_INDEX_FIELD_KEY {
                previous_index_to_empty_col(self.len(), field.data_type().clone())?
            } else if matches!(
                schema
                    .field_spec_map
                    .get_field_spec(&RootFieldKey::new(name))?
                    .inner
                    .field_type
                    .variant,
                FieldTypeVariant::AnyType
            ) {
                // Any-type (JSON string) column
                json_vals_to_any_type_col(vals, field.data_type())?
            } else {
                json_vals_to_col(vals, field, field.is_nullable())?
            };
            cols.push(col);
        }
        RecordBatch::try_new(schema.arrow.clone(), cols).map_err(Error::from)
    }
}

// `get_agent_id_array` is needed for public interface, but
// this function avoids copying ids to separate `Vec`.
fn agents_to_id_col(agents: &[&Agent]) -> Result<ArrayRef> {
    let mut builder = FixedSizeBinaryBuilder::new(agents.len() * UUID_V4_LEN, UUID_V4_LEN as i32);
    for agent in agents {
        builder_add_id(&mut builder, agent.agent_id)?;
    }
    Ok(Arc::new(builder.finish()))
}

macro_rules! agents_to_vec_col_gen {
    ($field_name:ident, $function_name:ident) => {
        fn $function_name(agents: &[&Agent]) -> Result<FixedSizeListArray> {
            let mut flat: Vec<f64> = Vec::with_capacity(agents.len() * 3);
            let mut null_bits = new_zero_bits(agents.len());
            let mut_null_bits = null_bits.as_slice_mut();
            let mut null_count = 0;
            for (i_agent, agent) in agents.iter().enumerate() {
                if let Some(dir) = agent.$field_name {
                    flat.push(dir.0);
                    flat.push(dir.1);
                    flat.push(dir.2);
                    bit_util::set_bit(mut_null_bits, i_agent);
                } else {
                    // Null -- put arbitrary data
                    flat.push(0.0);
                    flat.push(0.0);
                    flat.push(0.0);
                    null_count += 1;
                }
            }
            let child_array: Float64Array = flat.into();

            let dt =
                DataType::FixedSizeList(Box::new(Field::new("item", DataType::Float64, true)), 3);

            Ok(ArrayData::builder(dt)
                .len(agents.len())
                .null_count(null_count)
                .null_bit_buffer(null_bits.into())
                .add_child_data(child_array.data().clone())
                .build()?
                .into())
        }
    };
}

agents_to_vec_col_gen!(direction, agents_to_direction_col);
agents_to_vec_col_gen!(position, agents_to_position_col);
agents_to_vec_col_gen!(scale, agents_to_scale_col);
agents_to_vec_col_gen!(rgb, agents_to_rgb_col);

fn previous_index_to_empty_col(num_agents: usize, dt: DataType) -> Result<ArrayRef> {
    if let DataType::FixedSizeList(inner_field, inner_len) = dt.clone() {
        debug_assert!(matches!(inner_field.data_type(), DataType::UInt32));
        let data_byte_size = inner_len as usize * num_agents * std::mem::size_of::<u32>();
        let mut buffer = MutableBuffer::new(data_byte_size);
        buffer.resize(data_byte_size, 0);

        let data = ArrayDataBuilder::new(dt)
            .len(num_agents)
            .add_child_data(
                ArrayData::builder(inner_field.data_type().clone())
                    .len(num_agents * inner_len as usize)
                    .add_buffer(buffer.into())
                    .build()?,
            )
            .build()?;

        Ok(Arc::new(arrow::array::FixedSizeListArray::from(data)))
    } else {
        Err(Error::from(format!(
            "previous_index_to_empty_col was called on the wrong datatype: {:?}",
            dt
        )))
    }
}

fn builder_add_id(builder: &mut FixedSizeBinaryBuilder, id: AgentId) -> Result<()> {
    Ok(builder.append_value(id.as_bytes())?)
}

pub(in crate) fn get_agent_id_array(agent_ids: &[AgentId]) -> Result<FixedSizeBinaryArray> {
    let mut builder =
        FixedSizeBinaryBuilder::new(agent_ids.len() * UUID_V4_LEN, UUID_V4_LEN as i32);
    for agent_id in agent_ids {
        builder_add_id(&mut builder, *agent_id)?;
    }
    Ok(builder.finish())
}
