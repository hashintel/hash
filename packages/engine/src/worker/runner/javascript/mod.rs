// rusty_v8 tips:
//
// When calling JS functions the second argument is the "this" object
// for free functions it's the `Context` created at the very beginning
// Since the argument needs to be a `Local<Value>`
// we need to call `Context::global` and convert it `into` a `Local<Value>`
//
// `Local` is cheap to `Copy`
//
// Even though rusty_v8 returns an Option on Object::get,
// if the object does not have the property the result will be Some(undefined)

mod error;

use std::{collections::HashMap, fs, pin::Pin, ptr::NonNull, slice, sync::Arc};

use arrow::{
    array::{ArrayData, BooleanBufferBuilder, BufferBuilder},
    buffer::Buffer,
    datatypes::{ArrowNativeType, DataType, Schema},
    ipc::writer::{IpcDataGenerator, IpcWriteOptions},
    util::bit_util,
};
use futures::{Future, FutureExt};
use tokio::{
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};
use tracing::{Instrument, Span};

pub use self::error::{Error as JSRunnerError, Result as JSRunnerResult};
use super::comms::{
    inbound::InboundToRunnerMsgPayload,
    outbound::{OutboundFromRunnerMsg, PackageError, UserError, UserWarning},
    ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, TargetedRunnerTaskMsg,
};
use crate::{
    config::Globals,
    datastore::{
        arrow::util::arrow_continuation,
        batch::{change::ColumnChange, AgentBatch, ArrowBatch, MessageBatch, Metaversion},
        prelude::SharedStore,
        storage::memory::Memory,
        table::{
            proxy::StateWriteProxy,
            sync::{ContextBatchSync, StateSync, WaitableStateSync},
            task_shared_store::{PartialSharedState, SharedState, TaskSharedStore},
        },
    },
    proto::SimulationShortId,
    simulation::{
        package::{id::PackageId, PackageType},
        task::msg::TaskMessage,
    },
    types::TaskId,
    worker::{
        runner::comms::outbound::OutboundFromRunnerMsgPayload, Error as WorkerError,
        Result as WorkerResult,
    },
    Language,
};

pub struct JavaScriptRunner {
    // JavaScriptRunner and RunnerImpl are separate because the
    // V8 Isolate inside RunnerImpl can't be sent between threads.
    init_msg: Arc<ExperimentInitRunnerMsg>,
    // Args to RunnerImpl::new
    inbound_sender: UnboundedSender<(Span, Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    inbound_receiver:
        Option<UnboundedReceiver<(Span, Option<SimulationShortId>, InboundToRunnerMsgPayload)>>,
    outbound_sender: Option<UnboundedSender<OutboundFromRunnerMsg>>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawn: bool,
}

impl JavaScriptRunner {
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
        tracing::trace!("Sending message to JavaScript: {:?}", &msg);
        self.inbound_sender
            .send((Span::current(), sim_id, msg))
            .map_err(|e| WorkerError::JavaScript(JSRunnerError::InboundSend(e)))
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        if self.spawned() {
            tracing::trace!("JavaScript is spawned, sending message: {:?}", &msg);
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> WorkerResult<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or(WorkerError::JavaScript(JSRunnerError::OutboundReceive))
    }

    // TODO: UNUSED: Needs triage
    pub async fn recv_now(&mut self) -> WorkerResult<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    pub fn spawned(&self) -> bool {
        self.spawn
    }

    pub async fn run(
        &mut self,
    ) -> WorkerResult<Pin<Box<dyn Future<Output = Result<WorkerResult<()>, JoinError>> + Send>>>
    {
        // TODO: Move tokio spawn into worker?
        tracing::debug!("Running JavaScript runner");
        if !self.spawn {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        let init_msg = Arc::clone(&self.init_msg);
        let inbound_receiver = self
            .inbound_receiver
            .take()
            .ok_or(JSRunnerError::AlreadyRunning)?;
        let outbound_sender = self
            .outbound_sender
            .take()
            .ok_or(JSRunnerError::AlreadyRunning)?;

        let f = || run_experiment(init_msg, inbound_receiver, outbound_sender);
        Ok(Box::pin(tokio::task::spawn_blocking(f)))
    }
}

fn run_experiment(
    init_msg: Arc<ExperimentInitRunnerMsg>,
    mut inbound_receiver: UnboundedReceiver<(
        Span,
        Option<SimulationShortId>,
        InboundToRunnerMsgPayload,
    )>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
) -> WorkerResult<()> {
    // Single threaded runtime only
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| JSRunnerError::IO("Local tokio runtime".into(), e))?;

    tokio::pin! {
        let impl_future = async {
            let platform = v8::new_default_platform(0, false).make_shared();
            v8::V8::initialize_platform(platform);
            v8::V8::initialize();

            let isolate = &mut v8::Isolate::new(Default::default());

            let scope = &mut v8::HandleScope::new(isolate);
            let context = v8::Context::new(scope);
            let scope = &mut v8::ContextScope::new(scope, context);

            let mut thread_local_runner = ThreadLocalRunner::new(scope, context, &init_msg)?;

            loop {
                tokio::select! {
                    Some((span, sim_id, msg)) = inbound_receiver.recv() => {
                        let _span = span.entered();
                        // TODO: Send errors instead of immediately stopping?
                        let msg_str = msg.as_str();
                        tracing::debug!("JS runner got sim `{:?}` inbound {}", &sim_id, msg_str);
                        let keep_running = thread_local_runner.handle_msg(scope, sim_id, msg, &outbound_sender)?;
                        tracing::debug!("JS runner handled sim `{:?}` inbound {}", sim_id, msg_str);
                        if !keep_running {
                            tracing::debug!("JavaScript Runner has finished execution, stopping");
                            break;
                        }
                    }
                }
            }

            Ok(())
        }.in_current_span();
    };

    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, impl_future)
}

struct ThreadLocalRunner<'s> {
    embedded: Embedded<'s>,
    this: v8::Local<'s, v8::Value>,
    sims_state: HashMap<SimulationShortId, SimState>,
}

struct SimState {
    agent_schema: Arc<Schema>,
    msg_schema: Arc<Schema>,
}

impl<'s> ThreadLocalRunner<'s> {
    pub fn new(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
        init: &ExperimentInitRunnerMsg,
    ) -> JSRunnerResult<Self> {
        let embedded = Embedded::import(scope, context)?;
        let datasets = Self::load_datasets(scope, &init.shared_context)?;

        let pkg_config = &init.package_config.0;
        let pkg_fns = v8::Array::new(scope, pkg_config.len() as i32);
        let pkg_init_msgs = v8::Array::new(scope, pkg_config.len() as i32);
        for (i_pkg, pkg_init) in pkg_config.values().enumerate() {
            let i_pkg = i_pkg as u32;

            let pkg_name = format!("{}", &pkg_init.name);
            let pkg = JsPackage::import(scope, context, &embedded, &pkg_name, pkg_init.r#type)?;
            tracing::trace!(
                "pkg experiment init name {:?}, type {}, fns {:?}",
                &pkg_init.name,
                &pkg_init.r#type.as_str(),
                &pkg.fns,
            );
            pkg_fns
                .set_index(scope, i_pkg, pkg.fns.into())
                .ok_or_else(|| {
                    JSRunnerError::V8(format!("Could not set index {i_pkg} on pkg_fns array"))
                })?;

            let pkg_init = serde_json::to_string(&pkg_init).unwrap();
            let pkg_init = new_js_string(scope, &pkg_init)?;
            pkg_init_msgs
                .set_index(scope, i_pkg, pkg_init.into())
                .ok_or_else(|| {
                    JSRunnerError::V8(format!(
                        "Could not set index {i_pkg} on pkg_init_msgs array"
                    ))
                })?;
        }

        let this = v8::Object::new(scope);
        let args = &[datasets, pkg_init_msgs.into(), pkg_fns.into()];
        embedded
            .start_experiment
            .call(scope, this.into(), args)
            .ok_or_else(|| JSRunnerError::V8("Could not call start_experiment".to_string()))?;

        Ok(ThreadLocalRunner {
            embedded,
            this: this.into(),
            sims_state: HashMap::new(),
        })
    }

    fn load_datasets(
        scope: &mut v8::HandleScope<'s>,
        shared_ctx: &SharedStore,
    ) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
        let js_datasets = v8::Object::new(scope);
        for (dataset_name, dataset) in shared_ctx.datasets.iter() {
            let js_name = new_js_string(scope, &dataset_name)?;

            let json = dataset.data();
            // TODO: Use `from_utf8_unchecked` instead here?
            //       (Since datasets' json can be quite large.)
            let json = std::str::from_utf8(json)
                .map_err(|_| JSRunnerError::Unique("Dataset not utf8".into()))?;
            let json = new_js_string(scope, json)?;

            js_datasets
                .set(scope, js_name.into(), json.into())
                .ok_or_else(|| JSRunnerError::V8("Could not set property on Object".to_string()))?;
        }

        Ok(js_datasets.into())
    }

