use async_trait::async_trait;
use execution::{
    package::{
        state::{behavior_execution::ExecuteBehaviorsTask, StateTask},
        PackageTask,
    },
    runner::Language,
    task::TaskSharedStoreBuilder,
};
use serde_json::Value;
use stateful::{
    agent::AgentBatch,
    context::Context,
    field::{FieldSource, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    proxy::PoolWriteProxy,
    state::{State, StateWriteProxy},
};

use self::{
    config::exp_init_message, fields::behavior::BehaviorMap, reset_index_col::reset_index_col,
};
use crate::simulation::{
    package::state::{
        packages::behavior_execution::{
            config::BehaviorIds,
            fields::{BEHAVIOR_IDS_FIELD_NAME, BEHAVIOR_INDEX_FIELD_NAME},
        },
        Arc, Error, ExperimentConfig, FieldSpecMapAccessor, GetWorkerExpStartMsg,
        GetWorkerSimStartMsg, Name, PackageComms, Result, SimRunConfig, Span, StatePackage,
        StatePackageCreator,
    },
    task::active::ActiveTask,
};

mod chain;
mod reset_index_col;
// TODO: better name for config
pub mod config;
pub mod fields;

pub const BEHAVIOR_INDEX_INNER_COUNT: usize = 2;

pub type BehaviorIdInnerDataType = u16;
pub type BehaviorIndexInnerDataType = f64;

pub struct Creator {
    behavior_ids: Option<Arc<BehaviorIds>>,
    behavior_map: Option<Arc<BehaviorMap>>,
}

impl Creator {
    fn get_behavior_ids(&self) -> Result<&Arc<BehaviorIds>> {
        self.behavior_ids.as_ref().ok_or_else(|| {
            Error::from(
                "BehaviorExecution Package Creator didn't have behavior ids, maybe \
                 `initialize_for_experiment` wasn't called.",
            )
        })
    }

    fn get_behavior_map(&self) -> Result<&Arc<BehaviorMap>> {
        self.behavior_map.as_ref().ok_or_else(|| {
            Error::from(
                "BehaviorExecution Package Creator didn't have behavior map, maybe \
                 `initialize_for_experiment` wasn't called.",
            )
        })
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        let msg = exp_init_message(self.get_behavior_ids()?, self.get_behavior_map()?)?;
        Ok(serde_json::to_value(msg)?)
    }
}

impl StatePackageCreator for Creator {
    fn new(experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn StatePackageCreator>> {
        // TODO: Packages shouldn't have to set the source
        let field_spec_creator =
            RootFieldSpecCreator::new(FieldSource::Package(Name::BehaviorExecution.id()?));
        let behavior_map =
            BehaviorMap::try_from((experiment_config.as_ref(), &field_spec_creator))?;
        let behavior_ids = BehaviorIds::from_behaviors(&behavior_map)?;

        Ok(Box::new(Creator {
            behavior_ids: Some(Arc::new(behavior_ids)),
            behavior_map: Some(Arc::new(behavior_map)),
        }))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn StatePackage>> {
        let behavior_ids_col_data_types = fields::id_column_data_types();
        let behavior_ids_col = accessor
            .get_local_private_scoped_field_spec(BEHAVIOR_IDS_FIELD_NAME)?
            .create_key()?;

        let behavior_ids_col_index = config
            .sim
            .store
            .agent_schema
            .arrow
            .index_of(behavior_ids_col.value())?;

        let behavior_index_col = accessor
            .get_local_private_scoped_field_spec(BEHAVIOR_INDEX_FIELD_NAME)?
            .create_key()?;
        let behavior_index_col_index = config
            .sim
            .store
            .agent_schema
            .arrow
            .index_of(behavior_index_col.value())?;

        Ok(Box::new(BehaviorExecution {
            behavior_ids: Arc::clone(self.get_behavior_ids()?),
            behavior_ids_col_index,
            behavior_ids_col_data_types,
            behavior_index_col_index,
            comms,
        }))
    }

    fn get_state_field_specs(
        &self,
        config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        fields::get_state_field_specs(config, field_spec_creator)
    }
}

struct BehaviorExecution {
    behavior_ids: Arc<BehaviorIds>,
    behavior_ids_col_index: usize,
    behavior_ids_col_data_types: [arrow::datatypes::DataType; 3],
    behavior_index_col_index: usize,
    comms: PackageComms,
}

impl GetWorkerSimStartMsg for BehaviorExecution {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

impl BehaviorExecution {
    /// Iterates over all "behaviors" fields of agents and writes them into their "behaviors" field.
    /// This fixation guarantees that all behaviors that were there in the beginning of behavior
    /// execution will be executed accordingly
    fn fix_behavior_chains(
        &mut self,
        agent_proxies: &mut PoolWriteProxy<AgentBatch>,
    ) -> Result<()> {
        let behavior_ids = chain::gather_behavior_chains(
            &agent_proxies.batches(),
            &self.behavior_ids,
            self.behavior_ids_col_data_types.clone(),
            self.behavior_ids_col_index,
        )?;

        behavior_ids.apply_to(agent_proxies)?;
        Ok(())
    }

    fn reset_behavior_index_col(
        &mut self,
        agent_proxies: &mut PoolWriteProxy<AgentBatch>,
    ) -> Result<()> {
        let behavior_index_col = reset_index_col(self.behavior_index_col_index)?;
        behavior_index_col.apply_to(agent_proxies)?;

        Ok(())
    }

    /// Iterate over languages of first behaviors to choose first language runner to send task to
    fn get_first_lang(&self, agent_batches: &[&AgentBatch]) -> Result<Option<Language>> {
        for agent_pool in agent_batches.iter() {
            for agent_behaviors in
                chain::behavior_list_bytes_iter(agent_pool.batch.record_batch()?)?
            {
                if agent_behaviors.is_empty() {
                    continue;
                }

                let first_behavior = agent_behaviors[0];
                let behavior_lang = self
                    .behavior_ids
                    .get_index(first_behavior)
                    .ok_or_else(|| {
                        let bytes = Vec::from(first_behavior);
                        let utf8 = String::from_utf8(bytes.clone());
                        Error::InvalidBehaviorBytes(bytes, utf8)
                    })?
                    .lang_index();
                return Ok(Some(Language::from_index(behavior_lang as usize)));
            }
        }
        Ok(None)
    }

    /// Sends out behavior execution commands to workers
    async fn begin_execution(
        &mut self,
        state_proxy: StateWriteProxy,
        context: &Context,
        lang: Language,
    ) -> Result<ActiveTask> {
        let shared_store = TaskSharedStoreBuilder::new()
            .write_state(state_proxy)?
            .read_context(context)?
            .build();
        let state_task = StateTask::ExecuteBehaviorsTask(ExecuteBehaviorsTask {
            target: lang.into(),
        });
        let task = PackageTask::State(state_task);
        let active_task = self.comms.new_task(task, shared_store).await?;
        Ok(active_task)
    }
}

#[async_trait]
impl StatePackage for BehaviorExecution {
    async fn run(&mut self, state: &mut State, context: &Context) -> Result<()> {
        tracing::trace!("Running BehaviorExecution");
        let mut state_proxy = state.write()?;
        state_proxy.maybe_reload()?;
        let agent_pool = state_proxy.agent_pool_mut();

        self.fix_behavior_chains(agent_pool)?;
        self.reset_behavior_index_col(agent_pool)?;
        for agent_batch in agent_pool.batches_iter_mut() {
            agent_batch.batch.flush_changes()?;
        }

        // Have to reload state agent batches twice, because we just wrote the language ID of each
        // behavior into them, but now want to read it from them.
        // TODO: This could be changed so that they only need to be reloaded once, e.g. by getting
        //       the first language before fixing behavior chains using the behaviors column strings
        //       (instead of reading behavior ids in Rust) or by returning the first language from
        //       fix_behavior_chains.
        state_proxy.maybe_reload()?;
        let lang = match self.get_first_lang(&state_proxy.agent_pool().batches())? {
            Some(lang) => lang,
            None => {
                tracing::warn!("No behaviors were found to execute");
                return Ok(());
            } // No behaviors to execute
        };

        tracing::trace!("Beginning BehaviorExecution task");
        let active_task = self.begin_execution(state_proxy, context, lang).await?;
        let msg = active_task.drive_to_completion().await?;
        // Wait for results
        tracing::trace!("BehaviorExecution task finished: {:?}", &msg);
        Ok(())
    }

    fn span(&self) -> Span {
        tracing::debug_span!("behavior_execution")
    }
}
