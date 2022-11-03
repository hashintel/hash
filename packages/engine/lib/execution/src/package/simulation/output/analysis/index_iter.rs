use std::cmp::Ordering;

use arrow2::datatypes::DataType;
use float_cmp::approx_eq;
use stateful::{
    agent,
    field::{FieldSpecMapAccessor, FieldTypeVariant},
};

use crate::{
    package::simulation::output::analysis::{
        analyzer::{
            AnalysisOperationRepr, ComparisonRepr, IndexIterator, OutputCreator, OutputRunner,
            OutputRunnerCreator, ValueIterator, ValueIteratorCreator, ULPS,
        },
        value_iter::{value_iterator_filter, value_iterator_mapper},
        AnalysisSingleOutput,
    },
    Error, Result,
};

fn index_iterator_f64_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    float: f64,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Neq => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| !approx_eq!(f64, v, float, ulps = ULPS),
            true
        ),
        ComparisonRepr::Lt => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| v < float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Lte => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| v < float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gt => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| v > float && !approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
        ComparisonRepr::Gte => apply_index_filter_f64!(
            operations,
            accessor,
            field,
            |v| v > float || approx_eq!(f64, v, float, ulps = ULPS),
            false
        ),
    }
}

fn index_iterator_serialized_f64_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    float: f64,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float == float
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Neq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float != float
                } else {
                    true
                }
            },
            true
        ),
        ComparisonRepr::Lt => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float < float
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Lte => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float <= float
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Gt => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float > float
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Gte => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_float) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_f64()
                {
                    as_float >= float
                } else {
                    false
                }
            },
            false
        ),
    }
}

fn index_iterator_null_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => {
            apply_index_filter_null!(operations, accessor, field, exists, !exists)
        }
        ComparisonRepr::Neq => {
            apply_index_filter_null!(operations, accessor, field, exists, exists)
        }
        _ => Err(Error::from(
            "Filters that compare to a null only can apply the 'eq' and 'neq' comparisons",
        )),
    }
}

fn index_iterator_boolean_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    boolean: bool,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => {
            apply_index_filter_bool!(operations, accessor, field, |v| v == boolean, false)
        }
        ComparisonRepr::Neq => {
            apply_index_filter_bool!(operations, accessor, field, |v| v != boolean, true)
        }
        _ => Err(Error::from(
            "Filters that compare to a boolean only can apply the 'eq' and 'neq' comparisons",
        )),
    }
}

fn index_iterator_serialized_null_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| { v == "null" },
            true
        ),
        ComparisonRepr::Neq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| { v == "null" },
            false
        ),
        _ => Err(Error::from(
            "For Boolean comparison 'eq' and 'neq' operators are only allowed",
        )),
    }
}

fn index_iterator_serialized_boolean_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    boolean: bool,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_bool) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_bool()
                {
                    as_bool == boolean
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Neq => apply_index_filter_serialized_json!(
            operations,
            accessor,
            field,
            |v| {
                if let Some(as_bool) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_bool()
                {
                    as_bool != boolean
                } else {
                    true
                }
            },
            true
        ),
        _ => Err(Error::from(
            "For Boolean comparison 'eq' and 'neq' operators are only allowed",
        )),
    }
}

fn index_iterator_string_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    string: String,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| v == cloned,
            false
        ),
        ComparisonRepr::Neq => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| v != cloned,
            true
        ),
        ComparisonRepr::Lt => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| v.cmp(&cloned) == Ordering::Less,
            false
        ),
        ComparisonRepr::Lte => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| matches!(v.cmp(&cloned), Ordering::Less | Ordering::Equal),
            false
        ),
        ComparisonRepr::Gt => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| v.cmp(&cloned) == Ordering::Greater,
            false
        ),
        ComparisonRepr::Gte => apply_index_filter_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| matches!(v.cmp(&cloned), Ordering::Greater | Ordering::Equal),
            false
        ),
    }
}

