// Some notes on rusty_v8:
//
// - When calling JS functions the second argument is the "this" object, for free functions it's the
//   `Context` created at the very beginning. Since the argument needs to be a `Local<Value>` we
//   need to call `Context::global` and convert it `into` a `Local<Value>`.
//
// - `Local` is cheap to `Copy`.
//
// - Even though `rusty_v8` returns an `Option` on `Object::get`, if the object does not have the
//   property the result will be `Some(undefined)` rather than `None`.

mod data_ffi;
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

pub use self::error::{Error, Result};
use crate::{
    config::Globals,
    datastore::{
        arrow::util::arrow_continuation,
        batch::{change::ColumnChange, AgentBatch, ArrowBatch, MessageBatch, Metaversion},
        shared_store::SharedStore,
        storage::memory::Memory,
        table::{
            proxy::StateWriteProxy,
            sync::{ContextBatchSync, StateSync, WaitableStateSync},
            task_shared_store::{PartialSharedState, SharedState, TaskSharedStore},
        },
    },
    language::Language,
    proto::SimulationShortId,
    simulation::{
        package::{id::PackageId, PackageType},
        task::msg::TaskMessage,
    },
    types::TaskId,
    worker::{
        runner::comms::{
            inbound::InboundToRunnerMsgPayload,
            outbound::{
                OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, PackageError, UserError,
                UserWarning,
            },
            ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg,
            TargetedRunnerTaskMsg,
        },
        Result as WorkerResult,
    },
};

type Object<'scope> = v8::Local<'scope, v8::Object>;
type Value<'scope> = v8::Local<'scope, v8::Value>;
type Function<'scope> = v8::Local<'scope, v8::Function>;
type Array<'scope> = v8::Local<'scope, v8::Array>;

const MB: usize = 1_000_000;

struct JsPackage<'s> {
    fns: Array<'s>,
}

fn get_pkg_path(name: &str, pkg_type: PackageType) -> String {
    format!(
        "./src/simulation/package/{}/packages/{}/package.js",
        pkg_type.as_str(),
        name
    )
}

/// TODO: DOC add docstrings on impl'd methods
impl<'s> JsPackage<'s> {
    fn import(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
        embedded: &Embedded<'s>,
        name: &str,
        pkg_type: PackageType,
    ) -> Result<Self> {
        let path = get_pkg_path(name, pkg_type);
        tracing::debug!("Importing package from path `{path}`");
        let code = match fs::read_to_string(path.clone()) {
            Ok(s) => s,
            Err(_) => {
                tracing::debug!("Couldn't read package file. It might intentionally not exist.");
                // Packages don't have to use JS.
                let fns = v8::Array::new(scope, 3);
                let undefined = v8::undefined(scope).into();
                for fn_idx in 0..3 {
                    fns.set_index(scope, fn_idx, undefined).ok_or_else(|| {
                        Error::PackageImport(
                            path.clone(),
                            format!(
                                "Could not set Undefined value at index {fn_idx} on package \
                                 function array"
                            ),
                        )
                    })?;
                }

                return Ok(JsPackage { fns });
            }
        };

        // Avoid JS ReferenceError by wrapping potentially undeclared variables with `typeof`.
        // Double braces like `{{` are Rust's escape string for a single literal `{`.
        let wrapped_code = new_js_string(
            scope,
            &format!(
                "((hash_util, hash_stdlib) => {{{code}
                    return [
                        typeof start_experiment === 'undefined' ? undefined : start_experiment,
                        typeof start_sim === 'undefined' ? undefined : start_sim,
                        typeof run_task === 'undefined' ? undefined : run_task
                    ]
                }})",
            ),
        );

        let pkg: Function<'_> = {
            let mut try_catch = v8::TryCatch::new(scope);

            let pkg = v8::Script::compile(&mut try_catch, wrapped_code, None).ok_or_else(|| {
                let exception = try_catch.exception().unwrap();
                let exception_string = exception
                    .to_string(&mut try_catch)
                    .unwrap()
                    .to_rust_string_lossy(&mut try_catch);

                Error::PackageImport(
                    path.clone(),
                    format!("Could not compile code for package: {exception_string}"),
                )
            })?;

            let pkg = pkg.run(&mut try_catch).ok_or_else(|| {
                let exception = try_catch.exception().unwrap();
                let exception_string = exception
                    .to_string(&mut try_catch)
                    .unwrap()
                    .to_rust_string_lossy(&mut try_catch);

                Error::PackageImport(
                    path.clone(),
                    format!("Couldn't execute package setup: {exception_string}"),
                )
            })?;

            pkg.try_into().map_err(|err| {
                Error::PackageImport(
                    path.clone(),
                    format!("Could not convert package setup return value into Function: {err}"),
                )
            })?
        };

        let args = &[embedded.hash_util, embedded.hash_stdlib];
        let fns: Array<'_> = {
            let global_context = context.global(scope);
            let fns = call_js_function(scope, pkg, global_context.into(), args).map_err(|err| {
                Error::PackageImport(path.clone(), format!("Couldn't call package: {err}"))
            })?;

            fns.try_into().map_err(|err| {
                Error::PackageImport(
                    path.clone(),
                    format!(
                        "Couldn't convert package return value to array of package functions: \
                         {err}"
                    ),
                )
            })?
        };

        if fns.length() != 3 {
            return Err(Error::PackageImport(
                path.clone(),
                "Unexpected amount of returned arguments".into(),
            ));
        }

        // Validate returned array.
        let fn_names = ["start_experiment", "start_sim", "run_task"];
        for (idx_fn, fn_name) in fn_names.iter().enumerate() {
            let elem: Value<'_> = fns.get_index(scope, idx_fn as u32).ok_or_else(|| {
                Error::PackageImport(
                    path.clone(),
                    format!("Couldn't index package functions array: {idx_fn:?}"),
                )
            })?;

            if !(elem.is_function() || elem.is_undefined()) {
                return Err(Error::PackageImport(
                    path.clone(),
                    format!("{fn_name} should be a function, not {elem:?}"),
                ));
            }
        }

        Ok(JsPackage { fns })
    }
}

