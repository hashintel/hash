use crate::datastore::schema::{FieldScope, FieldSource, FieldSpecMapBuilder};
use crate::hash_types::state::AgentStateField;

// use crate::worker::runner::rust;
use crate::{
    config::ExperimentConfig,
    datastore::{
        error::{Error, Result},
        schema::{FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant},
    },
    experiment::SharedBehavior,
};

use crate::proto::ExperimentRunTrait;
use crate::simulation::package::name::PackageName;
use std::{collections::HashMap, convert::TryFrom};

pub fn add_fields_from_behavior_keys(
    builder: &mut FieldSpecMapBuilder,
    field_specs: FieldSpecMap,
) -> Result<()> {
    for (_key, spec) in field_specs.iter() {
        builder.add_field_spec(
            spec.inner.name.clone(),
            spec.inner.field_type.clone(),
            spec.scope.clone(),
        )?;
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq, Default)]
pub struct BehaviorKeys {
    // Name -> JSON string
    pub inner: FieldSpecMap,
    pub built_in_key_use: Option<Vec<String>>,
    pub dyn_access: bool,
}

impl BehaviorKeys {
    pub fn from_json_str<K: AsRef<str>>(json_str: K) -> Result<BehaviorKeys> {
        Self::_from_json_str(json_str.as_ref(), true)
    }

    // TODO: remove reference to mergeable
    pub fn from_json_str_non_mergeable<K: AsRef<str>>(json_str: K) -> Result<BehaviorKeys> {
        Self::_from_json_str(json_str.as_ref(), false)
    }

    pub fn _from_json_str(json_str: &str, _is_mergeable: bool) -> Result<BehaviorKeys> {
        let json: serde_json::Value = serde_json::from_str(json_str)?;
        let map = match json {
            serde_json::Value::Object(m) => m,
            _ => return Err(BehaviorKeyJSONError::ExpectedTopLevelMap.into()),
        };

        let key_json = map
            .get("keys")
            .ok_or_else(|| BehaviorKeyJSONError::ExpectedKeys)?;
        let mut builder = FieldSpecMapBuilder::new();
        // TODO: Packages shouldn't have to set the source
        builder.source(FieldSource::Package(PackageName::State(
            super::super::Name::BehaviorExecution,
        )));
        match key_json {
            serde_json::Value::Object(map) => {
                for (k, v) in map {
                    builder.add_field_spec(
                        k.into(),
                        FieldType::from_json(&k, v)?,
                        FieldScope::Agent,
                    )?;
                }
            }
            _ => return Err(BehaviorKeyJSONError::ExpectedKeysMap.into()),
        }

        let built_in_key_use: Result<_> = if let Some(v) = map.get("built_in_key_use") {
            match v {
                serde_json::Value::Object(map) => {
                    let selected = map
                        .get("selected")
                        .ok_or(BehaviorKeyJSONError::ExpectedBuiltInKeyUseSelectedField)?;
                    match selected {
                        serde_json::Value::String(string) => {
                            if string == "all" {
                                Ok(None)
                            } else {
                                Err(BehaviorKeyJSONError::ExpectedSelectedStringToBeAll.into())
                            }
                        }
                        serde_json::Value::Array(vals) => {
                            let mut res = vec![];
                            for val in vals {
                                let string = match val {
                                    // TODO hashmap from string to `AgentStateField`
                                    serde_json::Value::String(string) => {
                                        let mut res = None;
                                        for field in AgentStateField::FIELDS {
                                            if field.name() == string {
                                                res = Some(field.name().to_string());
                                                break;
                                            }
                                        }
                                        res.ok_or_else(|| {
                                            BehaviorKeyJSONError::InvalidBuiltInKeyName(
                                                string.clone(),
                                            )
                                        })
                                    }
                                    _ => Err(
                                        BehaviorKeyJSONError::ExpectedSelectedArrayContainString,
                                    ),
                                }?;
                                res.push(string);
                            }
                            Ok(Some(res))
                        }
                        _ => Err(BehaviorKeyJSONError::ExpectedSelectedStringOrArray.into()),
                    }
                }
                serde_json::Value::Null => Ok(None),
                _ => Err(BehaviorKeyJSONError::ExpectedBuiltInKeyUseNullOrMap.into()),
            }
        } else {
            Ok(None)
        };

        let dyn_access = if let Some(value) = map.get("dynamic_access") {
            match value {
                serde_json::Value::Bool(b) => *b,
                _ => return Err(BehaviorKeyJSONError::NonBoolDynamicAccess.into()),
            }
        } else {
            false
        };

        return Ok(BehaviorKeys {
            inner: builder.build(),
            built_in_key_use: built_in_key_use?,
            dyn_access,
        });
    }

