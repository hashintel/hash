use arrow2::{
    array,
    array::{
        Array, BooleanArray, FixedSizeListArray, ListArray, MutableArray, MutablePrimitiveArray,
        MutableUtf8Array, PrimitiveArray, StructArray, Utf8Array,
    },
    bitmap::{Bitmap, MutableBitmap},
    buffer::Buffer,
    datatypes::{DataType, Field},
    types::NativeType,
};
use num::Num;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;

use super::new_zero_bits;
use crate::{
    arrow::{buffer::new_offsets_buffer, util::bit_util},
    error::{Error, Result, SupportedType},
};

pub fn json_vals_to_bool(vals: Vec<Value>) -> Result<array::BooleanArray> {
    let bools: Vec<Option<bool>> = vals
        .iter()
        .map(|v| match v {
            Value::Bool(b) => Ok(Some(*b)),
            Value::Null => Ok(Some(false)),
            _ => Err(Error::BooleanSerdeValueExpected),
        })
        .collect::<Result<_>>()?;

    Ok(bools.into())
}

pub fn json_vals_to_primitive<T: NativeType + DeserializeOwned>(
    vals: Vec<Value>,
    nullable: bool,
) -> Result<PrimitiveArray<T>> {
    let mut builder = MutablePrimitiveArray::<T>::with_capacity(vals.len());
    for val in vals {
        if nullable {
            builder.push(serde_json::from_value(val)?);
        } else {
            builder.push(Some(serde_json::from_value(val)?));
        }
    }
    Ok(builder.into())
}

pub fn json_vals_to_utf8(vals: Vec<Value>, nullable: bool) -> Result<Utf8Array<i32>> {
    // TODO: some better heuristics for capacity estimation?
    let mut builder = MutableUtf8Array::with_capacity(vals.len() * 64);
    for val in vals {
        if nullable {
            let opt: Option<String> = serde_json::from_value(val).map_err(Error::from)?;
            if let Some(native) = opt {
                builder.push(Some(native));
            } else {
                builder.push_null();
            }
        } else {
            let native: String = serde_json::from_value(val).map_err(Error::from)?;
            builder.push(Some(native));
        }
    }

    Ok(builder.into())
}

fn json_vals_to_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
) -> Result<ListArray<i32>> {
    let n_elem = vals.len();

    let mut validity = MutableBitmap::from_len_zeroed(n_elem);

    let mut offsets = new_offsets_buffer(n_elem);
    debug_assert_eq!(offsets.len(), n_elem + 1);
    let mut_offsets = offsets.as_mut_slice();
    debug_assert!(mut_offsets.iter().all(|v| *v == 0));

    let mut combined_vals = vec![];

    for (i_val, val) in vals.into_iter().enumerate() {
        match val {
            Value::Array(mut inner_vals) => {
                validity.set(i_val, true);
                let prev_offset = mut_offsets[i_val];
                mut_offsets[i_val + 1] = prev_offset + inner_vals.len() as i32;
                combined_vals.append(&mut inner_vals);
            }
            Value::Null => {
                mut_offsets[i_val + 1] = mut_offsets[i_val];
            }
            _ => return Err(Error::ChildDataExpected),
        }
    }
    // Nested values are always nullable.
    let child_data = json_vals_to_col(combined_vals, &inner_field, true)?;

    Ok(ListArray::new(
        DataType::List(inner_field),
        Buffer::from(offsets),
        child_data,
        validity.into(),
    ))
}

fn json_vals_to_fixed_size_list(
    vals: Vec<Value>,
    _nullable: bool,
    inner_field: Box<Field>,
    size: i32,
) -> Result<FixedSizeListArray> {
    let n_elem = vals.len();
    let mut null_bits = new_zero_bits(n_elem);
    let mut_null_bits = null_bits.as_mut_slice();

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
                bit_util::set_bit(mut_null_bits, i_val);
                combined_vals.append(&mut inner_vals);
            }
            Value::Null => {
                // Need to fill w/ empty space as we don't have offsets
                combined_vals.append(&mut (0..size as usize).map(|_| Value::Null).collect());
            }
            _ => return Err(Error::ChildDataExpected),
        }
    }
    // Nested values are always nullable.
    let child_data = json_vals_to_col(combined_vals, &inner_field, true)?;

    Ok(FixedSizeListArray::new(
        DataType::FixedSizeList(inner_field, size as usize),
        child_data,
        Some(Bitmap::from_u8_vec(null_bits, n_elem)),
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
            json_vals_to_col(inner_values, inner_field, inner_field.is_nullable)
        })
        .collect::<Result<_>>()?;

    Ok(StructArray::new(
        DataType::Struct(fields),
        struct_data,
        None,
    ))
}

