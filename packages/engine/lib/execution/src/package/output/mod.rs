//! Packages for feedback on the simulation runs State.
//!
//! [`OutputPackage`]s only have read access to the [`State`] and [`Context`] and are able to
//! return an [`Output`].
//!
//! For implementations please see the submodules of this module.
//!
//! [`State`]: stateful::state::State
//! [`Context`]: stateful::context::Context
//! [`Agent`]: stateful::agent::Agent
//! [`AgentMessages`]: crate::package::context::agent_messages::AgentMessages

pub mod analysis;
pub mod json_state;

mod message;
mod name;
mod task;

use std::sync::Arc;

use async_trait::async_trait;
use stateful::{
    context::Context,
    field::{FieldSpecMapAccessor, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::State,
};
use tracing::Span;

pub use self::{message::OutputTaskMessage, name::OutputPackageName, task::OutputTask};
use crate::{
    package::{
        output::{analysis::AnalysisOutput, json_state::JsonStateOutput},
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Result,
};

#[derive(Debug)]
pub enum Output {
    AnalysisOutput(AnalysisOutput),
    JsonStateOutput(JsonStateOutput),
}

#[async_trait]
pub trait OutputPackage: Package + MaybeCpuBound {
    async fn run(&mut self, state: Arc<State>, context: Arc<Context>) -> Result<Output>;

    fn span(&self) -> Span;
}

pub trait OutputPackageCreator<C>: PackageCreator {
    /// Create the package.
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        system: PackageComms<C>,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn OutputPackage>>;

    #[allow(unused_variables)]
    fn persistence_config(
        &self,
        config: &PackageInitConfig,
        globals: &Globals,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::Value::Null)
    }

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