/// Embedded JS of runner itself (from hardcoded paths)
struct Embedded<'s> {
    hash_stdlib: Value<'s>,
    hash_util: Value<'s>,

    start_experiment: Function<'s>,
    start_sim: Function<'s>,
    run_task: Function<'s>,
    ctx_batch_sync: Function<'s>,
    state_sync: Function<'s>,
    state_interim_sync: Function<'s>,
    state_snapshot_sync: Function<'s>,
}

fn read_file(path: &str) -> Result<String> {
    fs::read_to_string(path).map_err(|err| Error::IO(path.into(), err))
}

fn eval_file<'s>(scope: &mut v8::HandleScope<'s>, path: &str) -> Result<Value<'s>> {
    let source_code = read_file(path)?;
    let js_source_code = new_js_string(scope, &source_code);
    let mut try_catch = v8::TryCatch::new(scope);
    let script = v8::Script::compile(&mut try_catch, js_source_code, None).ok_or_else(|| {
        let exception = try_catch.exception().unwrap();
        let exception_string = exception
            .to_string(&mut try_catch)
            .unwrap()
            .to_rust_string_lossy(&mut try_catch);

        Error::Eval(path.into(), format!("Compile error: {exception_string}"))
    })?;

    script.run(&mut try_catch).ok_or_else(|| {
        let exception = try_catch.exception().unwrap();
        let exception_string = exception
            .to_string(&mut try_catch)
            .unwrap()
            .to_rust_string_lossy(&mut try_catch);

        Error::Eval(path.into(), format!("Execution error: {exception_string}"))
    })
}

fn import_file<'s>(
    scope: &mut v8::HandleScope<'s>,
    context: v8::Local<'s, v8::Context>,
    path: &str,
    args: &[Value<'s>],
) -> Result<Value<'s>> {
    let v = eval_file(scope, path)?;
    let f: Function<'_> = v.try_into().map_err(|err| {
        Error::FileImport(
            path.into(),
            format!("Could not convert file into Function: {err}"),
        )
    })?;

    let global_context = context.global(scope);
    let imported = call_js_function(scope, f, global_context.into(), args)
        .map_err(|err| Error::FileImport(path.into(), format!("Could not call function: {err}")))?;

    Ok(imported)
}

