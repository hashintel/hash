use std::collections::HashSet;

use arrow2::{
    array::{self, Array, FixedSizeListArray, Utf8Array},
    datatypes::{Field, Schema},
};
use memory::arrow::{col_to_json_vals, json_utf8_json_vals, record_batch::RecordBatch};

use crate::{
    agent::{
        arrow::PREVIOUS_INDEX_FIELD_KEY, field::AgentId, Agent, AgentBatch, AgentName, AgentSchema,
        AgentStateField, IsRequired, BUILTIN_FIELDS,
    },
    field::{FieldScope, FieldTypeVariant, UUID_V4_LEN},
    message::{arrow::column::MessageColumn, MessageBatch, MessageSchema},
    Error, Result,
};

/// Conversion of batches to a list of [`Agent`]s.
pub trait IntoAgents {
    fn to_agent_states(&self, agent_schema: Option<&AgentSchema>) -> Result<Vec<Agent>>;

    // Conversion into `Agent` where certain built-in fields and
    // null values are selectively ignored
    fn to_filtered_agent_states(&self, agent_schema: &AgentSchema) -> Result<Vec<Agent>>;
}

impl IntoAgents for (&AgentBatch, &MessageBatch) {
    fn to_agent_states(&self, agent_schema: Option<&AgentSchema>) -> Result<Vec<Agent>> {
        let agents = self.0.batch.record_batch()?;
        let messages = self.1.batch.record_batch()?;
        let mut states = agents.to_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn to_filtered_agent_states(&self, agent_schema: &AgentSchema) -> Result<Vec<Agent>> {
        let agents = self.0.batch.record_batch()?;
        let messages = self.1.batch.record_batch()?;
        let mut states = agents.to_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgents for (&RecordBatch, &RecordBatch) {
    fn to_agent_states(&self, agent_schema: Option<&AgentSchema>) -> Result<Vec<Agent>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.to_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn to_filtered_agent_states(&self, agent_schema: &AgentSchema) -> Result<Vec<Agent>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.to_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgents for AgentBatch {
    fn to_agent_states(&self, agent_schema: Option<&AgentSchema>) -> Result<Vec<Agent>> {
        self.batch.record_batch()?.to_agent_states(agent_schema)
    }

    fn to_filtered_agent_states(&self, agent_schema: &AgentSchema) -> Result<Vec<Agent>> {
        self.batch
            .record_batch()?
            .to_filtered_agent_states(agent_schema)
    }
}

impl IntoAgents for RecordBatch {
    fn to_agent_states(&self, agent_schema: Option<&AgentSchema>) -> Result<Vec<Agent>> {
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
                    .metadata
                    .get("any_type_fields")
                    .expect("The key `any_type_fields` should always exist in the metadata")
                    .split(',')
                    .map(|v| v.to_string())
                    .collect()
            });

        for (i_field, field) in agents.schema().fields.iter().enumerate() {
            // TODO: remove the need for this
            if BUILTIN_FIELDS.contains(&field.name.as_str()) {
                continue; // Skip builtins, because they were already
            } // set in `set_states_builtins`.
            if any_types.contains(&field.name) {
                // We need to use "from_str" and not "to_value" when converting to serde_json::Value
                set_states_serialized(&mut states, agents, i_field, field)?;
            } else {
                set_states_custom(&mut states, agents, i_field, field)?;
            }
        }
        Ok(states)
    }

    fn to_filtered_agent_states(&self, agent_schema: &AgentSchema) -> Result<Vec<Agent>> {
        let agent_states = self.to_agent_states(Some(agent_schema))?;

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
                // `is_null` is a cheap check, fallback to expensive check
                !value.is_null() || group_field_names.contains(&field.as_str())
            });
            filtered_states.push(state);
        }
        Ok(filtered_states)
    }
}

fn set_states_messages(states: &mut [Agent], messages: &RecordBatch) -> Result<()> {
    debug_assert_eq!(messages.schema(), MessageSchema::default().arrow);
    MessageColumn::from_record_batch(messages)?.update_agents(states)?;
    Ok(())
}

// This file is here mostly to convert between RecordBatch and Vec<Agent>.

// `array.null_count() > 0` can be moved out of loops by the compiler:
// https://llvm.org/doxygen/LoopUnswitch_8cpp_source.html

// TODO: Why doesn't this work:
// fn downcast_col<T>(col: &Box<dyn Array>) -> Result<&T, Error> {
//     col.as_any().downcast_ref::<T>().ok_or(Error::InvalidArrowDowncast)
// }
// This works: https://docs.rs/arrow/1.0.1/src/arrow/array/cast.rs.html

fn get_i_col(field: AgentStateField, record_batch: &RecordBatch) -> Result<Option<usize>> {
    match schema_column_with_name(record_batch.schema().as_ref(), field.name()) {
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

// todo: move this near "column_with_name" and then also rename that function to make it all clearer
/// Carries out a linear search to find the requested field on the schema.
pub fn schema_column_with_name(schema: &Schema, name: &str) -> Option<(usize, Field)> {
    schema.fields.iter().enumerate().find_map(|(i, field)| {
        if field.name == name {
            Some((i, field.clone()))
        } else {
            None
        }
    })
}

fn set_states_agent_id(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentId;
    if let Some(i_col) = get_i_col(field, record_batch)? {
        let array = record_batch
            .column(i_col)
            .as_any()
            .downcast_ref::<arrow2::array::FixedSizeBinaryArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: "agent_id".into(),
            })?;

        debug_assert_eq!(array.size(), UUID_V4_LEN);

        for (i_state, state) in states.iter_mut().enumerate() {
            state.agent_id = AgentId::from_slice(array.value(i_state))?;
        }
    }
    Ok(())
}

fn set_states_agent_name(states: &mut [Agent], record_batch: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentName;
    if let Some(i_col) = get_i_col(field.clone(), record_batch)? {
        let array = record_batch.columns()[i_col]
            .as_any()
            .downcast_ref::<Utf8Array<i32>>()
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
        let array = record_batch.columns()[i_col]
            .as_any()
            .downcast_ref::<Utf8Array<i32>>()
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
            .downcast_ref::<Utf8Array<i32>>()
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
                        Some(crate::Vec3(
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
                    .downcast_ref::<arrow2::array::Float64Array>()
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
            .downcast_ref::<arrow2::array::BooleanArray>()
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
    let index = schema_column_with_name(record_batch.schema().as_ref(), PREVIOUS_INDEX_FIELD_KEY)
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
    let vals = col_to_json_vals(col.as_ref(), field.data_type())?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name.clone(), val); // i_val == i_state
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
    let vals = json_utf8_json_vals(col.as_ref())?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name.clone(), val); // i_val == i_state
        }
    }
    Ok(())
}
