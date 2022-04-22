//! TODO: DOC

pub mod packages;

use execution::package::{
    init::InitPackage, PackageCreator, PackageCreatorConfig, PackageInitConfig,
};
pub use packages::PACKAGE_CREATORS;
use stateful::{
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

use crate::simulation::{
    comms::{package::PackageComms, Comms},
    Result,
};

pub trait InitPackageCreator: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms<Comms>,
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
