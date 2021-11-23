mod chain;
pub mod config;
pub mod fields;
pub mod tasks;

use self::{
    config::{init_message, BehaviorConfig},
    fields::behavior::BehaviorMap,
};
use crate::datastore::schema::FieldKey;
use crate::datastore::table::state::ReadState;
use crate::simulation::task::active::ActiveTask;
use serde_json::Value;

use super::super::*;

pub const BEHAVIOR_INDEX_INNER_COUNT: usize = 2;
pub type BehaviorIndexInnerDataType = u16;

pub struct Creator {}

impl Creator {
    pub fn new() -> Box<dyn PackageCreator> {
        Box::new(Creator {})
    }
}

// TODO OS - needs implementing
impl PackageCreator for Creator {
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        todo!();
        // let index_column_data_types = fields::index_column_data_types()?;
        // let behavior_map = BehaviorMap::try_from(&config.exp)?;
        // Ok(Box::new(BehaviorExecution {
        //     behavior_config,
        //     index_column_field_key,
        //     index_column_data_types,
        //     comms,
        //     behavior_map,
        // }))
    }

    fn add_state_field_specs(
        &self,
        config: &ExperimentConfig<ExperimentRunBase>,
        globals: &Globals,
        field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        fields::add_state(config, field_spec_map_builder)?;
        Ok(())
    }
}

impl GetWorkerExpStartMsg for Creator {
    // TODO OS send out behavior source code here
    //         as it does not change per-simulation
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        todo!()
    }
}

struct BehaviorExecution {
    behavior_config: Arc<BehaviorConfig>,
    index_column_field_key: FieldKey,
    index_column_data_types: [arrow::datatypes::DataType; 3],
    comms: PackageComms,
    behavior_map: BehaviorMap,
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
            &self.behavior_config,
            self.index_column_data_types.clone(),
            self.index_column_field_key.clone(),
        )?;
        state.set_pending_column(behavior_indices)?;
        state.flush_pending_columns()?;
        Ok(())
    }

    /// Sends out behavior execution commands to workers
    async fn begin_execution(&mut self, state: &ExState) -> Result<ActiveTask> {
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

impl GetWorkerSimStartMsg for BehaviorExecution {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        let msg = init_message(&self.behavior_map)?;
        Ok(serde_json::to_value(msg)?)
    }
}

#[async_trait]
impl Package for BehaviorExecution {
    async fn run(&mut self, state: &mut ExState, context: &Context) -> Result<()> {
        self.fix_behavior_chains(state)?;
        let active_task = self.begin_execution(state).await?;
        // wait for results
        active_task.drive_to_completion().await?;

        // TODO update update reload state as well
        Ok(())
    }
}
