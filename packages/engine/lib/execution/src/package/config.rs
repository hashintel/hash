use serde::{Deserialize, Serialize};

use crate::package::{init::InitialState, state::behavior_execution::SharedBehavior};

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
    pub behaviors: Vec<SharedBehavior>,
}
