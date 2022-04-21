use std::{pin::Pin, sync::Arc, time::Duration};

use memory::shared_memory;
use tracing::Instrument;

use crate::{
    config::ExperimentConfig,
    datastore::shared_store::SharedStore,
    env::Environment,
    experiment::{
        controller::{
            config::{self, OutputPersistenceConfig},
            controller::ExperimentController,
            error::{Error, Result},
            sim_configurer::SimConfigurer,
        },
        error::{Error as ExperimentError, Result as ExperimentResult},
        package::ExperimentPackage,
    },
    output::{
        buffer::remove_experiment_parts, local::LocalOutputPersistence, none::NoOutputPersistence,
        OutputPersistenceCreatorRepr,
    },
    proto::{EngineStatus, ExperimentId, ExperimentRunTrait, PackageConfig},
    simulation::package::creator::PackageCreators,
    worker::runner::python,
    workerpool,
    workerpool::{comms::terminate::TerminateSend, WorkerPoolController},
    Error as CrateError,
};

#[tracing::instrument(skip_all, fields(experiment_id = % exp_config.run.base().id))]
pub async fn run_experiment(exp_config: ExperimentConfig, env: Environment) -> Result<()> {
    let experiment_name = exp_config.name().to_string();
    tracing::info!("Running experiment \"{experiment_name}\"");
    // TODO: Get cloud-specific configuration from `env`
    let _output_persistence_config = config::output_persistence(&env)?;

    // Keep another orchestrator client at the top level to send the final result
    let mut orch_client = env.orch_client.try_clone()?;
    match tokio::spawn(run_local_experiment(exp_config, env).in_current_span()).await {
        Ok(result) => {
            let final_result = match result {
                Ok(()) => {
                    tracing::debug!("Successful termination of experiment \"{experiment_name}\"");
                    EngineStatus::Exit
                }
                Err(err) => {
                    let err = CrateError::from(ExperimentError::from(err)).user_facing_string();
                    tracing::debug!(
                        "Terminating experiment \"{experiment_name}\" with error: {err}"
                    );
                    EngineStatus::ProcessError(err)
                }
            };
            orch_client.send(final_result).await?;
        }
        Err(join_err) => {
            tracing::error!("Experiment run \"{experiment_name}\" task join error: {join_err:?}");
            return if join_err.is_panic() {
                Err(Error::from(
                    "Error in the experiment runner, please contact support",
                ))
            } else {
                Err(Error::from(join_err.to_string()))
            };
        }
    }

    // Allow messages to be picked up.
    std::thread::sleep(std::time::Duration::from_millis(100));
    tracing::info!("Exiting \"{experiment_name}\"");
    Ok(())
}

pub async fn run_local_experiment(exp_config: ExperimentConfig, env: Environment) -> Result<()> {
    match config::output_persistence(&env)? {
        OutputPersistenceConfig::Local(local) => {
            tracing::debug!("Running experiment with local persistence");
            let persistence = LocalOutputPersistence::new(
                exp_config.run.base().project_base.name.clone(),
                exp_config.name().clone(),
                exp_config.run.base().id,
                local.clone(),
            );
            run_experiment_with_persistence(exp_config, env, persistence).await?;
        }
        OutputPersistenceConfig::None => {
            tracing::debug!("Running experiment without output persistence");
            let persistence = NoOutputPersistence::new();
            run_experiment_with_persistence(exp_config, env, persistence).await?;
        }
    };
    Ok(())
}

type ExperimentPackageResult = Option<ExperimentResult<()>>;
type ExperimentControllerResult = Option<Result<()>>;
type WorkerPoolResult = Option<crate::workerpool::Result<()>>;

