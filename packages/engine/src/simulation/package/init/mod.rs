//! TODO: DOC

pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
pub use packages::{InitTask, InitTaskMessage, Name, PACKAGE_CREATORS};
use stateful::{
    agent::Agent,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    globals::Globals,
};

use crate::{
    config::{ExperimentConfig, SimRunConfig},
    simulation::{
        comms::package::PackageComms,
        package::{
            deps::Dependencies,
            ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg, MaybeCpuBound},
        },
        Result,
    },
};

#[async_trait]
pub trait Package: MaybeCpuBound + GetWorkerSimStartMsg + Send + Sync {
    async fn run(&mut self) -> Result<Vec<Agent>>;
}

pub trait PackageCreator: GetWorkerExpStartMsg + Sync + Send {
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
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>>;

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
