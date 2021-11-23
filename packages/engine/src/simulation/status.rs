use crate::hash_types::worker::RunnerError;
use crate::output::OutputPersistenceResultRepr;

use super::Result;

use crate::experiment::package::StepUpdate;
use crate::proto::SimulationShortID;
use serde::{Deserialize, Serialize};

// Sent from sim runs to experiment main loop.
#[derive(Default, Debug, Serialize, Deserialize, PartialEq)]
pub struct SimStatus {
    pub sim_id: SimulationShortID,
    pub steps_taken: isize,
    pub early_stop: bool,
    pub stop_msg: Option<serde_json::Value>,
    pub stop_signal: bool,
    pub persistence_result: Option<(String, serde_json::Value)>,
    // TODO - OS do we need these within SimStatus or should they be handled elsewhere, such as WorkerPoolToExpCtlMsg::Errors and WorkerPoolToExpCtlMsg::Warnings
    pub error: Option<RunnerError>,
    pub warnings: Vec<RunnerError>,
    pub running: bool,
}

impl SimStatus {
    pub fn running(sim_id: SimulationShortID, steps_taken: isize) -> SimStatus {
        SimStatus {
            sim_id,
            steps_taken,
            running: true,
            ..SimStatus::default()
        }
    }

    // TODO: Check this makes sense, default gives misleading amount of steps etc.
    pub fn stop_signal(sim_id: SimulationShortID) -> SimStatus {
        SimStatus {
            sim_id,
            running: false,
            stop_signal: true,
            ..SimStatus::default()
        }
    }

    pub fn ended<P: OutputPersistenceResultRepr>(
        sim_id: SimulationShortID,
        steps_taken: isize,
        early_stop: bool,
        stop_msg: Option<serde_json::Value>,
        persistence_result: P,
    ) -> Result<SimStatus> {
        let persistence_result = OutputPersistenceResultRepr::into_value(persistence_result)
            .map(|(a, b)| (a.to_string(), b))?;
        Ok(SimStatus {
            sim_id,
            steps_taken,
            early_stop,
            stop_msg,
            persistence_result: Some(persistence_result),
            ..SimStatus::default()
        })
    }

    pub fn error<P: OutputPersistenceResultRepr>(
        sim_id: SimulationShortID,
        steps_taken: isize,
        error: RunnerError,
        persistence_result: Option<P>,
    ) -> Result<SimStatus> {
        let persistence_result = persistence_result
            .map(|res| {
                OutputPersistenceResultRepr::into_value(res).map(|(a, b)| (a.to_string(), b))
            })
            .transpose()?;
        Ok(SimStatus {
            sim_id,
            error: Some(error),
            steps_taken,
            running: false,
            persistence_result,
            ..SimStatus::default()
        })
    }
}
