#![allow(clippy::cast_sign_loss, clippy::missing_safety_doc)]

use std::ffi::CStr;

use arrow2::datatypes::{DataType, Field, Schema};

use crate::{
    arrow::ffi::ArrowSchema,
    error::{Error, Result},
};

const ARROW_FLAG_NULLABLE: i64 = 2;

pub unsafe fn c_schema_to_rust(c_schema: &ArrowSchema) -> Result<Schema> {
    let column_num = c_schema.n_children as usize;
    let mut fields = Vec::with_capacity(column_num);

    (0..column_num).try_for_each::<_, Result<()>>(|i| {
        let child = &**c_schema.children.add(i);
        fields.push(c_column_to_rust(child)?);
        Ok(())
    })?;

    Ok(Schema {
        fields,
        metadata: Default::default(),
    })
}

unsafe fn c_column_to_rust(c_field: &ArrowSchema) -> Result<Field> {
    let field_name = CStr::from_ptr(c_field.name).to_str().unwrap();
    let nullable = c_field.flags == ARROW_FLAG_NULLABLE;
    let data_type = c_datatype_to_rust(c_field)?;
    Ok(Field::new(field_name, data_type, nullable))
}

#[allow(clippy::match_on_vec_items)]
unsafe fn c_datatype_to_rust(c_field: &ArrowSchema) -> Result<DataType> {
    let field_type = CStr::from_ptr(c_field.format).to_str().unwrap();
    let split = field_type.split(':').collect::<Vec<_>>();
    let dt = match split[0] {
        "c" => DataType::Int8,
        "s" => DataType::Int16,
        "i" => DataType::Int32,
        "l" => DataType::Int64,
        "C" => DataType::UInt8,
        "S" => DataType::UInt16,
        "I" => DataType::UInt32,
        "L" => DataType::UInt64,
        "b" => DataType::Boolean,
        "n" => DataType::Null,
        "e" => DataType::Float16,
        "f" => DataType::Float32,
        "g" => DataType::Float64,
        "w" => {
            let size = split
                .get(1)
                .ok_or_else(|| dt_error("Missing fixed size binary datatype", field_type))?
                .parse::<usize>()
                .map_err(|e| dt_error(&e.to_string(), field_type))?;

            DataType::FixedSizeBinary(size)
        }
        "z" => DataType::Binary,
        "Z" => DataType::LargeBinary,
        "u" => DataType::Utf8,
        "U" => DataType::LargeUtf8,
        "+l" => DataType::List(Box::new(c_column_to_rust(&**c_field.children)?)),
        "+w" => {
            let size = split
                .get(1)
                .ok_or_else(|| dt_error("Missing fixed size binary datatype", field_type))?
                .parse::<usize>()
                .map_err(|e| dt_error(&e.to_string(), field_type))?;
            DataType::FixedSizeList(Box::new(c_column_to_rust(&**c_field.children)?), size)
        }
        "+L" => DataType::LargeList(Box::new(c_column_to_rust(&**c_field.children)?)),
        "+s" => {
            // Schema
            let num_fields = c_field.n_children as usize;
            let fields = (0..num_fields)
                .map(|i| {
                    let child = &**c_field.children.add(i);
                    c_column_to_rust(child)
                })
                .collect::<Result<_>>()?;

            DataType::Struct(fields)
        }
        _ => return Err(dt_error("Invalid value", field_type)),
    };
    Ok(dt)
}

fn dt_error(description: &str, value: &str) -> Error {
    Error::from(format!(
        "Schema parse error: {}. Value: \"{}\".",
        description, value
    ))
}
