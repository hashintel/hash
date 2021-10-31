use hash_prime::experiment::controller::run::run_experiment;
use hash_prime::fetch::FetchDependencies;
use hash_prime::proto::ExperimentRun;

#[tokio::main]
async fn main() -> hash_prime::Result<()> {
    hash_prime::init_logger();
    let args = hash_prime::args();

    log::info!(
        "HASH Engine process started for experiment {}",
        &args.experiment_id
    );

    let mut env = hash_prime::env::<'_, ExperimentRun>(&args).await?;
    // Fetch all dependencies of the experiment run such as datasets
    env.experiment.fetch_deps().await?;
    // Generate the configuration for packages from the environment
    let config = hash_prime::experiment_config(&args, &env).await?;

    run_experiment(config, env).await?;
    Ok(())
}
