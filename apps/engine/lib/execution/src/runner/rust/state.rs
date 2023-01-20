use std::{
    any::Any,
    collections::{HashMap, HashSet},
    fs,
    sync::Arc,
};

use arrow2::array::Array;
use arrow2::{array::ArrayData, datatypes::Schema};
use parking_lot::{RwLock, RwLockWriteGuard};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::config::globals::Globals;
use crate::datastore::arrow::message::get_message_arrow_builder;
use crate::datastore::prelude::{AgentBatch, IntoAgentStates, MessageBatch};
use crate::datastore::{batch::Metaversion, storage::memory::Memory};
use crate::hash_types::message::Outbound as OutboundMessage;
use crate::worker::{Error as WorkerError, Result as WorkerResult, TaskMessage};
use crate::{
    datastore::{
        arrow::{
            message::{outbound_messages_to_arrow_column, MESSAGE_COLUMN_INDEX},
            util::arrow_continuation,
        },
        batch::{change::ArrayChange, ContextBatch, DynamicBatch},
        table::sync::{ContextBatchSync, StateSync},
    },
    hash_types::Agent,
    simulation::packages::{
        state::packages::behavior_execution::config::BehaviorDescription,
        worker_init::PackageInitMsgForWorker,
    },
    Language,
};

use super::super::comms::{
    inbound::{InboundToRunnerMsg, InboundToRunnerMsgPayload},
    outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
    ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, StateInterimSync,
    TargetedRunnerTaskMsg,
};
use super::{Column, Error, NativeState, Result, SimSchema};

/// Wrapper for running columnar behaviors on single agents
pub struct AgentState<'s> {
    // `index_in_group`, `inner` and `agent_batch` have to be public due to impl in accessors macro.
    pub agent_batch: &'s mut RwLockWriteGuard<'s, AgentBatch>,
    msg_batch: &'s mut RwLockWriteGuard<'s, MessageBatch>,
    pub inner: &'s mut NativeState,
    msgs: &'s mut Option<Vec<Vec<OutboundMessage>>>,
    pub index_in_group: usize,
    col_map: &'s Arc<HashMap<String, Box<dyn Column>>>,
    // TODO: This should only be in the behavior execution package,
    //       but currently is necessary for flushing.
    all_behavior_col_names: &'s Arc<HashSet<String>>,
}

impl<'s> AgentState<'s> {
    pub fn num_agents(&self) -> usize {
        1
    }

    pub fn get_value(&self, field_name: &str) -> Result<serde_json::Value> {
        self.col_map
            .get(field_name)
            .ok_or_else(|| Error::InvalidRustColumn(field_name.to_owned()))?
            .get(self)
    }

    pub fn set_value(&'s mut self, field_name: &str, value: serde_json::Value) -> Result<()> {
        self.col_map
            .get(field_name)
            .ok_or_else(|| Error::InvalidRustColumn(field_name.to_owned()))?
            .set(self, value)
    }

    pub fn _set_index(&mut self, i_agent_in_group: usize) {
        self.index_in_group = i_agent_in_group;
    }

    pub fn messages_mut(&mut self) -> Result<&mut [Vec<OutboundMessage>]> {
        // TODO: the `OutboundMessage` struct is not lightweight
        // enough for our purposes. We don't need this be an enum,
        // because Arrow does not differentiate. Also because
        // we could store agent ids as bytes, not in as hyphenated
        // owned strings
        if self.msgs.is_none() {
            // TODO: get_native_messages(msg_batch.record_batch()?)
            // *self.msgs = Some(self.msg_batch.get_native_messages()?);
        }

        // SAFETY: will not fail as we've checked this is not None
        Ok(&mut self.msgs.as_mut().unwrap()[self.index_in_group..=self.index_in_group])
    }

    pub fn messages_take(&mut self) -> Result<Vec<Vec<OutboundMessage>>> {
        if self.msgs.is_none() {
            // TODO: get_native_messages(msg_batch.record_batch()?)
            // *self.msgs = Some(self.msg_batch.get_native_messages()?);
        }

        // SAFETY: will not fail as we've checked this is not None
        let agent_msgs =
            std::mem::replace(&mut self.msgs.unwrap()[self.index_in_group], Vec::new());
        Ok(vec![agent_msgs])
    }

    pub fn messages_set(&mut self, mut messages: Vec<Vec<OutboundMessage>>) {
        self.msgs.unwrap()[self.index_in_group] = std::mem::replace(&mut messages[0], Vec::new());
    }

