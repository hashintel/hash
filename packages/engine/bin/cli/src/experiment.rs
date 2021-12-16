use std::{iter::FromIterator, path::PathBuf, time::Duration};

use anyhow::{bail, format_err, Context, Result};
use hash_engine::{
    experiment::controller::config::{OutputPersistenceConfig, OUTPUT_PERSISTENCE_KEY},
    output::local::config::LocalPersistenceConfig,
    proto::{self, ExecutionEnvironment},
    utils::parse_env_duration,
};
use serde_json::json;
use tokio::time::{self, timeout};

use super::process;
use crate::{exsrv::Handler, manifest::read_manifest, Args};

lazy_static::lazy_static! {
    static ref ENGINE_START_TIMEOUT: Duration = parse_env_duration("ENGINE_START_TIMEOUT", 2);
    static ref ENGINE_WAIT_TIMEOUT: Duration = parse_env_duration("ENGINE_WAIT_TIMEOUT", 60);
}

/// `run_experiment` will build a queue of tokio tasks attached to the simulation workers. Any
/// requests over the websocket will be handled and sent to the appropriate worker (if available).
/// The simulations will run to completion and the connection will finish once the last run is done,
/// or if there is an error.
pub async fn run_experiment(args: Args, handler: Handler) -> Result<()> {
    let project = &args.project;
    let absolute_project_path = PathBuf::from(project)
        .canonicalize()
        .with_context(|| format!("Could not canonicalize project path: {project:?}"))?;
    let project_name = args.project_name.clone().unwrap_or(
        absolute_project_path
            .file_name()
            .with_context(|| format!("Project path didn't point to a directory: {absolute_project_path:?}"))? // Shouldn't be able to fail as we canonicalize above
            .to_string_lossy()
            .to_string(),
    );

    let experiment_run = read_manifest(&absolute_project_path, &args.r#type)?;
    run_experiment_with_manifest(args, experiment_run, project_name, handler).await?;
    Ok(())
}

fn create_engine_command(
    args: &Args,
    experiment_id: &str,
    controller_url: &str,
) -> Result<Box<dyn process::Command + Send>> {
    Ok(Box::new(process::LocalCommand::new(
        experiment_id,
        args.num_workers as usize,
        true,
        controller_url,
    )?))
}

async fn run_experiment_with_manifest(
    args: Args,
    experiment_run: proto::ExperimentRun,
    project_name: String,
    mut handler: Handler,
) -> Result<()> {
    let experiment_id = experiment_run.base.id.clone();
    let mut engine_handle = handler
        .register_experiment(&experiment_id)
        .await
        .with_context(|| format!("Could not register experiment: {experiment_id}"))?;

    // Create and start the experiment run
    let cmd = create_engine_command(&args, &experiment_id, handler.url())
        .context("Could not build engine command")?;
    let mut engine_process = cmd.run().await.context("Could not run experiment")?;

    // Wait to receive a message that the experiment has started before sending the init message.
    let msg = timeout(*ENGINE_START_TIMEOUT, engine_handle.recv())
        .await
        .map_err(|_| format_err!("engine start timeout"));
    match msg {
        Ok(proto::EngineStatus::Started) => {}
        Ok(m) => {
            bail!(
                "expected to receive `Started` message but received: `{}`",
                m.kind()
            );
        }
        Err(e) => {
            error!("Engine start timeout for experiment {experiment_id}");
            engine_process
                .exit_and_cleanup()
                .await
                .context("Failed to cleanup after failed start")?;
            bail!(e);
        }
    };
    debug!("Received start message from {experiment_id}");

    let mut output_folder = PathBuf::from(args.output);
    output_folder.push(project_name);

    let map_iter = [(
        OUTPUT_PERSISTENCE_KEY.to_string(),
        json!(OutputPersistenceConfig::Local(LocalPersistenceConfig {
            output_folder
        })),
    )];
    // Now we can send the init message
    let init_message = proto::InitMessage {
        experiment: experiment_run.clone().into(),
        env: ExecutionEnvironment::None, // We don't connect to the API
        dyn_payloads: serde_json::Map::from_iter(map_iter), // TODO
    };
    engine_process
        .send(&proto::EngineMsg::Init(init_message))
        .await
        .context("Could not send `Init` message")?;
    debug!("Sent init message to {experiment_id}");

    loop {
        let msg: Option<proto::EngineStatus>;
        tokio::select! {
            _ = time::sleep(*ENGINE_WAIT_TIMEOUT) => {
                error!("Did not receive status from experiment {experiment_id} for over {:?}. Exiting now.", *ENGINE_WAIT_TIMEOUT);
                break;
            }
            m = engine_handle.recv() => { msg = Some(m) },
        }
        let msg = msg.unwrap();
        debug!("Got message from experiment run with type: {}", msg.kind());

        match msg {
            proto::EngineStatus::Stopping => {
                debug!("Stopping experiment");
            }
            proto::EngineStatus::SimStart { sim_id, globals: _ } => {
                debug!("Started simulation: {sim_id}");
            }
            proto::EngineStatus::SimStatus(status) => {
                debug!("Got simulation run status: {status:?}");
                // TODO: OS - handle status fields
            }
            proto::EngineStatus::SimStop(sim_id) => {
                debug!("Simulation stopped: {sim_id}");
            }
            proto::EngineStatus::Errors(sim_id, errs) => {
                if let Some(sim_id) = sim_id {
                    error!("There were errors when running simulation [{sim_id}]: {errs:?}");
                } else {
                    error!("Errors occurred within the engine: {errs:?}");
                }
            }
            proto::EngineStatus::Warnings(sim_id, warnings) => {
                if let Some(sim_id) = sim_id {
                    warn!("There were warnings when running simulation [{sim_id}]: {warnings:?}");
                } else {
                    warn!("Warnings occurred within the engine: {warnings:?}");
                }
            }
            proto::EngineStatus::Logs(sim_id, logs) => {
                if let Some(sim_id) = sim_id {
                    for log in logs {
                        if !log.is_empty() {
                            info!("[{sim_id}]: {log}");
                        }
                    }
                } else {
                    for log in logs {
                        if !log.is_empty() {
                            info!("{log}");
                        }
                    }
                }
            }
            proto::EngineStatus::Exit => {
                debug!("Process exited successfully for experiment run with id {experiment_id}",);
                break;
            }
            proto::EngineStatus::ProcessError(error) => {
                error!("Got error: {error:?}");
                break;
            }
            proto::EngineStatus::Started => {
                error!(
                    "Received unexpected engine `Started` message after engine had already \
                     started: {}",
                    msg.kind()
                );
                break;
            }
        }
    }
    debug!("Performing cleanup");
    engine_process
        .exit_and_cleanup()
        .await
        .context("Could not cleanup after finish")?;
    Ok(())
}
