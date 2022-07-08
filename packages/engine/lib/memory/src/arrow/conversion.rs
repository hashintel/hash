use std::sync::Arc;

use arrow::{
    array,
    array::{
        Array, ArrayRef, BinaryArray, BooleanArray, FixedSizeListArray, ListArray, MutableArray,
        MutableBinaryArray, MutablePrimitiveArray, PrimitiveArray, StructArray,
    },
    buffer::Buffer,
    datatypes::{DataType, Field},
    types::NativeType,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{Error, Result, SupportedType};

// `n_bits` 0 bits, possibly followed by more 0 bits for padding.
pub fn new_zero_bits(n_bits: usize) -> Buffer<u8> {
    let n_bytes = n_bits.div_ceil(8);

    let mut buffer = Vec::with_capacity(n_bytes);
    buffer.resize(n_bytes, 0);
    debug_assert!(buffer.as_slice().iter().all(|v| *v == 0));
    buffer.into()
}

// todo: this came from arrow so separate to different file for copyright reasons
const BIT_MASK: [u8; 8] = [1, 2, 4, 8, 16, 32, 64, 128];
#[inline]
pub fn set_bit(data: &mut [u8], i: usize) {
    data[i >> 3] |= BIT_MASK[i & 7];
}
// end copied

/// Get a mutable buffer for offsets to `n_elem` elements
/// It is required that the buffer is filled to `n_elem` + 1
/// offsets. All elements are zero in the beginning, so
/// there is no need to set the first offset as `0_i32`
pub fn new_offsets_buffer(n_elem: usize) -> Vec<i32> {
    // Each offset is an i32 element
    let offset_size = std::mem::size_of::<i32>();

    let byte_length = (n_elem + 1) * offset_size;

    // Buffer actually contains `n_elem` + 1 bytes
    let mut buffer = Vec::with_capacity(byte_length);
    // Resize so buffer.len() is the correct size
    buffer.resize(byte_length, 0);
    buffer
}

pub fn new_buffer<T>(n_elem: usize) -> Vec<i32> {
    let offset_size = std::mem::size_of::<T>();
    let byte_length = n_elem * offset_size;
    let mut buffer = Vec::with_capacity(byte_length);
    // Resize so buffer.len() is the correct size
    buffer.resize(byte_length, 0);
    buffer
}

pub fn json_vals_to_bool(vals: Vec<Value>) -> Result<array::BooleanArray> {
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

pub fn json_vals_to_primitive<T: NativeType>(
    vals: Vec<Value>,
    nullable: bool,
) -> Result<PrimitiveArray<T>>
where
    T: DeserializeOwned,
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

pub fn json_vals_to_utf8(vals: Vec<Value>, nullable: bool) -> Result<ArrayRef> {
    // TODO: some better heuristics for capacity estimation?
    let mut builder = MutableBinaryArray::with_capacity(vals.len() * 64);
    for val in vals {
        if nullable {
            let opt: Option<String> = serde_json::from_value(val).map_err(Error::from)?;
            if let Some(native) = opt {
                builder.push(Some(&native));
            } else {
                builder.push_null();
            }
        } else {
            let native: String = serde_json::from_value(val).map_err(Error::from)?;
            builder.push(Some(&native));
        }
    }

    Ok(BinaryArray::from(builder))
}

fn json_vals_to_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
) -> Result<ArrayRef> {
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
                set_bit(mut_null_bits, i_val);
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

    Ok(Array::builder(DataType::List(inner_field))
        .len(n_elem)
        .null_count(null_count)
        .null_bit_buffer(null_bits.into())
        .add_buffer(offsets.into())
        .add_child_data(child_data.data().clone())
        .build()?
        .into())
}

// todo this is _very_ brken now
fn json_vals_to_fixed_size_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
    size: i32,
) -> Result<ArrayRef> {
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
                set_bit(mut_null_bits, i_val);
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

    Ok(FixedSizeListArray::from_data(
        DataType::FixedSizeList(inner_field, size),
        child_data,
        None,
    ))
}

