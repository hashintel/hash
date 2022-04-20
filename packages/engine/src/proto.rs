use std::{
    convert::Infallible,
    fmt::{Debug, Display, Formatter},
    str::FromStr,
};

use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;
use stateful::global::{Globals, SharedDataset};
use uuid::Uuid;

use crate::simulation::status::SimStatus;

// TODO: UNUSED: Needs triage
pub type SerdeMap = serde_json::Map<String, SerdeValue>;

pub type ExperimentId = Uuid;
pub type SimulationRegisteredId = String;
pub type SimulationShortId = u32;

#[derive(Hash, PartialEq, Eq, PartialOrd, Ord, Clone, Serialize, Deserialize)]
pub struct ExperimentName(String);

impl ExperimentName {
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl Debug for ExperimentName {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&self.0, f)
    }
}

impl Display for ExperimentName {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl From<String> for ExperimentName {
    fn from(name: String) -> Self {
        Self(name)
    }
}

impl FromStr for ExperimentName {
    type Err = Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(s.to_string()))
    }
}

use crate::worker::{
    runner::comms::outbound::{PackageError, UserError, UserWarning},
    RunnerError,
};

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
        sim_id: SimulationShortId,
        globals: Globals,
    },
    SimStop(SimulationShortId),
    // TODO: OS - Confirm are these only Runner/Simulation errors, if so rename
    RunnerErrors(SimulationShortId, Vec<RunnerError>),
    RunnerWarnings(SimulationShortId, Vec<RunnerError>),
    UserErrors(SimulationShortId, Vec<UserError>),
    UserWarnings(SimulationShortId, Vec<UserWarning>),
    PackageError(SimulationShortId, PackageError),
    Logs(SimulationShortId, Vec<String>),
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
    pub experiment: ExperimentRunRepr,
    /// Unused
    pub env: ExecutionEnvironment,
    /// A JSON object of dynamic configurations for things like packages, see
    /// [`experiment::controller::config::OUTPUT_PERSISTENCE_KEY`] for an example
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

