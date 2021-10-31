pub mod create_remove;
pub mod hash_message;
pub mod message;
pub mod view;

use crate::proto::{ExperimentID, ExperimentRunBase};

use crate::config::StoreConfig;
use crate::{
    datastore::{batch::DynamicBatch, prelude::*, schema::state::AgentSchema},
    simulation::{command::CreateRemoveCommands, packages::state::StateColumn},
    SimRunConfig,
};
use std::sync::{Arc, RwLock};

use self::create_remove::CreateRemovePlanner;

use super::{
    context::{ExContext, WriteContext},
    meta::Meta,
    pool::{agent::AgentPool, message::MessagePool},
    references::MessageMap,
};

struct Inner {
    /// Pool which contains all Dynamic Agent Batches
    agent_pool: AgentPool,
    /// Pool which contains all Outbox Batches
    message_pool: MessagePool,
    /// Local metadata
    local_meta: Meta,
    /// Number of agents
    num_elements: usize,
}

impl Inner {
    fn from_agent_states(
        agent_state_batches: &[&[AgentState]],
        num_agents: usize,
        sim_config: &SimRunConfig<ExperimentRunBase>,
    ) -> Result<Inner> {
        let mut agent_batches = Vec::with_capacity(agent_state_batches.len());
        let mut message_batches = Vec::with_capacity(agent_state_batches.len());
        let agent_schema = &sim_config.sim.store.agent_schema;
        let message_schema = &sim_config.sim.store.message_schema;
        let experiment_run_id = &sim_config.exp.run_id;
        for agent_state_batch in agent_state_batches {
            agent_batches.push(Arc::new(parking_lot::RwLock::new(
                AgentBatch::from_agent_states(*agent_state_batch, agent_schema, experiment_run_id)?,
            )));
            message_batches.push(Arc::new(parking_lot::RwLock::new(
                MessageBatch::from_agent_states(
                    *agent_state_batch,
                    message_schema,
                    experiment_run_id,
                )?,
            )));
        }
        let agent_pool = AgentPool::new(agent_batches);
        let message_pool = MessagePool::new(message_batches);

        let inner = Inner {
            agent_pool,
            message_pool,
            local_meta: Meta::default(),
            num_elements: num_agents,
        };
        Ok(inner)
    }
}

pub struct State {
    inner: Inner,
    sim_config: Arc<SimRunConfig<ExperimentRunBase>>,
}

impl State {
    pub fn from_agent_states(
        agent_states: Vec<AgentState>,
        sim_config: Arc<SimRunConfig<ExperimentRunBase>>,
    ) -> Result<State> {
        let num_workers = sim_config.sim.engine.num_workers;
        let num_agents = agent_states.len();

        // Distribute agents across workers
        const MIN_PER_WORKER: usize = 10;
        let num_agents_per_worker =
            ((num_agents as f64 / num_workers as f64).ceil() as usize).max(MIN_PER_WORKER);
        let mut split_agent_states = vec![];
        let mut next_index = 0;
        while next_index != num_agents {
            let this_index = next_index;
            next_index = (next_index + num_agents_per_worker).min(num_agents);
            split_agent_states.push(&agent_states[this_index..next_index]);
        }
        let inner = Inner::from_agent_states(&split_agent_states, num_agents, &sim_config)?;
        Ok(State { inner, sim_config })
    }

    pub fn upgrade(self) -> ExState {
        ExState {
            inner: self.inner,
            global_meta: self.sim_config,
        }
    }
}

impl ReadState for State {
    fn inner(&self) -> &Inner {
        &self.inner
    }

    fn sim_config(&self) -> &Arc<SimRunConfig<ExperimentRunBase>> {
        &self.sim_config
    }
}

/// Exclusive (write) access to State
pub struct ExState {
    inner: Inner,
    global_meta: Arc<SimRunConfig<ExperimentRunBase>>,
}

impl ExState {
    pub fn downgrade(self) -> State {
        State {
            inner: self.inner,
            sim_config: self.global_meta,
        }
    }

    pub fn local_meta(&mut self) -> &mut Meta {
        &mut self.inner.local_meta
    }

