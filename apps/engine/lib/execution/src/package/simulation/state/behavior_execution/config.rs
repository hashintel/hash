use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{
    package::simulation::state::behavior_execution::BehaviorMap, runner::Language, Error, Result,
};

#[derive(Serialize, Deserialize)]
pub struct BehaviorDescription {
    pub id: BehaviorId,
    pub name: String,
    pub short_names: Vec<String>,
    pub source: String,
    pub required_field_keys: Vec<String>,
    pub language: Language,
    pub dyn_access: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BehaviorId(u16, u16);

impl BehaviorId {
    pub fn lang_index(&self) -> u16 {
        self.0
    }

    pub fn lang_behavior_index(&self) -> u16 {
        self.1
    }
}

pub struct BehaviorIds {
    name_to_index: HashMap<Vec<u8>, BehaviorId>,
    // TODO: UNUSED: Needs triage
    index_to_name: HashMap<BehaviorId, String>,
}

impl BehaviorIds {
    pub(crate) fn from_behaviors(behaviors: &BehaviorMap) -> Result<BehaviorIds> {
        let mut lang_counts = [0_u16; Language::NUM];

        let mut index_to_name = HashMap::new();
        let mut name_to_index = HashMap::new();
        for behavior in behaviors.iter_behaviors() {
            let shared = behavior.shared();
            let lang_index = Language::from_file_name(&shared.name)
                .map_err(|_| Error::from(format!("Invalid behavior name: \"{}\"", &shared.name)))?
                .as_index();
            let behavior_id = BehaviorId(lang_index as u16, lang_counts[lang_index]);
            lang_counts[lang_index] += 1;

            index_to_name.insert(behavior_id, shared.name.clone());
            name_to_index.insert(shared.name.clone().into_bytes(), behavior_id);
            for alt_name in shared.shortnames.iter() {
                name_to_index.insert(alt_name.clone().into_bytes(), behavior_id);
            }
        }

        Ok(BehaviorIds {
            index_to_name,
            name_to_index,
        })
    }

    pub fn get_index(&self, key: &[u8]) -> Option<&BehaviorId> {
        self.name_to_index.get(key)
    }

    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
    pub fn get_name(&self, behavior_index: &BehaviorId) -> Option<&String> {
        self.index_to_name.get(behavior_index)
    }
}

#[derive(Clone)]
pub struct BehaviorName(Vec<u8>);

impl BehaviorName {
    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
    pub fn from_string(s: String) -> BehaviorName {
        BehaviorName(s.as_bytes().to_vec())
    }

    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
    pub fn from_str<K: AsRef<str>>(s: K) -> BehaviorName {
        BehaviorName(s.as_ref().as_bytes().to_vec())
    }

    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
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

/// Create the initial `BehaviorDescription`s that go in the experiment initialization
/// message that goes to the worker.
pub fn exp_init_message(
    behavior_ids: &BehaviorIds,
    behavior_map: &BehaviorMap,
) -> Result<Vec<BehaviorDescription>> {
    let behavior_descriptions = behavior_map
        .inner
        .iter()
        .map(|(file_name, behavior)| {
            let shared = behavior.shared();
            let keys = behavior.keys();

            let language = Language::from_file_name(file_name)
                .map_err(|_| Error::from("Couldn't get language from behavior file name"))?;
            let id = behavior_ids
                .name_to_index
                .get(shared.name.as_bytes())
                .ok_or_else(|| Error::from("Couldn't get index from behavior name"))?;
            let source = shared
                .behavior_src
                .clone()
                .ok_or_else(|| Error::from("SharedBehavior didn't have an attached source"))?;
            let required_field_keys = keys
                .inner
                .iter()
                .map(|(key, _)| key.value().to_string())
                .chain(
                    keys.built_in_key_use
                        .iter()
                        .flat_map(|keys| keys.iter().cloned()),
                )
                .collect::<Vec<_>>();

            Ok(BehaviorDescription {
                id: *id,
                name: shared.name.to_string(),
                short_names: shared.shortnames.clone(),
                source,
                required_field_keys,
                language,
                dyn_access: keys.dyn_access,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(behavior_descriptions)
}
