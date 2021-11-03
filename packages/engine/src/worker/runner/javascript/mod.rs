mod error;
mod mini_v8;

use std::ops::Deref;
use std::{collections::HashMap, fs, sync::Arc};

use arrow::record_batch::RecordBatch;
use arrow::{
    array::{ArrayData, ArrayDataRef},
    buffer::{Buffer, MutableBuffer},
    datatypes::{DataType, Schema},
    ipc::writer::schema_to_bytes,
};
use futures::FutureExt;
use mini_v8 as mv8;
use mv8::MiniV8;
use parking_lot::RwLock;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use super::comms::{
    inbound::InboundToRunnerMsgPayload,
    outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
    ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, StateInterimSync,
    TargetedRunnerTaskMsg,
};
use crate::config::Globals;
use crate::datastore::batch::{ArrowBatch, DynamicBatch};
use crate::datastore::table::pool::agent::AgentPool;
use crate::datastore::table::pool::message::MessagePool;
use crate::datastore::table::pool::proxy::PoolReadProxy;
use crate::datastore::table::pool::BatchPool;
use crate::hash_types::Agent;
use crate::worker::{Error as WorkerError, Result as WorkerResult, TaskMessage};
use crate::{
    datastore::prelude::SharedStore,
    proto::SimulationShortID,
    simulation::packages::{id::PackageId, PackageType},
};
use crate::{
    datastore::{
        arrow::util::arrow_continuation,
        batch::{change::ArrayChange, Batch, Metaversion},
        prelude::{AgentBatch, MessageBatch},
        storage::memory::Memory,
        table::sync::{ContextBatchSync, StateSync},
    },
    Language,
};
pub use error::{Error, Result};

struct JSPackage<'m> {
    fns: mv8::Array<'m>,
}

fn get_pkg_path(name: &str, pkg_type: PackageType) -> String {
    format!(
        "../../simulation/packages/{}/packages/{}/package.js",
        pkg_type.as_str(),
        name
    )
}

impl<'m> JSPackage<'m> {
    fn import(
        mv8: &'m MiniV8,
        embedded: &Embedded<'m>,
        name: &str,
        pkg_type: PackageType,
    ) -> Result<Self> {
        let path = get_pkg_path(name, pkg_type);
        let code = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => {
                // Packages don't have to use JS.
                let fns = mv8.create_array();
                fns.set(0, mv8::Value::Undefined)?;
                fns.set(1, mv8::Value::Undefined)?;
                fns.set(2, mv8::Value::Undefined)?;
                return Ok(JSPackage { fns });
            }
        };

        let wrapped_code = format!(
            "((hash_util, start_experiment, start_sim, run_task)=>{{{}
            return [start_experiment, start_sim, run_task]}})",
            code
        );
        let pkg: mv8::Function = mv8
            .eval(wrapped_code)
            .map_err(|e| Error::PackageImport(path.into(), e.into()))?;

        let args = mv8::Values::from_vec(vec![
            embedded.hash_util.clone(),
            mv8::Value::Undefined,
            mv8::Value::Undefined,
            mv8::Value::Undefined,
        ]);

        let fns: mv8::Array = pkg
            .call(args)
            .map_err(|e| Error::PackageImport(path.into(), e.into()))?;
        if fns.len() != 3 {
            return Err(Error::PackageImport(path.into(), "Stray return".into()));
        }

        // Validate returned array.
        let fn_names = ["start_experiment", "start_sim", "run_task"];
        for (elem, fn_name) in fns.elements().zip(fn_names) {
            let elem: mv8::Value = elem.map_err(|e| {
                Error::PackageImport(path.into(), format!("Couldn't index array: {}", e))
            })?;
            if !(elem.is_function() || elem.is_undefined()) {
                return Err(Error::PackageImport(
                    path.into(),
                    format!("{} should be a function, not {:?}", fn_name, elem),
                ));
            }
        }
        assert_eq!(fns.len(), 3);

        Ok(JSPackage { fns })
    }
}

