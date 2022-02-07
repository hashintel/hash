use std::sync::Arc;

use parking_lot::RwLock;

use super::{
    pool::{agent::AgentPool, message::MessagePool},
};
use crate::{
    config::StoreConfig,
    datastore::{
        prelude::*,
        table::{
            proxy::{BatchReadProxy, BatchWriteProxy},
            state::view::StateView,
        },
    },
    proto::ExperimentId,
    simulation::package::context::ContextColumn,
};

/// The context is global, consistent data about the simulation at a single point in time, which is
/// shared between all agents.
///
/// It contains information about the general simulation, rather than data belonging to specific
/// agents. This is effectively what the agent 'can see', e.g. neighboring agents, incoming messages
/// and globals. Due to it being a description of the current environment surrounding the agent,
/// it's immutable (unlike an agent's specific state).
pub struct Context {
    batch: Arc<RwLock<ContextBatch>>,
    /// View of the state from the previous step.
    previous_state: StateView,

    /// The IDs of the batches that were removed between this step and the last.
    removed_batches: Vec<String>,
}

impl Context {
    /// TODO: DOC
    pub fn from_columns(
        cols: Vec<Arc<dyn arrow::array::Array>>,
        config: Arc<StoreConfig>,
        experiment_id: &ExperimentId,
    ) -> Result<Context> {
        let context_record_batch = RecordBatch::try_new(config.context_schema.arrow.clone(), cols)?;

        let context_batch = ContextBatch::from_record_batch(
            &context_record_batch,
            Some(&config.context_schema.arrow),
            experiment_id,
        )?;
        Ok(Self {
            batch: Arc::new(RwLock::new(context_batch)),
            previous_state: StateView {
                agent_pool: AgentPool::empty(),
                message_pool: MessagePool::empty(),
            },
            removed_batches: Vec::new(),
        })
    }

    pub fn agent_pool(&self) -> &AgentPool {
        &self.previous_state.agent_pool
    }

    pub fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.previous_state.agent_pool
    }

    pub fn take_agent_pool(&mut self) -> AgentPool {
        std::mem::replace(&mut self.previous_state.agent_pool, AgentPool::empty())
    }

    pub fn take_message_pool(&mut self) -> MessagePool {
        std::mem::replace(&mut self.previous_state.message_pool, MessagePool::empty())
    }

    pub fn removed_batches(&mut self) -> &mut Vec<String> {
        &mut self.removed_batches
    }

    pub fn read_proxy(&self) -> Result<BatchReadProxy<ContextBatch>> {
        BatchReadProxy::new(&self.batch)
    }

    pub fn write_proxy(&mut self) -> Result<BatchWriteProxy<ContextBatch>> {
        BatchWriteProxy::new(&self.batch)
    }

    pub fn into_pre_context(self) -> PreContext {
        PreContext {
            batch: self.batch,
            removed_batches: self.removed_batches,
        }
    }
}

/// A subset of the Context that's used while running context packages, as the MessagePool and
/// AgentPool are possibly invalid and unneeded while building/updating the context.
pub struct PreContext {
    batch: Arc<RwLock<ContextBatch>>,
    /// Local metadata
    removed_batches: Vec<String>,
}

impl PreContext {
    /// TODO: DOC
    pub fn finalize(
        self,
        state: StateView,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<Context> {
        let mut context = Context {
            batch: self.batch,
            previous_state: state,
            removed_batches: self.removed_batches,
        };
        context
            .write_proxy()?
            .batch_mut()
            .write_from_context_datas(column_writers, num_elements)?;
        Ok(context)
    }
}
