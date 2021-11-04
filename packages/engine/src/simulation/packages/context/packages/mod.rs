pub mod agent_messages;
pub mod api_requests;
pub mod neighbors;

use std::collections::HashMap;

use crate::simulation::enum_dispatch::*;
use crate::simulation::packages::{
    id::{PackageId, PackageIdCreator},
    PackageType,
};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use strum_macros::IntoStaticStr;

/// All context package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    AgentMessages,
    APIRequests,
    Neighbors,
}

/// All context package tasks are registered in this enum
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum ContextTask {}

/// All context package task messages are registered in this enum
#[enum_dispatch(Into<TaskResult>)]
#[derive(Debug, Serialize, Deserialize)]
pub enum ContextTaskMessage {}

/// All context package task results are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
pub enum ContextTaskResult {}

lazy_static! {
    /// All context package creators are registered in this hashmap
    pub static ref PACKAGES: HashMap<Name, Box<dyn super::PackageCreator>> = {
        use Name::*;
        let mut m = HashMap::new();
        m.insert(AgentMessages, agent_messages::Creator::new());
        m.insert(APIRequests, api_requests::Creator::new());
        m.insert(Neighbors, neighbors::Creator::new());
        m
    };

    pub static ref IDS: HashMap<Name, PackageId> = {
        use Name::*;
        let creator = PackageIdCreator::new(PackageType::Context);
        let mut m = HashMap::new();
        m.insert(AgentMessages, creator.next());
        m.insert(APIRequests, creator.next());
        m.insert(Neighbors, creator.next());
        m
    };
}
