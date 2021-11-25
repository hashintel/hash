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
    /// We can't derive a default as that returns Self which implies Sized which in turn means we
    /// can't create Trait Objects out of PackageCreator
    fn new() -> Box<dyn PackageCreator>
    where
        Self: Sized;

    /// A per-experiment initialization step that provide the creator with experiment config.
    /// This step is called when packages are loaded by the experiment controller.
    ///
    /// A default implementation is provided as most packages don't need to store the config and
    /// can get it from the simulation config when calling `create`.
    fn initialize_for_experiment(
        &mut self,
        _experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        Ok(())
    }

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

    fn persistence_config(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
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

#[async_trait]
pub trait Package: MaybeCPUBound + GetWorkerSimStartMsg + Send + Sync {
    async fn run(&mut self, state: Arc<State>, context: Arc<Context>) -> Result<Output>;
}
