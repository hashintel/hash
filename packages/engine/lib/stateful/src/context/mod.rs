// TODO: DOC: Add module level docs for describing the high level concept of the context, what they
//   are and why they exist

use serde::Serialize;

use crate::{agent::Agent, dataset::DatasetMap, globals::Globals, message::Inbound};

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
    pub messages: Vec<&'a Inbound>,
    pub datasets: &'a DatasetMap,
}
