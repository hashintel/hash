use error_stack::Report;
use serde_json::Value as JsonValue;

use super::{extend_report, ConstraintError};
use crate::schema::{DataType, JsonSchemaValueType};

pub(crate) fn check_array_constraints(
    _actual: &[JsonValue],
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if data_type.json_type != JsonSchemaValueType::Array {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::Array,
                expected: data_type.json_type
            }
        );
    }
}
