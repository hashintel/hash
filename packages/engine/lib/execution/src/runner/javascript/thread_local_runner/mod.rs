use std::{collections::HashMap, sync::Arc};

use arrow2::datatypes::Schema;
use stateful::{
    field::PackageId,
    global::{Globals, SharedStore},
};
use tokio::sync::mpsc::UnboundedSender;
use tracing::Span;

use super::{
    conversion::{bytes_to_js, sim_id_to_js},
    embedded::Embedded,
    error::{JavaScriptError, JavaScriptResult},
    schema_to_stream_bytes,
    utils::{call_js_function, new_js_string},
    Array, Object, Value,
};
use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{
            ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, NewSimulationRun,
            OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerTaskMessage,
            TargetedRunnerTaskMsg, UserWarning,
        },
        javascript::{
            conversion::pkg_id_to_js,
            reporting::{get_js_error, get_print, get_user_warnings},
            task::get_next_task,
            JsPackage,
        },
        Language,
    },
    task::{TaskId, TaskMessage, TaskSharedStore},
};

mod array_from_js;
mod flush;
mod sync;

/// Due to flushing, need batches and schemas in both Rust and JS.
struct SimState {
    agent_schema: Arc<Schema>,
    msg_schema: Arc<Schema>,
}

pub(in crate::runner::javascript) struct ThreadLocalRunner<'s> {
    embedded: Embedded<'s>,
    this: Value<'s>,
    sims_state: HashMap<SimulationId, SimState>,
}

impl<'s> ThreadLocalRunner<'s> {
    fn load_datasets(
        scope: &mut v8::HandleScope<'s>,
        shared_ctx: &SharedStore,
    ) -> JavaScriptResult<Value<'s>> {
        let js_datasets = v8::Object::new(scope);
        for (dataset_name, dataset) in shared_ctx.datasets.iter() {
            let js_name = new_js_string(scope, &dataset_name);

            let json = dataset.data();
            // TODO: Use `from_utf8_unchecked` instead here?
            //       (Since datasets' json can be quite large.)
            let json = std::str::from_utf8(json)
                .map_err(|_| JavaScriptError::Unique("Dataset not utf8".into()))?;
            let json = new_js_string(scope, json);

            js_datasets
                .set(scope, js_name.into(), json.into())
                .ok_or_else(|| {
                    JavaScriptError::V8("Could not set property on Object".to_string())
                })?;
        }