    // add all of the fields within self into builder
    fn add_all_to_builder(&self, builder: &mut FieldSpecMapBuilder) -> Result<()> {
        for (_key, spec) in self.inner.iter() {
            builder.add_field_spec(
                spec.inner.name.clone(),
                spec.inner.field_type.clone(),
                spec.scope.clone(),
            )?;
        }
        Ok(())
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
    pub(in super::super) all_field_specs: FieldSpecMap,
}

impl TryFrom<&ExperimentConfig> for BehaviorMap {
    type Error = Error;

    fn try_from(experiment_config: &ExperimentConfig) -> Result<Self> {
        let mut builder = FieldSpecMapBuilder::new();
        // TODO: A package shouldn't have to manually set the source
        builder.source(FieldSource::Package(PackageName::State(
            super::super::Name::BehaviorExecution,
        )));
        let mut meta = HashMap::new();
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

                // TODO OS - Re-enable Rust Behavior Runner
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
                    .map(|v| BehaviorKeys::from_json_str(&v))
                    .unwrap_or_else(|| {
                        // The default is to use all built-in keys
                        Ok(BehaviorKeys::default())
                    })?;
                keys.add_all_to_builder(&mut builder)?;
                let behavior = Behavior {
                    shared: b.clone(),
                    keys,
                };

                meta.insert(b.name.clone(), behavior);
                Ok(())
            })?;
        Ok(BehaviorMap {
            inner: meta,
            all_field_specs: builder.build(),
        })
    }
}

impl BehaviorMap {
    pub fn iter_behaviors(&self) -> impl Iterator<Item = &Behavior> {
        self.inner.values().into_iter()
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
    type Error = BehaviorKeyJSONError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "string" => Ok(BaseKeyType::String),
            "boolean" => Ok(BaseKeyType::Boolean),
            "number" => Ok(BaseKeyType::Number),
            "struct" => Ok(BaseKeyType::Struct),
            "list" => Ok(BaseKeyType::List),
            "fixed_size_list" => Ok(BaseKeyType::FixedSizeList),
            "any" => Ok(BaseKeyType::Any),
            _ => Err(BehaviorKeyJSONError::InvalidKeyType(value.to_string())),
        }
    }
}

impl FieldSpec {
    fn from_json(name: &str, source: &serde_json::Value) -> Result<FieldSpec> {
        Ok(FieldSpec {
            name: name.to_string(),
            field_type: FieldType::from_json(name, source)?,
        })
    }
}

