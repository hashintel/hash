pub mod packages;

use std::sync::Arc;

use crate::{simulation::comms::package::PackageComms, SimRunConfig};

use super::{
    deps::Dependencies,
    ext_traits::{GetWorkerStartMsg, MaybeCPUBound},
    prelude::*,
};

use crate::proto::ExperimentRunBase;
pub use packages::{InitTask, InitTaskMessage, InitTaskResult, Name, PACKAGES};

use crate::datastore::schema::FieldSpecMapBuilder;
pub use crate::hash_types::{Agent, Properties};

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
        globals: &Properties,
        field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        Ok(())
    }
}
