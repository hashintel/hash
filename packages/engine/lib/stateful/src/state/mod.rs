// TODO: DOC

mod column;

pub use self::column::StateColumn;
use crate::agent::Agent;

// TODO: Move to `agent::AgentColumn`?
#[allow(clippy::module_name_repetitions)]
pub type SimulationState = Vec<Agent>;
