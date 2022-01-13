mod error;
mod mini_v8;

use std::{
    collections::HashMap, fs, future::Future, pin::Pin, result::Result as StdResult, sync::Arc,
};

use arrow::{
    array::{ArrayData, ArrayDataRef},
    buffer::{Buffer, MutableBuffer},
    datatypes::{DataType, Schema},
    ipc::writer::schema_to_bytes,
};
use futures::FutureExt;
use mv8::MiniV8;
use tokio::{
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};

pub use self::error::{Error, Result};
use self::mini_v8 as mv8;
use super::comms::{
    inbound::InboundToRunnerMsgPayload,
    outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
    ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, TargetedRunnerTaskMsg,
};
use crate::{
    config::Globals,
    datastore::{
        arrow::util::arrow_continuation,
        batch::{change::ArrayChange, Batch, DynamicBatch, Metaversion},
        prelude::{AgentBatch, MessageBatch, SharedStore},
        storage::memory::Memory,
        table::{
            pool::{agent::AgentPool, message::MessagePool, BatchPool},
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
    worker::{Error as WorkerError, Result as WorkerResult, TaskMessage},
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
        log::debug!("Importing package from path `{}`", &path);
        let code = match fs::read_to_string(path.clone()) {
            Ok(s) => s,
            Err(_) => {
                log::debug!("Couldn't read package file. It might intentionally not exist.");
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
        let arrow = eval_file(mv8, "./src/worker/runner/javascript/bundle_arrow.js")?;
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
    agent_pool: AgentPool,
    msg_pool: MessagePool,
}

struct RunnerImpl<'m> {
    embedded: Embedded<'m>,
    this: mv8::Value<'m>,
    sims_state: HashMap<SimulationShortId, SimState>,
}

// we pass in _mv8 for the return values lifetime
fn sim_id_to_js(_mv8: &MiniV8, sim_run_id: SimulationShortId) -> mv8::Value<'_> {
    mv8::Value::Number(sim_run_id as f64)
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
            (0..state.agent_pool().n_batches()).collect(),
        ),
        SharedState::Read(state) => (
            state.agent_pool().batches(),
            state.message_pool().batches(),
            (0..state.agent_pool().n_batches()).collect(),
        ),
        SharedState::Partial(partial) => {
            match partial {
                PartialSharedState::Read(partial) => (
                    partial.inner.agent_pool().batches(),
                    partial.inner.message_pool().batches(),
                    partial.indices.clone(), // TODO: Avoid cloning?
                ),
                PartialSharedState::Write(partial) => (
                    partial.inner.agent_pool().batches(),
                    partial.inner.message_pool().batches(),
                    partial.indices.clone(), // TODO: Avoid cloning?
                ),
            }
        }
    })
}

fn mem_batch_to_js<'m>(
    mv8: &'m MiniV8,
    batch_id: &str,
    mem: mv8::Object<'m>,
    metaversion: &Metaversion,
) -> Result<mv8::Value<'m>> {
    let batch = mv8.create_object();
    let batch_id = mv8.create_string(batch_id);
    batch.set("id", mv8::Value::String(batch_id))?;
    batch.set("mem", mem)?;
    batch.set("mem_version", metaversion.memory())?;
    batch.set("batch_version", metaversion.batch())?;
    Ok(mv8::Value::Object(batch))
}

fn batch_to_js<'m>(
    mv8: &'m MiniV8,
    mem: &Memory,
    metaversion: &Metaversion,
) -> Result<mv8::Value<'m>> {
    // TODO: Is `mem.data.len()` different from `mem.size`? (like Vec capacity vs len?)
    let arraybuffer = mv8.create_arraybuffer(mem.data.as_ptr(), mem.size);
    let batch_id = mem.get_id();
    mem_batch_to_js(mv8, batch_id, arraybuffer, metaversion)
}

fn _mut_batch_to_js<'m>(
    mv8: &'m MiniV8,
    mem: &mut Memory,
    metaversion: &Metaversion,
) -> Result<mv8::Value<'m>> {
    // TODO: Is `mem.data.len()` different from `mem.size`?
    let arraybuffer = mv8.create_arraybuffer(mem.as_mut_ptr(), mem.size);
    let batch_id = mem.get_id();
    mem_batch_to_js(mv8, batch_id, arraybuffer, metaversion)
}

