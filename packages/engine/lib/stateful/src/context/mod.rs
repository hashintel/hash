//! The global state shared between all agents.
//!
//! For a high-level concept of the context, please see the [HASH documentation].
//!
//! The main structure in this module is [`Context`]. It's holding a snapshot of the
//! [`StateBatchPools`] from the previous step and is used for providing global information like
//! [`Globals`] and [`Dataset`]s.
//!
//! The [`Context`] has an in-memory representation defined by [`ContextSchema`] and can be
//! used by [`ContextBatch`]. Writing to a [`ContextBatch`] is encapsulated in [`ContextColumn`] and
//! [`ContextColumnWriter`].
//!
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent/context
//! [`Globals`]: crate::global::Globals
//! [`Dataset`]: crate::global::Dataset

mod batch;
mod column;
mod schema;

use std::sync::Arc;

use arrow2::{array::Array, chunk::Chunk};
use memory::{arrow::record_batch::RecordBatch, shared_memory::MemoryId};

pub use self::{
    batch::ContextBatch,
    column::{ContextColumn, ContextColumnWriter},
    schema::ContextSchema,
};
use crate::{
    agent::{AgentBatch, AgentBatchPool, AgentSchema},
    message::MessageBatchPool,
    proxy::BatchPool,
    state::{State, StateBatchPools},
    Error, Result,
};

/// Global, consistent data about the simulation at a single point in time, which is shared between
/// all [`Agent`]s.
///
/// It contains information about the general simulation, rather than data belonging to specific
/// agents. This is effectively what the [`Agent`] can "see" - e.g. neighboring agents, incoming
/// [`Message`]s and [`Globals`]. Due to it being a description of the current environment
/// surrounding the [`Agent`], it is immutable - in contrast to an individual agent's [`State`]).
///
/// [`Agent`]: crate::agent::Agent
/// [`Message`]: crate::message::Message
/// [`Globals`]: crate::global::Globals
/// [`State`]: crate::state::State
pub struct Context {
    batch: Arc<ContextBatch>,
    /// View of the state from the previous step.
    previous_state: StateBatchPools,

    /// The IDs of the batches that were removed between this step and the last.
    removed_batches: Vec<String>,
}

impl Context {
    /// Creates a new [`Context`] based on the Arrow arrays provided.
    ///
    /// note: if you are not sure what Arrow is, have a look at [memory::arrow]'s documentation
    /// which provides some useful resources.
    pub fn from_columns(
        cols: Chunk<Box<dyn Array>>,
        context_schema: &ContextSchema,
        memory_id: MemoryId,
    ) -> Result<Context> {
        // todo: check that the schema matches up with the columns
        let context_record_batch = RecordBatch::new(Arc::clone(&context_schema.arrow), cols);

        let context_batch = ContextBatch::from_record_batch(
            &context_record_batch,
            Arc::clone(&context_schema.arrow),
            memory_id,
        )?;
        Ok(Self {
            batch: Arc::new(context_batch),
            previous_state: StateBatchPools {
                agent_pool: AgentBatchPool::empty(),
                message_pool: MessageBatchPool::empty(),
            },
            removed_batches: Vec::new(),
        })
    }

    pub fn take_agent_pool(&mut self) -> AgentBatchPool {
        std::mem::replace(&mut self.previous_state.agent_pool, AgentBatchPool::empty())
    }

    pub fn take_message_pool(&mut self) -> MessageBatchPool {
        std::mem::replace(
            &mut self.previous_state.message_pool,
            MessageBatchPool::empty(),
        )
    }

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
    /// Returns an error if the context batch is currently in use, e.g. due to cloning the [`Arc`]
    /// returned from [`global_batch()`](Self::global_batch).
    fn global_batch_mut(&mut self) -> Result<&mut ContextBatch> {
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
        memory_id: &MemoryId,
    ) -> Result<()> {
        let mut previous_agent_batch_proxies = self.previous_state.agent_pool.write_proxies()?;
        let current_agent_batch_proxies = state.agent_pool().read_proxies()?;

        for (previous_agent_batch, current_agent_batch) in previous_agent_batch_proxies
            .batches_iter_mut()
            .zip(current_agent_batch_proxies.batches_iter())
        {
            previous_agent_batch
                .batch
                .sync(&current_agent_batch.batch)?;
        }

        // Release write access to the agent pool, so
        // we can remove batches from it.
        drop(previous_agent_batch_proxies);
        let previous_agent_batches = &mut self.previous_state.agent_pool;

        #[allow(clippy::comparison_chain)]
        if current_agent_batch_proxies.len() > previous_agent_batches.len() {
            // Add more static batches
            for batch in &current_agent_batch_proxies
                [previous_agent_batches.len()..current_agent_batch_proxies.len()]
            {
                previous_agent_batches.push(AgentBatch::duplicate_from(
                    batch,
                    agent_schema,
                    MemoryId::new(memory_id.base_id()),
                )?);
            }
        } else if current_agent_batch_proxies.len() < previous_agent_batches.len() {
            // Remove unneeded static batches
            let removed_ids = (current_agent_batch_proxies.len()..previous_agent_batches.len())
                .rev()
                .map(|remove_index| {
                    previous_agent_batches
                        .remove(remove_index)
                        .batch
                        .segment()
                        .id()
                        .to_string()
                })
                .collect::<Vec<_>>();
            self.removed_batches.extend(removed_ids);
        }

        // State group start indices need to be updated, because we
        // might have added/removed agents to/from groups.
        let mut cumulative_num_agents = 0;
        let group_start_indices = Arc::new(
            current_agent_batch_proxies
                .batches_iter()
                .map(|batch| {
                    let n = cumulative_num_agents;
                    cumulative_num_agents += batch.num_agents();
                    n
                })
                .collect(),
        );
        drop(current_agent_batch_proxies);
        state.set_group_start_indices(group_start_indices);
        Ok(())
    }
}

/// A subset of the [`Context`] that's used while running context packages.
///
/// This is required as the [`MessageBatchPool`] and [`AgentBatchPool`] are possibly invalid and
/// unneeded while building/updating the [`Context`].
pub struct PreContext {
    batch: Arc<ContextBatch>,
    /// Local metadata
    removed_batches: Vec<String>,
}

impl PreContext {
    /// TODO: DOC
    pub fn finalize(
        self,
        state_snapshot: StateBatchPools,
        column_writers: &[&ContextColumn],
        num_agents: usize,
    ) -> Result<Context> {
        let mut context = Context {
            batch: self.batch,
            previous_state: state_snapshot,
            removed_batches: self.removed_batches,
        };
        context
            .global_batch_mut()?
            .write_from_context_datas(column_writers, num_agents)?;
        Ok(context)
    }
}
