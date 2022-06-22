use core::fmt;

use execution::{
    package::{
        experiment::{ExperimentId, ExperimentName, ExperimentPackageConfig},
        simulation::{init::InitialStateName, SimulationId},
    },
    runner::{
        comms::{PackageError, UserError, UserWarning},
        Language, RunnerError,
    },
    worker::RunnerSpawnConfig,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;
use simulation_structure::Simulation;
use stateful::global::Globals;

use crate::simulation::status::SimStatus;

// TODO: UNUSED: Needs triage
pub type SerdeMap = serde_json::Map<String, SerdeValue>;

pub type SimulationRegisteredId = String;

/// The message type sent from the engine to the orchestrator.
#[derive(Serialize, Deserialize, Debug)]
pub struct OrchestratorMsg {
    pub experiment_id: ExperimentId,
    pub body: EngineStatus,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub enum EngineStatus {
    Started,
    SimStatus(SimStatus),
    Exit,
    ProcessError(String),
    Stopping,
    SimStart {
        sim_id: SimulationId,
        globals: Globals,
    },
    SimStop(SimulationId),
    // TODO: OS - Confirm are these only Runner/Simulation errors, if so rename
    RunnerErrors(SimulationId, Vec<RunnerError>),
    RunnerWarnings(SimulationId, Vec<RunnerError>),
    UserErrors(SimulationId, Vec<UserError>),
    UserWarnings(SimulationId, Vec<UserWarning>),
    PackageError(SimulationId, PackageError),
    Logs(SimulationId, Vec<String>),
}

/// The message type sent from the orchestrator to the engine.
#[derive(Serialize, Deserialize, Debug)]
pub enum EngineMsg {
    Init(InitMessage),
}

/// The initialization message sent by an Orchestrator implementation to the Engine
#[derive(Serialize, Deserialize, Debug)]
pub struct InitMessage {
    /// Defines the type of Experiment that's being ran (e.g. a wrapper around a single-run of a
    /// simulation, or the configuration for a normal experiment)
    pub experiment: ExperimentRun,
    /// Unused
    pub env: ExecutionEnvironment,
    /// A JSON object of dynamic configurations for things like packages, see
    /// [`OUTPUT_PERSISTENCE_KEY`] for an example
    ///
    /// [`OUTPUT_PERSISTENCE_KEY`]: crate::experiment::controller::[`OUTPUT_PERSISTENCE_KEY`]
    pub dyn_payloads: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ExecutionEnvironment {
    Local { port: u16 },
    Staging,
    Production,
    None,
}

impl Default for ExecutionEnvironment {
    fn default() -> Self {
        ExecutionEnvironment::None
    }
}

impl EngineStatus {
    pub fn kind(&self) -> &'static str {
        match self {
            EngineStatus::Started => "Started",
            EngineStatus::SimStatus(_) => "SimStatus",
            EngineStatus::Exit => "Exit",
            EngineStatus::ProcessError(_) => "ProcessError",
            EngineStatus::Stopping => "Stopping",
            EngineStatus::SimStart {
                sim_id: _,
                globals: _,
            } => "SimStart",
            EngineStatus::SimStop(_) => "SimStop",
            EngineStatus::RunnerErrors(..) => "RunnerErrors",
            EngineStatus::RunnerWarnings(..) => "RunnerWarnings",
            EngineStatus::Logs(..) => "Logs",
            EngineStatus::UserErrors(..) => "UserErrors",
            EngineStatus::UserWarnings(..) => "UserWarnings",
            EngineStatus::PackageError(..) => "PackageError",
        }
    }
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
        &self.experiment().simulation
    }

    pub fn simualtion_mut(&mut self) -> &mut Simulation {
        &mut self.experiment_mut().simulation
    }

    pub fn config(&self) -> &ExperimentPackageConfig {
        &self.config
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProcessedExperimentRun {
    pub experiment: Experiment,
    /// The compute usage when the user initialized the run
    /// This is only valid at the start of the run
    pub compute_usage_remaining: i64,
}

/// A wrapper around an Option to avoid displaying the inner for Debug outputs,
/// i.e. debug::Debug now outputs: `Some(..)`
struct CleanOption<'a, T>(&'a Option<T>);

impl<T> fmt::Debug for CleanOption<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            Some(_) => fmt.write_str("Some(..)"),
            None => fmt.write_str("None"),
        }
    }
}
