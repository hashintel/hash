mod error;
mod mini_v8;

use std::{
    collections::HashMap, fs, future::Future, pin::Pin, ptr::NonNull, result::Result as StdResult,
    slice, sync::Arc,
};

use arrow::{
    array::{ArrayData, BooleanBufferBuilder, BufferBuilder},
    buffer::Buffer,
    datatypes::{ArrowNativeType, DataType, Schema},
    ipc::writer::{IpcDataGenerator, IpcWriteOptions},
    util::bit_util,
};
use futures::FutureExt;
use mv8::MiniV8;
use regex::internal::Input;
use tokio::{
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};
use tracing::{Instrument, Span};

pub use self::error::{Error, Result};
use self::mini_v8 as mv8;
use super::comms::{
    inbound::InboundToRunnerMsgPayload,
    outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload},
    ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, TargetedRunnerTaskMsg,
};
use crate::{
    config::Globals,
    datastore::{
        arrow::util::arrow_continuation,
        batch::{change::ColumnChange, ArrowBatch, Metaversion},
        prelude::{AgentBatch, MessageBatch, SharedStore},
        storage::memory::Memory,
        table::{
            proxy::StateWriteProxy,
            sync::{ContextBatchSync, StateSync, WaitableStateSync},
            task_shared_store::{PartialSharedState, SharedState},
        },
    },
    proto::SimulationShortId,
    simulation::{
        enum_dispatch::TaskSharedStore,
        package::{id::PackageId, PackageType},
    },
    types::TaskId,
    worker::{
        runner::{
            comms::outbound::{PackageError, UserError, UserWarning},
            javascript::mv8::Values,
        },
        Error as WorkerError, Result as WorkerResult, TaskMessage,
    },
    Language,
};

struct JsPackage<'m> {
    fns: mv8::Array<'m>,
}

fn get_pkg_path(name: &str, pkg_type: PackageType) -> String {
    format!(
        "./src/simulation/package/{}/packages/{}/package.js",
        pkg_type.as_str(),
        name
    )
}

/// TODO: DOC add docstrings on impl'd methods
impl<'m> JsPackage<'m> {
    fn import(
        mv8: &'m MiniV8,
        embedded: &Embedded<'m>,
        name: &str,
        pkg_type: PackageType,
    ) -> Result<Self> {
        let path = get_pkg_path(name, pkg_type);
        tracing::debug!("Importing package from path `{}`", &path);
        let code = match fs::read_to_string(path.clone()) {
            Ok(s) => s,
            Err(_) => {
                tracing::debug!("Couldn't read package file. It might intentionally not exist.");
                // Packages don't have to use JS.
                let fns = mv8.create_array();
                fns.set(0, mv8::Value::Undefined)?;
                fns.set(1, mv8::Value::Undefined)?;
                fns.set(2, mv8::Value::Undefined)?;
                return Ok(JsPackage { fns });
            }
        };

        // Avoid JS ReferenceError by wrapping potentially undeclared variables with `typeof`.
        // (Double braces like `{{` are Rust's escape string for a single literal `{`.)
        let wrapped_code = format!(
            "((hash_util, hash_stdlib)=>{{{}
            return [
                typeof start_experiment === 'undefined' ? undefined : start_experiment,
                typeof start_sim === 'undefined' ? undefined : start_sim,
                typeof run_task === 'undefined' ? undefined : run_task
            ]}})",
            code
        );
        let pkg: mv8::Function<'_> = mv8
            .eval(wrapped_code)
            .map_err(|e| Error::PackageImport(path.clone(), e.into()))?;
        let args = mv8::Values::from_vec(vec![
            embedded.hash_util.clone(),
            embedded.hash_stdlib.clone(),
        ]);

        let fns: mv8::Array<'_> = pkg
            .call(args)
            .map_err(|e| Error::PackageImport(path.clone(), e.into()))?;
        if fns.len() != 3 {
            return Err(Error::PackageImport(path.clone(), "Stray return".into()));
        }

        // Validate returned array.
        let fn_names = ["start_experiment", "start_sim", "run_task"];
        for (elem, fn_name) in fns.clone().elements().zip(fn_names) {
            let elem: mv8::Value<'_> = elem.map_err(|e| {
                Error::PackageImport(path.clone(), format!("Couldn't index array: {:?}", e))
            })?;
            if !(elem.is_function() || elem.is_undefined()) {
                return Err(Error::PackageImport(
                    path.clone(),
                    format!("{} should be a function, not {:?}", fn_name, elem),
                ));
            }
        }
        assert_eq!(fns.len(), 3);

        Ok(JsPackage { fns })
    }
}

