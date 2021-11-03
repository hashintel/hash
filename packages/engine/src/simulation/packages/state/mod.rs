pub mod packages;

use std::sync::Arc;

use crate::{
    config::ExperimentConfig,
    datastore::{
        batch::change::ArrayChange, error::Result as DatastoreResult, schema::FieldSpecMapBuilder,
        table::state::ExState,
    },
    simulation::{comms::package::PackageComms, Error, Result},
    SimRunConfig,
};

pub use crate::config::Globals;

use super::{deps::Dependencies, ext_traits::GetWorkerStartMsg, prelude::*};

use crate::datastore::schema::accessor::FieldSpecMapAccessor;
use crate::proto::ExperimentRunBase;
pub use packages::{Name, StateTask, StateTaskMessage, StateTaskResult, PACKAGES};

#[async_trait]
pub trait Package: GetWorkerStartMsg + Send + Sync {
    async fn run(&mut self, state: &mut ExState, context: &Context) -> Result<()>;
}

pub trait PackageCreator: Sync {
    /// Create the package.
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>>;

    /// Get the package names that this package depends on.
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

pub struct StateColumn {
    inner: Box<dyn IntoArrowChange + Send + Sync>,
}

impl StateColumn {
    pub fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ArrayChange> {
        self.inner.get_arrow_change(range)
    }

    pub fn new(inner: Box<dyn IntoArrowChange + Send + Sync>) -> StateColumn {
        StateColumn { inner }
    }
}

pub trait IntoArrowChange {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ArrayChange>;
}
