use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};
use stateful::{agent::AgentSchema, global::Globals};

use crate::package::simulation::{
    init::InitialState, state::behavior_execution::Behavior, PackageName,
};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SimPackageArgs {
    pub name: String,
    pub data: serde_json::Value,
}

// TODO: The name might be confused with the init package type. If we can come up with another name,
//   this would be great.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PackageInitConfig {
    pub packages: Vec<SimPackageArgs>,
    pub initial_state: InitialState,
    pub behaviors: Vec<Behavior>,
}

#[derive(Clone)]
pub struct OutputPackagesSimConfig {
    pub map: HashMap<PackageName, serde_json::Value>,
}

#[derive(Clone)]
pub struct PersistenceConfig {
    pub output_config: OutputPackagesSimConfig,
}

pub struct PackageCreatorConfig {
    pub agent_schema: Arc<AgentSchema>,
    pub globals: Globals,
    pub persistence: PersistenceConfig,
}