async fn run_experiment_with_persistence<P: OutputPersistenceCreatorRepr>(
    exp_config: ExperimentConfig,
    env: Environment,
    output_persistence_service_creator: P,
) -> Result<()> {
    let exp_config = Arc::new(exp_config);
    // Create the base config which can be used by the simulation engine
    // regardless of experiment controller
    let exp_base_config = Arc::new(exp_config.to_base()?);
    // Spin up the shared store (includes the entities which are
    // shared across the whole experiment run)
    let shared_store = Arc::new(SharedStore::new(&exp_base_config)?);

    // Set up the worker pool controller and all communications with it
    let (experiment_to_worker_pool_send, experiment_to_worker_pool_recv) =
        workerpool::comms::experiment::new_pair();
    let (worker_pool_controller_send, worker_pool_controller_recv) =
        workerpool::comms::top::new_pair();
    let (mut worker_pool_terminate_send, worker_pool_terminate_recv) =
        workerpool::comms::terminate::new_pair();
    let (mut worker_pool_controller, worker_pool_send_base) =
        WorkerPoolController::new_with_sender(
            exp_config.clone(),
            experiment_to_worker_pool_recv,
            worker_pool_terminate_recv,
            worker_pool_controller_send,
        )?;

    // Start up the experiment package (simple/single)
    let experiment_package = ExperimentPackage::new(exp_config.clone())
        .await
        .map_err(|experiment_err| Error::from(experiment_err.to_string()))?;
    let mut experiment_package_handle = experiment_package.join_handle;

    let package_config = match exp_config.run.package_config() {
        PackageConfig::ExperimentPackageConfig(package_config) => package_config,
        _ => unreachable!(),
    };

    let worker_allocator = SimConfigurer::new(package_config, exp_config.worker_pool.num_workers);
    let package_creators = PackageCreators::from_config(&exp_config.packages, &exp_config)?;
    let (sim_status_send, sim_status_recv) = super::comms::sim_status::new_pair();
    let mut orch_client = env.orch_client.try_clone()?;
    let (mut experiment_controller_terminate_send, experiment_controller_terminate_recv) =
        workerpool::comms::terminate::new_pair();
    let experiment_controller = ExperimentController::new(
        exp_config,
        exp_base_config,
        env,
        shared_store,
        experiment_to_worker_pool_send,
        worker_pool_controller_recv,
        experiment_package.comms,
        output_persistence_service_creator,
        worker_pool_send_base,
        package_creators,
        worker_allocator,
        sim_status_send,
        sim_status_recv,
        experiment_controller_terminate_recv,
    );

    // Get the experiment-level initialization payload for workers
    let exp_init_msg_base = experiment_controller.exp_init_msg_base().await?;
    // TODO: does this need to even be async
    worker_pool_controller
        .spawn_workers(exp_init_msg_base)
        .await?;

    let mut worker_pool_controller_handle =
        tokio::spawn(async move { worker_pool_controller.run().await }.in_current_span());
    let mut experiment_controller_handle =
        tokio::spawn(async move { experiment_controller.run().await }.in_current_span());

    let mut worker_pool_result: WorkerPoolResult = None;
    let mut experiment_package_result: ExperimentPackageResult = None;
    let mut experiment_controller_result: ExperimentControllerResult = None;
    let mut exit_timeout = None;

    let mut successful_exit = true;
    let mut err = String::new();
    loop {
        tokio::select! {
            _ = async { exit_timeout.take().expect("must be some").await }, if exit_timeout.is_some() => {
                tracing::warn!("Exit timed out");
                successful_exit = false;
                // TODO: should we have an additional timeout and send terminate signals to all 3

                err = format!(
                    "Timed out with experiment package {}, controller {}, worker pool {}",
                    experiment_package_result.is_some(),
                    experiment_controller_result.is_some(),
                    worker_pool_result.is_some(),
                );
                break;
            }
            Ok(res) = &mut experiment_package_handle, if experiment_package_result.is_none() => {
                if let Err(ref inner_err) = res {
                    tracing::error!("Error from experiment package: {}", inner_err);
                    successful_exit = false;
                    if err.is_empty() {
                        err = inner_err.to_string();
                    };
                };

                // The experiment package should finish first
                experiment_package_result = Some(res);
                if experiment_package_exit_logic(
                    &experiment_controller_result,
                    &worker_pool_result,
                    &mut experiment_controller_terminate_send,
                    &mut exit_timeout
                )? {
                    break;
                }
            }
            Ok(res) = &mut experiment_controller_handle, if experiment_controller_result.is_none() => {
                if let Err(ref inner_err) = res {
                    tracing::error!("Error from experiment controller: {}", inner_err);
                    successful_exit = false;
                    if err.is_empty() {
                        err = inner_err.to_string();
                    };
                };

                // The experiment controller should ideally finish after the experiment package has finished
                experiment_controller_result = Some(res);

                if experiment_controller_exit_logic(
                    &experiment_package_result,
                    &worker_pool_result,
                    &mut worker_pool_terminate_send,
                    &mut exit_timeout
                )? {
                    break;
                }
            }
            Ok(res) = &mut worker_pool_controller_handle, if worker_pool_result.is_none() => {
                if let Err(ref inner_err) = res {
                    tracing::error!("Error from worker pool: {}", inner_err);
                    successful_exit = false;
                    if err.is_empty() {
                        err = inner_err.to_string();
                    };
                };

                worker_pool_result = Some(res);

                if worker_pool_exit_logic(&experiment_package_result, &experiment_controller_result, &mut exit_timeout) {
                    break;
                }
            }
            else => {
                successful_exit = false;
                err = "Unexpected tokio select exit".into();
                tracing::error!("Unexpected tokio select exit");
                break;
            }
        }
    }

    let status = if successful_exit {
        EngineStatus::Exit
    } else {
        EngineStatus::ProcessError(err)
    };
    orch_client.send(status).await?;

    Ok(())
}

