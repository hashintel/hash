pub mod packages;

use execution::package::{
    context::ContextPackage, PackageCreator, PackageCreatorConfig, PackageInitConfig,
};
use stateful::{
    context::ContextSchema,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

pub use self::packages::PACKAGE_CREATORS;
use crate::simulation::{comms::package::PackageComms, Result};

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
    fn get_context_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        _field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }

    fn get_state_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        _field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
