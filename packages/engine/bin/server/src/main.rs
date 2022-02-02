use error::{Result, ResultExt};
use hash_engine::{
    experiment::controller::run::run_experiment,
    fetch::FetchDependencies,
    proto::{ExperimentRun, ExperimentRunTrait},
};

#[tokio::main]
async fn main() -> Result<()> {
    let args = hash_engine::args();
    let _guard = hash_engine::init_logger(
        args.log_format,
        &args.output,
        &args.log_folder,
        &format!("experiment-{}", args.experiment_id),
        &format!("experiment-{}-texray", args.experiment_id),
    );

    let mut env = hash_engine::env::<ExperimentRun>(&args)
        .await
        .wrap_err("Could not create environment for experiment")?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment
        .fetch_deps()
        .await
        .wrap_err("Could not fetch dependencies for experiment")?;
    // Generate the configuration for packages from the environment
    let config = hash_engine::experiment_config(&args, &env).await?;

    tracing::info!(
        "HASH Engine process started for experiment {}",
        config.run.base().name
    );

    run_experiment(config, env)
        .await
        .wrap_err("Could not run experiment")
}
