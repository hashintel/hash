use std::collections::HashMap;

use crate::{package::simulation::SimulationId, worker_pool::WorkerAllocation, Error, Result};

#[derive(Default)]
pub struct SimulationRuns {
    // Associates a simulation run with the workers available to it
    worker_allocations: HashMap<SimulationId, WorkerAllocation>,
}

impl SimulationRuns {
    pub fn push(
        &mut self,
        sim_id: SimulationId,
        worker_allocation: WorkerAllocation,
    ) -> Result<()> {
        self.worker_allocations
            .try_insert(sim_id, worker_allocation)
            .map_err(|_| Error::from("Occupied hashmap key"))?;
        Ok(())
    }

    pub fn get_worker_allocation(&self, id: SimulationId) -> Result<&WorkerAllocation> {
        self.worker_allocations
            .get(&id)
            .ok_or(Error::MissingSimulationWithId(id))
    }
}
