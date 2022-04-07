use std::{collections::HashMap, convert::TryFrom};

use stateful::field::{
    FieldScope, FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant, RootFieldSpec,
    RootFieldSpecCreator,
};

// use crate::worker::runner::rust;
use crate::{
    config::ExperimentConfig,
    datastore::{schema::EngineComponent, Error, Result},
    experiment::SharedBehavior,
    hash_types::state::AgentStateField,
    proto::ExperimentRunTrait,
};

#[derive(Clone, Debug, Eq, PartialEq, Default)]
pub struct BehaviorKeys {
    pub inner: FieldSpecMap<EngineComponent>,
    pub built_in_key_use: Option<Vec<String>>,
    pub dyn_access: bool,
}

impl BehaviorKeys {
    pub fn from_json_str<K: AsRef<str>>(
        json_str: K,
        field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
    ) -> Result<BehaviorKeys> {
        Self::_from_json_str(json_str.as_ref(), field_spec_creator)
    }

    pub fn _from_json_str(
        json_str: &str,
        field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
    ) -> Result<BehaviorKeys> {
        let json: serde_json::Value = serde_json::from_str(json_str)?;
        let map = match json {
            serde_json::Value::Object(m) => m,
            _ => return Err(BehaviorKeyJsonError::ExpectedTopLevelMap.into()),
        };

        let key_json = map.get("keys").ok_or(BehaviorKeyJsonError::ExpectedKeys)?;

        let mut field_spec_map = FieldSpecMap::empty();

        match key_json {
            serde_json::Value::Object(map) => {
                field_spec_map.try_extend(
                    map.into_iter()
                        .map(|(k, v)| {
                            Ok(field_spec_creator.create(
                                k.into(),
                                field_type_from_json(k, v)?,
                                FieldScope::Agent,
                            ))
                        })
                        .collect::<Result<Vec<_>>>()?,
                )?;
            }
            _ => return Err(BehaviorKeyJsonError::ExpectedKeysMap.into()),
        }

        let built_in_key_use: Result<_> = if let Some(v) = map.get("built_in_key_use") {
            match v {
                serde_json::Value::Object(map) => {
                    let selected = map
                        .get("selected")
                        .ok_or(BehaviorKeyJsonError::ExpectedBuiltInKeyUseSelectedField)?;
                    match selected {
                        serde_json::Value::String(string) => {
                            if string == "all" {
                                Ok(None)
                            } else {
                                Err(BehaviorKeyJsonError::ExpectedSelectedStringToBeAll.into())
                            }
                        }
                        serde_json::Value::Array(vals) => {
                            let mut res = vec![];
                            for val in vals {
                                let string = match val {
                                    // TODO: hashmap from string to `AgentStateField`
                                    serde_json::Value::String(string) => {
                                        let mut res = None;
                                        for field in AgentStateField::FIELDS {
                                            if field.name() == string {
                                                res = Some(field.name().to_string());
                                                break;
                                            }
                                        }
                                        res.ok_or_else(|| {
                                            BehaviorKeyJsonError::InvalidBuiltInKeyName(
                                                string.clone(),
                                            )
                                        })
                                    }
                                    _ => Err(
                                        BehaviorKeyJsonError::ExpectedSelectedArrayContainString,
                                    ),
                                }?;
                                res.push(string);
                            }
                            Ok(Some(res))
                        }
                        _ => Err(BehaviorKeyJsonError::ExpectedSelectedStringOrArray.into()),
                    }
                }
                serde_json::Value::Null => Ok(None),
                _ => Err(BehaviorKeyJsonError::ExpectedBuiltInKeyUseNullOrMap.into()),
            }
        } else {
            Ok(None)
        };

        let dyn_access = if let Some(value) = map.get("dynamic_access") {
            match value {
                serde_json::Value::Bool(b) => *b,
                _ => return Err(BehaviorKeyJsonError::NonBoolDynamicAccess.into()),
            }
        } else {
            false
        };

        Ok(BehaviorKeys {
            inner: field_spec_map,
            built_in_key_use: built_in_key_use?,
            dyn_access,
        })
    }

    // add all of the fields within self into builder
    fn get_field_specs(&self) -> impl Iterator<Item = &RootFieldSpec<EngineComponent>> {
        self.inner.field_specs()
    }
}

#[derive(Clone)]
pub struct Behavior {
    shared: SharedBehavior,
    keys: BehaviorKeys,
}

impl Behavior {
    pub fn shared(&self) -> &SharedBehavior {
        &self.shared
    }

    pub fn keys(&self) -> &BehaviorKeys {
        &self.keys
    }
}

#[derive(Clone)]
pub struct BehaviorMap {
    pub(in super::super) inner: HashMap<String, Behavior>,
    pub(in super::super) all_field_specs: FieldSpecMap<EngineComponent>,
}

impl TryFrom<(&ExperimentConfig, &RootFieldSpecCreator<EngineComponent>)> for BehaviorMap {
    type Error = Error;

