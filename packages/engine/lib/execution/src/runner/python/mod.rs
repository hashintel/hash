mod error;
mod fbs;
mod receiver;
mod sender;

use std::{
    collections::{hash_map::Entry, HashMap},
    future::Future,
    pin::Pin,
    result::Result as StdResult,
    sync::Arc,
};

use futures::FutureExt;
use tokio::{
    process::Command,
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};

pub use self::error::{PythonError, PythonResult};
use self::{receiver::NngReceiver, sender::NngSender};
use crate::{
    package::{experiment::ExperimentId, simulation::SimulationId},
    runner::{
        comms::{
            ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, OutboundFromRunnerMsg,
            OutboundFromRunnerMsgPayload, RunnerTaskMessage, SentTask,
        },
        Language,
    },
    task::TaskId,
    Error, Result,
};

pub struct PythonRunner {
    // Args to RunnerImpl::new
    init_msg: Arc<ExperimentInitRunnerMsg>,

    inbound_sender: UnboundedSender<(Option<SimulationId>, InboundToRunnerMsgPayload)>,
    inbound_receiver: Option<UnboundedReceiver<(Option<SimulationId>, InboundToRunnerMsgPayload)>>,
    outbound_sender: Option<UnboundedSender<OutboundFromRunnerMsg>>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawn: bool,
}

