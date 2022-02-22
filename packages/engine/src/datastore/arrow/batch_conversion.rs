#![allow(
    clippy::too_many_lines,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]

use std::{collections::HashSet, sync::Arc};

use arrow::{
    array::{
        self, Array, ArrayData, ArrayDataBuilder, ArrayRef, FixedSizeListArray, ListArray,
        PrimitiveArray, StringArray, StructArray,
    },
    buffer::MutableBuffer,
    datatypes::{self, ArrowNumericType, ArrowPrimitiveType, DataType, Field, JsonSerializable},
};
use serde::de::DeserializeOwned;
use serde_json::value::Value;

use super::prelude::*;
use crate::{
    datastore::{
        arrow::message::messages_column_from_serde_values,
        prelude::*,
        schema::{state::AgentSchema, FieldKey, FieldScope, FieldTypeVariant, IsRequired},
        UUID_V4_LEN,
    },
    hash_types::state::{AgentStateField, BUILTIN_FIELDS},
    simulation::package::creator::PREVIOUS_INDEX_FIELD_KEY,
};

// This file is here mostly to convert between RecordBatch and Vec<AgentState>.

/// Conversion into Arrow `RecordBatch`
pub trait IntoRecordBatch {
    fn into_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch>;
    fn into_empty_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch>;
    /// TODO: DOC describe, explain self is initialization data
    fn into_agent_batch(&self, schema: &Arc<AgentSchema>) -> Result<RecordBatch>;
}

// `n_bits` 0 bits, possibly followed by more 0 bits for padding.
pub fn new_zero_bits(n_bits: usize) -> MutableBuffer {
    let n_bytes = arrow_bit_util::ceil(n_bits, 8);

    // MutableBuffer makes a call to std::alloc::alloc_zeroed
    // It also rounds up the capacity to a multiple of 64
    let mut buffer = MutableBuffer::new(n_bytes);
    buffer.resize(n_bytes, 0);
    debug_assert!(buffer.as_slice().iter().all(|v| *v == 0));
    buffer
}

// `n_bits` 1 bits, possibly followed by 0 bit padding.
// TODO: UNUSED: Needs triage
pub fn new_one_bits(n_bits: usize) -> MutableBuffer {
    let n_bytes = arrow_bit_util::ceil(n_bits, 8);
    MutableBuffer::new(n_bytes).with_bitset(n_bytes, true)
}

/// Get a mutable buffer for offsets to `n_elem` elements
/// It is required that the buffer is filled to `n_elem` + 1
/// offsets. All elements are zero in the beginning, so
/// there is no need to set the first offset as `0_i32`
pub fn new_offsets_buffer(n_elem: usize) -> MutableBuffer {
    // Each offset is an i32 element
    let offset_size = std::mem::size_of::<i32>();

    let byte_length = (n_elem + 1) * offset_size;

    // Buffer actually contains `n_elem` + 1 bytes
    let mut buffer = MutableBuffer::new(byte_length);
    // Resize so buffer.len() is the correct size
    buffer.resize(byte_length, 0);
    buffer
}

