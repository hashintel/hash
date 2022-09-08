//! Detection of agent neighbors.

use std::sync::Arc;

use arrow2::{
    array::{MutableFixedSizeListArray, MutableListArray, MutablePrimitiveArray, TryExtend},
    datatypes::{DataType, Field},
};
use async_trait::async_trait;
use stateful::{
    agent,
    agent::AgentBatch,
    context::{ContextColumn, ContextSchema},
    field::{FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::{StateReadProxy, StateSnapshot},
};
use tracing::Span;

use self::map::{NeighborMap, NeighborRef};
use crate::{
    package::simulation::{
        context::{neighbors::fields::NEIGHBORS_FIELD_NAME, ContextPackage, ContextPackageCreator},
        state::topology::TopologyConfig,
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Result,
};

mod adjacency;
mod fields;
mod map;
mod writer;

const CPU_BOUND: bool = true;
pub const NEIGHBOR_INDEX_COUNT: usize = 2;

pub type IndexType = u32;

pub struct NeighborsCreator;

impl ContextPackageCreator for NeighborsCreator {
    fn create(
        &self,
        config: &PackageCreatorConfig,
        _init_config: &PackageInitConfig,
        _comms: PackageComms,
        _state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        let neighbors = Neighbors {
            topology: Arc::new(TopologyConfig::from_globals(&config.globals)?),
            context_field_spec_accessor,
        };
        Ok(Box::new(neighbors))
    }

    fn get_context_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_neighbors_field_spec(field_spec_creator)?])
    }
}

impl PackageCreator for NeighborsCreator {
    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_search_radius_field_spec(
            field_spec_creator,
        )?])
    }
}

pub struct Neighbors {
    topology: Arc<TopologyConfig>,
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl Neighbors {
    fn neighbor_vec(batches: &[&AgentBatch]) -> Result<Vec<NeighborRef>> {
        Ok(agent::arrow::position_iter(batches)?
            .zip(agent::arrow::index_iter(batches))
            .zip(agent::arrow::search_radius_iter(batches)?)
            .collect())
    }
}

impl MaybeCpuBound for Neighbors {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl Package for Neighbors {}

#[async_trait]
impl ContextPackage for Neighbors {
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
        let batches = agent_pool.batches_iter().collect::<Vec<_>>();
        let states = Self::neighbor_vec(&batches)?;
        let map = NeighborMap::gather(states, &self.topology)?;

        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(NEIGHBORS_FIELD_NAME)?
            .create_key()?;

        Ok(vec![ContextColumn::new(field_key, Box::new(map), pkg_span)])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        _schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Box<dyn arrow2::array::Array>)>> {
        let index_builder = MutablePrimitiveArray::<u32>::with_capacity(1024);

        let neighbor_index_builder = MutableFixedSizeListArray::new(index_builder, 2);
        // todo: this may not be the correct shape
        let mut neighbors_builder: MutableListArray<
            i32,
            MutableFixedSizeListArray<MutablePrimitiveArray<u32>>,
        > = MutableListArray::new_from(
            neighbor_index_builder,
            DataType::List(Box::new(Field::new(
                "item",
                DataType::FixedSizeList(Box::new(Field::new("item", DataType::UInt32, true)), 2),
                true,
            ))),
            num_agents,
        );

        neighbors_builder
            .try_extend((0..num_agents).map(|_| Option::<Vec<Option<Vec<Option<u32>>>>>::None))?;
        let neighbors = neighbors_builder.into_box();
        assert_eq!(neighbors.len(), num_agents);

        // TODO, this is unclean, we won't have to do this if we move empty arrow
        //   initialisation to be done per schema instead of per package
        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec("neighbors")?
            .create_key()?;

        Ok(vec![(field_key, neighbors)])
    }

    fn span(&self) -> Span {
        tracing::debug_span!("neighbors")
    }
}
