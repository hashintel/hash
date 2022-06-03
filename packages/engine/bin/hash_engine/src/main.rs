use error::{IntoReport, Result, ResultExt};
use hash_engine_lib::{
    config::experiment_config,
    env::env,
    experiment::controller::run::{cleanup_experiment, run_experiment},
    fetch::FetchDependencies,
    proto::{ExperimentRun, ExperimentRunTrait},
    utils::init_logger,
};

#[tokio::main]
async fn main() -> Result<(), ()> {
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
    .attach("Failed to initialize the logger")
    .generalize()?;

    let mut env = env::<ExperimentRun>(&args)
        .await
        .report()
        .attach("Could not create environment for experiment")
        .generalize()?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment
        .fetch_deps()
        .await
        .report()
        .attach("Could not fetch dependencies for experiment")
        .generalize()?;
    // Generate the configuration for packages from the environment
    let config = experiment_config(&args, &env).await.report().generalize()?;

    tracing::info!(
        "HASH Engine process started for experiment {}",
        config.run.base().name
    );

    let experiment_result = run_experiment(config, env)
        .await
        .report()
        .attach("Could not run experiment")
        .generalize();

    cleanup_experiment(args.experiment_id);

    experiment_result
}
