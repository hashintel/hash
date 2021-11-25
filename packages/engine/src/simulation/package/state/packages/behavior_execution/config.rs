use crate::proto::SharedBehavior;

use crate::{ExperimentConfig, Language};

use super::fields::behavior::BehaviorMap;
use super::{Error, Result};

use serde::{Deserialize, Serialize};

use std::collections::HashMap;
use std::convert::TryFrom;
use std::ops::Deref;

// TODO: Package's experiment init message should have payload with
//       Vec of behavior descriptions in `behavior_descs`.
#[derive(Serialize, Deserialize)]
pub struct BehaviorDescription {
    pub id: u32,
    pub name: String,
    pub source: String,
    pub columns: Vec<String>,
    pub language: Language, // serde serialized to "Python", "JavaScript" or "Rust"
    pub dyn_access: bool,
}

pub struct BehaviorConfig {
    behaviors: BehaviorMap,
    indices: BehaviorIndices,
}

impl BehaviorConfig {
    pub fn new(exp_config: &ExperimentConfig) -> Result<BehaviorConfig> {
        let behaviors = BehaviorMap::try_from(exp_config)?;
        let indices = BehaviorIndices::from_behaviors(&behaviors)?;
        Ok(BehaviorConfig { behaviors, indices })
    }

    pub fn get_index_from_name<K: Deref<Target = [u8]>>(&self, key: &K) -> Option<&BehaviorIndex> {
        self.indices.get_index(key)
    }

    pub fn get_name_from_index(&self, behavior_index: &BehaviorIndex) -> Option<&String> {
        self.indices.get_name(behavior_index)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BehaviorIndex(u16, u16);

impl BehaviorIndex {
    pub fn lang_index(&self) -> u16 {
        self.0
    }

    pub fn lang_behavior_index(&self) -> u16 {
        self.1
    }
}

pub struct BehaviorIndices {
    name_to_index: HashMap<Vec<u8>, BehaviorIndex>,
    index_to_name: HashMap<BehaviorIndex, String>,
}

impl BehaviorIndices {
    fn from_behaviors(behaviors: &BehaviorMap) -> Result<BehaviorIndices> {
        let mut lang_counts = [0_u16; Language::NUM];

        let mut index_to_name = HashMap::new();
        let mut name_to_index = HashMap::new();
        for behavior in behaviors.iter_behaviors() {
            let shared = behavior.shared();
            let lang_index = Language::from_file_name(&shared.name)
                .map_err(|_| Error::from(format!("Invalid behavior name: \"{}\"", &shared.name)))?
                as usize;
            let behavior_index = BehaviorIndex(lang_index as u16, lang_counts[lang_index]);
            lang_counts[lang_index] += 1;

            index_to_name.insert(behavior_index, shared.name.clone());
            name_to_index.insert(shared.name.clone().into_bytes(), behavior_index);
            for alt_name in shared.shortnames.iter() {
                name_to_index.insert(alt_name.clone().into_bytes(), behavior_index);
            }
        }

        Ok(BehaviorIndices {
            index_to_name,
            name_to_index,
        })
    }

    pub fn get_index<K: Deref<Target = [u8]>>(&self, key: &K) -> Option<&BehaviorIndex> {
        self.name_to_index.get(key.deref())
    }

    pub fn get_name(&self, behavior_index: &BehaviorIndex) -> Option<&String> {
        self.index_to_name.get(behavior_index)
    }
}

#[derive(Clone)]
pub struct BehaviorName(Vec<u8>);

impl BehaviorName {
    pub fn from_string(s: String) -> BehaviorName {
        BehaviorName(s.as_bytes().to_vec())
    }

    pub fn from_str<K: AsRef<str>>(s: K) -> BehaviorName {
        BehaviorName(s.as_ref().as_bytes().to_vec())
    }

    pub fn as_str(&self) -> &str {
        // Safe as creation only possible through strings
        std::str::from_utf8(&self.0).unwrap()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendableBehaviorKeys {
    field_names: Vec<String>,
    dyn_access: bool,
    built_in_key_use: Option<Vec<String>>,
}

pub fn init_message(
    behavior_map: &BehaviorMap,
) -> Result<HashMap<Language, Vec<(SharedBehavior, SendableBehaviorKeys)>>> {
    let mut partitioned = HashMap::new();
    for (file_name, behavior) in &behavior_map.inner {
        let lang = Language::from_file_name(file_name)
            .map_err(|_| Error::from("Couldn't get language from behavior file name"))?;
        partitioned.entry(lang).or_insert_with(Vec::new);

        let shared = behavior.shared().clone();
        let keys = behavior.keys();
        let sendable = SendableBehaviorKeys {
            field_names: keys
                .inner
                .iter()
                .map(|(_key, spec)| spec.inner.name.clone())
                .collect(),
            dyn_access: keys.dyn_access,
            built_in_key_use: keys.built_in_key_use.clone(),
        };
        // Unwrap cannot fail
        partitioned.get_mut(&lang).unwrap().push((shared, sendable));
    }
    Ok(partitioned)
}