        Ok(js_datasets.into())
    }

    pub fn new(
        scope: &mut v8::HandleScope<'s>,
        init: &ExperimentInitRunnerMsg,
    ) -> JavaScriptResult<Self> {
        let embedded = Embedded::import_common_js_files(scope)?;
        let datasets = {
            let upgraded = init.shared_context.upgrade().expect(
                "failed to obtain access to the shared store (this is a bug: it should not be \
                 possible for the ExperimentController to be dropped before a Javascript runner)",
            );
            Self::load_datasets(scope, upgraded.as_ref())?
        };

        let pkg_config = &init.package_config.0;
        let pkg_fns = v8::Array::new(scope, pkg_config.len() as i32);
        let pkg_init_msgs = v8::Array::new(scope, pkg_config.len() as i32);
        for (i_pkg, pkg_init) in pkg_config.values().enumerate() {
            let i_pkg = i_pkg as u32;

            let pkg_name = pkg_init.name.to_string();
            let pkg = JsPackage::import_package(scope, &pkg_name, pkg_init.r#type)?;
            tracing::trace!(
                "pkg experiment init name {:?}, type {}, fns {:?}",
                &pkg_init.name,
                &pkg_init.r#type,
                &pkg.fns,
            );
            pkg_fns
                .set_index(scope, i_pkg, pkg.fns.into())
                .ok_or_else(|| {
                    JavaScriptError::V8(format!(
                        "Couldn't set package function at index {i_pkg} on {pkg_name} package \
                         function array"
                    ))
                })?;

            let pkg_init = serde_json::to_string(&pkg_init).unwrap();
            let pkg_init = new_js_string(scope, &pkg_init);
            pkg_init_msgs
                .set_index(scope, i_pkg, pkg_init.into())
                .ok_or_else(|| {
                    JavaScriptError::V8(format!(
                        "Couldn't set package init function at index {i_pkg} on {pkg_name} \
                         package init function array"
                    ))
                })?;
        }

        let this = v8::Object::new(scope);
        let args = &[datasets, pkg_init_msgs.into(), pkg_fns.into()];
        call_js_function(scope, embedded.start_experiment, this.into(), args).map_err(|err| {
            JavaScriptError::V8(format!("Could not call start_experiment: {err}"))
        })?;

        Ok(Self {
            embedded,
            this: this.into(),
            sims_state: HashMap::new(),
        })
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
    ) -> JavaScriptResult<()> {
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
            pkg_ids.set_index(scope, i_pkg, js_pkg_id).ok_or_else(|| {
                format!("Couldn't set package id {pkg_id} at index {i_pkg} on package id array")
            })?;
            let payload = serde_json::to_string(&pkg_msg.payload).unwrap();
            let payload = new_js_string(scope, &payload).into();
            pkg_msgs.set_index(scope, i_pkg, payload).ok_or_else(|| {
                format!("Couldn't set payload at index {i_pkg} on package message array")
            })?;
        }

        let globals: &Globals = &run.globals;
        let globals = serde_json::to_string(globals).unwrap();
        let globals = new_js_string(scope, &globals);

        let js_sim_id = sim_id_to_js(scope, run.short_id);
        call_js_function(scope, self.embedded.start_sim, self.this, &[
            js_sim_id,
            agent_schema_bytes,
            msg_schema_bytes,
            ctx_schema_bytes,
            pkg_ids.into(),
            pkg_msgs.into(),
            globals.into(),
        ])
        .map_err(|err| JavaScriptError::V8(format!("Could not run start_sim Function: {err}")))?;

        // Initialize Rust.
        let state = SimState {
            agent_schema: Arc::clone(&run.datastore.agent_batch_schema.arrow),
            msg_schema: Arc::clone(&run.datastore.message_batch_schema),
        };
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| JavaScriptError::DuplicateSimulationRun(run.short_id))?;

        Ok(())
    }

    // TODO: DOC
    fn handle_task_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationId,
        msg: RunnerTaskMessage,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> JavaScriptResult<()> {
        tracing::debug!("Starting state interim sync before running task");
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(scope, sim_id, &msg.shared_store)?;

        tracing::debug!("Setting up run_task function call");

        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                JavaScriptError::from(format!("Failed to extract the inner task message: {err}"))
            })?;
        let payload_str = new_js_string(scope, &serde_json::to_string(&payload)?);
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
                // UserJavaScriptErrors and PackageJavaScriptErrors are not fatal to the Runner
                if let JavaScriptError::User(errors) = error {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::UserErrors(errors),
                    })?;
                } else if let JavaScriptError::Package(package_error) = error {
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

    /// Runs a task on JavaScript with the provided simulation id.
    ///
    /// Returns the next task ([`TargetedRunnerTaskMsg`]) and, if present, warnings
    /// ([`RunnerError`]) and logging statements.
    ///
    /// [`RunnerError`]: crate::runner::comms::RunnerError
    ///
    /// # JavaScriptErrors
    ///
    /// May return an error if:
    ///
    /// - a value from Javascript could not be parsed,
    /// - the task errored, or
    /// - the state could not be flushed to the datastore.
    #[allow(clippy::too_many_arguments, clippy::type_complexity)]
    fn run_task(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        args: &[Value<'s>],
        sim_id: SimulationId,
        group_index: Option<usize>,
        package_id: PackageId,
        task_id: TaskId,
        wrapper: &serde_json::Value,
        mut shared_store: TaskSharedStore,
    ) -> JavaScriptResult<(
        TargetedRunnerTaskMsg,
        Option<Vec<UserWarning>>,
        Option<Vec<String>>,
    )> {
        tracing::debug!("Calling JS run_task");

        // if the shared_store contains outdated data, then we must reload it here
        Self::reload_data_if_necessary(&mut shared_store)?;

        let return_val: Value<'s> =
            call_js_function(scope, self.embedded.run_task, self.this, args).map_err(|err| {
                JavaScriptError::V8(format!("Could not run run_task Function: {err}"))
            })?;
        let return_val = return_val.to_object(scope).ok_or_else(|| {
            JavaScriptError::V8("Could not convert return_val from Value to Object".to_string())
        })?;

        tracing::debug!("Post-processing run_task result");
        if let Some(error) = get_js_error(scope, return_val) {
            return Err(error);
        }
        let user_warnings = get_user_warnings(scope, return_val);
        let logs = get_print(scope, return_val);
        let (next_target, next_task_payload) = get_next_task(scope, return_val)?;

        let next_inner_task_msg: serde_json::Value = serde_json::from_str(&next_task_payload)?;
        let next_task_payload =
            TaskMessage::try_from_inner_msg_and_wrapper(next_inner_task_msg, wrapper.clone())
                .map_err(|err| {
                    JavaScriptError::from(format!(
                        "Failed to wrap and create a new TaskMessage, perhaps the inner: \
                         {next_task_payload}, was formatted incorrectly. Underlying error: {err}"
                    ))
                })?;

        // Only flushes if the state is writable
        self.flush(scope, sim_id, &mut shared_store, return_val)?;

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMessage {
                package_id,
                task_id,
                group_index,
                shared_store,
                payload: next_task_payload,
            },
        };

        Ok((next_task_msg, user_warnings, logs))
    }

    /// Reloads the data in the shared_store if necessary.
    fn reload_data_if_necessary(shared_store: &mut TaskSharedStore) -> JavaScriptResult<()> {
        let (write_proxies, _) = match shared_store.get_write_proxies() {
            Ok(t) => t,
            Err(_) => return Ok(()),
        };
        write_proxies
            .maybe_reload()
            .map_err(|_| JavaScriptError::from("could not reload batches (this is a bug)"))?;
        Ok(())
    }

    pub fn handle_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> JavaScriptResult<bool> {
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
                let sim_id =
                    sim_id.ok_or(JavaScriptError::SimulationIdRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(JavaScriptError::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(JavaScriptError::SimulationIdRequired("state sync"))?;
                self.state_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(JavaScriptError::SimulationIdRequired("interim sync"))?;
                self.state_interim_sync(scope, sim_id, &interim_msg.shared_store)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id =
                    sim_id.ok_or(JavaScriptError::SimulationIdRequired("snapshot sync"))?;
                self.state_snapshot_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id =
                    sim_id.ok_or(JavaScriptError::SimulationIdRequired("context batch sync"))?;
                self.ctx_batch_sync(scope, sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(JavaScriptError::SimulationIdRequired("run task"))?;
                self.handle_task_msg(scope, sim_id, msg, outbound_sender)?;
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {
                todo!("Cancel messages are not implemented yet");
                // see https://app.asana.com/0/1199548034582004/1202011714603653/f
            }
        }

        Ok(true) // Continue running.
    }
}

fn get_child_data<'s>(
    scope: &mut v8::HandleScope<'s>,
    obj: Object<'s>,
) -> JavaScriptResult<Array<'s>> {
    let child_data = new_js_string(scope, "child_data");

    obj.get(scope, child_data.into())
        .ok_or_else(|| JavaScriptError::V8("Could not get child_data property on obj".to_string()))?
        .try_into()
        .map_err(|err| {
            JavaScriptError::V8(format!(
                "Could not convert child_data from Value to Array: {err}"
            ))
        })
}
