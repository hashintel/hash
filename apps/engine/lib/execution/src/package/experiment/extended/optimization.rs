use serde::{Deserialize, Serialize};

use crate::package::experiment::extended::{MetricObjective, PackageDataField};

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
    pub initial_points: Option<Vec<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct OptimizationExperimentConfig {
    /// The experiment name
    pub experiment_name: String,
    pub payload: OptimizationExperimentConfigPayload,
    /// Number of simulation runs that are to be run in parallel
    pub num_parallel_runs: usize,
}