#[inline]
fn experiment_package_exit_logic(
    experiment_controller_result: &ExperimentControllerResult,
    worker_pool_result: &WorkerPoolResult,
    experiment_controller_terminate_send: &mut TerminateSend,
    exit_timeout: &mut Option<Pin<Box<tokio::time::Sleep>>>,
) -> Result<bool> {
    tracing::debug!("Result from experiment package");

    // The experiment package should finish before the controller and worker pool
    if experiment_controller_result.is_some() {
        tracing::warn!("Experiment controller finished before experiment package");
    } else {
        experiment_controller_terminate_send.send()?;
    }
    if worker_pool_result.is_some() {
        tracing::warn!("Worker pool finished before experiment package");
    }

    // If both have finished something has gone wrong but loop should break
    if worker_pool_result.is_some() && experiment_controller_result.is_some() {
        return Ok(true);
    }

    if exit_timeout.is_none() {
        tracing::debug!("Starting timeout");
        *exit_timeout = Some(Box::pin(tokio::time::sleep(Duration::from_secs(20))));
    };

    Ok(false)
}

#[inline]
fn experiment_controller_exit_logic(
    experiment_package_result: &ExperimentPackageResult,
    worker_pool_result: &WorkerPoolResult,
    worker_pool_terminate_send: &mut TerminateSend,
    exit_timeout: &mut Option<Pin<Box<tokio::time::Sleep>>>,
) -> Result<bool> {
    tracing::debug!("Result from experiment controller");

    // Controller should finish before the Worker Pool
    if worker_pool_result.is_some() {
        tracing::warn!("Worker pool finished before experiment controller");
    }

    // If both have finished something has gone wrong but loop should break
    if worker_pool_result.is_some() && experiment_package_result.is_some() {
        return Ok(true);
    } else {
        worker_pool_terminate_send.send()?;
    }

    if exit_timeout.is_none() {
        tracing::debug!("Starting timeout");
        *exit_timeout = Some(Box::pin(tokio::time::sleep(Duration::from_secs(20))));
    };

    Ok(false)
}

#[inline]
fn worker_pool_exit_logic(
    experiment_package_result: &ExperimentPackageResult,
    experiment_controller_result: &ExperimentControllerResult,
    exit_timeout: &mut Option<Pin<Box<tokio::time::Sleep>>>,
) -> bool {
    tracing::debug!("Result from worker pool");

    if experiment_package_result.is_some() && experiment_controller_result.is_some() {
        return true;
    }

    if exit_timeout.is_none() {
        tracing::debug!("Starting timeout");
        *exit_timeout = Some(Box::pin(tokio::time::sleep(Duration::from_secs(3600))));
    };

    false
}

/// Forcefully clean-up resources created by the experiment
pub fn cleanup_experiment(experiment_id: ExperimentId) {
    if let Err(err) = shared_memory::cleanup_by_base_id(experiment_id) {
        tracing::warn!("{}", err);
    }

    if let Err(err) = python::cleanup_runner(experiment_id) {
        tracing::warn!("{}", err);
    }

    remove_experiment_parts(experiment_id);
}
