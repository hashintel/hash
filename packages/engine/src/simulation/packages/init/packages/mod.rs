use std::collections::HashMap;

use enum_dispatch::enum_dispatch;
use lazy_static::lazy_static;
use strum_macros::IntoStaticStr;

use jspy::js::JsInitTask;
use jspy::py::PyInitTask;
use jspy::JsPyInitTaskResult;

use crate::simulation::packages::{
    id::{PackageId, PackageIdCreator},
    PackageType,
};

pub mod json;
pub mod jspy;

/// All init package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    JSON,
    JSPY,
}

/// All init package tasks are registered in this enum
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum InitTask {
    JsInitTask,
    PyInitTask,
}

/// All init package task messages are registered in this enum
pub enum InitTaskMessage {
    JsPyInitTaskMessage,
}

/// All init package task results are registered in this enum
#[enum_dispatch]
pub enum InitTaskResult {
    JsPyInitTaskResult,
}

lazy_static! {
    /// All init package creators are registered in this hashmap
    pub static ref PACKAGES: HashMap<Name, Box<dyn super::PackageCreator>> = {
        use Name::*;
        let mut m = HashMap::new();
        m.insert(JSON, json::Creator::new());
        m.insert(JSPY, jspy::Creator::new());
        m
    };

    pub static ref IDS: HashMap<Name, PackageId> = {
        use Name::*;
        let creator = PackageIdCreator::new(PackageType::Init);
        let mut m = HashMap::new();
        m.insert(JSON, creator.next());
        m.insert(JSPY, creator.next());
        m
    };
}
