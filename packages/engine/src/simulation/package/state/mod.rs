pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
pub use packages::{Name, StateTask, StateTaskMessage, PACKAGE_CREATORS};
use stateful::{
    context::Context,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    globals::Globals,
    state::State,
};
use tracing::Span;

use crate::{
    config::{ExperimentConfig, SimRunConfig},
    simulation::{
        comms::package::PackageComms,
        package::{
            deps::Dependencies,
            ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg},
        },
        Error, Result,
    },
};

#[async_trait]
pub trait Package: GetWorkerSimStartMsg + Send + Sync {
    async fn run(&mut self, state: &mut State, context: &Context) -> Result<()>;

    fn span(&self) -> Span;
}

pub trait PackageCreator: GetWorkerExpStartMsg + Send + Sync {
    /// We can't derive a default as that returns Self which implies Sized which in turn means we
    /// can't create Trait Objects out of PackageCreator
    fn new(experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>>
    where
        Self: Sized;

    /// Create the package.
    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>>;

    /// Get the package names that this package depends on.
    fn dependencies() -> Dependencies
    where
        Self: Sized,
    {
        Dependencies::empty()
    }

    fn get_state_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        _field_spec_map_builder: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
