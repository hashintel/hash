pub mod analysis;
pub mod json_state;

mod message;
mod name;
mod task;

use std::sync::Arc;

use async_trait::async_trait;
use stateful::{agent::Agent, context::Context, state::State};
use tracing::Span;

pub use self::{message::OutputTaskMessage, name::OutputPackageName, task::OutputTask};
use crate::{
    package::{
        output::{analysis::AnalysisOutput, json_state::JsonStateOutput},
        MaybeCpuBound, Package,
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
