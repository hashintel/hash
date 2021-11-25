use std::sync::Arc;

pub use packages::{InitTask, InitTaskMessage, Name, PACKAGE_CREATORS};

pub use crate::config::Globals;
use crate::datastore::schema::accessor::FieldSpecMapAccessor;
use crate::datastore::schema::FieldSpecMapBuilder;
pub use crate::hash_types::Agent;
use crate::simulation::package::ext_traits::GetWorkerExpStartMsg;
use crate::{simulation::comms::package::PackageComms, SimRunConfig};

use super::{
    deps::Dependencies,
    ext_traits::{GetWorkerSimStartMsg, MaybeCPUBound},
    prelude::*,
};

pub mod packages;

#[async_trait]
pub trait Package: MaybeCPUBound + GetWorkerSimStartMsg + Send + Sync {
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

    fn get_dependencies(&self) -> Result<Dependencies> {
        Ok(Dependencies::empty())
    }

    fn add_state_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        _field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        Ok(())
    }
}
