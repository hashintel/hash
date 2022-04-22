mod message;
mod name;
mod task;

use std::sync::Arc;

use arrow::array::Array;
use async_trait::async_trait;
use stateful::{
    context::{ContextColumn, ContextSchema},
    field::RootFieldKey,
    state::{StateReadProxy, StateSnapshot},
};
use tracing::Span;

pub use self::{message::ContextTaskMessage, name::ContextPackageName, task::ContextTask};
use crate::{
    package::{MaybeCpuBound, Package},
    Result,
};

#[async_trait]
pub trait ContextPackage: Package + MaybeCpuBound {
    async fn run<'s>(
        &mut self,
        state_proxy: StateReadProxy,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>>;
    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Arc<dyn Array>)>>;

    fn span(&self) -> Span;
}
