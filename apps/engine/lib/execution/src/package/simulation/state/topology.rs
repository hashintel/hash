//! Corrects position and direction of agents according to the simulations topology.

mod config;

use std::sync::Arc;

use async_trait::async_trait;
use stateful::{
    agent::AgentBatch,
    context::Context,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    proxy::BatchPool,
    state::State,
};
use tracing::Span;

pub use self::config::{TopologyConfig, WrappingBehavior};
use crate::{
    package::simulation::{
        state::{StatePackage, StatePackageCreator},
        Package, PackageComms, PackageCreator, PackageCreatorConfig, PackageInitConfig,
    },
    Result,
};

mod adjacency;
mod fields;

type PositionSubType = f64;
type Position = [PositionSubType; 3];

type DirectionSubType = f64;
type Direction = [DirectionSubType; 3];

pub struct TopologyCreator;

impl StatePackageCreator for TopologyCreator {
    fn create(
        &self,
        config: &PackageCreatorConfig,
        _init_config: &PackageInitConfig,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn StatePackage>> {
        let topology = Topology {
            config: Arc::new(TopologyConfig::from_globals(&config.globals)?),
        };
        Ok(Box::new(topology))
    }
}

impl PackageCreator for TopologyCreator {
    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_pos_corrected_field_spec(
            field_spec_creator,
        )?])
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

impl Package for Topology {}

#[async_trait]
impl StatePackage for Topology {
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
