pub mod packages;

use execution::package::{
    output::OutputPackage, PackageCreator, PackageCreatorConfig, PackageInitConfig,
};
pub use packages::PACKAGE_CREATORS;
use stateful::{
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

use crate::simulation::{comms::package::PackageComms, Result};

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
