use error_stack::Report;

use super::{extend_report, ConstraintError};
use crate::schema::{DataType, JsonSchemaValueType};

pub(crate) fn check_boolean_constraints(
    _actual: bool,
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if !data_type.json_type.contains(&JsonSchemaValueType::Boolean) {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::Boolean,
                expected: data_type.json_type.clone()
            }
        );
    }
}
