pub mod analysis;
pub mod json_state;

use self::{analysis::AnalysisOutput, json_state::JSONStateOutput};
use std::collections::HashMap;

use crate::simulation::packages::{
    id::{PackageId, PackageIdCreator},
    PackageType,
};

use crate::simulation::enum_dispatch::*;
use crate::simulation::packages::name::PackageName;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use strum_macros::IntoStaticStr;

/// All output package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    Analysis,
    JSONState,
}

#[derive(Clone)]
pub struct OutputPackagesSimConfig {
    pub map: HashMap<PackageName, serde_json::Value>,
}

#[enum_dispatch(OutputRepr)]
pub enum Output {
    AnalysisOutput,
    JSONStateOutput,
}

/// All output package tasks are registered in this enum
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

/// All output package task messages are registered in this enum
#[enum_dispatch(Into<TaskResult>)]
#[derive(Debug, Serialize, Deserialize)]
pub enum OutputTaskMessage {}

/// All output package task results are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
pub enum OutputTaskResult {}

lazy_static! {
    /// All output package creators are registered in this hashmap
    pub static ref PACKAGES: HashMap<Name, Box<dyn super::PackageCreator>> = {
        use Name::*;
        let mut m = HashMap::new();
        m.insert(Analysis, analysis::Creator::new());
        m.insert(JSONState, json_state::Creator::new());
        m
    };

    pub static ref IDS: HashMap<Name, PackageId> = {
        use Name::*;
        let creator = PackageIdCreator::new(PackageType::Output);
        let mut m = HashMap::new();
        m.insert(Analysis, creator.next());
        m.insert(JSONState, creator.next());
        m
    };
}
