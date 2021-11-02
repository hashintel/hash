use super::error::{Error, Result};

use std::collections::HashMap;

use crate::proto::SimulationShortID;

use crate::config::{SimulationConfig, WorkerAllocation};

#[derive(Default)]
pub struct SimulationRuns {
    // Associates a simulation run with the workers available to it
    worker_allocations: HashMap<SimulationShortID, WorkerAllocation>,
}

impl SimulationRuns {
    pub fn push(&mut self, sim_id: SimulationShortID, config: &SimulationConfig) -> Result<()> {
        self.worker_allocations
            .try_insert(sim_id, config.engine.worker_allocation.clone())?;
        Ok(())
    }

    pub fn get_worker_allocation(&self, id: SimulationShortID) -> Result<&WorkerAllocation> {
        self.worker_allocations
            .get(&id)
            .ok_or_else(|| Error::MissingSimulationWithID(id))
    }
}
