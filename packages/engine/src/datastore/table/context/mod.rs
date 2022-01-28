use std::sync::Arc;

use parking_lot::RwLock;

use super::{
    meta::Meta,
    pool::{agent::AgentPool, message::MessagePool},
    state::view::StateSnapshot,
};
use crate::{
    config::StoreConfig, datastore::prelude::*, proto::ExperimentId,
    simulation::package::context::ContextColumn,
};

/// The context is global, consistent data about the simulation at a single point in time, which is
/// shared between all agents.
///
/// It contains information about the general simulation, rather than data belonging to specific
/// agents. This is effectively what the agent 'can see', e.g. neighboring agents, incoming messages
/// and globals. Due to it being a description of the current environment surrounding the agent,
/// it's immutable (unlike an agent's specific state).
pub struct Inner {
    batch: Arc<RwLock<ContextBatch>>,
    // TODO: replace these two fields with `StateSnapshot`
    /// Agent Batches that are a snapshot of state from the previous step
    agent_pool: AgentPool,
    /// Pool that are a snapshot of the message batches from the previous step
    message_pool: MessagePool,
    // TODO: remove Meta, just move in removed_ids
    /// The IDs of the batches that were removed between this step and the last
    local_meta: Meta,
}

/// A wrapper object around the contents of the Context, to provide type-safe differentiation
/// from something with write access to the Context see ([`ExContext`])
pub struct Context {
    inner: Inner,
}

impl Context {
    // TODO: return ref and they can clone
    pub fn batch(&self) -> Arc<RwLock<ContextBatch>> {
        self.inner.batch.clone()
    }

    /// TODO: DOC
    pub fn new_from_columns(
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
        let inner = Inner {
            batch: Arc::new(RwLock::new(context_batch)),
            agent_pool: AgentPool::empty(),
            message_pool: MessagePool::empty(),
            local_meta: Meta::default(),
        };
        Ok(Context { inner })
    }

    /// Get mutable access to the Context
    pub fn into_mut(self) -> ContextMut {
        ContextMut { inner: self.inner }
    }
}

impl ReadContext for Context {
    fn inner(&self) -> &Inner {
        &self.inner
    }
}

// TODO can we just wrap the Context instead of needing another layer called Inner
/// Exclusive (write) access to `Context`
pub struct ContextMut {
    inner: Inner,
}

impl ContextMut {
    /// Give up mutable access and allow for it to be read in multiple places
    pub fn into_shared(self) -> Context {
        Context { inner: self.inner }
    }

    pub fn take_agent_pool(&mut self) -> AgentPool {
        std::mem::replace(&mut self.inner_mut().agent_pool, AgentPool::empty())
    }

    pub fn take_message_pool(&mut self) -> MessagePool {
        std::mem::replace(&mut self.inner_mut().message_pool, MessagePool::empty())
    }

    pub fn set_message_pool(&mut self, pool: MessagePool) {
        self.inner_mut().message_pool = pool;
    }

    pub fn local_meta(&mut self) -> &mut Meta {
        &mut self.inner.local_meta
    }

    pub fn write_batch(
        &mut self,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<()> {
        self.inner
            .batch
            .try_write()
            .ok_or_else(|| Error::from("Expected to be able to write"))?
            .write_from_context_datas(column_writers, num_elements)
    }

    pub fn into_pre_context(self) -> PreContext {
        PreContext {
            batch: self.inner.batch,
            local_meta: self.inner.local_meta,
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
    ) -> Result<ContextMut> {
        let (agent_pool, message_pool) = snapshot.deconstruct();
        let inner = Inner {
            batch: self.batch,
            agent_pool,
            message_pool,
            local_meta: self.local_meta,
        };
        let mut context = ContextMut { inner };
        context.write_batch(column_writers, num_elements)?;
        Ok(context)
    }
}

impl ReadContext for ContextMut {
    fn inner(&self) -> &Inner {
        &self.inner
    }
}

impl WriteContext for ContextMut {
    fn inner_mut(&mut self) -> &mut Inner {
        &mut self.inner
    }
}

pub trait ReadContext {
    fn inner(&self) -> &Inner;
}
pub trait WriteContext: ReadContext {
    fn inner_mut(&mut self) -> &mut Inner;
}

impl Inner {
    pub fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.agent_pool
    }

    pub fn agent_pool(&self) -> &AgentPool {
        &self.agent_pool
    }

    pub fn message_pool_mut(&mut self) -> &mut MessagePool {
        &mut self.message_pool
    }

    pub fn message_pool(&self) -> &MessagePool {
        &self.message_pool
    }
}
