pub mod controller;
mod error;

use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;
use stateful::global::Globals;

pub use self::error::{Error, Result};
use crate::proto;

pub type ExperimentRun = proto::ExperimentRun;

fn set_nested_global_property(
    map: &mut serde_json::Map<String, SerdeValue>,
    property_path: Vec<&str>,
    new_value: SerdeValue,
    cur_map_depth: usize,
) -> Result<()> {
    let name = property_path[cur_map_depth];
    if cur_map_depth == property_path.len() - 1 {
        // Last (i.e. deepest) nesting level
        // We allow varying properties that are not present in `globals.json`.
        let _ = map.insert(name.to_string(), new_value);
        Ok(())
    } else {
        // TODO: OS - Uninitialized nested globals
        let global_property = map
            .get_mut(name)
            .ok_or_else(|| Error::MissingChangedGlobalProperty(name.to_string()))?;
        set_nested_global_property(
            global_property
                .as_object_mut()
                .ok_or_else(|| Error::NestedPropertyNotObject(name.to_string()))?,
            property_path,
            new_value,
            cur_map_depth + 1,
        )
    }
}

pub fn apply_globals_changes(base: Globals, changes: &SerdeValue) -> Result<Globals> {
    let mut map = base
        .0
        .as_object()
        .ok_or(Error::BaseGlobalsNotProject)?
        .clone();
    let changes = changes.as_object().ok_or(Error::ChangedGlobalsNotObject)?;
    for (property_path, changed_value) in changes.iter() {
        let property_path = property_path.split('.').collect();
        set_nested_global_property(&mut map, property_path, changed_value.clone(), 0)?;
    }
    let globals = Globals(map.into());
    Ok(globals)
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Initializer {
    pub name: String,
    pub src: String,
}
