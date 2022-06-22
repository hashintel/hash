use execution::{
    package::{
        experiment::{ExperimentId, ExperimentName, ExperimentPackageConfig},
        simulation::init::InitialStateName,
    },
    runner::Language,
    worker::RunnerSpawnConfig,
};
use serde::{Deserialize, Serialize};

use crate::Simulation;

/// Specific configuration needed for either Experiments or single runs of Simulations
#[derive(Debug, Clone)]
pub enum ExperimentType {
    /// A single run of a Simulation, wrapped as an Experiment
    SingleRun {
        /// Number of steps to run
        num_steps: usize,
    },
    /// A configured Experiment
    Simple {
        /// Name of the experiment specified in _experiments.json_
        name: ExperimentName,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Experiment {
    name: ExperimentName,
    simulation: Simulation,
    id: ExperimentId,
}

impl Experiment {
    pub fn new(name: ExperimentName, simulation: Simulation) -> Self {
        Self {
            name,
            simulation,
            id: ExperimentId::generate(),
        }
    }

    pub fn id(&self) -> ExperimentId {
        self.id
    }

    pub fn name(&self) -> &ExperimentName {
        &self.name
    }

    pub fn simulation(&self) -> &Simulation {
        &self.simulation
    }

    pub fn simulation_mut(&mut self) -> &mut Simulation {
        &mut self.simulation
    }

    /// Returns a [`RunnerSpawnConfig`] matching the config required by the files present in the
    /// experiment.
    pub fn create_runner_spawn_config(&self) -> RunnerSpawnConfig {
        RunnerSpawnConfig {
            python: self.requires_runner(Language::Python),
            rust: self.requires_runner(Language::Rust),
            javascript: self.requires_runner(Language::JavaScript),
        }
    }

    /// Returns `true` if the experiment uses the language's init or has any behavior of the
    /// language.
    fn requires_runner(&self, language: Language) -> bool {
        #[allow(clippy::match_like_matches_macro)]
        let requires_init = match (language, &self.simulation.package_init.initial_state.name) {
            (Language::JavaScript, InitialStateName::InitJs) => true,
            (Language::Python, InitialStateName::InitPy) => true,
            _ => false,
        };

        requires_init
            || self
                .simulation
                .package_init
                .behaviors
                .iter()
                .any(|behavior| {
                    behavior
                        .language()
                        .map(|behavior_lang| behavior_lang == language)
                        .unwrap_or(false)
                })
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExperimentRun {
    experiment: Experiment,
    config: ExperimentPackageConfig,
}

impl ExperimentRun {
    pub fn new(experiment: Experiment, config: ExperimentPackageConfig) -> Self {
        Self { experiment, config }
    }

    pub fn experiment(&self) -> &Experiment {
        &self.experiment
    }

    pub fn experiment_mut(&mut self) -> &mut Experiment {
        &mut self.experiment
    }

    pub fn simulation(&self) -> &Simulation {
        self.experiment().simulation()
    }

    pub fn simualtion_mut(&mut self) -> &mut Simulation {
        self.experiment_mut().simulation_mut()
    }

    pub fn config(&self) -> &ExperimentPackageConfig {
        &self.config
    }
}
