#![allow(
    clippy::too_many_lines,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]

use arrow::{
    array::{self, Array, ArrayRef},
    datatypes::{self, ArrowNativeType, ArrowNumericType, ArrowPrimitiveType, DataType},
};
use serde_json::value::Value;

use super::{batch_conversion::col_to_json_vals, prelude::*};
use crate::datastore::prelude::*;

// TODO: unused?
fn numeric_element_to_json_val<T: ArrowPrimitiveType + ArrowNumericType>(
    col: &ArrayRef,
    index: usize,
) -> Result<Value> {
    // TODO: Return Err if `as_primitive_array` cast fails,
    //       by calling `downcast_col` instead.
    let array = array::as_primitive_array::<T>(col);

    if !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let native_val: T::Native = array.value(index);
        Ok(native_val.into_json_value().unwrap_or(Value::Null))
    }
}

// TODO: unused?
fn bool_element_to_json_val(col: &ArrayRef, index: usize) -> Result<Value> {
    let array = array::as_boolean_array(col);
    if !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let native_val = array.value(index);
        Ok(native_val.into_json_value().unwrap_or(Value::Null))
    }
}

// TODO: unused?
fn utf8_element_to_json_val(col: &ArrayRef, index: usize) -> Result<Value> {
    let array = array::as_string_array(col);
    if !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let native_val = array.value(index);
        Ok(Value::String(native_val.to_string()))
    }
}

// TODO: unused?
fn list_element_to_json_val(col: &ArrayRef, index: usize, inner_dt: &DataType) -> Result<Value> {
    let array =
        col.as_any()
            .downcast_ref::<array::ListArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: "[custom list]".into(),
            })?;
    if !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let inner_col = array.value(index);
        let inner_vals = col_to_json_vals(&inner_col, inner_dt)?;
        Ok(Value::Array(inner_vals))
    }
}

// TODO: unused?
fn fixed_size_list_element_to_json_val(
    col: &ArrayRef,
    index: usize,
    inner_dt: &DataType,
) -> Result<Value> {
    let array = col
        .as_any()
        .downcast_ref::<array::FixedSizeListArray>()
        .ok_or(Error::InvalidArrowDowncast {
            name: "[custom list]".into(),
        })?;

    if !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let inner_col = array.value(index);
        let inner_vals = col_to_json_vals(&inner_col, inner_dt)?;
        Ok(Value::Array(inner_vals))
    }
}

// TODO: unused?
fn struct_element_to_json_val(
    col: &ArrayRef,
    index: usize,
    fields: &[ArrowField],
) -> Result<Value> {
    let array =
        col.as_any()
            .downcast_ref::<array::StructArray>()
            .ok_or(Error::InvalidArrowDowncast {
                name: "[custom list]".into(),
            })?;

    let columns = array.columns_ref();

    if array.null_count() > 0 && !array.is_valid(index) {
        Ok(Value::Null)
    } else {
        let mut object_fields = serde_json::Map::with_capacity(fields.len());
        fields
            .iter()
            .enumerate()
            .try_for_each::<_, Result<()>>(|(i, field)| {
                let val = col_element_to_json_val(&columns[i], index, field.data_type())?;
                object_fields.insert(field.name().clone(), val);
                Ok(())
            })?;
        Ok(Value::Object(object_fields))
    }
}