// #[derive(Deserialize, Serialize, Debug, Clone)]
// TODO: UNUSED: Needs triage
pub struct FetchedDataset {
    pub name: Option<String>,
    pub shortname: String,
    pub filename: String,
    pub contents: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct SharedBehavior {
    /// This is the unique identifier (also the file/path) that, in the case of Cloud runs, is used
    /// by the HASH API
    pub id: String,
    /// This is the full name of the file (can be used to refer to the behavior).
    /// It is often the case that self.id = self.name (except sometimes for dependencies by
    /// `@hash`).
    pub name: String,
    /// These are alternative representations on how one can refer to this behavior
    pub shortnames: Vec<String>,
    /// Source code for the behaviors
    pub behavior_src: Option<String>,
    /// Behavior key definition for this behavior
    pub behavior_keys_src: Option<String>,
}

impl Debug for SharedBehavior {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SharedBehavior")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("shortnames", &self.shortnames)
            .field("behavior_src", &CleanOption(&self.behavior_src))
            .field("behavior_keys_src", &CleanOption(&self.behavior_keys_src))
            .finish()
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SimPackageArgs {
    pub name: String,
    pub data: serde_json::Value,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum InitialStateName {
    InitJson,
    InitPy,
    InitJs,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct InitialState {
    pub name: InitialStateName,
    pub src: String,
}

/// Analogous to `SimulationSrc` in the web editor
/// This contains all of the source code for a specific simulation, including
/// initial state source, analysis source, experiment source, globals source (globals.json),
/// dependencies source and the source for all running behaviors
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProjectBase {
    pub name: String,
    pub initial_state: InitialState,
    pub globals_src: String,
    pub experiments_src: Option<String>,
    pub behaviors: Vec<SharedBehavior>,
    pub datasets: Vec<SharedDataset>,
    pub packages: Vec<SimPackageArgs>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct PackageDataField {
    pub name: String,
    /// Discrete values to explore
    pub values: Option<Vec<serde_json::Value>>,
    /// A range of values to explore
    pub range: Option<String>,
}

#[derive(Eq, PartialEq, Debug, Clone)]
pub enum MetricObjective {
    Max,
    Min,
    Other(String),
}

impl Serialize for MetricObjective {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(match self {
            MetricObjective::Max => "max",
            MetricObjective::Min => "min",
            MetricObjective::Other(s) => s,
        })
    }
}

impl<'de> Deserialize<'de> for MetricObjective {
    fn deserialize<D: ::serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = <String>::deserialize(deserializer)?;
        match s.as_str() {
            "max" => Ok(MetricObjective::Max),
            "min" => Ok(MetricObjective::Min),
            _ => Ok(MetricObjective::Other(s)),
        }
    }
}

// TODO: investigate if the renames are still needed
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SimpleExperimentConfig {
    /// The experiment name
    pub experiment_name: ExperimentName,
    /// The global properties changed for each simulation run
    #[serde(rename = "changedProperties")]
    pub changed_globals: Vec<SerdeValue>,
    /// Number of steps each run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
    /// Maximum amount of simulations that can be ran in parallel - None is unlimited
    pub max_sims_in_parallel: Option<usize>,
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SingleRunExperimentConfig {
    /// Number of steps the run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct OptimizationExperimentConfigPayload {
    /// The metric to optimize for
    #[serde(rename = "metricName")]
    pub metric_name: Option<String>,
    /// The objective for the metric
    #[serde(rename = "metricObjective")]
    pub metric_objective: Option<MetricObjective>,
    /// The maximum number of runs to try in an experiment
    #[serde(rename = "maxRuns")]
    pub max_runs: Option<i64>,
    /// The maximum number of steps a run should go for
    #[serde(rename = "maxSteps")]
    pub max_steps: Option<i64>,
    /// The minimum number of steps a run should go for
    #[serde(rename = "minSteps")]
    pub min_steps: Option<i64>,
    /// The fields to explore as hyperparameters
    pub fields: Option<Vec<PackageDataField>>,
    /// Combinations of parameter values to use for the first runs
    #[serde(rename = "initialPoints")]
    pub initial_points: Option<Vec<SerdeValue>>,
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct OptimizationExperimentConfig {
    /// The experiment name
    pub experiment_name: String,
    pub payload: OptimizationExperimentConfigPayload,
    /// Number of simulation runs that are to be run in parallel
    pub num_parallel_runs: usize,
}

#[derive(Serialize, Eq, PartialEq, Debug, Clone)]
pub enum PackageConfig<'a> {
    EmptyPackageConfig,
    ExperimentPackageConfig(&'a ExperimentPackageConfig),
    ExtendedExperimentPackageConfig(&'a ExtendedExperimentPackageConfig),
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExperimentPackageConfig {
    Simple(SimpleExperimentConfig),
    SingleRun(SingleRunExperimentConfig),
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExtendedExperimentPackageConfig {
    Basic(ExperimentPackageConfig),
    Optimization(OptimizationExperimentConfig),
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub enum ExperimentRunRepr {
    ExperimentRunBase(ExperimentRunBase),
    ExperimentRun(ExperimentRun),
    ExtendedExperimentRun(ExtendedExperimentRun),
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExperimentRunBase {
    pub name: ExperimentName,
    pub id: ExperimentId,
    pub project_base: ProjectBase,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExperimentRun {
    pub base: ExperimentRunBase,
    pub package_config: ExperimentPackageConfig,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExtendedExperimentRun {
    pub base: ExperimentRunBase,
    pub package_config: ExtendedExperimentPackageConfig,
}

pub trait ExperimentRunTrait: Clone + for<'a> Deserialize<'a> + Serialize {
    fn base(&self) -> &ExperimentRunBase;
    fn base_mut(&mut self) -> &mut ExperimentRunBase;
    fn package_config(&self) -> PackageConfig<'_>;
}

impl ExperimentRunTrait for ExperimentRunBase {
    fn base(&self) -> &ExperimentRunBase {
        self
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        self
    }

    fn package_config(&self) -> PackageConfig<'_> {
        PackageConfig::EmptyPackageConfig
    }
}

impl ExperimentRunTrait for ExperimentRun {
    fn base(&self) -> &ExperimentRunBase {
        &self.base
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        &mut self.base
    }

    fn package_config(&self) -> PackageConfig<'_> {
        PackageConfig::ExperimentPackageConfig(&self.package_config)
    }
}

impl ExperimentRunTrait for ExtendedExperimentRun {
    fn base(&self) -> &ExperimentRunBase {
        &self.base
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        &mut self.base
    }

    fn package_config(&self) -> PackageConfig<'_> {
        PackageConfig::ExtendedExperimentPackageConfig(&self.package_config)
    }
}

impl ExperimentRunTrait for ExperimentRunRepr {
    fn base(&self) -> &ExperimentRunBase {
        match self {
            Self::ExperimentRun(inner) => inner.base(),
            Self::ExperimentRunBase(inner) => inner.base(),
            Self::ExtendedExperimentRun(inner) => inner.base(),
        }
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        match self {
            Self::ExperimentRun(inner) => inner.base_mut(),
            Self::ExperimentRunBase(inner) => inner.base_mut(),
            Self::ExtendedExperimentRun(inner) => inner.base_mut(),
        }
    }

    fn package_config(&self) -> PackageConfig<'_> {
        match self {
            Self::ExperimentRun(inner) => inner.package_config(),
            Self::ExperimentRunBase(inner) => inner.package_config(),
            Self::ExtendedExperimentRun(inner) => inner.package_config(),
        }
    }
}

impl<E: ExperimentRunTrait> From<&E> for ExperimentRunBase {
    fn from(value: &E) -> Self {
        value.base().clone()
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProcessedExperimentRun {
    pub experiment: ExperimentRun,
    /// The compute usage when the user initialized the run
    /// This is only valid at the start of the run
    pub compute_usage_remaining: i64,
}

/// A wrapper around an Option to avoid displaying the inner for Debug outputs,
/// i.e. debug::Debug now outputs: `Some(..)`
struct CleanOption<'a, T>(&'a Option<T>);

impl<T> Debug for CleanOption<'_, T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self.0 {
            Some(_) => f.write_str("Some(..)"),
            None => f.write_str("None"),
        }
    }
}
