mod error;

use futures::FutureExt;
use nng::options::Options;
use nng::{Aio, Socket};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use super::comms::{
    inbound::InboundToRunnerMsgPayload, outbound::OutboundFromRunnerMsg, ExperimentInitRunnerMsg,
};
use crate::proto::{ExperimentID, SimulationShortID};
use crate::types::WorkerIndex;
use crate::worker::{Error as WorkerError, Result as WorkerResult};
pub use error::{Error, Result};

fn experiment_init_to_nng(init: &ExperimentInitRunnerMsg) -> nng::Message {
    todo!()
}

fn inbound_to_nng(
    sim_id: Option<SimulationShortID>,
    msg: InboundToRunnerMsgPayload,
) -> nng::Message {
    todo!()
}

/// Only used for sending messages to the Python process
struct NngSender {
    route: String,

    // Used in the aio to send nng messages to the Python process.
    to_py: Socket,
    aio: Aio,

    // Sends the results of operations (i.e. results of trying to
    // send nng messages) in the aio.
    aio_result_sender: UnboundedSender<Result<()>>,

    // Receives the results of operations from the aio.
    aio_result_receiver: UnboundedReceiver<Result<()>>,
}

impl NngSender {
    fn new(experiment_id: ExperimentID, worker_index: WorkerIndex) -> Result<Self> {
        let route = format!("ipc://{}-topy{}", experiment_id, worker_index);
        let to_py = Socket::new(nng::Protocol::Pair0)?;
        to_py.set_opt::<nng::options::SendBufferSize>(30)?;
        // TODO: Stress test to determine whether send buffer size is sufficiently large

        let (aio_result_sender, aio_result_receiver) = unbounded_channel();
        let aio = Aio::new(move |_aio, res| match res {
            nng::AioResult::Send(res) => {
                match res {
                    Ok(_) => {
                        aio_result_sender.send(Ok(())).unwrap();
                    }
                    Err((msg, err)) => {
                        log::warn!("External worker receiving socket tried to send but failed w/ error: {}", err);
                        match aio_result_sender.send(Err(Error::NngSend(msg, err))) {
                            Ok(_) => {}
                            Err(err) => {
                                log::warn!(
                                    "Failed to pass send error back to message handler thread {}",
                                    err
                                );
                            }
                        };
                    }
                }
            }
            nng::AioResult::Sleep(res) => match res {
                Err(err) => {
                    log::error!("AIO sleep error: {}", err);
                    aio_result_sender.send(Err(Error::Nng(err))).unwrap();
                }
                _ => {}
            },
            nng::AioResult::Recv(_) => {
                unreachable!("This callback is only for the send operation")
            }
        })?;
        aio.set_timeout(Some(std::time::Duration::new(5, 0)))?;

        Ok(Self {
            route,
            to_py,
            aio,
            aio_result_sender,
            aio_result_receiver,
        })
    }

    fn send(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> Result<()> {
        // TODO: (option<SimId>, inbound payload) --> flatbuffers --> nng
        let msg = inbound_to_nng(sim_id, msg);
        self.aio.wait();
        self.to_py
            .send_async(&self.aio, msg)
            .map_err(|(msg, err)| {
                log::warn!("Send failed: {:?}", (&msg, &err));
                Error::NngSend(msg, err)
            })?;
        Ok(())
    }

    async fn get_send_result(&mut self) -> Option<Result<()>> {
        self.aio_result_receiver.recv().await
    }
}

/// Only used for receiving messages from the Python process,
/// except for the init message, which is sent once in response
/// to an init message request
struct NngReceiver {
    route: String,

    // Used in the aio to receive nng messages from the Python process.
    from_py: Socket,
    aio: Aio,

    // Sends the results of operations (i.e. results of trying to
    // receive nng messages) in the aio.
    aio_result_sender: UnboundedSender<nng::Message>,

    // Receives the results of operations from the aio.
    aio_result_receiver: UnboundedReceiver<nng::Message>,
}

impl NngReceiver {
    pub fn new(experiment_id: ExperimentID, worker_index: WorkerIndex) -> Result<Self> {
        let route = format!("ipc://{}-frompy{}", experiment_id, worker_index);
        let from_py = Socket::new(nng::Protocol::Pair0)?;

        let (aio_result_sender, aio_result_receiver) = unbounded_channel();
        let aio = Aio::new(move |_aio, res| match res {
            nng::AioResult::Recv(Ok(m)) => {
                aio_result_sender.send(m).expect("Should be able to send");
            }
            nng::AioResult::Sleep(Ok(_)) => {}
            nng::AioResult::Send(_) => {
                log::warn!("Unexpected send result");
            }
            nng::AioResult::Recv(Err(nng::Error::Canceled)) => {}
            nng::AioResult::Recv(Err(nng::Error::Closed)) => {}
            _ => panic!("Error in the AIO, {:?}", res),
        })?;

        Ok(Self {
            route,
            from_py,
            aio,
            aio_result_sender,
            aio_result_receiver,
        })
    }

    pub fn init(&self, init_msg: &ExperimentInitRunnerMsg) -> Result<()> {
        self.from_py.listen(&self.route)?;

        let listener = nng::Listener::new(&self.from_py, &self.route)?;
        let _init_request = self.from_py.recv()?;
        self.from_py // Only case where `from_py` is used for sending
            .send(experiment_init_to_nng(init_msg))
            .map_err(|(msg, err)| Error::NngSend(msg, err))?;

        let _init_ack = self.from_py.recv()?;
        listener.close();
        Ok(())
    }

    async fn get_recv_result(&mut self) -> Result<OutboundFromRunnerMsg> {
        let nng_msg = self
            .aio_result_receiver
            .recv()
            .await
            .ok_or(Error::OutboundReceive)?;

        self.from_py.recv_async(&self.aio)?;
        Ok(OutboundFromRunnerMsg::from(nng_msg))
    }
}

pub struct PythonRunner {
    init_msg: ExperimentInitRunnerMsg,
    nng_sender: NngSender,
    nng_receiver: NngReceiver,
    spawned: bool,
}

impl PythonRunner {
    pub fn new(spawn: bool, init: ExperimentInitRunnerMsg) -> WorkerResult<Self> {
        let nng_sender = NngSender::new(init.experiment_id.clone(), init.worker_index)?;
        let nng_receiver = NngReceiver::new(init.experiment_id.clone(), init.worker_index)?;
        // TODO: kill_sender size 1 bounded channel
        Ok(Self {
            init_msg: init,
            nng_sender,
            nng_receiver,
            spawned: spawn,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        // TODO: If KillRunner message, also send with `kill_sender`
        self.nng_sender.send(sim_id, msg).map_err(WorkerError::from)
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

    pub async fn run(&mut self) -> WorkerResult<()> {
        // TODO: Duplication with other runners (move into worker?)
        if !self.spawned {
            return Ok(());
        }

        self.nng_receiver.init(&self.init_msg)?;
        loop {
            tokio::select! {
                Some(nng_send_result) = self.nng_sender.get_send_result() => {
                    nng_send_result?;
                }
                // TODO: `kill_receiver`
            }
        }
        Ok(())
    }
}