// TODO: unused?
pub fn col_element_to_json_val(col: &ArrayRef, index: usize, dt: &DataType) -> Result<Value> {
    match dt {
        ArrowDataType::Float32 => numeric_element_to_json_val::<datatypes::Float32Type>(col, index),
        ArrowDataType::Float64 => numeric_element_to_json_val::<datatypes::Float64Type>(col, index),
        ArrowDataType::Int8 => numeric_element_to_json_val::<datatypes::Int8Type>(col, index),
        ArrowDataType::Int16 => numeric_element_to_json_val::<datatypes::Int16Type>(col, index),
        ArrowDataType::Int32 => numeric_element_to_json_val::<datatypes::Int32Type>(col, index),
        ArrowDataType::Int64 => numeric_element_to_json_val::<datatypes::Int64Type>(col, index),
        ArrowDataType::UInt8 => numeric_element_to_json_val::<datatypes::UInt8Type>(col, index),
        ArrowDataType::UInt16 => numeric_element_to_json_val::<datatypes::UInt16Type>(col, index),
        ArrowDataType::UInt32 => numeric_element_to_json_val::<datatypes::UInt32Type>(col, index),
        ArrowDataType::UInt64 => numeric_element_to_json_val::<datatypes::UInt64Type>(col, index),
        ArrowDataType::Boolean => bool_element_to_json_val(col, index),
        ArrowDataType::Utf8 => utf8_element_to_json_val(col, index),

        // `Box<T>` isn't coerced to `&T`, so need explicit `&*`.
        ArrowDataType::List(inner_dt) => list_element_to_json_val(col, index, &*inner_dt),
        ArrowDataType::FixedSizeList(inner_dt, _) => {
            fixed_size_list_element_to_json_val(col, index, &*inner_dt)
        }
        ArrowDataType::Struct(fields) => struct_element_to_json_val(col, index, fields),
        _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
            dt.clone(),
        ))),
    }
}

#[cfg(test)]
pub mod tests {
    use std::sync::Arc;

    use arrow::array::{
        ArrayData, BooleanArray, Float32Array, Float64Array, Int16Array, Int32Array, Int64Array,
        Int8Array, StringArray, UInt16Array, UInt32Array, UInt64Array, UInt8Array,
    };
    use serde_json::json;

    use super::*;

