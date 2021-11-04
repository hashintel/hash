use std::sync::Arc;

use crate::proto::ExperimentRunBase;

use crate::datastore::{
    prelude::Store,
    table::{context::ExContext, pool::message::MessagePool, state::ExState},
    table::{
        references::MessageMap,
        state::{view::StateSnapshot, ReadState, WriteState},
    },
};
use crate::{config::SimRunConfig, datastore::table::pool::agent::AgentPool};

use super::{
    command::CreateRemoveCommands, step_output::SimulationStepOutput,
    step_result::SimulationStepResult, Error, Result,
};
use super::{comms::Comms, packages::run::Packages};

pub struct Engine {
    packages: Packages,
    store: Store,
    comms: Arc<Comms>,
    config: Arc<SimRunConfig<ExperimentRunBase>>,
}

impl Engine {
    pub async fn new(
        mut packages: Packages,
        mut uninitialized_store: Store,
        comms: Comms,
        config: Arc<SimRunConfig<ExperimentRunBase>>,
    ) -> Result<Engine> {
        let comms = Arc::new(comms);

        let state = packages.init.run(config.clone()).await?;
        let context = packages.step.empty_context(&config, state.num_agents())?;
        uninitialized_store.set(state, context);
        let store = uninitialized_store;

        Ok(Engine {
            packages,
            store,
            comms,
            config,
        })
    }

    /// Run a step in the simulation.
    ///
    /// Currently the ordering of actions is fixed:
    /// 1) Build a Context object with the Context packages executed in parallel \[read State, write Context\]
    /// 2) Run all State packages sequentially \[write State, read Context\]
    /// 3) Calculate all of the outputs of the step with the Output packages \[read State, read Context\]
    ///
    /// However running modules in an arbitrary order is possible and
    /// is a possible future extension. Also, while we do require that
    /// output packages are run only once, context and state packages
    /// can technically be run any number of times.
    pub async fn next(&mut self) -> Result<SimulationStepResult> {
        self.run_context_packages().await?;
        self.run_state_packages().await?;
        let step_output = self.run_output_packages().await?;
        // TODO OS - COMPILE BLOCK - No method named `create_step_result` found for mutable reference `&mut Engine` in the current scope
        self.create_step_result(step_output)
    }

    /// Finalize state (see [`SimulationEngine::finalize_state`]) and create a new context
    /// for the agents.
    ///
    /// Creating a new context means taking a snapshot of current state
    /// and building a context object for packages to access.
    ///
    /// The Context object refers to the snapshot. This is done in order to avoid
    /// data races and sustain a parallel model.
    ///
    /// Each context package does some work on the snapshot and produces a sequence
    /// of data associated with each agent. Since these sequences of data are not
    /// dependent on each other, then all context packages are run in parallel
    /// and their outputs are merged into one Context object.
    async fn run_context_packages(&mut self) -> Result<()> {
        let (mut state, mut context) = self.store.take_upgraded()?;
        let snapshot = self.prepare_for_context_packages(&mut state, &mut context)?;
        let pre_context = context.into_pre_context();

        let state = Arc::new(state.downgrade());
        self.comms.state_sync(&state).await?; // Synchronize state with workers
        let context = self
            .packages
            .step
            .run_context(state.clone(), snapshot, pre_context)
            .await?
            .downgrade();
        self.comms.context_batch_sync(&context).await?; // Synchronize context with workers
        let state = Arc::try_unwrap(state)
            .map_err(|_| Error::from("Unable to unwrap state after context package execution"))?;
        self.store.set(state, context);
        Ok(())
    }

    async fn run_state_packages(&mut self) -> Result<()> {
        let (state, context) = self.store.take()?;
        let state = self
            .packages
            .step
            .run_state(state.upgrade(), &context)
            .await?;
        self.store.set(state.downgrade(), context);
        Ok(())
    }

    async fn run_output_packages(&mut self) -> Result<SimulationStepOutput> {
        let (state, context) = self.store.take()?;
        let state = Arc::new(state);
        let context = Arc::new(context);

        let output = self
            .packages
            .step
            .run_output(state.clone(), context.clone())
            .await?;
        let state = Arc::try_unwrap(state)
            .map_err(|_| Error::from("Unable to unwrap state after output package execution"))?;
        let context = Arc::try_unwrap(context)
            .map_err(|_| Error::from("Unable to unwrap context after output package execution"))?;

        self.store.set(state, context);
        Ok(output)
    }

    /// Prepare for Context Packages
    ///
    /// The following operations are performed:
    /// 1) A message map Recipient -> Vec<MessageReference>
    /// 2) Handling agent messages to "hash", i.e. performing
    /// agent creation and removals.
    ///
    /// 3) Replacing the inbox dataframe with the outbox dataframe.
    /// This is done as context packages can take references to the previous outbox.
    /// Note that agents who have been removed will still have their messages sent out.
    /// Also, a new, empty, outbox dataframe is created.
    ///
    /// 4) A static dataframe is created by copying the state (dynamic) dataframe.
    /// This is done as context packages can take references to previous state.
    /// One example of this happening is the Neighbors Context Package.
    fn prepare_for_context_packages(
        &mut self,
        state: &mut ExState,
        mut context: &mut ExContext,
    ) -> Result<StateSnapshot> {
        let message_map = state.message_map()?;
        let message_pool = state.message_pool();
        self.add_remove_agents(state, &message_map, message_pool)?;
        let message_pool = self.finalize_agent_messages(state, context)?;
        let agent_pool = self.finalize_agent_state(state, context)?;
        Ok(StateSnapshot::new(agent_pool, message_pool, message_map))
    }

    /// Create and Remove agents
    ///
    /// Operates based on the "create_agent" and "remove_agent"
    /// messages sent to "hash" through agent inboxes. Also creates
    /// and removes agents that have been requested by State packages.
    fn add_remove_agents(
        &mut self,
        state: &mut ExState,
        message_map: &MessageMap,
        message_pool: &MessagePool,
    ) -> Result<()> {
        let read = message_pool.read()?;
        let mut commands = CreateRemoveCommands::from_hash_messages(&message_map, &read)?;
        commands.merge(self.comms.take_create_remove_commands()?);
        commands.verify(&self.config.sim.store.agent_schema)?;

        state.create_remove(commands, &self.config)?;
        Ok(())
    }

    /// Replace the inbox dataframe with the outbox dataframe. Reset
    /// the old inbox dataframe and use it as the new outbox dataframe.
    fn finalize_agent_messages(
        &mut self,
        state: &mut ExState,
        context: &mut ExContext,
    ) -> Result<MessagePool> {
        let message_pool = context.take_message_pool();
        let finalized_message_pool = state.reset_messages(message_pool, &self.config)?;
        Ok(finalized_message_pool)
    }

    /// Update the old static dataframe with the new updated dynamic
    /// dataframe.
    fn finalize_agent_state(
        &mut self,
        state: &mut ExState,
        context: &mut ExContext,
    ) -> Result<AgentPool> {
        state.finalize_agent_pool(
            context,
            &self.config.sim.store.agent_schema,
            &self.config.exp.run_id,
        )?;
        Ok(context.take_agent_pool())
    }
}
