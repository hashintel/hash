mod error;
mod fbs;
mod receiver;
mod sender;

use std::future::Future;
use std::pin::Pin;
use std::result::Result as StdResult;

use futures::FutureExt;
use tokio::process::{Child, Command};
use tokio::sync::mpsc::{Receiver, Sender, UnboundedReceiver};
use tokio::task::JoinError;

use super::comms::{
    inbound::InboundToRunnerMsgPayload, outbound::OutboundFromRunnerMsg, ExperimentInitRunnerMsg,
};
use crate::proto::SimulationShortID;
use crate::worker::{Error as WorkerError, Result as WorkerResult};

pub use error::{Error, Result};
use receiver::NngReceiver;
use sender::NngSender;

pub struct PythonRunner {
    init_msg: ExperimentInitRunnerMsg,
    nng_sender: NngSender,
    send_result_receiver: Option<UnboundedReceiver<Result<()>>>,
    nng_receiver: NngReceiver,
    // TODO replace with crate::workerpool::comms:terminate::terminate ?
    terminate_sender: Sender<()>,
    terminate_receiver: Option<Receiver<()>>,
    spawned: bool,
}

async fn _run(
    _process: Child,
    mut send_result_receiver: UnboundedReceiver<Result<()>>,
    mut terminate_receiver: Receiver<()>,
) -> WorkerResult<()> {
    log::debug!("Waiting for messages to Python runner");
    loop {
        tokio::select! {
            Some(nng_send_result) = send_result_receiver.recv() => {
                nng_send_result?;
            }
            Some(_) = terminate_receiver.recv() => {
                break;
            }
        }
    }
    // // TODO: Drop nng_sender/nng_receiver before killing process?
    // match await_timeout(process.wait(), std::time::Duration::from_secs(10))? {
    //     None => {
    //         log::info!("Python process has failed to exit; killing.");
    //         process.kill().await?;
    //     }
    //     Some(status) => {
    //         log::info!(
    //             "Python runner has successfully exited with status: {:?}.",
    //             status.code().unwrap_or(-1)
    //         );
    //     }
    // }
    Ok(())
}

impl PythonRunner {
    pub fn new(spawn: bool, init: ExperimentInitRunnerMsg) -> WorkerResult<Self> {
        log::debug!("Creating Python runner {}", spawn);
        let (nng_sender, send_result_reciever) =
            NngSender::new(init.experiment_id.clone(), init.worker_index)?;
        let nng_receiver = NngReceiver::new(init.experiment_id.clone(), init.worker_index)?;
        let (terminate_sender, terminate_receiver) = tokio::sync::mpsc::channel(2);
        Ok(Self {
            init_msg: init,
            spawned: spawn,
            nng_sender,
            send_result_receiver: Some(send_result_reciever),
            nng_receiver,
            terminate_sender,
            terminate_receiver: Some(terminate_receiver),
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        if matches!(msg, InboundToRunnerMsgPayload::TerminateRunner) {
            log::debug!("Sending terminate signal to Python runner");
            self.terminate_sender
                .send(())
                .await
                .map_err(|e| Error::TerminateSend(e))?;
        }
        self.nng_sender.send(sim_id, msg)?;
        Ok(())
    }

    // TODO: Duplication with other runners (move into worker?)
    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        if self.spawned {
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> WorkerResult<OutboundFromRunnerMsg> {
        self.nng_receiver
            .get_recv_result()
            .await
            .map_err(WorkerError::from)
    }

    // TODO: Duplication with other runners (move into worker?)
    pub async fn recv_now(&mut self) -> WorkerResult<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    // TODO: Duplication with other runners (move into worker?)
    pub fn spawned(&self) -> bool {
        self.spawned
    }

    pub async fn run(
        &mut self,
    ) -> WorkerResult<Pin<Box<dyn Future<Output = StdResult<WorkerResult<()>, JoinError>> + Send>>>
    {
        log::debug!("Running Python runner");
        // TODO: Duplication with other runners (move into worker?)
        if !self.spawned {
            return Ok(Box::pin(async move { Ok(Ok(())) }) as _);
        }

        // Spawn Python process.
        let mut cmd = Command::new("sh");
        cmd.arg("./src/worker/runner/python/run.sh")
            .arg(&self.init_msg.experiment_id)
            .arg(&self.init_msg.worker_index.to_string());
        let process = cmd.spawn().map_err(|e| Error::Spawn(e))?;
        log::debug!("Started Python process {}", self.init_msg.worker_index);

        // Send init message to Python process.
        self.nng_receiver.init(&self.init_msg)?;
        // We waited for Python init message handling to finish,
        // so we know that sender init can be done now.
        self.nng_sender.init()?;

        let send_result_receiver = self
            .send_result_receiver
            .take()
            .ok_or(Error::AlreadyRunning)?;
        let terminate_receiver = self
            .terminate_receiver
            .take()
            .ok_or(Error::AlreadyRunning)?;
        Ok(Box::pin(tokio::spawn(async move {
            _run(process, send_result_receiver, terminate_receiver).await
        })) as _)
    }
}
