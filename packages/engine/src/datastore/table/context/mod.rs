use std::sync::Arc;

use parking_lot::RwLock;

use super::{
    meta::Meta,
    pool::{agent::AgentPool, message::MessagePool},
    state::view::StateSnapshot,
};
use crate::{
    config::StoreConfig,
    datastore::{
        prelude::*,
        table::proxy::{BatchReadProxy, BatchWriteProxy},
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
    // TODO: replace these two fields with `StateSnapshot`
    /// Agent Batches that are a snapshot of state from the previous step.
    agent_pool: AgentPool,
    /// Pool that are a snapshot of the message batches from the previous step.
    message_pool: MessagePool,
    // TODO: remove Meta, just move in removed_ids
    /// The IDs of the batches that were removed between this step and the last.
    local_meta: Meta,
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
            agent_pool: AgentPool::empty(),
            message_pool: MessagePool::empty(),
            local_meta: Meta::default(),
        })
    }

    pub fn agent_pool(&self) -> &AgentPool {
        &self.agent_pool
    }

    pub fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.agent_pool
    }

    pub fn take_agent_pool(&mut self) -> AgentPool {
        std::mem::replace(&mut self.agent_pool, AgentPool::empty())
    }

    pub fn take_message_pool(&mut self) -> MessagePool {
        std::mem::replace(&mut self.message_pool, MessagePool::empty())
    }

    pub fn local_meta(&mut self) -> &mut Meta {
        &mut self.local_meta
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
            local_meta: self.local_meta,
        }
    }
}

/// A subset of the Context that's used while running context packages, as the MessagePool and
/// AgentPool are possibly invalid and unneeded while building/updating the context.
pub struct PreContext {
    batch: Arc<RwLock<ContextBatch>>,
    /// Local metadata
    local_meta: Meta,
}

impl PreContext {
    /// TODO: DOC
    pub fn finalize(
        self,
        snapshot: StateSnapshot,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<Context> {
        let (agent_pool, message_pool) = snapshot.deconstruct();
        let mut context = Context {
            batch: self.batch,
            agent_pool,
            message_pool,
            local_meta: self.local_meta,
        };
        context
            .write_proxy()?
            .batch_mut()
            .write_from_context_datas(column_writers, num_elements)?;
        Ok(context)
    }
}
