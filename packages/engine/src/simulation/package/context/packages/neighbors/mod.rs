use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use stateful::field::{
    EngineComponent, FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator,
};
use tracing::Span;

use self::map::{NeighborMap, NeighborRef};
use crate::{
    config::{ExperimentConfig, Globals, SimRunConfig, TopologyConfig},
    datastore::{
        batch::{iterators, AgentBatch},
        schema::context::ContextSchema,
        table::{proxy::StateReadProxy, state::view::StateSnapshot},
    },
    simulation::{
        comms::package::PackageComms,
        package::{
            context::{
                packages::neighbors::fields::NEIGHBORS_FIELD_NAME, ContextColumn, ContextPackage,
                Package, PackageCreator,
            },
            ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg, MaybeCpuBound},
        },
        Result,
    },
};

mod adjacency;
mod fields;
mod map;
mod writer;

const CPU_BOUND: bool = true;
pub const NEIGHBOR_INDEX_COUNT: usize = 2;

pub type IndexType = u32;
pub type ArrowIndexBuilder = arrow::array::UInt32Builder;

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _state_field_spec_accessor: FieldSpecMapAccessor<EngineComponent>,
        context_field_spec_accessor: FieldSpecMapAccessor<EngineComponent>,
    ) -> Result<Box<dyn ContextPackage>> {
        let neighbors = Neighbors {
            topology: Arc::new(TopologyConfig::from_globals(&config.sim.globals)?),
            context_field_spec_accessor,
        };
        Ok(Box::new(neighbors))
    }

    fn get_context_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
    ) -> Result<Vec<RootFieldSpec<EngineComponent>>> {
        Ok(vec![fields::get_neighbors_field_spec(field_spec_creator)?])
    }

    fn get_state_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator<EngineComponent>,
    ) -> Result<Vec<RootFieldSpec<EngineComponent>>> {
        Ok(vec![fields::get_search_radius_field_spec(
            field_spec_creator,
        )?])
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct Neighbors {
    topology: Arc<TopologyConfig>,
    context_field_spec_accessor: FieldSpecMapAccessor<EngineComponent>,
}

impl Neighbors {
    fn neighbor_vec<'a>(batches: &'a [&AgentBatch]) -> Result<Vec<NeighborRef<'a>>> {
        Ok(iterators::agent::position_iter(batches)?
            .zip(iterators::agent::index_iter(batches))
            .zip(iterators::agent::search_radius_iter(batches)?)
            .collect())
    }
}

impl MaybeCpuBound for Neighbors {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl GetWorkerSimStartMsg for Neighbors {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for Neighbors {
    async fn run<'s>(
        &mut self,
        state_proxy: StateReadProxy,
        _snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>> {
        // We want to pass the span for the package to the writer, so that the write() call isn't
        // nested under the run span
        let pkg_span = Span::current();
        let _run_entered = tracing::trace_span!("run").entered();

        let agent_pool = state_proxy.agent_pool();
        let batches = agent_pool.batches();
        let states = Self::neighbor_vec(&batches)?;
        let map = NeighborMap::gather(states, &self.topology)?;

        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(NEIGHBORS_FIELD_NAME)?
            .create_key()?;

        Ok(vec![ContextColumn {
            field_key,
            inner: Box::new(map),
            span: pkg_span,
        }])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        _schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Arc<dyn arrow::array::Array>)>> {
        let index_builder = ArrowIndexBuilder::new(1024);

        let neighbor_index_builder = arrow::array::FixedSizeListBuilder::new(index_builder, 2);
        let mut neighbors_builder = arrow::array::ListBuilder::new(neighbor_index_builder);

        (0..num_agents).try_for_each(|_| neighbors_builder.append(true))?;

        // TODO, this is unclean, we won't have to do this if we move empty arrow
        //   initialisation to be done per schema instead of per package
        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec("neighbors")?
            .create_key()?;

        Ok(vec![(field_key, Arc::new(neighbors_builder.finish()))])
    }

    fn span(&self) -> Span {
        tracing::debug_span!("neighbors")
    }
}