    fn try_from(
        (experiment_config, field_spec_creator): (
            &ExperimentConfig,
            &RootFieldSpecCreator<EngineComponent>,
        ),
    ) -> Result<Self> {
        let mut meta = HashMap::new();
        let mut field_spec_map = FieldSpecMap::empty();

        experiment_config
            .run
            .base()
            .project_base
            .behaviors
            .iter()
            .try_for_each::<_, Result<()>>(|b| {
                if meta.contains_key(&b.name) {
                    return Ok(());
                }

                // Need to check whether we're dealing with rust built-in keys,
                // for which we always use the in-repo locally defined ones.

                // TODO: OS - Re-enable Rust Behavior Runner
                // let rust_built_in_behavior_keys = if rust::behaviors::is_built_in(&b.name) {
                //     let behavior = rust::behaviors::get_named_behavior(&b.name)
                //         .expect(&format!("Built in behavior {} not found", &b.name));
                //     let behavior_keys_src = behavior.behavior_keys_src.expect(&format!(
                //         "Expected built in Rust behavior `{}` to contain behavior keys",
                //         &b.name
                //     ));
                //     Some(behavior_keys_src)
                // } else {
                //     None
                // };
                let rust_built_in_behavior_keys = None;
                let keys = rust_built_in_behavior_keys
                    .or_else(|| b.behavior_keys_src.clone())
                    .map(|v| BehaviorKeys::from_json_str(&v, field_spec_creator))
                    .unwrap_or_else(|| {
                        // The default is to use all built-in keys
                        Ok(BehaviorKeys::default())
                    })?;
                field_spec_map.try_extend(
                    keys.get_field_specs()
                        .cloned()
                        .collect::<Vec<RootFieldSpec<EngineComponent>>>(),
                )?;
                let behavior = Behavior {
                    shared: b.clone(),
                    keys,
                };

                meta.insert(b.name.clone(), behavior);
                Ok(())
            })?;
        Ok(BehaviorMap {
            inner: meta,
            all_field_specs: field_spec_map,
        })
    }
}

impl BehaviorMap {
    pub fn iter_behaviors(&self) -> impl Iterator<Item = &Behavior> {
        self.inner.values()
    }
}

enum BaseKeyType {
    String,
    Boolean,
    Number,
    Struct,
    List,
    FixedSizeList,
    Any,
}

impl TryFrom<&str> for BaseKeyType {
    type Error = BehaviorKeyJsonError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "string" => Ok(BaseKeyType::String),
            "boolean" => Ok(BaseKeyType::Boolean),
            "number" => Ok(BaseKeyType::Number),
            "struct" => Ok(BaseKeyType::Struct),
            "list" => Ok(BaseKeyType::List),
            "fixed_size_list" => Ok(BaseKeyType::FixedSizeList),
            "any" => Ok(BaseKeyType::Any),
            _ => Err(BehaviorKeyJsonError::InvalidKeyType(value.to_string())),
        }
    }
}

fn field_spec_from_json(name: &str, source: &serde_json::Value) -> Result<FieldSpec> {
    Ok(FieldSpec {
        name: name.to_string(),
        field_type: field_type_from_json(name, source)?,
    })
}

fn field_type_from_json(name: &str, source: &serde_json::Value) -> Result<FieldType> {
    match source {
        serde_json::Value::Object(map) => {
            let key_base_type = match map
                .get("type")
                .ok_or_else(|| BehaviorKeyJsonError::InvalidKeyTypeType(name.to_string()))?
            {
                serde_json::Value::String(val) => BaseKeyType::try_from(val.as_ref()),
                _ => Err(BehaviorKeyJsonError::InvalidKeyTypeType(name.to_string())),
            }?;

            let nullable = match map
                .get("nullable")
                .ok_or_else(|| BehaviorKeyJsonError::InvalidKeyNullableType(name.to_string()))?
            {
                serde_json::Value::Bool(v) => Ok(*v),
                _ => Err(BehaviorKeyJsonError::InvalidKeyNullableType(
                    name.to_string(),
                )),
            }?;

            let variant = match key_base_type {
                BaseKeyType::String => FieldTypeVariant::String,
                BaseKeyType::Boolean => FieldTypeVariant::Boolean,
                BaseKeyType::Number => FieldTypeVariant::Number,
                BaseKeyType::Any => FieldTypeVariant::AnyType,
                BaseKeyType::Struct => {
                    let mut children = vec![];
                    match map.get("fields").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyFieldsType(name.to_string())
                    })? {
                        serde_json::Value::Object(map) => {
                            for (k, v) in map {
                                children.push(field_spec_from_json(k.as_ref(), v)?);
                            }
                            Ok(())
                        }
                        _ => Err(BehaviorKeyJsonError::InvalidKeyFieldsType(name.to_string())),
                    }?;

                    // Determinism:
                    children.sort_by(|a, b| a.name.cmp(&b.name));
                    FieldTypeVariant::Struct(children)
                }
                BaseKeyType::List => {
                    let child_source = map.get("child").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyChildType(name.to_string())
                    })?;
                    let child_key_type = field_type_from_json(name, child_source)?;
                    FieldTypeVariant::VariableLengthArray(Box::new(child_key_type))
                }
                BaseKeyType::FixedSizeList => {
                    let child_source = map.get("child").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyChildType(name.to_string())
                    })?;
                    let child_key_type = field_type_from_json(name, child_source)?;
                    let len = match map.get("length").ok_or_else(|| {
                        BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string())
                    })? {
                        serde_json::Value::Number(v) => {
                            if v.is_i64() {
                                // Safe unwrap
                                Ok(v.as_u64().unwrap() as usize)
                            } else {
                                Err(BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string()))
                            }
                        }
                        _ => Err(BehaviorKeyJsonError::InvalidKeyLengthType(name.to_string())),
                    }?;
                    FieldTypeVariant::FixedLengthArray {
                        field_type: Box::new(child_key_type),
                        len,
                    }
                }
            };

            Ok(FieldType { variant, nullable })
        }
        _ => Err(BehaviorKeyJsonError::ExpectedKeyObject(name.to_string()).into()),
    }
}

impl From<BehaviorKeyJsonError> for Error {
    fn from(err: BehaviorKeyJsonError) -> Self {
        Error::from(format!("Behavior Key Error {:?}", err))
    }
}

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
