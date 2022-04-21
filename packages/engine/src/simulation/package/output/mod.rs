pub mod packages;

use std::sync::Arc;

use async_trait::async_trait;
pub use packages::{Name, PACKAGE_CREATORS};
use stateful::{
    context::Context,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::State,
};
use tracing::Span;

use self::packages::Output;
use crate::simulation::{
    comms::package::PackageComms,
    package::{
        ext_traits::{MaybeCpuBound, Package, PackageCreator},
        PackageCreatorConfig, PackageInitConfig,
    },
    Error, Result,
};

pub trait OutputPackageCreator: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn OutputPackage>>;

    fn persistence_config(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }

    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        _field_spec_map_builder: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}

#[async_trait]
pub trait OutputPackage: Package + MaybeCpuBound {
    async fn run(&mut self, state: Arc<State>, context: Arc<Context>) -> Result<Output>;

    fn span(&self) -> Span;
}