/// Embedded JS of runner itself (from hardcoded paths)
struct Embedded<'m> {
    hash_util: mv8::Value<'m>,
    batches_prototype: mv8::Value<'m>,
    experiment_ctx_prototype: mv8::Value<'m>,
    sim_init_ctx_prototype: mv8::Value<'m>,
    gen_ctx: mv8::Value<'m>,
    gen_state: mv8::Value<'m>,

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
    let v: mv8::Value = mv8
        .eval(code)
        .map_err(|e| Error::Eval(path.into(), e.into()))?;
    Ok(v)
}

fn import_file<'m>(
    mv8: &'m MiniV8,
    path: &str,
    args: Vec<&'m mv8::Value<'m>>,
) -> Result<mv8::Value<'m>> {
    let f = eval_file(mv8, path)?
        .as_function()
        .ok_or_else(|| Error::FileImport(path.into(), "Failed to wrap file".into()))?;

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
        let arrow = eval_file(mv8, "./arrow.js")?;
        let hash_util = import_file(mv8, "./hash_util.js", vec![&arrow])?;
        let batches_prototype = import_file(mv8, "./batch.js", vec![&arrow, &hash_util])?;

        let ctx_import = import_file(mv8, "./context.js", vec![&hash_util])?;
        let ctx_import = ctx_import.as_array().ok_or_else(|| {
            Error::FileImport(
                "./context.js".into(),
                "Couldn't get array (of functions) from 'context.js'".into(),
            )
        })?;
        let experiment_ctx_prototype = ctx_import.get(0)?;
        let sim_init_ctx_prototype = ctx_import.get(1)?;
        let gen_ctx = ctx_import.get(2)?;

        let gen_state = import_file(mv8, "./state.js", vec![&hash_util])?;
        let fns = import_file(
            mv8,
            "./runner.js",
            vec![
                &arrow,
                &batches_prototype,
                &experiment_ctx_prototype,
                &sim_init_ctx_prototype,
                &gen_ctx,
                &gen_state,
            ],
        )?;
        let fns = fns.as_array().ok_or_else(|| {
            Error::FileImport(
                "./runner.js".into(),
                "Couldn't get array (of functions) from 'runner.js'".into(),
            )
        })?;
        Ok(Self {
            hash_util,
            batches_prototype,
            experiment_ctx_prototype,
            sim_init_ctx_prototype,
            gen_ctx,
            gen_state,
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
    agent_pool: Vec<Arc<RwLock<AgentBatch>>>,
    msg_pool: Vec<Arc<RwLock<MessageBatch>>>,
}

struct RunnerImpl<'m> {
    embedded: Embedded<'m>,
    this: mv8::Value<'m>,
    sims_state: HashMap<SimulationShortID, SimState>,
}

fn sim_id_to_js<'m>(mv8: &'m MiniV8, sim_run_id: SimulationShortID) -> mv8::Value<'m> {
    mv8::Value::Number(sim_run_id as f64)
}

fn pkg_id_to_js<'m>(mv8: &'m MiniV8, pkg_id: PackageId) -> mv8::Value<'m> {
    mv8::Value::Number(pkg_id.as_usize() as f64)
}

fn idxs_to_js<'m>(mv8: &'m MiniV8, idxs: &[usize]) -> Result<mv8::Value<'m>> {
    let a = mv8.create_array();
    for (i, idx) in idxs.iter().enumerate() {
        a.set(i as u32, mv8::Value::Number(*idx as u32 as f64))?;
    }
    Ok(mv8::Value::Array(a))
}

fn mem_batch_to_js<'m>(
    mv8: &'m MiniV8,
    mem: mv8::Object<'m>,
    metaversion: &Metaversion,
) -> mv8::Value<'m> {
    let batch = mv8.create_object();
    batch.set("mem", mem);
    batch.set("mem_version", metaversion.memory());
    batch.set("batch_version", metaversion.batch());
    mv8::Value::Object(batch)
}

