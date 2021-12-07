use hash_engine::experiment::controller::run::run_experiment;
use hash_engine::experiment::Error as ExperimentError;
use hash_engine::fetch::FetchDependencies;
use hash_engine::proto::ExperimentRun;

#[tokio::main]
async fn main() -> hash_engine::Result<()> {
    hash_engine::init_logger();
    let args = hash_engine::args();

    log::info!(
        "HASH Engine process started for experiment {}",
        &args.experiment_id
    );

    let mut env = hash_engine::env::<ExperimentRun>(&args).await?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment.fetch_deps().await?;
    // Generate the configuration for packages from the environment
    let config = hash_engine::experiment_config(&args, &env).await?;

    run_experiment(config, env)
        .await
        .map_err(|exp_controller_err| ExperimentError::from(exp_controller_err))?;
    Ok(())
}