/// Embedded JS of runner itself (from hardcoded paths)
struct Embedded<'m> {
    hash_stdlib: mv8::Value<'m>,
    hash_util: mv8::Value<'m>,

    start_experiment: mv8::Function<'m>,
    start_sim: mv8::Function<'m>,
    run_task: mv8::Function<'m>,
    ctx_batch_sync: mv8::Function<'m>,
    state_sync: mv8::Function<'m>,
    state_interim_sync: mv8::Function<'m>,
    state_snapshot_sync: mv8::Function<'m>,
}

fn read_file(path: &str) -> Result<String> {
    fs::read_to_string(path).map_err(|e| Error::IO(path.into(), e))
}

fn eval_file<'m>(mv8: &'m MiniV8, path: &str) -> Result<mv8::Value<'m>> {
    let code = read_file(path)?;
    let v: mv8::Value<'_> = mv8
        .eval(code)
        .map_err(|e| Error::Eval(path.into(), e.into()))?;
    Ok(v)
}

fn import_file<'m>(
    mv8: &'m MiniV8,
    path: &str,
    args: Vec<&mv8::Value<'m>>,
) -> Result<mv8::Value<'m>> {
    let v = eval_file(mv8, path)?;
    let f = v
        .as_function()
        .ok_or_else(|| Error::FileImport(path.into(), format!("Failed to wrap file: {:?}", &v)))?;

    let args = {
        let mut a = Vec::new();
        for arg in args {
            a.push(arg.clone());
        }
        a
    };
    let args = mv8::Values::from_vec(args);
    let imported = f
        .call(args)
        .map_err(|e| Error::FileImport(path.into(), e.into()))?;

    Ok(imported)
}

impl<'m> Embedded<'m> {
    fn import(mv8: &'m MiniV8) -> Result<Self> {
        let arrow = eval_file(mv8, "./src/worker/runner/javascript/apache-arrow-bundle.js")?;
        let hash_stdlib = eval_file(mv8, "./src/worker/runner/javascript/hash_stdlib.js")?;
        let hash_util = import_file(mv8, "./src/worker/runner/javascript/hash_util.js", vec![
            &arrow,
        ])?;
        let batches_prototype = import_file(mv8, "./src/worker/runner/javascript/batch.js", vec![
            &arrow, &hash_util,
        ])?;

        let ctx_import = import_file(mv8, "./src/worker/runner/javascript/context.js", vec![
            &hash_util,
        ])?;
        let ctx_import = ctx_import.as_array().ok_or_else(|| {
            Error::FileImport(
                "./src/worker/runner/javascript/context.js".into(),
                "Couldn't get array (of functions) from 'context.js'".into(),
            )
        })?;
        let experiment_ctx_prototype = ctx_import.get(0)?;
        let sim_init_ctx_prototype = ctx_import.get(1)?;
        let gen_ctx = ctx_import.get(2)?;

        let gen_state = import_file(mv8, "./src/worker/runner/javascript/state.js", vec![
            &hash_util,
        ])?;
        let fns = import_file(mv8, "./src/worker/runner/javascript/runner.js", vec![
            &arrow,
            &batches_prototype,
            &experiment_ctx_prototype,
            &sim_init_ctx_prototype,
            &gen_ctx,
            &gen_state,
        ])?;
        let fns = fns.as_array().ok_or_else(|| {
            Error::FileImport(
                "./src/worker/runner/javascript/runner.js".into(),
                "Couldn't get array (of functions) from 'runner.js'".into(),
            )
        })?;
        Ok(Self {
            hash_stdlib,
            hash_util,
            start_experiment: fns.get(0)?,
            start_sim: fns.get(1)?,
            run_task: fns.get(2)?,
            ctx_batch_sync: fns.get(3)?,
            state_sync: fns.get(4)?,
            state_interim_sync: fns.get(5)?,
            state_snapshot_sync: fns.get(6)?,
        })
    }
}

/// Due to flushing, need batches and schemas in both Rust and JS.
struct SimState {
    agent_schema: Arc<Schema>,
    msg_schema: Arc<Schema>,
}

