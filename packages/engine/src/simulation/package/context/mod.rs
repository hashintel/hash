use std::sync::Arc;

use crate::simulation::Result;
use crate::{
    datastore::{
        meta::ColumnDynamicMetadata,
        prelude::Result as DatastoreResult,
        schema::{FieldSpec, FieldSpecMapBuilder},
        table::state::view::StateSnapshot,
    },
    simulation::comms::package::PackageComms,
    SimRunConfig,
};

use super::{
    deps::Dependencies,
    ext_traits::{GetWorkerSimStartMsg, MaybeCPUBound},
    prelude::*,
};
pub use crate::config::Globals;
use crate::datastore::schema::accessor::FieldSpecMapAccessor;
use crate::datastore::schema::context::ContextSchema;
use crate::datastore::schema::FieldKey;
use crate::simulation::package::ext_traits::GetWorkerExpStartMsg;
pub use packages::{ContextTask, ContextTaskMessage, Name, PACKAGE_CREATORS};

pub mod packages;

#[async_trait]
pub trait Package: MaybeCPUBound + GetWorkerSimStartMsg + Send + Sync {
    async fn run<'s>(
        &mut self,
        state: Arc<State>,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<ContextColumn>;
    fn get_empty_arrow_column(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<(FieldKey, Arc<dyn arrow::array::Array>)>;
}

pub trait PackageCreator: GetWorkerExpStartMsg + Sync + Send {
    // TODO TODO
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

    fn get_dependencies(&self) -> Result<Dependencies> {
        Ok(Dependencies::empty())
    }

    // TODO - Limit context packages to only add one field as long as we only allow one column from "get_empty_arrow_column"
    fn add_context_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        _field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        Ok(())
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

pub struct ContextColumn {
    inner: Box<dyn ContextColumnWriter + Send + Sync>,
}

impl ContextColumn {
    pub fn get_dynamic_metadata(&self) -> DatastoreResult<ColumnDynamicMetadata> {
        self.inner.get_dynamic_metadata()
    }

    pub fn write(&self, buffer: &mut [u8], meta: &ColumnDynamicMetadata) -> DatastoreResult<()> {
        self.inner.write(buffer, meta)
    }
}

pub trait ContextColumnWriter {
    fn get_dynamic_metadata(&self) -> DatastoreResult<ColumnDynamicMetadata>;
    fn write(&self, buffer: &mut [u8], meta: &ColumnDynamicMetadata) -> DatastoreResult<()>;
}
