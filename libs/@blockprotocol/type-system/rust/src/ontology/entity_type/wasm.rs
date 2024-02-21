use wasm_bindgen::prelude::*;

use crate::{raw, utils::Result, EntityType, ParseEntityTypeError};

fn convert_entity_type(
    entity_type_obj: &JsValue,
) -> std::result::Result<EntityType, ParseEntityTypeError> {
    #[expect(deprecated, reason = "https://linear.app/hash/issue/H-2212")]
    let entity_type_repr = entity_type_obj
        .into_serde::<raw::EntityType>()
        .map_err(|err| ParseEntityTypeError::InvalidJson(err.to_string()))?;

    EntityType::try_from(entity_type_repr)
}

#[wasm_bindgen(typescript_custom_section)]
const VALIDATE_ENTITY_TYPE_DEF: &'static str = r#"
/**
 * Checks if a given Entity Type is correctly formed
 *
 * @param {EntityType} entityType - The Entity Type object to validate.
 * @returns {(Result.Ok|Result.Err<ParseEntityTypeError>)} - an Ok with null inner if valid, or an Err with an inner
 *     ParseEntityTypeError
 */
export function validateEntityType(entityType: EntityType): Result<undefined, ParseEntityTypeError>;
"#;
#[wasm_bindgen(skip_typescript, js_name = validateEntityType)]
pub fn validate_entity_type(entity_type_obj: &JsValue) -> JsValue {
    #[cfg(debug_assertions)]
    crate::utils::set_panic_hook();

    let validate_result: Result<(), _> = convert_entity_type(entity_type_obj).map(|_| ()).into();
    #[expect(deprecated, reason = "https://linear.app/hash/issue/H-2212")]
    JsValue::from_serde(&validate_result).expect("failed to serialize result")
}
