use execution::package::simulation::PackageInitConfig;
use serde::{Deserialize, Serialize};
use stateful::global::Dataset;

/// This contains all the source code for a specific simulation.
///
/// This includes initial state source, analysis source, experiment source, globals source
/// (globals.json), dependencies source and the source for all running behaviors.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SimulationSource {
    pub name: String,
    pub globals_src: String,
    pub experiments_src: Option<String>,
    pub datasets: Vec<Dataset>,
    pub package_init: PackageInitConfig,
}
