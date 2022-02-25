use std::collections::HashMap;

use super::{FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant};
use crate::datastore::{
    error::Result,
    schema::{FieldScope, FieldSource, RootFieldSpec},
};

#[derive(thiserror::Error, Debug)]
pub enum ShortJsonError {
    #[error("Could not find 'fields' field in input")]
    MissingFields,
    #[error("'fields' field in input is not an object")]
    FieldsIsNotObject,
    #[error("Tried to parse `FieldSpec`s from invalid json (was expecting an object)")]
    InvalidFormatForFieldsObject,
    #[error("Invalid field type representation, expected {0}")]
    InvalidFieldType(ExpectedFieldType),
    #[error("Any-types are only allowed at the top level")]
    InvalidAnyTypeLevel,
}

#[derive(Debug)]
pub enum ExpectedFieldType {
    StringOrCustom,
    String,
    Custom,
}

impl std::fmt::Display for ExpectedFieldType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use ExpectedFieldType::{Custom, String, StringOrCustom};
        match self {
            StringOrCustom => write!(f, "string or custom type"),
            Custom => write!(f, "custom type"),
            String => write!(f, "valid string value"),
        }
    }
}

const DEFINED_KEY: &str = "defined"; // TODO: unused?
const SPECS_KEY: &str = "keys"; // TODO: unused?

impl FieldType {
    // TODO: unused?
    fn from_short_string(
        name: &str,
        definitions: Option<&HashMap<&str, FieldSpec>>,
        depth: usize,
    ) -> Result<FieldType> {
        let lower = name.to_lowercase();
        let is_array = name.starts_with('[');
        let is_nullable = name.ends_with('?');

        if is_array {
            let mut within_array_name = String::with_capacity(lower.len() - 2);
            let mut is_sized = false;
            let mut char_iter = lower
                .chars()
                .skip(1)
                .take(lower.len() - (if is_nullable { 3 } else { 2 }));

            let mut array_depth = 0;

            for ch in &mut char_iter {
                if ch == '[' {
                    array_depth += 1;
                } else if ch == ']' {
                    array_depth -= 1;
                }
                if !is_sized && array_depth == 0 && ch == ';' {
                    is_sized = true;
                    break;
                }
                within_array_name.push(ch);
            }

            let arr_type =
                FieldType::from_short_string(&*within_array_name, definitions, depth + 1)?;
            if is_sized {
                Ok(FieldType::new(
                    FieldTypeVariant::FixedLengthArray {
                        kind: Box::new(arr_type),
                        len: char_iter.collect::<String>().trim().parse::<usize>()?,
                    },
                    is_nullable,
                ))
            } else {
                Ok(FieldType::new(
                    FieldTypeVariant::VariableLengthArray(Box::new(arr_type)),
                    is_nullable,
                ))
            }
        } else {
            let key = if is_nullable {
                std::borrow::Cow::Owned(lower.chars().take(lower.len() - 1).collect::<String>())
            } else {
                std::borrow::Cow::Borrowed(&lower)
            };
            match &**key {
                "number" => Ok(FieldType::new(FieldTypeVariant::Number, is_nullable)),
                "boolean" => Ok(FieldType::new(FieldTypeVariant::Boolean, is_nullable)),
                "string" => Ok(FieldType::new(FieldTypeVariant::String, is_nullable)),
                "any" => {
                    if depth != 0 {
                        return Err(ShortJsonError::InvalidAnyTypeLevel.into());
                    }
                    Ok(FieldType::new(FieldTypeVariant::AnyType, is_nullable))
                }
                _ => {
                    if let Some(key) = definitions.and_then(|defs| defs.get(name)) {
                        Ok(key.field_type.clone())
                    } else {
                        Err(ShortJsonError::InvalidFieldType(ExpectedFieldType::String).into())
                    }
                }
            }
        }
    }
}

