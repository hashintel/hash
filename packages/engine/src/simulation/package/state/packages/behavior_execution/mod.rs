mod chain;
mod reset_index_col;
// TODO: better name for config
pub mod config;
pub mod fields;
pub mod tasks;

use self::{config::exp_init_message, fields::behavior::BehaviorMap};
use crate::datastore::schema::accessor::GetFieldSpec;

use crate::datastore::schema::FieldSource;
use crate::datastore::table::state::ReadState;
use crate::datastore::table::task_shared_store::TaskSharedStoreBuilder;
use crate::simulation::package::name::PackageName;
use crate::simulation::package::state::packages::behavior_execution::config::BehaviorIds;
use crate::simulation::package::state::packages::behavior_execution::tasks::ExecuteBehaviorsTask;
use crate::simulation::task::active::ActiveTask;
use crate::simulation::task::Task;
use crate::Language;
use reset_index_col::reset_index_col;
use serde_json::Value;

use super::super::*;

pub const BEHAVIOR_INDEX_INNER_COUNT: usize = 2;
pub type BehaviorIdInnerDataType = u16;
pub type BehaviorIndexInnerDataType = f64;

pub struct Creator {
    experiment_config: Option<Arc<ExperimentConfig>>,
    behavior_ids: Option<Arc<BehaviorIds>>,
    behavior_map: Option<Arc<BehaviorMap>>,
}

impl Creator {
    fn get_behavior_ids(&self) -> Result<&Arc<BehaviorIds>> {
        Ok(self.behavior_ids.as_ref().ok_or(
            Error::from("BehaviorExecution Package Creator didn't have behavior ids, maybe `initialize_for_experiment` wasn't called."))?)
    }

    fn get_behavior_map(&self) -> Result<&Arc<BehaviorMap>> {
        Ok(self.behavior_map.as_ref().ok_or(
            Error::from("BehaviorExecution Package Creator didn't have behavior map, maybe `initialize_for_experiment` wasn't called."))?)
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        let msg = exp_init_message(self.get_behavior_ids()?, self.get_behavior_map()?)?;
        Ok(serde_json::to_value(msg)?)
    }
}

impl PackageCreator for Creator {
    fn new(experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        // TODO: Packaages shouldn't have to set the source
        let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Package(
            PackageName::State(super::super::Name::BehaviorExecution),
        ));
        let behavior_map =
            BehaviorMap::try_from((experiment_config.as_ref(), &field_spec_creator))?;
        let behavior_ids = BehaviorIds::from_behaviors(&behavior_map)?;

        Ok(Box::new(Creator {
            experiment_config: Some(Arc::clone(experiment_config)),
            behavior_ids: Some(Arc::new(behavior_ids)),
            behavior_map: Some(Arc::new(behavior_map)),
        }))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        let behavior_ids_col_data_types = fields::id_column_data_types()?;
        // TODO - probably just rename the actual field key to behavior_ids (rather than behavior indices) to avoid confusion with "behavior_index" col
        let behavior_ids_col = accessor
            .get_local_private_scoped_field_spec("behavior_ids")?
            .to_key()?;

        let behavior_ids_col_index = config
            .sim
            .store
            .agent_schema
            .arrow
            .index_of(behavior_ids_col.value())?;

        let behavior_index_col = accessor
            .get_agent_scoped_field_spec("behavior_index")?
            .to_key()?;
        let behavior_index_col_index = config
            .sim
            .store
            .agent_schema
            .arrow
            .index_of(behavior_index_col.value())?;

        Ok(Box::new(BehaviorExecution {
            behavior_map: Arc::clone(self.get_behavior_map()?),
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
        Ok(fields::get_state_field_specs(config, field_spec_creator)?)
    }
}

struct BehaviorExecution {
    behavior_map: Arc<BehaviorMap>,
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

// TODO OS - Needs implementing
impl BehaviorExecution {
    // TODO update doc with correct key, not __behaviors
    /// Iterates over all "behaviors" fields of agents and writes them into their "behaviors" field.
    /// This fixation guarantees that all behaviors that were there in the beginning of behavior execution
    /// will be executed accordingly
    fn fix_behavior_chains(&mut self, state: &mut ExState) -> Result<()> {
        let behavior_ids = chain::gather_behavior_chains(
            state,
            &self.behavior_ids,
            self.behavior_ids_col_data_types.clone(),
            self.behavior_ids_col_index,
        )?;

        state.set_pending_column(behavior_ids)?;
        Ok(())
    }

    fn reset_behavior_index_col(&mut self, state: &mut ExState) -> Result<()> {
        let behavior_index_col = reset_index_col(state, self.behavior_index_col_index)?;
        state.set_pending_column(behavior_index_col)?;

        Ok(())
    }

    /// Iterate over languages of first behaviors to choose first language runner to send task to
    fn get_first_lang(&self, state: &ExState) -> Result<Option<Language>> {
        for batch in state.agent_pool().read_batches()? {
            for agent_behaviors in batch.behavior_list_bytes_iter()? {
                if agent_behaviors.len() == 0 {
                    continue;
                }

                let first_behavior = agent_behaviors[0];
                let behavior_lang = self
                    .behavior_ids
                    .get_index(&first_behavior)
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
        state: &mut ExState,
        context: &Context,
        lang: Language,
    ) -> Result<ActiveTask> {
        let shared_store = TaskSharedStoreBuilder::new()
            .write_state(state)?
            .read_context(context)?
            .build();
        let state_task: StateTask = ExecuteBehaviorsTask {
            target: lang.into(),
        }
        .into();
        let task: Task = state_task.into();
        let active_task = self.comms.new_task(task, shared_store).await?;
        Ok(active_task)
    }
}

#[async_trait]
impl Package for BehaviorExecution {
    async fn run(&mut self, state: &mut ExState, context: &Context) -> Result<()> {
        log::trace!("Running BehaviorExecution");
        self.fix_behavior_chains(state)?;
        self.reset_behavior_index_col(state)?;
        state.flush_pending_columns()?;

        let lang = match self.get_first_lang(state)? {
            Some(lang) => lang,
            None => {
                log::warn!("No behaviors were found to execute");
                return Ok(());
            } // No behaviors to execute
        };
        log::trace!("Beginning BehaviorExecution task");
        let active_task = self.begin_execution(state, context, lang).await?;
        let msg = active_task.drive_to_completion().await?; // Wait for results
                                                            // TODO: Get latest metaversions from message and reload state if necessary.
        log::trace!("BehaviorExecution task finished: {:?}", &msg);
        Ok(())
    }
}
