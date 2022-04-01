pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
use memory::arrow::meta::ColumnDynamicMetadata;
use tracing::Span;

pub use self::packages::{ContextTask, ContextTaskMessage, Name, PACKAGE_CREATORS};
use crate::{
    config::{ExperimentConfig, Globals, SimRunConfig},
    datastore::{
        schema::{
            accessor::FieldSpecMapAccessor, context::ContextSchema, FieldKey, FieldSpec,
            RootFieldSpec, RootFieldSpecCreator,
        },
        table::{proxy::StateReadProxy, state::view::StateSnapshot},
        Result as DatastoreResult,
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
    ) -> Result<Vec<(FieldKey, Arc<dyn arrow::array::Array>)>>;

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

/// Encapsulates the functionality of writing a specific column within the context batch.
///
/// Wrapping the logic within this struct allows the caller (i.e. the root context package) to
/// split up memory into relevant buffers and then independently write to them in any order, even
/// if a context package's columns aren't next to one another in memory. (It's necessary to reorder
/// by the FieldKey to match the schema for the batch)
pub struct ContextColumn {
    pub(crate) field_key: FieldKey,
    inner: Box<dyn ContextColumnWriter + Send + Sync>,
    span: Span,
}

impl ContextColumn {
    pub fn get_dynamic_metadata(&self) -> DatastoreResult<ColumnDynamicMetadata> {
        self.inner.get_dynamic_metadata()
    }

    pub fn write(&self, buffer: &mut [u8], meta: &ColumnDynamicMetadata) -> DatastoreResult<()> {
        let _pkg_span = self.span.enter();
        let _write_span = tracing::trace_span!("column_write").entered();
        self.inner.write(buffer, meta)
    }
}

/// Provides the functionalities of writing a column into the context batch.
///
/// Implementing this trait allows the creation of trait-objects so that the root context package
/// can call the writing functionality in whatever order it needs, and therefore the other context
/// packages do not need to be aware of one another.
pub trait ContextColumnWriter {
    /// Gives the associated metadata for the column, describing the necessary memory layout and
    /// size.
    fn get_dynamic_metadata(&self) -> DatastoreResult<ColumnDynamicMetadata>;
    /// Takes a mutable slice of memory to write into, a description of the expectations about
    /// that memory and writes the data for the context column.
    ///
    /// The expectations (i.e. the metadata) of the memory has to match
    /// [`self.get_dynamic_metadata()`].
    fn write(&self, buffer: &mut [u8], meta: &ColumnDynamicMetadata) -> DatastoreResult<()>;
}
