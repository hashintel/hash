pub mod controller;
mod error;
pub mod package;

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;
use stateful::globals::Globals;
use tokio::task::JoinHandle;
use tracing::Instrument;

pub use self::error::{Error, Result};
use crate::{
    config::ExperimentConfig,
    experiment::controller::comms::{exp_pkg_ctl::ExpPkgCtlSend, exp_pkg_update::ExpPkgUpdateRecv},
    proto,
    types::SpanId,
};

pub type SharedDataset = proto::SharedDataset;
pub type SharedBehavior = proto::SharedBehavior;
pub type SimPackageArgs = proto::SimPackageArgs;
pub type Simulation = proto::ProjectBase;
pub type PackageDataField = proto::PackageDataField;
pub type MetricObjective = proto::MetricObjective;
pub type PackageName = proto::ExperimentPackageConfig;
pub type ExperimentRun = proto::ExperimentRun;

// TODO: UNUSED: Needs triage
pub fn objective_to_string(m: &Option<MetricObjective>) -> Result<String> {
    match m {
        Some(MetricObjective::Max) => Ok("max".into()),
        Some(MetricObjective::Min) => Ok("min".into()),
        _ => Err(Error::InvalidMetricObjective(m.clone())),
    }
}

fn set_nested_global_property(
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
        // TODO: OS - Uninitialized nested globals
        let global_property = map
            .get_mut(name)
            .ok_or_else(|| Error::MissingChangedGlobalProperty(name.to_string()))?;
        set_nested_global_property(
            global_property
                .as_object_mut()
                .ok_or_else(|| Error::NestedPropertyNotObject(name.to_string()))?,
            property_path,
            new_value,
            cur_map_depth + 1,
        )
    }
}

pub fn apply_globals_changes(base: Globals, changes: &SerdeValue) -> Result<Globals> {
    let mut map = base
        .0
        .as_object()
        .ok_or(Error::BaseGlobalsNotProject)?
        .clone();
    let changes = changes.as_object().ok_or(Error::ChangedGlobalsNotObject)?;
    for (property_path, changed_value) in changes.iter() {
        let property_path = property_path.split('.').collect();
        set_nested_global_property(&mut map, property_path, changed_value.clone(), 0)?;
    }
    let globals = Globals(map.into());
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
        sim_id: proto::SimulationShortId,
        changed_globals: serde_json::Value,
        max_num_steps: usize,
        span_id: SpanId,
    },
    // TODO: add span_ids
    PauseSim(proto::SimulationShortId),
    ResumeSim(proto::SimulationShortId),
    StopSim(proto::SimulationShortId),
}

pub fn init_exp_package(
    experiment_config: Arc<ExperimentConfig>,
    exp_package_config: proto::ExperimentPackageConfig,
    pkg_to_exp: ExpPkgCtlSend,
    exp_pkg_update_recv: ExpPkgUpdateRecv,
) -> Result<JoinHandle<Result<()>>> {
    let future = match exp_package_config {
        proto::ExperimentPackageConfig::Simple(config) => {
            let pkg = package::simple::SimpleExperiment::new(&experiment_config, config)?;
            tokio::spawn(
                async move { pkg.run(pkg_to_exp, exp_pkg_update_recv).await }.in_current_span(),
            )
        }
        proto::ExperimentPackageConfig::SingleRun(config) => {
            let pkg = package::single::SingleRunExperiment::new(
                &Arc::new(experiment_config.as_ref().into()),
                config,
            )?;
            tokio::spawn(
                async move { pkg.run(pkg_to_exp, exp_pkg_update_recv).await }.in_current_span(),
            )
        }
    };
    Ok(future)
}