fn index_iterator_serialized_string_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    string: String,
) -> Result<OutputRunnerCreator> {
    match comparison {
        ComparisonRepr::Eq => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    as_str == cloned
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Neq => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    as_str != cloned
                } else {
                    true
                }
            },
            true
        ),
        ComparisonRepr::Lt => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    as_str.cmp(&cloned) == Ordering::Less
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Lte => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    matches!(as_str.cmp(&cloned), Ordering::Less | Ordering::Equal)
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Gt => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    as_str.cmp(&cloned) == Ordering::Greater
                } else {
                    false
                }
            },
            false
        ),
        ComparisonRepr::Gte => apply_index_filter_serialized_json_str!(
            operations,
            accessor,
            field,
            string,
            cloned,
            |v| {
                if let Some(as_str) = serde_json::from_str::<serde_json::Value>(v)
                    .expect("Should be able to deserialize")
                    .as_str()
                {
                    matches!(as_str.cmp(&cloned), Ordering::Greater | Ordering::Equal)
                } else {
                    false
                }
            },
            false
        ),
    }
}

fn index_iterator_serialized_filter(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    value: &serde_json::Value,
) -> Result<OutputRunnerCreator> {
    match value {
        serde_json::Value::Bool(boolean) => {
            let boolean = *boolean;
            index_iterator_serialized_boolean_filter(
                operations, accessor, field, comparison, boolean,
            )
        }
        serde_json::Value::Number(number) => {
            let float = number.as_f64().ok_or_else(|| Error::from("Expected f64"))?;
            index_iterator_serialized_f64_filter(operations, accessor, field, comparison, float)
        }
        serde_json::Value::String(string) => {
            let string = string.clone();
            index_iterator_serialized_string_filter(operations, accessor, field, comparison, string)
        }
        serde_json::Value::Null => {
            index_iterator_serialized_null_filter(operations, accessor, field, comparison)
        }
        _ => Err(Error::from(
            "Filtering can only be done with number/boolean or string values",
        )),
    }
}

fn f64_iter_aggregate(
    aggregator: &AnalysisOperationRepr,
    first_field: String,
) -> Result<OutputRunnerCreator> {
    let result = match aggregator {
        AnalysisOperationRepr::Sum => {
            apply_aggregator_f64!(
                first_field,
                iterator,
                Ok(AnalysisSingleOutput::some_number(
                    iterator
                        .map(|a| if let Some(number) = a { number } else { 0.0 })
                        .sum()
                ))
            )
        }
        AnalysisOperationRepr::Min => {
            apply_aggregator_f64!(
                first_field,
                iterator,
                Ok(AnalysisSingleOutput::Number(
                    iterator
                        .map(|a| if let Some(number) = a {
                            number
                        } else {
                            f64::NAN
                        })
                        .min_by(|a, b| match (a.is_nan(), b.is_nan()) {
                            // NANs will be ignored
                            (true, true) => Ordering::Equal,
                            (true, false) => Ordering::Greater,
                            (false, true) => Ordering::Less,
                            (false, false) => a.partial_cmp(b).unwrap(),
                        })
                        .and_then(|a| if a.is_finite() { Some(a) } else { None })
                ))
            )
        }
        AnalysisOperationRepr::Max => {
            apply_aggregator_f64!(
                first_field,
                iterator,
                Ok(AnalysisSingleOutput::Number(
                    iterator
                        .map(|a| if let Some(number) = a {
                            number
                        } else {
                            f64::NAN
                        })
                        .max_by(|a, b| match (a.is_nan(), b.is_nan()) {
                            // NANs will be ignored
                            (true, true) => Ordering::Equal,
                            (true, false) => Ordering::Less,
                            (false, true) => Ordering::Greater,
                            (false, false) => a.partial_cmp(b).unwrap(),
                        })
                        .and_then(|a| if a.is_finite() { Some(a) } else { None })
                ))
            )
        }
        AnalysisOperationRepr::Mean => {
            apply_aggregator_f64!(first_field, iterator, {
                let mut sum = 0.0;
                let mut num_elements = 0;
                iterator.for_each(|a| {
                    if let Some(number) = a {
                        sum += number;
                        num_elements += 1;
                    }
                });

                if num_elements != 0 {
                    Ok(AnalysisSingleOutput::some_number(sum / num_elements as f64))
                } else {
                    Ok(AnalysisSingleOutput::null_number())
                }
            })
        }
        AnalysisOperationRepr::Count => {
            // All agents whose `Value` objects are not `Value::Null` are counted
            apply_aggregator_f64!(
                first_field,
                iterator,
                Ok(AnalysisSingleOutput::some_number(
                    iterator.filter(|a| a.is_some()).count() as f64
                ))
            )
        }
        _ => Err(Error::from(
            "The last operation must be an aggregator: either 'count', 'sum', 'min', 'max' or \
             'mean'",
        )),
    }?;
    Ok(result)
}