fn state_to_js<'m>(
    mv8: &'m MiniV8,
    agent_batches: &[&AgentBatch],
    msg_batches: &[&MessageBatch],
) -> Result<(mv8::Value<'m>, mv8::Value<'m>)> {
    let js_agent_batches = mv8.create_array();
    let js_msg_batches = mv8.create_array();

    for x in agent_batches.iter().zip(msg_batches.iter()).enumerate() {
        let (i_batch, (agent_batch, msg_batch)) = x;

        let agent_batch = batch_to_js(mv8, agent_batch.memory(), agent_batch.metaversion())?;
        js_agent_batches.set(i_batch as u32, agent_batch)?;

        let msg_batch = batch_to_js(mv8, msg_batch.memory(), msg_batch.metaversion())?;
        js_msg_batches.set(i_batch as u32, msg_batch)?;
    }
    Ok((
        mv8::Value::Array(js_agent_batches),
        mv8::Value::Array(js_msg_batches),
    ))
}

fn bytes_to_js<'m>(mv8: &'m MiniV8, bytes: &mut [u8]) -> mv8::Value<'m> {
    mv8::Value::Object(mv8.create_arraybuffer(bytes.as_mut_ptr(), bytes.len()))
}

fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let content = schema_to_bytes(schema);
    let mut stream_bytes = arrow_continuation(content.len());
    stream_bytes.extend_from_slice(&content);
    stream_bytes
}

fn array_to_errors(array: mv8::Value<'_>) -> Vec<RunnerError> {
    // TODO: Extract optional line numbers
    let fallback = format!("Unparsed: {:?}", array);

    if let mv8::Value::Array(array) = array {
        let errors = array
            .elements()
            .map(|e: mv8::Result<'_, mv8::Value<'_>>| {
                e.map(|e| RunnerError {
                    message: Some(format!("{:?}", e)),
                    details: None,
                    line_number: None,
                    file_name: None,
                })
            })
            .collect();

        if let Ok(errors) = errors {
            return errors;
        } // else unparsed
    } // else unparsed

    vec![RunnerError {
        message: Some(fallback),
        ..RunnerError::default()
    }]
}

fn get_js_error(_mv8: &MiniV8, r: &mv8::Object<'_>) -> Option<Error> {
    if let Ok(errors) = r.get("user_errors") {
        if !matches!(errors, mv8::Value::Undefined) && !matches!(errors, mv8::Value::Null) {
            let errors = array_to_errors(errors);
            if !errors.is_empty() {
                return Some(Error::User(errors));
            }
        }
    }

    if let Ok(mv8::Value::String(e)) = r.get("pkg_error") {
        // TODO: Don't silently ignore non-string, non-null-or-undefined errors
        //       (try to convert error value to JSON string and return as error?).
        return Some(Error::Package(e.to_string()));
    }

    if let Ok(mv8::Value::String(e)) = r.get("runner_error") {
        // TODO: Don't ignore non-string, non-null-or-undefined errors
        return Some(Error::Embedded(e.to_string()));
    }

    None
}

fn get_user_warnings(_mv8: &MiniV8, r: &mv8::Object<'_>) -> Option<Vec<RunnerError>> {
    if let Ok(warnings) = r.get::<&str, mv8::Value<'_>>("user_warnings") {
        if !(warnings.is_undefined() || warnings.is_null()) {
            let warnings = array_to_errors(warnings);
            if !warnings.is_empty() {
                return Some(warnings);
            }
        }
    }
    None
}

