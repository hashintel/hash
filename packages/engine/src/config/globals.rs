use serde::{Deserialize, Serialize};

use super::Result;

// TODO: OS - Go through code-base and verify that out-dated references to "properties" are now
// "globals". We also have some consts that come in along with our initial world state.
// These, we call 'Globals', and store them in context.
// For now, they're... you guessed it, JSON.
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

    #[must_use]
    pub fn from_json_unchecked(value: serde_json::Value) -> Globals {
        Globals::from_json(value)
            .expect("This should not happen (Globals is a free-flowing JSON object)")
    }

    #[must_use]
    pub fn empty() -> Globals {
        Globals(serde_json::Value::Object(serde_json::Map::new()))
    }

    #[tracing::instrument(skip_all)]
    pub fn get<S>(&self, key: S) -> Option<&serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref())
    }

    #[tracing::instrument(skip_all)]
    pub fn get_cloned<S>(&self, key: S) -> Option<serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref()).cloned()
    }
}

impl Default for Globals {
    #[tracing::instrument(skip_all)]
    fn default() -> Globals {
        Globals::empty()
    }
}
