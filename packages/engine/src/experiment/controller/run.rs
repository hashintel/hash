use crate::experiment::package::ExperimentPackage;
use crate::output::local::LocalOutputPersistence;
use crate::proto::{EngineStatus, ExperimentRun, ExtendedExperimentRun};
use std::sync::Arc;

use super::controller::ExperimentController;
use super::id_store::SimIdStore;
use super::{config, Error, Result};
use crate::datastore::prelude::SharedStore;
use crate::experiment::controller::config::OutputPersistenceConfig;
use crate::experiment::controller::sim_configurer::SimConfigurer;
use crate::output::buffer::cleanup_experiment;
use crate::output::none::NoOutputPersistence;
use crate::output::OutputPersistenceCreatorRepr;
use crate::simulation::packages::creator::PackageCreators;
use crate::workerpool::WorkerPoolController;
use crate::{workerpool, Environment, ExperimentConfig};

pub async fn run_experiment(
    exp_config: ExperimentConfig<ExperimentRun>,
    env: Environment<ExperimentRun>,
) -> Result<()> {
    let experiment_id = exp_config.run.base.id.clone();
    // Get cloud-specific configuration from `env`
    let output_persistence_config = config::output_persistence(&env)?;

    // Keep another orchestrator client at the top level to send the final result
    let mut orch_client = env.orch_client.try_clone()?;
    match tokio::spawn(run_local_experiment(exp_config, env)).await {
        Ok(result) => {
            let final_result = match result {
                Ok(()) => {
                    log::debug!("Successful termination ({})", experiment_id);
                    EngineStatus::Exit
                }
                Err(err) => {
                    let err = err.user_facing_string();
                    log::debug!("Terminating ({}) with error: {}", experiment_id, err);
                    EngineStatus::ProcessError(err)
                }
            };
            orch_client.send(final_result).await?;
        }
        Err(join_err) => {
            log::error!(
                "Experiment run ({}) task join error: {:?}",
                experiment_id,
                join_err
            );
            if join_err.is_panic() {
                Err(Error::from(
                    "Error in the experiment runner, please contact support",
                ))
            } else {
                Err(Error::from(join_err.to_string()))
            }
        }
    }

    cleanup_experiment(&experiment_id).map_err(|e| Error::from(e.to_string()))?;

    // Allow messages to be picked up.
    std::thread::sleep(std::time::Duration::from_millis(100));
    log::info!("Exiting: {}", experiment_id);
    Ok(())
}

pub async fn run_local_experiment(
    exp_config: ExperimentConfig<ExperimentRun>,
    env: Environment<ExperimentRun>,
) -> Result<()> {
    match &env.output_persistence {
        OutputPersistenceConfig::Local(local) => {
            let persistence = LocalOutputPersistence::new(exp_config.run_id.clone(), local.clone());
            run_experiment_with_persistence(exp_config, env, persistence).await?;
        }
        OutputPersistenceConfig::None => {
            let persistence = NoOutputPersistence::new();
            run_experiment_with_persistence(exp_config, env, persistence).await?;
        }
    }
    Ok(())
}

