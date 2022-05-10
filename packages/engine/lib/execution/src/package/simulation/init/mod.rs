//! Creation of the engines initial state.
//!
//! [`InitPackage`]s are responsible to *create* the [`State`]. They get their data only when
//! creating the package or by messages, no [`State`] or [`Context`] is passed to a package.
//!
//! For implementations please see the submodules of this module.
//!
//! [`State`]: stateful::state::State
//! [`Context`]: stateful::context::Context

pub mod js_py;
pub mod json;

mod message;
mod name;
mod state;
mod task;

use async_trait::async_trait;
use stateful::{
    agent::Agent,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

pub use self::{
    message::InitTaskMessage,
    name::InitPackageName,
    state::{InitialState, InitialStateName},
    task::InitTask,
};
use crate::{
    package::simulation::{
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Result,
};

#[async_trait]
pub trait InitPackage: Package + MaybeCpuBound {
    async fn run(&mut self) -> Result<Vec<Agent>>;
}

pub trait InitPackageCreator<C>: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms<C>,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>>;

    #[allow(unused_variables)]
    fn get_state_field_specs(
        &self,
        config: &PackageInitConfig,
        globals: &Globals,
        field_spec_map_builder: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![])
    }
}
