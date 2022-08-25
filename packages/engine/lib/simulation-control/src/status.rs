use execution::{
    package::simulation::{output::persistence::OutputPersistenceResult, SimulationId},
    runner::RunnerError,
};
use serde::{Deserialize, Serialize};

use crate::{command::StopCommand, Result};

// Sent from sim runs to experiment main loop.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
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
    /// Default value for `SimStatus` but not exposed to the user.
    fn new(sim_id: SimulationId) -> Self {
        SimStatus {
            sim_id,
            steps_taken: 0,
            early_stop: false,
            stop_msg: vec![],
            stop_signal: false,
            persistence_result: None,
            error: None,
            warnings: vec![],
            running: false,
        }
    }

    pub fn running(sim_id: SimulationId, steps_taken: isize) -> SimStatus {
        SimStatus {
            steps_taken,
            running: true,
            ..SimStatus::new(sim_id)
        }
    }

    // TODO: Check this makes sense, default gives misleading amount of steps etc.
    // TODO: UNUSED: Needs triage
    pub fn stop_signal(sim_id: SimulationId) -> SimStatus {
        SimStatus {
            running: false,
            stop_signal: true,
            ..SimStatus::new(sim_id)
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
            steps_taken,
            early_stop,
            stop_msg,
            stop_signal: true,
            running: false,
            persistence_result: Some(persistence_result),
            ..SimStatus::new(sim_id)
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
            error: Some(error),
            steps_taken,
            running: false,
            persistence_result,
            ..SimStatus::new(sim_id)
        })
    }
}
