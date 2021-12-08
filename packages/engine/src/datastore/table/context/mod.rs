use parking_lot::RwLock;
use std::sync::Arc;

use crate::proto::ExperimentID;
use crate::simulation::package::context::ContextColumn;
use crate::{config::StoreConfig, datastore::prelude::*};

use super::{
    meta::Meta,
    pool::{agent::AgentPool, message::MessagePool},
    state::view::StateSnapshot,
};

pub struct Inner {
    batch: Arc<RwLock<ContextBatch>>,
    /// Pool which contains all Static Agent Batches
    agent_pool: AgentPool,
    /// Pool which contains all Inbox Batches
    message_pool: MessagePool,
    /// Local metadata
    local_meta: Meta,
}

pub struct Context {
    inner: Inner,
}

impl Context {
    pub fn batch(&self) -> Arc<RwLock<ContextBatch>> {
        self.inner.batch.clone()
    }

    pub fn new_from_columns(
        cols: Vec<Arc<dyn arrow::array::Array>>,
        config: Arc<StoreConfig>,
        experiment_run_id: &Arc<ExperimentID>,
        group_start_indices: Vec<usize>,
    ) -> Result<Context> {
        let context_record_batch = RecordBatch::try_new(config.context_schema.arrow.clone(), cols)?;

        let context_batch = ContextBatch::from_record_batch(
            &context_record_batch,
            Some(&config.context_schema.arrow),
            experiment_run_id,
            group_start_indices,
        )?;
        let inner = Inner {
            batch: Arc::new(RwLock::new(context_batch)),
            agent_pool: AgentPool::empty(),
            message_pool: MessagePool::empty(),
            local_meta: Meta::default(),
        };
        Ok(Context { inner })
    }

    pub fn upgrade(self) -> ExContext {
        ExContext { inner: self.inner }
    }
}

impl ReadContext for Context {
    fn inner(&self) -> &Inner {
        &self.inner
    }
}

/// Exclusive (write) access to `Context`
pub struct ExContext {
    inner: Inner,
}

impl ExContext {
    pub fn downgrade(self) -> Context {
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

pub struct PreContext {
    batch: Arc<RwLock<ContextBatch>>,
    /// Local metadata
    local_meta: Meta,
}

impl PreContext {
    pub fn finalize(
        self,
        snapshot: StateSnapshot,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<ExContext> {
        let (agent_pool, message_pool) = snapshot.deconstruct();
        let inner = Inner {
            batch: self.batch,
            agent_pool,
            message_pool,
            local_meta: self.local_meta,
        };
        let mut context = ExContext { inner };
        context.write_batch(column_writers, num_elements)?;
        Ok(context)
    }
}

impl ReadContext for ExContext {
    fn inner(&self) -> &Inner {
        &self.inner
    }
}

impl WriteContext for ExContext {
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
