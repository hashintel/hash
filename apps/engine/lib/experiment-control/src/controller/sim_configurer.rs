use std::sync::Arc;

use execution::{
    package::{
        experiment::basic::BasicExperimentConfig,
        simulation::{PersistenceConfig, SimulationId},
    },
    worker_pool::{WorkerAllocation, WorkerIndex},
};
use experiment_structure::{ExperimentConfig, SimulationRunConfig};
use stateful::{field::Schema, global::Globals};

pub struct SimConfigurer {
    worker_allocator: WorkerAllocator,
}

impl SimConfigurer {
    pub fn new(package_config: &BasicExperimentConfig, num_workers: usize) -> SimConfigurer {
        let num_workers_per_sim = match package_config {
            BasicExperimentConfig::Simple(config) => {
                let num_runs = config.changed_globals.len();
                std::cmp::max(1, (num_workers as f64 / num_runs as f64).ceil() as usize)
            }
            BasicExperimentConfig::SingleRun(_) => std::cmp::max(1, num_workers),
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
        experiment_config: Arc<ExperimentConfig>,
        id: SimulationId,
        globals: Globals,
        schema: Schema,
        persistence_config: PersistenceConfig,
        max_num_steps: usize,
    ) -> SimulationRunConfig {
        SimulationRunConfig::new(
            experiment_config,
            id,
            globals,
            self.worker_allocator.next(),
            schema,
            persistence_config,
            max_num_steps,
        )
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
