use async_trait::async_trait;
use serde_json::Value;
use stateful::{
    agent::AgentBatch,
    context::Context,
    field::{RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    proxy::BatchPool,
    state::State,
};

use crate::{
    config::{ExperimentConfig, TopologyConfig},
    simulation::{
        package::state::{
            Arc, FieldSpecMapAccessor, GetWorkerExpStartMsg, GetWorkerSimStartMsg, Package,
            PackageComms, PackageCreator, SimRunConfig, Span,
        },
        Result,
    },
};

mod adjacency;
mod fields;

type PositionSubType = f64;
type Position = [PositionSubType; 3];

type DirectionSubType = f64;
type Direction = [DirectionSubType; 3];

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        let topology = Topology {
            config: Arc::new(TopologyConfig::from_globals(&config.sim.globals)?),
        };
        Ok(Box::new(topology))
    }

    fn get_state_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_pos_corrected_field_spec(
            field_spec_creator,
        )?])
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

pub struct Topology {
    config: Arc<TopologyConfig>,
}

impl Topology {
    fn topology_correction(&self, agent_batch: &mut AgentBatch) -> Result<bool> {
        agent_batch.batch.maybe_reload()?;

        let mut ret = false;
        let (pos_dir_mut_iter, mut position_was_corrected_col) = agent_batch.topology_iter_mut()?;
        pos_dir_mut_iter.enumerate().for_each(|(i, (pos, dir))| {
            let corrected = adjacency::correct_agent(pos, dir, &self.config);
            unsafe { position_was_corrected_col.set(i, corrected) };
            ret |= corrected;
        });
        Ok(ret)
    }
}

impl GetWorkerSimStartMsg for Topology {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for Topology {
    async fn run(&mut self, state: &mut State, _context: &Context) -> Result<()> {
        tracing::trace!("Running Topology package");
        if self.config.move_wrapped_agents {
            for agent_batch in state.agent_pool_mut().write_proxies()?.batches_iter_mut() {
                if self.topology_correction(agent_batch)? {
                    // TODO: inplace changes and metaversioning should happen at a deeper level.
                    agent_batch.batch.increment_batch_version();
                }
            }
        }
        Ok(())
    }

    fn span(&self) -> Span {
        tracing::debug_span!("topology")
    }
}