fn batch_to_js<'m>(mv8: &'m MiniV8, mem: &Memory, metaversion: &Metaversion) -> mv8::Value<'m> {
    // TODO: Is `mem.data.len()` different from `mem.size`? (like Vec capacity vs len?)
    let mem = mv8.create_arraybuffer(mem.data.as_ptr(), mem.size);
    mem_batch_to_js(mv8, mem, metaversion)
}

fn mut_batch_to_js<'m>(
    mv8: &'m MiniV8,
    mem: &mut Memory,
    metaversion: &Metaversion,
) -> mv8::Value<'m> {
    // TODO: Is `mem.data.len()` different from `mem.size`?
    let mem = mv8.create_arraybuffer(mem.as_mut_ptr(), mem.size);
    mem_batch_to_js(mv8, mem, metaversion)
}

fn state_to_js<'m>(
    mv8: &'m MiniV8,
    agent_batches: &PoolReadProxy<AgentBatch>,
    msg_batches: &PoolReadProxy<MessageBatch>,
) -> Result<(mv8::Value<'m>, mv8::Value<'m>)> {
    let js_agent_batches = mv8.create_array();
    let js_msg_batches = mv8.create_array();
    for i_batch in 0..agent_batches.n_batches() {
        let agent_batch = agent_batches.batch(i_batch)?;
        let agent_batch = batch_to_js(mv8, agent_batch.memory(), agent_batch.metaversion());
        js_agent_batches.set(i_batch as u32, agent_batch)?;

        let msg_batch = msg_batches.batch(i_batch)?;
        let msg_batch = batch_to_js(mv8, msg_batch.memory(), msg_batch.metaversion());
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

    if let mv8::Value::Array(array) = array {
        let errors = array
            .elements()
            .map(|e: mv8::Result<mv8::Value>| {
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
        message: Some(format!("Unparsed: {:?}", array)),
        ..RunnerError::default()
    }]
}

fn get_js_error<'m>(mv8: &'m MiniV8, r: &'m mv8::Object) -> Option<Error> {
    if let Ok(errors) = r.get("user_errors") {
        let errors = array_to_errors(errors);
        if errors.len() > 0 {
            return Some(Error::User(errors));
        }
    }

    if let Ok(mv8::Value::String(e)) = r.get("pkg_error") {
        return Some(Error::Package(e.to_string()));
    }

    if let Ok(mv8::Value::String(e)) = r.get("runner_error") {
        return Some(Error::Embedded(e.to_string()));
    }

    None
}

fn get_user_warnings<'m>(mv8: &'m MiniV8, r: &'m mv8::Object) -> Option<Vec<RunnerError>> {
    if let Ok(warnings) = r.get("user_warnings") {
        let warnings = array_to_errors(warnings);
        if warnings.len() > 0 {
            return Some(warnings);
        }
    }
    None
}

fn get_next_task<'m>(mv8: &'m MiniV8, r: &'m mv8::Object) -> Result<(MessageTarget, TaskMessage)> {
    let target = if let Ok(mv8::Value::String(target)) = r.get("target") {
        let target = target.to_string();
        match target.as_str() {
            "js" => MessageTarget::JavaScript,
            "py" => MessageTarget::Python,
            "rs" => MessageTarget::Rust,
            "dyn" => MessageTarget::Dynamic,
            "main" => MessageTarget::Main,
            _ => return Err(Error::UnknownTarget(target)),
        }
    } else {
        // If no target was specified, go back to simulation main loop by default.
        MessageTarget::Main
    };

    let next_task_payload = if let Ok(mv8::Value::String(s)) = r.get("task") {
        s.to_string()
    } else {
        "".to_string()
    };
    // TODO: Construct task message from string and package type.
    let pkg_type = todo!();
    let next_task_payload = TaskMessage::from((next_task_payload, pkg_type));
    Ok((target, next_task_payload))
}