    pub fn handle_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> JSRunnerResult<bool> {
        match msg {
            InboundToRunnerMsgPayload::TerminateRunner => {
                tracing::debug!("Stopping execution on Javascript runner");
                return Ok(false); // Don't continue running.
            }
            InboundToRunnerMsgPayload::NewSimulationRun(new_run) => {
                // TODO: `short_id` doesn't need to be inside `new_run`, since
                //       it's already passed separately to the runner.
                self.start_sim(scope, new_run)?;
            }
            InboundToRunnerMsgPayload::TerminateSimulationRun => {
                let sim_id = sim_id.ok_or(JSRunnerError::SimulationIdRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(JSRunnerError::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(JSRunnerError::SimulationIdRequired("state sync"))?;
                self.state_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(JSRunnerError::SimulationIdRequired("interim sync"))?;
                self.state_interim_sync(scope, sim_id, &interim_msg.shared_store)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id = sim_id.ok_or(JSRunnerError::SimulationIdRequired("snapshot sync"))?;
                self.state_snapshot_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id =
                    sim_id.ok_or(JSRunnerError::SimulationIdRequired("context batch sync"))?;
                self.ctx_batch_sync(scope, sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(JSRunnerError::SimulationIdRequired("run task"))?;
                self.handle_task_msg(scope, sim_id, msg, outbound_sender)?;
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {}
        }

        Ok(true) // Continue running.
    }

    /// Sim start:
    ///  - Hard-coded engine init
    ///  - Sim-level init of step packages (context, state, output)
    ///  - Run init packages (e.g. init.js)
    ///      - init.js can depend on globals, which vary between sim runs, so it has to be executed
    ///        at the start of a sim run, not at the start of the experiment run.
    fn start_sim(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        run: NewSimulationRun,
    ) -> JSRunnerResult<()> {
        // Initialize JS.

        // Passing in schemas with an immutable reference is allowed,
        // and getting a `*mut` to them is also allowed, but if Javascript
        // *actually* mutates the contents of a schema, it will cause
        // undefined behavior, because the pointer to the schema comes from
        // an immutable reference.
        // ---> Do *not* mutate the schema bytes in `runner.js`.
        let agent_schema_bytes = schema_to_stream_bytes(&run.datastore.agent_batch_schema.arrow);
        let msg_schema_bytes = schema_to_stream_bytes(&run.datastore.message_batch_schema);
        let ctx_schema_bytes = schema_to_stream_bytes(&run.datastore.context_batch_schema);
        // run.shared_context.datasets?

        // Keep schema vecs alive while bytes are passed to V8.
        let agent_schema_bytes = bytes_to_js(scope, &agent_schema_bytes);
        let msg_schema_bytes = bytes_to_js(scope, &msg_schema_bytes);
        let ctx_schema_bytes = bytes_to_js(scope, &ctx_schema_bytes);

        let pkg_ids = v8::Array::new(scope, run.packages.0.len() as i32);
        let pkg_msgs = v8::Array::new(scope, run.packages.0.len() as i32);
        for (i_pkg, (pkg_id, pkg_msg)) in run.packages.0.iter().enumerate() {
            let i_pkg = i_pkg as u32;
            let js_pkg_id = pkg_id_to_js(scope, *pkg_id);
            pkg_ids
                .set_index(scope, i_pkg, js_pkg_id)
                .ok_or_else(|| format!("Could not set pkg_ids at index {i_pkg}"))?;
            let payload = serde_json::to_string(&pkg_msg.payload).unwrap();
            let payload = new_js_string(scope, &payload)?.into();
            pkg_msgs
                .set_index(scope, i_pkg, payload)
                .ok_or_else(|| format!("Could not set pkg_msgs at index {i_pkg}"))?;
        }

        let globals: &Globals = &run.globals;
        let globals = serde_json::to_string(globals).unwrap();
        let globals = new_js_string(scope, &globals)?;

        let js_sim_id = sim_id_to_js(scope, run.short_id);
        self.embedded
            .start_sim
            .call(scope, self.this, &[
                js_sim_id,
                agent_schema_bytes,
                msg_schema_bytes,
                ctx_schema_bytes,
                pkg_ids.into(),
                pkg_msgs.into(),
                globals.into(),
            ])
            .ok_or_else(|| JSRunnerError::V8("Could not run start_sim Function".to_string()))?;

        // Initialize Rust.
        let state = SimState {
            agent_schema: Arc::clone(&run.datastore.agent_batch_schema.arrow),
            msg_schema: Arc::clone(&run.datastore.message_batch_schema),
        };
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| JSRunnerError::DuplicateSimulationRun(run.short_id))?;

        Ok(())
    }

    fn state_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        msg: WaitableStateSync,
    ) -> JSRunnerResult<()> {
        // TODO: Technically this might violate Rust's aliasing rules, because
        //       at this point, the state batches are immutable, but we pass
        //       pointers to them into V8 that can later to be used to mutate
        //       them (because later we can guarantee that nothing else is reading
        //       state in parallel with the mutation through those pointers).

        // Sync JS.
        let agent_pool = msg.state_proxy.agent_proxies.batches_iter();
        let msg_pool = msg.state_proxy.message_proxies.batches_iter();
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_pool, msg_pool) = state_to_js(scope, agent_pool, msg_pool)?;
        let js_sim_id = sim_id_to_js(scope, sim_run_id);
        self.embedded
            .state_sync
            .call(scope, self.this, &[js_sim_id, agent_pool, msg_pool])
            .ok_or_else(|| "Could not run state_sync Function".to_string())?;

        tracing::trace!("Sending state sync completion");
        msg.completion_sender.send(Ok(())).map_err(|e| {
            JSRunnerError::from(format!(
                "Couldn't send state sync completion to worker: {:?}",
                e
            ))
        })?;
        tracing::trace!("Sent state sync completion");

        Ok(())
    }

    fn state_snapshot_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        msg: StateSync,
    ) -> JSRunnerResult<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = state_to_js(scope, agent_pool, msg_pool)?;
        let sim_run_id = sim_id_to_js(scope, sim_run_id);
        self.embedded
            .state_snapshot_sync
            .call(scope, self.this, &[sim_run_id, agent_pool, msg_pool])
            .ok_or_else(|| "Could not run state_snapshot_sync Function".to_string())?;

