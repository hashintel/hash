mod action;
mod batch;
mod command;
mod distribution;
mod migration;
mod plan;
mod planner;

use stateful::agent::{Agent, AgentId};

pub use self::{command::ProcessedCommands, plan::MigrationPlan, planner::CreateRemovePlanner};
use crate::command::create_remove::migration::IndexAction;

type AgentIndex = IndexAction;
type BatchIndex = usize;
type WorkerIndex = usize;

#[derive(Debug)]
pub struct CreateCommand {
    pub(super) agent: Agent,
}

#[derive(Debug)]
pub struct RemoveCommand {
    pub(super) agent_id: AgentId,
}

/// Collection of queued commands for the creation and deletion of agents.
#[derive(Debug, Default)]
pub struct CreateRemoveCommands {
    pub(super) create: Vec<CreateCommand>,
    pub(super) remove: Vec<RemoveCommand>,
}
