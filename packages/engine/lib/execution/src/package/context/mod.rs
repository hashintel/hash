mod message;
mod name;
mod task;

use std::sync::Arc;

use arrow::array::Array;
use async_trait::async_trait;
use stateful::{
    context::{ContextColumn, ContextSchema},
    field::{FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::{StateReadProxy, StateSnapshot},
};
use tracing::Span;

pub use self::{message::ContextTaskMessage, name::ContextPackageName, task::ContextTask};
use crate::{
    package::{
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Result,
};

#[async_trait]
pub trait ContextPackage: Package + MaybeCpuBound {
    async fn run<'s>(
        &mut self,
        state_proxy: StateReadProxy,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>>;
    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Arc<dyn Array>)>>;

    fn span(&self) -> Span;
}

pub trait ContextPackageCreator<C>: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms<C>,
        state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>>;

    // TODO: Limit context packages to only add one field as long as we only allow one column from
    //   "get_empty_arrow_column"
    #[allow(unused_variables)]
    fn get_context_field_specs(
        &self,
        config: &PackageInitConfig,
        globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }

    #[allow(unused_variables)]
    fn get_state_field_specs(
        &self,
        config: &PackageInitConfig,
        globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
