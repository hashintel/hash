use std::sync::Arc;

pub use packages::{InitTask, InitTaskMessage, InitTaskResult, Name, PACKAGES};

pub use crate::config::Globals;
use crate::datastore::schema::FieldSpecMapBuilder;
pub use crate::hash_types::Agent;
use crate::proto::ExperimentRunBase;
use crate::{simulation::comms::package::PackageComms, SimRunConfig};

use super::{
    deps::Dependencies,
    ext_traits::{GetWorkerStartMsg, MaybeCPUBound},
    prelude::*,
};

pub mod packages;

#[async_trait]
pub trait Package: MaybeCPUBound + GetWorkerStartMsg + Send + Sync {
    async fn run(&mut self) -> Result<Vec<Agent>>;
}

pub trait PackageCreator: Sync {
    /// Create the package.
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        system: PackageComms,
    ) -> Result<Box<dyn Package>>;

    fn get_dependencies(&self) -> Result<Dependencies> {
        Ok(Dependencies::empty())
    }

    fn add_state_field_specs(
        &self,
        config: &ExperimentConfig<ExperimentRunBase>,
        globals: &Globals,
        field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        Ok(())
    }
}
