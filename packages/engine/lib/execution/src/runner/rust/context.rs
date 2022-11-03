use std::{
    any::Any,
    collections::{HashMap, HashSet},
    fs,
    sync::Arc,
};

use arrow2::array::Array;
use arrow2::{
    array::{FixedSizeListArray, ListArray, UInt32Array},
    datatypes::Schema,
};
use parking_lot::{RwLock, RwLockWriteGuard};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::config::Globals;
use crate::datastore::prelude::{AgentBatch, MessageBatch};
use crate::datastore::{batch::Metaversion, storage::memory::Memory};
use crate::worker::{Error as WorkerError, Result as WorkerResult, TaskMessage};
use crate::{
    datastore::{
        arrow::{
            message::{outbound_messages_to_arrow_column, MESSAGE_COLUMN_INDEX},
            util::arrow_continuation,
        },
        batch::{change::ArrayChange, ContextBatch},
        table::sync::{ContextBatchSync, StateSync},
    },
    hash_types::Agent,
    simulation::packages::{
        state::packages::behavior_execution::config::BehaviorDescription,
        worker_init::PackageInitMsgForWorker,
    },
    Language,
};

use super::state::{SimState, StateSnapshot};
use super::{
    super::comms::{
        inbound::{InboundToRunnerMsg, InboundToRunnerMsgPayload},
        outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
        ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, StateInterimSync,
        TargetedRunnerTaskMsg,
    },
    neighbor::Neighbor,
};
use super::{Error, Result, SimSchema};

/// Wrapper for running columnar behaviors on single agents
pub struct AgentContext<'c> {
    schema: &'c SimSchema,
    ctx_batch: &'c Option<Arc<ContextBatch>>,
    snapshot: &'c Option<StateSnapshot>,
    col_indices: &'c HashMap<String, usize>,
    neighbors_index: usize, // Used often.
    globals: &'c Arc<Globals>,
    index_in_sim: usize,
    group_start_index: usize,
}

impl<'c> AgentContext<'c> {
    pub fn neighbors(&'c self, _i: usize) -> Result<Vec<Neighbor<'c>>> {
        // TODO: Use buffers from `data_ref` directly for better performance.
        let neighbor_array = self
            .ctx_batch
            .as_ref()
            .unwrap()
            .batch
            .column(self.neighbors_index)
            .as_any()
            .downcast_ref::<ListArray>()
            .unwrap();

        let neighbor_locs = neighbor_array
            .value(self.index_in_sim)
            .as_any()
            .downcast_ref::<FixedSizeListArray>()
            .unwrap();

        let mut neighbors = Vec::new();
        for i_neighbor in 0..neighbor_locs.len() {
            let loc = neighbor_array
                .value(i_neighbor)
                .as_any()
                .downcast_ref::<UInt32Array>()
                .unwrap();
            neighbors.push(Neighbor::new(
                self.schema,
                self.snapshot.as_ref().unwrap(),
                self.col_indices,
                loc,
            ));
        }
        Ok(neighbors)
    }

    pub fn globals(&self) -> &Arc<Globals> {
        &self.globals
    }

    pub fn _set_index(&mut self, i_agent_in_group: usize) {
        self.index_in_sim = i_agent_in_group + self.group_start_index;
    }
}

pub struct GroupContext<'c> {
    schema: &'c SimSchema,
    ctx_batch: &'c Option<Arc<ContextBatch>>,
    snapshot: &'c Option<StateSnapshot>,
    col_indices: &'c HashMap<String, usize>,
    globals: &'c Arc<Globals>,
    start_index: usize,
}

impl<'c> GroupContext<'c> {
    pub fn get_agent(&'c self, i_agent_in_group: usize) -> AgentContext<'c> {
        AgentContext {
            schema: self.schema,
            ctx_batch: self.ctx_batch,
            snapshot: self.snapshot,
            col_indices: self.col_indices,
            neighbors_index: *self.col_indices.get("neighbors").unwrap(),
            globals: self.globals,
            group_start_index: self.start_index,
            index_in_sim: i_agent_in_group + self.start_index,
        }
    }

    pub fn get_json_state(&'c self) -> Vec<Agent> {
        vec![]
    }
}

pub struct SimContext {
    schema: SimSchema,
    batch: Option<Arc<ContextBatch>>,
    group_start_indices: Vec<usize>,
    snapshot: Option<StateSnapshot>,
    current_step: isize,
    globals: Arc<Globals>,
    col_indices: HashMap<String, usize>,
}

impl SimContext {
    pub fn new(schema: SimSchema, globals: Arc<Globals>) -> Self {
        let mut col_indices = HashMap::new();
        for field in schema.agent.arrow.fields().iter() {
            let index = schema
                .agent
                .arrow
                .index_of(field.name())
                .expect("Column must exist");
            col_indices
                .try_insert(field.name().to_owned(), index)
                .unwrap();
        }

        Self {
            schema,
            batch: None,
            group_start_indices: Vec::new(),
            snapshot: None,
            current_step: 0,
            globals,
            col_indices,
        }
    }

    pub fn sync_batch(&mut self, ctx_batch: Arc<ContextBatch>) {
        self.batch = Some(ctx_batch);
        self.current_step += 1; // TODO: Is this the correct moment to increment it?
    }

    pub fn sync_snapshot(&mut self, snapshot: StateSnapshot) {
        self.snapshot = Some(snapshot);
    }

    pub fn get_group<'c>(&'c self, i_group: usize) -> GroupContext<'c> {
        GroupContext {
            schema: &self.schema,
            ctx_batch: &self.batch,
            snapshot: &self.snapshot,
            col_indices: &self.col_indices,
            globals: &self.globals,
            start_index: self.group_start_indices[i_group],
        }
    }
}