impl<'s> Embedded<'s> {
    fn import(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
    ) -> Result<Self> {
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
        let ctx_import: Array<'_> = ctx_import.try_into().map_err(|err| {
            Error::FileImport(
                "./src/worker/runner/javascript/context.js".to_string(),
                format!("Couldn't get array (of functions) from 'context.js': {err}"),
            )
        })?;
        let experiment_ctx_prototype = ctx_import.get_index(scope, 0).ok_or_else(|| {
            Error::V8(
                "Couldn't get experiment_ctx_prototype from index 0 of the context.js return \
                 values"
                    .to_string(),
            )
        })?;
        let sim_init_ctx_prototype = ctx_import.get_index(scope, 1).ok_or_else(|| {
            Error::V8(
                "Couldn't get sim_init_ctx_prototype from index 1 of the context.js return values"
                    .to_string(),
            )
        })?;
        let gen_ctx = ctx_import.get_index(scope, 2).ok_or_else(|| {
            Error::V8(
                "Couldn't get gen_ctx from index 2 of the context.js return values".to_string(),
            )
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
        let fns: Array<'_> = fns.try_into().map_err(|err| {
            Error::FileImport(
                "./src/worker/runner/javascript/runner.js".into(),
                format!("Couldn't get array (of functions) from 'runner.js': {err}"),
            )
        })?;

        let [
            start_experiment,
            start_sim,
            run_task,
            ctx_batch_sync,
            state_sync,
            state_interim_sync,
            state_snapshot_sync,
        ]: [Function<'_>; 7] = (0..=6)
            .map(|fn_idx| {
                fns.get_index(scope, fn_idx)
                    .ok_or_else(|| {
                        Error::V8(format!("Could not get package function at index {fn_idx}"))
                    })?
                    .try_into()
                    .map_err(|err| {
                        Error::V8(format!(
                            "Could not convert value at index {fn_idx} in runner.js as a \
                             function: {err}"
                        ))
                    })
            })
            .collect::<Result<Vec<_>>>()?
            .try_into()
            .unwrap();

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

/// Due to flushing, need batches and schemas in both Rust and JS.
struct SimState {
    agent_schema: Arc<Schema>,
    msg_schema: Arc<Schema>,
}

struct ThreadLocalRunner<'s> {
    embedded: Embedded<'s>,
    this: Value<'s>,
    sims_state: HashMap<SimulationShortId, SimState>,
}

fn sim_id_to_js<'s>(scope: &mut v8::HandleScope<'s>, sim_id: SimulationShortId) -> Value<'s> {
    v8::Number::new(scope, sim_id as f64).into()
}

fn pkg_id_to_js<'s>(scope: &mut v8::HandleScope<'s>, pkg_id: PackageId) -> Value<'s> {
    v8::Number::new(scope, pkg_id.as_usize() as f64).into()
}

fn new_js_array_from_usizes<'s>(
    scope: &mut v8::HandleScope<'s>,
    values: &[usize],
) -> Result<Value<'s>> {
    let a = v8::Array::new(scope, values.len() as i32);
    for (i, idx) in values.iter().enumerate() {
        let js_idx = v8::Number::new(scope, *idx as u32 as f64);
        a.set_index(scope, i as u32, js_idx.into())
            .ok_or_else(|| Error::V8(format!("Couldn't set value at index {idx} on JS array")))?;
    }

    Ok(a.into())
}

fn call_js_function<'s>(
    scope: &mut v8::HandleScope<'s>,
    func: Function<'s>,
    this: Value<'s>,
    args: &[Value<'s>],
) -> std::result::Result<Value<'s>, String> {
    let mut try_catch = v8::TryCatch::new(scope);
    func.call(&mut try_catch, this, args).ok_or_else(|| {
        let exception = try_catch.exception().unwrap();
        exception
            .to_string(&mut try_catch)
            .unwrap()
            .to_rust_string_lossy(&mut try_catch)
    })
}

fn current_step_to_js<'s>(scope: &mut v8::HandleScope<'s>, current_step: usize) -> Value<'s> {
    v8::Number::new(scope, current_step as f64).into()
}

fn batches_from_shared_store(
    shared_store: &TaskSharedStore,
) -> Result<(Vec<&AgentBatch>, Vec<&MessageBatch>, Vec<usize>)> {
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

fn mem_batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    batch_id: &str,
    mem: Object<'s>,
    persisted: Metaversion,
) -> Result<Value<'s>> {
    let batch = v8::Object::new(scope);
    let batch_id = new_js_string(scope, batch_id);

    let id_field = new_js_string(scope, "id");
    let mem_field = new_js_string(scope, "mem");
    let mem_version_field = new_js_string(scope, "mem_version");
    let batch_version_field = new_js_string(scope, "batch_version");

    batch
        .set(scope, id_field.into(), batch_id.into())
        .ok_or_else(|| Error::V8("Could not set id field on batch".to_string()))?;
    batch
        .set(scope, mem_field.into(), mem.into())
        .ok_or_else(|| Error::V8("Could not set mem field on batch".to_string()))?;
    let js_memory = v8::Number::new(scope, persisted.memory() as f64);
    batch
        .set(scope, mem_version_field.into(), js_memory.into())
        .ok_or_else(|| Error::V8("Could not set mem_version field on batch".to_string()))?;
    let js_batch = v8::Number::new(scope, persisted.batch() as f64);
    batch
        .set(scope, batch_version_field.into(), js_batch.into())
        .ok_or_else(|| Error::V8("Could not set batch_version field on batch".to_string()))?;

    Ok(batch.into())
}

