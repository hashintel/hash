pub mod json;
pub mod script;

mod message;
mod name;
mod state;
mod task;

use async_trait::async_trait;
use stateful::agent::Agent;

pub use self::{
    message::InitTaskMessage,
    name::InitPackageName,
    state::{InitialState, InitialStateName},
    task::InitTask,
};
use crate::{
    package::{MaybeCpuBound, Package},
    Result,
};

#[async_trait]
pub trait InitPackage: Package + MaybeCpuBound {
    async fn run(&mut self) -> Result<Vec<Agent>>;
}
