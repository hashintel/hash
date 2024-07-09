use error_stack::Report;

use super::{extend_report, ConstraintError};
use crate::{schema::JsonSchemaValueType, DataType};

type JsonObject = serde_json::Map<String, serde_json::Value>;

pub(crate) fn check_object_constraints(
    _actual: &JsonObject,
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if data_type.json_type != JsonSchemaValueType::Object {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::Object,
                expected: data_type.json_type
            }
        );
    }
}
