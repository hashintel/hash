#![allow(
    clippy::too_many_lines,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]

use std::{collections::HashSet, sync::Arc};

use arrow::{
    array::{self, Array, ArrayData, ArrayDataBuilder, ArrayRef, FixedSizeListArray, StringArray},
    buffer::MutableBuffer,
    datatypes::{self, DataType, Field, Schema},
    record_batch::RecordBatch,
    util::bit_util,
};
use memory::arrow::{
    col_to_json_vals, json_utf8_json_vals, json_vals_to_any_type_col, json_vals_to_bool,
    json_vals_to_col, json_vals_to_primitive, json_vals_to_utf8, new_zero_bits,
};
use serde_json::value::Value;
use stateful::{
    agent::{Agent, AgentName, AgentSchema, AgentStateField, BUILTIN_FIELDS},
    field::{EngineComponent, FieldScope, FieldTypeVariant, RootFieldKey},
    message::MESSAGE_BATCH_SCHEMA,
};

use crate::{
    datastore::{
        arrow::{message, message::messages_column_from_serde_values},
        batch::{AgentBatch, MessageBatch},
        error::{Error, Result},
        schema::IsRequired,
        UUID_V4_LEN,
    },
    simulation::package::creator::PREVIOUS_INDEX_FIELD_KEY,
};

// This file is here mostly to convert between RecordBatch and Vec<Agent>.

/// Conversion into Arrow `RecordBatch`
pub trait IntoRecordBatch {
    fn into_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch>;
    fn into_empty_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch>;
    /// TODO: DOC describe, explain self is initialization data
    fn into_agent_batch<S>(&self, schema: &Arc<AgentSchema<S>>) -> Result<RecordBatch>;
}

fn builder_add_id(builder: &mut array::FixedSizeBinaryBuilder, id: &str) -> Result<()> {
    if id.is_empty() {
        // Generates UUID if it does not exist
        let uuid = uuid::Uuid::new_v4();
        let bytes = uuid.as_bytes();
        builder.append_value(bytes)?;
    } else if let Ok(uuid) = uuid::Uuid::parse_str(id) {
        builder.append_value(uuid.as_bytes())?;
    } else {
        return Err(Error::InvalidAgentId(id.into()));
    }

    Ok(())
}

pub fn get_agent_id_array(values: Vec<&str>) -> Result<array::FixedSizeBinaryArray> {
    let mut builder =
        array::FixedSizeBinaryBuilder::new(values.len() * UUID_V4_LEN, UUID_V4_LEN as i32);
    for value in values {
        builder_add_id(&mut builder, value)?;
    }
    Ok(builder.finish())
}

// `get_agent_id_array` is needed for public interface, but
// this function avoids copying ids to separate `Vec`.
fn agents_to_id_col(agents: &[&Agent]) -> Result<ArrayRef> {
    let mut builder =
        array::FixedSizeBinaryBuilder::new(agents.len() * UUID_V4_LEN, UUID_V4_LEN as i32);
    for agent in agents {
        builder_add_id(&mut builder, &agent.agent_id)?;
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
            let child_array: array::Float64Array = flat.into();

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

impl IntoRecordBatch for &[Agent] {
    fn into_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_message_batch(schema)
    }

    fn into_empty_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_empty_message_batch(schema)
    }

    fn into_agent_batch<S>(&self, schema: &Arc<AgentSchema<S>>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_agent_batch(schema)
    }
}