fn batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    mem: &Memory,
    persisted: Metaversion,
) -> Result<Value<'s>> {
    // The memory is owned by the shared memory, we don't want JS or Rust to try to de-allocate it
    unsafe extern "C" fn no_op(_: *mut std::ffi::c_void, _: usize, _: *mut std::ffi::c_void) {}

    // https://github.com/denoland/rusty_v8/pull/926
    //
    // SAFETY: `mem.data` points to valid memory and is valid for `mem.size` bytes `no_op` will not
    //         try to de-allocate share memory.
    // TODO: Investigate to make sure that this does not have any implications on reading/writing.
    //       It's also not 100% clear what `ArrayBuffer` expects, is it ok to read/write while the
    //       `ArrayBuffer` exists?)
    //       https://app.asana.com/0/1199548034582004/1202024534527158/f
    let backing_store = unsafe {
        v8::ArrayBuffer::new_backing_store_from_ptr(
            mem.data.as_ptr().cast(),
            mem.size,
            no_op,
            std::ptr::null_mut(),
        )
    };
    let array_buffer = v8::ArrayBuffer::with_backing_store(scope, &backing_store.make_shared());

    let batch_id = mem.id();
    mem_batch_to_js(scope, batch_id, array_buffer.into(), persisted)
}

fn state_to_js<'s, 'a>(
    scope: &mut v8::HandleScope<'s>,
    mut agent_batches: impl Iterator<Item = &'a AgentBatch>,
    mut message_batches: impl Iterator<Item = &'a MessageBatch>,
) -> Result<(Value<'s>, Value<'s>)> {
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
                Error::V8(format!(
                    "Couldn't set agent batch at index {i_batch} on batch array"
                ))
            })?;

        let message_batch = batch_to_js(
            scope,
            message_batch.batch.segment().memory(),
            message_batch.batch.segment().persisted_metaversion(),
        )?;
        js_message_batches
            .set_index(scope, i_batch as u32, message_batch)
            .ok_or_else(|| {
                Error::V8(format!(
                    "Could not set message batch at index {i_batch} on message batch array"
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

fn bytes_to_js<'s>(scope: &mut v8::HandleScope<'s>, bytes: &[u8]) -> Value<'s> {
    let buffer = v8::ArrayBuffer::new(scope, bytes.len());

    if !bytes.is_empty() {
        // # Safety
        //
        // `bytes` is a slice so it can be read for `bytes.len()`
        // `buffer` was created with `bytes.len()` bytes so can be written to for `bytes.len()`
        // and they are properly aligned as bytes have are always correctly aligned
        unsafe {
            std::ptr::copy(
                bytes.as_ptr(),
                buffer
                    .get_backing_store()
                    .data()
                    .expect("bytes to not be empty")
                    .as_ptr()
                    .cast(),
                bytes.len(),
            );
        }
    }

    buffer.into()
}

fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let ipc_data_generator = IpcDataGenerator::default();
    let content = ipc_data_generator.schema_to_bytes(schema, &IpcWriteOptions::default());
    let mut stream_bytes = arrow_continuation(content.ipc_message.len());
    stream_bytes.extend_from_slice(&content.ipc_message);
    stream_bytes
}

fn array_to_user_errors<'s>(scope: &mut v8::HandleScope<'s>, array: Value<'s>) -> Vec<UserError> {
    let fallback = format!("Unparsed: {array:?}");

    if array.is_array() {
        let array: Array<'s> = array
            .try_into()
            .expect("UserErrors array conversion failed");
        let errors = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    Error::V8(format!(
                        "Could not get error at index {i} in the UserErrors array"
                    ))
                });
                element.map(|err| UserError(format!("{err:?}")))
            })
            .collect();

        if let Ok(errors) = errors {
            return errors;
        } // else unparsed
    } // else unparsed

    vec![UserError(fallback)]
}

fn array_to_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    array: Value<'s>,
) -> Vec<UserWarning> {
    // TODO: Extract optional line numbers
    let fallback = format!("Unparsed: {array:?}");

    if array.is_array() {
        let array: Array<'s> = array
            .try_into()
            .expect("UserWarnings array conversion failed");
        let warnings = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    Error::V8(format!(
                        "Could not get warning at index {i} in the UserWarnings array"
                    ))
                });
                element.map(|err| UserWarning {
                    message: format!("{err:?}"),
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

fn get_js_error<'s>(scope: &mut v8::HandleScope<'s>, return_val: Object<'s>) -> Option<Error> {
    let user_errors = new_js_string(scope, "user_errors");

    if let Some(errors) = return_val.get(scope, user_errors.into()) {
        if !errors.is_null_or_undefined() {
            let errors = array_to_user_errors(scope, errors);
            if !errors.is_empty() {
                return Some(Error::User(errors));
            }
        }
    }

    let pkg_error = new_js_string(scope, "pkg_error");

    let runner_error = new_js_string(scope, "runner_error");

    if let Some(err) = return_val.get(scope, pkg_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be `Some(undefined)` rather than `None`
        if !err.is_undefined() {
            let err: v8::Local<'s, v8::String> = if let Some(err) = err.to_string(scope) {
                err
            } else {
                return Some(Error::V8(
                    "Could not convert package error to String".to_string(),
                ));
            };

            // TODO: Don't silently ignore non-string, non-null-or-undefined errors
            //       (try to convert error value to JSON string and return as error?).
            return Some(Error::Package(PackageError(
                err.to_rust_string_lossy(scope),
            )));
        }
    }

    if let Some(err) = return_val.get(scope, runner_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be `Some(undefined)` rather than `None`
        if !err.is_undefined() {
            let err: v8::Local<'s, v8::String> = if let Some(err) = err.to_string(scope) {
                err
            } else {
                return Some(Error::V8(
                    "Could not convert runner error to String".to_string(),
                ));
            };

            // TODO: Don't ignore non-string, non-null-or-undefined errors
            return Some(Error::Embedded(err.to_rust_string_lossy(scope)));
        }
    }

    None
}

