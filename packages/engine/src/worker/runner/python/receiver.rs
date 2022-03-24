use nng::{Aio, Socket};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

use super::{
    error::{Error, Result},
    fbs::{pkgs_to_fbs, shared_ctx_to_fbs},
};
use crate::{
    proto::ExperimentId, types::WorkerIndex, worker::runner::comms::ExperimentInitRunnerMsg,
};

fn experiment_init_to_nng(init: &ExperimentInitRunnerMsg) -> Result<nng::Message> {
    // TODO: initial buffer size
    let mut fbb = flatbuffers::FlatBufferBuilder::new();
    let experiment_id =
        flatbuffers_gen::init_generated::ExperimentId(*(init.experiment_id.as_bytes()));

    // Build the SharedContext Flatbuffer Batch objects and collect their offsets in a vec
    let shared_context = shared_ctx_to_fbs(&mut fbb, &init.shared_context);

    // Build the Flatbuffer Package objects and collect their offsets in a vec
    let package_config = pkgs_to_fbs(&mut fbb, &init.package_config)?;
    let msg = flatbuffers_gen::init_generated::Init::create(
        &mut fbb,
        &flatbuffers_gen::init_generated::InitArgs {
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

/// Only used for receiving messages from the Python process,
/// except for the init message, which is sent once in response
/// to an init message request
pub struct NngReceiver {
    // Used in the aio to receive nng messages from the Python process.
    from_py: Socket,
    aio: Aio,
    // Receives the results of operations from the aio.
    aio_result_receiver: UnboundedReceiver<nng::Message>,
}

impl NngReceiver {
    pub fn new(experiment_id: ExperimentId, worker_index: WorkerIndex) -> Result<Self> {
        let route = format!("ipc://{}-frompy{}", experiment_id, worker_index);
        let from_py = Socket::new(nng::Protocol::Pair0)?;
        from_py.listen(&route)?;

        // `aio_result_sender` sends the results of operations (i.e. results of trying to
        // receive nng messages) in the aio.
        let (aio_result_sender, aio_result_receiver) = unbounded_channel();
        let aio = Aio::new(move |_aio, res| match res {
            nng::AioResult::Recv(Ok(m)) => {
                aio_result_sender.send(m).expect("Should be able to send");
            }
            nng::AioResult::Sleep(Ok(_)) => {}
            nng::AioResult::Send(_) => {
                tracing::warn!("Unexpected send result");
            }
            nng::AioResult::Recv(Err(nng::Error::Canceled)) => {}
            nng::AioResult::Recv(Err(nng::Error::Closed)) => {}
            _ => panic!("Error in the AIO, {:?}", res),
        })?;

        Ok(Self {
            from_py,
            aio,
            aio_result_receiver,
        })
    }

    pub fn init(&self, init_msg: &ExperimentInitRunnerMsg) -> Result<()> {
        let _init_request = self.from_py.recv()?;
        self.from_py // Only case where `from_py` is used for sending
            .send(experiment_init_to_nng(init_msg)?)
            .map_err(|(msg, err)| Error::NngSend(msg, err))?;

        let _init_ack = self.from_py.recv()?;
        self.from_py.recv_async(&self.aio)?;
        Ok(())
    }

    pub async fn get_recv_result(&mut self) -> Result<nng::Message> {
        // TODO: Return `Option::None` instead of using ok_or to convert to an Err?
        let nng_msg = self
            .aio_result_receiver
            .recv()
            .await
            .ok_or(Error::OutboundReceive)?;

        self.from_py.recv_async(&self.aio)?;
        Ok(nng_msg)
    }
}

impl Drop for NngReceiver {
    fn drop(&mut self) {
        // TODO: Check whether nng already does this when a socket is dropped
        self.from_py.close();
    }
}