impl PythonRunner {
    pub fn new(spawn: bool, init_msg: ExperimentInitRunnerMsg) -> Result<Self> {
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
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
    ) -> Result<()> {
        tracing::trace!("Sending message to Python: {:?}", &msg);
        self.inbound_sender
            .send((sim_id, msg))
            .map_err(|e| Error::Python(PythonError::InboundSend(e)))
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
    ) -> Result<()> {
        if self.spawned() {
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> Result<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or(Error::Python(PythonError::OutboundReceive))
    }

    // TODO: Duplication with other runners (move into worker?)
    #[allow(dead_code)]
    pub async fn recv_now(&mut self) -> Result<Option<OutboundFromRunnerMsg>> {
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
    ) -> Result<Pin<Box<dyn Future<Output = StdResult<Result<()>, JoinError>> + Send>>> {
        // TODO: Duplication with other runners (move into worker?)
        tracing::debug!("Running Python runner");
        if !self.spawn {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        let init_msg = Arc::clone(&self.init_msg);
        let inbound_receiver = self
            .inbound_receiver
            .take()
            .ok_or(PythonError::AlreadyRunning)?;
        let outbound_sender = self
            .outbound_sender
            .take()
            .ok_or(PythonError::AlreadyRunning)?;

        let f = async move { _run(init_msg, inbound_receiver, outbound_sender).await };
        Ok(Box::pin(tokio::task::spawn(f)))
    }

    pub fn cleanup(experiment_id: ExperimentId) -> Result<()> {
        // Cleanup python socket files in case the engine didn't
        let frompy_files = glob::glob(&format!("{experiment_id}-frompy*"))
            .map_err(|e| Error::Unique(format!("cleanup glob error: {}", e)))?;
        let topy_files = glob::glob(&format!("{experiment_id}-topy*"))
            .map_err(|e| Error::Unique(format!("cleanup glob error: {}", e)))?;

        frompy_files
            .into_iter()
            .chain(topy_files)
            .filter_map(|glob_res| match glob_res {
                Ok(path) => Some(path),
                Err(err) => {
                    tracing::warn!(
                        "Glob Error while trying to clean-up NNG socket files from the Python \
                         runner: {err}"
                    );
                    None
                }
            })
            .for_each(|path| match std::fs::remove_file(&path) {
                Ok(_) => {
                    tracing::warn!(
                        experiment = %experiment_id,
                        "Removed file {path:?} that should've been cleanup by the engine."
                    );
                }
                Err(err) => {
                    tracing::warn!(
                        experiment = %experiment_id,
                        "Could not clean up {path:?}: {err}"
                    );
                }
            });

        Ok(())
    }
}

async fn _run(
    init_msg: Arc<ExperimentInitRunnerMsg>,
    mut inbound_receiver: UnboundedReceiver<(Option<SimulationId>, InboundToRunnerMsgPayload)>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
) -> Result<()> {
    // Open sockets for Python process to connect to (i.e. start listening).
    let mut nng_sender = NngSender::new(init_msg.experiment_id, init_msg.worker_index)?;
    let mut nng_receiver = NngReceiver::new(init_msg.experiment_id, init_msg.worker_index)?;

    // Spawn Python process.
    let mut cmd = Command::new("sh");
    cmd.arg("./lib/execution/src/runner/python/run.sh")
        .arg(&init_msg.experiment_id.to_string())
        .arg(&init_msg.worker_index.to_string());
    let _process = cmd.spawn().map_err(PythonError::Spawn)?;
    tracing::debug!("Started Python process {}", init_msg.worker_index);

    // Send init message to Python process.
    nng_receiver.init(&init_msg)?;
    // We waited for Python init message handling to finish,
    // so we know that sender init can be done now.
    nng_sender.init()?;

    tracing::debug!("Waiting for messages to Python runner");
    let mut sent_tasks: HashMap<TaskId, SentTask> = HashMap::new();
    let mut sync_completion_senders = HashMap::new();
    'select_loop: loop {
        // TODO: Send errors instead of immediately stopping?
        tokio::select! {
            Some(nng_send_result) = nng_sender.get_send_result() => {
                nng_send_result?;
            }
            Some((sim_id, inbound)) = inbound_receiver.recv() => {
                // Need to get payload before sending nng message.
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
                    InboundToRunnerMsgPayload::CancelTask(_) => {
                        todo!("Cancel messages are not implemented yet");
                        // see https://app.asana.com/0/1199548034582004/1202011714603653/f
                    }
                    _ => (None, None)
                };

                // Send nng first, because need inbound by reference for nng,
                // but by value for saving sent task.
                nng_sender.send(sim_id, &inbound, &task_payload_json)?;

                // Do Rust part of message handling, if any.
                match inbound {
                    InboundToRunnerMsgPayload::TerminateRunner => break 'select_loop,
                    InboundToRunnerMsgPayload::StateSync(sync) => {
                        let sim_id = sim_id.ok_or_else(|| Error::from("Missing simulation id"))?;
                        if let Entry::Vacant(entry) = sync_completion_senders.entry(sim_id) {
                            entry.insert(sync.completion_sender);
                        } else {
                            return Err(PythonError::AlreadyAwaiting.into());
                        }
                    }
                    InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMessage {
                        task_id,
                        shared_store,
                        ..
                    }) => {
                        tracing::trace!("Sent task with id {task_id:?}");
                        // unwrap: TaskMsg variant, so must have serialized payload earlier.
                        let sent = SentTask {
                            task_wrapper: task_wrapper.unwrap(),
                            shared_store
                        };
                        sent_tasks
                            .try_insert(task_id, sent)
                            .map_err(|_| Error::from(format!(
                                "Inbound message with duplicate sent task id {:?}", task_id
                            )))?;
                    }
                    _ => {}
                }
            }
            outbound = nng_receiver.get_recv_result() => {
                let outbound = outbound.map_err(Error::from)?;
                let outbound = OutboundFromRunnerMsg::try_from_nng(
                    outbound,
                    Language::Python,
                    &mut sent_tasks,
                );
                let outbound = outbound.map_err(|err| {
                    let err = Error::from(format!(
                        "Failed to convert nng message to OutboundFromRunnerMsg: {err}"
                    ));
                    // TODO: Investigate why `err` sometimes doesn't get logged at all
                    //       (higher in the call stack) unless we log it here and avoid
                    //       logging `err` more than once.
                    tracing::error!("{err}");
                    err
                })?;
                if let OutboundFromRunnerMsgPayload::SyncCompletion = &outbound.payload {
                    sync_completion_senders
                        .remove(&outbound.sim_id)
                        .ok_or(PythonError::NotAwaiting)?
                        .send(Ok(()))
                        .map_err(|error| Error::from(format!(
                            "Couldn't send state sync completion from Python: {error:?}"
                        )))?;
                } else {
                    outbound_sender.send(outbound)?;
                }
            }
        }
    }

    // // TODO: Drop nng_sender/nng_receiver before killing process?
    // match tokio::time::timeout(std::time::Duration::from_secs(10), process.wait()).await? {
    //     None => {
    //         tracing::info!("Python process has failed to exit; killing.");
    //         process.kill().await?;
    //     }
    //     Some(status) => {
    //         tracing::info!(
    //             "Python runner has successfully exited with status: {:?}.",
    //             status.code().unwrap_or(-1)
    //         );
    //     }
    // }
    Ok(())
}