fn get_print(_mv8: &MiniV8, r: &mv8::Object<'_>) -> Option<Vec<String>> {
    if let Ok(mv8::Value::String(printed_val)) = r.get("print") {
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

fn get_next_task(_mv8: &MiniV8, r: &mv8::Object<'_>) -> Result<(MessageTarget, String)> {
    let target = if let Ok(mv8::Value::String(target)) = r.get("target") {
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

    let next_task_payload = if let Ok(mv8::Value::String(s)) = r.get("task") {
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

            let json = dataset.memory().get_data_buffer()?;
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
            log::trace!(
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

    unsafe fn new_buffer(&self, ptr: *const u8, len: usize, _capacity: usize) -> Buffer {
        let s = std::slice::from_raw_parts(ptr, len);
        s.into()
    }

    /// TODO: DOC, flushing from a single column
    fn array_data_from_js(
        &mut self,
        mv8: &'m MiniV8,
        data: &mv8::Value<'m>,
        dt: &DataType,
        len: Option<usize>,
    ) -> Result<ArrayData> {
        // `data` must not be dropped until flush is over, because
        // pointers returned from FFI point inside `data`'s ArrayBuffers' memory.
        let obj = data
            .as_object()
            .ok_or_else(|| Error::Embedded("Flush data not object".into()))?;
        let child_data: mv8::Array<'_> = obj.get("child_data")?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data: mv8::DataFfi = mv8.data_node_from_js(data);

        let n_children = child_data.len();
        let child_data: Vec<ArrayDataRef> = match dt.clone() {
            DataType::List(t) => {
                let child: mv8::Value<'_> = child_data.get(0)?;
                Ok(vec![Arc::new(
                    self.array_data_from_js(mv8, &child, &t, None)?,
                )])
            }
            DataType::FixedSizeList(t, multiplier) => {
                let child: mv8::Value<'_> = child_data.get(0)?;
                Ok(vec![Arc::new(self.array_data_from_js(
                    mv8,
                    &child,
                    &t,
                    Some(data.len * multiplier as usize),
                )?)])
            }
            DataType::Struct(fields) => {
                let mut v = Vec::new();
                for (i, field) in fields.iter().enumerate() {
                    let child = child_data.get(i as u32)?;
                    v.push(Arc::new(self.array_data_from_js(
                        mv8,
                        &child,
                        field.data_type(),
                        Some(data.len),
                    )?));
                }
                Ok(v)
            }
            t => {
                if n_children == 0 {
                    Ok(vec![])
                } else {
                    Err(Error::FlushType(t))
                }
            }
        }?; // TODO: More types?

        // TODO: Extra copies (in `new_buffer`) of buffers here,
        //       because JS Arrow doesn't align things properly.
        //       (Due to which buffer capacities are currently unused.)

        // This target length is used because the JS repr does not mirror
        // buffer building as Rust Arrow and pyarrow.
        let target_len = len.unwrap_or(data.len);

        let null_bit_buffer = if data.null_bits_ptr.is_null() {
            None // Can't match on `std::ptr::null()`, because not compile-time const.
        } else {
            let capacity = data.null_bits_capacity;
            // Ceil division.
            let n_bytes = (target_len / 8) + (if target_len % 8 == 0 { 0 } else { 1 });
            Some(unsafe { self.new_buffer(data.null_bits_ptr, n_bytes, capacity) })
            // Some(unsafe { Buffer::from_unowned(data.null_bits_ptr, n_bytes, capacity) })
        };

        let mut buffer_lens = Vec::with_capacity(2);

        match dt.clone() {
            DataType::Float64 => {
                buffer_lens.push(target_len * 8); // 8 bytes per f64
                Ok(())
            }
            DataType::UInt32 => {
                buffer_lens.push(target_len * 4); // 4 bytes per u32
                Ok(())
            }
            DataType::UInt16 => {
                buffer_lens.push(target_len * 2); // 2 bytes per u16
                Ok(())
            }
            DataType::Utf8 => {
                // TODO: Use `data.len` or target_len?
                //       (In practice, target_len has worked for a long time,
                //       though that's not an ideal reason to use it. Maybe
                //       `data.len` would also work.)
                let offsets = unsafe {
                    std::slice::from_raw_parts(data.buffer_ptrs[0] as *const i32, target_len + 1)
                };
                debug_assert_eq!(offsets[0], 0);
                let last = offsets[target_len];
                // offsets
                buffer_lens.push((target_len + 1) * 4);
                buffer_lens.push(last as usize);
                Ok(())
            }
            DataType::List(_) => {
                // offsets
                buffer_lens.push((target_len + 1) * 4);
                Ok(())
            } // Just offsets
            DataType::Struct(_) => Ok(()), // No non-child buffers
            DataType::FixedSizeList(..) => Ok(()),
            DataType::FixedSizeBinary(sz) => {
                buffer_lens.push(data.len * sz as usize);
                Ok(())
            } // Just values
            DataType::Boolean => {
                buffer_lens.push((data.len / 8) + (if data.len % 8 == 0 { 0 } else { 1 }));
                Ok(())
            } // Just values
            t => Err(Error::FlushType(t)), // TODO: More types?
        }?;

        debug_assert_eq!(data.n_buffers, buffer_lens.len());
        let mut buffers = Vec::new();
        for (i, &len) in buffer_lens.iter().enumerate().take(data.n_buffers) {
            let ptr = data.buffer_ptrs[i];
            debug_assert_ne!(ptr, std::ptr::null());
            let capacity = data.buffer_capacities[i];
            let buffer = if len <= capacity {
                unsafe { self.new_buffer(ptr, len, capacity) }
            } else {
                // This happens when we have fixed size buffers, but the inner nodes are null
                let mut mut_buffer = MutableBuffer::new(len);
                mut_buffer.resize(len)?;
                mut_buffer.freeze()
            };
            // let buffer = unsafe { Buffer::from_unowned(ptr, len, capacity) };
            buffers.push(buffer);
        }

        let data = ArrayData::new(
            dt.clone(),
            len.unwrap_or(data.len),
            Some(data.null_count),
            null_bit_buffer,
            0,
            buffers,
            child_data,
        );
        Ok(data)
    }

    fn flush_batch<B: DynamicBatch>(
        &mut self,
        mv8: &'m MiniV8,
        changes: mv8::Array<'m>,
        batch: &mut B,
        schema: &Schema,
    ) -> Result<()> {
        for change in changes.elements() {
            let change: mv8::Object<'_> = change?;

            let i_field: f64 = change.get("i_field")?;
            let i_field = i_field as usize;
            let field = schema.field(i_field);

            let data: mv8::Value<'_> = change.get("data")?;
            let data = self.array_data_from_js(mv8, &data, field.data_type(), None)?;
            batch.push_change(ArrayChange {
                array: Arc::new(data),
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
        proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: mv8::Value<'m>,
    ) -> Result<()> {
        let changes = changes.as_object().unwrap();

        let agent_changes = changes.get("agent")?;
        self.flush_batch(
            mv8,
            agent_changes,
            proxy.agent_pool_mut().batch_mut(i_proxy)?,
            agent_schema,
        )?;

        let msg_changes = changes.get("msg")?;
        self.flush_batch(
            mv8,
            msg_changes,
            proxy.message_pool_mut().batch_mut(0)?,
            msg_schema,
        )?;

        Ok(())
    }

    fn flush(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        shared_store: &mut TaskSharedStore,
        r: &mv8::Object<'m>,
    ) -> Result<()> {
        let (proxy, group_indices) = match &mut shared_store.state {
            SharedState::None | SharedState::Read(_) => return Ok(()),
            SharedState::Write(state) => {
                let indices = (0..state.agent_pool().n_batches()).collect();
                (state, indices)
            }
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Read(_) => return Ok(()),
                PartialSharedState::Write(state) => {
                    let indices = state.indices.clone();
                    (&mut state.inner, indices)
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

        let changes: mv8::Value<'_> = r.get("changes")?;
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
            agent_pool: AgentPool::empty(),
            msg_pool: MessagePool::empty(),
        };
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| Error::DuplicateSimulationRun(run.short_id))?;
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
    fn run_task(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        mut msg: RunnerTaskMsg,
    ) -> Result<(
        TargetedRunnerTaskMsg,
        Option<Vec<RunnerError>>,
        Option<Vec<String>>,
    )> {
        log::debug!("Starting state interim sync before running task");
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(mv8, sim_run_id, &msg.shared_store)?;

        log::debug!("Setting up run_task function call");
        let group_index = match &msg.shared_store.state {
            SharedState::None | SharedState::Write(_) | SharedState::Read(_) => {
                mv8::Value::Undefined
            }
            SharedState::Partial(partial) => match partial {
                // TODO: Code duplication between read and write
                PartialSharedState::Read(partial) => {
                    if partial.indices.len() == 1 {
                        mv8::Value::Number(partial.indices[0] as f64)
                    } else {
                        // Iterate over the subset of groups (since there's more than one group)
                        todo!()
                    }
                }
                PartialSharedState::Write(partial) => {
                    if partial.indices.len() == 1 {
                        mv8::Value::Number(partial.indices[0] as f64)
                    } else {
                        // Iterate over the subset of groups (since there's more than one group)
                        todo!()
                    }
                }
            },
        };

        let (payload, wrapper) = msg
            .payload
            .extract_inner_msg_with_wrapper()
            .map_err(|err| {
                Error::from(format!("Failed to extract the inner task message: {err}"))
            })?;
        let payload_str = mv8::Value::String(mv8.create_string(&serde_json::to_string(&payload)?));

        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            group_index,
            pkg_id_to_js(mv8, msg.package_id),
            payload_str,
        ]);
        log::debug!("Calling JS run_task");
        let r: mv8::Object<'_> = self
            .embedded
            .run_task
            .call_method(self.this.clone(), args)?;

        log::debug!("Post-processing run_task result");
        if let Some(error) = get_js_error(mv8, &r) {
            // All types of errors are fatal (user, package, runner errors).
            return Err(error);
        }
        let warnings = get_user_warnings(mv8, &r);
        let logs = get_print(mv8, &r);
        let (next_target, next_task_payload) = get_next_task(mv8, &r)?;

        let next_inner_task_msg: serde_json::Value = serde_json::from_str(&next_task_payload)?;
        log::trace!(
            "Wrapper: {:?}, next_inner: {:?}",
            &wrapper,
            &next_inner_task_msg
        );
        let next_task_payload =
            TaskMessage::try_from_inner_msg_and_wrapper(next_inner_task_msg, wrapper).map_err(
                |err| {
                    Error::from(format!(
                        "Failed to wrap and create a new TaskMessage, perhaps the inner: \
                         {next_task_payload}, was formatted incorrectly. Underlying error: {err}"
                    ))
                },
            )?;

        // Only flushes if state writable
        self.flush(mv8, sim_run_id, &mut msg.shared_store, &r)?;

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMsg {
                package_id: msg.package_id,
                task_id: msg.task_id,
                shared_store: msg.shared_store,
                payload: next_task_payload,
            },
        };
        Ok((next_task_msg, warnings, logs))
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

        let ctx_batch = context_batch
            .try_read()
            .ok_or_else(|| Error::from("Couldn't read context batch"))?;
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            batch_to_js(mv8, ctx_batch.memory(), ctx_batch.metaversion())?,
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
        let agent_pool = msg.agent_pool.read_proxy()?;
        let msg_pool = msg.message_pool.read_proxy()?;
        let (agent_pool, msg_pool) = (agent_pool.batches(), msg_pool.batches());

        // Pass proxies by reference, because they shouldn't be
        // dropped until entire sync is complete.
        let (agent_pool, msg_pool) = state_to_js(mv8, &agent_pool, &msg_pool)?;
        let args = mv8::Values::from_vec(vec![sim_id_to_js(mv8, sim_run_id), agent_pool, msg_pool]);
        let _: mv8::Value<'_> = self
            .embedded
            .state_sync
            .call_method(self.this.clone(), args)?;

        // Sync Rust.
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        state.agent_pool = msg.agent_pool;
        state.msg_pool = msg.message_pool;

        log::trace!("Sending state sync completion");
        msg.completion_sender.send(Ok(())).map_err(|e| {
            Error::from(format!(
                "Couldn't send state sync completion to worker: {:?}",
                e
            ))
        })?;
        log::trace!("Sent state sync completion");
        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortId,
        shared_store: &TaskSharedStore,
    ) -> Result<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = batches_from_shared_store(shared_store)?;
        let (agent_batches, msg_batches) = state_to_js(mv8, &agent_batches, &msg_batches)?;
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
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
        let agent_pool = msg.agent_pool.read_proxy()?;
        let msg_pool = msg.message_pool.read_proxy()?;
        let (agent_pool, msg_pool) = (agent_pool.batches(), msg_pool.batches());
        let (agent_pool, msg_pool) = state_to_js(mv8, &agent_pool, &msg_pool)?;
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
                log::debug!("Stopping execution on Javascript runner");
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
                let (next_task_msg, warnings, logs) = self.run_task(mv8, sim_id, msg)?;
                // TODO: `send` fn to reduce code duplication.
                outbound_sender.send(OutboundFromRunnerMsg {
                    source: Language::JavaScript,
                    sim_id,
                    payload: OutboundFromRunnerMsgPayload::TaskMsg(next_task_msg),
                })?;
                if let Some(warnings) = warnings {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::RunnerWarnings(warnings),
                    })?;
                }
                if let Some(logs) = logs {
                    outbound_sender.send(OutboundFromRunnerMsg {
                        source: Language::JavaScript,
                        sim_id,
                        payload: OutboundFromRunnerMsgPayload::RunnerLogs(logs),
                    })?;
                }
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
    inbound_sender: UnboundedSender<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    inbound_receiver:
        Option<UnboundedReceiver<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>>,
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
        log::trace!("Sending message to JavaScript: {:?}", &msg);
        self.inbound_sender
            .send((sim_id, msg))
            .map_err(|e| WorkerError::JavaScript(Error::InboundSend(e)))
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        if self.spawned() {
            log::trace!("JavaScript is spawned, sending message: {:?}", &msg);
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
        log::debug!("Running JavaScript runner");
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
    mut inbound_receiver: UnboundedReceiver<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
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
                    Some((sim_id, msg)) = inbound_receiver.recv() => {
                        // TODO: Send errors instead of immediately stopping?
                        let msg_str = msg.as_str();
                        log::debug!("JS runner got sim `{:?}` inbound {}", &sim_id, msg_str);
                        let keep_running = impl_.handle_msg(&mv8, sim_id, msg, &outbound_sender)?;
                        log::debug!("JS runner handled sim `{:?}` inbound {}", sim_id, msg_str);
                        if !keep_running {
                            log::debug!("JavaScript Runner has finished execution, stopping");
                            break;
                        }
                    }
                }
            }
            Ok(())
        };
    };

    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, impl_future)
}
