mod package_creators;

use execution::package::simulation::PackageInitConfig;
use serde::{Deserialize, Serialize};
use stateful::global::Dataset;

pub use self::package_creators::PackageCreators;

/// Analogous to `SimulationSrc` in the web editor
/// This contains all of the source code for a specific simulation, including
/// initial state source, analysis source, experiment source, globals source (globals.json),
/// dependencies source and the source for all running behaviors
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Simulation {
    pub name: String,
    pub globals_src: String,
    pub experiments_src: Option<String>,
    pub datasets: Vec<Dataset>,
    pub package_init: PackageInitConfig,
}