fn get_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> Option<Vec<UserWarning>> {
    let user_warnings = new_js_string(scope, "user_warnings");

    if let Some(warnings) = return_val.get(scope, user_warnings.into()) {
        if warnings != v8::undefined(scope) && warnings != v8::null(scope) {
            let warnings = array_to_user_warnings(scope, warnings);
            if !warnings.is_empty() {
                return Some(warnings);
            }
        }
    }

    None
}

fn get_print<'s>(scope: &mut v8::HandleScope<'s>, return_val: Object<'s>) -> Option<Vec<String>> {
    let print = new_js_string(scope, "print");

    if let Some(printed_val) = return_val.get(scope, print.into()) {
        if let Ok(printed_val) = printed_val.try_into() {
            let printed_val: v8::Local<'s, v8::String> = printed_val;
            let printed_val = printed_val.to_rust_string_lossy(scope);
            if !printed_val.is_empty() {
                Some(printed_val.split('\n').map(|s| s.to_string()).collect())
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    }
}

fn get_next_task<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> Result<(MessageTarget, String)> {
    let target = new_js_string(scope, "target");

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
                _ => return Err(Error::UnknownTarget(target)),
            }
        } else {
            // If no target was specified, go back to simulation main loop by default.
            MessageTarget::Main
        }
    } else {
        // If no target was specified, go back to simulation main loop by default.
        MessageTarget::Main
    };

    let task = new_js_string(scope, "task");

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

impl<'s> ThreadLocalRunner<'s> {
    fn load_datasets(
        scope: &mut v8::HandleScope<'s>,
        shared_ctx: &SharedStore,
    ) -> Result<Value<'s>> {
        let js_datasets = v8::Object::new(scope);
        for (dataset_name, dataset) in shared_ctx.datasets.iter() {
            let js_name = new_js_string(scope, &dataset_name);

            let json = dataset.data();
            // TODO: Use `from_utf8_unchecked` instead here?
            //       (Since datasets' json can be quite large.)
            let json =
                std::str::from_utf8(json).map_err(|_| Error::Unique("Dataset not utf8".into()))?;
            let json = new_js_string(scope, json);

            js_datasets
                .set(scope, js_name.into(), json.into())
                .ok_or_else(|| Error::V8("Could not set property on Object".to_string()))?;
        }

