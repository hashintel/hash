pub mod behavior_execution;

mod message;
mod name;
mod task;

use async_trait::async_trait;
use stateful::{agent::Agent, context::Context, state::State};
use tracing::Span;

pub use self::{message::StateTaskMessage, name::StatePackageName, task::StateTask};
use crate::{
    package::{MaybeCpuBound, Package},
    Result,
};

#[async_trait]
pub trait StatePackage: Package {
    async fn run(&mut self, state: &mut State, context: &Context) -> Result<()>;

    fn span(&self) -> Span;
}
