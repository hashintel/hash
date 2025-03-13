mod validation;

use serde::{Deserialize, Serialize};

pub use self::validation::{OneOfSchemaValidationError, OneOfSchemaValidator};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OneOfSchema<T> {
    #[serde(rename = "oneOf")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[T, ...T[]]"))]
    pub possibilities: Vec<T>,
}
