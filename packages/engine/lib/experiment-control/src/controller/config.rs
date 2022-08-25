use execution::package::simulation::output::persistence::local::LocalPersistenceConfig;
use serde::{Deserialize, Serialize};

use crate::{environment::Environment, Error, Result};

pub const OUTPUT_PERSISTENCE_KEY: &str = "output_persistence";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum OutputPersistenceConfig {
    Local(LocalPersistenceConfig),
    None,
}

pub fn output_persistence(env: &Environment) -> Result<OutputPersistenceConfig> {
    get_dynamic(env, OUTPUT_PERSISTENCE_KEY)
}

pub fn get_dynamic<K>(env: &Environment, key: &str) -> Result<K>
where
    K: for<'de> Deserialize<'de>,
{
    env.dyn_payloads
        .get(key)
        .map(|value| serde_json::from_value(value.clone()).map_err(Error::from))
        .ok_or_else(|| Error::MissingConfiguration(key.to_string()))?
}
