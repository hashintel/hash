use serde::{Deserialize, Serialize};

#[allow(clippy::module_name_repetitions)]
#[async_trait::async_trait]
/// An instance of a simulation worker
/// Similar to the frontend, a simulation worker exposes the Runner Request and gets back a Runner
/// Status
pub trait SimulationWorker {
    type Err;
    async fn handle_request(&mut self, request: RunnerRequest) -> Result<RunnerStatus, Self::Err>;
}

#[derive(Serialize, Debug, Clone, Deserialize)]
pub struct FetchedDataset {
    pub filename: String,
    pub extension: String,
    pub data: Option<String>,
    pub url: String,
    pub shortname: String,
    pub id: String,
    pub name: String,
}

#[derive(Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PyodideStatus {
    Unused,
    Loading,
    Loaded,
}

impl Default for PyodideStatus {
    fn default() -> Self {
        PyodideStatus::Unused
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RunnerRequest {
    Status,
    GetReadySteps,
    UpdateComponents {
        #[serde(rename = "propertiesSrc")]
        properties_source: Option<String>,

        #[serde(rename = "initialStateSrc")]
        initial_state_source: Option<String>,
    },
    Initialize {
        #[serde(rename = "manifestSrc")]
        manifest_source: String,

        #[serde(rename = "includeSteps")]
        include_steps: bool,

        #[serde(rename = "numSteps")]
        num_steps: usize,

        #[serde(rename = "presetRunId")]
        preset_run_id: String,

        #[serde(rename = "s3Key")]
        s3_key: String,
    },
    HoldStep {
        step: usize,
    },
    Play {
        #[serde(rename = "propertiesSrc")]
        properties_source: Option<String>,
    },
    Step {
        #[serde(rename = "numSteps")]
        num_steps: usize,

        #[serde(rename = "includeSteps")]
        include_steps: Option<bool>,

        #[serde(rename = "asTransferable")]
        as_transferable: Option<bool>,

        wait: bool,
    },
    Pause,
    Reset,
    SetId {
        id: String,
        #[serde(rename = "devMode")]
        dev_mode: bool,
    },
    Stop,
}

#[derive(Deserialize, Serialize, Debug, Default, PartialEq)]
pub struct StepLinks {
    /// Link to bucket which contains all of the states
    #[serde(rename = "agentSteps")]
    pub agent_steps: Option<String>,
    #[serde(rename = "analysisOutputs")]
    pub analysis_outputs: Option<String>,
}

type MetricOutcome = Option<f64>; // For clippy

#[derive(Deserialize, Serialize, Debug, Default, PartialEq)]
pub struct RunnerStatus {
    /// These are s3 Keys
    #[serde(rename = "stepsLink")]
    pub step_links: StepLinks,
    /// UNUSED. kept for compatability sake
    // TODO: Remove if unused
    #[serde(rename = "accumulatedSteps")]
    pub accumulated_steps: serde_json::Value,

    #[serde(rename = "simulationRunId")]
    pub simulation_id: Option<String>,

    pub running: bool,

    #[serde(rename = "resetting")]
    pub is_resetting: bool,

    #[serde(rename = "pyodideStatus")]
    pub pyodide_status: PyodideStatus,

    #[serde(rename = "runnerError")]
    pub runner_error: Option<RunnerError>,

    #[serde(rename = "stepsTaken")]
    pub steps_taken: isize,

    #[serde(rename = "earlyStop")]
    pub early_stop: bool,

    #[serde(rename = "stopMessage")]
    pub stop_message: Option<serde_json::Value>,

    pub warnings: Vec<RunnerError>,

    #[serde(rename = "metricName")]
    pub metric_name: Option<String>,

    #[serde(rename = "metricObjective")]
    pub metric_objective: Option<String>, // "max" or "min"

    #[serde(rename = "metricOutcome")]
    pub metric_outcome: Option<MetricOutcome>,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
pub struct RunnerError {
    // TODO: Rename, because "runner errors" should always be internal,
    //       but this might not be.
    pub message: Option<String>,
    pub code: Option<i32>,
    pub line_number: Option<i32>,
    pub file_name: Option<String>,
    pub details: Option<String>,
    pub is_warning: bool,
    pub is_internal: bool,
}
