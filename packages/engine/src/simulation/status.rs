use crate::hash_types::worker::RunnerError;
use crate::output::OutputPersistenceResultRepr;

use super::Result;

use crate::proto::SimulationShortID;
use serde::{Deserialize, Serialize};

// Sent from sim runs to experiment main loop.
#[derive(Default, Debug, Serialize, Deserialize)]
pub struct SimStatus {
    pub sim_id: SimulationShortID,
    pub steps_taken: isize,
    pub early_stop: bool,
    pub stop_msg: Option<serde_json::Value>,
    pub stop_signal: bool,
    pub persistence_result: Option<(&'static str, serde_json::Value)>,
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
        Ok(SimStatus {
            sim_id,
            steps_taken: *steps_taken,
            early_stop,
            stop_msg,
            persistence_result: Some(OutputPersistenceResultRepr::as_value(persistence_result)?), // TODO OS I (Alfie) wrapped this in a Some, do we want to make it None if as_value returns err
            ..SimStatus::default()
        })
    }

    pub fn error<P: OutputPersistenceResultRepr>(
        sim_id: SimulationShortID,
        steps_taken: isize,
        error: RunnerError,
        persistence_result: Option<P>,
    ) -> SimStatus {
        SimStatus {
            sim_id,
            error: Some(error),
            steps_taken,
            running: false,
            persistence_result: Some(OutputPersistenceResultRepr::as_value(persistence_result)?),
            ..SimStatus::default()
        }
    }
}
