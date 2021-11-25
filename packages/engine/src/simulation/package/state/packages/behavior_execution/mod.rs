mod chain;
// TODO: better name for config
pub mod config;
pub mod fields;
pub mod tasks;

use self::{config::exp_init_message, fields::behavior::BehaviorMap};
use crate::datastore::schema::accessor::GetFieldSpec;

use crate::datastore::table::state::ReadState;
use crate::simulation::package::state::packages::behavior_execution::config::BehaviorIndices;
use crate::simulation::task::active::ActiveTask;
use serde_json::Value;
use std::convert::TryFrom;

use super::super::*;

pub const BEHAVIOR_INDEX_INNER_COUNT: usize = 2;
pub type BehaviorIndexInnerDataType = u16;

pub struct Creator {
    experiment_config: Option<Arc<ExperimentConfig>>,
    behavior_indices: Option<Arc<BehaviorIndices>>,
    behavior_map: Option<Arc<BehaviorMap>>,
}

impl Creator {
    fn get_behavior_indices(&self) -> Result<&Arc<BehaviorIndices>> {
        Ok(self.behavior_indices.as_ref().ok_or(
            Error::from("BehaviorExecution Package Creator didn't have behavior indices, maybe `initialize_for_experiment` wasn't called."))?)
    }

    fn get_behavior_map(&self) -> Result<&Arc<BehaviorMap>> {
        Ok(self.behavior_map.as_ref().ok_or(
            Error::from("BehaviorExecution Package Creator didn't have behavior map, maybe `initialize_for_experiment` wasn't called."))?)
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        let msg = exp_init_message(self.get_behavior_indices()?, self.get_behavior_map()?)?;
        Ok(serde_json::to_value(msg)?)
    }
}

impl PackageCreator for Creator {
    fn new(experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        let behavior_map = BehaviorMap::try_from(experiment_config.as_ref())?;
        let behavior_indices = BehaviorIndices::from_behaviors(&behavior_map)?;

        Ok(Box::new(Creator {
            experiment_config: Some(Arc::clone(experiment_config)),
            behavior_indices: Some(Arc::new(behavior_indices)),
            behavior_map: Some(Arc::new(behavior_map)),
        }))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        let index_column_data_types = fields::index_column_data_types()?;
        let index_column_key = accessor
            .get_agent_scoped_field_spec("behavior_index")?
            .to_key()?;
        let index_column_index = config
            .sim
            .store
            .agent_schema
            .arrow
            .index_of(index_column_key.value())?;

        Ok(Box::new(BehaviorExecution {
            behavior_map: Arc::clone(self.get_behavior_map()?),
            behavior_indices: Arc::clone(self.get_behavior_indices()?),
            index_column_index,
            index_column_data_types,
            comms,
        }))
    }

    fn add_state_field_specs(
        &self,
        config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        fields::add_state(config, field_spec_map_builder)?;
        Ok(())
    }
}

struct BehaviorExecution {
    behavior_map: Arc<BehaviorMap>,
    behavior_indices: Arc<BehaviorIndices>,
    index_column_index: usize,
    index_column_data_types: [arrow::datatypes::DataType; 3],
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
    /// Iterates over all "behaviors" fields of agents and writes them into their "__behaviors" field.
    /// This fixation guarantees that all behaviors that were there in the beginning of behavior execution
    /// will be executed accordingly
    fn fix_behavior_chains(&mut self, state: &mut ExState) -> Result<()> {
        let behavior_indices = chain::gather_behavior_chains(
            state,
            &self.behavior_indices,
            self.index_column_data_types.clone(),
            self.index_column_index,
        )?;
        state.set_pending_column(behavior_indices)?;
        state.flush_pending_columns()?;
        Ok(())
    }

    /// Sends out behavior execution commands to workers
    async fn begin_execution(&mut self, _state: &ExState) -> Result<ActiveTask> {
        // let active_task = self.comms.new_task(task, _).await?;
        // check language of behavior
        // for batch in state.agent_pool().read_batches()? {
        //     for agent in batch {
        //         for behavior in agent.behaviors
        //     }
        // }
        todo!()
    }
}

#[async_trait]
impl Package for BehaviorExecution {
    async fn run(&mut self, state: &mut ExState, _context: &Context) -> Result<()> {
        self.fix_behavior_chains(state)?;
        let active_task = self.begin_execution(state).await?;
        // wait for results
        active_task.drive_to_completion().await?;

        // TODO update update reload state as well
        Ok(())
    }
}
