use std::{error::Error, fmt};

use error::{IntoReport, Result, ResultExt};
use hash_engine_lib::{
    config::experiment_config,
    env::env,
    experiment::controller::run::{cleanup_experiment, run_experiment},
    fetch::FetchDependencies,
    proto::{ExperimentRun, ExperimentRunTrait},
    utils::init_logger,
};

#[derive(Debug)]
pub struct EngineError;

impl fmt::Display for EngineError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Engine encountered an error during execution")
    }
}

impl Error for EngineError {}

#[tokio::main]
async fn main() -> Result<(), EngineError> {
    let args = hash_engine_lib::args();
    let _guard = init_logger(
        args.log_format,
        &args.output,
        &args.log_folder,
        args.log_level,
        &format!("experiment-{}", args.experiment_id),
        &format!("experiment-{}-texray", args.experiment_id),
    )
    .report()
    .attach_message("Failed to initialize the logger")
    .change_context(EngineError)?;

    let mut env = env::<ExperimentRun>(&args)
        .await
        .report()
        .attach_message("Could not create environment for experiment")
        .change_context(EngineError)?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment
        .fetch_deps()
        .await
        .report()
        .attach_message("Could not fetch dependencies for experiment")
        .change_context(EngineError)?;
    // Generate the configuration for packages from the environment
    let config = experiment_config(&args, &env)
        .await
        .report()
        .change_context(EngineError)?;

    tracing::info!(
        "HASH Engine process started for experiment {}",
        config.run.base().name
    );

    let experiment_result = run_experiment(config, env)
        .await
        .report()
        .attach_message("Could not run experiment")
        .change_context(EngineError);

    cleanup_experiment(args.experiment_id);

    experiment_result
}
