use std::{iter::FromIterator, time::Duration};

use error::{bail, ensure, report, Result, ResultExt};
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
    let absolute_project_path = args
        .project
        .canonicalize()
        .wrap_err_lazy(|| format!("Could not canonicalize project path: {:?}", args.project))?;
    let project_name = args.project_name.clone().unwrap_or(
        absolute_project_path
            .file_name()
            .ok_or_else(|| report!("Project path didn't point to a directory: {absolute_project_path:?}"))? // Shouldn't be able to fail as we canonicalize above
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
        controller_url,
        args.emit,
    )?))
}

#[instrument(skip_all, fields(project_name = project_name.as_str(), experiment_id = experiment_run.base.id.as_str()))]
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
        .wrap_err_lazy(|| format!("Could not register experiment: {experiment_id}"))?;

    // Create and start the experiment run
    let cmd = create_engine_command(&args, &experiment_id, handler.url())
        .wrap_err("Could not build engine command")?;
    let mut engine_process = cmd.run().await.wrap_err("Could not run experiment")?;

    // Wait to receive a message that the experiment has started before sending the init message.
    let msg = timeout(*ENGINE_START_TIMEOUT, engine_handle.recv())
        .await
        .wrap_err("engine start timeout");
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
                .wrap_err("Failed to cleanup after failed start")?;
            bail!(e);
        }
    };
    debug!("Received start message from {experiment_id}");

    let output_folder = args.output.join(project_name);

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
        dyn_payloads: serde_json::Map::from_iter(map_iter),
    };
    engine_process
        .send(&proto::EngineMsg::Init(init_message))
        .await
        .wrap_err("Could not send `Init` message")?;
    debug!("Sent init message to {experiment_id}");

    let mut errored = false;
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
                debug!("Stopping experiment {experiment_id}");
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
                error!("There were errors when running simulation [{sim_id}]: {errs:?}");
                errored = true;
            }
            proto::EngineStatus::Warnings(sim_id, warnings) => {
                warn!("There were warnings when running simulation [{sim_id}]: {warnings:?}");
            }
            proto::EngineStatus::Logs(sim_id, logs) => {
                for log in logs {
                    if !log.is_empty() {
                        info!(target: "behaviors", "[{experiment_id}][{sim_id}]: {log}");
                    }
                }
            }
            proto::EngineStatus::Exit => {
                debug!("Process exited successfully for experiment run with id {experiment_id}",);
                break;
            }
            proto::EngineStatus::ProcessError(error) => {
                error!("Got error: {error:?}");
                errored = true;
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

    // Allow Engine to exit gracefully.
    std::thread::sleep(std::time::Duration::from_millis(200));

    debug!("Performing cleanup");
    engine_process
        .exit_and_cleanup()
        .await
        .wrap_err("Could not cleanup after finish")?;

    ensure!(!errored, "experiment had errors");

    Ok(())
}
