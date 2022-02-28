use serde::{Deserialize, Serialize};

use super::Result;

/// Global constant values that are available within a simulation and are provided along with
/// initial world state
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Globals(pub serde_json::Value);

impl Globals {
    /// # Errors
    ///
    /// This function cannot fail, as Globals is a free-flowing JSON object.
    /// TODO: Audit this (Can a `serde_json::Value` be anything else?)
    pub fn from_json(value: serde_json::Value) -> Result<Globals, serde_json::Error> {
        serde_json::from_value(value)
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn from_json_unchecked(value: serde_json::Value) -> Globals {
        Globals::from_json(value)
            .expect("This should not happen (Globals is a free-flowing JSON object)")
    }

    #[must_use]
    pub fn empty() -> Globals {
        Globals(serde_json::Value::Object(serde_json::Map::new()))
    }

    pub fn get<S>(&self, key: S) -> Option<&serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref())
    }

    pub fn get_cloned<S>(&self, key: S) -> Option<serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref()).cloned()
    }
}

impl Default for Globals {
    fn default() -> Globals {
        Globals::empty()
    }
}