        Ok(js_datasets.into())
    }

    pub fn new(
        scope: &mut v8::HandleScope<'s>,
        context: v8::Local<'s, v8::Context>,
        init: &ExperimentInitRunnerMsg,
    ) -> Result<Self> {
        let embedded = Embedded::import(scope, context)?;
        let datasets = Self::load_datasets(scope, &init.shared_context)?;

        let pkg_config = &init.package_config.0;
        let pkg_fns = v8::Array::new(scope, pkg_config.len() as i32);
        let pkg_init_msgs = v8::Array::new(scope, pkg_config.len() as i32);
        for (i_pkg, pkg_init) in pkg_config.values().enumerate() {
            let i_pkg = i_pkg as u32;

            let pkg_name = pkg_init.name.to_string();
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
                    Error::V8(format!(
                        "Couldn't set package function at index {i_pkg} on {pkg_name} package \
                         function array"
                    ))
                })?;

            let pkg_init = serde_json::to_string(&pkg_init).unwrap();
            let pkg_init = new_js_string(scope, &pkg_init);
            pkg_init_msgs
                .set_index(scope, i_pkg, pkg_init.into())
                .ok_or_else(|| {
                    Error::V8(format!(
                        "Couldn't set package init function at index {i_pkg} on {pkg_name} \
                         package init function array"
                    ))
                })?;
        }

        let this = v8::Object::new(scope);
        let args = &[datasets, pkg_init_msgs.into(), pkg_fns.into()];
        call_js_function(scope, embedded.start_experiment, this.into(), args)
            .map_err(|err| Error::V8(format!("Could not call start_experiment: {err}")))?;

        Ok(Self {
            embedded,
            this: this.into(),
            sims_state: HashMap::new(),
        })
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

    /// TODO: DOC, flushing from a single column
    fn array_data_from_js(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        data: Value<'s>,
        data_type: &DataType,
        len: Option<usize>,
    ) -> Result<ArrayData> {
        // `data` must not be dropped until flush is over, because
        // pointers returned from FFI point inside `data`'s ArrayBuffers' memory.
        let obj = data.to_object(scope).ok_or_else(|| {
            Error::Embedded(format!("Flush data not object for field {data_type:?}"))
        })?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data = data_ffi::DataFfi::new_from_js(scope, obj)?;

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

                let child_data = get_child_data(scope, obj)?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    Error::V8("Could not access index 0 on child_data".to_string())
                })?;
                builder = builder.add_child_data(self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(last_offset),
                )?);
            }
            DataType::FixedSizeList(inner_field, size) => {
                // FixedSizeListList is only stored by child data, as offsets are not required
                // because the size is known.
                let child_data = get_child_data(scope, obj)?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    Error::V8("Could not access index 0 on child_data".to_string())
                })?;
                builder = builder.add_child_data(self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(*size as usize * target_len),
                )?);
            }
            DataType::Struct(inner_fields) => {
                // Structs are only defined by child data
                let child_data = get_child_data(scope, obj)?;
                debug_assert_eq!(
                    child_data.length() as usize,
                    inner_fields.len(),
                    "Number of fields provided by JavaScript does not match expected number of \
                     fields"
                );
                for (i, inner_field) in (0..child_data.length()).zip(inner_fields) {
                    let child = child_data.get_index(scope, i as u32).ok_or_else(|| {
                        Error::V8(format!("Could not access index {i} on child_data"))
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
            // TODO: More types?
            data_type => return Err(Error::FlushType(data_type.clone())),
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

    fn flush_batch(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        changes: Array<'s>,
        batch: &mut ArrowBatch,
        schema: &Schema,
    ) -> Result<()> {
        for change_idx in 0..changes.length() {
            let change = changes.get_index(scope, change_idx as u32).ok_or_else(|| {
                Error::V8(format!("Could not access index {change_idx} on changes"))
            })?;
            let change = change.to_object(scope).ok_or_else(|| {
                Error::V8("Could not convert change from Value to Object".to_string())
            })?;

            let i_field = new_js_string(scope, "i_field");

            let i_field: v8::Local<'s, v8::Number> = change
                .get(scope, i_field.into())
                .ok_or_else(|| Error::V8("Could not get i_field property on change".to_string()))?
                .try_into()
                .map_err(|err| {
                    Error::V8(format!(
                        "Could not convert i_field from Value to Number: {err}"
                    ))
                })?;

            let i_field = i_field.value() as usize;
            let field = schema.field(i_field);

            let data = new_js_string(scope, "data");

            let data = change
                .get(scope, data.into())
                .ok_or_else(|| Error::V8("Could not get data property on change".to_string()))?;
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

    fn flush_group(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        agent_schema: &Arc<Schema>,
        msg_schema: &Arc<Schema>,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: Value<'s>,
    ) -> Result<()> {
        let changes = changes.to_object(scope).unwrap();

        let agent = new_js_string(scope, "agent");

        let agent_changes: Array<'s> = changes
            .get(scope, agent.into())
            .ok_or_else(|| Error::V8("Could not get agent property on changes".to_string()))?
            .try_into()
            .map_err(|err| {
                Error::V8(format!(
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

        let msg = new_js_string(scope, "msg");

        let msg_changes = changes
            .get(scope, msg.into())
            .ok_or_else(|| Error::V8("Could not get msg property on changes".to_string()))?
            .try_into()
            .map_err(|err| {
                Error::V8(format!(
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

    fn flush(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        shared_store: &mut TaskSharedStore,
        return_val: Object<'s>,
    ) -> Result<()> {
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
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        // Assuming cloning an Arc once is faster than looking up `state` in
        // the `sims_state` HashMap in every `flush_group` call.
        let agent_schema = state.agent_schema.clone();
        let msg_schema = state.msg_schema.clone();

        let changes = new_js_string(scope, "changes");

        let changes = return_val
            .get(scope, changes.into())
            .ok_or_else(|| Error::V8("Could not get changes property on return_val".to_string()))?;

        if group_indices.len() == 1 {
            self.flush_group(scope, &agent_schema, &msg_schema, proxy, 0, changes)?;
        } else {
            let changes: Array<'s> = changes.try_into().unwrap();
            for i_proxy in 0..group_indices.len() {
                // In principle, `i_proxy` and `group_indices[i_proxy]` can differ.
                let group_changes = changes.get_index(scope, i_proxy as u32).ok_or_else(|| {
                    Error::V8(format!("Could not access index {i_proxy} on changes"))
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

    /// Sim start:
    ///  - Hard-coded engine init
    ///  - Sim-level init of step packages (context, state, output)
    ///  - Run init packages (e.g. init.js)
    ///      - init.js can depend on globals, which vary between sim runs, so it has to be executed
    ///        at the start of a sim run, not at the start of the experiment run.
    fn start_sim(&mut self, scope: &mut v8::HandleScope<'s>, run: NewSimulationRun) -> Result<()> {
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
        .map_err(|err| Error::V8(format!("Could not run start_sim Function: {err}")))?;

        // Initialize Rust.
        let state = SimState {
            agent_schema: Arc::clone(&run.datastore.agent_batch_schema.arrow),
            msg_schema: Arc::clone(&run.datastore.message_batch_schema),
        };
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| Error::DuplicateSimulationRun(run.short_id))?;

        Ok(())
    }

    // TODO: DOC
    fn handle_task_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<()> {
        tracing::debug!("Starting state interim sync before running task");
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(scope, sim_id, &msg.shared_store)?;

        tracing::debug!("Setting up run_task function call");

        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                Error::from(format!("Failed to extract the inner task message: {err}"))
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
                // UserErrors and PackageErrors are not fatal to the Runner
                if let Error::User(errors) = error {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        span: Span::current(),
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::UserErrors(errors),
                    })?;
                } else if let Error::Package(package_error) = error {
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
        args: &[Value<'s>],
        sim_id: SimulationShortId,
        group_index: Option<usize>,
        package_id: PackageId,
        task_id: TaskId,
        wrapper: &serde_json::Value,
        mut shared_store: TaskSharedStore,
    ) -> Result<(
        TargetedRunnerTaskMsg,
        Option<Vec<UserWarning>>,
        Option<Vec<String>>,
    )> {
        tracing::debug!("Calling JS run_task");
        let return_val: Value<'s> =
            call_js_function(scope, self.embedded.run_task, self.this, args)
                .map_err(|err| Error::V8(format!("Could not run run_task Function: {err}")))?;
        let return_val = return_val.to_object(scope).ok_or_else(|| {
            Error::V8("Could not convert return_val from Value to Object".to_string())
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
                    Error::from(format!(
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

    fn ctx_batch_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        ctx_batch_sync: ContextBatchSync,
    ) -> Result<()> {
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
        let js_idxs = new_js_array_from_usizes(scope, &state_group_start_indices)?;
        let js_current_step = current_step_to_js(scope, current_step);
        call_js_function(scope, self.embedded.ctx_batch_sync, self.this, &[
            js_sim_id,
            js_batch_id,
            js_idxs,
            js_current_step,
        ])
        .map_err(|err| format!("Could not run ctx_batch_sync function: {err}"))?;

        Ok(())
    }

    fn state_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        msg: WaitableStateSync,
    ) -> Result<()> {
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
        call_js_function(scope, self.embedded.state_sync, self.this, &[
            js_sim_id, agent_pool, msg_pool,
        ])
        .map_err(|err| format!("Could not run state_sync Function: {err}"))?;

        tracing::trace!("Sending state sync completion");
        msg.completion_sender.send(Ok(())).map_err(|err| {
            Error::from(format!(
                "Couldn't send state sync completion to worker: {err:?}",
            ))
        })?;
        tracing::trace!("Sent state sync completion");

        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationShortId,
        shared_store: &TaskSharedStore,
    ) -> Result<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = batches_from_shared_store(shared_store)?;
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) =
            state_to_js(scope, agent_batches.into_iter(), msg_batches.into_iter())?;

        let js_sim_id = sim_id_to_js(scope, sim_id);
        let js_idxs = new_js_array_from_usizes(scope, &group_indices)?;
        call_js_function(scope, self.embedded.state_interim_sync, self.this, &[
            js_sim_id,
            js_idxs,
            agent_batches,
            msg_batches,
        ])
        .map_err(|err| Error::V8(format!("Could not call state_interim_sync Function: {err}")))?;

        Ok(())
    }

    fn state_snapshot_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationShortId,
        msg: StateSync,
    ) -> Result<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = state_to_js(scope, agent_pool, msg_pool)?;
        let sim_run_id = sim_id_to_js(scope, sim_run_id);
        call_js_function(scope, self.embedded.state_snapshot_sync, self.this, &[
            sim_run_id, agent_pool, msg_pool,
        ])
        .map_err(|err| format!("Could not run state_snapshot_sync Function: {err}"))?;

        // State snapshots are part of context, not state, so don't need to
        // sync Rust state pools.
        Ok(())
    }

    pub fn handle_msg(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<bool> {
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
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(Error::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("state sync"))?;
                self.state_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("interim sync"))?;
                self.state_interim_sync(scope, sim_id, &interim_msg.shared_store)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("snapshot sync"))?;
                self.state_snapshot_sync(scope, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("context batch sync"))?;
                self.ctx_batch_sync(scope, sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("run task"))?;
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

fn get_child_data<'s>(scope: &mut v8::HandleScope<'s>, obj: Object<'s>) -> Result<Array<'s>> {
    let child_data = new_js_string(scope, "child_data");

    obj.get(scope, child_data.into())
        .ok_or_else(|| Error::V8("Could not get child_data property on obj".to_string()))?
        .try_into()
        .map_err(|err| {
            Error::V8(format!(
                "Could not convert child_data from Value to Array: {err}"
            ))
        })
}

pub struct JavaScriptRunner {
    // `JavaScriptRunner` and `ThreadLocalRunner` are separate because the V8 Isolate inside
    // `ThreadLocalRunner` can't be sent between threads.
    init_msg: Arc<ExperimentInitRunnerMsg>,
    // Args to `ThreadLocalRunner::new`
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
        tracing::trace!("Sending message to JavaScript: {msg:?}");
        self.inbound_sender
            .send((Span::current(), sim_id, msg))
            .map_err(|err| Error::InboundSend(err).into())
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
            .ok_or_else(|| Error::OutboundReceive.into())
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
        let inbound_receiver = self.inbound_receiver.take().ok_or(Error::AlreadyRunning)?;
        let outbound_sender = self.outbound_sender.take().ok_or(Error::AlreadyRunning)?;

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
        .map_err(|err| Error::IO("Local tokio runtime".into(), err))?;

    tokio::pin! {
        let impl_future = async {
            let platform = v8::new_default_platform(0, false).make_shared();
            v8::V8::initialize_platform(platform);
            v8::V8::initialize();

            let mut create_params = v8::Isolate::create_params();

            create_params = match (
                init_msg.js_runner_initial_heap_constraint,
                init_msg.js_runner_max_heap_size,
            ) {
                (None, None) => create_params,
                (None, Some(js_runner_max_heap_size)) => {
                    create_params.heap_limits(0, js_runner_max_heap_size * MB)
                }
                (Some(js_runner_initial_heap_constraint), None) => {
                    create_params.heap_limits(js_runner_initial_heap_constraint * MB, 0)
                }
                (Some(js_runner_initial_heap_constraint), Some(js_runner_max_heap_size)) => {
                    create_params.heap_limits(js_runner_initial_heap_constraint * MB, js_runner_max_heap_size * MB)
                }
            };

            let mut isolate = v8::Isolate::new(create_params);

            isolate.add_near_heap_limit_callback(
                near_heap_limit_callback,
                // The callback does not need additional data
                std::ptr::null_mut(),
            );

            let mut handle_scope = v8::HandleScope::new(&mut isolate);
            let context = v8::Context::new(&mut handle_scope);
            let mut context_scope = v8::ContextScope::new(&mut handle_scope, context);

            let mut thread_local_runner = ThreadLocalRunner::new(&mut context_scope, context, &init_msg)?;

            loop {
                match inbound_receiver.recv().await {
                    Some((span, sim_id, msg)) => {
                        let _span = span.entered();
                        // TODO: Send errors instead of immediately stopping?
                        let msg_str = msg.as_str();
                        tracing::debug!("JS runner got sim `{sim_id:?}` inbound {msg_str}");
                        let keep_running = thread_local_runner.handle_msg(
                            &mut context_scope,
                            sim_id,
                            msg,
                            &outbound_sender,
                        )?;
                        tracing::debug!("JS runner handled sim `{sim_id:?}` inbound {msg_str}");
                        if !keep_running {
                            tracing::debug!("JavaScript Runner has finished execution, stopping");
                            break;
                        }
                    }
                    None => {
                        tracing::error!("Inbound sender to JS exited");
                        return Err(Error::InboundReceive.into());
                    }
                }
            }

            Ok(())
        }.in_current_span();
    };

    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, impl_future)
}

/// Helper function to create a [v8::String]
fn new_js_string<'s>(
    scope: &mut v8::HandleScope<'s>,
    s: impl AsRef<str>,
) -> v8::Local<'s, v8::String> {
    let s = s.as_ref();
    v8::String::new(scope, s).expect(&format!("Could not create JS String: {s}"))
}

// Returns the new max heap size.
extern "C" fn near_heap_limit_callback(
    // This pointer is null, don't do anything with it.
    _data: *mut std::ffi::c_void,
    current_heap_limit: usize,
    _initial_heap_limit: usize,
) -> usize {
    tracing::warn!(
        "V8 max heap limit almost reached! Use the '--v8-max-heap-constraint' argument to raise \
         the limit."
    );

    // We don't increate the max heap limit.
    current_heap_limit
}