        // State snapshots are part of context, not state, so don't need to
        // sync Rust state pools.
        Ok(())
    }

    fn ctx_batch_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        ctx_batch_sync: ContextBatchSync,
    ) -> JSRunnerResult<()> {
        let ContextBatchSync {
            context_batch,
            current_step,
            state_group_start_indices,
        } = ctx_batch_sync;

        let js_sim_id = sim_id_to_js(scope, sim_run_id);
        let js_batch_id = batch_to_js(
            scope,
            context_batch.segment().memory(),
            context_batch.segment().persisted_metaversion(),
        )?;
        let js_idxs = idxs_to_js(scope, &state_group_start_indices)?;
        let js_current_step = current_step_to_js(scope, current_step);
        self.embedded
            .ctx_batch_sync
            .call(scope, self.this, &[
                js_sim_id,
                js_batch_id,
                js_idxs,
                js_current_step,
            ])
            .ok_or_else(|| "Could not run ctx_batch_sync Function".to_string())?;

        Ok(())
    }

    // TODO: DOC
    fn handle_task_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> JSRunnerResult<()> {
        tracing::debug!("Starting state interim sync before running task");
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(scope, sim_id, &msg.shared_store)?;

        tracing::debug!("Setting up run_task function call");

        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                JSRunnerError::from(format!("Failed to extract the inner task message: {err}"))
            })?;
        let payload_str = new_js_string(scope, &serde_json::to_string(&payload)?)?;
        let group_index = match msg.group_index {
            None => v8::undefined(scope).into(),
            Some(val) => v8::Number::new(scope, val as f64).into(),
        };

        let js_sim_id = sim_id_to_js(scope, sim_id);
        let js_pkg_id = pkg_id_to_js(scope, msg.package_id);
        let run_task_result = self.run_task(
            scope,
            &[js_sim_id, group_index, js_pkg_id, payload_str.into()],
            sim_id,
            msg.group_index,
            msg.package_id,
            msg.task_id,
            &wrapper,
            msg.shared_store,
        );

        match run_task_result {
            Ok((next_task_msg, warnings, logs)) => {
                // TODO: `send` fn to reduce code duplication.
                outbound_sender.send(OutboundFromRunnerMsg {
                    span: Span::current(),
                    source: Language::JavaScript,
                    sim_id,
                    payload: OutboundFromRunnerMsgPayload::TaskMsg(next_task_msg),
                })?;
                if let Some(warnings) = warnings {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::UserWarnings(warnings),
                    })?;
                }
                if let Some(logs) = logs {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::RunnerLogs(logs),
                    })?;
                }
            }
            Err(error) => {
                // UserErrors and PackageErrors are not fatal to the Runner
                if let JSRunnerError::User(errors) = error {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::UserErrors(errors),
                    })?;
                } else if let JSRunnerError::Package(package_error) = error {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::PackageError(package_error),
                    })?;
                } else {
                    // All other types of errors are fatal.
                    return Err(error);
                }
            }
        };

        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationShortId,
        shared_store: &TaskSharedStore,
    ) -> JSRunnerResult<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = batches_from_shared_store(shared_store)?;
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) =
            state_to_js(scope, agent_batches.into_iter(), msg_batches.into_iter())?;

        let js_sim_id = sim_id_to_js(scope, sim_id);
        let js_idxs = idxs_to_js(scope, &group_indices)?;
        self.embedded
            .state_interim_sync
            .call(scope, self.this, &[
                js_sim_id,
                js_idxs,
                agent_batches,
                msg_batches,
            ])
            .ok_or_else(|| {
                JSRunnerError::V8("Could not call state_interim_sync Function".to_string())
            })?;

        Ok(())
    }

    /// Runs a task on JavaScript with the provided simulation id.
    ///
    /// Returns the next task ([`TargetedRunnerTaskMsg`]) and, if present, warnings
    /// ([`RunnerError`]) and logging statements.
    ///
    /// # Errors
    ///
    /// May return an error if:
    ///
    /// - a value from Javascript could not be parsed,
    /// - the task errored, or
    /// - the state could not be flushed to the datastore.
    #[allow(clippy::too_many_arguments)]
    fn run_task(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        args: &[v8::Local<'s, v8::Value>],
        sim_id: SimulationShortId,
        group_index: Option<usize>,
        package_id: PackageId,
        task_id: TaskId,
        wrapper: &serde_json::Value,
        mut shared_store: TaskSharedStore,
    ) -> JSRunnerResult<(
        TargetedRunnerTaskMsg,
        Option<Vec<UserWarning>>,
        Option<Vec<String>>,
    )> {
        tracing::debug!("Calling JS run_task");
        let return_val: v8::Local<'s, v8::Value> = self
            .embedded
            .run_task
            .call(scope, self.this, args)
            .ok_or_else(|| JSRunnerError::V8("Could not run run_task Function".to_string()))?;
        let return_val = return_val.to_object(scope).ok_or_else(|| {
            JSRunnerError::V8("Could not convert return_val from Value to Object".to_string())
        })?;

        tracing::debug!("Post-processing run_task result");
        if let Some(error) = get_js_error(scope, return_val) {
            return Err(error);
        }
        let user_warnings = get_user_warnings(scope, return_val)?;
        let logs = get_print(scope, return_val)?;
        let (next_target, next_task_payload) = get_next_task(scope, return_val)?;

        let next_inner_task_msg: serde_json::Value = serde_json::from_str(&next_task_payload)?;
        let next_task_payload =
            TaskMessage::try_from_inner_msg_and_wrapper(next_inner_task_msg, wrapper.clone())
                .map_err(|err| {
                    JSRunnerError::from(format!(
                        "Failed to wrap and create a new TaskMessage, perhaps the inner: \
                         {next_task_payload}, was formatted incorrectly. Underlying error: {err}"
                    ))
                })?;

        // Only flushes if state writable
        self.flush(scope, sim_id, &mut shared_store, return_val)?;

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMsg {
                package_id,
                task_id,
                group_index,
                shared_store,
                payload: next_task_payload,
            },
        };

        Ok((next_task_msg, user_warnings, logs))
    }

    fn flush(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        shared_store: &mut TaskSharedStore,
        return_val: v8::Local<'s, v8::Object>,
    ) -> JSRunnerResult<()> {
        let (proxy, group_indices) = match &mut shared_store.state {
            SharedState::None | SharedState::Read(_) => return Ok(()),
            SharedState::Write(state) => {
                let indices = (0..state.agent_pool().len()).collect();
                (state, indices)
            }
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Read(_) => return Ok(()),
                PartialSharedState::Write(state) => {
                    let indices = state.group_indices.clone();
                    (&mut state.state_proxy, indices)
                }
            },
        };

        let state = self
            .sims_state
            .get(&sim_run_id)
            .ok_or(JSRunnerError::MissingSimulationRun(sim_run_id))?;
        // Assuming cloning an Arc once is faster than looking up `state` in
        // the `sims_state` HashMap in every `flush_group` call.
        let agent_schema = state.agent_schema.clone();
        let msg_schema = state.msg_schema.clone();

        let changes = new_js_string(scope, "changes")?;

        let changes = return_val.get(scope, changes.into()).ok_or_else(|| {
            JSRunnerError::V8("Could not get changes property on return_val".to_string())
        })?;

        if group_indices.len() == 1 {
            self.flush_group(scope, &agent_schema, &msg_schema, proxy, 0, changes)?;
        } else {
            let changes: v8::Local<'s, v8::Array> = changes.try_into().unwrap();
            for i_proxy in 0..group_indices.len() {
                // In principle, `i_proxy` and `group_indices[i_proxy]` can differ.
                let group_changes = changes.get_index(scope, i_proxy as u32).ok_or_else(|| {
                    JSRunnerError::V8(format!("Could not access index {i_proxy} on changes"))
                })?;

                self.flush_group(
                    scope,
                    &agent_schema,
                    &msg_schema,
                    proxy,
                    i_proxy,
                    group_changes,
                )?;
            }
        }

        Ok(())
    }

    fn flush_group(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        agent_schema: &Arc<Schema>,
        msg_schema: &Arc<Schema>,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: v8::Local<'s, v8::Value>,
    ) -> JSRunnerResult<()> {
        let changes = changes.to_object(scope).unwrap();

        let agent = new_js_string(scope, "agent")?;

        let agent_changes: v8::Local<'s, v8::Array> = changes
            .get(scope, agent.into())
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get agent property on changes".to_string())
            })?
            .try_into()
            .map_err(|err| {
                JSRunnerError::V8(format!(
                    "Could not convert agent_changes from Value to Array, {err}"
                ))
            })?;

        self.flush_batch(
            scope,
            agent_changes,
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access batch at index {i_proxy}"))?
                .batch,
            agent_schema,
        )?;

        let msg = new_js_string(scope, "msg")?;

        let msg_changes = changes
            .get(scope, msg.into())
            .ok_or_else(|| JSRunnerError::V8("Could not get msg property on changes".to_string()))?
            .try_into()
            .map_err(|err| {
                JSRunnerError::V8(format!(
                    "Could not convert msg_changes from Value to Array, {err}"
                ))
            })?;
        self.flush_batch(
            scope,
            msg_changes,
            &mut state_proxy
                .message_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access batch at index {i_proxy}"))?
                .batch,
            msg_schema,
        )?;

        Ok(())
    }

    fn flush_batch(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        changes: v8::Local<'s, v8::Array>,
        batch: &mut ArrowBatch,
        schema: &Schema,
    ) -> JSRunnerResult<()> {
        for i in 0..changes.length() {
            let change = changes.get_index(scope, i as u32).ok_or_else(|| {
                JSRunnerError::V8(format!("Could not access index {i} on changes"))
            })?;
            let change = change.to_object(scope).ok_or_else(|| {
                JSRunnerError::V8("Could not convert change from Value to Object".to_string())
            })?;

            let i_field = new_js_string(scope, "i_field")?;

            let i_field: v8::Local<'s, v8::Number> = change
                .get(scope, i_field.into())
                .ok_or_else(|| {
                    JSRunnerError::V8("Could not get i_field property on change".to_string())
                })?
                .try_into()
                .map_err(|err| {
                    JSRunnerError::V8(format!(
                        "Could not convert i_field from Value to Number: {err}"
                    ))
                })?;

            let i_field = i_field.value() as usize;
            let field = schema.field(i_field);

            let data = new_js_string(scope, "data")?;

            let data = change.get(scope, data.into()).ok_or_else(|| {
                JSRunnerError::V8("Could not get data property on change".to_string())
            })?;
            let data = self.array_data_from_js(scope, data, field.data_type(), None)?;

            batch.queue_change(ColumnChange {
                data,
                index: i_field,
            })?;
        }

        // TODO: `flush_changes` automatically reloads memory and record batch
        //       and respectively increments memory and batch versions if
        //       necessary, but JS doesn't need the record batch in the native
        //       Rust format. Could instead reload only memory and leave the
        //       batch version unchanged.
        batch.flush_changes()?;

        Ok(())
    }

    /// TODO: DOC, flushing from a single column
    fn array_data_from_js(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        data: v8::Local<'s, v8::Value>,
        data_type: &DataType,
        len: Option<usize>,
    ) -> JSRunnerResult<ArrayData> {
        // `data` must not be dropped until flush is over, because
        // pointers returned from FFI point inside `data`'s ArrayBuffers' memory.
        let obj = data.to_object(scope).ok_or_else(|| {
            JSRunnerError::Embedded(format!("Flush data not object for field {:?}", data_type))
        })?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data = data_node_from_js(scope, data)?;

        // The JS Arrow implementation tries to be efficient with the allocation of the values
        // buffers. If you have a null value at the end, it doesn't always allocate that
        // within the buffer. Rust expects that to be explicitly there though, so there's a
        // mismatch in the expected lengths. `target_len` is the number of elements the Rust
        // implementation of Arrow expects in the resulting `ArrayData`.
        //
        // Example:
        // Considering a column of fixed-size-lists with two elements each: [[1, 2], [3, 4], null]
        // JavaScript will only provide a value-array for the child data containing [1, 2, 3, 4]
        // (data.len == 4), but Rust expects it to be [1, 2, 3, 4, ?, ?] (target_len == 6) where `?`
        // means an unspecified value. We read [1, 2, 3, 4] from the JS data by using `data.len` and
        // then resize the buffer to `target_len`.
        let target_len = len.unwrap_or(data.len);

        let mut builder = ArrayData::builder(data_type.clone());

        match data_type {
            DataType::Boolean => unsafe {
                // SAFETY: `data` is provided by arrow
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `Boolean` (`buffers[0]`) is null"
                );
                builder = builder.add_buffer(self.read_boolean_buffer(
                    NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8),
                    data.len,
                    data.buffer_capacities[0],
                    target_len,
                ));
            },
            DataType::UInt16 => unsafe {
                // SAFETY: `data` is provided by arrow and the type is `u16`
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `UInt16` (`buffers[0]`) is null"
                );
                builder = builder.add_buffer(self.read_primitive_buffer(
                    NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<u16>(),
                    data.len,
                    data.buffer_capacities[0],
                    target_len,
                ))
            },
            DataType::UInt32 => unsafe {
                // SAFETY: `data` is provided by arrow and the type is `u32`
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `UInt32` (`buffers[0]`) is null"
                );
                builder = builder.add_buffer(self.read_primitive_buffer(
                    NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<u32>(),
                    data.len,
                    data.buffer_capacities[0],
                    target_len,
                ))
            },
            DataType::Float64 => unsafe {
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `Float64` (`buffers[0]`) is null"
                );
                // SAFETY: `data` is provided by arrow and the type is `f64`
                builder = builder.add_buffer(self.read_primitive_buffer(
                    NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<f64>(),
                    data.len,
                    data.buffer_capacities[0],
                    target_len,
                ))
            },
            DataType::Utf8 => {
                // Utf8 is stored in two buffers:
                //   [0]: The offset buffer (i32)
                //   [1]: The value buffer (u8)

                // SAFETY: Offset `data` is provided by arrow.
                let (offset_buffer, last_offset) = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `Utf8` (`buffers[0]`) is null"
                    );
                    self.read_offset_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<i32>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    )
                };
                builder = builder.add_buffer(offset_buffer);

                // SAFETY: `data` is provided by arrow, the length is provided by `offsets`, and the
                //   type for strings is `u8`
                unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[1].is_null(),
                        "Required pointer for `Utf8` (`buffers[1]`) is null"
                    );
                    builder = builder.add_buffer(self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[1] as *mut u8),
                        last_offset,
                        data.buffer_capacities[1],
                        last_offset,
                    ));
                };
            }
            DataType::List(inner_field) => {
                // List is stored in one buffer and child data containing the indexed values:
                //   buffer: The offset buffer (i32)
                //   child_data: The value data

                // SAFETY: Offset `data` is provided by arrow.
                let (offset_buffer, last_offset) = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `List` (`buffers[0]`) is null"
                    );
                    self.read_offset_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<i32>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    )
                };
                builder = builder.add_buffer(offset_buffer);

                let child_data = new_js_string(scope, "child_data")?;

                let child_data: v8::Local<'s, v8::Array> = obj
                    .get(scope, child_data.into())
                    .ok_or_else(|| {
                        JSRunnerError::V8("Could not get child_data property on obj".to_string())
                    })?
                    .try_into()
                    .map_err(|err| {
                        JSRunnerError::V8(format!(
                            "Could not convert child_data from Value to Array: {err}"
                        ))
                    })?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    JSRunnerError::V8("Could not access index 0 on child_data".to_string())
                })?;
                builder = builder.add_child_data(self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(last_offset),
                )?);
            }
            DataType::FixedSizeList(inner_field, size) => {
                let child_data = new_js_string(scope, "child_data")?;
                // FixedSizeListList is only stored by child data, as offsets are not required
                // because the size is known.
                let child_data: v8::Local<'s, v8::Array> = obj
                    .get(scope, child_data.into())
                    .ok_or_else(|| {
                        JSRunnerError::V8("Could not get child_data property on obj".to_string())
                    })?
                    .try_into()
                    .map_err(|err| {
                        JSRunnerError::V8(format!(
                            "Could not convert child_data from Value to Array: {err}"
                        ))
                    })?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    JSRunnerError::V8("Could not access index 0 on child_data".to_string())
                })?;
                builder = builder.add_child_data(self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(*size as usize * target_len),
                )?);
            }
            DataType::Struct(inner_fields) => {
                let child_data = new_js_string(scope, "child_data")?;
                // Structs are only defined by child data
                let child_data: v8::Local<'s, v8::Array> = obj
                    .get(scope, child_data.into())
                    .ok_or_else(|| {
                        JSRunnerError::V8("Could not get child_data property on obj".to_string())
                    })?
                    .try_into()
                    .map_err(|err| {
                        JSRunnerError::V8(format!(
                            "Could not convert child_data from Value to Array: {err}"
                        ))
                    })?;
                debug_assert_eq!(
                    child_data.length() as usize,
                    inner_fields.len(),
                    "Number of fields provided by JavaScript does not match expected number of \
                     fields"
                );
                for (i, inner_field) in (0..child_data.length()).zip(inner_fields) {
                    let child = child_data.get_index(scope, i as u32).ok_or_else(|| {
                        JSRunnerError::V8(format!("Could not access index {i} on child_data"))
                    })?;
                    builder = builder.add_child_data(self.array_data_from_js(
                        scope,
                        child,
                        inner_field.data_type(),
                        Some(target_len),
                    )?);
                }
            }
            DataType::FixedSizeBinary(size) => {
                // FixedSizeBinary is only stored as a buffer (u8), offsets are not required because
                // the size is known

                // SAFETY: `data` is provided by arrow
                unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `FixedSizeBinary` (`buffers[0]`) is null"
                    );
                    builder = builder.add_buffer(self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8),
                        *size as usize * data.len,
                        data.buffer_capacities[0],
                        *size as usize * target_len,
                    ));
                };
            }
            data_type => return Err(JSRunnerError::FlushType(data_type.clone())), /* TODO: More
                                                                                   * types? */
        };

        builder = builder.len(target_len);
        if let Some(null_bits_ptr) = NonNull::new(data.null_bits_ptr as *mut u8) {
            // SAFETY: null-bits are provided by arrow
            let null_bit_buffer = unsafe {
                self.read_boolean_buffer(
                    null_bits_ptr,
                    data.len,
                    data.null_bits_capacity,
                    target_len,
                )
            };

            // The `data.null_count` provided is only valid for `data.len`, as the buffer is
            // resized to `target_len`, the `null_count` has to be adjusted.
            builder = builder
                .null_bit_buffer(null_bit_buffer)
                .null_count(data.null_count + target_len - data.len);
        }

        // TODO: OPTIM: skip validation within `build()` for non-debug builds
        Ok(builder.build()?)
    }

    /// Creates a new packed buffer from the provided `data_ptr` and `data_capacity` with at least
    /// `data_len` elements copied from `data_ptr` and a size of `target_len` elements.
    ///
    /// # SAFETY
    ///
    /// - `data_ptr` must be valid for `ceil(data_len/8)` reads of `u8`
    unsafe fn read_boolean_buffer(
        &self,
        data_ptr: NonNull<u8>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> Buffer {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` <= `data_capacity` and constructing it from raw
        //   parts.
        // Create a buffer for `target_len` elements
        let mut builder = BooleanBufferBuilder::new(target_len);

        // Read data from JS
        builder.append_packed_range(
            0..data_len,
            slice::from_raw_parts(data_ptr.as_ptr(), bit_util::ceil(data_len, 8)),
        );
        builder.resize(target_len);
        builder.finish()
    }

    /// Creates a new buffer from the provided `data_ptr` and `data_capacity` with at least
    /// `data_len` elements copied from `data_ptr` and a size of `target_len` elements.
    ///
    /// # SAFETY
    ///
    /// - `data_ptr` must be valid for `data_len` reads of `T`
    unsafe fn read_primitive_buffer<T: ArrowNativeType>(
        &self,
        data_ptr: NonNull<T>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> Buffer {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` >= `data_capacity` and constructing it from raw
        //   parts.
        // Create a buffer for `target_len` elements
        let mut builder = BufferBuilder::new(target_len);

        // Read data from JS
        builder.append_slice(slice::from_raw_parts(data_ptr.as_ptr(), data_len));

        // Ensure we don't subtract a larger unsigned number from a smaller
        // TODO: Use `buffer.resize()` instead of `builder.advance()`
        debug_assert!(
            target_len >= data_len,
            "Expected length is smaller than the actual length for buffer: {:?}",
            slice::from_raw_parts(data_ptr.as_ptr(), data_len)
        );
        builder.advance(target_len - data_len);
        builder.finish()
    }

    /// Creates a new offset buffer from the provided `data_ptr` and `data_capacity` with at least a
    /// with `data_len` elements copied from `ptr` and a size of `target_len` elements.
    ///
    /// Returns the buffer and the last offset.
    ///
    /// # SAFETY
    ///
    /// - `ptr` must be valid for `data_len + 1` reads of `i32`
    unsafe fn read_offset_buffer(
        &self,
        data_ptr: NonNull<i32>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> (Buffer, usize) {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` <= `data_capacity` and constructing it from raw
        //   parts.

        // For each value in the buffer, we have a start offset and an end offset. The start offset
        // is equal to the end offset of the previous value, thus we need `num_values + 1`
        // offset values.
        let mut builder = BufferBuilder::new(target_len + 1);

        let offsets = slice::from_raw_parts(data_ptr.as_ptr(), data_len + 1);
        debug_assert_eq!(offsets[0], 0, "Offset buffer does not start with `0`");
        debug_assert!(
            offsets.iter().all(|o| *o >= 0),
            "Offset buffer contains negative values"
        );
        debug_assert!(offsets.is_sorted(), "Offsets are not ordered");

        // Read data from JS
        builder.append_slice(offsets);

        let last = offsets[data_len];

        // Ensure we don't subtract a larger unsigned number from a smaller
        // TODO: Use `buffer.resize()` instead of `builder.append_n()`
        debug_assert!(
            target_len >= data_len,
            "Expected offset count is smaller than the actual buffer: {:?}",
            slice::from_raw_parts(data_ptr.as_ptr(), data_len + 1)
        );
        builder.append_n(target_len - data_len, last);
        (builder.finish(), last as usize)
    }
}

/// Embedded JS of runner itself (from hardcoded paths)
struct Embedded<'s> {
    hash_stdlib: v8::Local<'s, v8::Value>,
    hash_util: v8::Local<'s, v8::Value>,

    start_experiment: v8::Local<'s, v8::Function>,
    start_sim: v8::Local<'s, v8::Function>,
    run_task: v8::Local<'s, v8::Function>,
    ctx_batch_sync: v8::Local<'s, v8::Function>,
    state_sync: v8::Local<'s, v8::Function>,
    state_interim_sync: v8::Local<'s, v8::Function>,
    state_snapshot_sync: v8::Local<'s, v8::Function>,
}

impl<'s> Embedded<'s> {
    fn import(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
    ) -> JSRunnerResult<Self> {
        let arrow = eval_file(
            scope,
            "./src/worker/runner/javascript/apache-arrow-bundle.js",
        )?;
        let hash_stdlib = eval_file(scope, "./src/worker/runner/javascript/hash_stdlib.js")?;
        let hash_util = import_file(
            scope,
            context,
            "./src/worker/runner/javascript/hash_util.js",
            &[arrow],
        )?;
        let batches_prototype = import_file(
            scope,
            context,
            "./src/worker/runner/javascript/batch.js",
            &[arrow, hash_util],
        )?;

        let ctx_import = import_file(
            scope,
            context,
            "./src/worker/runner/javascript/context.js",
            &[hash_util],
        )?;
        let ctx_import: v8::Local<'_, v8::Array> = ctx_import.try_into().map_err(|e| {
            JSRunnerError::FileImport(
                "./src/worker/runner/javascript/context.js".to_string(),
                format!("Couldn't get array (of functions) from 'context.js': {e}"),
            )
        })?;
        let experiment_ctx_prototype = ctx_import.get_index(scope, 0).ok_or_else(|| {
            JSRunnerError::V8("Could not get index 0 from context.js array".to_string())
        })?;
        let sim_init_ctx_prototype = ctx_import.get_index(scope, 1).ok_or_else(|| {
            JSRunnerError::V8("Could not get index 1 from context.js array".to_string())
        })?;
        let gen_ctx = ctx_import.get_index(scope, 2).ok_or_else(|| {
            JSRunnerError::V8("Could not get index 2 from context.js array".to_string())
        })?;

        let gen_state = import_file(
            scope,
            context,
            "./src/worker/runner/javascript/state.js",
            &[hash_util],
        )?;
        let fns = import_file(
            scope,
            context,
            "./src/worker/runner/javascript/runner.js",
            &[
                arrow,
                batches_prototype,
                experiment_ctx_prototype,
                sim_init_ctx_prototype,
                gen_ctx,
                gen_state,
            ],
        )?;
        let fns: v8::Local<'_, v8::Array> = fns.try_into().map_err(|e| {
            JSRunnerError::FileImport(
                "./src/worker/runner/javascript/runner.js".into(),
                format!("Couldn't get array (of functions) from 'runner.js': {e}"),
            )
        })?;

        let start_experiment: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 0)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 0 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 0 in runner.js as a function: {e}"
                ))
            })?;
        let start_sim: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 1)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 1 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 1 in runner.js as a function: {e}"
                ))
            })?;
        let run_task: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 2)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 2 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 2 in runner.js as a function: {e}"
                ))
            })?;
        let ctx_batch_sync: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 3)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 3 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 3 in runner.js as a function: {e}"
                ))
            })?;
        let state_sync: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 4)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 4 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 4 in runner.js as a function: {e}"
                ))
            })?;
        let state_interim_sync: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 5)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 5 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 5 in runner.js as a function: {e}"
                ))
            })?;
        let state_snapshot_sync: v8::Local<'_, v8::Function> = fns
            .get_index(scope, 6)
            .ok_or_else(|| {
                JSRunnerError::V8("Could not get index 6 from runner.js array".to_string())
            })?
            .try_into()
            .map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert value at index 6 in runner.js as a function: {e}"
                ))
            })?;

        Ok(Embedded {
            hash_stdlib,
            hash_util,
            start_experiment,
            start_sim,
            run_task,
            ctx_batch_sync,
            state_sync,
            state_interim_sync,
            state_snapshot_sync,
        })
    }
}

struct JsPackage<'s> {
    fns: v8::Local<'s, v8::Array>,
}

/// TODO: DOC add docstrings on impl'd methods
impl<'s> JsPackage<'s> {
    fn import(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
        embedded: &Embedded<'s>,
        name: &str,
        pkg_type: PackageType,
    ) -> JSRunnerResult<Self> {
        let path = get_pkg_path(name, pkg_type);
        tracing::debug!("Importing package from path `{}`", &path);
        let code = match fs::read_to_string(path.clone()) {
            Ok(s) => s,
            Err(_) => {
                tracing::debug!("Couldn't read package file. It might intentionally not exist.");
                // Packages don't have to use JS.
                let fns = v8::Array::new(scope, 3);
                let undefined = v8::undefined(scope).into();
                fns.set_index(scope, 0, undefined).ok_or_else(|| {
                    JSRunnerError::V8("Could not create Undefined value".to_string())
                })?;
                fns.set_index(scope, 1, undefined).ok_or_else(|| {
                    JSRunnerError::V8("Could not create Undefined value".to_string())
                })?;
                fns.set_index(scope, 2, undefined).ok_or_else(|| {
                    JSRunnerError::V8("Could not create Undefined value".to_string())
                })?;

                return Ok(JsPackage { fns });
            }
        };

        // Avoid JS ReferenceError by wrapping potentially undeclared variables with `typeof`.
        // Double braces like `{{` are Rust's escape string for a single literal `{`.
        let wrapped_code = new_js_string(
            scope,
            &format!(
                "((hash_util, hash_stdlib) => {{
                    {code}
                    return [
                        typeof start_experiment === 'undefined' ? undefined : start_experiment,
                        typeof start_sim === 'undefined' ? undefined : start_sim,
                        typeof run_task === 'undefined' ? undefined : run_task
                    ]
                }})",
            ),
        )?;

        let pkg: v8::Local<'_, v8::Function> = {
            let pkg = v8::Script::compile(scope, wrapped_code, None).ok_or_else(|| {
                JSRunnerError::V8("Could not create wrapped code scipt".to_string())
            })?;
            let pkg = pkg.run(scope).ok_or_else(|| {
                JSRunnerError::V8("Could not execute wrapped code script".to_string())
            })?;

            pkg.try_into().map_err(|e| {
                JSRunnerError::V8(format!("Could not convert wrapped code to Function: {e}"))
            })?
        };

        let args = &[embedded.hash_util, embedded.hash_stdlib];
        let fns: v8::Local<'_, v8::Array> = {
            let global_context = context.global(scope);
            let fns = pkg
                .call(scope, global_context.into(), args)
                .ok_or_else(|| {
                    JSRunnerError::PackageImport(
                        path.clone(),
                        "Could not run wrapped code function".to_string(),
                    )
                })?;

            fns.try_into().map_err(|e| {
                JSRunnerError::V8(format!(
                    "Could not convert wrapped code return value to Array: {e}"
                ))
            })?
        };

        if fns.length() != 3 {
            return Err(JSRunnerError::PackageImport(
                path.clone(),
                "Stray return".into(),
            ));
        }

        // Validate returned array.
        let fn_names = ["start_experiment", "start_sim", "run_task"];
        for (i, fn_name) in (0..fns.length()).zip(fn_names) {
            let elem: v8::Local<'_, v8::Value> = fns.get_index(scope, i).ok_or_else(|| {
                JSRunnerError::PackageImport(path.clone(), format!("Couldn't index array: {:?}", i))
            })?;

            if !(elem.is_function() || elem.is_undefined()) {
                return Err(JSRunnerError::PackageImport(
                    path.clone(),
                    format!("{} should be a function, not {:?}", fn_name, elem),
                ));
            }
        }

        Ok(JsPackage { fns })
    }
}

/// Helper function to create a [v8::String]
fn new_js_string<'s>(
    scope: &mut v8::HandleScope<'s>,
    s: impl AsRef<str>,
) -> JSRunnerResult<v8::Local<'s, v8::String>> {
    let s = s.as_ref();
    v8::String::new(scope, s)
        .ok_or_else(|| JSRunnerError::V8(format!("Could not create String: {s}")))
}

fn get_pkg_path(name: &str, pkg_type: PackageType) -> String {
    format!(
        "./src/simulation/package/{}/packages/{}/package.js",
        pkg_type.as_str(),
        name
    )
}

fn eval_file<'s>(
    scope: &mut v8::HandleScope<'s>,
    path: &str,
) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
    let source_code = read_file(path)?;
    let js_source_code = new_js_string(scope, &source_code)?;
    let script = v8::Script::compile(scope, js_source_code, None)
        .ok_or_else(|| JSRunnerError::Eval(path.into(), "compile error".to_string()))?;

    script
        .run(scope)
        .ok_or_else(|| JSRunnerError::Eval(path.into(), "execution error".to_string()))
}

fn read_file(path: &str) -> JSRunnerResult<String> {
    fs::read_to_string(path).map_err(|e| JSRunnerError::IO(path.into(), e))
}

fn import_file<'s>(
    scope: &mut v8::HandleScope<'s>,
    context: v8::Local<'s, v8::Context>,
    path: &str,
    args: &[v8::Local<'s, v8::Value>],
) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
    let v = eval_file(scope, path)?;
    let f: v8::Local<'_, v8::Function> = v.try_into().map_err(|e| {
        JSRunnerError::FileImport(path.into(), format!("Failed to wrap file: {:?}, {e}", &v))
    })?;

    let global_context = context.global(scope);
    let imported = f.call(scope, global_context.into(), args).ok_or_else(|| {
        JSRunnerError::FileImport(path.into(), "could not call function".to_string())
    })?;

    Ok(imported)
}

fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let ipc_data_generator = IpcDataGenerator::default();
    let content = ipc_data_generator.schema_to_bytes(schema, &IpcWriteOptions::default());
    let mut stream_bytes = arrow_continuation(content.ipc_message.len());
    stream_bytes.extend_from_slice(&content.ipc_message);
    stream_bytes
}

fn bytes_to_js<'s>(scope: &mut v8::HandleScope<'s>, bytes: &[u8]) -> v8::Local<'s, v8::Value> {
    let buffer = v8::ArrayBuffer::new(scope, bytes.len());

    if !bytes.is_empty() {
        unsafe {
            std::ptr::copy(
                bytes.as_ptr(),
                buffer
                    .get_backing_store()
                    .data()
                    .expect("bytes to not be empty")
                    .as_ptr() as *mut u8,
                bytes.len(),
            );
        }
    }

    buffer.into()
}

fn pkg_id_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    pkg_id: PackageId,
) -> v8::Local<'s, v8::Value> {
    v8::Number::new(scope, pkg_id.as_usize() as f64).into()
}

fn sim_id_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    sim_id: SimulationShortId,
) -> v8::Local<'s, v8::Value> {
    v8::Number::new(scope, sim_id as f64).into()
}

fn idxs_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    idxs: &[usize],
) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
    let a = v8::Array::new(scope, idxs.len() as i32);
    for (i, idx) in idxs.iter().enumerate() {
        let js_idx = v8::Number::new(scope, *idx as u32 as f64);
        a.set_index(scope, i as u32, js_idx.into()).ok_or_else(|| {
            JSRunnerError::V8(format!("Could not set index {idx} on idxs_to_js Array"))
        })?;
    }

    Ok(a.into())
}

fn current_step_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    current_step: usize,
) -> v8::Local<'s, v8::Value> {
    v8::Number::new(scope, current_step as f64).into()
}

fn batches_from_shared_store(
    shared_store: &TaskSharedStore,
) -> JSRunnerResult<(Vec<&AgentBatch>, Vec<&MessageBatch>, Vec<usize>)> {
    // TODO: Remove duplication between read and write access
    Ok(match &shared_store.state {
        SharedState::None => (vec![], vec![], vec![]),
        SharedState::Write(state) => (
            state.agent_pool().batches(),
            state.message_pool().batches(),
            (0..state.agent_pool().len()).collect(),
        ),
        SharedState::Read(state) => (
            state.agent_pool().batches(),
            state.message_pool().batches(),
            (0..state.agent_pool().len()).collect(),
        ),
        SharedState::Partial(partial) => {
            match partial {
                PartialSharedState::Read(partial) => (
                    partial.state_proxy.agent_pool().batches(),
                    partial.state_proxy.message_pool().batches(),
                    partial.group_indices.clone(), // TODO: Avoid cloning?
                ),
                PartialSharedState::Write(partial) => (
                    partial.state_proxy.agent_pool().batches(),
                    partial.state_proxy.message_pool().batches(),
                    partial.group_indices.clone(), // TODO: Avoid cloning?
                ),
            }
        }
    })
}

fn state_to_js<'s, 'a>(
    scope: &mut v8::HandleScope<'s>,
    mut agent_batches: impl Iterator<Item = &'a AgentBatch>,
    mut message_batches: impl Iterator<Item = &'a MessageBatch>,
) -> JSRunnerResult<(v8::Local<'s, v8::Value>, v8::Local<'s, v8::Value>)> {
    // I'm not sure if we need to know the length beforehand or not
    let js_agent_batches = v8::Array::new(scope, 0);
    let js_message_batches = v8::Array::new(scope, 0);

    for (i_batch, (agent_batch, message_batch)) in agent_batches
        .by_ref()
        .zip(message_batches.by_ref())
        .enumerate()
    {
        let agent_batch = batch_to_js(
            scope,
            agent_batch.batch.segment().memory(),
            agent_batch.batch.segment().persisted_metaversion(),
        )?;
        js_agent_batches
            .set_index(scope, i_batch as u32, agent_batch)
            .ok_or_else(|| {
                JSRunnerError::V8(format!("Could not set index {i_batch} on js_agent_batches"))
            })?;

        let message_batch = batch_to_js(
            scope,
            message_batch.batch.segment().memory(),
            message_batch.batch.segment().persisted_metaversion(),
        )?;
        js_message_batches
            .set_index(scope, i_batch as u32, message_batch)
            .ok_or_else(|| {
                JSRunnerError::V8(format!(
                    "Could not set index {i_batch} on js_message_batches"
                ))
            })?;
    }

    // There is no stable way of ensuring the length of an iterator, `zip` will stop as soon as one
    // iterator returns None, thus if both iterators has no elements left, they had the same length.
    debug_assert!(
        agent_batches.next().is_none() && message_batches.next().is_none(),
        "Agent batches and message batches needs to have the same size"
    );

    Ok((js_agent_batches.into(), js_message_batches.into()))
}

fn batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    mem: &Memory,
    persisted: Metaversion,
) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
    // The memory is owned by the shared memory
    // we don't want JS or Rust to try to de-allocate it
    unsafe extern "C" fn no_op(_: *mut std::ffi::c_void, _: usize, _: *mut std::ffi::c_void) {}

    tracing::debug!("Calling batch_to_js");
    // https://github.com/denoland/rusty_v8/pull/926
    let backing_store = unsafe {
        v8::ArrayBuffer::new_backing_store_from_ptr(
            mem.data.as_ptr() as *mut _,
            mem.size,
            no_op,
            std::ptr::null_mut(),
        )
    };
    let array_buffer = v8::ArrayBuffer::with_backing_store(scope, &backing_store.make_shared());

    let batch_id = mem.id();
    mem_batch_to_js(scope, batch_id, array_buffer.into(), persisted)
}

fn mem_batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    batch_id: &str,
    mem: v8::Local<'s, v8::Object>,
    persisted: Metaversion,
) -> JSRunnerResult<v8::Local<'s, v8::Value>> {
    let batch = v8::Object::new(scope);
    let batch_id = new_js_string(scope, batch_id)?;

    let id_field = new_js_string(scope, "id")?;
    let mem_field = new_js_string(scope, "mem")?;
    let mem_version_field = new_js_string(scope, "mem_version")?;
    let batch_version_field = new_js_string(scope, "batch_version")?;

    batch
        .set(scope, id_field.into(), batch_id.into())
        .ok_or_else(|| JSRunnerError::V8("Could not set id field on batch".to_string()))?;
    batch
        .set(scope, mem_field.into(), mem.into())
        .ok_or_else(|| JSRunnerError::V8("Could not set mem field on batch".to_string()))?;
    let js_memory = v8::Number::new(scope, persisted.memory() as f64);
    batch
        .set(scope, mem_version_field.into(), js_memory.into())
        .ok_or_else(|| JSRunnerError::V8("Could not set mem_version field on batch".to_string()))?;
    let js_batch = v8::Number::new(scope, persisted.batch() as f64);
    batch
        .set(scope, batch_version_field.into(), js_batch.into())
        .ok_or_else(|| {
            JSRunnerError::V8("Could not set batch_version field on batch".to_string())
        })?;

    Ok(batch.into())
}

fn get_js_error<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: v8::Local<'s, v8::Object>,
) -> Option<JSRunnerError> {
    tracing::debug!("Collecting JS errors");
    let user_errors = if let Some(user_errors) = v8::String::new(scope, "user_errors") {
        user_errors
    } else {
        return Some(JSRunnerError::V8("Could not create String".to_string()));
    };

    if let Some(errors) = return_val.get(scope, user_errors.into()) {
        if !errors.is_null_or_undefined() {
            let errors = array_to_user_errors(scope, errors);
            if !errors.is_empty() {
                return Some(JSRunnerError::User(errors));
            }
        }
    }

    let pkg_error = if let Some(pkg_error) = v8::String::new(scope, "pkg_error") {
        pkg_error
    } else {
        return Some(JSRunnerError::V8("Could not create String".to_string()));
    };

    let runner_error = if let Some(runner_error) = v8::String::new(scope, "runner_error") {
        runner_error
    } else {
        return Some(JSRunnerError::V8("Could not create String".to_string()));
    };

    if let Some(e) = return_val.get(scope, pkg_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be Some(undefined)
        if !e.is_undefined() {
            let e: v8::Local<'s, v8::String> = match e.to_string(scope) {
                Some(e) => e,
                None => {
                    return Some(JSRunnerError::V8(
                        "Could not convert e to String".to_string(),
                    ));
                }
            };

            // TODO: Don't silently ignore non-string, non-null-or-undefined errors
            //       (try to convert error value to JSON string and return as error?).
            return Some(JSRunnerError::Package(PackageError(
                e.to_rust_string_lossy(scope),
            )));
        }
    }

    if let Some(e) = return_val.get(scope, runner_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be Some(undefined)
        if !e.is_undefined() {
            let e: v8::Local<'s, v8::String> = match e.to_string(scope) {
                Some(e) => e,
                None => {
                    return Some(JSRunnerError::V8(
                        "Could not convert e to String".to_string(),
                    ));
                }
            };

            // TODO: Don't ignore non-string, non-null-or-undefined errors
            return Some(JSRunnerError::Embedded(e.to_rust_string_lossy(scope)));
        }
    }

    None
}

fn array_to_user_errors<'s>(
    scope: &mut v8::HandleScope<'s>,
    array: v8::Local<'s, v8::Value>,
) -> Vec<UserError> {
    let fallback = format!("Unparsed: {:?}", array);

    if array.is_array() {
        let array: v8::Local<'s, v8::Array> = array
            .try_into()
            .expect("array conversion to never fail as we just checked it was the right type");
        let errors = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    JSRunnerError::V8(format!("Could not get index {i} in array_to_user_errors"))
                });
                element.map(|e| UserError(format!("{e:?}")))
            })
            .collect();

        if let Ok(errors) = errors {
            return errors;
        } // else unparsed
    } // else unparsed

    vec![UserError(fallback)]
}

fn get_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: v8::Local<'s, v8::Object>,
) -> JSRunnerResult<Option<Vec<UserWarning>>> {
    let user_warnings = new_js_string(scope, "user_warnings")?;

    if let Some(warnings) = return_val.get(scope, user_warnings.into()) {
        if warnings != v8::undefined(scope) && warnings != v8::null(scope) {
            let warnings = array_to_user_warnings(scope, warnings);
            if !warnings.is_empty() {
                return Ok(Some(warnings));
            }
        }
    }

    Ok(None)
}

fn array_to_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    array: v8::Local<'s, v8::Value>,
) -> Vec<UserWarning> {
    // TODO: Extract optional line numbers
    let fallback = format!("Unparsed: {:?}", array);

    if array.is_array() {
        let array: v8::Local<'s, v8::Array> = array
            .try_into()
            .expect("array conversion to never fail as we just checked it was the right type");
        let warnings = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    JSRunnerError::V8(format!("Could not get index {i} in array_to_user_warnings"))
                });
                element.map(|e| UserWarning {
                    message: format!("{:?}", e),
                    details: None,
                })
            })
            .collect();

        if let Ok(warnings) = warnings {
            return warnings;
        } // else unparsed
    } // else unparsed

    vec![UserWarning {
        message: fallback,
        details: None,
    }]
}

fn get_print<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: v8::Local<'s, v8::Object>,
) -> JSRunnerResult<Option<Vec<String>>> {
    let print = new_js_string(scope, "print")?;

    if let Some(printed_val) = return_val.get(scope, print.into()) {
        if let Ok(printed_val) = printed_val.try_into() {
            let printed_val: v8::Local<'s, v8::String> = printed_val;
            let printed_val = printed_val.to_rust_string_lossy(scope);
            if !printed_val.is_empty() {
                Ok(Some(
                    printed_val.split('\n').map(|s| s.to_string()).collect(),
                ))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

fn get_next_task<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: v8::Local<'s, v8::Object>,
) -> JSRunnerResult<(MessageTarget, String)> {
    let target = new_js_string(scope, "target")?;

    let target = if let Some(target) = return_val.get(scope, target.into()) {
        if let Ok(target) = target.try_into() {
            let target: v8::Local<'s, v8::String> = target;
            let target = target.to_rust_string_lossy(scope);

            match target.as_str() {
                "JavaScript" => MessageTarget::JavaScript,
                "Python" => MessageTarget::Python,
                "Rust" => MessageTarget::Rust,
                "Dynamic" => MessageTarget::Dynamic,
                "Main" => MessageTarget::Main,
                _ => return Err(JSRunnerError::UnknownTarget(target)),
            }
        } else {
            // If no target was specified, go back to simulation main loop by default.
            MessageTarget::Main
        }
    } else {
        // If no target was specified, go back to simulation main loop by default.
        MessageTarget::Main
    };

    let task = new_js_string(scope, "task")?;

    let next_task_payload = if let Some(task) = return_val.get(scope, task.into()) {
        if let Ok(task) = task.try_into() {
            let task: v8::Local<'s, v8::String> = task;
            task.to_rust_string_lossy(scope)
        } else {
            // TODO: Don't silently ignore non-string, non-null-or-undefined payloads
            "{}".to_string()
        }
    } else {
        // TODO: Don't silently ignore non-string, non-null-or-undefined payloads
        "{}".to_string()
    };

    Ok((target, next_task_payload))
}

/// C representation of Arrow array data nodes
#[repr(C)]
#[derive(Debug)]
pub struct DataFfi<'s> {
    pub len: usize,
    pub null_count: usize,
    pub n_buffers: u32,
    pub buffer_ptrs: [*const u8; 2],
    pub buffer_capacities: [usize; 2],
    pub null_bits_ptr: *const u8,
    pub null_bits_capacity: usize,
    _phantom: std::marker::PhantomData<v8::Local<'s, ()>>,
}

/// Translation of the old mv8::mv8_data_node_from_js from C++ to Rust
fn data_node_from_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    data: v8::Local<'s, v8::Value>,
) -> JSRunnerResult<DataFfi<'s>> {
    // The names in this function are kept identical to help the review process
    tracing::debug!("Calling data_node_from_js");
    let obj = data.to_object(scope).ok_or_else(|| {
        JSRunnerError::V8("Could not convert data from Value to Object".to_string())
    })?;

    let len_key = new_js_string(scope, "len")?;
    let len_value = obj
        .get(scope, len_key.into())
        .ok_or_else(|| JSRunnerError::V8("Could not get len_key property on obj".to_string()))?;
    let len_num: v8::Local<'s, v8::Number> = len_value.try_into().map_err(|err| {
        JSRunnerError::V8(format!(
            "Could not convert len_value from Value to Number: {err}"
        ))
    })?;

    let null_count_key = new_js_string(scope, "null_count")?;
    let null_count_value = obj
        .get(scope, null_count_key.into())
        .ok_or_else(|| JSRunnerError::V8("Could not get null_count property on obj".to_string()))?;
    let null_count_num: v8::Local<'s, v8::Number> = null_count_value.try_into().map_err(|err| {
        JSRunnerError::V8(format!(
            "Could not convert null_count_value from Value to Number: {err}"
        ))
    })?;

    let buffers = new_js_string(scope, "buffers")?;
    let buffers_value = obj
        .get(scope, buffers.into())
        .ok_or_else(|| JSRunnerError::V8("Could not get buffers property on obj".to_string()))?;
    let buffers: v8::Local<'s, v8::Array> = buffers_value.try_into().map_err(|err| {
        JSRunnerError::V8(format!(
            "Could not convert buffers from Value to Array: {err}"
        ))
    })?;
    let n_buffers = buffers.length();
    if n_buffers > 2 {
        return Err(JSRunnerError::V8(format!(
            "Invalid buffers length ({}), expected no more than 2",
            buffers.length()
        )));
    }

    let mut buffer_ptrs = [std::ptr::null(); 2];
    let mut buffer_capacities = [0; 2];
    for i in 0..buffers.length() {
        let buffer_value = buffers
            .get_index(scope, i)
            .ok_or_else(|| JSRunnerError::V8(format!("Could not access index {i} on buffers")))?;
        let buffer: v8::Local<'s, v8::ArrayBuffer> = buffer_value.try_into().map_err(|err| {
            JSRunnerError::V8(format!(
                "Could not convert buffer_value from Value to ArrayBuffer: {err}"
            ))
        })?;
        let contents = buffer.get_backing_store();
        buffer_ptrs[i as usize] = contents
            .data()
            .map(NonNull::as_ptr)
            .unwrap_or(std::ptr::null_mut()) as *mut u8;
        buffer_capacities[i as usize] = contents.byte_length();
    }

    let null_bits_key = new_js_string(scope, "null_bits")?;
    let null_bits_value = obj
        .get(scope, null_bits_key.into())
        .ok_or_else(|| JSRunnerError::V8("Could not get null_bits property on obj".to_string()))?;
    let null_bits: v8::Local<'s, v8::ArrayBuffer> = null_bits_value.try_into().map_err(|err| {
        JSRunnerError::V8(format!(
            "Could not convert len from Value to ArrayBuffer: {err}"
        ))
    })?;
    let contents = null_bits.get_backing_store();
    let null_bits_ptr = contents
        .data()
        .map(NonNull::as_ptr)
        .unwrap_or(std::ptr::null_mut()) as *mut u8;
    let null_bits_capacity = contents.byte_length();

    Ok(DataFfi {
        len: len_num.value() as usize,
        null_count: null_count_num.value() as usize,
        n_buffers,
        buffer_ptrs,
        buffer_capacities,
        null_bits_ptr,
        null_bits_capacity,
        _phantom: std::marker::PhantomData,
    })
}