fn json_vals_to_struct(
    vals: Vec<Value>,
    _nullable: bool,
    fields: Vec<Field>,
) -> Result<StructArray> {
    let mut flattened_vals = vec![Vec::with_capacity(vals.len()); fields.len()];

    for val in vals.into_iter() {
        match val {
            Value::Object(mut values) => {
                fields
                    .iter()
                    .enumerate()
                    .try_for_each::<_, Result<()>>(|(i, field)| {
                        if let Some(inner_vals) = values.remove(&field.name) {
                            flattened_vals[i].push(inner_vals);
                            Ok(())
                        } else if field.is_nullable {
                            // Don't change `null_count`, because that's the number of
                            // *null structs*, not the number of null fields *inside*
                            // structs.
                            flattened_vals[i].push(Value::Null);
                            Ok(())
                        } else {
                            Err(Error::MissingFieldInObject(field.name.clone()))
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
                json_vals_to_col(inner_values, inner_field, inner_field.is_nullable)?,
            ))
        })
        .collect::<Result<_>>()?;

    Ok(struct_data.into())
}

// TODO: OPTIM: As an optimization, we could look at both whether a column is *nullable* (i.e.
//       can have nulls) and whether it has a *non-zero null count* (i.e. currently
//       has nulls). Right now it only matters whether the column is nullable.
/// Builds an Arrow array (column) from the provided JSON values.
pub fn json_vals_to_col(vals: Vec<Value>, field: &Field, nullable: bool) -> Result<ArrayRef> {
    // Inner columns (i.e. columns that are elements of list or struct arrays) are
    // always nullable; fields might not be.
    match field.data_type() {
        DataType::Float64 => Ok(Arc::new(json_vals_to_primitive::<f64>(vals, nullable)?)),
        DataType::Float32 => Ok(Arc::new(json_vals_to_primitive::<f32>(vals, nullable)?)),
        DataType::Int64 => Ok(Arc::new(json_vals_to_primitive::<i64>(vals, nullable)?)),
        DataType::Int32 => Ok(Arc::new(json_vals_to_primitive::<i32>(vals, nullable)?)),
        DataType::Int16 => Ok(Arc::new(json_vals_to_primitive::<i16>(vals, nullable)?)),
        DataType::Int8 => Ok(Arc::new(json_vals_to_primitive::<i8>(vals, nullable)?)),
        DataType::UInt64 => Ok(Arc::new(json_vals_to_primitive::<u64>(vals, nullable)?)),
        DataType::UInt32 => Ok(Arc::new(json_vals_to_primitive::<u32>(vals, nullable)?)),
        DataType::UInt16 => Ok(Arc::new(json_vals_to_primitive::<u16>(vals, nullable)?)),
        DataType::UInt8 => Ok(Arc::new(json_vals_to_primitive::<u8>(vals, nullable)?)),
        DataType::Boolean => Ok(Arc::new(json_vals_to_bool(vals)?)),
        DataType::Utf8 => json_vals_to_utf8(vals, nullable),
        DataType::List(inner_field) => json_vals_to_list(vals, nullable, inner_field.clone()),
        DataType::FixedSizeList(inner_field, size) => {
            json_vals_to_fixed_size_list(vals, nullable, inner_field.clone(), *size as i32)
        }
        DataType::Struct(fields) => Ok(Arc::new(json_vals_to_struct(
            vals,
            nullable,
            fields.clone(),
        )?)),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            field.data_type().clone(),
        ))),
    }
}

pub fn json_vals_to_any_type_col(vals: Vec<Value>, dt: &DataType) -> Result<ArrayRef> {
    debug_assert!(matches!(dt, DataType::Utf8));

    let mut res = MutableBinaryArray::new();

    for val in vals {
        let native: String = serde_json::to_string(&val).map_err(Error::from)?;
        let bytes = native.as_bytes();
        res.extend(bytes);
    }
    Ok(Arc::new(res.into()))
}

// todo: is there a way of bounding this only to integers
fn numeric_to_json_vals<T: NativeType>(col: &ArrayRef) -> Result<Vec<Value>> {
    // TODO: Return Err if `as_primitive_array` cast fails,
    //       by calling `downcast_col` instead.
    let array = col
        .as_any()
        .downcast_ref::<PrimitiveArray<T>>()
        .expect("could not downcast array");

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
    let array = col
        .as_any()
        .downcast_ref::<BooleanArray>()
        .expect("failed to downcast array");
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

// todo: what is the actual type we want to return
// what do we do about the lack of stringarray in arrow2 - they must
// have written about this somewhere
#[inline]
fn as_string_array(col: &ArrayRef) -> PrimitiveArray<u8> {
    col.as_any()
        .downcast_ref::<PrimitiveArray<u8>>()
        .expect("could not downcast")
}

fn utf8_to_json_vals(col: &ArrayRef) -> Result<Vec<Value>> {
    let array = as_string_array(col);
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

pub fn json_utf8_json_vals(col: &ArrayRef) -> Result<Vec<Value>> {
    let array = as_string_array(col);
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

fn struct_to_json_vals(col: &ArrayRef, fields: &[Field]) -> Result<Vec<Value>> {
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

pub fn col_to_json_vals(col: &ArrayRef, dt: &DataType) -> Result<Vec<Value>> {
    match dt {
        DataType::Float32 => numeric_to_json_vals::<f32>(col),
        DataType::Float64 => numeric_to_json_vals::<i64>(col),
        DataType::Int8 => numeric_to_json_vals::<i8>(col),
        DataType::Int16 => numeric_to_json_vals::<i16>(col),
        DataType::Int32 => numeric_to_json_vals::<i32>(col),
        DataType::Int64 => numeric_to_json_vals::<i64>(col),
        DataType::UInt8 => numeric_to_json_vals::<u8>(col),
        DataType::UInt16 => numeric_to_json_vals::<u16>(col),
        DataType::UInt32 => numeric_to_json_vals::<u32>(col),
        DataType::UInt64 => numeric_to_json_vals::<u64>(col),
        DataType::Boolean => bool_to_json_vals(col),
        DataType::Utf8 => utf8_to_json_vals(col),
        DataType::List(inner_field) => list_to_json_vals(col, inner_field.data_type()),
        DataType::FixedSizeList(inner_field, _) => {
            fixed_size_list_to_json_vals(col, inner_field.data_type())
        }
        DataType::Struct(fields) => struct_to_json_vals(col, fields),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            dt.clone(),
        ))),
    }
}
