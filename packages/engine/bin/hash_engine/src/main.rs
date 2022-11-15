//! HASH Engine
//!
//! This crate defines the executable Engine binary itself. The crate is very lightweight as the
//! engine implementation is separated across a set of libraries. The entry point libraries are:
//! - [`execution`]
//! - [`experiment_control`]
//! - [`experiment_structure`]
use std::{error::Error, fmt, sync::Arc};

use error_stack::{IntoReport, Result, ResultExt};
use execution::runner::RunnerConfig;
use experiment_control::{
    controller::run::{cleanup_experiment, run_experiment},
    environment::{init_logger, Args, Environment},
};
use experiment_structure::{ExperimentConfig, FetchDependencies};

#[derive(Debug)]
pub struct EngineError;

impl fmt::Display for EngineError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Engine encountered an error during execution")
    }
}

impl Error for EngineError {}

pub fn experiment_config(args: &Args, env: &Environment) -> Result<ExperimentConfig, EngineError> {
    ExperimentConfig::new(
        Arc::new(env.experiment.clone()),
        args.num_workers,
        args.target_max_group_size,
        RunnerConfig {
            js_runner_initial_heap_constraint: args.js_runner_initial_heap_constraint,
            js_runner_max_heap_size: args.js_runner_max_heap_size,
        },
    )
    .attach_printable("Could not create experiment config")
    .change_context(EngineError)
}

#[tokio::main]
async fn main() -> Result<(), EngineError> {
    let args = Args::parse();
    let _guard = init_logger(
        args.log_format,
        &args.output,
        &args.log_folder,
        args.log_level,
        &format!("experiment-{}", args.experiment_id),
        &format!("experiment-{}-texray", args.experiment_id),
    )
    .into_report()
    .attach_printable("Failed to initialize the logger")
    .change_context(EngineError)?;

    let mut env = Environment::new(&args)
        .await
        .into_report()
        .attach_printable("Could not create environment for experiment")
        .change_context(EngineError)?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment
        .fetch_deps()
        .await
        .attach_printable("Could not fetch dependencies for experiment")
        .change_context(EngineError)?;

    // Generate the configuration for packages from the environment
    let config = experiment_config(&args, &env)?;

    tracing::info!(
        "HASH Engine process started for experiment {}",
        config.experiment_run.name()
    );

    let experiment_result = run_experiment(config, env)
        .await
        .into_report()
        .attach_printable("Could not run experiment")
        .change_context(EngineError);

    cleanup_experiment(args.experiment_id);

    experiment_result
}
