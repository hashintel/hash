use execution::{
    package::simulation::{output::persistence::OutputPersistenceResult, SimulationId},
    runner::RunnerError,
};
use serde::{Deserialize, Serialize};

use crate::simulation::{command::StopCommand, Result};

// Sent from sim runs to experiment main loop.
#[derive(Default, Debug, Serialize, Deserialize, PartialEq)]
pub struct SimStatus {
    pub sim_id: SimulationId,
    pub steps_taken: isize,
    pub early_stop: bool,
    pub stop_msg: Vec<StopCommand>,
    pub stop_signal: bool,
    pub persistence_result: Option<(String, serde_json::Value)>,
    // TODO: OS do we need these within SimStatus or should they be handled elsewhere, such as
    // WorkerPoolToExpCtlMsg::Errors and WorkerPoolToExpCtlMsg::Warnings
    pub error: Option<RunnerError>,
    pub warnings: Vec<RunnerError>,
    pub running: bool,
}

impl SimStatus {
    pub fn running(sim_id: SimulationId, steps_taken: isize) -> SimStatus {
        SimStatus {
            sim_id,
            steps_taken,
            running: true,
            ..SimStatus::default()
        }
    }

    // TODO: Check this makes sense, default gives misleading amount of steps etc.
    // TODO: UNUSED: Needs triage
    pub fn stop_signal(sim_id: SimulationId) -> SimStatus {
        SimStatus {
            sim_id,
            running: false,
            stop_signal: true,
            ..SimStatus::default()
        }
    }

    pub fn ended<P: OutputPersistenceResult>(
        sim_id: SimulationId,
        steps_taken: isize,
        early_stop: bool,
        stop_msg: Vec<StopCommand>,
        persistence_result: P,
    ) -> Result<SimStatus> {
        let persistence_result = OutputPersistenceResult::into_value(persistence_result)
            .map(|(a, b)| (a.to_string(), b))?;
        Ok(SimStatus {
            sim_id,
            steps_taken,
            early_stop,
            stop_msg,
            stop_signal: true,
            running: false,
            persistence_result: Some(persistence_result),
            ..SimStatus::default()
        })
    }

    pub fn error<P: OutputPersistenceResult>(
        sim_id: SimulationId,
        steps_taken: isize,
        error: RunnerError,
        persistence_result: Option<P>,
    ) -> Result<SimStatus> {
        let persistence_result = persistence_result
            .map(|res| OutputPersistenceResult::into_value(res).map(|(a, b)| (a.to_string(), b)))
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
