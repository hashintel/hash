use std::cmp::Ordering;

use float_cmp::approx_eq;

use crate::{
    package::simulation::output::analysis::analyzer::{
        ComparisonRepr, MapIterator, ValueIterator, ULPS,
    },
    Error, Result,
};

fn array_element_exists_as_non_null(value: &serde_json::Value, index: usize) -> bool {
    if let Some(array) = value.as_array() {
        if let Some(value) = array.get(index) {
            return !value.is_null();
        }
    }
    false
}

fn object_field_exists_as_non_null(value: &serde_json::Value, field: &str) -> bool {
    if let Some(object) = value.as_object() {
        if let Some(value) = object.get(field) {
            return !value.is_null();
        }
    }
    false
}

fn value_iterator_filter_on_array_element_null(
    index: u64,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => value_filter_null_array_element!(index, exists, !exists),
        ComparisonRepr::Neq => value_filter_null_array_element!(index, exists, exists),
        _ => {
            return Err(Error::from(
                "For Null comparison only 'eq' and 'neq' operators are allowed",
            ));
        }
    };
    Ok(map)
}

fn value_iterator_filter_on_object_field_null(
    name: String,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => value_filter_null_object_field!(name, cloned_name, exists, !exists),
        ComparisonRepr::Neq => value_filter_null_object_field!(name, cloned_name, exists, exists),
        _ => {
            return Err(Error::from(
                "For Null comparison only 'eq' and 'neq' operators are allowed",
            ));
        }
    };
    Ok(map)
}

fn value_iterator_filter_on_array_element_boolean(
    index: u64,
    boolean: bool,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => {
            value_filter_boolean_array_element!(index, val, val == boolean, false)
        }
        ComparisonRepr::Neq => {
            value_filter_boolean_array_element!(index, val, val != boolean, true)
        }
        _ => {
            return Err(Error::from(
                "For Boolean comparison only 'eq' and 'neq' operators are allowed",
            ));
        }
    };
    Ok(map)
}

fn value_iterator_filter_on_object_field_boolean(
    name: String,
    boolean: bool,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => value_filter_boolean_object_field!(name, val, val == boolean, false),
        ComparisonRepr::Neq => value_filter_boolean_object_field!(name, val, val != boolean, true),
        _ => {
            return Err(Error::from(
                "For Boolean comparison only 'eq' and 'neq' operators are allowed",
            ));
        }
    };
    Ok(map)
}