struct RunnerImpl<'m> {
    embedded: Embedded<'m>,
    this: mv8::Value<'m>,
    sims_state: HashMap<SimulationShortId, SimState>,
}

// we pass in _mv8 for the return values lifetime
fn sim_id_to_js(_mv8: &MiniV8, sim_id: SimulationShortId) -> mv8::Value<'_> {
    mv8::Value::Number(sim_id as f64)
}

// we pass in _mv8 for the return values lifetime
fn pkg_id_to_js(_mv8: &MiniV8, pkg_id: PackageId) -> mv8::Value<'_> {
    mv8::Value::Number(pkg_id.as_usize() as f64)
}

fn idxs_to_js<'m>(mv8: &'m MiniV8, idxs: &[usize]) -> Result<mv8::Value<'m>> {
    let a = mv8.create_array();
    for (i, idx) in idxs.iter().enumerate() {
        a.set(i as u32, mv8::Value::Number(*idx as u32 as f64))?;
    }
    Ok(mv8::Value::Array(a))
}

// we pass in _mv8 for the return values lifetime
fn current_step_to_js(_mv8: &MiniV8, current_step: usize) -> mv8::Value<'_> {
    mv8::Value::Number(current_step as f64)
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

fn mem_batch_to_js<'m>(
    mv8: &'m MiniV8,
    batch_id: &str,
    mem: mv8::Object<'m>,
    persisted: Metaversion,
) -> Result<mv8::Value<'m>> {
    let batch = mv8.create_object();
    let batch_id = mv8.create_string(batch_id);
    batch.set("id", mv8::Value::String(batch_id))?;
    batch.set("mem", mem)?;
    batch.set("mem_version", persisted.memory())?;
    batch.set("batch_version", persisted.batch())?;
    Ok(mv8::Value::Object(batch))
}

fn batch_to_js<'m>(
    mv8: &'m MiniV8,
    mem: &Memory,
    persisted: Metaversion,
) -> Result<mv8::Value<'m>> {
    // TODO: Is `mem.data.len()` different from `mem.size`? (like Vec capacity vs len?)
    let arraybuffer = mv8.create_arraybuffer(mem.data.as_ptr(), mem.size);
    let batch_id = mem.id();
    mem_batch_to_js(mv8, batch_id, arraybuffer, persisted)
}

fn state_to_js<'m, 'a, 'b>(
    mv8: &'m MiniV8,
    mut agent_batches: impl Iterator<Item = &'a AgentBatch>,
    mut message_batches: impl Iterator<Item = &'b MessageBatch>,
) -> Result<(mv8::Value<'m>, mv8::Value<'m>)> {
    let js_agent_batches = mv8.create_array();
    let js_message_batches = mv8.create_array();

    for (i_batch, (agent_batch, message_batch)) in agent_batches
        .by_ref()
        .zip(message_batches.by_ref())
        .enumerate()
    {
        let agent_batch = batch_to_js(
            mv8,
            agent_batch.batch.segment().memory(),
            agent_batch.batch.segment().persisted_metaversion(),
        )?;
        js_agent_batches.set(i_batch as u32, agent_batch)?;

        let message_batch = batch_to_js(
            mv8,
            message_batch.batch.segment().memory(),
            message_batch.batch.segment().persisted_metaversion(),
        )?;
        js_message_batches.set(i_batch as u32, message_batch)?;
    }

    debug_assert!(
        agent_batches.count() == 0 && message_batches.count() == 0,
        "Agent batches and message batches needs to have the same size"
    );

    Ok((
        mv8::Value::Array(js_agent_batches),
        mv8::Value::Array(js_message_batches),
    ))
}

fn bytes_to_js<'m>(mv8: &'m MiniV8, bytes: &mut [u8]) -> mv8::Value<'m> {
    mv8::Value::Object(mv8.create_arraybuffer(bytes.as_mut_ptr(), bytes.len()))
}

fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let ipc_data_generator = IpcDataGenerator::default();
    let content = ipc_data_generator.schema_to_bytes(schema, &IpcWriteOptions::default());
    let mut stream_bytes = arrow_continuation(content.ipc_message.len());
    stream_bytes.extend_from_slice(&content.ipc_message);
    stream_bytes
}

