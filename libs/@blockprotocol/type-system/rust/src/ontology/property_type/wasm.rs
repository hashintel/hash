use wasm_bindgen::prelude::*;

use crate::{raw, utils::Result, ParsePropertyTypeError, PropertyType};

fn convert_property_type(
    property_type_obj: &JsValue,
) -> std::result::Result<PropertyType, ParsePropertyTypeError> {
    #[expect(deprecated, reason = "https://linear.app/hash/issue/H-2212")]
    let property_type_repr = property_type_obj
        .into_serde::<raw::PropertyType>()
        .map_err(|err| ParsePropertyTypeError::InvalidJson(err.to_string()))?;

    PropertyType::try_from(property_type_repr)
}

#[wasm_bindgen(typescript_custom_section)]
const VALIDATE_PROPERTY_TYPE_DEF: &'static str = r#"
/**
 * Checks if a given Property Type is correctly formed
 *
 * @param {PropertyType} propertyType - The Property Type object to validate.
 * @returns {(Result.Ok|Result.Err<ParsePropertyTypeError>)} - an Ok with null inner if valid, or an Err with an inner
 *     ParsePropertyTypeError
 */
export function validatePropertyType(propertyType: PropertyType): Result<undefined, ParsePropertyTypeError>;
"#;
#[wasm_bindgen(skip_typescript, js_name = validatePropertyType)]
pub fn validate_property_type(property_type_obj: &JsValue) -> JsValue {
    #[cfg(debug_assertions)]
    crate::utils::set_panic_hook();

    let validate_result: Result<(), _> =
        convert_property_type(property_type_obj).map(|_| ()).into();
    #[expect(deprecated, reason = "https://linear.app/hash/issue/H-2212")]
    JsValue::from_serde(&validate_result).expect("failed to serialize result")
}
