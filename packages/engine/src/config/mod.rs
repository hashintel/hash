use std::sync::Arc;

use execution::{
    package::simulation::{PackageCreatorConfig, PersistenceConfig, SimulationId},
    worker_pool::WorkerAllocation,
};
use simulation_structure::ExperimentConfig;
use stateful::{field::Schema, global::Globals, state::StateCreateParameters};

pub use self::{
    error::{Error, Result},
    simulation::SimulationConfig,
};

mod error;
mod simulation;

pub const MIN_AGENTS_PER_GROUP: usize = 10;

pub struct SimulationRunConfig {
    experiment: Arc<ExperimentConfig>,
    simulation: SimulationConfig,
}

impl SimulationRunConfig {
    pub fn new(
        experiment_config: Arc<ExperimentConfig>,
        id: SimulationId,
        globals: Globals,
        worker_allocation: WorkerAllocation,
        schema: Schema,
        persistence_config: PersistenceConfig,
        max_num_steps: usize,
    ) -> SimulationRunConfig {
        let simulation_config = simulation_config(
            id,
            globals,
            worker_allocation,
            schema,
            persistence_config,
            max_num_steps,
        );
        SimulationRunConfig {
            experiment: experiment_config,
            simulation: simulation_config,
        }
    }

    pub fn experiment_config(&self) -> &ExperimentConfig {
        &self.experiment
    }

    pub fn simulation_config(&self) -> &SimulationConfig {
        &self.simulation
    }

    pub fn to_state_create_parameters(&self) -> StateCreateParameters {
        StateCreateParameters {
            target_min_groups: self.experiment.worker_pool.num_workers,
            target_group_size: MIN_AGENTS_PER_GROUP..self.experiment.target_max_group_size,
            memory_base_id: self.experiment.experiment().id().into(),
            agent_schema: Arc::clone(&self.simulation.schema.agent_schema),
            message_schema: Arc::clone(&self.simulation.schema.message_schema),
        }
    }
}

fn simulation_config(
    id: SimulationId,
    globals: Globals,
    worker_allocation: WorkerAllocation,
    schema: Schema,
    persistence_config: PersistenceConfig,
    max_num_steps: usize,
) -> SimulationConfig {
    SimulationConfig {
        id,
        package_creator: PackageCreatorConfig {
            agent_schema: Arc::clone(&schema.agent_schema),
            globals,
            persistence: persistence_config,
        },
        worker_allocation: Arc::new(worker_allocation),
        schema: Arc::new(schema),
        max_num_steps,
    }
}
