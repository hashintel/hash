mod action;
mod batch;
mod command;
mod distribution;
mod migration;
mod plan;
mod planner;

pub use self::{command::ProcessedCommands, plan::MigrationPlan, planner::CreateRemovePlanner};
use crate::datastore::table::create_remove::migration::IndexAction;

type AgentIndex = IndexAction;
type BatchIndex = usize;
type WorkerIndex = usize;