pub(super) fn index_iterator_filter_creator(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
    field: String,
    comparison: &ComparisonRepr,
    value: &serde_json::Value,
) -> Result<OutputRunnerCreator> {
    let field_type = &accessor
        .get_agent_scoped_field_spec(&field)?
        .inner
        .field_type;

    if value.is_null() && !matches!(&field_type.variant, FieldTypeVariant::AnyType) {
        return index_iterator_null_filter(operations, accessor, field, comparison);
    }

    match &field_type.variant {
        FieldTypeVariant::Number => {
            let float = if value.is_string() {
                let string = value.as_str().unwrap();
                if let Ok(v) = str::parse::<f64>(string) {
                    v
                } else {
                    return Err(Error::from(format!(
                        "The agent field '{}' is of a number type, however the value given for \
                         comparison ('{}') is not",
                        field, string
                    )));
                }
            } else if value.is_number() {
                value.as_f64().unwrap()
            } else {
                return Err(Error::from(format!(
                    "The agent field '{field}' is of a number type, however the value given for \
                     comparison ('{value}') is not"
                )));
            };

            index_iterator_f64_filter(operations, accessor, field, comparison, float)
        }
        FieldTypeVariant::Boolean => {
            let boolean = if value.is_string() {
                let string = value.as_str().unwrap();
                if let Ok(v) = str::parse::<bool>(string) {
                    v
                } else {
                    return Err(Error::from(format!(
                        "The agent field '{field}' is of a boolean type, however the value given \
                         for comparison ('{string}') is not"
                    )));
                }
            } else if value.is_boolean() {
                value.as_bool().unwrap()
            } else {
                return Err(Error::from(format!(
                    "The agent field '{field}' is of a boolean type, however the value given for \
                     comparison ('{value}') is not"
                )));
            };

            index_iterator_boolean_filter(operations, accessor, field, comparison, boolean)
        }
        FieldTypeVariant::String => {
            let string = if value.is_string() {
                value.as_str().unwrap().to_string()
            } else {
                return Err(Error::from(format!(
                    "The agent field '{field}' is of a boolean type, however the value given for \
                     comparison ('{value}') is not"
                )));
            };

            index_iterator_string_filter(operations, accessor, field, comparison, string)
        }
        FieldTypeVariant::AnyType => {
            index_iterator_serialized_filter(operations, accessor, field, comparison, value)
        }
        _ => Err(Error::from(
            "Filtering can only be done on number, boolean or string values",
        )),
    }
}

