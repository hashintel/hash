use error_stack::Report;

use super::{extend_report, ConstraintError};
use crate::schema::{DataType, JsonSchemaValueType};

pub(crate) fn check_null_constraints(
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if data_type.json_type != JsonSchemaValueType::Null {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::Null,
                expected: data_type.json_type
            }
        );
    }
}