impl IntoRecordBatch for &[&Agent] {
    fn into_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id.as_ref())
            .collect::<Vec<&str>>();
        let messages: Vec<Value> = self
            .iter()
            .map(|agent| agent.get_as_json("messages"))
            .collect::<stateful::Result<_>>()?;

        message::batch_from_json(schema, ids, Some(messages))
    }

    fn into_empty_message_batch(&self, schema: &Arc<Schema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id.as_ref())
            .collect::<Vec<&str>>();
        message::batch_from_json(schema, ids, None)
    }

    fn into_agent_batch<S>(&self, schema: &Arc<AgentSchema<S>>) -> Result<RecordBatch> {
        let mut cols = Vec::with_capacity(schema.arrow.fields().len());

        for field in schema.arrow.fields() {
            // If `name` isn't cloned, Rust wants schema to have longer lifetime.
            let name = field.name().clone();

            let vals: Vec<Value> = self
                .iter()
                .map(|agent: &&Agent| agent.get_as_json(name.as_str()))
                .collect::<stateful::Result<_>>()?;

            // If use `match` instead of `if`, Rust infers that
            // `name` must have static lifetime, like `match` arms.
            // TODO: built-ins should take nullability from the schema
            let col = if name.eq(AgentStateField::AgentId.name()) {
                agents_to_id_col(*self)?
            } else if name == AgentStateField::AgentName.name() {
                Arc::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Messages.name() {
                Arc::new(messages_column_from_serde_values(vals)?)
            } else if name == AgentStateField::Position.name() {
                Arc::new(agents_to_position_col(*self)?)
            } else if name == AgentStateField::Direction.name()
                || name == AgentStateField::Velocity.name()
            {
                Arc::new(agents_to_direction_col(*self)?)
            } else if name == AgentStateField::Shape.name() {
                Arc::new(json_vals_to_utf8(vals, true)?)
            } else if name == AgentStateField::Height.name() {
                Arc::new(json_vals_to_primitive::<datatypes::Float64Type>(
                    vals, true,
                )?)
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

/// Conversion into `Agent`, which can be converted to JSON
pub trait IntoAgents {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema<EngineComponent>>>,
    ) -> Result<Vec<Agent>>;

    // Conversion into `Agent` where certain built-in fields and
    // null values are selectively ignored
    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema<EngineComponent>>,
    ) -> Result<Vec<Agent>>;
}

// `array.null_count() > 0` can be moved out of loops by the compiler:
// https://llvm.org/doxygen/LoopUnswitch_8cpp_source.html

// TODO: Why doesn't this work:
// fn downcast_col<T>(col: &ArrayRef) -> Result<&T, Error> {
//     col.as_any().downcast_ref::<T>().ok_or(Error::InvalidArrowDowncast)
// }
// This works: https://docs.rs/arrow/1.0.1/src/arrow/array/cast.rs.html

fn get_i_col(field: AgentStateField, record_batch: &RecordBatch) -> Result<Option<usize>> {
    match record_batch.schema().column_with_name(field.name()) {
        Some((i, _)) => Ok(Some(i)),
        None => {
            if field.is_required() {
                Err(Error::BuiltInColumnMissing(field))
            } else {
                Ok(None)
            }
        }
    }
}

fn set_states_agent_id(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentId;
    if let Some(i_col) = get_i_col(field, record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<arrow::array::FixedSizeBinaryArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: "agent_id".into(),
            })?;

        debug_assert_eq!(array.value_length(), UUID_V4_LEN as i32);

        for (i_state, state) in states.iter_mut().enumerate() {
            let value = array.value(i_state);
            let uuid = uuid::Uuid::from_slice(value)?;
            state.agent_id = uuid.to_hyphenated().to_string();
        }
    }
    Ok(())
}

fn set_states_agent_name(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentName;
    if let Some(i_col) = get_i_col(field.clone(), record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: field.name().into(),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            state.agent_name = if array.is_valid(i_state) {
                Some(AgentName(array.value(i_state).into()))
            } else {
                None
            }
        }
    }
    Ok(())
}

fn set_states_shape(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Shape;
    if let Some(i_col) = get_i_col(field.clone(), record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: field.name().into(),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            state.shape = if array.is_valid(i_state) {
                Some(array.value(i_state).into())
            } else {
                None
            }
        }
    }
    Ok(())
}

fn set_states_color(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Color;
    if let Some(i_col) = get_i_col(field.clone(), record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: field.name().into(),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            state.color = if array.is_valid(i_state) {
                Some(array.value(i_state).into())
            } else {
                None
            }
        }
    }
    Ok(())
}

macro_rules! set_states_opt_vec3_gen {
    ($field_name:ident, $function_name:ident, $field:expr) => {
        // Can't just be generic function, because need different field names at compile time.
        // (Unless we made some zero-sized type that accesses the field?)

        // At least for now, need `field` parameter in addition to `field_name` parameter,
        // because other functions use `field` enum, not just the field name.

        fn $function_name(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
            if let Some(i_col) = get_i_col($field, record_batch)? {
                let vec3_array = record_batch
                    .column(i_col)
                    .as_any()
                    .downcast_ref::<FixedSizeListArray>()
                    .ok_or(Error::InvalidArrowDowncast {
                        name: $field.name().into(), // TODO: Better to replace with
                    })?; //       `stringify!($field_name)`?

                let coord_col = vec3_array.values();
                let coord_array = coord_col
                    .as_any()
                    .downcast_ref::<array::Float64Array>()
                    .ok_or(Error::InvalidArrowDowncast {
                        name: format!("[inside {}]", $field.name()),
                    })?;

                for (i_state, state) in states.iter_mut().enumerate() {
                    state.$field_name = if vec3_array.is_valid(i_state) {
                        Some(stateful::Vec3(
                            coord_array.value(i_state * 3),
                            coord_array.value(i_state * 3 + 1),
                            coord_array.value(i_state * 3 + 2),
                        ))
                    } else {
                        None
                    };
                }
            }
            Ok(())
        }
    };
}
set_states_opt_vec3_gen!(position, set_states_position, AgentStateField::Position);
set_states_opt_vec3_gen!(direction, set_states_direction, AgentStateField::Direction);
set_states_opt_vec3_gen!(scale, set_states_scale, AgentStateField::Scale);
set_states_opt_vec3_gen!(rgb, set_states_rgb, AgentStateField::Rgb);
set_states_opt_vec3_gen!(velocity, set_states_velocity, AgentStateField::Velocity);

