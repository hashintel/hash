#[derive(thiserror::Error, Debug)]
pub enum BehaviorKeyJsonError {
    #[error("{0}")]
    Unique(String),
    #[error("Expected the top-level of behavior keys definition to be a JSON object")]
    ExpectedTopLevelMap,
    #[error("Expected \"keys\" field in top-level behavior keys definition")]
    ExpectedKeys,
    #[error("Expected \"keys\" field in top-level behavior keys definition to be a JSON object")]
    ExpectedKeysMap,
    #[error(
        "Expected \"built_in_key_use\" field in top-level behavior keys definition to be either a \
         JSON object or null"
    )]
    ExpectedBuiltInKeyUseNullOrMap,
    #[error("Expected \"built_in_key_use\" field to contain \"selected\" field")]
    ExpectedBuiltInKeyUseSelectedField,
    #[error("Expected \"selected\" field to either be a JSON array or string")]
    ExpectedSelectedStringOrArray,
    #[error("Expected \"selected\" field of array type to contain strings")]
    ExpectedSelectedArrayContainString,
    #[error("Expected \"selected\" field of string type to be equal to \"all\"")]
    ExpectedSelectedStringToBeAll,
    #[error("Expected key with name {0} to have a schema in the form of a JSON object")]
    ExpectedKeyObject(String),
    #[error("Expected key with name {0} to have a \"type\" field of type string")]
    InvalidKeyTypeType(String),
    #[error("Invalid key type {0}")]
    InvalidKeyType(String),
    #[error(
        "Expected key with name {0} to have a boolean \"nullable\" sub-field in one of its \
         sub-types"
    )]
    InvalidKeyNullableType(String),
    #[error(
        "Expected key with name {0} to have a list \"fields\" sub-field in one of its \
         \"object\"-type sub-types"
    )]
    InvalidKeyFieldsType(String),
    #[error(
        "Expected key with name {0} to have a object \"child\" sub-field in one of its \
         \"list\"/\"fixed_size_list\"-type sub-types"
    )]
    InvalidKeyChildType(String),
    #[error(
        "Expected key with name {0} to have a positive integer \"length\" sub-field in one of its \
         \"fixed_size_list\"-type sub-types"
    )]
    InvalidKeyLengthType(String),
    #[error("Invalid built-in key name {0}")]
    InvalidBuiltInKeyName(String),
    #[error("Dynamic access flag must be boolean if present")]
    NonBoolDynamicAccess,
}

impl From<&str> for BehaviorKeyJsonError {
    fn from(string: &str) -> Self {
        BehaviorKeyJsonError::Unique(string.to_string())
    }
}

impl From<String> for BehaviorKeyJsonError {
    fn from(string: String) -> Self {
        BehaviorKeyJsonError::Unique(string)
    }
}