struct GroupSync {
    pub group_index: usize,
    pub agent_batch: Arc<RwLock<AgentBatch>>,
    pub message_batch: Arc<RwLock<MessageBatch>>,
}

fn agent_pool_from_batches(batches: Vec<Arc<RwLock<AgentBatch>>>) -> AgentPool {
    AgentPool::new(batches)
}

fn msg_pool_from_batches(batches: Vec<Arc<RwLock<MessageBatch>>>) -> MessagePool {
    MessagePool::new(batches)
}

impl<'m> RunnerImpl<'m> {
    fn load_datasets(mv8: &'m MiniV8, shared_ctx: &SharedStore) -> Result<mv8::Value<'m>> {
        let js_dataset_names = mv8.create_array();
        for (dataset_name, _dataset) in shared_ctx.datasets.iter() {
            let js_name = mv8.create_string(dataset_name.as_str());
            js_dataset_names.push(js_name)?;
        }

        let js_datasets = mv8.create_array(); // Array of JSON strings.
        for (_dataset_name, dataset) in shared_ctx.datasets.iter() {
            let json = dataset.memory().get_data_buffer()?;
            // TODO: Use `from_utf8_unchecked` instead here?
            //       (Since datasets' json can be quite large.)
            let json =
                std::str::from_utf8(json).map_err(|_| Error::Unique("Dataset not utf8".into()))?;
            let json = mv8.create_string(json);
            js_datasets.push(json)?;
        }
        Ok(mv8::Value::Array(js_datasets))
    }

    pub fn new(mv8: &'m MiniV8, init: &ExperimentInitRunnerMsg) -> Result<Self> {
        let embedded = Embedded::import(mv8)?;
        let datasets = Self::load_datasets(mv8, &init.shared_context)?;

        let pkg_ids = mv8.create_array();
        let pkg_fns = mv8.create_array();
        let pkg_init_msgs = mv8.create_array();
        for (i_pkg, pkg_id) in init.package_config.0.keys().enumerate() {
            let pkg_init = init.package_config.0.get(pkg_id).unwrap();
            let pkg = JSPackage::import(mv8, &embedded, &pkg_init.name, pkg_init.r#type)?;

            let i_pkg = i_pkg as u32;
            pkg_ids.set(i_pkg, pkg_id_to_js(mv8, *pkg_id))?;
            pkg_fns.set(i_pkg, pkg.fns)?;

            let payload = serde_json::to_string(&pkg_init.payload).unwrap();
            let pkg_init_msg = mv8.create_string(&payload);
            pkg_init_msgs.set(i_pkg, pkg_init_msg)?;
        }

        let this = mv8::Value::Object(mv8.create_object());
        let args = mv8::Values::from_vec(vec![
            datasets,
            mv8::Value::Array(pkg_ids),
            mv8::Value::Array(pkg_fns),
            mv8::Value::Array(pkg_init_msgs),
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
        let child_data: mv8::Array = obj.get("child_data")?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data: mv8::DataFFI = mv8.data_node_from_js(data);

        let n_children = child_data.len();
        let child_data: Vec<ArrayDataRef> = match dt.clone() {
            DataType::List(t) => {
                let child: mv8::Value = child_data.get(0)?;
                Ok(vec![Arc::new(
                    self.array_data_from_js(mv8, &child, &t, None)?,
                )])
            }
            DataType::FixedSizeList(t, multiplier) => {
                let child: mv8::Value = child_data.get(0)?;
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
                buffer_lens.push(target_len * 8);
                Ok(())
            }
            DataType::Utf8 => {
                // Use data.len or target_len? TODO
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
            DataType::FixedSizeList(_, _) => Ok(()),
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
        for i in 0..data.n_buffers {
            let ptr = data.buffer_ptrs[i];
            debug_assert_ne!(ptr, std::ptr::null());
            let capacity = data.buffer_capacities[i];
            let len = buffer_lens[i];
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
        batch: &Arc<RwLock<B>>,
        schema: &Schema,
    ) -> Result<()> {
        let mut batch = batch.write();
        for change in changes.elements() {
            let change: mv8::Object = change?;

            let i_field: f64 = change.get("i_field")?;
            let i_field = i_field as usize;
            let field = schema.field(i_field);

            let data: mv8::Value = change.get("data")?;
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
        sim_run_id: SimulationShortID,
        group_index: u32,
        changes: mv8::Object<'m>,
    ) -> Result<GroupSync> {
        let group_index = group_index as usize;
        // TODO: Currently look up simulation's state for each group, whereas
        //       could do it once for all groups.
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;

        let agent_changes = changes.get("agent")?;
        let agent_batch = state.agent_pool[group_index].clone();
        self.flush_batch(mv8, agent_changes, &agent_batch, &state.agent_schema)?;

        let msg_changes = changes.get("msg")?;
        let message_batch = state.msg_pool[group_index as usize].clone();
        self.flush_batch(mv8, msg_changes, &message_batch, &state.msg_schema)?;

        Ok(GroupSync {
            group_index: group_index as usize,
            agent_batch,
            message_batch,
        })
    }

    fn flush(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        group_index: Option<u32>,
        r: &mv8::Object<'m>,
    ) -> Result<StateInterimSync> {
        if let Some(group_index) = group_index {
            let changes: mv8::Object = r.get("changes")?;
            let group = self.flush_group(mv8, sim_run_id, group_index, changes)?;
            let sync = StateInterimSync {
                group_indices: vec![group.group_index],
                agent_batches: agent_pool_from_batches(vec![group.agent_batch]),
                message_batches: msg_pool_from_batches(vec![group.message_batch]),
            };
            return Ok(sync);
        }

        let mut group_indices = Vec::new();
        let mut agent_batches = Vec::new();
        let mut message_batches = Vec::new();
        let groups_changes: mv8::Array = r.get("changes")?;
        for (i_group, changes) in groups_changes.elements().enumerate() {
            let group = self.flush_group(mv8, sim_run_id, i_group as u32, changes?)?;
            group_indices.push(group.group_index);
            agent_batches.push(group.agent_batch);
            message_batches.push(group.message_batch);
        }
        let sync = StateInterimSync {
            group_indices,
            agent_batches: agent_pool_from_batches(agent_batches),
            message_batches: msg_pool_from_batches(message_batches),
        };
        Ok(sync)
    }

    /// Sim start:
    ///  - Hard-coded engine init
    ///  - Sim-level init of step packages (context, state, output)
    ///  - Run init packages (e.g. init.js)
    ///      - init.js can depend on globals, which vary between sim runs, so
    ///        it has to be executed at the start of a sim run, not at the
    ///        start of the experiment run.
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
            agent_schema: run.datastore.agent_batch_schema.arrow.clone(),
            msg_schema: run.datastore.message_batch_schema.clone(),
            agent_pool: Vec::new(),
            msg_pool: Vec::new(),
        };
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| Error::DuplicateSimulationRun(run.short_id))?;
        Ok(())
    }

    fn run_task(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        msg: RunnerTaskMsg,
    ) -> Result<(TargetedRunnerTaskMsg, Option<Vec<RunnerError>>)> {
        // TODO: Move JS part of sync into `run_task` function in JS for better performance.
        self.state_interim_sync(mv8, sim_run_id, msg.sync)?;

        let group_index = if let Some(i) = msg.group_index {
            mv8::Value::Number(i as f64)
        } else {
            mv8::Value::Undefined
        };

        let payload = serde_json::to_string(&msg.payload).unwrap();
        let payload = mv8::Value::String(mv8.create_string(&payload));

        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            group_index,
            pkg_id_to_js(mv8, msg.package_id),
            payload,
        ]);
        let r: mv8::Object = self
            .embedded
            .run_task
            .call_method(self.this.clone(), args)?;

        if let Some(error) = get_js_error(mv8, &r) {
            // All types of errors are fatal (user, package, runner errors).
            return Err(error);
        }
        let warnings = get_user_warnings(mv8, &r);
        // TODO: Send `r.print` (if any) to main loop to display to user.
        let (next_target, next_task_payload) = get_next_task(mv8, &r)?;

        // TODO: Only flush if state writable
        let next_sync = self.flush(mv8, sim_run_id, msg.group_index, &r)?;

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMsg {
                package_id: msg.package_id,
                task_id: msg.task_id,
                sync: next_sync,
                payload: next_task_payload,
                group_index: msg.group_index,
            },
        };
        Ok((next_task_msg, warnings))
    }

    fn ctx_batch_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        ctx_batch: ContextBatchSync,
    ) -> Result<()> {
        let ctx_batch = &ctx_batch.context_batch;
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            batch_to_js(mv8, ctx_batch.memory(), ctx_batch.metaversion()),
            idxs_to_js(mv8, &ctx_batch.group_start_indices)?,
        ]);
        let _: mv8::Value = self
            .embedded
            .ctx_batch_sync
            .call_method(self.this.clone(), args)?;
        Ok(())
    }

    fn state_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        msg: StateSync,
    ) -> Result<()> {
        // TODO: Technically this might violate Rust's aliasing rules, because
        //       at this point, the state batches are immutable, but we pass
        //       pointers to them into V8 that can later to be used to mutate
        //       them (because later we can guarantee that nothing else is reading
        //       state in parallel with the mutation through those pointers).

        // Sync JS.
        // let agent_pool = &msg.agent_pool as &dyn BatchPool<AgentBatch>;
        // let msg_pool = &msg.message_pool as &dyn BatchPool<MessageBatch>;
        let agent_pool = msg.agent_pool.read_proxy()?;
        let msg_pool = msg.message_pool.read_proxy()?;

        // Pass proxies by reference, because they shouldn't be
        // dropped until entire sync is complete.
        let (agent_pool, msg_pool) = state_to_js(mv8, &agent_pool, &msg_pool)?;
        let args = mv8::Values::from_vec(vec![sim_id_to_js(mv8, sim_run_id), agent_pool, msg_pool]);
        let _: mv8::Value = self
            .embedded
            .state_sync
            .call_method(self.this.clone(), args)?;

        // Sync Rust.
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        state.agent_pool = msg.agent_pool.cloned_batch_pool();
        state.msg_pool = msg.message_pool.cloned_batch_pool();
        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        msg: StateInterimSync,
    ) -> Result<()> {
        // Sync JS.
        let agent_pool = msg.agent_batches.partial_read_proxy(&msg.group_indices)?;
        let msg_pool = msg.message_batches.partial_read_proxy(&msg.group_indices)?;
        let (agent_batches, msg_batches) = state_to_js(mv8, &agent_pool, &msg_pool)?;
        let args = mv8::Values::from_vec(vec![
            sim_id_to_js(mv8, sim_run_id),
            idxs_to_js(mv8, &msg.group_indices)?,
            agent_batches,
            msg_batches,
        ]);
        let _: mv8::Value = self
            .embedded
            .state_interim_sync
            .call_method(self.this.clone(), args)?;

        // Sync Rust.
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        let iter = msg.group_indices.iter().zip(
            msg.agent_batches
                .cloned_batch_pool()
                .iter()
                .zip(msg.message_batches.cloned_batch_pool().iter()),
        );
        for (i_group, (agent_batch, msg_batch)) in iter {
            state.agent_pool[*i_group] = agent_batch.clone();
            state.msg_pool[*i_group] = msg_batch.clone();
        }
        Ok(())
    }

    fn state_snapshot_sync(
        &mut self,
        mv8: &'m MiniV8,
        sim_run_id: SimulationShortID,
        msg: StateSync,
    ) -> Result<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.agent_pool.read_proxy()?;
        let msg_pool = msg.message_pool.read_proxy()?;
        let (agent_pool, msg_pool) = state_to_js(mv8, &agent_pool, &msg_pool)?;
        let sim_run_id = sim_id_to_js(mv8, sim_run_id);
        let args = mv8::Values::from_vec(vec![sim_run_id, agent_pool, msg_pool]);
        let _: mv8::Value = self
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
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<bool> {
        match msg {
            InboundToRunnerMsgPayload::KillRunner => {
                return Ok(false); // Don't continue running.
            }
            InboundToRunnerMsgPayload::NewSimulationRun(new_run) => {
                // TODO: `short_id` doesn't need to be inside `new_run`, since
                //       it's already passed separately to the runner.
                self.start_sim(mv8, new_run)?;
            }
            InboundToRunnerMsgPayload::TerminateSimulationRun => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(Error::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("state sync"))?;
                self.state_sync(mv8, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("interim sync"))?;
                self.state_interim_sync(mv8, sim_id, interim_msg)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("snapshot sync"))?;
                self.state_snapshot_sync(mv8, sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("context batch sync"))?;
                self.ctx_batch_sync(mv8, sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIDRequired("run task"))?;
                let (next_task_msg, warnings) = self.run_task(mv8, sim_id, msg)?;
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
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {}
        }
        Ok(true) // Continue running.
    }
}