macro_rules! set_states_opt_f64_gen {
    ($field_name:ident, $function_name:ident, $field:expr) => {
        fn $function_name(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
            if let Some(i_col) = get_i_col($field, record_batch)? {
                let array = record_batch
                    .column(i_col)
                    .as_any()
                    .downcast_ref::<arrow::array::Float64Array>()
                    .ok_or(Error::InvalidArrowDowncast {
                        name: $field.name().into(),
                    })?;

                for (i_state, state) in states.iter_mut().enumerate() {
                    state.$field_name = if array.is_valid(i_state) {
                        Some(array.value(i_state))
                    } else {
                        None
                    }
                }
            }
            Ok(())
        }
    };
}

set_states_opt_f64_gen!(height, set_states_height, AgentStateField::Height);

fn set_states_hidden(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Hidden;
    if let Some(i_col) = get_i_col(field.clone(), record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<arrow::array::BooleanArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: field.name().into(),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            state.hidden = array.value(i_state)
        }
    }
    Ok(())
}

fn set_states_previous_index(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let index = record_batch
        .schema()
        .column_with_name(PREVIOUS_INDEX_FIELD_KEY)
        .map(|v| v.0);
    if let Some(i_col) = index {
        let vec2_array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<FixedSizeListArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: PREVIOUS_INDEX_FIELD_KEY.into(),
            })?;

        let coord_col = vec2_array.values();
        let coord_array = coord_col
            .as_any()
            .downcast_ref::<array::UInt32Array>()
            .ok_or(Error::InvalidArrowDowncast {
                name: format!("[inside {}]", PREVIOUS_INDEX_FIELD_KEY),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            let opt_vec2 = if vec2_array.is_valid(i_state) {
                Some([
                    coord_array.value(i_state * 2),
                    coord_array.value(i_state * 2 + 1),
                ])
            } else {
                None
            };
            state.set(PREVIOUS_INDEX_FIELD_KEY, opt_vec2)?;
        }
    }
    Ok(())
}

fn set_states_messages(states: &mut [Agent], messages: &RecordBatch) -> Result<()> {
    debug_assert_eq!(
        messages.schema(),
        std::sync::Arc::new(MESSAGE_BATCH_SCHEMA.clone())
    );
    super::message::column_into_state(states, messages, super::message::MESSAGE_COLUMN_INDEX)
}

fn set_states_builtins(states: &mut [Agent], agents: &RecordBatch) -> Result<()> {
    set_states_agent_id(states, agents)?;
    set_states_agent_name(states, agents)?;

    set_states_position(states, agents)?;
    set_states_direction(states, agents)?;
    set_states_velocity(states, agents)?;

    set_states_shape(states, agents)?;
    set_states_height(states, agents)?;
    set_states_scale(states, agents)?;
    set_states_color(states, agents)?;
    set_states_rgb(states, agents)?;
    set_states_hidden(states, agents)?;

    set_states_previous_index(states, agents)?;
    Ok(())
}

fn set_states_custom(
    states: &mut [Agent],
    record_batch: &RecordBatch,
    i_field: usize,
    field: &Field,
) -> Result<()> {
    // https://docs.rs/arrow/1.0.1/src/arrow/datatypes.rs.html#1539-1544
    // ---> i_field == i_col
    let col = record_batch.column(i_field);
    let vals = col_to_json_vals(col, field.data_type())?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name().clone(), val); // i_val == i_state
        }
    }
    Ok(())
}

fn set_states_serialized(
    states: &mut [Agent],
    record_batch: &RecordBatch,
    i_field: usize,
    field: &Field,
) -> Result<()> {
    // https://docs.rs/arrow/1.0.1/src/arrow/datatypes.rs.html#1539-1544
    // ---> i_field == i_col
    let col = record_batch.column(i_field);
    let vals = json_utf8_json_vals(col)?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name().clone(), val); // i_val == i_state
        }
    }
    Ok(())
}

