mod error;
mod fbs;
mod receiver;
mod sender;

use std::{collections::HashMap, future::Future, pin::Pin, result::Result as StdResult, sync::Arc};

use futures::FutureExt;
use tokio::{
    process::Command,
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};

pub use self::error::{Error, Result};
use self::{receiver::NngReceiver, sender::NngSender};
use super::comms::{
    inbound::InboundToRunnerMsgPayload, outbound::OutboundFromRunnerMsg, ExperimentInitRunnerMsg,
    RunnerTaskMsg, SentTask,
};
use crate::{
    proto::SimulationShortId,
    types::TaskId,
    worker::{Error as WorkerError, Result as WorkerResult},
    Language,
};

pub struct PythonRunner {
    // Args to RunnerImpl::new
    init_msg: Arc<ExperimentInitRunnerMsg>,

    inbound_sender: UnboundedSender<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    inbound_receiver:
        Option<UnboundedReceiver<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>>,
    outbound_sender: Option<UnboundedSender<OutboundFromRunnerMsg>>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawn: bool,
}

impl PythonRunner {
    pub fn new(spawn: bool, init_msg: ExperimentInitRunnerMsg) -> WorkerResult<Self> {
        let (inbound_sender, inbound_receiver) = unbounded_channel();
        let (outbound_sender, outbound_receiver) = unbounded_channel();
        Ok(Self {
            init_msg: Arc::new(init_msg),
            inbound_sender,
            inbound_receiver: Some(inbound_receiver),
            outbound_sender: Some(outbound_sender),
            outbound_receiver,
            spawn,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        log::trace!("Sending message to Python: {:?}", &msg);
        self.inbound_sender
            .send((sim_id, msg))
            .map_err(|e| WorkerError::Python(Error::InboundSend(e)))
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        if self.spawned() {
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> WorkerResult<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or(WorkerError::Python(Error::OutboundReceive))
    }

    // TODO: Duplication with other runners (move into worker?)
    pub async fn recv_now(&mut self) -> WorkerResult<Option<OutboundFromRunnerMsg>> {
        // TODO: `now_or_never` on a receiver can very rarely drop messages (known
        //       issue with tokio). Replace with better solution once tokio has one.
        self.recv().now_or_never().transpose()
    }

    // TODO: Duplication with other runners (move into worker?)
    pub fn spawned(&self) -> bool {
        self.spawn
    }

    pub async fn run(
        &mut self,
    ) -> WorkerResult<Pin<Box<dyn Future<Output = StdResult<WorkerResult<()>, JoinError>> + Send>>>
    {
        // TODO: Duplication with other runners (move into worker?)
        log::debug!("Running Python runner");
        if !self.spawn {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        let init_msg = Arc::clone(&self.init_msg);
        let inbound_receiver = self.inbound_receiver.take().ok_or(Error::AlreadyRunning)?;
        let outbound_sender = self.outbound_sender.take().ok_or(Error::AlreadyRunning)?;

        let f = async move { _run(init_msg, inbound_receiver, outbound_sender).await };
        Ok(Box::pin(tokio::task::spawn(f)))
    }
}

async fn _run(
    init_msg: Arc<ExperimentInitRunnerMsg>,
    mut inbound_receiver: UnboundedReceiver<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
) -> WorkerResult<()> {
    // Open sockets for Python process to connect to (i.e. start listening).
    let mut nng_sender = NngSender::new(init_msg.experiment_id.clone(), init_msg.worker_index)?;
    let mut nng_receiver = NngReceiver::new(init_msg.experiment_id.clone(), init_msg.worker_index)?;

    // Spawn Python process.
    let mut cmd = Command::new("sh");
    cmd.arg("./src/worker/runner/python/run.sh")
        .arg(&init_msg.experiment_id)
        .arg(&init_msg.worker_index.to_string());
    let _process = cmd.spawn().map_err(Error::Spawn)?;
    log::debug!("Started Python process {}", init_msg.worker_index);

    // Send init message to Python process.
    nng_receiver.init(&init_msg)?;
    // We waited for Python init message handling to finish,
    // so we know that sender init can be done now.
    nng_sender.init()?;

    log::debug!("Waiting for messages to Python runner");
    let mut sent_tasks: HashMap<TaskId, SentTask> = HashMap::new();
    'select_loop: loop {
        // TODO: Send errors instead of immediately stopping?
        tokio::select! {
            Some(nng_send_result) = nng_sender.get_send_result() => {
                nng_send_result?;
            }
            Some((sim_id, inbound)) = inbound_receiver.recv() => {
                let (task_payload_json, task_wrapper) = match &inbound {
                    InboundToRunnerMsgPayload::TaskMsg(msg) => {
                        // TODO: Error message duplication with JS runner
                        let (payload, wrapper) = msg.payload
                            .clone()
                            .extract_inner_msg_with_wrapper()
                            .map_err(|err| {
                                Error::from(format!(
                                    "Failed to extract the inner task message: {err}"
                                ))
                            })?;
                        (Some(payload), Some(wrapper))
                    }
                    _ => (None, None)
                };

                // Send nng first, because need inbound by reference for nng,
                // but by value for saving sent task.
                nng_sender.send(sim_id, &inbound, &task_payload_json)?;

                match inbound {
                    InboundToRunnerMsgPayload::TerminateRunner => break 'select_loop,
                    InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
                        task_id,
                        shared_store,
                        ..
                    }) => {
                        // unwrap: TaskMsg variant, so must have serialized payload earlier.
                        let sent = SentTask {
                            task_wrapper: task_wrapper.unwrap(),
                            shared_store
                        };
                        sent_tasks
                            .try_insert(task_id, sent)
                            .map_err(|_| Error::from(format!(
                                "Inbound message w/o sent task id {:?}", task_id
                            )))?;
                    }
                    _ => {}
                }
            }
            outbound = nng_receiver.get_recv_result() => {
                let outbound = outbound.map_err(WorkerError::from)?;
                let outbound = OutboundFromRunnerMsg::try_from_nng(
                    outbound,
                    Language::Python,
                    &mut sent_tasks,
                );
                let outbound = outbound.map_err(|err| {
                    Error::from(format!(
                        "Failed to convert nng message to OutboundFromRunnerMsg: {err}"
                    ))
                })?;
                outbound_sender.send(outbound)?;
            }
        }
    }

    // // TODO: Drop nng_sender/nng_receiver before killing process?
    // match tokio::time::timeout(std::time::Duration::from_secs(10), process.wait()).await? {
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
