use stateful::field::{FieldSpec, FieldType, FieldTypeVariant};

use crate::{package::simulation::state::behavior_execution::BehaviorKeyJsonError, Result};

pub(super) enum BaseKeyType {
    String,
    Boolean,
    Number,
    Struct,
    List,
    FixedSizeList,
    Any,
}

impl TryFrom<&str> for BaseKeyType {
    type Error = BehaviorKeyJsonError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "string" => Ok(BaseKeyType::String),
            "boolean" => Ok(BaseKeyType::Boolean),
            "number" => Ok(BaseKeyType::Number),
            "struct" => Ok(BaseKeyType::Struct),
            "list" => Ok(BaseKeyType::List),
            "fixed_size_list" => Ok(BaseKeyType::FixedSizeList),
            "any" => Ok(BaseKeyType::Any),
            _ => Err(BehaviorKeyJsonError::InvalidKeyType(value.to_string())),
        }
    }
}

pub(super) fn field_spec_from_json(name: &str, source: &serde_json::Value) -> Result<FieldSpec> {
    Ok(FieldSpec {
        name: name.to_string(),
        field_type: field_type_from_json(name, source)?,
    })
}

pub(super) fn field_type_from_json(name: &str, source: &serde_json::Value) -> Result<FieldType> {
    match source {
        serde_json::Value::Object(map) => {
            let key_base_type = match map
                .get("type")
                .ok_or_else(|| BehaviorKeyJsonError::InvalidKeyTypeType(name.to_string()))?
            {
                serde_json::Value::String(val) => BaseKeyType::try_from(val.as_ref()),
                _ => Err(BehaviorKeyJsonError::InvalidKeyTypeType(name.to_string())),
            }?;

            let nullable = match map
                .get("nullable")
                .ok_or_else(|| BehaviorKeyJsonError::InvalidKeyNullableType(name.to_string()))?
            {
                serde_json::Value::Bool(v) => Ok(*v),
                _ => Err(BehaviorKeyJsonError::InvalidKeyNullableType(
                    name.to_string(),
                )),
            }?;

            let variant = match key_base_type {
                BaseKeyType::String => FieldTypeVariant::String,
                BaseKeyType::Boolean => FieldTypeVariant::Boolean,
                BaseKeyType::Number => FieldTypeVariant::Number,
                BaseKeyType::Any => FieldTypeVariant::AnyType,
                BaseKeyType::Struct => {
                    let mut children = vec![];
                    match map.get("fields").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyFieldsType(name.to_string())
                    })? {
                        serde_json::Value::Object(map) => {
                            for (k, v) in map {
                                children.push(field_spec_from_json(k.as_ref(), v)?);
                            }
                            Ok(())
                        }
                        _ => Err(BehaviorKeyJsonError::InvalidKeyFieldsType(name.to_string())),
                    }?;

                    // Determinism:
                    children.sort_by(|a, b| a.name.cmp(&b.name));
                    FieldTypeVariant::Struct(children)
                }
                BaseKeyType::List => {
                    let child_source = map.get("child").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyChildType(name.to_string())
                    })?;
                    let child_key_type = field_type_from_json(name, child_source)?;
                    FieldTypeVariant::VariableLengthArray(Box::new(child_key_type))
                }
                BaseKeyType::FixedSizeList => {
                    let child_source = map.get("child").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyChildType(name.to_string())
                    })?;
                    let child_key_type = field_type_from_json(name, child_source)?;
                    let len = match map.get("length").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string())
                    })? {
                        serde_json::Value::Number(v) => {
                            if v.is_i64() {
                                // Safe unwrap
                                Ok(v.as_u64().unwrap() as usize)
                            } else {
                                Err(BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string()))
                            }
                        }
                        _ => Err(BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string())),
                    }?;
                    FieldTypeVariant::FixedLengthArray {
                        field_type: Box::new(child_key_type),
                        len,
                    }
                }
            };

            Ok(FieldType { variant, nullable })
        }
        _ => Err(BehaviorKeyJsonError::ExpectedKeyObject(name.to_string()).into()),
    }
}