impl FieldType {
    fn from_json(name: &str, source: &serde_json::Value) -> Result<FieldType> {
        match source {
            serde_json::Value::Object(map) => {
                let key_base_type = match map
                    .get("type")
                    .ok_or_else(|| BehaviorKeyJSONError::InvalidKeyTypeType(name.to_string()))?
                {
                    serde_json::Value::String(val) => BaseKeyType::try_from(val.as_ref()),
                    _ => Err(BehaviorKeyJSONError::InvalidKeyTypeType(name.to_string())),
                }?;

                let nullable = match map
                    .get("nullable")
                    .ok_or_else(|| BehaviorKeyJSONError::InvalidKeyNullableType(name.to_string()))?
                {
                    serde_json::Value::Bool(v) => Ok(*v),
                    _ => Err(BehaviorKeyJSONError::InvalidKeyNullableType(
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
                            BehaviorKeyJSONError::InvalidKeyFieldsType(name.to_string())
                        })? {
                            serde_json::Value::Object(map) => {
                                for (k, v) in map {
                                    children.push(FieldSpec::from_json(k.as_ref(), v)?);
                                }
                                Ok(())
                            }
                            _ => Err(BehaviorKeyJSONError::InvalidKeyFieldsType(name.to_string())),
                        }?;

                        // Determinism:
                        children.sort_by(|a, b| a.name.cmp(&b.name));
                        FieldTypeVariant::Struct(children)
                    }
                    BaseKeyType::List => {
                        let child_source = map.get("child").ok_or_else(|| {
                            BehaviorKeyJSONError::InvalidKeyChildType(name.to_string())
                        })?;
                        let child_key_type = FieldType::from_json(name, child_source)?;
                        FieldTypeVariant::VariableLengthArray(Box::new(child_key_type))
                    }
                    BaseKeyType::FixedSizeList => {
                        let child_source = map.get("child").ok_or_else(|| {
                            BehaviorKeyJSONError::InvalidKeyChildType(name.to_string())
                        })?;
                        let child_key_type = FieldType::from_json(name, child_source)?;
                        let len = match map.get("length").ok_or_else(|| {
                            BehaviorKeyJSONError::InvalidKeyLengthType(name.to_string())
                        })? {
                            serde_json::Value::Number(v) => {
                                if v.is_i64() {
                                    // Safe unwrap
                                    Ok(v.as_u64().unwrap() as usize)
                                } else {
                                    Err(BehaviorKeyJSONError::InvalidKeyLengthType(
                                        name.to_string(),
                                    ))
                                }
                            }
                            _ => Err(BehaviorKeyJSONError::InvalidKeyLengthType(name.to_string())),
                        }?;
                        FieldTypeVariant::FixedLengthArray {
                            kind: Box::new(child_key_type),
                            len,
                        }
                    }
                };

                Ok(FieldType { variant, nullable })
            }
            _ => Err(BehaviorKeyJSONError::ExpectedKeyObject(name.to_string()).into()),
        }
    }
}

impl From<BehaviorKeyJSONError> for crate::datastore::error::Error {
    fn from(err: BehaviorKeyJSONError) -> Self {
        crate::datastore::error::Error::from(format!("Behavior Key Error {:?}", err))
    }
}

#[derive(thiserror::Error, Debug)]
pub enum BehaviorKeyJSONError {
    #[error("{0}")]
    Unique(String),
    #[error("Expected the top-level of behavior keys definition to be a JSON object")]
    ExpectedTopLevelMap,
    #[error("Expected \"keys\" field in top-level behavior keys definition")]
    ExpectedKeys,
    #[error("Expected \"keys\" field in top-level behavior keys definition to be a JSON object")]
    ExpectedKeysMap,
    #[error("Expected \"built_in_key_use\" field in top-level behavior keys definition to be either a JSON object or null")]
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
    #[error("Expected key with name {0} to have a boolean \"nullable\" sub-field in one of its sub-types")]
    InvalidKeyNullableType(String),
    #[error("Expected key with name {0} to have a list \"fields\" sub-field in one of its \"object\"-type sub-types")]
    InvalidKeyFieldsType(String),
    #[error("Expected key with name {0} to have a object \"child\" sub-field in one of its \"list\"/\"fixed_size_list\"-type sub-types")]
    InvalidKeyChildType(String),
    #[error("Expected key with name {0} to have a positive integer \"length\" sub-field in one of its \"fixed_size_list\"-type sub-types")]
    InvalidKeyLengthType(String),
    #[error("Invalid built-in key name {0}")]
    InvalidBuiltInKeyName(String),
    #[error("Dynamic access flag must be boolean if present")]
    NonBoolDynamicAccess,
}

impl From<&str> for BehaviorKeyJSONError {
    fn from(string: &str) -> Self {
        BehaviorKeyJSONError::Unique(string.to_string())
    }
}

impl From<String> for BehaviorKeyJSONError {
    fn from(string: String) -> Self {
        BehaviorKeyJSONError::Unique(string)
    }
}
