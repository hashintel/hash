use stateful::{
    agent::AgentStateField,
    field::{FieldScope, FieldSpecMap, RootFieldSpec, RootFieldSpecCreator},
};

use crate::{
    package::simulation::state::behavior_execution::{
        behavior::json::field_type_from_json, BehaviorKeyJsonError,
    },
    Result,
};

#[derive(Clone, Debug, Eq, PartialEq, Default)]
pub struct BehaviorKeys {
    pub inner: FieldSpecMap,
    pub built_in_key_use: Option<Vec<String>>,
    pub dyn_access: bool,
}

impl BehaviorKeys {
    pub fn from_json_str<K: AsRef<str>>(
        json_str: K,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<BehaviorKeys> {
        Self::_from_json_str(json_str.as_ref(), field_spec_creator)
    }

    pub fn _from_json_str(
        json_str: &str,
        field_spec_creator: &RootFieldSpecCreator,
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
    pub(super) fn get_field_specs(&self) -> impl Iterator<Item = &RootFieldSpec> {
        self.inner.field_specs()
    }
}
