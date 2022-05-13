macro_rules! value_filter_null_array_element {
    ($index:ident, $exists:ident, $comparison:expr) => {{
        Box::new(move |value_iterator| {
            Ok(Box::new(value_iterator.filter(move |a| {
                let $exists = array_element_exists_as_non_null(a, $index as usize);
                $comparison
            })))
        })
    }};
}

macro_rules! value_filter_null_object_field {
    ($field_name:ident, $name:ident, $exists:ident, $comparison:expr) => {{
        Box::new(move |value_iterator| {
            let $name = $field_name.clone();
            Ok(Box::new(value_iterator.filter(move |a| {
                let $exists = object_field_exists_as_non_null(a, &$name);
                $comparison
            })))
        })
    }};
}

macro_rules! value_filter_boolean_array_element {
    ($index:ident, $val:ident, $comparison:expr, $default:expr) => {{
        Box::new(move |value_iterator| {
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(array) = a.as_array() {
                    if let Some(value) = array.get($index as usize) {
                        if let Some($val) = value.as_bool() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}

macro_rules! value_filter_boolean_object_field {
    ($field_name:ident, $val:ident, $comparison:expr, $default:expr) => {{
        Box::new(move |value_iterator| {
            let name = $field_name.clone();
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(object) = a.as_object() {
                    if let Some(value) = object.get(&name) {
                        if let Some($val) = value.as_bool() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}

macro_rules! value_filter_f64_array_element {
    ($index:ident, $val:ident, $comparison:expr, $default:expr) => {{
        Box::new(move |value_iterator| {
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(array) = a.as_array() {
                    if let Some(value) = array.get($index as usize) {
                        if let Some($val) = value.as_f64() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}

macro_rules! value_filter_f64_object_field {
    ($field_name:ident, $val:ident, $comparison:expr, $default:expr) => {{
        Box::new(move |value_iterator| {
            let name = $field_name.clone();
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(object) = a.as_object() {
                    if let Some(value) = object.get(&name) {
                        if let Some($val) = value.as_f64() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}

macro_rules! value_filter_string_array_element {
    ($index:ident, $val:ident, $to_clone:ident, $cloned:ident, $comparison:expr, $default:expr) => {{
        Box::new(move |value_iterator| {
            let $cloned = $to_clone.clone();
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(array) = a.as_array() {
                    if let Some(value) = array.get($index as usize) {
                        if let Some($val) = value.as_str() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}
macro_rules! value_filter_string_object_field {
    (
        $field_name:ident,
        $val:ident,
        $to_clone:ident,
        $cloned:ident,
        $comparison:expr,
        $default:expr
    ) => {{
        Box::new(move |value_iterator| {
            let name = $field_name.clone();
            let $cloned = $to_clone.clone();
            Ok(Box::new(value_iterator.filter(move |a| {
                if let Some(object) = a.as_object() {
                    if let Some(value) = object.get(&name) {
                        if let Some($val) = value.as_str() {
                            return $comparison;
                        }
                    }
                }
                $default
            })))
        })
    }};
}

macro_rules! apply_index_filter_f64 {
    ($operations:ident, $accessor:expr, $field:expr, $comparison:expr, $default:expr) => {{
        let following: OutputRunnerCreator =
            OutputCreator::index_creator(&$operations[1..], $accessor)?;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let f64_iterator = agent::arrow::f64_iter(agents, &field)?;
            let next = following(agents)?;
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    // let mut v = 1;
                    let mut mut_f64_iterator = f64_iterator;
                    let mut current_index = 0;
                    let this_filter: IndexIterator<'_> = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_f64_iterator).next();
                        }
                        current_index = *index + 1;
                        mut_f64_iterator
                            .next()
                            .unwrap()
                            .map($comparison)
                            .unwrap_or($default)
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_index_filter_str {
    (
        $operations:ident,
        $accessor:expr,
        $field:expr,
        $string:ident,
        $cloned:ident,
        $comparison:expr,
        $default:expr
    ) => {{
        let following =
            OutputCreator::index_creator(&$operations[1..], $accessor)? as OutputRunnerCreator;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let str_iterator = agent::arrow::str_iter(&agents, &field)?;
            let next = following(agents)?;
            let $cloned = $string.clone();
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut mut_str_iterator = str_iterator;
                    let mut current_index = 0;
                    let this_filter = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_str_iterator).next();
                        }
                        current_index = *index + 1;
                        mut_str_iterator
                            .next()
                            .unwrap()
                            .map($comparison)
                            .unwrap_or($default)
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_index_filter_serialized_json_str {
    (
        $operations:ident,
        $accessor:expr,
        $field:expr,
        $string:ident,
        $cloned:ident,
        $comparison:expr,
        $default:expr
    ) => {{
        let following =
            OutputCreator::index_creator(&$operations[1..], $accessor)? as OutputRunnerCreator;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let str_iterator = agent::arrow::str_iter(agents, &field)?;
            let next = following(agents)?;
            let $cloned = $string.clone();
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut mut_str_iterator = str_iterator;
                    let mut current_index = 0;
                    let this_filter = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_str_iterator).next();
                        }
                        current_index = *index + 1;
                        mut_str_iterator
                            .next()
                            .unwrap_or_else(|| Some("null"))
                            .map($comparison)
                            .unwrap_or($default)
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_index_filter_serialized_json {
    ($operations:ident, $accessor:expr, $field:expr, $comparison:expr, $default:expr) => {{
        let following = OutputCreator::index_creator(&$operations[1..], $accessor)?;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let str_iterator = agent::arrow::str_iter(agents, &field)?;
            let next = following(agents)?;
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut mut_str_iterator = str_iterator;
                    let mut current_index = 0;
                    let this_filter = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_str_iterator).next();
                        }
                        current_index = *index + 1;
                        mut_str_iterator
                            .next()
                            .unwrap_or_else(|| Some("null"))
                            .map($comparison)
                            .unwrap_or($default)
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_index_filter_null {
    ($operations:ident, $accessor:ident, $field:ident, $exists:ident, $comparison:expr) => {{
        let following =
            OutputCreator::index_creator(&$operations[1..], $accessor)? as OutputRunnerCreator;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let exists_iter = agent::arrow::exists_iter(agents, &field)?;
            let next = following(agents)?;
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    // let mut v = 1;
                    let mut mut_exists_iter = exists_iter;
                    let mut current_index = 0;
                    let this_filter = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_exists_iter).next();
                        }
                        current_index = *index + 1;
                        let $exists = mut_exists_iter.next().unwrap();
                        $comparison
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_index_filter_bool {
    ($operations:ident, $accessor:expr, $field:expr, $comparison:expr, $default:expr) => {{
        let following =
            OutputCreator::index_creator(&$operations[1..], $accessor)? as OutputRunnerCreator;
        let field = $field.clone();
        Ok(Box::new(move |agents| {
            let bool_iterator = agent::arrow::bool_iter(agents, &field)?;
            let next = following(agents)?;
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    // let mut v = 1;
                    let mut mut_bool_iterator = bool_iterator;
                    let mut current_index = 0;
                    let this_filter = Box::new(iterator.filter(move |index| {
                        for _ in current_index..*index {
                            // Skip some values
                            (&mut mut_bool_iterator).next();
                        }
                        current_index = *index + 1;
                        mut_bool_iterator
                            .next()
                            .unwrap()
                            .map($comparison)
                            .unwrap_or($default)
                    }));
                    next(this_filter)
                },
            ))
        }))
    }};
}

macro_rules! apply_aggregator {
    ($getter:ident, $iter:ident, $aggr:expr) => {{
        let runner: OutputRunnerCreator = Box::new(move |agents: &_| {
            let value_runner: ValueIterator<'_> = $getter(agents)?;
            let runner: OutputRunner<'_> = Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut value_iter = value_runner;
                    let mut current_index = 0;
                    let $iter = Box::new(iterator.map(move |index| {
                        for _ in current_index..index {
                            // Skip some values
                            (&mut value_iter).next();
                        }
                        current_index = index + 1;
                        value_iter.next().unwrap_or_else(|| serde_json::Value::Null)
                    }));
                    $aggr
                },
            );
            Ok(runner)
        });
        Ok(runner)
    }};
}

macro_rules! apply_aggregator_f64 {
    ($field_name:ident, $iter:ident, $aggr:expr) => {{
        let runner: OutputRunnerCreator = Box::new(move |agents: &_| {
            let f64_iter = agent::arrow::f64_iter(agents, &$field_name)?;
            let runner: OutputRunner<'_> = Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut iter = f64_iter;
                    let mut current_index = 0;
                    let $iter = Box::new(iterator.map(move |index| {
                        for _ in current_index..index {
                            // Skip some values
                            (&mut iter).next();
                        }
                        current_index = index + 1;
                        iter.next().unwrap()
                    }));
                    $aggr
                },
            );
            Ok(runner)
        });
        Ok(runner)
    }};
}
