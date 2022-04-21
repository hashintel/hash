pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
use execution::package::PackageInitConfig;
pub use packages::{StatePackageName, PACKAGE_CREATORS};
use stateful::{
    context::Context,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::State,
};
use tracing::Span;

use crate::simulation::{
    comms::package::PackageComms,
    package::{
        ext_traits::{Package, PackageCreator},
        PackageCreatorConfig,
    },
    Error, Result,
};

#[async_trait]
pub trait StatePackage: Package {
    async fn run(&mut self, state: &mut State, context: &Context) -> Result<()>;

    fn span(&self) -> Span;
}

pub trait StatePackageCreator: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn StatePackage>>;

    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        _field_spec_map_builder: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