fn value_iterator_filter_on_array_element_number(
    index: u64,
    float: f64,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => {
            value_filter_f64_array_element!(index, v, approx_eq!(f64, v, float, ulps = ULPS), false)
        }
        ComparisonRepr::Neq => {
            value_filter_f64_array_element!(index, v, !approx_eq!(f64, v, float, ulps = ULPS), true)
        }
        ComparisonRepr::Lt => value_filter_f64_array_element!(
            index,
            v,
            v < float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Lte => value_filter_f64_array_element!(
            index,
            v,
            v < float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gt => value_filter_f64_array_element!(
            index,
            v,
            v > float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gte => value_filter_f64_array_element!(
            index,
            v,
            v > float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
    };
    Ok(map)
}

fn value_iterator_filter_on_object_field_number(
    name: String,
    float: f64,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => {
            value_filter_f64_object_field!(name, v, approx_eq!(f64, v, float, ulps = ULPS), false)
        }
        ComparisonRepr::Neq => {
            value_filter_f64_object_field!(name, v, !approx_eq!(f64, v, float, ulps = ULPS), true)
        }
        ComparisonRepr::Lt => value_filter_f64_object_field!(
            name,
            v,
            v < float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Lte => value_filter_f64_object_field!(
            name,
            v,
            v < float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gt => value_filter_f64_object_field!(
            name,
            v,
            v > float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gte => value_filter_f64_object_field!(
            name,
            v,
            v > float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
    };
    Ok(map)
}

fn value_iterator_filter_on_array_element_string(
    index: u64,
    string: String,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => {
            value_filter_string_array_element!(index, val, string, cloned, val == cloned, false)
        }
        ComparisonRepr::Neq => {
            value_filter_string_array_element!(index, val, string, cloned, val != cloned, true)
        }
        ComparisonRepr::Lt => value_filter_string_array_element!(
            index,
            val,
            string,
            cloned,
            val.cmp(&cloned) == Ordering::Less,
            false
        ),
        ComparisonRepr::Lte => value_filter_string_array_element!(
            index,
            val,
            string,
            cloned,
            matches!(val.cmp(&cloned), Ordering::Less | Ordering::Equal),
            false
        ),
        ComparisonRepr::Gt => value_filter_string_array_element!(
            index,
            val,
            string,
            cloned,
            val.cmp(&cloned) == Ordering::Greater,
            false
        ),
        ComparisonRepr::Gte => value_filter_string_array_element!(
            index,
            val,
            string,
            cloned,
            matches!(val.cmp(&cloned), Ordering::Greater | Ordering::Equal),
            false
        ),
    };
    Ok(map)
}

fn value_iterator_filter_on_object_field_string(
    name: String,
    string: String,
    comparison: &ComparisonRepr,
) -> Result<MapIterator> {
    let map: MapIterator = match comparison {
        ComparisonRepr::Eq => {
            value_filter_string_object_field!(name, val, string, cloned, val == cloned, false)
        }
        ComparisonRepr::Neq => {
            value_filter_string_object_field!(name, val, string, cloned, val != cloned, true)
        }
        ComparisonRepr::Lt => value_filter_string_object_field!(
            name,
            val,
            string,
            cloned,
            val.cmp(&cloned) == Ordering::Less,
            false
        ),
        ComparisonRepr::Lte => value_filter_string_object_field!(
            name,
            val,
            string,
            cloned,
            matches!(val.cmp(&cloned), Ordering::Less | Ordering::Equal),
            false
        ),
        ComparisonRepr::Gt => value_filter_string_object_field!(
            name,
            val,
            string,
            cloned,
            val.cmp(&cloned) == Ordering::Greater,
            false
        ),
        ComparisonRepr::Gte => value_filter_string_object_field!(
            name,
            val,
            string,
            cloned,
            matches!(val.cmp(&cloned), Ordering::Greater | Ordering::Equal),
            false
        ),
    };
    Ok(map)
}

pub(super) fn value_iterator_filter(
    field: serde_json::Value,
    comparison: &ComparisonRepr,
    value: &serde_json::Value,
) -> Result<MapIterator> {
    let map: MapIterator = if let Some(index) = field.as_u64() {
        match value {
            serde_json::Value::Bool(boolean) => {
                value_iterator_filter_on_array_element_boolean(index, *boolean, comparison)?
            }
            serde_json::Value::Number(number) => value_iterator_filter_on_array_element_number(
                index,
                number.as_f64().unwrap(),
                comparison,
            )?,
            serde_json::Value::String(string) => {
                value_iterator_filter_on_array_element_string(index, string.clone(), comparison)?
            }
            serde_json::Value::Null => {
                value_iterator_filter_on_array_element_null(index, comparison)?
            }
            _ => {
                return Err(Error::from(
                    "Filtering can only be done with number/boolean or string values",
                ));
            }
        }
    } else if let Some(field_name) = field.as_str() {
        let name = field_name.to_string();
        match value {
            serde_json::Value::Bool(boolean) => {
                value_iterator_filter_on_object_field_boolean(name, *boolean, comparison)?
            }
            serde_json::Value::Number(number) => value_iterator_filter_on_object_field_number(
                name,
                number.as_f64().unwrap(),
                comparison,
            )?,
            serde_json::Value::String(string) => {
                value_iterator_filter_on_object_field_string(name, string.clone(), comparison)?
            }
            serde_json::Value::Null => {
                value_iterator_filter_on_object_field_null(name, comparison)?
            }
            _ => {
                return Err(Error::from(
                    "Filtering can only be done with number/boolean or string values",
                ));
            }
        }
    } else {
        return Err(Error::from(
            "Using the 'filter' operator requires that the 'field' value must be of a \
             non-negative numerical or string type",
        ));
    };

    Ok(map)
}

pub(super) fn value_iterator_mapper(field: serde_json::Value) -> Result<MapIterator> {
    let map: MapIterator = if let Some(index) = field.as_u64() {
        // Iterator must be over array types
        Box::new(move |value_iterator| {
            let mapped: ValueIterator<'_> = Box::new(value_iterator.map(move |a| {
                if let Some(array) = a.as_array() {
                    if (index as usize) < array.len() {
                        array[index as usize].clone()
                    } else {
                        serde_json::Value::Null
                    }
                } else {
                    serde_json::Value::Null
                }
            }));
            Ok(mapped)
        })
    } else if let Some(field_name) = field.as_str() {
        let name = field_name.to_string();
        Box::new(move |value_iterator| {
            let name = name.clone();
            // Iterator must be over struct types
            let mapped: ValueIterator<'_> = Box::new(value_iterator.map(move |mut a| {
                if let Some(map) = a.as_object_mut() {
                    map.remove(&name).unwrap_or(serde_json::Value::Null)
                } else {
                    serde_json::Value::Null
                }
            }));
            Ok(mapped)
        })
    } else {
        return Err(Error::from(
            "Using the 'get' operator requires that the 'field' value must be of a non-negative \
             numerical or string type",
        ));
    };
    Ok(map)
}
