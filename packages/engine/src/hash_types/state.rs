use serde::Serialize;
use stateful::agent::Agent;

use crate::{config::Globals, hash_types::message::Incoming};

#[allow(clippy::module_name_repetitions)]
pub type SimulationState = Vec<Agent>;
pub type DatasetMap = serde_json::Map<String, serde_json::Value>;

/// The context is global, consistent data about the simulation at a single point in time, which is
/// shared between all agents.
///
/// This struct is a specific Agent's view into the context. It contains information about the
/// general simulation, rather than data belonging to specific agents. This is effectively what the
/// agent 'can see', e.g. neighboring agents, incoming messages and globals. Due to it being a
/// description of the current environment surrounding the agent, it's immutable (unlike an agent's
/// specific state).
///
/// Language runners attempt to only give agents the context information they need to execute.
/// All values accessed through context are read-only, and if modified, will not directly change
/// the state of the simulation or any other agent.
#[derive(Serialize, Debug)]
pub struct Context<'a> {
    pub globals: &'a Globals,
    pub neighbors: Vec<&'a Agent>,
    pub messages: Vec<&'a Incoming>,
    pub datasets: &'a DatasetMap,
}