    #[test]
    fn numeric_element_conversion() {
        let int_dtypes_and_array_refs: Vec<(DataType, ArrayRef)> = vec![
            (
                DataType::Int8,
                Arc::new(Int8Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::Int16,
                Arc::new(Int16Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::Int32,
                Arc::new(Int32Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::Int64,
                Arc::new(Int64Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::UInt8,
                Arc::new(UInt8Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::UInt16,
                Arc::new(UInt16Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::UInt32,
                Arc::new(UInt32Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
            (
                DataType::UInt64,
                Arc::new(UInt64Array::from(vec![1, 2, 3, 4, 5, 6])),
            ),
        ];

        for (d_type, array_ref) in int_dtypes_and_array_refs {
            for (idx, expected_val) in (1..=6).enumerate() {
                assert_eq!(
                    col_element_to_json_val(&array_ref, idx, &d_type).unwrap(),
                    json!(expected_val)
                );
            }
        }

        let float_dtypes_and_array_refs: Vec<(DataType, ArrayRef)> = vec![
            (
                DataType::Float32,
                Arc::new(Float32Array::from(vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0])),
            ),
            (
                DataType::Float64,
                Arc::new(Float64Array::from(vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0])),
            ),
        ];

        for (d_type, array_ref) in float_dtypes_and_array_refs {
            for (idx, expected_val) in (1..=6).enumerate() {
                assert_eq!(
                    col_element_to_json_val(&array_ref, idx, &d_type).unwrap(),
                    json!(expected_val as f64)
                );
            }
        }
    }

    #[test]
    fn bool_element_conversion() {
        // 9 values to somewhat check bit packing
        let vals = vec![true, true, false, true, false, false, true, false, true];
        let bool_array = BooleanArray::from(vals.clone());
        let array_ref = Arc::new(bool_array) as ArrayRef;

        for (idx, &expected_val) in vals.iter().enumerate() {
            assert_eq!(
                col_element_to_json_val(&array_ref, idx, &DataType::Boolean).unwrap(),
                json!(expected_val)
            );
        }
    }

    #[test]
    fn utf8_element_conversion() {
        let vals = vec!["foo", "bar", "baz"];
        let string_array = StringArray::from(vals.clone());
        let array_ref = Arc::new(string_array) as ArrayRef;

        for (idx, &expected_val) in vals.iter().enumerate() {
            assert_eq!(
                col_element_to_json_val(&array_ref, idx, &DataType::Utf8).unwrap(),
                json!(expected_val)
            );
        }
    }

    #[test]
    fn list_element_conversion() {
        let vals = vec![
            vec![1, 2],
            vec![1],
            vec![1, 2, 3, 4, 5],
            vec![3, 5],
            vec![6, 9, 1],
            vec![],
        ];

        let uint32_builder = arrow::array::UInt32Builder::new(vals.len());
        let mut uint32_list_builder = arrow::array::ListBuilder::new(uint32_builder);
        for list in &vals {
            for num in list {
                uint32_list_builder.values().append_value(*num).unwrap();
            }
            uint32_list_builder.append(true).unwrap();
        }
        let uint32_list = uint32_list_builder.finish();
        let array_ref = Arc::new(uint32_list) as ArrayRef;

        for (idx, expected_val) in vals.iter().enumerate() {
            assert_eq!(
                col_element_to_json_val(
                    &array_ref,
                    idx,
                    &DataType::List(Box::new(DataType::UInt32))
                )
                .unwrap(),
                json!(expected_val)
            );
        }
    }

    #[test]
    fn fixed_size_list_element_conversion() {
        let vals = vec![vec![1, 2], vec![3, 4], vec![5, 6], vec![7, 8], vec![9, 10]];

        let uint32_builder = arrow::array::UInt32Builder::new(vals.len());
        let mut uint32_list_builder =
            arrow::array::FixedSizeListBuilder::new(uint32_builder, vals[0].len() as i32);
        for list in &vals {
            for num in list {
                uint32_list_builder.values().append_value(*num).unwrap();
            }
            uint32_list_builder.append(true).unwrap();
        }
        let uint32_list = uint32_list_builder.finish();
        let array_ref = Arc::new(uint32_list) as ArrayRef;

        for (idx, expected_val) in vals.iter().enumerate() {
            assert_eq!(
                col_element_to_json_val(
                    &array_ref,
                    idx,
                    &DataType::FixedSizeList(Box::new(DataType::UInt32), 2)
                )
                .unwrap(),
                json!(expected_val)
            );
        }
    }

    #[test]
    fn struct_element_conversion() {
        let string_vals = vec![
            "foobar", "foo", "bar", "ran", "out", "of", "test", "words", "hash",
        ];
        let string_array = StringArray::from(string_vals.clone());

        // 9 values to somewhat check bit packing
        let bool_vals = vec![true, true, false, true, true, false, false, true, false];
        let bool_array = arrow::array::BooleanArray::from(bool_vals.clone());

        let fields = vec![
            ArrowField::new("a", DataType::Utf8, false),
            ArrowField::new("b", DataType::Boolean, false),
        ];

        let struct_c0 = arrow::array::StructArray::from(vec![
            (fields[0].clone(), Arc::new(string_array) as ArrayRef),
            (fields[1].clone(), Arc::new(bool_array) as ArrayRef),
        ]);

        let array_ref = Arc::new(struct_c0) as ArrayRef;
        let struct_dtype = DataType::Struct(fields);
        for (idx, (expected_str, expected_bool)) in string_vals
            .into_iter()
            .zip(bool_vals.into_iter())
            .enumerate()
        {
            assert_eq!(
                col_element_to_json_val(&array_ref, idx, &struct_dtype).unwrap(),
                json!({
                    "a": expected_str,
                    "b": expected_bool
                })
            )
        }

        // check it works with an empty struct too
        let struct_c1 =
            arrow::array::StructArray::from(ArrayData::builder(DataType::Struct(vec![])).build());

        assert_eq!(
            col_element_to_json_val(
                &(Arc::new(struct_c1) as ArrayRef),
                0,
                &DataType::Struct(vec![])
            )
            .unwrap(),
            json!({})
        );
    }
}