fn array_to_user_errors(array: mv8::Value<'_>) -> Vec<UserError> {
    let fallback = format!("Unparsed: {:?}", array);

    if let mv8::Value::Array(array) = array {
        let errors = array
            .elements()
            .map(|e: mv8::Result<'_, mv8::Value<'_>>| e.map(|e| UserError(format!("{e:?}"))))
            .collect();

        if let Ok(errors) = errors {
            return errors;
        } // else unparsed
    } // else unparsed

    vec![UserError(fallback)]
}

fn array_to_user_warnings(array: mv8::Value<'_>) -> Vec<UserWarning> {
    // TODO: Extract optional line numbers
    let fallback = format!("Unparsed: {:?}", array);

    if let mv8::Value::Array(array) = array {
        let warnings = array
            .elements()
            .map(|e: mv8::Result<'_, mv8::Value<'_>>| {
                e.map(|e| UserWarning {
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

fn get_js_error(_mv8: &MiniV8, return_val: &mv8::Object<'_>) -> Option<Error> {
    if let Ok(errors) = return_val.get("user_errors") {
        if !matches!(errors, mv8::Value::Undefined) && !matches!(errors, mv8::Value::Null) {
            let errors = array_to_user_errors(errors);
            if !errors.is_empty() {
                return Some(Error::User(errors));
            }
        }
    }

    if let Ok(mv8::Value::String(e)) = return_val.get("pkg_error") {
        // TODO: Don't silently ignore non-string, non-null-or-undefined errors
        //       (try to convert error value to JSON string and return as error?).
        return Some(Error::Package(PackageError(e.to_string())));
    }

    if let Ok(mv8::Value::String(e)) = return_val.get("runner_error") {
        // TODO: Don't ignore non-string, non-null-or-undefined errors
        return Some(Error::Embedded(e.to_string()));
    }

    None
}

fn get_user_warnings(_mv8: &MiniV8, return_val: &mv8::Object<'_>) -> Option<Vec<UserWarning>> {
    if let Ok(warnings) = return_val.get::<&str, mv8::Value<'_>>("user_warnings") {
        if !(warnings.is_undefined() || warnings.is_null()) {
            let warnings = array_to_user_warnings(warnings);
            if !warnings.is_empty() {
                return Some(warnings);
            }
        }
    }
    None
}

fn get_print(_mv8: &MiniV8, return_val: &mv8::Object<'_>) -> Option<Vec<String>> {
    if let Ok(mv8::Value::String(printed_val)) = return_val.get("print") {
        let printed_val = printed_val.to_string();
        if !printed_val.is_empty() {
            Some(printed_val.split('\n').map(|s| s.to_string()).collect())
        } else {
            None
        }
    } else {
        None
    }
}

fn get_next_task(_mv8: &MiniV8, return_val: &mv8::Object<'_>) -> Result<(MessageTarget, String)> {
    let target = if let Ok(mv8::Value::String(target)) = return_val.get("target") {
        let target = target.to_string();
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
    };

    let next_task_payload = if let Ok(mv8::Value::String(s)) = return_val.get("task") {
        s.to_string()
    } else {
        // TODO: Don't silently ignore non-string, non-null-or-undefined payloads
        "{}".to_string()
    };
    Ok((target, next_task_payload))
}

impl<'m> RunnerImpl<'m> {
    fn load_datasets(mv8: &'m MiniV8, shared_ctx: &SharedStore) -> Result<mv8::Value<'m>> {
        let js_datasets = mv8.create_object();
        for (dataset_name, dataset) in shared_ctx.datasets.iter() {
            let js_name = mv8.create_string(dataset_name.as_str());

            let json = dataset.data();
            // TODO: Use `from_utf8_unchecked` instead here?
            //       (Since datasets' json can be quite large.)
            let json =
                std::str::from_utf8(json).map_err(|_| Error::Unique("Dataset not utf8".into()))?;
            let json = mv8.create_string(json);

            js_datasets.set(js_name, json)?;
        }
        Ok(mv8::Value::Object(js_datasets))
    }

    pub fn new(mv8: &'m MiniV8, init: &ExperimentInitRunnerMsg) -> Result<Self> {
        let embedded = Embedded::import(mv8)?;
        let datasets = Self::load_datasets(mv8, &init.shared_context)?;

        let pkg_fns = mv8.create_array();
        let pkg_init_msgs = mv8.create_array();
        let pkg_config = &init.package_config.0;
        for (i_pkg, pkg_init) in pkg_config.values().enumerate() {
            let i_pkg = i_pkg as u32;

            let pkg_name = format!("{}", &pkg_init.name);
            let pkg = JsPackage::import(mv8, &embedded, &pkg_name, pkg_init.r#type)?;
            tracing::trace!(
                "pkg experiment init name {:?}, type {}, fns {:?}",
                &pkg_init.name,
                &pkg_init.r#type.as_str(),
                &pkg.fns,
            );
            pkg_fns.set(i_pkg, pkg.fns)?;

            let pkg_init = serde_json::to_string(&pkg_init).unwrap();
            let pkg_init = mv8.create_string(&pkg_init);
            pkg_init_msgs.set(i_pkg, pkg_init)?;
        }

        let this = mv8::Value::Object(mv8.create_object());
        let args = mv8::Values::from_vec(vec![
            datasets,
            mv8::Value::Array(pkg_init_msgs),
            mv8::Value::Array(pkg_fns),
        ]);
        embedded.start_experiment.call_method(this.clone(), args)?;
        Ok(Self {
            embedded,
            this,
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
        mv8: &'m MiniV8,
        data: &mv8::Value<'m>,
        data_type: &DataType,
        len: Option<usize>,
    ) -> Result<ArrayData> {
        // `data` must not be dropped until flush is over, because
        // pointers returned from FFI point inside `data`'s ArrayBuffers' memory.
        let obj = data.as_object().ok_or_else(|| {
            Error::Embedded(format!("Flush data not object for field {:?}", data_type))
        })?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data: mv8::DataFfi = mv8.data_node_from_js(data);

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

                let child_data: mv8::Array<'_> = obj.get("child_data")?;
                builder = builder.add_child_data(self.array_data_from_js(
                    mv8,
                    &child_data.get(0)?,
                    inner_field.data_type(),
                    Some(last_offset),
                )?);
            }
            DataType::FixedSizeList(inner_field, size) => {
                // FixedSizeListList is only stored by child data, as offsets are not required
                // because the size is known.
                let child_data: mv8::Array<'_> = obj.get("child_data")?;
                builder = builder.add_child_data(self.array_data_from_js(
                    mv8,
                    &child_data.get(0)?,
                    inner_field.data_type(),
                    Some(*size as usize * target_len),
                )?);
            }
            DataType::Struct(inner_fields) => {
                // Structs are only defined by child data
                let child_data: mv8::Array<'_> = obj.get("child_data")?;
                debug_assert_eq!(
                    child_data.len() as usize,
                    inner_fields.len(),
                    "Number of fields provided by JavaScript does not match expected number of \
                     fields"
                );
                for (child, inner_field) in child_data.elements().zip(inner_fields) {
                    builder = builder.add_child_data(self.array_data_from_js(
                        mv8,
                        &child?,
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
            data_type => return Err(Error::FlushType(data_type.clone())), // TODO: More types?
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
        mv8: &'m MiniV8,
        changes: mv8::Array<'m>,
        batch: &mut ArrowBatch,
        schema: &Schema,
    ) -> Result<()> {
        for change in changes.elements() {
            let change: mv8::Object<'_> = change?;

            let i_field: f64 = change.get("i_field")?;
            let i_field = i_field as usize;
            let field = schema.field(i_field);

            let data: mv8::Value<'_> = change.get("data")?;
            let data = self.array_data_from_js(mv8, &data, field.data_type(), None)?;
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
        mv8: &'m MiniV8,
        agent_schema: &Arc<Schema>,
        msg_schema: &Arc<Schema>,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: mv8::Value<'m>,
    ) -> Result<()> {
        let changes = changes.as_object().unwrap();

        let agent_changes = changes.get("agent")?;
        self.flush_batch(
            mv8,
            agent_changes,
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access proxy at index {i_proxy}"))?
                .batch,
            agent_schema,
        )?;

        let msg_changes = changes.get("msg")?;
        self.flush_batch(
            mv8,
            msg_changes,
            &mut state_proxy
                .message_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access proxy at index {i_proxy}"))?
                .batch,
            msg_schema,
        )?;

        Ok(())
    }

    fn flush(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        shared_store: &mut TaskSharedStore,
        return_val: &mv8::Object<'m>,
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

        let changes: mv8::Value<'_> = return_val.get("changes")?;
        if group_indices.len() == 1 {
            self.flush_group(mv8, &agent_schema, &msg_schema, proxy, 0, changes)?;
        } else {
            let changes = changes.as_array().unwrap();
            for i_proxy in 0..group_indices.len() {
                // In principle, `i_proxy` and `group_indices[i_proxy]` can differ.
                let group_changes = changes.get(i_proxy as u32)?;
                self.flush_group(
                    mv8,
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
    fn start_sim(&mut self, mv8: &'m MiniV8, run: NewSimulationRun) -> Result<()> {
        // Initialize JS.

        // Passing in schemas with an immutable reference is allowed,
        // and getting a `*mut` to them is also allowed, but if Javascript
        // *actually* mutates the contents of a schema, it will cause
        // undefined behavior, because the pointer to the schema comes from
        // an immutable reference.
        // ---> Do *not* mutate the schema bytes in `runner.js`.
        let mut agent_schema_bytes =
            schema_to_stream_bytes(&run.datastore.agent_batch_schema.arrow);
        let mut msg_schema_bytes = schema_to_stream_bytes(&run.datastore.message_batch_schema);
        let mut ctx_schema_bytes = schema_to_stream_bytes(&run.datastore.context_batch_schema);
        // run.shared_context.datasets?

        // Keep schema vecs alive while bytes are passed to V8.
        let agent_schema_bytes = bytes_to_js(mv8, &mut agent_schema_bytes);
        let msg_schema_bytes = bytes_to_js(mv8, &mut msg_schema_bytes);
        let ctx_schema_bytes = bytes_to_js(mv8, &mut ctx_schema_bytes);

        let pkg_ids = mv8.create_array();
        let pkg_msgs = mv8.create_array();
        for (i_pkg, (pkg_id, pkg_msg)) in run.packages.0.iter().enumerate() {
            let i_pkg = i_pkg as u32;
            pkg_ids.set(i_pkg, pkg_id_to_js(mv8, *pkg_id))?;
            let payload = serde_json::to_string(&pkg_msg.payload).unwrap();
            pkg_msgs.set(i_pkg, mv8.create_string(&payload))?;
        }

        let globals: &Globals = &run.globals;
        let globals = serde_json::to_string(globals).unwrap();
        let globals = mv8.create_string(&globals);

        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, run.short_id),
            agent_schema_bytes,
            msg_schema_bytes,
            ctx_schema_bytes,
            mv8::Value::Array(pkg_ids),
            mv8::Value::Array(pkg_msgs),
            mv8::Value::String(globals),
        ]);
        self.embedded
            .start_sim
            .call_method(self.this.clone(), args)?;

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
        mv8: &'m MiniV8,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<()> {
        tracing::debug!("Starting state interim sync before running task");
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(mv8, sim_id, &msg.shared_store)?;

        tracing::debug!("Setting up run_task function call");

        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                Error::from(format!("Failed to extract the inner task message: {err}"))
            })?;
        let payload_str = mv8::Value::String(mv8.create_string(&serde_json::to_string(&payload)?));
        let group_index = match msg.group_index {
            None => mv8::Value::Undefined,
            Some(val) => mv8::Value::Number(val as f64),
        };
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_id),
            group_index,
            pkg_id_to_js(mv8, msg.package_id),
            payload_str.clone(),
        ]);

        let run_task_result = self.run_task(
            mv8,
            args,
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
        mv8: &'m MiniV8,
        args: Values<'m>,
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
        let return_val: mv8::Object<'_> = self
            .embedded
            .run_task
            .call_method(self.this.clone(), args)?;

        tracing::debug!("Post-processing run_task result");
        if let Some(error) = get_js_error(mv8, &return_val) {
            return Err(error);
        }
        let user_warnings = get_user_warnings(mv8, &return_val);
        let logs = get_print(mv8, &return_val);
        let (next_target, next_task_payload) = get_next_task(mv8, &return_val)?;

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
        self.flush(mv8, sim_id, &mut shared_store, &return_val)?;

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
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        ctx_batch_sync: ContextBatchSync,
    ) -> Result<()> {
        let ContextBatchSync {
            context_batch,
            current_step,
            state_group_start_indices,
        } = ctx_batch_sync;

        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            batch_to_js(
                mv8,
                context_batch.segment().memory(),
                context_batch.segment().persisted_metaversion(),
            )?,
            idxs_to_js(mv8, &state_group_start_indices)?,
            current_step_to_js(mv8, current_step),
        ]);
        let _: mv8::Value<'_> = self
            .embedded
            .ctx_batch_sync
            .call_method(self.this.clone(), args)?;
        Ok(())
    }

    fn state_sync(
        &mut self,
        mv8: &'m MiniV8,
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
        let (agent_pool, msg_pool) = state_to_js(mv8, agent_pool, msg_pool)?;
        let args = mv8::Values::from_vec(vec![sim_id_to_js(mv8, sim_run_id), agent_pool, msg_pool]);
        let _: mv8::Value<'_> = self
            .embedded
            .state_sync
            .call_method(self.this.clone(), args)?;

        tracing::trace!("Sending state sync completion");
        msg.completion_sender.send(Ok(())).map_err(|e| {
            Error::from(format!(
                "Couldn't send state sync completion to worker: {:?}",
                e
            ))
        })?;
        tracing::trace!("Sent state sync completion");
        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_id: SimulationShortId,
        shared_store: &TaskSharedStore,
    ) -> Result<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = batches_from_shared_store(shared_store)?;
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) =
            state_to_js(mv8, agent_batches.into_iter(), msg_batches.into_iter())?;
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_id),
            idxs_to_js(mv8, &group_indices)?,
            agent_batches,
            msg_batches,
        ]);
        let _: mv8::Value<'_> = self
            .embedded
            .state_interim_sync
            .call_method(self.this.clone(), args)?;
        Ok(())
    }

    fn state_snapshot_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        msg: StateSync,
    ) -> Result<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = state_to_js(mv8, agent_pool, msg_pool)?;
        let sim_run_id = sim_id_to_js(mv8, sim_run_id);
        let args = mv8::Values::from_vec(vec![sim_run_id, agent_pool, msg_pool]);
        let _: mv8::Value<'_> = self
            .embedded
            .state_snapshot_sync
            .call_method(self.this.clone(), args)?;

        // State snapshots are part of context, not state, so don't need to
        // sync Rust state pools.
        Ok(())
    }

    pub fn handle_msg(
        &mut self,
        mv8: &'m MiniV8,
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
                self.start_sim(mv8, new_run)?;
            }
            InboundToRunnerMsgPayload::TerminateSimulationRun => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(Error::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("state sync"))?;
                self.state_sync(mv8, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("interim sync"))?;
                self.state_interim_sync(mv8, sim_id, &interim_msg.shared_store)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("snapshot sync"))?;
                self.state_snapshot_sync(mv8, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("context batch sync"))?;
                self.ctx_batch_sync(mv8, sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("run task"))?;
                self.handle_task_msg(mv8, sim_id, msg, outbound_sender)?;
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {}
        }
        Ok(true) // Continue running.
    }
}

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
            .map_err(|e| WorkerError::JavaScript(Error::InboundSend(e)))
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
            .ok_or(WorkerError::JavaScript(Error::OutboundReceive))
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
    ) -> WorkerResult<Pin<Box<dyn Future<Output = StdResult<WorkerResult<()>, JoinError>> + Send>>>
    {
        // TODO: Move tokio spawn into worker?
        tracing::debug!("Running JavaScript runner");
        if !self.spawn {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        let init_msg = Arc::clone(&self.init_msg);
        let inbound_receiver = self.inbound_receiver.take().ok_or(Error::AlreadyRunning)?;
        let outbound_sender = self.outbound_sender.take().ok_or(Error::AlreadyRunning)?;

        let f = || _run(init_msg, inbound_receiver, outbound_sender);
        Ok(Box::pin(tokio::task::spawn_blocking(f)))
    }
}

fn _run(
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
        .map_err(|e| Error::IO("Local tokio runtime".into(), e))?;

    tokio::pin! {
        let impl_future = async {
            let mv8 = MiniV8::new();
            let mut impl_ = RunnerImpl::new(&mv8, &init_msg)?;
            loop {
                tokio::select! {
                    Some((span, sim_id, msg)) = inbound_receiver.recv() => {
                        let _span = span.entered();
                        // TODO: Send errors instead of immediately stopping?
                        let msg_str = msg.as_str();
                        tracing::debug!("JS runner got sim `{:?}` inbound {}", &sim_id, msg_str);
                        let keep_running = impl_.handle_msg(&mv8, sim_id, msg, &outbound_sender)?;
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
