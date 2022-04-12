// TODO: DOC

mod column;
mod proxy;
mod view;

pub use self::{
    column::StateColumn,
    proxy::{StateReadProxy, StateWriteProxy},
    view::{StatePools, StateSnapshot},
};
use crate::agent::Agent;

// TODO: Move to `agent::AgentColumn`?
#[allow(clippy::module_name_repetitions)]
pub type SimulationState = Vec<Agent>;