pub struct JavaScriptRunner {
    // JavaScriptRunner and RunnerImpl are separate because the
    // V8 Isolate inside RunnerImpl can't be sent between threads.
    init_msg: ExperimentInitRunnerMsg, // Args to RunnerImpl::new
    inbound_sender: UnboundedSender<(Option<SimulationShortID>, InboundToRunnerMsgPayload)>,
    inbound_receiver: UnboundedReceiver<(Option<SimulationShortID>, InboundToRunnerMsgPayload)>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawned: bool,
}

impl JavaScriptRunner {
    pub fn new(spawn: bool, init_msg: ExperimentInitRunnerMsg) -> WorkerResult<Self> {
        let (inbound_sender, inbound_receiver) = unbounded_channel();
        let (outbound_sender, outbound_receiver) = unbounded_channel();
        Ok(Self {
            init_msg,
            inbound_sender,
            inbound_receiver,
            outbound_sender,
            outbound_receiver,
            spawned: spawn,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortID>,
        msg: InboundToRunnerMsgPayload,
    ) -> WorkerResult<()> {
        self.inbound_sender
            .send((sim_id, msg))
            .map_err(|e| WorkerError::JavaScript(Error::InboundSend(e)))
    }

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
        self.outbound_receiver
            .recv()
            .await
            .ok_or(WorkerError::JavaScript(Error::OutboundReceive))
    }

    pub async fn recv_now(&mut self) -> WorkerResult<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    pub fn spawned(&self) -> bool {
        self.spawned
    }

    pub async fn run(&mut self) -> WorkerResult<()> {
        if !self.spawned {
            return Ok(());
        }

        // Single threaded runtime only
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| Error::IO("Local tokio runtime".into(), e))?;

        tokio::pin! {
            let impl_future = async {
                let mv8 = MiniV8::new();
                let mut impl_ = RunnerImpl::new(&mv8, &self.init_msg)?;
                loop {
                    tokio::select! {
                        Some((sim_id, msg)) = self.inbound_receiver.recv() => {
                            // TODO: Send errors instead of immediately stopping?
                            if !impl_.handle_msg(&mv8, sim_id, msg, &self.outbound_sender)? {
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
}
