//! Logic to generate Entity Types from (and for) a given stream of entities with unknown types

use std::{
    collections::{hash_map::Entry, HashMap},
    fmt, mem,
    str::FromStr,
};

use error_stack::Context;
use serde_json;
use type_system::{
    uri::{BaseUri, VersionedUri},
    Array, DataTypeReference, Object, OneOf, PropertyType, PropertyTypeReference, PropertyValues,
    ValueOrArray,
};

const TEXT_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
const NUMBER_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
const BOOLEAN_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
const NULL_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1";
const EMPTY_LIST_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1";
const OBJECT_DATA_TYPE_ID: &'static str =
    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";

#[derive(Debug)]
pub struct NonObjectValueError;

impl Context for NonObjectValueError {}

impl fmt::Display for NonObjectValueError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Received a value other than a JSON object")
    }
}

/// TODO: DOC
pub fn transform_entity_to_type_system(
    val: serde_json::Value,
    stream_key_map: &mut HashMap<String, PropertyType>,
) -> Result<(), NonObjectValueError> {
    if let serde_json::Value::Object(entity) = val {
        tracing::warn!("Found entity");
        for (key, val) in entity {
            match val {
                serde_json::Value::Array(array) if !array.is_empty() => {
                    for array_val in array {
                        traverse_json_value(Some(&key), array_val, stream_key_map);
                    }

                    let property_type_id = stream_key_map
                        .get(&key)
                        .unwrap_or_else(|| panic!("Missing property type for key: ${key}"))
                        .id()
                        .clone();

                    // TODO: create entity type
                }
                val => {
                    traverse_json_value(Some(&key), val, stream_key_map);

                    let property_type_id = stream_key_map
                        .get(&key)
                        .unwrap_or_else(|| panic!("Missing property type for key: ${key}"))
                        .id()
                        .clone();

                    // TODO: create entity type
                }
            }
        }
    } else {
        return Err(NonObjectValueError {});
    }

    Ok(())
}

/// TODO: DOC
fn traverse_json_value(
    key: Option<&str>,
    val: serde_json::Value,
    stream_key_map: &mut HashMap<String, PropertyType>,
) -> PropertyValues {
    tracing::warn!("Traversing {:?}", key);
    let property_values = match val {
        serde_json::Value::Null => PropertyValues::DataTypeReference(DataTypeReference::new(
            VersionedUri::from_str(NULL_DATA_TYPE_ID).unwrap(),
        )),
        serde_json::Value::Bool(_) => PropertyValues::DataTypeReference(DataTypeReference::new(
            VersionedUri::from_str(BOOLEAN_DATA_TYPE_ID).unwrap(),
        )),
        serde_json::Value::Number(_) => PropertyValues::DataTypeReference(DataTypeReference::new(
            VersionedUri::from_str(NUMBER_DATA_TYPE_ID).unwrap(),
        )),
        serde_json::Value::String(_) => PropertyValues::DataTypeReference(DataTypeReference::new(
            VersionedUri::from_str(TEXT_DATA_TYPE_ID).unwrap(),
        )),
        serde_json::Value::Array(array) => {
            if array.is_empty() {
                PropertyValues::DataTypeReference(DataTypeReference::new(
                    VersionedUri::from_str(EMPTY_LIST_DATA_TYPE_ID).unwrap(),
                ))
            } else {
                PropertyValues::ArrayOfPropertyValues(Array::new(
                    OneOf::new_unchecked(
                        array
                            .into_iter()
                            .map(|array_val| traverse_json_value(None, array_val, stream_key_map))
                            .collect::<Vec<_>>(),
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
                    let inner_property_values =
                        traverse_json_value(Some(&inner_key), inner_val, stream_key_map);
                    let property_type = stream_key_map
                        .get(&inner_key)
                        .unwrap_or_else(|| panic!("Missing property type for key: ${key:?}"));

                    (
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
                // TODO - check if property type already has this in the oneOf
                //  could be helpful to have `hash`
                tracing::warn!(
                    id = property_type.id().to_string(),
                    "Updating existing property type"
                );
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
                            .chain([property_values.clone()])
                            .collect::<Vec<_>>(),
                    ),
                );
                mem::swap(property_type, &mut new_property_type);
            }
            Entry::Vacant(entry) => {
                let property_type_id = VersionedUri::new(
                    BaseUri::new(format!(
                        "http://localhost:3000/@alice/types/property-type/generated-${key}/"
                    ))
                    .unwrap(),
                    1,
                );
                tracing::warn!(
                    id = property_type_id.to_string(),
                    "Creating new property type"
                );
                entry.insert(PropertyType::new(
                    property_type_id,
                    key.to_owned(),
                    Some(format!("An autogenerated property")),
                    OneOf::new_unchecked(Vec::from([property_values.clone()])),
                ));
            }
        }
    }

    property_values
}
