mod error;

use crate::gen;
use futures::FutureExt;
use nng::options::Options;
use nng::{Aio, Socket};
use std::str::FromStr;
use tokio::process::Command;
use tokio::sync::mpsc::{unbounded_channel, Receiver, Sender, UnboundedReceiver, UnboundedSender};
use uuid::Uuid;

use super::comms::{
    inbound::InboundToRunnerMsgPayload, outbound::OutboundFromRunnerMsg, ExperimentInitRunnerMsg,
};
use crate::datastore::batch::Batch;
use crate::proto::{ExperimentID, SimulationShortID};
use crate::types::WorkerIndex;
use crate::worker::{Error as WorkerError, Result as WorkerResult};
pub use error::{Error, Result};

fn experiment_init_to_nng(init: &ExperimentInitRunnerMsg) -> Result<nng::Message> {
    // TODO - initial buffer size
    let mut fbb = flatbuffers::FlatBufferBuilder::new();
    let experiment_id = gen::ExperimentID(*(Uuid::from_str(&init.experiment_id)?.as_bytes()));

    // Build the SharedContext Flatbuffer Batch objects and collect their offsets in a vec
    let batch_offsets = init
        .shared_context
        .datasets
        .iter()
        .map(|(dataset_name, dataset)| {
            let dataset_metaversion = dataset.metaversion();

            let batch_id_offset = fbb.create_string(dataset_name);
            let metaversion_offset = gen::Metaversion::create(
                &mut fbb,
                &gen::MetaversionArgs {
                    memory: dataset_metaversion.memory(),
                    batch: dataset_metaversion.batch(),
                },
            );

            return gen::Batch::create(
                &mut fbb,
                &gen::BatchArgs {
                    batch_id: Some(batch_id_offset),
                    metaversion: Some(metaversion_offset),
                },
            );
        })
        .collect::<Vec<_>>();
    let batch_fbs_vec = fbb.create_vector(&batch_offsets);

    // Build the SharedContext using the vec
    let shared_context = gen::SharedContext::create(
        &mut fbb,
        &gen::SharedContextArgs {
            datasets: Some(batch_fbs_vec),
        },
    );

    // Build the Flatbuffer Package objects and collect their offsets in a vec
    let packages = init
        .package_config
        .0
        .iter()
        .map(|(package_id, init_msg)| {
            let package_name = fbb.create_string(init_msg.name.clone().into());

            let serialized_payload = fbb.create_vector(&serde_json::to_vec(&init_msg.payload)?);
            let payload = gen::Serialized::create(
                &mut fbb,
                &gen::SerializedArgs {
                    inner: Some(serialized_payload),
                },
            );

            Ok(gen::Package::create(
                &mut fbb,
                &gen::PackageArgs {
                    type_: init_msg.r#type.into(),
                    name: Some(package_name),
                    sid: package_id.as_usize() as u16, // TODO is this a safe cast down
                    init_payload: Some(payload),
                },
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let packages_fbs_vec = fbb.create_vector(&packages);

    let package_config = gen::PackageConfig::create(
        &mut fbb,
        &gen::PackageConfigArgs {
            packages: Some(packages_fbs_vec),
        },
    );
    let msg = gen::Init::create(
        &mut fbb,
        &gen::InitArgs {
            experiment_id: Some(&experiment_id),
            worker_index: init.worker_index as u64,
            shared_context: Some(shared_context),
            package_config: Some(package_config),
        },
    );

    fbb.finish(msg, None);
    let bytes = fbb.finished_data();

    let mut nanomsg = nng::Message::with_capacity(bytes.len());
    nanomsg.push_front(bytes);

    Ok(nanomsg)
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
    // aio_result_sender: UnboundedSender<Result<()>>,

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
    // aio_result_sender: UnboundedSender<nng::Message>,

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
            aio_result_receiver,
        })
    }

    pub fn init(&self, init_msg: &ExperimentInitRunnerMsg) -> Result<()> {
        self.from_py.listen(&self.route)?;

        let listener = nng::Listener::new(&self.from_py, &self.route)?;
        let _init_request = self.from_py.recv()?;
        self.from_py // Only case where `from_py` is used for sending
            .send(experiment_init_to_nng(init_msg)?)
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
    kill_sender: Sender<()>,
    kill_receiver: Receiver<()>,
    spawned: bool,
}

impl PythonRunner {
    pub fn new(spawn: bool, init: ExperimentInitRunnerMsg) -> WorkerResult<Self> {
        let nng_sender = NngSender::new(init.experiment_id.clone(), init.worker_index)?;
        let nng_receiver = NngReceiver::new(init.experiment_id.clone(), init.worker_index)?;
        let (kill_sender, kill_receiver) = tokio::sync::mpsc::channel(2);
        Ok(Self {
            init_msg: init,
            spawned: spawn,
            nng_sender,
            nng_receiver,
            kill_sender,
            kill_receiver,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        self.nng_sender.send(sim_id, msg)?;
        // if matches!(msg, InboundToRunnerMsgPayload::KillRunner) {
        //     self.kill_sender.send(()).await.map_err(|e| Error::KillSend(e))?;
        // }
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

    pub async fn run(&mut self) -> WorkerResult<()> {
        // TODO: Duplication with other runners (move into worker?)
        if !self.spawned {
            return Ok(());
        }

        // Spawn Python process.
        // let mut cmd = Command::new("sh");
        // cmd.arg("./packages/engine/src/worker/runner/python/run.sh")
        //     .arg(&self.init_msg.experiment_id)
        //     .arg(&self.init_msg.worker_index.to_string());
        // let mut process = cmd.spawn()?;

        // Send messages to Python process.
        self.nng_receiver.init(&self.init_msg)?;
        loop {
            tokio::select! {
                Some(nng_send_result) = self.nng_sender.get_send_result() => {
                    nng_send_result?;
                }
                Some(_) = self.kill_receiver.recv() => {
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
}
