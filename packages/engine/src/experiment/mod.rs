pub mod controller;
pub mod package;

use crate::experiment::controller::comms::exp_pkg_ctl::ExpPkgCtlSend;
use crate::experiment::package::UpdateRequest;
use crate::proto::{ExperimentPackageConfig, ExperimentRunBase, SimulationShortID};
use crate::{config::ExperimentConfig, hash_types, proto};
use crate::config::Globals;
use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;
use thiserror::Error as ThisError;
use tokio::{sync::mpsc::UnboundedSender, task::JoinHandle};

use self::controller::comms::exp_pkg_update::ExpPkgUpdateRecv;

pub type ExperimentId = String;
pub type SimId = String;
pub type Result<T, E = Error> = std::result::Result<T, E>;
pub type SerdeMap = serde_json::Map<String, SerdeValue>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Number of simulation runs should be greater than 0")]
    NoSimulationRuns,

    #[error("Unexpected simulation run id ({0}) received")]
    MissingSimulationRun(SimulationShortID),

    #[error("Unexpected opt client id received: {0:?}")]
    MissingClient(String, String),

    #[error("Internal id response has existing simulation run id ({0})")]
    DuplicateSimId(String),

    #[error("Error sending control to experiment main loop: {0:?}")]
    ExperimentSend(#[from] tokio::sync::mpsc::error::SendError<ExperimentControl>),

    #[error("Error receiving from experiment main loop: {0}")]
    ExperimentRecv(String),

    #[error("Optimization experiment package data doesn't contain maximum number of runs")]
    MissingMaxRuns,

    #[error("Invalid maximum number of runs for optimization experiment: {0}")]
    InvalidMaxRuns(i64),

    #[error("Optimization experiment package data doesn't contain metric name string")]
    MissingMetricName,

    #[error("Optimization experiment package data metric name is not a string")]
    MetricNameNotString,

    #[error("Invalid optimization experiment metric objective: {0:?}")]
    InvalidMetricObjective(Option<MetricObjective>),

    #[error("Python child process spawn")]
    PythonSpawn(std::io::Error),

    #[error("nng: {0:?}")]
    Nng(#[from] nng::Error),

    #[error("serde: {0:?}")]
    Serde(#[from] serde_json::Error),

    #[error("Received Python message is not utf-8: {0:?}")]
    PythonNotUtf8(std::str::Utf8Error),

    #[error("Received Python message doesn't have 'type' field: {0:?}")]
    PythonNoType(SerdeMap),

    #[error("Received Python message 'type' field is not a string: {0:?}")]
    PythonTypeNotString(SerdeMap),

    #[error("Received Python message doesn't have 'client_id' field: {0:?}")]
    PythonNoId(SerdeMap),

    #[error("Received Python message 'client_id' field is not a string: {0:?}")]
    PythonIdNotString(SerdeMap),

    #[error("Received Python start message doesn't have 'properties' field: {0:?}")]
    PythonNoProperties(SerdeMap),

    // #[error("Received Python start message 'properties' field is not a JSON object")]
    // PythonPropertiesNotObject,
    #[error("Simulation run's changed property values are not in a JSON object")]
    ChangedPropertiesNotObject,

    #[error("globals.json doesn't contain a JSON object")]
    BaseGlobalsNotProject,

    #[error("globals.json doesn't contain property to vary: {0}")]
    MissingChangedGlobalProperty(String),

    #[error("Property is not object, but is supposed to contain a varying property: {0}")]
    NestedPropertyNotObject(String),
}

pub type SharedDataset = proto::SharedDataset;
pub type SharedBehavior = proto::SharedBehavior;
pub type SimPackageArgs = proto::SimPackageArgs;
pub type Simulation = proto::ProjectBase;
pub type PackageDataField = proto::PackageDataField;
pub type MetricObjective = proto::MetricObjective;
pub type PackageName = proto::ExperimentPackageConfig;
pub type ExperimentRun = proto::ExperimentRun;

pub fn objective_to_string(m: &Option<MetricObjective>) -> Result<String> {
    match m {
        Some(MetricObjective::Max) => Ok("max".into()),
        Some(MetricObjective::Min) => Ok("min".into()),
        _ => Err(Error::InvalidMetricObjective(m.clone())),
    }
}

fn set_nested_property(
    map: &mut serde_json::Map<String, SerdeValue>,
    property_path: Vec<&str>,
    new_value: SerdeValue,
    cur_map_depth: usize,
) -> Result<()> {
    let name = property_path[cur_map_depth];
    if cur_map_depth == property_path.len() - 1 {
        // Last (i.e. deepest) nesting level
        // We allow varying properties that are not present in `globals.json`.
        let _ = map.insert(name.to_string(), new_value);
        Ok(())
    } else {
        // TODO[3]: Uninitialized nested properties
        let property = map
            .get_mut(name)
            .ok_or_else(|| Error::MissingChangedGlobalProperty(name.to_string()))?;
        set_nested_property(
            property
                .as_object_mut()
                .ok_or_else(|| Error::NestedPropertyNotObject(name.to_string()))?,
            property_path,
            new_value,
            cur_map_depth + 1,
        )
    }
}

pub fn apply_property_changes(mut base: Globals, changes: &SerdeValue) -> Result<Globals> {
    let mut map = base
        .0
        .as_object()
        .ok_or(Error::BaseGlobalsNotProject)?
        .clone();
    let changes = changes
        .as_object()
        .ok_or(Error::ChangedPropertiesNotObject)?;
    for (property_path, changed_value) in changes.iter() {
        let property_path = property_path.split('.').collect();
        set_nested_property(&mut map, property_path, changed_value.clone(), 0)?;
    }
    let globals = Globals(map.into())?;
    Ok(globals)
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Initializer {
    pub name: String,
    pub src: String,
}

#[derive(Debug)]
pub enum ExperimentControl {
    StartSim {
        sim_id: SimulationShortID,
        properties: SerdeValue,
        max_num_steps: usize,
    },
    PauseSim(SimulationShortID),
    ResumeSim(SimulationShortID),
    StopSim(SimulationShortID),
    StopExperiment,
}

pub fn init_exp_package(
    experiment_config: &ExperimentConfig<ExperimentRun>,
    exp_package_config: ExperimentPackageConfig,
    pkg_to_exp: ExpPkgCtlSend,
    pkg_from_exp: ExpPkgUpdateRecv,
) -> Result<(JoinHandle<Result<()>>, Option<UpdateRequest>)> {
    let (future, request) = match exp_package_config {
        ExperimentPackageConfig::Simple(config) => {
            let pkg = package::simple::SimpleExperiment::new(&experiment_config, config)?;
            let future = tokio::spawn(async move { pkg.run(pkg_to_exp, pkg_from_exp).await });
            (future, None)
        }
        ExperimentPackageConfig::SingleRun(config) => {
            let pkg = package::single::SingleRunExperiment::new(&experiment_config, config)?;
            let future = tokio::spawn(async move { pkg.run(pkg_to_exp, pkg_from_exp).await });
            (future, None)
        }
    };
    Ok((future, request))
}