pub fn new_buffer<T>(n_elem: usize) -> MutableBuffer {
    let offset_size = std::mem::size_of::<T>();
    let byte_length = n_elem * offset_size;
    let mut buffer = MutableBuffer::new(byte_length);
    // Resize so buffer.len() is the correct size
    buffer.resize(byte_length, 0);
    buffer
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
fn agents_to_id_col(agents: &[&AgentState]) -> Result<ArrayRef> {
    let mut builder =
        array::FixedSizeBinaryBuilder::new(agents.len() * UUID_V4_LEN, UUID_V4_LEN as i32);
    for agent in agents {
        builder_add_id(&mut builder, &agent.agent_id)?;
    }
    Ok(Arc::new(builder.finish()))
}

macro_rules! agents_to_vec_col_gen {
    ($field_name:ident, $function_name:ident) => {
        fn $function_name(agents: &[&AgentState]) -> Result<FixedSizeListArray> {
            let mut flat: Vec<f64> = Vec::with_capacity(agents.len() * 3);
            let mut null_bits = new_zero_bits(agents.len());
            let mut_null_bits = null_bits.as_slice_mut();
            let mut null_count = 0;
            for (i_agent, agent) in agents.iter().enumerate() {
                if let Some(dir) = agent.$field_name {
                    flat.push(dir.0);
                    flat.push(dir.1);
                    flat.push(dir.2);
                    arrow_bit_util::set_bit(mut_null_bits, i_agent);
                } else {
                    // Null -- put arbitrary data
                    flat.push(0.0);
                    flat.push(0.0);
                    flat.push(0.0);
                    null_count += 1;
                }
            }
            let child_array: array::Float64Array = flat.into();

            let dt = ArrowDataType::FixedSizeList(
                Box::new(ArrowField::new("item", ArrowDataType::Float64, true)),
                3,
            );

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

fn json_vals_to_bool(vals: Vec<Value>) -> Result<array::BooleanArray> {
    let bools: Vec<bool> = vals
        .iter()
        .map(|v| match v {
            Value::Bool(b) => Ok(*b),
            Value::Null => Ok(false),
            _ => Err(Error::BooleanSerdeValueExpected),
        })
        .collect::<Result<_>>()?;

    Ok(bools.into())
}

fn json_vals_to_primitive<T: ArrowPrimitiveType>(
    vals: Vec<Value>,
    nullable: bool,
) -> Result<PrimitiveArray<T>>
where
    T::Native: DeserializeOwned,
{
    let mut builder = PrimitiveArray::<T>::builder(vals.len());
    for val in vals {
        if nullable {
            builder.append_option(serde_json::from_value(val)?)?;
        } else {
            builder.append_value(serde_json::from_value(val)?)?;
        }
    }
    Ok(builder.finish())
}

fn json_vals_to_utf8(vals: Vec<Value>, nullable: bool) -> Result<StringArray> {
    // TODO: some better heuristics for capacity estimation?
    let mut builder = array::StringBuilder::new(vals.len() * 64);
    for val in vals {
        if nullable {
            let opt: Option<String> = serde_json::from_value(val).map_err(Error::from)?;
            if let Some(native) = opt {
                builder.append_value(&native)?;
            } else {
                builder.append_null()?;
            }
        } else {
            let native: String = serde_json::from_value(val).map_err(Error::from)?;
            builder.append_value(&native)?;
        }
    }

    Ok(builder.finish())
}

fn json_vals_to_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
) -> Result<ListArray> {
    let mut null_count = 0;
    let n_elem = vals.len();
    let mut null_bits = new_zero_bits(n_elem);
    let mut_null_bits = null_bits.as_slice_mut();

    let mut offsets = new_offsets_buffer(n_elem);
    // SAFETY: `new_offsets_buffer` is returning a buffer of `i32`
    let mut_offsets = unsafe { offsets.typed_data_mut::<i32>() };
    debug_assert!(mut_offsets.iter().all(|v| *v == 0));

    let mut combined_vals = vec![];

    for (i_val, val) in vals.into_iter().enumerate() {
        match val {
            Value::Array(mut inner_vals) => {
                arrow_bit_util::set_bit(mut_null_bits, i_val);
                let prev_offset = mut_offsets[i_val];
                mut_offsets[i_val + 1] = prev_offset + inner_vals.len() as i32;
                combined_vals.append(&mut inner_vals);
            }
            Value::Null => {
                mut_offsets[i_val + 1] = mut_offsets[i_val];
                null_count += 1;
            }
            _ => return Err(Error::ChildDataExpected),
        }
    }
    // Nested values are always nullable.
    let child_data = json_vals_to_col(combined_vals, &inner_field, true)?;

    Ok(ArrayData::builder(ArrowDataType::List(inner_field))
        .len(n_elem)
        .null_count(null_count)
        .null_bit_buffer(null_bits.into())
        .add_buffer(offsets.into())
        .add_child_data(child_data.data().clone())
        .build()?
        .into())
}

fn json_vals_to_fixed_size_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
    size: i32,
) -> Result<FixedSizeListArray> {
    let mut null_count = 0;
    let n_elem = vals.len();
    let mut null_bits = new_zero_bits(n_elem);
    let mut_null_bits = null_bits.as_slice_mut();

    let mut combined_vals = vec![];

    for (i_val, val) in vals.into_iter().enumerate() {
        match val {
            Value::Array(mut inner_vals) => {
                if inner_vals.len() != size as usize {
                    return Err(Error::FixedSizeListInvalidValue {
                        required: size,
                        actual: inner_vals.len(),
                    });
                }
                arrow_bit_util::set_bit(mut_null_bits, i_val);
                combined_vals.append(&mut inner_vals);
            }
            Value::Null => {
                // Need to fill w/ empty space as we don't have offsets
                combined_vals.append(&mut (0..size as usize).map(|_| Value::Null).collect());
                null_count += 1;
            }
            _ => return Err(Error::ChildDataExpected),
        }
    }
    // Nested values are always nullable.
    let child_data = json_vals_to_col(combined_vals, &inner_field, true)?;

    Ok(
        ArrayData::builder(ArrowDataType::FixedSizeList(inner_field, size))
            .len(n_elem)
            .null_count(null_count)
            .null_bit_buffer(null_bits.into())
            .add_child_data(child_data.data().clone())
            .build()?
            .into(),
    )
}

fn json_vals_to_struct(
    vals: Vec<Value>,
    _nullable: bool,
    fields: Vec<ArrowField>,
) -> Result<StructArray> {
    let mut flattened_vals = vec![Vec::with_capacity(vals.len()); fields.len()];

    for val in vals.into_iter() {
        match val {
            Value::Object(mut values) => {
                fields
                    .iter()
                    .enumerate()
                    .try_for_each::<_, Result<()>>(|(i, field)| {
                        if let Some(inner_vals) = values.remove(field.name()) {
                            flattened_vals[i].push(inner_vals);
                            Ok(())
                        } else if field.is_nullable() {
                            // Don't change `null_count`, because that's the number of
                            // *null structs*, not the number of null fields *inside*
                            // structs.
                            flattened_vals[i].push(Value::Null);
                            Ok(())
                        } else {
                            Err(Error::MissingFieldInObject(field.name().clone()))
                        }
                    })?;
            }
            Value::Null => {
                // Arrow expects struct child arrays to have length (at least) as long as
                // struct array itself, even if struct elements are all nulls and it
                // shouldn't be necessary.
                flattened_vals
                    .iter_mut()
                    .for_each(|field| field.push(Value::Null));
            }
            _ => return Err(Error::ChildDataExpected),
        }
    }

    let struct_data: Vec<_> = fields
        .iter()
        .zip(flattened_vals.into_iter())
        .map(|(inner_field, inner_values)| {
            Ok((
                inner_field.clone(),
                json_vals_to_col(inner_values, inner_field, inner_field.is_nullable())?,
            ))
        })
        .collect::<Result<_>>()?;

    Ok(struct_data.into())
}

// TODO: OPTIM: As an optimization, we could look at both whether a column is *nullable* (i.e.
//       can have nulls) and whether it has a *non-zero null count* (i.e. currently
//       has nulls). Right now it only matters whether the column is nullable.
fn json_vals_to_col(vals: Vec<Value>, field: &ArrowField, nullable: bool) -> Result<ArrayRef> {
    // Inner columns (i.e. columns that are elements of list or struct arrays) are
    // always nullable; fields might not be.
    match field.data_type() {
        ArrowDataType::Float64 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Float64Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Float32 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Float32Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Int64 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Int64Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Int32 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Int32Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Int16 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Int16Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Int8 => Ok(Arc::new(json_vals_to_primitive::<datatypes::Int8Type>(
            vals, nullable,
        )?)),
        ArrowDataType::UInt64 => Ok(Arc::new(json_vals_to_primitive::<datatypes::UInt64Type>(
            vals, nullable,
        )?)),
        ArrowDataType::UInt32 => Ok(Arc::new(json_vals_to_primitive::<datatypes::UInt32Type>(
            vals, nullable,
        )?)),
        ArrowDataType::UInt16 => Ok(Arc::new(json_vals_to_primitive::<datatypes::UInt16Type>(
            vals, nullable,
        )?)),
        ArrowDataType::UInt8 => Ok(Arc::new(json_vals_to_primitive::<datatypes::UInt8Type>(
            vals, nullable,
        )?)),
        ArrowDataType::Boolean => Ok(Arc::new(json_vals_to_bool(vals)?)),
        ArrowDataType::Utf8 => Ok(Arc::new(json_vals_to_utf8(vals, nullable)?)),
        ArrowDataType::List(inner_field) => Ok(Arc::new(json_vals_to_list(
            vals,
            nullable,
            inner_field.clone(),
        )?)),
        ArrowDataType::FixedSizeList(inner_field, size) => Ok(Arc::new(
            json_vals_to_fixed_size_list(vals, nullable, inner_field.clone(), *size)?,
        )),
        ArrowDataType::Struct(fields) => Ok(Arc::new(json_vals_to_struct(
            vals,
            nullable,
            fields.clone(),
        )?)),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            field.data_type().clone(),
        ))),
    }
}

