mod chain;
pub mod config;
pub mod fields;
pub mod tasks;

use self::{
    config::{init_message, BehaviorConfig},
    fields::behavior::BehaviorMap,
};
use crate::datastore::table::state::ReadState;
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
        // let index_column_index = config.sim.store.agent_schema.column_index_of()?;
        // let index_column_data_types = fields::index_column_data_types()?;
        // let behavior_map = BehaviorMap::try_from(&config.exp)?;
        // Ok(Box::new(BehaviorExecution {
        //     behavior_config,
        //     index_column_index,
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

struct BehaviorExecution {
    behavior_config: Arc<BehaviorConfig>,
    index_column_index: usize, // TODO[3] this shouldn't be using such a low-level tool (should use FieldKey)
    index_column_data_types: [arrow::datatypes::DataType; 3],
    comms: PackageComms,
    behavior_map: BehaviorMap,
}

// TODO OS - Needs implementing
impl BehaviorExecution {
    /// Iterates over all "behaviors" fields of agents and writes them into their "__behaviors" field.
    /// This fixation guarantees that all behaviors that were there in the beginning of behavior execution
    /// will be executed accordingly
    fn fix_behavior_chains(&mut self, state: &mut ExState) -> Result<()> {
        let behavior_indices = chain::gather_behavior_chains(
            state,
            &self.behavior_config,
            self.index_column_data_types.clone(),
            self.index_column_index,
        )?;
        state.set_pending_column(behavior_indices)?;
        state.flush_pending_columns()?;
        Ok(())
    }

    /// Sends out behavior execution commands to workers
    async fn begin_execution(&mut self, state: &ExState) -> Result<()> {
        todo!()
    }

    /// Wait for all workers to notify of finished execution
    async fn wait_results(&mut self) -> Result<()> {
        todo!()
        // TODO update update reload state as well
    }
}

impl GetWorkerStartMsg for BehaviorExecution {
    fn get_worker_start_msg(&self) -> Result<Value> {
        let msg = init_message(&self.behavior_map)?;
        Ok(serde_json::to_value(msg)?)
    }
}

#[async_trait]
impl Package for BehaviorExecution {
    async fn run(&mut self, state: &mut ExState, context: &Context) -> Result<()> {
        self.fix_behavior_chains(state)?;
        self.begin_execution(state).await?;
        self.wait_results().await?;
        Ok(())
    }
}