async fn run_experiment_with_persistence<P: OutputPersistenceCreatorRepr>(
    exp_config: ExperimentConfig<ExperimentRun>,
    mut env: Environment<ExperimentRun>,
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
    let (experiment_control_send, experiment_control_recv) =
        workerpool::comms::experiment::new_pair();
    let (worker_pool_controller_send, worker_pool_controller_recv) =
        workerpool::comms::top::new_pair();
    let (worker_pool_kill_send, kill_recv) = workerpool::comms::kill::new_pair();
    let (mut worker_pool_controller, worker_pool_send_base) =
        WorkerPoolController::new_with_sender(
            exp_config.clone(),
            experiment_control_recv,
            kill_recv,
            worker_pool_controller_send,
        )?;

    // Start up the experiment package (simple/single)
    let experiment_package = ExperimentPackage::new(exp_config.clone()).await?;
    let experiment_package_handle = experiment_package.join_handle;

    let sim_id_store = SimIdStore::default();
    let worker_allocator = SimConfigurer::new_extended(
        &exp_config.run.package_config,
        exp_config.worker_pool.num_workers,
    );
    let package_creators = PackageCreators::from_config(&exp_config.packages)?;
    let (sim_status_send, sim_status_recv) = super::comms::sim_status::new_pair();
    let experiment_controller = ExperimentController::new(
        exp_config,
        exp_base_config,
        env,
        shared_store,
        experiment_control_send,
        worker_pool_controller_recv,
        experiment_package.comms,
        output_persistence_service_creator,
        worker_pool_send_base,
        package_creators,
        sim_id_store,
        worker_allocator,
        sim_status_send,
        sim_status_recv,
    );

    // Get the experiment-level initialization payload for workers
    let runner_init_message = experiment_controller.runner_init_message().await?;
    worker_pool_controller
        .spawn_workers(runner_init_message)
        .await?;

    let worker_pool_controller_handle =
        tokio::spawn(async move { worker_pool_controller.run().await });
    let experiment_controller_handle =
        tokio::spawn(async move { experiment_controller.run().await });

    let mut worker_pool_result: Option<crate::Result<()>> = None;
    let mut experiment_package_result: Option<Result<()>> = None;
    let mut experiment_controller_result: Option<super::super::Result<()>> = None;

    loop {
        tokio::select! {
            Ok(res) = &mut worker_pool_controller_handle => {
                // The worker pool should not finish before the experiment controller or experiment package
                log::warn!("Worker pool finished before experiment package and experiment controller");
                worker_pool_result = Some(res);
                break;
            }
            Ok(res) = &mut experiment_package_handle => {
                // The experiment package should finish first
                experiment_package_result = Some(res);
                break;
            }
            Ok(res) = &mut experiment_controller_handle => {
                // The experiment controller should ideally finish after the experiment package has finished
                experiment_controller_result = Some(res);
                break;
            }
            else => {
                log::error!("Unexpected tokio select exit");
                break;
            }
        }
    }

    let mut successful_exit = false;
    let mut err = String::new();
    todo!();
    // if let Some(res) = worker_pool_result {
    //     // TODO[1] set `successful_exit` and `err` depending on `res` and how exiting for other handles works
    //     let kill_send_res_experiment_controller = experiment_controller_kill_send.send().await;
    //     let kill_send_res_experiment_package = experiment_package_kill_send.send().await;

    //     if let Ok(()) = kill_send_res_experiment_controller {
    //         // TODO[1] await on experiment_controller_handle with timeout of 10s
    //     }

    //     if let Ok(()) = kill_send_res_experiment_package {
    //         // TODO[1] await on experiment_package_handle with timeout of 10s
    //     }
    // } else if let Some(res) = experiment_package_result {
    //     // TODO[1] set `successful_exit` and `err` depending on `res` and how exiting for other handles works
    //     let kill_send_res_worker_pool = worker_pool_kill_send.send().await;
    //     let kill_send_res_experiment_controller = experiment_controller_kill_send.send().await;

    //     if let Ok(()) = kill_send_res_worker_pool {
    //         // TODO[1] await on worker_pool_controller_handle with timeout of 10s
    //     }

    //     if let Ok(()) = kill_send_res_experiment_controller {
    //         // TODO[1] await on experiment_controller_handle with timeout of 10s
    //     }
    // } else if experiment_controller_result.is_some() {
    //     // TODO[1] set `successful_exit` and `err` depending on `res` and how exiting for other handles works
    //     let kill_send_res_worker_pool = worker_pool_kill_send.send().await;
    //     let kill_send_res_experiment_package = experiment_package_kill_send.send().await;
    //     if let Ok(()) = kill_send_res_worker_pool {
    //         // TODO[1] await on worker_pool_controller_handle with timeout of 10s
    //     }

    //     if let Ok(()) = kill_send_res_experiment_package {
    //         // TODO[1] await on experiment_package_handle with timeout of 10s
    //     }
    // } else {
    //     successful_exit = false;
    //     err = "Unexpected exit".into();
    // }

    // // Successful exit

    // let status = if successful_exit {
    //     EngineStatus::Exit
    // } else {
    //     EngineStatus::ProcessError(err)
    // };
    // env.orch_client.send(status).await?;

    // return Ok(());
}
