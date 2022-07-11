//! State packages determine how the agent state changes.
//!
//! [`StatePackage`]s are able to modify the current [`State`] and has read access to the
//! [`Context`]. However, it's **not** possible to add new [`Agent`]s directly to the [`State`] as
//! the ordering of the [`State`] is important. To add or remove [`Agent`]s, use the
//! [`AgentMessages`] context package.
//!
//! For implementations please see the submodules of this module.
//!
//! [`State`]: stateful::state::State
//! [`Context`]: stateful::context::Context
//! [`Agent`]: stateful::agent::Agent
//! [`AgentMessages`]: crate::package::simulation::context::agent_messages::AgentMessages

pub mod behavior_execution;
pub mod topology;

mod creator;
mod message;
mod name;
mod task;

use async_trait::async_trait;
use stateful::{context::Context, field::FieldSpecMapAccessor, state::State};
use tracing::Span;

pub use self::{
    creator::StatePackageCreators, message::StateTaskMessage, name::StatePackageName,
    task::StateTask,
};
use crate::{
    package::simulation::{
        Package, PackageComms, PackageCreator, PackageCreatorConfig, PackageInitConfig,
    },
    Result,
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
}
