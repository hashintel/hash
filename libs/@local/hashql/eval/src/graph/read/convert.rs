use alloc::borrow::Cow;

use hash_graph_store::filter::Parameter;
use hashql_core::value::{Primitive, Value};
use type_system::knowledge::PropertyValue;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub(crate) enum ConversionError {
    #[display("dictionary keys must be strings")]
    DictKeyNotString,
}

fn value_to_string(value: &Value<'_>) -> Option<String> {
    match value {
        Value::Primitive(Primitive::String(string)) => Some(string.as_str().to_owned()),
        Value::Opaque(opaque) => value_to_string(opaque.value()),
        Value::Primitive(_)
        | Value::Struct(_)
        | Value::Tuple(_)
        | Value::List(_)
        | Value::Dict(_) => None,
    }
}

fn value_to_property_value(value: &Value<'_>) -> Result<PropertyValue, ConversionError> {
    match value {
        Value::Primitive(Primitive::Null) => Ok(PropertyValue::Null),
        &Value::Primitive(Primitive::Boolean(bool)) => Ok(PropertyValue::Bool(bool)),
        Value::Primitive(Primitive::Integer(integer)) => {
            Ok(PropertyValue::Number(integer.as_real()))
        }
        Value::Primitive(Primitive::Float(float)) => Ok(PropertyValue::Number(float.as_real())),
        Value::Primitive(Primitive::String(string)) => {
            Ok(PropertyValue::String(string.as_str().to_owned()))
        }
        Value::Struct(r#struct) => r#struct
            .iter()
            .map(|(key, value)| {
                let key = key.as_str().to_owned();
                let value = value_to_property_value(value)?;

                Ok((key, value))
            })
            .try_collect()
            .map(PropertyValue::Object),
        Value::Tuple(tuple) => tuple
            .iter()
            .map(value_to_property_value)
            .try_collect()
            .map(PropertyValue::Array),
        Value::List(list) => list
            .iter()
            .map(value_to_property_value)
            .try_collect()
            .map(PropertyValue::Array),
        Value::Dict(dict) => dict
            .iter()
            .map(|(key, value)| {
                let key = value_to_string(key).ok_or(ConversionError::DictKeyNotString)?;
                let value = value_to_property_value(value)?;

                Ok((key, value))
            })
            .try_collect()
            .map(PropertyValue::Object),
        Value::Opaque(opaque) => value_to_property_value(opaque.value()),
    }
}

pub(super) fn convert_value_to_parameter<'heap>(
    value: &Value<'heap>,
) -> Result<Parameter<'heap>, ConversionError> {
    match value {
        &Value::Primitive(Primitive::Boolean(bool)) => Ok(Parameter::Boolean(bool)),
        Value::Primitive(Primitive::Integer(integer)) => Ok(Parameter::Decimal(integer.as_real())),
        Value::Primitive(Primitive::Float(float)) => Ok(Parameter::Decimal(float.as_real())),
        Value::Primitive(Primitive::String(string)) => {
            Ok(Parameter::Text(Cow::Borrowed(string.as_symbol().unwrap())))
        }
        Value::Primitive(Primitive::Null)
        | Value::Struct(_)
        | Value::Tuple(_)
        | Value::List(_)
        | Value::Dict(_) => value_to_property_value(value).map(Parameter::Any),
        Value::Opaque(opaque) => convert_value_to_parameter(opaque.value()),
    }
}