impl FieldSpec {
    // TODO: unused?
    fn from_short_json_object(
        name: &str,
        value: &serde_json::Value,
        definitions: Option<&HashMap<&str, FieldSpec>>,
    ) -> Result<FieldSpec> {
        use serde_json::Value;
        match value {
            Value::Object(o) => {
                let mut struct_items = Vec::with_capacity(o.len());
                for (key, value) in o.iter() {
                    struct_items.push(FieldSpec::from_short_json_value(key, value, definitions)?);
                }

                let spec = FieldSpec {
                    name: name.into(),
                    field_type: FieldType::new(FieldTypeVariant::Struct(struct_items), false),
                };
                Ok(spec)
            }
            _ => Err(ShortJsonError::InvalidFieldType(ExpectedFieldType::Custom).into()),
        }
    }

    // TODO: unused?
    fn from_short_json_value(
        name: &str,
        value: &serde_json::Value,
        definitions: Option<&HashMap<&str, FieldSpec>>,
    ) -> Result<FieldSpec> {
        use serde_json::Value;
        match value {
            // "key": "string", "key": "boolean?"
            Value::String(s) => {
                let field_type = FieldType::from_short_string(s, definitions, 0)?;
                let spec = FieldSpec {
                    name: name.into(),
                    field_type,
                };
                Ok(spec)
            }
            Value::Object(_) => FieldSpec::from_short_json_object(name, value, definitions),
            _ => Err(ShortJsonError::InvalidFieldType(ExpectedFieldType::StringOrCustom).into()),
        }
    }
}

impl FieldSpecMap {
    // TODO: unused?
    pub(in crate::datastore) fn from_short_json(
        json: serde_json::Value,
        source: FieldSource,
        scope: FieldScope,
    ) -> Result<FieldSpecMap> {
        if let serde_json::Value::Object(object_map) = json {
            let mut field_spec_map = FieldSpecMap::default();
            let mut definitions = None;
            let mut map: HashMap<&str, FieldSpec> = HashMap::new();
            if let Some(defined_object_map) = object_map
                .get(DEFINED_KEY)
                .and_then(serde_json::Value::as_object)
            {
                for (key, value) in defined_object_map.iter() {
                    map.insert(
                        &*key,
                        FieldSpec::from_short_json_object(key, value, Some(&map))?,
                    );
                }
                definitions = Some(&map);
            }
            if let Some(value) = object_map.get(SPECS_KEY) {
                if let serde_json::Value::Object(keys_object) = value {
                    for (key, value) in keys_object.iter() {
                        let inner = FieldSpec::from_short_json_value(key, value, definitions)?;
                        let root = RootFieldSpec {
                            inner,
                            scope: scope.clone(),
                            source: source.clone(),
                        };
                        field_spec_map.add(root)?;
                    }
                    let previous_index_spec = RootFieldSpec {
                        inner: FieldSpec::last_state_index_key(),
                        source: FieldSource::Engine,
                        scope: FieldScope::Hidden,
                    };
                    field_spec_map.add(previous_index_spec)?;
                    Ok(field_spec_map)
                } else {
                    Err(ShortJsonError::FieldsIsNotObject.into())
                }
            } else {
                Err(ShortJsonError::MissingFields.into())
            }
        } else {
            Err(ShortJsonError::InvalidFormatForFieldsObject.into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_keyset_from_json() {
        let json = serde_json::json!({
            "defined": {
                "foo": {
                    "bar": "number",
                    "baz": "[number]",
                    "qux": "[number; 4]",
                    "quux": "[string; 16]?",
                }
            },
            "keys": {
                "xyz": "string",
                "switch": "boolean",
                "nullableSwitch": "boolean?",
                "complex": {
                    "position": "[number; 2]",
                    "abc": "[foo; 6]"
                },
                "complexArray": "[[number; 5]]",
                "complexArrayFoo": "[[string; 5]; 20]",
                "complexArrayBar": "[[string]; 20]",
                "complexArrayBaz": "[[[[[foo]]]]; 20]",
                "complexArrayQux": "[[[number]]]",
            }
        });
        let key_set = FieldSpecMap::from_short_json(json, FieldSource::Engine, FieldScope::Agent)
            .expect("KeySet should be able to be created from this JSON");
        // 10 not 9 because we have to special __previous_index field in there too
        assert_eq!(key_set.len(), 10);
    }
}
