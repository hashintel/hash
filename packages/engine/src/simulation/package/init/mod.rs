//! TODO: DOC

pub mod packages;

use async_trait::async_trait;
use execution::package::PackageInitConfig;
pub use packages::{InitPackageName, PACKAGE_CREATORS};
use stateful::{
    agent::Agent,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

use crate::simulation::{
    comms::package::PackageComms,
    package::{
        ext_traits::{MaybeCpuBound, Package, PackageCreator},
        PackageCreatorConfig,
    },
    Result,
};

#[async_trait]
pub trait InitPackage: Package + MaybeCpuBound {
    async fn run(&mut self) -> Result<Vec<Agent>>;
}

pub trait InitPackageCreator: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>>;

    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        _field_spec_map_builder: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