impl IntoAgents for (&AgentBatch, &MessageBatch) {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema<EngineComponent>>>,
    ) -> Result<Vec<Agent>> {
        let agents = self.0.batch.record_batch()?;
        let messages = self.1.batch.record_batch()?;
        let mut states = agents.into_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema<EngineComponent>>,
    ) -> Result<Vec<Agent>> {
        let agents = self.0.batch.record_batch()?;
        let messages = self.1.batch.record_batch()?;
        let mut states = agents.into_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgents for (&RecordBatch, &RecordBatch) {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema<EngineComponent>>>,
    ) -> Result<Vec<Agent>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.into_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema<EngineComponent>>,
    ) -> Result<Vec<Agent>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.into_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgents for RecordBatch {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema<EngineComponent>>>,
    ) -> Result<Vec<Agent>> {
        let agents = self;

        let mut states: Vec<Agent> = std::iter::repeat(Agent::empty())
            .take(agents.num_rows())
            .collect();

        set_states_builtins(&mut states, agents)?;

        let any_types = &agent_schema
            .map(|v| {
                v.field_spec_map
                    .iter()
                    .filter_map(|(key, field_spec)| {
                        if matches!(
                            field_spec.inner.field_type.variant,
                            FieldTypeVariant::AnyType
                        ) {
                            Some(key.value().to_string())
                        } else {
                            None
                        }
                    })
                    .collect::<HashSet<String>>()
            })
            .unwrap_or_else(|| {
                self.schema()
                    .metadata()
                    .get("any_type_fields")
                    .expect("Should always contain `any_type_fields` in metadata")
                    .split(',')
                    .map(|v| v.to_string())
                    .collect()
            });

        for (i_field, field) in agents.schema().fields().iter().enumerate() {
            // TODO: remove the need for this
            if BUILTIN_FIELDS.contains(&field.name().as_str()) {
                continue; // Skip builtins, because they were already
            } // set in `set_states_builtins`.
            if any_types.contains(field.name()) {
                // We need to use "from_str" and not "to_value" when converting to serde_json::Value
                set_states_serialized(&mut states, agents, i_field, field)?;
            } else {
                set_states_custom(&mut states, agents, i_field, field)?;
            }
        }
        Ok(states)
    }

    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema<EngineComponent>>,
    ) -> Result<Vec<Agent>> {
        let agent_states = self.into_agent_states(Some(agent_schema))?;

        let group_field_names = agent_schema
            .field_spec_map
            .iter()
            .filter_map(|(key, spec)| {
                if spec.scope == FieldScope::Agent {
                    Some(key.value())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        // Use `reserve_exact` instead of `reserve` to minimize max memory usage.
        let mut filtered_states = Vec::with_capacity(agent_states.len());

        // Remove custom fields which are (1) null and (2) not in behavior keys of
        // any of agent's behaviors. Also remove previous index column.
        for mut state in agent_states {
            // This function consumes `agent_states`, so it's ok to change `state` in-place.
            state.custom.retain(|field, value| {
                !value.is_null() ||                    // Cheap check.
                    group_field_names.contains(&field.as_str())
                // Expensive check.
            });
            filtered_states.push(state);
        }
        Ok(filtered_states)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::datastore::test_utils::gen_schema_and_test_agents;

    #[test]
    fn agent_state_into_record_batch() -> Result<()> {
        let mut failed_agent_seeds = vec![];

        for round in 0..3 {
            let num_agents = 150;
            let initial_seed = round * num_agents;
            let (schema, mut agents) = gen_schema_and_test_agents(num_agents, initial_seed as u64)?;

            let agent_batch = agents.as_slice().into_agent_batch(&schema)?;
            let message_batch = agents
                .as_slice()
                .into_message_batch(&Arc::new(MESSAGE_BATCH_SCHEMA.clone()))?;

            let mut returned_agents =
                (&agent_batch, &message_batch).into_agent_states(Some(&schema))?;

            agents.iter_mut().for_each(|v| {
                v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
            });
            returned_agents.iter_mut().for_each(|v| {
                v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
            });

            agents
                .iter()
                .zip(returned_agents.iter())
                .for_each(|(agent, returned_agent)| {
                    if agent != returned_agent {
                        failed_agent_seeds.push(agent.get_custom::<f64>("seed").unwrap())
                    }
                });
        }

        assert_eq!(
            failed_agent_seeds.len(),
            0,
            "Some agents failed to be properly converted, their seeds were: {:?}",
            failed_agent_seeds
        );

        Ok(())
    }
}
