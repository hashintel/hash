use error_stack::Report;

use super::{extend_report, ConstraintError};
use crate::schema::{DataType, JsonSchemaValueType};

pub(crate) fn check_numeric_constraints(
    actual: f64,
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if !data_type.json_type.contains(&JsonSchemaValueType::Number)
        && !data_type.json_type.contains(&JsonSchemaValueType::Integer)
    {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::Number,
                expected: data_type.json_type.clone()
            }
        );
    }

    if let Some(expected) = data_type.minimum {
        if data_type.exclusive_minimum {
            if actual <= expected {
                extend_report!(
                    *result,
                    ConstraintError::ExclusiveMinimum { actual, expected }
                );
            }
        } else if actual < expected {
            extend_report!(*result, ConstraintError::Minimum { actual, expected });
        }
    }
    if let Some(expected) = data_type.maximum {
        if data_type.exclusive_maximum {
            if actual >= expected {
                extend_report!(
                    *result,
                    ConstraintError::ExclusiveMaximum { actual, expected }
                );
            }
        } else if actual > expected {
            extend_report!(*result, ConstraintError::Maximum { actual, expected });
        }
    }

    if let Some(expected) = data_type.multiple_of.or_else(|| {
        data_type
            .json_type
            .contains(&JsonSchemaValueType::Integer)
            .then_some(1.0)
    }) {
        #[expect(
            clippy::float_arithmetic,
            clippy::modulo_arithmetic,
            reason = "Validation requires floating point arithmetic"
        )]
        if actual % expected >= f64::EPSILON {
            extend_report!(*result, ConstraintError::MultipleOf { actual, expected });
        }
    }
}