    pub fn finalize_agent_pool(
        &self,
        context: &mut ExContext,
        agent_schema: &AgentSchema,
        experiment_run_id: &ExperimentID,
    ) -> Result<()> {
        let static_pool = context.inner_mut().agent_pool_mut().write_batches()?;
        let dynamic_pool = self.agent_pool().read_batches()?;

        (0..dynamic_pool.len().min(static_pool.len())).try_for_each::<_, Result<()>>(
            |batch_index| {
                let dynamic_batch = dynamic_pool[batch_index];
                let static_batch = static_pool[batch_index];
                static_batch.sync(dynamic_batch)?;
                Ok(())
            },
        )?;

        drop(static_pool);
        let static_pool = context.inner_mut().agent_pool_mut().mut_batches();

        if dynamic_pool.len() > static_pool.len() {
            // Add more static batches
            dynamic_pool[static_pool.len()..dynamic_pool.len()]
                .iter()
                .try_for_each::<_, Result<()>>(|batch| {
                    let r#static =
                        AgentBatch::duplicate_from(batch, agent_schema, experiment_run_id)?;
                    static_pool.push(Arc::new(parking_lot::RwLock::new(r#static)));
                    Ok(())
                })?;
        } else if dynamic_pool.len() < static_pool.len() {
            // Remove unneeded static batches
            let mut removed_ids = Vec::with_capacity(static_pool.len() - dynamic_pool.len());
            (dynamic_pool.len()..static_pool.len())
                .rev()
                .try_for_each::<_, Result<()>>(|remove_index| {
                    let removed = static_pool.remove(remove_index);
                    removed_ids.push(removed.try_read()?.get_batch_id().to_string());
                    Ok(())
                })?;
            removed_ids
                .into_iter()
                .for_each(|id| context.local_meta().removed_batch(id));
        }

        Ok(())
    }

    pub fn create_remove(
        &mut self,
        commands: CreateRemoveCommands,
        config: &SimRunConfig<ExperimentRunBase>,
    ) -> Result<()> {
        let mut planner = CreateRemovePlanner::new(commands, config.clone())?;
        let plan = planner.run(self)?;
        *self.num_agents_mut() = plan.num_agents_after_execution;
        let removed_ids = plan.execute(self.agent_pool_mut(), &config.meta)?;

        // Register all batches that were removed
        removed_ids
            .into_iter()
            .for_each(|id| self.local_meta().removed_batch(id));
        Ok(())
    }

    // TODO enable writing into the message batch too
    pub fn set_pending_column(&mut self, column: StateColumn) -> Result<()> {
        self.inner.agent_pool.set_pending_column(column)
    }

    pub fn flush_pending_columns(&mut self) -> Result<()> {
        self.inner.agent_pool.flush_pending_columns()
    }
}

impl ReadState for ExState {
    fn inner(&self) -> &Inner {
        &self.inner
    }

    fn sim_config(&self) -> &Arc<SimRunConfig<ExperimentRunBase>> {
        &self.global_meta
    }
}
impl WriteState for ExState {
    fn inner_mut(&mut self) -> &mut Inner {
        &mut self.inner
    }
}

pub trait WriteState: ReadState {
    fn inner_mut(&mut self) -> &mut Inner;

    fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.inner_mut().agent_pool
    }

    fn message_pool_mut(&mut self) -> &mut MessagePool {
        &mut self.inner_mut().message_pool
    }

    /// Reset the messages of the State
    ///
    /// Uses the Context message pool shared memories
    /// as the base for the new message pool for State.
    ///
    /// Returns the old messages so they can be used
    /// later for reference
    fn reset_messages(
        &mut self,
        mut old_context_message_pool: MessagePool,
        sim_config: &SimRunConfig<ExperimentRunBase>,
    ) -> Result<MessagePool> {
        let inner = self.inner_mut();
        let agent_pool = &inner.agent_pool;
        old_context_message_pool.reset(agent_pool, sim_config)?;
        Ok(std::mem::replace(
            &mut inner.message_pool,
            old_context_message_pool,
        ))
    }

    fn num_agents_mut(&mut self) -> &mut usize {
        &mut self.inner_mut().num_elements
    }
}

pub trait ReadState {
    fn inner(&self) -> &Inner;

    fn sim_config(&self) -> &Arc<SimRunConfig<ExperimentRunBase>>;

    fn message_pool(&self) -> &MessagePool {
        &self.inner().message_pool
    }

    fn message_map(&self) -> Result<MessageMap> {
        let read = self.message_pool().read()?;
        MessageMap::new(&read)
    }

    fn agent_pool(&self) -> &AgentPool {
        &self.inner().agent_pool
    }

    fn num_agents(&self) -> usize {
        self.inner().num_elements
    }
}