fn default_first_getter(
    accessor: &FieldSpecMapAccessor,
    first_field: &str,
) -> Result<ValueIteratorCreator> {
    let data_type = DataType::from(
        accessor
            .get_agent_scoped_field_spec(first_field)?
            .inner
            .field_type
            .variant
            .clone(),
    );

    let first_field = first_field.to_string();
    let a: ValueIteratorCreator = Box::new(move |agents: &_| {
        let iterator = agent::arrow::json_value_iter_cols(agents, &first_field, &data_type)?;
        Ok(iterator as ValueIterator<'_>)
    });
    Ok(a)
}

pub(super) fn index_iterator_mapper_creator(
    operations: &[AnalysisOperationRepr],
    accessor: &FieldSpecMapAccessor,
) -> Result<OutputRunnerCreator> {
    // Aggregator logic:
    // All NaNs, Infs and -Infs get mapped to null
    // Min, Max, Mean are None if no valid elements exist (while Sum would be 0)
    // All values in any-type fields that cannot be parsed are mapped to null

    // It must be that a get operation is followed by at least one extra operation
    debug_assert!(operations.len() >= 2);

    let first_field = if let AnalysisOperationRepr::Get { field } = &operations[0] {
        if field.is_string() {
            field.as_str().unwrap().to_string()
        } else {
            return Err(Error::from(
                "The first getter must access an agent field by string",
            ));
        }
    } else {
        return Err(Error::from("Expected a getter"));
    };

    let field_type = &accessor
        .get_agent_scoped_field_spec(&first_field)?
        .inner
        .field_type;

    let first_mapper = match &field_type.variant {
        FieldTypeVariant::Number => {
            // We expect that an aggregator follows this "get" operation
            if operations.len() == 2 {
                let aggregator = &operations[1];
                return f64_iter_aggregate(aggregator, first_field);
            } else {
                default_first_getter(accessor, &first_field)?
            }
        }
        FieldTypeVariant::AnyType => {
            let a: ValueIteratorCreator = Box::new(move |agents| {
                let iterator = agent::arrow::json_serialized_value_iter(agents, &first_field)?;
                Ok(Box::new(iterator) as ValueIterator<'_>)
            });
            a
        }
        _ => default_first_getter(accessor, &first_field)?,
    };

    let is_aggregated = operations.last().unwrap().is_num_aggregator();
    // Combine all subsequent getters and filters
    let combined_mapper = if operations.len() == 2 {
        // Only a getter followed by an aggregator
        first_mapper
    } else {
        let mut result: ValueIteratorCreator = first_mapper;
        let range = if is_aggregated {
            1..operations.len() - 1
        } else {
            1..operations.len()
        };
        for i in range {
            result = match &operations[i] {
                AnalysisOperationRepr::Filter {
                    field,
                    comparison,
                    value,
                } => {
                    let mapper = value_iterator_filter(field.clone(), comparison, value)?;
                    let builder: ValueIteratorCreator = Box::new(move |agents| {
                        let iterator = result(agents)?;
                        mapper(iterator)
                    });
                    builder
                }
                AnalysisOperationRepr::Get { field } => {
                    let mapper = value_iterator_mapper(field.clone())?;
                    let builder: ValueIteratorCreator = Box::new(move |agents| {
                        let iterator = result(agents)?;
                        mapper(iterator)
                    });
                    builder
                }
                _ => return Err(Error::from("Expected a 'get' or 'filter'")),
            }
        }
        result
    };

    let last_operation = operations.last().unwrap();
    let runner = if is_aggregated {
        match last_operation {
            AnalysisOperationRepr::Sum => apply_aggregator!(
                combined_mapper,
                iterator,
                Ok(AnalysisSingleOutput::some_number(
                    iterator
                        .map(|a| if let Some(number) = a.as_f64() {
                            number
                        } else {
                            0.0
                        })
                        .sum()
                ))
            ),
            AnalysisOperationRepr::Min => {
                apply_aggregator!(
                    combined_mapper,
                    iterator,
                    Ok(AnalysisSingleOutput::Number(
                        iterator
                            .map(|a| if let Some(number) = a.as_f64() {
                                number
                            } else {
                                f64::NAN
                            })
                            .min_by(|a, b| match (a.is_nan(), b.is_nan()) {
                                // NANs will be ignored
                                (true, true) => Ordering::Equal,
                                (true, false) => Ordering::Greater,
                                (false, true) => Ordering::Less,
                                (false, false) => a.partial_cmp(b).unwrap(),
                            })
                            .and_then(|a| if a.is_finite() { Some(a) } else { None })
                    ))
                )
            }
            AnalysisOperationRepr::Max => {
                apply_aggregator!(
                    combined_mapper,
                    iterator,
                    Ok(AnalysisSingleOutput::Number(
                        iterator
                            .map(|a| if let Some(number) = a.as_f64() {
                                number
                            } else {
                                f64::NAN
                            })
                            .max_by(|a, b| match (a.is_nan(), b.is_nan()) {
                                // NANs will be ignored
                                (true, true) => Ordering::Equal,
                                (true, false) => Ordering::Less,
                                (false, true) => Ordering::Greater,
                                (false, false) => a.partial_cmp(b).unwrap(),
                            })
                            .and_then(|a| if a.is_finite() { Some(a) } else { None })
                    ))
                )
            }
            AnalysisOperationRepr::Mean => apply_aggregator!(combined_mapper, iterator, {
                let mut sum = 0.0;
                let mut num_elements = 0;
                iterator.for_each(|a| {
                    if let Some(number) = a.as_f64() {
                        sum += number;
                        num_elements += 1;
                    }
                });

                if num_elements != 0 {
                    Ok(AnalysisSingleOutput::some_number(sum / num_elements as f64))
                } else {
                    Ok(AnalysisSingleOutput::null_number())
                }
            }),
            AnalysisOperationRepr::Count => {
                // All agents whose `Value` objects are not `Value::Null` are counted
                apply_aggregator!(
                    combined_mapper,
                    iterator,
                    Ok(AnalysisSingleOutput::some_number(
                        iterator.filter(|a| !a.is_null()).count() as f64
                    ))
                )
            }
            _ => Err(Error::from("Expected an aggregator as the last operation")),
        }?
    } else {
        let runner: OutputRunnerCreator = Box::new(move |agents: &_| {
            let value_runner: ValueIterator<'_> = combined_mapper(agents)?;
            Ok(Box::new(
                move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                    let mut value_iter = value_runner;
                    let mut current_index = 0;

                    let mut single_array_unwrap = false;
                    let mut result = vec![];
                    for index in iterator {
                        for _ in current_index..index {
                            // Skip some values
                            value_iter.next();
                        }
                        current_index = index + 1;
                        let value = value_iter.next().unwrap_or(serde_json::Value::Null);

                        if value.is_number() && !single_array_unwrap {
                            result.push(Some(value.as_f64().unwrap()));
                        } else if value.is_null() && !single_array_unwrap {
                            result.push(None);
                        } else if value.is_array() && !single_array_unwrap && result.is_empty() {
                            // This logic is required for parity with the hCore analyzer.
                            // If the output array would be an array with a single element
                            // whereby the element is an array of nullable numbers,
                            // then this logic "unwraps" the output into an array of nullable
                            // numbers by the logic similar to `output = output[0]`
                            single_array_unwrap = true;
                            let arr = value.as_array().unwrap();
                            for val in arr {
                                if val.is_number() {
                                    result.push(Some(val.as_f64().unwrap()));
                                } else if val.is_null() {
                                    result.push(None);
                                } else {
                                    return Err(Error::from(format!(
                                        "This output can only yield arrays of numbers, not arrays \
                                         of arbitrary objects. Found an element in the agent \
                                         array which should have been a number or null: {}",
                                        val
                                    )));
                                }
                            }
                        } else {
                            return Err(Error::from(format!(
                                "This output can only yield arrays of numbers, not arrays of \
                                 arbitrary objects. Found an element which should have been a \
                                 number or null: {}",
                                value
                            )));
                        }
                    }

                    Ok(AnalysisSingleOutput::number_vec(result))
                },
            ))
        });
        runner
    };

    Ok(runner)
}
