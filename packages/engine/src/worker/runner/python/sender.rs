use arrow::{
    datatypes::Schema,
    ipc::writer::{IpcDataGenerator, IpcWriteOptions},
};
use flatbuffers::{FlatBufferBuilder, ForwardsUOffset, Vector, WIPOffset};
use flatbuffers_gen::sync_state_interim_generated::StateInterimSyncArgs;
use nng::{options::Options, Aio, Socket};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

use super::{
    error::{Error, Result},
    fbs::{batch_to_fbs, pkgs_to_fbs, shared_ctx_to_fbs},
};
use crate::{
    datastore::{
        arrow::util::arrow_continuation,
        table::{
            proxy::StateReadProxy,
            task_shared_store::{PartialSharedState, SharedState},
        },
    },
    proto::{ExperimentId, SimulationShortId},
    simulation::enum_dispatch::TaskSharedStore,
    types::WorkerIndex,
    worker::runner::comms::inbound::InboundToRunnerMsgPayload,
};

/// Only used for sending messages to the Python process
pub struct NngSender {
    route: String,

    // Used in the aio to send nng messages to the Python process.
    to_py: Socket,
    aio: Aio,
    aio_result_receiver: UnboundedReceiver<Result<()>>,
}

impl NngSender {
    pub fn new(experiment_id: ExperimentId, worker_index: WorkerIndex) -> Result<Self> {
        let route = format!("ipc://{}-topy{}", experiment_id, worker_index);
        let to_py = Socket::new(nng::Protocol::Pair0)?;
        to_py.set_opt::<nng::options::SendBufferSize>(30)?;
        // TODO: Stress test to determine whether send buffer size is sufficiently large

        // `aio_result_sender` sends the results of operations (i.e. results of trying to
        // send nng messages) in the aio. `aio_result_receiver` receives the results of
        // operations from the aio.
        let (aio_result_sender, aio_result_receiver) = unbounded_channel();

        let aio = Aio::new(move |_aio, res| match res {
            nng::AioResult::Send(res) => match res {
                Ok(_) => {
                    aio_result_sender.send(Ok(())).unwrap();
                }
                Err((msg, err)) => {
                    tracing::warn!(
                        "External worker receiving socket tried to send but failed w/ error: {}",
                        err
                    );
                    match aio_result_sender.send(Err(Error::NngSend(msg, err))) {
                        Ok(_) => {}
                        Err(err) => {
                            tracing::warn!(
                                "Failed to pass send error back to message handler thread {}",
                                err
                            );
                        }
                    };
                }
            },
            nng::AioResult::Sleep(res) => {
                if let Err(err) = res {
                    tracing::error!("AIO sleep error: {}", err);
                    aio_result_sender.send(Err(Error::Nng(err))).unwrap();
                }
            }
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

    pub fn init(&self) -> Result<()> {
        self.to_py.dial(&self.route)?;
        Ok(())
    }

    pub fn send(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: &InboundToRunnerMsgPayload,
        task_payload_json: &Option<serde_json::Value>,
    ) -> Result<()> {
        // TODO: (option<SimId>, inbound payload) --> flatbuffers --> nng
        let msg = inbound_to_nng(sim_id, msg, task_payload_json)?;
        self.aio.wait();
        self.to_py
            .send_async(&self.aio, msg)
            .map_err(|(msg, err)| {
                tracing::warn!("Send failed: {:?}", (&msg, &err));
                Error::NngSend(msg, err)
            })?;
        Ok(())
    }

    pub async fn get_send_result(&mut self) -> Option<Result<()>> {
        self.aio_result_receiver.recv().await
    }
}

impl Drop for NngSender {
    fn drop(&mut self) {
        // TODO: Check whether nng already does this when a socket is dropped
        self.to_py.close();
    }
}

// TODO: Make this function shorter.
fn inbound_to_nng(
    sim_id: Option<SimulationShortId>,
    msg: &InboundToRunnerMsgPayload,
    task_payload_json: &Option<serde_json::Value>,
) -> Result<nng::Message> {
    let mut fbb = flatbuffers::FlatBufferBuilder::new();
    let fbb = &mut fbb;

    let (msg, msg_type) = match msg {
        InboundToRunnerMsgPayload::TaskMsg(msg) => {
            let shared_store = shared_store_to_fbs(fbb, &msg.shared_store);

            // unwrap: TaskMsg variant, so must have serialized payload earlier (and
            // propagated it here).
            let payload = task_payload_json.as_ref().unwrap();
            let payload = serde_json::to_string(payload)?;
            let payload = str_to_serialized(fbb, &payload);

            let task_id =
                flatbuffers_gen::runner_inbound_msg_generated::TaskId(msg.task_id.to_le_bytes());

            let msg = flatbuffers_gen::runner_inbound_msg_generated::TaskMsg::create(
                fbb,
                &flatbuffers_gen::runner_inbound_msg_generated::TaskMsgArgs {
                    package_sid: msg.package_id.as_usize() as u64,
                    task_id: Some(&task_id),
                    payload: Some(payload),
                    metaversioning: Some(shared_store),
                },
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::TaskMsg,
            )
        }
        InboundToRunnerMsgPayload::CancelTask(_) => todo!(), // Unused for now
        InboundToRunnerMsgPayload::StateSync(msg) => {
            let (agent_pool, message_pool) = state_sync_to_fbs(fbb, &msg.state_proxy)?;
            let msg = flatbuffers_gen::sync_state_generated::StateSync::create(
                fbb,
                &flatbuffers_gen::sync_state_generated::StateSyncArgs {
                    agent_pool: Some(agent_pool),
                    message_pool: Some(message_pool),
                    current_step: -1, // TODO: current_step shouldn't be propagated here
                },
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::StateSync,
            )
        }
        InboundToRunnerMsgPayload::StateSnapshotSync(msg) => {
            let (agent_pool, message_pool) = state_sync_to_fbs(fbb, &msg.state_proxy)?;
            let msg = flatbuffers_gen::sync_state_snapshot_generated::StateSnapshotSync::create(
                fbb,
                &flatbuffers_gen::sync_state_snapshot_generated::StateSnapshotSyncArgs {
                    agent_pool: Some(agent_pool),
                    message_pool: Some(message_pool),
                    current_step: -1, // TODO: current_step shouldn't be propagated here
                },
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::StateSnapshotSync,
            )
        }
        InboundToRunnerMsgPayload::ContextBatchSync(msg) => {
            let batch = batch_to_fbs(fbb, &msg.context_batch);
            let msg = flatbuffers_gen::sync_context_batch_generated::ContextBatchSync::create(
                fbb,
                &flatbuffers_gen::sync_context_batch_generated::ContextBatchSyncArgs {
                    context_batch: Some(batch),
                    current_step: -1, // TODO: Should have current_step in ContextBatchSync
                },
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::ContextBatchSync,
            )
        }
        InboundToRunnerMsgPayload::StateInterimSync(msg) => {
            let msg = shared_store_to_fbs(fbb, &msg.shared_store);
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::StateInterimSync,
            )
        }
        InboundToRunnerMsgPayload::TerminateSimulationRun => {
            let msg = flatbuffers_gen::runner_inbound_msg_generated::TerminateSimulationRun::create(
                fbb,
                &flatbuffers_gen::runner_inbound_msg_generated::TerminateSimulationRunArgs {},
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::TerminateSimulationRun,
            )
        }
        InboundToRunnerMsgPayload::TerminateRunner => {
            let msg = flatbuffers_gen::runner_inbound_msg_generated::TerminateRunner::create(
                fbb,
                &flatbuffers_gen::runner_inbound_msg_generated::TerminateRunnerArgs {},
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::TerminateRunner,
            )
        }
        InboundToRunnerMsgPayload::NewSimulationRun(msg) => {
            let _sim_id = fbb.create_string(""); // TODO: Remove `sim_id` from fbs.

            let globals =
                serde_json::to_string(&msg.globals.0).expect("Can serialize serde_json::Value");
            let globals = fbb.create_string(&globals);

            let package_config = pkgs_to_fbs(fbb, &msg.packages)?;

            let shared_ctx = shared_ctx_to_fbs(fbb, &msg.datastore.shared_store);
            let agent_schema_bytes =
                schema_to_stream_bytes(&msg.datastore.agent_batch_schema.arrow);
            let msg_schema_bytes = schema_to_stream_bytes(&msg.datastore.message_batch_schema);
            let ctx_schema_bytes = schema_to_stream_bytes(&msg.datastore.context_batch_schema);
            let agent_schema_bytes = fbb.create_vector(&agent_schema_bytes);
            let msg_schema_bytes = fbb.create_vector(&msg_schema_bytes);
            let ctx_schema_bytes = fbb.create_vector(&ctx_schema_bytes);
            let datastore_init =
                flatbuffers_gen::new_simulation_run_generated::DatastoreInit::create(
                    fbb,
                    &flatbuffers_gen::new_simulation_run_generated::DatastoreInitArgs {
                        agent_batch_schema: Some(agent_schema_bytes),
                        message_batch_schema: Some(msg_schema_bytes),
                        context_batch_schema: Some(ctx_schema_bytes),
                        shared_context: Some(shared_ctx),
                    },
                );

            let msg = flatbuffers_gen::new_simulation_run_generated::NewSimulationRun::create(
                fbb,
                &flatbuffers_gen::new_simulation_run_generated::NewSimulationRunArgs {
                    sim_id: Some(_sim_id),
                    sid: msg.short_id,
                    globals: Some(globals),
                    package_config: Some(package_config),
                    datastore_init: Some(datastore_init),
                },
            );
            (
                msg.as_union_value(),
                flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgPayload::NewSimulationRun,
            )
        }
    };

    let msg = flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsg::create(
        fbb,
        &flatbuffers_gen::runner_inbound_msg_generated::RunnerInboundMsgArgs {
            sim_sid: sim_id.unwrap_or(0),
            payload_type: msg_type,
            payload: Some(msg),
        },
    );
    fbb.finish(msg, None);
    let bytes = fbb.finished_data();

    let mut nanomsg = nng::Message::with_capacity(bytes.len());
    nanomsg.push_front(bytes);
    Ok(nanomsg)
}

fn state_sync_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    state_proxy: &StateReadProxy,
) -> Result<(
    WIPOffset<Vector<'f, ForwardsUOffset<flatbuffers_gen::batch_generated::Batch<'f>>>>,
    WIPOffset<Vector<'f, ForwardsUOffset<flatbuffers_gen::batch_generated::Batch<'f>>>>,
)> {
    let agent_pool_offset: Vec<_> = state_proxy
        .agent_proxies
        .batches_iter()
        .map(|batch| batch_to_fbs(fbb, batch))
        .collect();
    let agent_pool_forward_offset = fbb.create_vector(&agent_pool_offset);

    let message_pool_offset: Vec<_> = state_proxy
        .message_proxies
        .batches_iter()
        .map(|message_group| batch_to_fbs(fbb, &message_group.batch))
        .collect();
    let message_pool_forward_offset = fbb.create_vector(&message_pool_offset);

    Ok((agent_pool_forward_offset, message_pool_forward_offset))
}

// TODO: Reduce code duplication between enum variants.
fn shared_store_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    shared_store: &TaskSharedStore,
) -> WIPOffset<flatbuffers_gen::sync_state_interim_generated::StateInterimSync<'f>> {
    let (agent_batches, msg_batches, indices) = match &shared_store.state {
        SharedState::None => (vec![], vec![], vec![]),
        SharedState::Read(state) => {
            let a: Vec<_> = state
                .agent_pool()
                .batches()
                .iter()
                .map(|b| batch_to_fbs(fbb, b))
                .collect();
            let m: Vec<_> = state
                .message_pool()
                .batches()
                .iter()
                .map(|message_group| batch_to_fbs(fbb, &message_group
                    .batch))
                .collect();
            let indices = (0..a.len()).collect();
            (a, m, indices)
        }
        SharedState::Write(state) => {
            let a: Vec<_> = state
                .agent_pool()
                .batches()
                .iter()
                .map(|b| batch_to_fbs(fbb, b))
                .collect();
            let m: Vec<_> = state
                .message_pool()
                .batches()
                .iter()
                .map(|message_group| batch_to_fbs(fbb, &message_group
                    .batch))
                .collect();
            let indices = (0..a.len()).collect();
            (a, m, indices)
        }
        SharedState::Partial(partial) => match partial {
            PartialSharedState::Read(partial) => {
                let state = &partial.state_proxy;
                let a: Vec<_> = state
                    .agent_pool()
                    .batches()
                    .iter()
                    .map(|b| batch_to_fbs(fbb, b))
                    .collect();
                let m: Vec<_> = state
                    .message_pool()
                    .batches()
                    .iter()
                    .map(|message_group| batch_to_fbs(fbb, &message_group
                        .batch))
                    .collect();
                (a, m, partial.group_indices.clone())
            }
            PartialSharedState::Write(partial) => {
                let state = &partial.state_proxy;
                let a: Vec<_> = state
                    .agent_pool()
                    .batches()
                    .iter()
                    .map(|b| batch_to_fbs(fbb, b))
                    .collect();
                let m: Vec<_> = state
                    .message_pool()
                    .batches()
                    .iter()
                    .map(|message_group| batch_to_fbs(fbb, &message_group
                        .batch))
                    .collect();
                (a, m, partial.group_indices.clone())
            }
        },
    };
    let indices: Vec<_> = indices.into_iter().map(|i| i as u32).collect();
    let args = StateInterimSyncArgs {
        group_idx: Some(fbb.create_vector(&indices)),
        agent_batches: Some(fbb.create_vector(&agent_batches)),
        message_batches: Some(fbb.create_vector(&msg_batches)),
    };
    flatbuffers_gen::sync_state_interim_generated::StateInterimSync::create(fbb, &args)
}

fn str_to_serialized<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    s: &str,
) -> WIPOffset<flatbuffers_gen::serialized_generated::Serialized<'f>> {
    let inner = fbb.create_vector(s.as_bytes());
    flatbuffers_gen::serialized_generated::Serialized::create(
        fbb,
        &flatbuffers_gen::serialized_generated::SerializedArgs { inner: Some(inner) },
    )
}

// TODO: Code duplication with JS runner; move this function into datastore?
fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let ipc_data_generator = IpcDataGenerator::default();
    let content = ipc_data_generator.schema_to_bytes(schema, &IpcWriteOptions::default());
    let mut stream_bytes = arrow_continuation(content.ipc_message.len());
    stream_bytes.extend_from_slice(&content.ipc_message);
    stream_bytes
}