    pub fn messages_commit(&mut self) -> Result<()> {
        if self.msgs.is_none() {
            Ok(())
        } else {
            // SAFETY: will not fail as we've checked this is not None
            let msgs = self.msgs.as_ref().unwrap();
            let builder = get_message_arrow_builder();
            let message_column = outbound_messages_to_arrow_column(&msgs, builder)?;
            self.msg_batch.batch.queue_change(ArrayChange {
                array: message_column.data(),
                index: MESSAGE_COLUMN_INDEX,
            })?;
            Ok(())
        }
    }
}

// TODO: When we have packages other than behavior execution, also need read-only group state
pub struct GroupState<'s> {
    // `inner` and `agent_batch` have to be public due to impl in accessors macro.
    pub agent_batch: RwLockWriteGuard<'s, AgentBatch>,
    msg_batch: RwLockWriteGuard<'s, MessageBatch>,
    pub inner: NativeState,
    msgs: Option<Vec<Vec<OutboundMessage>>>,
    schema: &'s SimSchema,
    col_map: &'s Arc<HashMap<String, Box<dyn Column>>>,
    // TODO: This should only be in the behavior execution package,
    //       but currently is necessary for flushing.
    all_behavior_col_names: &'s Arc<HashSet<String>>,
}

impl<'s> GroupState<'s> {
    pub fn num_agents(&self) -> usize {
        self.agent_batch.num_agents()
    }

    pub fn get_agent(&'s mut self, i_agent_in_group: usize) -> AgentState<'s> {
        AgentState {
            agent_batch: &mut self.agent_batch,
            msg_batch: &mut self.msg_batch,
            inner: &mut self.inner,
            msgs: &mut self.msgs,
            col_map: self.col_map,
            all_behavior_col_names: self.all_behavior_col_names,
            index_in_group: i_agent_in_group,
        }
    }

    pub fn data_ref(&'s self, i_field: usize) -> &'s Arc<ArrayData> {
        self.agent_batch.batch.column(i_field).data_ref()
    }

    fn commit_messages(&mut self) -> Result<()> {
        if let Some(ref msgs) = self.msgs {
            let builder = get_message_arrow_builder();
            let message_column = outbound_messages_to_arrow_column(msgs, builder)?;
            self.msg_batch.batch.queue_change(ArrayChange {
                array: message_column.data(),
                index: MESSAGE_COLUMN_INDEX,
            })?;
        }
        Ok(())
    }

    pub fn flush(&mut self) -> Result<()> {
        // flush(
        //     &mut self.agent_batch,
        //     &mut self.msg_batch,
        //     &mut self.msgs,
        //     &mut self.col_map,
        //     &mut self.all_behavior_col_names,
        // )
        // Flush agent state
        for col_name in self.all_behavior_col_names.iter() {
            let b = self
                .col_map
                .get(col_name)
                .ok_or_else(|| Error::InvalidRustColumn(col_name.clone()))?;

            b.commit(self)?;
        }
        self.agent_batch.batch.flush_changes()?;

        // Flush message state
        self.commit_messages()?;
        self.msg_batch.batch.flush_changes()?;
        Ok(())
    }

    pub fn get_json_state(&'s mut self) -> Result<Vec<Agent>> {
        self.flush()?;
        let json_state = (&*self.agent_batch, &*self.msg_batch)
            .into_agent_states(Some(&self.schema.agent))
            .map_err(|e| Error::from(e.to_string()))?;
        Ok(json_state)
    }
}

#[derive(new)]
pub struct SimState {
    schema: SimSchema,
    pub agent_pool: Vec<Arc<RwLock<AgentBatch>>>,
    pub msg_pool: Vec<Arc<RwLock<MessageBatch>>>,

    col_map: Arc<HashMap<String, Box<dyn Column>>>,

    // TODO: This should only be in the behavior execution package,
    //       but currently is necessary for flushing.
    all_behavior_col_names: Arc<HashSet<String>>,
}

impl SimState {
    pub fn get_group<'s>(&'s mut self, i_group: usize) -> Result<GroupState<'s>> {
        let agent_batch = self.agent_pool[i_group]
            .try_write()
            .expect("Should be able to write to group state agent batch");
        let msg_batch = self.msg_pool[i_group]
            .try_write()
            .expect("Should be able to write to group state message batch");

        let inner = NativeState::from_column_set(
            &self.all_behavior_col_names,
            &self.schema.agent.arrow,
            &agent_batch,
        )?;

        Ok(GroupState {
            schema: &self.schema,
            all_behavior_col_names: &self.all_behavior_col_names,
            col_map: &self.col_map,
            agent_batch,
            msg_batch,
            inner,
            msgs: None,
        })
    }
}

pub struct StateSnapshot {
    pub agent_pool: Vec<Arc<RwLock<AgentBatch>>>,
    pub msg_pool: Vec<Arc<RwLock<MessageBatch>>>,
}
