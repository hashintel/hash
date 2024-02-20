use wasm_bindgen::prelude::*;

use crate::{
    raw,
    utils::{set_panic_hook, Result},
    DataType, ParseDataTypeError,
};

fn convert_data_type(data_type_obj: &JsValue) -> std::result::Result<DataType, ParseDataTypeError> {
    let data_type_repr = data_type_obj
        .into_serde::<raw::DataType>()
        .map_err(|err| ParseDataTypeError::InvalidJson(err.to_string()))?;

    DataType::try_from(data_type_repr)
}

#[wasm_bindgen(typescript_custom_section)]
const VALIDATE_DATA_TYPE_DEF: &'static str = r#"
/**
 * Checks if a given Data Type is correctly formed
 *
 * @param {DataType} dataType - The Data Type object to validate.
 * @returns {(Result.Ok|Result.Err<ParseDataTypeError>)} - an Ok with null inner if valid, or an Err with an inner
 *     ParseDataTypeError
 */
export function validateDataType(dataType: DataType): Result<undefined, ParseDataTypeError>;
"#;
#[wasm_bindgen(skip_typescript, js_name = validateDataType)]
pub fn validate_data_type(data_type_obj: &JsValue) -> JsValue {
    #[cfg(debug_assertions)]
    set_panic_hook();

    let validate_result: Result<(), _> = convert_data_type(data_type_obj).map(|_| ()).into();
    JsValue::from_serde(&validate_result).expect("failed to serialize result")
}
