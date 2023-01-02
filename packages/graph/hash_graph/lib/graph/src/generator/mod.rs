//! Logic to generate Entity Types from (and for) a given stream of entities with unknown types

use std::{
    collections::{hash_map::Entry, HashMap},
    fmt, mem,
};

use error_stack::Context;
use serde_json;
use type_system::{
    uri::{BaseUri, VersionedUri},
    Array, Object, OneOf, PropertyType, PropertyTypeReference, PropertyValues, ValueOrArray,
};

const TEXT_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned())
        .unwrap(),
    1,
);
const NUMBER_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/number/".to_owned())
        .unwrap(),
    1,
);
const BOOLEAN_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/boolean/".to_owned())
        .unwrap(),
    1,
);
const NULL_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/null/".to_owned())
        .unwrap(),
    1,
);
const EMPTY_LIST_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/".to_owned())
        .unwrap(),
    1,
);
const OBJECT_DATA_TYPE_ID: VersionedUri = VersionedUri::new(
    BaseUri::new("https://blockprotocol.org/@blockprotocol/types/data-type/object/".to_owned())
        .unwrap(),
    1,
);

#[derive(Debug)]
pub struct NonObjectValueError;

impl Context for NonObjectValueError {}

impl fmt::Display for NonObjectValueError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Received a value other than a JSON object")
    }
}

fn transform_entity_to_type_system(val: serde_json::Value) -> Result<(), NonObjectValueError> {
    let stream_key_map = HashMap::new();

    if let serde_json::Value::Object(entity) = val {
        for (key, val) in entity {
            traverse_json_value(Some(&key), val, &mut stream_key_map);
        }
    } else {
        return Err(NonObjectValueError {});
    }
}

fn traverse_json_value(
    key: Option<&str>,
    val: serde_json::Value,
    stream_key_map: &mut HashMap<String, PropertyType>,
) -> PropertyValues {
    let property_values = match val {
        serde_json::Value::Null => {
            PropertyValues::DataTypeReference(NULL_DATA_TYPE_ID.clone().into())
        }
        serde_json::Value::Bool(_) => {
            PropertyValues::DataTypeReference(BOOLEAN_DATA_TYPE_ID.clone().into())
        }
        serde_json::Value::Number(_) => {
            PropertyValues::DataTypeReference(NUMBER_DATA_TYPE_ID.clone().into())
        }
        serde_json::Value::String(_) => {
            PropertyValues::DataTypeReference(TEXT_DATA_TYPE_ID.clone().into())
        }
        serde_json::Value::Array(array) => {
            if array.is_empty() {
                PropertyValues::DataTypeReference(EMPTY_LIST_DATA_TYPE_ID.clone().into())
            } else {
                PropertyValues::ArrayOfPropertyValues(Array::new(
                    OneOf::new_unchecked(
                        array.into_iter().map(|array_val| traverse(None, array_val)),
                    ),
                    None,
                    None,
                ))
            }
        }
        serde_json::Value::Object(object) => {
            let property_type_object = object
                .into_iter()
                .map(|(inner_key, inner_val)| {
                    let inner_property_values = traverse_json(inner_key, inner_val, stream_key_map);
                    let property_type = stream_key_map
                        .get(inner_key)
                        .unwrap_or_else(|| format!("Missing property type for key: ${key}"));

                    property_type_object.insert(
                        property_type.id().base_uri().clone(),
                        match inner_property_values {
                            PropertyValues::ArrayOfPropertyValues(_) => {
                                ValueOrArray::Array(Array::new(
                                    PropertyTypeReference::new(property_type.id().clone()),
                                    None,
                                    None,
                                ))
                            }
                            _ => ValueOrArray::Value(PropertyTypeReference::new(
                                property_type.id().clone(),
                            )),
                        },
                    )
                })
                .collect();

            PropertyValues::PropertyTypeObject(Object::new_unchecked(
                property_type_object,
                Vec::with_capacity(0),
            ))
        }
    };

    if let Some(key) = key {
        match stream_key_map.entry(key.to_owned()) {
            Entry::Occupied(entry) => {
                let property_type = entry.into_mut();
                // TODO - fix all this cloning
                let mut new_property_type = PropertyType::new(
                    property_type.id().clone(),
                    property_type.title().to_owned(),
                    property_type
                        .description()
                        .map(|description| description.to_owned()),
                    OneOf::new_unchecked(
                        property_type
                            .one_of()
                            .into_iter()
                            .cloned()
                            .concat([property_values.clone()])
                            .collect(),
                    ),
                );
                mem::swap(property_type, &mut new_property_type);
            }
            Entry::Vacant(entry) => {
                entry.insert(PropertyType::new(
                    VersionedUri::new(
                        BaseUri::new(format!("http://localhost:3000/@alice/types/entity-type/"))
                            .unwrap(),
                        1,
                    ),
                    key.to_owned(),
                    Some(format!("An autogenerated property")),
                    OneOf::new_unchecked(Vec::from([PropertyValues])),
                ));
            }
        }
    }

    property_values
}
