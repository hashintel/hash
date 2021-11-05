use super::process;
use crate::exsrv::Handler;
use crate::manifest::read_manifest;
use crate::{
    error::{Error, Result},
    Args,
};
use hash_prime::proto;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::{self, timeout};

lazy_static::lazy_static! {
    static ref ENGINE_START_TIMEOUT: Duration = Duration::from_secs(180);
    static ref PING_INTERVAL: Duration = Duration::from_secs(5);
}

/// `run_experiment` will build a queue of tokio tasks attached the the simulation workers
/// Any requests over the websocket will be handled and sent to the appropriate worker (if available)
/// The simulations will run to completion and the connection will finish once the
/// last run is done, or if there is an error.
pub async fn run_experiment(args: Args, handler: Handler) -> Result<()> {
    let absolute_project_path = PathBuf::from(&args.project).canonicalize()?;
    let experiment_run = read_manifest(absolute_project_path, &args.experiment_name)?;
    run_experiment_with_manifest(args, experiment_run, handler).await?;
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
    mut handler: Handler,
) -> Result<()> {
    let experiment_id = experiment_run.base.id.clone();
    let mut engine_handle = handler.register_experiment(&experiment_id).await?;

    // Create and start the experiment run
    let cmd = create_engine_command(&args, &experiment_id, handler.url())?;
    let mut engine_process = cmd.run().await?;

    // Wait to receive a message that the experiment has started before sending the
    // init message.
    let msg = timeout(*ENGINE_START_TIMEOUT, engine_handle.recv())
        .await
        .map_err(|_| Error::from("engine start timeout"));
    match msg {
        Ok(proto::EngineStatus::Started) => {}
        Ok(m) => {
            return Err(Error::from(format!(
                "expected to receive Started message but received type {}",
                m.kind()
            )));
        }
        Err(e) => {
            log::error!("Engine start timeout for experiment {}", &experiment_id);
            engine_process.exit_and_cleanup().await?;
            return Err(e);
        }
    };
    log::debug!("Received start message from {}", &experiment_id);

    // Now we can send the init message
    let init_message = proto::InitMessage {
        experiment: experiment_run.clone(),
        env: context.environment.clone().into(),
        dyn_payloads: Default::default(),
    };
    engine_process
        .send(&proto::EngineMsg::Init(init_message))
        .await?;
    log::debug!("Sent init message to {}", &experiment_id);

    loop {
        let mut msg: Option<proto::EngineStatus> = None;
        tokio::select! {
            _ = time::sleep(Duration::from_secs(60)) => {
                log::error!("Did not receive status from experiment {} for over 60 seconds. Exiting now.", &experiment_id);
                break;
            }
            m = engine_handle.recv() => { msg = Some(m) },
        }
        let msg = msg.unwrap();
        log::info!("Got message from experiment run with type: {}", msg.kind());

        match msg {
            proto::EngineStatus::Stopping => {
                console.log("Stopping experiment");
            }
            proto::EngineStatus::SimStart(short_id, property_changes) => {
                console.log("Started simulation: {}", short_id);
            }
            proto::EngineStatus::SimStatus(status) => {
                log::debug!("Got runner status: {:?}", status);
                // TODO[1] handle status fields
            }
            proto::EngineStatus::Exit() => {
                log::debug!(
                    "Process exited successfully for experiment run with id {}",
                    experiment_id
                );
                break;
            }
            proto::EngineStatus::ProcessError(error) => {
                log::error!("Got error: {:?}", error);
                break;
            }
            proto::EngineStatus::Started => {
                log::error!("Received unexpected message type {}", msg.kind());
                break;
            }
            proto::EngineStatus::SimStop(_) => todo!(),
            proto::EngineStatus::Errors(_, _) => todo!(),
            proto::EngineStatus::Warnings(_, _) => todo!(),
        }
    }
    log::debug!("Performing cleanup");
    engine_process.exit_and_cleanup().await?;
    Ok(())
}
