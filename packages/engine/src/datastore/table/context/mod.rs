use std::sync::Arc;

use crate::{
    config::StoreConfig,
    datastore::{
        batch::DynamicBatch,
        prelude::*,
        schema::state::AgentSchema,
        table::{
            pool::{agent::AgentPool, message::MessagePool, BatchPool},
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
    batch: Arc<ContextBatch>,
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
            batch: Arc::new(context_batch),
            previous_state: StatePools::empty(),
            removed_batches: Vec::new(),
        })
    }

    // TODO: UNUSED: Needs triage
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

    // TODO: UNUSED: Needs triage
    pub fn removed_batches(&mut self) -> &mut Vec<String> {
        &mut self.removed_batches
    }

    /// Returns the [`ContextBatch`] for this context.
    ///
    /// The context batch is the part of the context that’s
    /// - about the whole simulation run (length of columns = number of agents in whole simulation),
    ///   not about single groups like agent/message batches,
    /// - computed by context packages, and
    /// - particular/unique to the context, whereas previous state is a kind of state.
    pub fn global_batch(&self) -> &Arc<ContextBatch> {
        &self.batch
    }

    /// Returns a unique reference to the [`ContextBatch`] for this context.
    ///
    /// The context batch is the part of the context that’s
    /// - about the whole simulation run (length of columns = number of agents in whole simulation),
    ///   not about single groups like agent/message batches,
    /// - computed by context packages, and
    /// - particular/unique to the context, whereas previous state is a kind of state.
    ///
    /// # Errors
    ///
    /// Returns an error, if the context batch is currently in used, e.g. by cloning the [`Arc`]
    /// returned from [`global_batch()`](Self::global_batch).
    pub fn global_batch_mut(&mut self) -> Result<&mut ContextBatch> {
        Arc::get_mut(&mut self.batch)
            .ok_or_else(|| Error::from("Could not acquire write access to the `ContextBatch`"))
    }

    pub fn into_pre_context(self) -> PreContext {
        PreContext {
            batch: self.batch,
            removed_batches: self.removed_batches,
        }
    }

    /// Copies the current agent `State` into the `Context`.
    ///
    /// This should happen before running state packages, which will store a snapshot of the state.
    ///
    /// This can result in a change in the number of groups and batches within the `Context`,
    /// and thus it requires mutable access to the state to update the group start indices which
    /// refer to the `Context`.
    pub fn update_agent_snapshot(
        &mut self,
        state: &mut State,
        agent_schema: &AgentSchema,
        experiment_id: &ExperimentId,
    ) -> Result<()> {
        let mut static_pool = self.agent_pool_mut().write_proxies()?;
        let dynamic_pool = state.agent_pool().read_proxies()?;

        for (static_batch, dynamic_batch) in static_pool
            .batches_iter_mut()
            .zip(dynamic_pool.batches_iter())
        {
            static_batch.sync(dynamic_batch)?;
        }

        // TODO search everywhere and replace static_pool and dynamic_pool to more descriptively
        //  refer to context/state (respectively)
        // Release write access to the agent pool, so
        // we can remove batches from it.
        drop(static_pool);
        let static_pool = self.agent_pool_mut();

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
            let removed_ids = (dynamic_pool.len()..static_pool.len())
                .rev()
                .map(|remove_index| static_pool.remove(remove_index))
                .collect::<Vec<_>>();
            self.removed_batches.extend(removed_ids);
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
    batch: Arc<ContextBatch>,
    /// Local metadata
    removed_batches: Vec<String>,
}

impl PreContext {
    /// TODO: DOC
    pub fn finalize(
        self,
        state_snapshot: StatePools,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<Context> {
        let mut context = Context {
            batch: self.batch,
            previous_state: state_snapshot,
            removed_batches: self.removed_batches,
        };
        context
            .global_batch_mut()?
            .write_from_context_datas(column_writers, num_elements)?;
        Ok(context)
    }
}
