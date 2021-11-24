pub mod packages;

use std::sync::Arc;

pub use crate::config::Globals;
use crate::datastore::schema::accessor::FieldSpecMapAccessor;
use crate::datastore::schema::FieldSpecMapBuilder;
use crate::proto::ExperimentRunBase;
use crate::simulation::comms::package::PackageComms;
use crate::simulation::package::ext_traits::GetWorkerExpStartMsg;
use crate::SimRunConfig;
pub use packages::{Name, OutputTask, OutputTaskMessage, PACKAGES};

use self::packages::Output;

use super::prelude::*;
use super::{
    deps::Dependencies,
    ext_traits::{GetWorkerSimStartMsg, MaybeCPUBound},
};

pub trait PackageCreator: GetWorkerExpStartMsg + Sync {
    /// Create the package.
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        system: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>>;

    fn get_dependencies(&self) -> Result<Dependencies> {
        Ok(Dependencies::empty())
    }

    fn persistence_config(
        &self,
        _config: &ExperimentConfig<ExperimentRunBase>,
        _globals: &Globals,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }

    fn add_state_field_specs(
        &self,
        _config: &ExperimentConfig<ExperimentRunBase>,
        _globals: &Globals,
        _field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
pub trait Package: MaybeCPUBound + GetWorkerSimStartMsg + Send + Sync {
    async fn run(&mut self, state: Arc<State>, context: Arc<Context>) -> Result<Output>;
}
