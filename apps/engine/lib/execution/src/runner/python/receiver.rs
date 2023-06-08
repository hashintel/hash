use nng::{Aio, Socket};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

pub use crate::runner::python::{PythonError, PythonResult};
use crate::{
    package::experiment::ExperimentId,
    runner::{
        comms::ExperimentInitRunnerMsg,
        python::fbs::{pkgs_to_fbs, shared_ctx_to_fbs},
    },
    worker_pool::WorkerIndex,
};

fn experiment_init_to_nng(init: &ExperimentInitRunnerMsg) -> PythonResult<nng::Message> {
    // TODO: initial buffer size
    let mut fbb = flatbuffers::FlatBufferBuilder::new();
    let experiment_id =
        flatbuffers_gen::init_generated::ExperimentId(*(init.experiment_id.as_bytes()));

    // Build the SharedContext Flatbuffer Batch objects and collect their offsets in a vec
    let shared_context = {
        let upgraded = init.shared_context.upgrade();
        shared_ctx_to_fbs(&mut fbb, upgraded.unwrap().as_ref())
    };

    // Build the Flatbuffer Package objects and collect their offsets in a vec
    let package_config = pkgs_to_fbs(&mut fbb, &init.package_config)?;
    let msg = flatbuffers_gen::init_generated::Init::create(
        &mut fbb,
        &flatbuffers_gen::init_generated::InitArgs {
            experiment_id: Some(&experiment_id),
            worker_index: init.worker_index.index() as u64,
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
    pub fn new(experiment_id: ExperimentId, worker_index: WorkerIndex) -> PythonResult<Self> {
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

    pub fn init(&self, init_msg: &ExperimentInitRunnerMsg) -> PythonResult<()> {
        let _init_request = self.from_py.recv()?;

        // Only case where `from_py` is used for sending
        self.from_py
            .send(experiment_init_to_nng(init_msg)?)
            .map_err(|(msg, err)| PythonError::NngSend(msg, err))?;

        let _init_ack = self.from_py.recv()?;
        self.from_py.recv_async(&self.aio)?;
        Ok(())
    }

    pub async fn get_recv_result(&mut self) -> PythonResult<nng::Message> {
        // TODO: Return `Option::None` instead of using ok_or to convert to an Err?
        let nng_msg = self
            .aio_result_receiver
            .recv()
            .await
            .ok_or(PythonError::OutboundReceive)?;

        self.from_py.recv_async(&self.aio)?;
        Ok(nng_msg)
    }
}
