use std::sync::Arc;

use execution::{
    package::PersistenceConfig,
    worker_pool::{WorkerAllocation, WorkerIndex},
};
use simulation_structure::SimulationShortId;
use stateful::global::Globals;

use crate::{
    config::{ExperimentConfig, SimRunConfig, StoreConfig},
    experiment::controller::error::Result,
    proto::ExperimentPackageConfig,
};

pub struct SimConfigurer {
    worker_allocator: WorkerAllocator,
}

impl SimConfigurer {
    pub fn new(package_config: &ExperimentPackageConfig, num_workers: usize) -> SimConfigurer {
        let num_workers_per_sim = match package_config {
            ExperimentPackageConfig::Simple(config) => {
                let num_runs = config.changed_globals.len();
                std::cmp::max(1, (num_workers as f64 / num_runs as f64).ceil() as usize)
            }
            ExperimentPackageConfig::SingleRun(_) => std::cmp::max(1, num_workers),
        };

        SimConfigurer {
            worker_allocator: WorkerAllocator {
                num_workers,
                num_workers_per_sim,
                next_worker: 0,
            },
        }
    }

    pub fn configure_next(
        &mut self,
        exp_config: &Arc<ExperimentConfig>,
        id: SimulationShortId,
        globals: Globals,
        store_config: StoreConfig,
        persistence_config: PersistenceConfig,
        max_num_steps: usize,
    ) -> Result<SimRunConfig> {
        let worker_allocation = self.worker_allocator.next();
        let config = SimRunConfig::new(
            exp_config,
            id,
            globals,
            worker_allocation,
            store_config,
            persistence_config,
            max_num_steps,
        )?;
        Ok(config)
    }
}

struct WorkerAllocator {
    num_workers: usize,
    num_workers_per_sim: usize,
    next_worker: usize,
}

impl WorkerAllocator {
    pub fn next(&mut self) -> WorkerAllocation {
        (0..self.num_workers_per_sim)
            .map(|_| {
                let w = self.next_worker;
                self.next_worker = (w + 1) % self.num_workers;
                WorkerIndex::new(w)
            })
            .collect()
    }
}
