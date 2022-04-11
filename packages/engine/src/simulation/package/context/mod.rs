pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
use stateful::{
    context::ContextColumn,
    field::{FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    globals::Globals,
};
use tracing::Span;

pub use self::packages::{ContextTask, ContextTaskMessage, Name, PACKAGE_CREATORS};
use crate::{
    config::{ExperimentConfig, SimRunConfig},
    datastore::{
        schema::context::ContextSchema,
        table::{proxy::StateReadProxy, state::view::StateSnapshot},
    },
    simulation::{
        comms::package::PackageComms,
        package::{
            context::Package as ContextPackage,
            deps::Dependencies,
            ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg, MaybeCpuBound},
        },
        Error, Result,
    },
};

#[async_trait]
pub trait Package: MaybeCpuBound + GetWorkerSimStartMsg + Send + Sync {
    async fn run<'s>(
        &mut self,
        state_proxy: StateReadProxy,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>>;
    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Arc<dyn arrow::array::Array>)>>;

    fn span(&self) -> Span;
}

pub trait PackageCreator: GetWorkerExpStartMsg + Sync + Send {
    /// A per-experiment initialization step that provide the creator with experiment config.
    /// This step is called when packages are loaded by the experiment controller.
    ///
    /// A default implementation is provided as most packages don't need to store the config and
    /// can get it from the simulation config when calling `create`
    /// We can't derive a default as that returns Self which implies Sized which in turn means we
    /// can't create Trait Objects out of PackageCreator
    fn new(experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>>
    where
        Self: Sized;

    /// Create the package.
    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        system: PackageComms,
        state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>>;

    fn dependencies() -> Dependencies
    where
        Self: Sized,
    {
        Dependencies::empty()
    }

    // TODO: Limit context packages to only add one field as long as we only allow one column from
    // "get_empty_arrow_column"
    fn get_context_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        _field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }

    fn get_state_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        _field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
