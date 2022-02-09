use std::sync::Arc;

use parking_lot::RwLock;

use crate::{
    config::StoreConfig,
    datastore::{
        batch::DynamicBatch,
        prelude::*,
        schema::state::AgentSchema,
        table::{
            pool::{agent::AgentPool, message::MessagePool, BatchPool},
            proxy::{BatchReadProxy, BatchWriteProxy},
            state::view::StatePools,
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
    previous_state: StatePools,

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
            previous_state: StatePools::empty(),
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

    /// Copies the current agent `State` into the `Context` before running state packages, which
    /// stores a snapshot of state at the end of the last step.
    ///
    /// This can result in a change in the number of groups and batches within the `Context`,
    /// and thus it updates the group start indices registered in `state`.
    pub fn finalize_agent_pool(
        &mut self,
        state: &mut State,
        agent_schema: &AgentSchema,
        experiment_id: &ExperimentId,
    ) -> Result<()> {
        let mut static_pool = self.agent_pool_mut().write_proxy()?;
        let dynamic_pool = state.agent_pool().read_proxy()?;

        for (static_batch, dynamic_batch) in static_pool
            .batches_iter_mut()
            .zip(dynamic_pool.batches_iter())
        {
            static_batch.sync(dynamic_batch)?;
        }

        // TODO search everywhere and replace static_pool and dynamic_pool to more descriptively
        //  refer to context/state (respectively)
        drop(static_pool); // Release write access to agent pool.
        let static_pool = &mut self.previous_state.agent_pool;

        #[allow(clippy::comparison_chain)]
        if dynamic_pool.len() > static_pool.len() {
            // Add more static batches
            for batch in &dynamic_pool[static_pool.len()..dynamic_pool.len()] {
                static_pool.push(AgentBatch::duplicate_from(
                    batch,
                    agent_schema,
                    experiment_id,
                )?);
            }
        } else if dynamic_pool.len() < static_pool.len() {
            // Remove unneeded static batches
            let mut removed_ids = Vec::with_capacity(static_pool.len() - dynamic_pool.len());
            for remove_index in (dynamic_pool.len()..static_pool.len()).rev() {
                let removed = static_pool.remove(remove_index)?;
                removed_ids.push(removed.get_batch_id().to_string());
            }
            removed_ids
                .into_iter()
                .for_each(|id| self.removed_batches.push(id));
        }

        // State group start indices need to be updated, because we
        // might have added/removed agents to/from groups.
        let mut cumulative_num_agents = 0;
        let group_start_indices = Arc::new(
            dynamic_pool
                .batches_iter()
                .map(|batch| {
                    let n = cumulative_num_agents;
                    cumulative_num_agents += batch.num_agents();
                    n
                })
                .collect(),
        );
        drop(dynamic_pool);
        state.set_group_start_indices(group_start_indices);
        Ok(())
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
        state: StatePools,
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
            .write_from_context_datas(column_writers, num_elements)?;
        Ok(context)
    }
}
