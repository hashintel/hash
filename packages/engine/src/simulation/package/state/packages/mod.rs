pub mod behavior_execution;
pub mod topology;
use serde::{Deserialize, Serialize};

use std::collections::HashMap;

use crate::simulation::package::{
    id::{PackageId, PackageIdCreator},
    PackageType,
};

use crate::simulation::enum_dispatch::*;
use lazy_static::lazy_static;
use strum_macros::IntoStaticStr;

use self::behavior_execution::tasks::{
    ExecuteBehaviorsTask, ExecuteBehaviorsTaskMessage, ExecuteBehaviorsTaskResult,
};

/// All state package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    BehaviorExecution,
    Topology,
}

/// All state package tasks are registered in this enum
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum StateTask {
    ExecuteBehaviorsTask,
}

/// All state package task messages are registered in this enum
#[enum_dispatch(Into<TaskResult>)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum StateTaskMessage {
    ExecuteBehaviorsTaskMessage,
}

/// All state package task results are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Debug, Clone)]
pub enum StateTaskResult {
    ExecuteBehaviorsTaskResult,
}

lazy_static! {
    /// All state package creators are registered in this hashmap
    pub static ref PACKAGES: HashMap<Name, Box<dyn super::PackageCreator>> = {
        use Name::*;
        let mut m = HashMap::new();
        // m.insert(BehaviorExecution, behavior_execution::Creator::new());
        m.insert(Topology, topology::Creator::new());
        m
    };

    pub static ref IDS: HashMap<Name, PackageId> = {
        use Name::*;
        let mut creator = PackageIdCreator::new(PackageType::State);
        let mut m = HashMap::new();
        // m.insert(BehaviorExecution, creator.next());
        m.insert(Topology, creator.next());
        m
    };
}