fn json_vals_to_any_type_col(vals: Vec<Value>, dt: &DataType) -> Result<ArrayRef> {
    debug_assert!(matches!(dt, DataType::Utf8));

    let mut builder = array::StringBuilder::new(vals.len() * 64);
    for val in vals {
        let native: String = serde_json::to_string(&val).map_err(Error::from)?;
        builder.append_value(&native)?;
    }
    Ok(Arc::new(builder.finish()))
}

fn previous_index_to_empty_col(num_agents: usize, dt: ArrowDataType) -> Result<ArrayRef> {
    if let ArrowDataType::FixedSizeList(inner_field, inner_len) = dt.clone() {
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

impl IntoRecordBatch for &[AgentState] {
    fn into_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_message_batch(schema)
    }

    fn into_empty_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_empty_message_batch(schema)
    }

    fn into_agent_batch(&self, schema: &Arc<AgentSchema>) -> Result<RecordBatch> {
        self.iter()
            .collect::<Vec<_>>()
            .as_slice()
            .into_agent_batch(schema)
    }
}

impl IntoRecordBatch for &[&AgentState] {
    fn into_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id.as_ref())
            .collect::<Vec<&str>>();
        let messages: Vec<Value> = self
            .iter()
            .map(|agent| agent.get_as_json("messages"))
            .collect::<crate::hash_types::error::Result<_>>()?;

        message::batch_from_json(schema, ids, Some(messages))
    }

    fn into_empty_message_batch(&self, schema: &Arc<ArrowSchema>) -> Result<RecordBatch> {
        let ids = self
            .iter()
            .map(|agent| agent.agent_id.as_ref())
            .collect::<Vec<&str>>();
        message::batch_from_json(schema, ids, None)
    }

    fn into_agent_batch(&self, schema: &Arc<AgentSchema>) -> Result<RecordBatch> {
        let mut cols = Vec::with_capacity(schema.arrow.fields().len());

        for field in schema.arrow.fields() {
            // If `name` isn't cloned, Rust wants schema to have longer lifetime.
            let name = field.name().clone();

            let vals: Vec<Value> = self
                .iter()
                .map(|agent: &&AgentState| agent.get_as_json(name.as_str()))
                .collect::<crate::hash_types::error::Result<_>>()?;

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
            } else if name == AgentStateField::RGB.name() {
                Arc::new(agents_to_rgb_col(*self)?)
            } else if name == AgentStateField::Hidden.name() {
                Arc::new(json_vals_to_bool(vals)?)
            } else if name == PREVIOUS_INDEX_FIELD_KEY {
                previous_index_to_empty_col(self.len(), field.data_type().clone())?
            } else if matches!(
                schema
                    .field_spec_map
                    .get_field_spec(&FieldKey::new(&name))?
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

/// Conversion into `AgentState`, which can be converted to JSON
pub trait IntoAgentStates {
    fn into_agent_states(&self, agent_schema: Option<&Arc<AgentSchema>>)
    -> Result<Vec<AgentState>>;

    // Conversion into `AgentState` where certain built-in fields and
    // null values are selectively ignored
    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema>,
    ) -> Result<Vec<AgentState>>;
}

// `array.null_count() > 0` can be moved out of loops by the compiler:
// https://llvm.org/doxygen/LoopUnswitch_8cpp_source.html

// TODO: Why doesn't this work:
// fn downcast_col<T>(col: &ArrayRef) -> std::result::Result<&T, Error> {
//     col.as_any().downcast_ref::<T>().ok_or(Error::InvalidArrowDowncast)
// }
// This works: https://docs.rs/arrow/1.0.1/src/arrow/array/cast.rs.html

fn get_i_col(field: AgentStateField, rb: &RecordBatch) -> Result<Option<usize>> {
    match rb.schema().column_with_name(field.name()) {
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

fn set_states_agent_id(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentId;
    if let Some(i_col) = get_i_col(field, rb)? {
        let array = rb
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

fn set_states_agent_name(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let field = AgentStateField::AgentName;
    if let Some(i_col) = get_i_col(field.clone(), rb)? {
        let array = rb
            .column(i_col)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: field.name().into(),
            })?;

        for (i_state, state) in states.iter_mut().enumerate() {
            state.agent_name = if array.is_valid(i_state) {
                Some(crate::hash_types::state::Name(array.value(i_state).into()))
            } else {
                None
            }
        }
    }
    Ok(())
}

fn set_states_shape(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Shape;
    if let Some(i_col) = get_i_col(field.clone(), rb)? {
        let array = rb
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

fn set_states_color(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Color;
    if let Some(i_col) = get_i_col(field.clone(), rb)? {
        let array = rb
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

        fn $function_name(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
            if let Some(i_col) = get_i_col($field, rb)? {
                let vec3_array = rb
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
                        Some(crate::hash_types::vec::Vec3(
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
set_states_opt_vec3_gen!(rgb, set_states_rgb, AgentStateField::RGB);
set_states_opt_vec3_gen!(velocity, set_states_velocity, AgentStateField::Velocity);

macro_rules! set_states_opt_f64_gen {
    ($field_name:ident, $function_name:ident, $field:expr) => {
        fn $function_name(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
            if let Some(i_col) = get_i_col($field, rb)? {
                let array = rb
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

fn set_states_hidden(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let field = AgentStateField::Hidden;
    if let Some(i_col) = get_i_col(field.clone(), rb)? {
        let array = rb
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

fn set_states_previous_index(states: &mut [AgentState], rb: &RecordBatch) -> Result<()> {
    let index = rb
        .schema()
        .column_with_name(PREVIOUS_INDEX_FIELD_KEY)
        .map(|v| v.0);
    if let Some(i_col) = index {
        let vec2_array = rb
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

fn set_states_messages(states: &mut [AgentState], messages: &RecordBatch) -> Result<()> {
    debug_assert_eq!(
        messages.schema(),
        std::sync::Arc::new(super::message::MESSAGE_BATCH_SCHEMA.clone())
    );
    super::message::column_into_state(states, messages, super::message::MESSAGE_COLUMN_INDEX)
}

fn set_states_builtins(states: &mut [AgentState], agents: &RecordBatch) -> Result<()> {
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

fn numeric_to_json_vals<T: ArrowPrimitiveType + ArrowNumericType>(
    col: &ArrayRef,
) -> Result<Vec<Value>> {
    // TODO: Return Err if `as_primitive_array` cast fails,
    //       by calling `downcast_col` instead.
    let array = array::as_primitive_array::<T>(col);
    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        // If JSON conversion error occurs, it must be due to
        // non-finite floats, because `T::Native` is always a numeric type.
        // TODO: Instead of using `into_json_value`, put `native_val` in
        //       `serde_json::Number` directly to try to preserve NaNs and
        //       infinities.
        let native_val: T::Native = array.value(i_val);
        let json_val = native_val.into_json_value().unwrap_or(Value::Null);
        json_vals.push(json_val);
    }
    Ok(json_vals)
}

// Have to pretty much copy-paste `numeric_to_json_vals`, because
// the Rust Arrow crate doesn't have the function `value` in the
// `Array` trait, even though all arrays do implement that function.
fn bool_to_json_vals(col: &ArrayRef) -> Result<Vec<Value>> {
    let array = array::as_boolean_array(col);
    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        let native_val = array.value(i_val);
        let json_val = native_val.into_json_value().unwrap_or(Value::Null);
        json_vals.push(json_val);
    }
    Ok(json_vals)
}

fn utf8_to_json_vals(col: &ArrayRef) -> Result<Vec<Value>> {
    let array = array::as_string_array(col);
    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        let native_val = array.value(i_val);
        let json_val = serde_json::to_value(native_val).unwrap_or(Value::Null);
        json_vals.push(json_val);
    }
    Ok(json_vals)
}

fn json_utf8_json_vals(col: &ArrayRef) -> Result<Vec<Value>> {
    let array = array::as_string_array(col);
    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        let native_val = array.value(i_val);
        let json_val = serde_json::from_str(native_val).unwrap_or(Value::Null);
        json_vals.push(json_val);
    }
    Ok(json_vals)
}

fn list_to_json_vals(col: &ArrayRef, inner_dt: &DataType) -> Result<Vec<Value>> {
    let array = col
        .as_any()
        .downcast_ref::<ListArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "[custom list]".into(),
        })?;

    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        let inner_col = array.value(i_val);
        let inner_vals = col_to_json_vals(&inner_col, inner_dt)?;
        json_vals.push(Value::Array(inner_vals));
    }
    Ok(json_vals)
}

fn fixed_size_list_to_json_vals(col: &ArrayRef, inner_dt: &DataType) -> Result<Vec<Value>> {
    let array =
        col.as_any()
            .downcast_ref::<FixedSizeListArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: "[custom list]".into(),
            })?;

    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    for i_val in 0..array.len() {
        if array.null_count() > 0 && !array.is_valid(i_val) {
            json_vals.push(Value::Null);
            continue;
        }

        let inner_col = array.value(i_val);
        let inner_vals = col_to_json_vals(&inner_col, inner_dt)?;
        json_vals.push(Value::Array(inner_vals));
    }
    Ok(json_vals)
}

fn struct_to_json_vals(col: &ArrayRef, fields: &[ArrowField]) -> Result<Vec<Value>> {
    let array = col
        .as_any()
        .downcast_ref::<StructArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "[custom list]".into(),
        })?;

    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    let columns = array.columns_ref();

    let mut object_field_maps = vec![serde_json::Map::with_capacity(fields.len()); col.len()];
    fields
        .iter()
        .enumerate()
        .try_for_each::<_, Result<()>>(|(i, field)| {
            let col = col_to_json_vals(&columns[i], field.data_type())?;

            col.into_iter().enumerate().for_each(|(i_elem, val)| {
                object_field_maps[i_elem].insert(field.name().clone(), val);
            });
            Ok(())
        })?;

    object_field_maps
        .into_iter()
        .enumerate()
        .for_each(|(i_elem, fields)| {
            if array.null_count() > 0 && !array.is_valid(i_elem) {
                json_vals.push(Value::Null);
            } else {
                json_vals.push(Value::Object(fields));
            }
        });
    Ok(json_vals)
}

pub(in crate::datastore) fn col_to_json_vals(col: &ArrayRef, dt: &DataType) -> Result<Vec<Value>> {
    match dt {
        ArrowDataType::Float32 => numeric_to_json_vals::<datatypes::Float32Type>(col),
        ArrowDataType::Float64 => numeric_to_json_vals::<datatypes::Float64Type>(col),
        ArrowDataType::Int8 => numeric_to_json_vals::<datatypes::Int8Type>(col),
        ArrowDataType::Int16 => numeric_to_json_vals::<datatypes::Int16Type>(col),
        ArrowDataType::Int32 => numeric_to_json_vals::<datatypes::Int32Type>(col),
        ArrowDataType::Int64 => numeric_to_json_vals::<datatypes::Int64Type>(col),
        ArrowDataType::UInt8 => numeric_to_json_vals::<datatypes::UInt8Type>(col),
        ArrowDataType::UInt16 => numeric_to_json_vals::<datatypes::UInt16Type>(col),
        ArrowDataType::UInt32 => numeric_to_json_vals::<datatypes::UInt32Type>(col),
        ArrowDataType::UInt64 => numeric_to_json_vals::<datatypes::UInt64Type>(col),
        ArrowDataType::Boolean => bool_to_json_vals(col),
        ArrowDataType::Utf8 => utf8_to_json_vals(col),
        ArrowDataType::List(inner_field) => list_to_json_vals(col, inner_field.data_type()),
        ArrowDataType::FixedSizeList(inner_field, _) => {
            fixed_size_list_to_json_vals(col, inner_field.data_type())
        }
        ArrowDataType::Struct(fields) => struct_to_json_vals(col, fields),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            dt.clone(),
        ))),
    }
}

fn set_states_custom(
    states: &mut [AgentState],
    rb: &RecordBatch,
    i_field: usize,
    field: &Field,
) -> Result<()> {
    // https://docs.rs/arrow/1.0.1/src/arrow/datatypes.rs.html#1539-1544
    // ---> i_field == i_col
    let col = rb.column(i_field);
    let vals = col_to_json_vals(col, field.data_type())?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name().clone(), val); // i_val == i_state
        }
    }
    Ok(())
}

fn set_states_serialized(
    states: &mut [AgentState],
    rb: &RecordBatch,
    i_field: usize,
    field: &Field,
) -> Result<()> {
    // https://docs.rs/arrow/1.0.1/src/arrow/datatypes.rs.html#1539-1544
    // ---> i_field == i_col
    let col = rb.column(i_field);
    let vals = json_utf8_json_vals(col)?;
    for (i_val, val) in vals.into_iter().enumerate() {
        if col.null_count() == 0 || col.is_valid(i_val) {
            states[i_val].custom.insert(field.name().clone(), val); // i_val == i_state
        }
    }
    Ok(())
}

impl IntoAgentStates for (&AgentBatch, &MessageBatch) {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema>>,
    ) -> Result<Vec<AgentState>> {
        let agents = self.0.record_batch()?;
        let messages = self.1.record_batch()?;
        let mut states = agents.into_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema>,
    ) -> Result<Vec<AgentState>> {
        let agents = self.0.record_batch()?;
        let messages = self.1.record_batch()?;
        let mut states = agents.into_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgentStates for (&RecordBatch, &RecordBatch) {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema>>,
    ) -> Result<Vec<AgentState>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.into_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }

    fn into_filtered_agent_states(
        &self,
        agent_schema: &Arc<AgentSchema>,
    ) -> Result<Vec<AgentState>> {
        let agents = &self.0;
        let messages = &self.1;
        let mut states = agents.into_filtered_agent_states(agent_schema)?;
        set_states_messages(&mut states, messages)?;
        Ok(states)
    }
}

impl IntoAgentStates for RecordBatch {
    fn into_agent_states(
        &self,
        agent_schema: Option<&Arc<AgentSchema>>,
    ) -> Result<Vec<AgentState>> {
        let agents = self;

        let mut states: Vec<AgentState> = std::iter::repeat(AgentState::empty())
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
        agent_schema: &Arc<AgentSchema>,
    ) -> Result<Vec<AgentState>> {
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
                .into_message_batch(&Arc::new(message::MESSAGE_BATCH_SCHEMA.clone()))?;

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