// TODO: OPTIM: As an optimization, we could look at both whether a column is *nullable* (i.e.
//       can have nulls) and whether it has a *non-zero null count* (i.e. currently
//       has nulls). Right now it only matters whether the column is nullable.
pub fn json_vals_to_col(vals: Vec<Value>, field: &Field, nullable: bool) -> Result<Box<dyn Array>> {
    // Inner columns (i.e. columns that are elements of list or struct arrays) are
    // always nullable; fields might not be.
    match field.data_type() {
        DataType::Float64 => Ok(Box::new(json_vals_to_primitive::<f64>(vals, nullable)?)),
        DataType::Float32 => Ok(Box::new(json_vals_to_primitive::<f32>(vals, nullable)?)),
        DataType::Int64 => Ok(Box::new(json_vals_to_primitive::<i64>(vals, nullable)?)),
        DataType::Int32 => Ok(Box::new(json_vals_to_primitive::<i32>(vals, nullable)?)),
        DataType::Int16 => Ok(Box::new(json_vals_to_primitive::<i16>(vals, nullable)?)),
        DataType::Int8 => Ok(Box::new(json_vals_to_primitive::<i8>(vals, nullable)?)),
        DataType::UInt64 => Ok(Box::new(json_vals_to_primitive::<u64>(vals, nullable)?)),
        DataType::UInt32 => Ok(Box::new(json_vals_to_primitive::<u32>(vals, nullable)?)),
        DataType::UInt16 => Ok(Box::new(json_vals_to_primitive::<u16>(vals, nullable)?)),
        DataType::UInt8 => Ok(Box::new(json_vals_to_primitive::<u8>(vals, nullable)?)),
        DataType::Boolean => Ok(Box::new(json_vals_to_bool(vals)?)),
        DataType::Utf8 => Ok(Box::new(json_vals_to_utf8(vals, nullable)?)),
        DataType::List(inner_field) => Ok(Box::new(json_vals_to_list(
            vals,
            nullable,
            inner_field.clone(),
        )?)),
        DataType::FixedSizeList(inner_field, size) => Ok(Box::new(json_vals_to_fixed_size_list(
            vals,
            nullable,
            inner_field.clone(),
            *size as i32,
        )?)),
        DataType::Struct(fields) => Ok(Box::new(json_vals_to_struct(
            vals,
            nullable,
            fields.clone(),
        )?)),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            field.data_type().clone(),
        ))),
    }
}

pub fn json_vals_to_any_type_col(vals: Vec<Value>, dt: &DataType) -> Result<Box<dyn Array>> {
    debug_assert!(matches!(dt, DataType::Utf8));

    let mut builder = MutableUtf8Array::<i32>::with_capacity(vals.len() * 64);
    for val in vals {
        let native: String = serde_json::to_string(&val).map_err(Error::from)?;
        builder.push(Some(native));
    }

    let array: Utf8Array<i32> = builder.into();
    Ok(array.boxed())
}

fn numeric_to_json_vals<T: NativeType + Num + Serialize>(col: &dyn Array) -> Result<Vec<Value>> {
    // TODO: Return Err if `as_primitive_array` cast fails,
    //       by calling `downcast_col` instead.
    let array = col.as_any().downcast_ref::<PrimitiveArray<T>>().unwrap();
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
        let native_val: T = array.value(i_val);
        let json_val = serde_json::to_value(native_val).unwrap_or(Value::Null);
        json_vals.push(json_val);
    }
    Ok(json_vals)
}

// Have to pretty much copy-paste `numeric_to_json_vals`, because
// the Rust Arrow crate doesn't have the function `value` in the
// `Array` trait, even though all arrays do implement that function.
fn bool_to_json_vals(col: &dyn Array) -> Result<Vec<Value>> {
    let array = col.as_any().downcast_ref::<BooleanArray>().unwrap();
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

fn utf8_to_json_vals(col: &dyn Array) -> Result<Vec<Value>> {
    let array = col.as_any().downcast_ref::<Utf8Array<i32>>().unwrap();
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

pub fn json_utf8_json_vals(col: &dyn Array) -> Result<Vec<Value>> {
    let array = col.as_any().downcast_ref::<Utf8Array<i32>>().unwrap();
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

fn list_to_json_vals(col: &dyn Array, inner_dt: &DataType) -> Result<Vec<Value>> {
    let array =
        col.as_any()
            .downcast_ref::<ListArray<i32>>()
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
        let inner_vals = col_to_json_vals(inner_col.as_ref(), inner_dt)?;
        json_vals.push(Value::Array(inner_vals));
    }
    Ok(json_vals)
}

fn fixed_size_list_to_json_vals(col: &dyn Array, inner_dt: &DataType) -> Result<Vec<Value>> {
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
        let inner_vals = col_to_json_vals(inner_col.as_ref(), inner_dt)?;
        json_vals.push(Value::Array(inner_vals));
    }
    Ok(json_vals)
}

fn struct_to_json_vals(col: &dyn Array, fields: &[Field]) -> Result<Vec<Value>> {
    let array = col
        .as_any()
        .downcast_ref::<StructArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "[custom list]".into(),
        })?;

    let mut json_vals: Vec<Value> = Vec::with_capacity(array.len());
    let columns = array.values();

    let mut object_field_maps = vec![serde_json::Map::with_capacity(fields.len()); col.len()];
    fields
        .iter()
        .enumerate()
        .try_for_each::<_, Result<()>>(|(i, field)| {
            let col = col_to_json_vals(columns[i].as_ref(), field.data_type())?;

            col.into_iter().enumerate().for_each(|(i_elem, val)| {
                object_field_maps[i_elem].insert(field.name.clone(), val);
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

pub fn col_to_json_vals(col: &dyn Array, dt: &DataType) -> Result<Vec<Value>> {
    match dt {
        DataType::Float32 => numeric_to_json_vals::<f32>(col),
        DataType::Float64 => numeric_to_json_vals::<f64>(col),
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
