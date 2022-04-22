pub mod packages;

use execution::package::{
    state::StatePackage, PackageComms, PackageCreator, PackageCreatorConfig, PackageInitConfig,
};
pub use packages::PACKAGE_CREATORS;
use stateful::{
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

use crate::simulation::Result;

pub trait StatePackageCreator<C>: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        comms: PackageComms<C>,
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
