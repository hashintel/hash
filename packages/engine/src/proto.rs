use crate::hash_types::worker::RunnerError;
use crate::simulation::status::SimStatus;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;

pub type SerdeMap = serde_json::Map<String, SerdeValue>;

pub type ExperimentRegisteredID = String;
pub type SimulationRegisteredID = String;
pub type SimulationShortID = u32;

/// The message type sent from the engine to the orchestrator.
#[derive(Serialize, Deserialize, Debug)]
pub struct OrchestratorMsg {
    pub experiment_id: String,
    pub body: EngineStatus,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub enum EngineStatus {
    Started,
    SimStatus(SimStatus),
    Exit,
    ProcessError(String),
    Stopping,
    SimStart(SimulationShortID, serde_json::Value),
    SimStop(SimulationShortID),
    Errors(Option<SimulationShortID>, Vec<RunnerError>),
    Warnings(Option<SimulationShortID>, Vec<RunnerError>),
}

/// The message type sent from the orchestrator to the engine.
#[derive(Serialize, Deserialize, Debug)]
pub enum EngineMsg<E: ExperimentRunRepr> {
    Init(InitMessage<E>),
    SimRegistered(SimulationShortID, SimulationRegisteredID),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct InitMessage<E: ExperimentRunRepr> {
    pub experiment: E,
    pub env: ExecutionEnvironment,
    pub dyn_payloads: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ExecutionEnvironment {
    Local { port: u16 },
    Staging,
    Production,
}

impl EngineStatus {
    pub fn kind(&self) -> &'static str {
        match self {
            EngineStatus::Started => "Started",
            EngineStatus::RunnerStatus(_) => "RunnerStatus",
            EngineStatus::Exit => "Exit",
            EngineStatus::ProcessError(_) => "ProcessError",
            EngineStatus::Stopping => "Stopping",
            EngineStatus::SimStart(_, _) => "SimStart",
            EngineStatus::SimStop(_) => "SimStop",
            EngineStatus::Errors(_, _) => "Errors",
            EngineStatus::Warnings(_, _) => "Warnings",
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SharedDataset {
    pub name: Option<String>,
    pub shortname: String,
    pub filename: String,
    pub url: Option<String>,
    /// Whether the downloadable dataset is a csv
    pub raw_csv: bool,
    pub data: Option<String>,
}

// #[derive(Deserialize, Serialize, Debug, Clone)]
pub struct FetchedDataset {
    pub name: Option<String>,
    pub shortname: String,
    pub filename: String,
    pub contents: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SharedBehavior {
    /// This is the unique identifier (also the file/path) that, in the case of Cloud runs, is used by the HASH API
    pub id: String,
    /// This is the full name of the file (can be used to refer to the behavior).
    /// It is often the case that self.id = self.name (except sometimes for dependencies by `@hash`).
    pub name: String,
    /// These are alternative representations on how one can refer to this behavior
    pub shortnames: Vec<String>,
    pub behavior_src: Option<String>, // Source code for the behaviors
    pub behavior_keys_src: Option<String>, // Behavior key definition for this behavior
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
/// initial state source, analysis source, experiment source, properties source (globals.json),
/// dependencies source and the source for all running behaviors
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProjectBase {
    pub initial_state: InitialState,
    pub globals_src: String,
    pub dependencies_src: Option<String>,
    pub experiments_src: Option<String>,
    pub behaviors: Vec<SharedBehavior>,
    pub datasets: Vec<SharedDataset>,
    pub packages: Vec<SimPackageArgs>,
}

// This default value is only required for integration tests created prior to the
// init.js / init.py feature.
fn default_init_name() -> String {
    "init.json".to_string()
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
        ser.serialize_str(match *self {
            MetricObjective::Max => "max",
            MetricObjective::Min => "min",
            MetricObjective::Other(ref s) => &s,
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

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SimpleExperimentConfig {
    /// The experiment name
    pub experiment_name: String,
    /// The properties changed for each simulation run
    #[serde(rename = "changedProperties")]
    pub changed_properties: Vec<SerdeValue>,
    /// Number of steps each run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
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

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExperimentRunBase {
    pub id: ExperimentRegisteredID,
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

#[async_trait]
pub trait ExperimentRunRepr: Clone + Serialize + for<'a> Deserialize<'a> {
    type PackageConfig;
    fn base(&self) -> &ExperimentRunBase;
    fn base_mut(&mut self) -> &mut ExperimentRunBase;
    fn package_config(&self) -> Option<&Self::PackageConfig>;
}

impl ExperimentRunRepr for ExperimentRunBase {
    type PackageConfig = ();
    fn base(&self) -> &ExperimentRunBase {
        self
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        self
    }

    fn package_config(&self) -> Option<&Self::PackageConfig> {
        None
    }
}

impl ExperimentRunRepr for ExperimentRun {
    type PackageConfig = ExperimentPackageConfig;

    fn base(&self) -> &ExperimentRunBase {
        &self.base
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        &mut self.base
    }

    fn package_config(&self) -> Option<&Self::PackageConfig> {
        Some(&self.package_config)
    }
}

impl ExperimentRunRepr for ExtendedExperimentRun {
    type PackageConfig = ExtendedExperimentPackageConfig;

    fn base(&self) -> &ExperimentRunBase {
        &self.base
    }

    fn base_mut(&mut self) -> &mut ExperimentRunBase {
        &mut self.base
    }

    fn package_config(&self) -> Option<&Self::PackageConfig> {
        Some(&self.package_config)
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProcessedExperimentRun {
    pub experiment: ExperimentRun,
    /// The compute usage when the user initialized the run
    /// This is only valid at the start of the run
    pub compute_usage_remaining: i64,
}

pub type ExperimentID = String;
